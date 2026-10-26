import { httpMetrics } from "./observability.js";
import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  Post,
  Req,
  Res,
  UseGuards,
  Param,
  Query,
  Global,
} from "@nestjs/common";
import { z } from "zod";
import type { Response } from "express";
import { Database, fail } from "../platform.js";
import { Public } from "../auth/security.js";
import {
  PlatformAuthService,
  PlatformGuard,
  PlatformRoute,
  type PlatformRequest,
} from "./platform-auth.js";
import {
  EntitlementService,
  QuotaService,
  StorageUsageService,
} from "./entitlements.js";
import { SubscriptionService } from "./subscriptions.js";
import { ManualBillingProvider } from "./billing.js";
import {
  platformLoginInput,
  reasonInput,
  supportInput,
} from "../../../../packages/validation/src/saas.js";
import { configuration } from "../../../../packages/config/src/index.js";
import { RequestDoc } from "../docs.js";
import { ApiTags } from "@nestjs/swagger";
const dto = (v: unknown) =>
  JSON.parse(
    JSON.stringify(v, (_k, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
@ApiTags("Platform API")
@Public()
@Controller("api/v1/platform/auth")
class PlatformLoginController {
  constructor(
    @Inject(PlatformAuthService) readonly auth: PlatformAuthService,
  ) {}
  @Post("login")
  @RequestDoc(platformLoginInput)
  async login(
    @Body() body: unknown,
    @Req() r: PlatformRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = platformLoginInput.parse(body);
    const raw = await this.auth.login(input.email, input.password, r);
    res.cookie("platform_access", raw, {
      httpOnly: true,
      secure: configuration().NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/v1/platform",
      maxAge: 30 * 60000,
    });
    return { ok: true };
  }
}
@ApiTags("Platform API")
@PlatformRoute()
@UseGuards(PlatformGuard)
@Controller("api/v1/platform")
class PlatformController {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(PlatformAuthService) readonly auth: PlatformAuthService,
    @Inject(QuotaService) readonly quota: QuotaService,
  ) {}
  @Get("me") me(@Req() r: PlatformRequest) {
    return { role: r.platform.role, id: r.platform.id };
  }
  @Post("auth/logout") async logout(
    @Req() r: PlatformRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.db.$transaction(async (tx) => {
      await tx.platformSession.update({
        where: { id: r.platform.sessionId },
        data: { revokedAt: new Date() },
      });
      await tx.platformAuditLog.create({
        data: {
          platformUserId: r.platform.id,
          action: "PLATFORM_LOGOUT",
          entityType: "PlatformSession",
          entityId: r.platform.sessionId,
        },
      });
    });
    res.clearCookie("platform_access", { path: "/api/v1/platform" });
    return { ok: true };
  }
  @Get("metrics") metrics(@Req() r: PlatformRequest) {
    this.auth.superAdmin(r);
    return {
      ...httpMetrics,
      meanDurationMs: httpMetrics.requests
        ? httpMetrics.totalDurationMs / httpMetrics.requests
        : null,
      scope: "current-api-process",
    };
  }
  @Get("dashboard") async dashboard(@Req() r: PlatformRequest) {
    this.auth.superAdmin(r);
    const [tenants, subscriptions, users, projects, storage] =
      await Promise.all([
        this.db.tenant.groupBy({ by: ["status"], _count: true }),
        this.db.subscription.groupBy({ by: ["status"], _count: true }),
        this.db.user.count(),
        this.db.project.count(),
        this.db.document.aggregate({
          where: { deletedAt: null, confirmedAt: { not: null } },
          _sum: { sizeBytes: true },
        }),
      ]);
    return dto({
      tenants,
      subscriptions,
      users,
      projects,
      storageBytes: storage._sum.sizeBytes ?? 0n,
    });
  }
  @Get("tenants") async tenants(
    @Req() r: PlatformRequest,
    @Query() raw: unknown,
  ) {
    this.auth.superAdmin(r);
    const query = z
      .object({
        search: z.string().max(100).optional(),
        page: z.coerce.number().int().min(1).default(1),
        status: z
          .enum(["ACTIVE", "SUSPENDED", "CLOSED", "CANCELLED"])
          .optional(),
      })
      .parse(raw);
    const where = {
      status: query.status,
      ...(query.search
        ? { name: { contains: query.search, mode: "insensitive" as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.tenant.findMany({
        where,
        take: 25,
        skip: (query.page - 1) * 25,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
          _count: { select: { members: true, projects: true } },
        },
      }),
      this.db.tenant.count({ where }),
    ]);
    const subs = await this.db.subscription.findMany({
      where: { tenantId: { in: items.map((t) => t.id) } },
      select: { tenantId: true, planId: true, status: true, trialEnd: true },
    });
    return {
      items: items.map((t) => ({
        ...t,
        subscription: subs.find((s) => s.tenantId === t.id),
      })),
      total,
      page: query.page,
    };
  }
  @Get("tenants/:id") async tenant(
    @Req() r: PlatformRequest,
    @Param("id") raw: string,
  ) {
    this.auth.superAdmin(r);
    const id = z.uuid().parse(raw);
    const tenant = await this.db.tenant.findUniqueOrThrow({ where: { id } });
    return dto({
      tenant,
      usage: await this.quota.getUsage(id),
      subscription: await this.db.subscription.findUnique({
        where: { tenantId: id },
      }),
      audit: await this.db.platformAuditLog.findMany({
        where: { tenantId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    });
  }
  async status(
    r: PlatformRequest,
    id: string,
    body: unknown,
    status: "SUSPENDED" | "ACTIVE" | "CLOSED",
  ) {
    this.auth.superAdmin(r, true);
    const { reason } = reasonInput.parse(body);
    return this.db.$transaction(async (tx) => {
      await this.quota.lock(tx, id);
      const before = await tx.tenant.findUniqueOrThrow({ where: { id } });
      if (before.status === "CLOSED" || before.status === status)
        fail(409, "INVALID_TENANT_TRANSITION", "Transição indisponível");
      const result = await tx.tenant.update({
        where: { id },
        data: { status },
      });
      await tx.tenantStatusEvent.create({
        data: {
          tenantId: id,
          fromStatus: before.status,
          toStatus: status,
          reason,
          changedBy: r.platform.id,
        },
      });
      await tx.platformAuditLog.create({
        data: {
          platformUserId: r.platform.id,
          tenantId: id,
          action:
            status === "ACTIVE"
              ? "TENANT_REACTIVATED"
              : status === "CLOSED"
                ? "TENANT_CLOSED"
                : "TENANT_SUSPENDED",
          entityType: "Tenant",
          entityId: id,
          oldValues: { status: before.status },
          newValues: { status, reason },
          ipAddress: r.ip,
        },
      });
      if (status === "CLOSED")
        await tx.tenantSetting.upsert({
          where: { tenantId: id },
          create: { tenantId: id, closedAt: new Date() },
          update: { closedAt: new Date() },
        });
      return result;
    });
  }
  @Post("tenants/:id/suspend") suspend(
    @Req() r: PlatformRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.status(r, z.uuid().parse(id), b, "SUSPENDED");
  }
  @Post("tenants/:id/reactivate") reactivate(
    @Req() r: PlatformRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.status(r, z.uuid().parse(id), b, "ACTIVE");
  }
  @Post("tenants/:id/close") close(
    @Req() r: PlatformRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.status(r, z.uuid().parse(id), b, "CLOSED");
  }
  @Get("plans") async plans(@Req() r: PlatformRequest) {
    this.auth.superAdmin(r);
    return this.db.subscriptionPlan.findMany({
      include: { limits: true, features: { include: { feature: true } } },
    });
  }
  @Get("audit") async audit(@Req() r: PlatformRequest) {
    this.auth.superAdmin(r);
    return this.db.platformAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
  @Post("support-sessions")
  @RequestDoc(supportInput)
  async support(@Req() r: PlatformRequest, @Body() body: unknown) {
    this.auth.superAdmin(r, true);
    const input = supportInput.parse(body);
    const assignee = await this.db.platformUser.findUnique({
      where: { id: input.platformUserId },
    });
    if (assignee?.status !== "ACTIVE")
      fail(404, "RESOURCE_NOT_FOUND", "Operador indisponível");
    return this.db.$transaction(async (tx) => {
      const session = await tx.supportSession.create({
        data: {
          ...input,
          authorizedBy: r.platform.id,
          expiresAt: new Date(Date.now() + 15 * 60000),
        },
      });
      await tx.platformAuditLog.create({
        data: {
          platformUserId: r.platform.id,
          tenantId: input.tenantId,
          action: "SUPPORT_SESSION_STARTED",
          entityType: "SupportSession",
          entityId: session.id,
          newValues: {
            reason: input.reason,
            assignee: input.platformUserId,
            expiresAt: session.expiresAt.toISOString(),
          },
        },
      });
      return session;
    });
  }
  @Get("support-sessions/:id") async supportView(
    @Req() r: PlatformRequest,
    @Param("id") raw: string,
  ) {
    const session = await this.db.supportSession.findFirst({
      where: {
        id: z.uuid().parse(raw),
        platformUserId: r.platform.id,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
    });
    if (!session)
      fail(403, "SUPPORT_SESSION_REQUIRED", "Sessão autorizada necessária");
    const tenant = await this.db.tenant.findUniqueOrThrow({
      where: { id: session.tenantId },
      select: { id: true, name: true, status: true },
    });
    // Support is a separate, read-only diagnostic surface; never impersonates a tenant user.
    return dto({
      banner: `Modo de Suporte — Tenant ${tenant.name}`,
      session,
      tenant,
      usage: await this.quota.getUsage(tenant.id),
    });
  }
  @Post("support-sessions/:id/end") async supportEnd(
    @Req() r: PlatformRequest,
    @Param("id") raw: string,
  ) {
    const id = z.uuid().parse(raw);
    return this.db.$transaction(async (tx) => {
      const session = await tx.supportSession.findFirst({
        where: {
          id,
          ...(r.platform.role === "SUPER_ADMIN"
            ? {}
            : { platformUserId: r.platform.id }),
          status: "ACTIVE",
        },
      });
      if (!session) fail(404, "RESOURCE_NOT_FOUND", "Sessão não encontrada");
      const result = await tx.supportSession.updateMany({
        where: { id, status: "ACTIVE" },
        data: { status: "TERMINATED", endedAt: new Date() },
      });
      if (result.count !== 1)
        fail(409, "VERSION_CONFLICT", "Sessão já terminada");
      await tx.platformAuditLog.create({
        data: {
          platformUserId: r.platform.id,
          tenantId: session.tenantId,
          action: "SUPPORT_SESSION_ENDED",
          entityType: "SupportSession",
          entityId: id,
        },
      });
      return { ok: true };
    });
  }
}
@Global()
@Module({
  controllers: [PlatformLoginController, PlatformController],
  providers: [
    EntitlementService,
    StorageUsageService,
    QuotaService,
    SubscriptionService,
    ManualBillingProvider,
    PlatformAuthService,
    PlatformGuard,
  ],
  exports: [
    EntitlementService,
    StorageUsageService,
    QuotaService,
    SubscriptionService,
    ManualBillingProvider,
    PlatformAuthService,
  ],
})
export class SaasModule {}
