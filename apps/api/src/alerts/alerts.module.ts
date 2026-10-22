import type { ExecutiveAlertType } from "../generated/prisma/client.js";
import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Database, fail } from "../platform.js";
import type { ApiRequest } from "../auth/security.js";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { AnalyticsAccess } from "../analytics/kpis.js";
import { AlertEvaluationService } from "./evaluation.js";
import {
  alertAction,
  alertQuery,
  alertSettingsInput,
} from "../../../../packages/validation/src/intelligence.js";
import { uuid } from "../../../../packages/validation/src/index.js";
import { recordAudit } from "../audit/audit.module.js";
import { RequestDoc } from "../docs.js";
@ApiTags("Alerts")
@Controller("api/v1")
class AlertController {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(AnalyticsAccess) readonly access: AnalyticsAccess,
    @Inject(AlertEvaluationService) readonly evaluation: AlertEvaluationService,
  ) {}
  async scope(r: ApiRequest) {
    if (r.auth.role === "ADMIN") return { tenantId: r.auth.tenantId };
    const assignments = await this.db.projectUser.findMany({
      where: {
        tenantId: r.auth.tenantId,
        userId: r.auth.userId,
        status: "ACTIVE",
      },
      select: { projectId: true, role: true },
    });
    return {
      tenantId: r.auth.tenantId,
      OR: assignments.map((x) => ({
        projectId: x.projectId,
        ...(x.role === "INSPECTOR"
          ? {
              alertType: {
                in: [
                  "NCR_OVERDUE",
                  "NCR_CRITICAL",
                  "INSPECTION_PENDING",
                  "SCHEDULE_DELAY",
                  "DAILY_LOG_MISSING",
                ] as ExecutiveAlertType[],
              },
            }
          : x.role === "CLIENT"
            ? {
                alertType: {
                  in: [
                    "SCHEDULE_DELAY",
                    "NCR_CRITICAL",
                    "CONTRACT_EXPIRING",
                  ] as ExecutiveAlertType[],
                },
              }
            : {}),
      })),
    };
  }
  @Get("alerts") async list(@Req() r: ApiRequest, @Query() raw: unknown) {
    const q = alertQuery.parse(raw);
    const where = {
      ...(await this.scope(r)),
      ...(q.project ? { projectId: q.project } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    const [items, total, assignments] = await Promise.all([
      this.db.alert.findMany({
        where,
        orderBy: { detectedAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.alert.count({ where }),
      this.db.projectUser.findMany({
        where: {
          tenantId: r.auth.tenantId,
          userId: r.auth.userId,
          status: "ACTIVE",
          role: { in: ["MANAGER", "INSPECTOR"] },
        },
        select: { projectId: true },
      }),
    ]);
    const editable = new Set(assignments.map((x) => x.projectId));
    return {
      items: items.map((x) => ({
        ...x,
        canManage:
          r.auth.role === "ADMIN" ||
          (!!x.projectId && editable.has(x.projectId)),
      })),
      total,
      page: q.page,
      limit: q.limit,
    };
  }

  @Patch("alerts/:id") @RequestDoc(alertAction) async action(
    @Req() r: ApiRequest,
    @Param("id") raw: string,
    @Body() body: unknown,
  ) {
    const id = uuid.parse(raw),
      input = alertAction.parse(body),
      where = await this.scope(r);
    const before = await this.db.alert.findFirst({ where: { ...where, id } });
    if (!before) fail(404, "RESOURCE_NOT_FOUND", "Alerta não encontrado");
    if (!before.projectId) this.access.execution.admin(r);
    else {
      const a = await this.access.execution.check(r, before.projectId);
      if (!["ADMIN", "MANAGER", "INSPECTOR"].includes(a.role))
        fail(403, "ACCESS_DENIED", "Sem permissão para tratar alertas");
    }
    return this.db.$transaction(async (tx) => {
      const updated = await tx.alert.updateMany({
        where: {
          id,
          tenantId: r.auth.tenantId,
          version: input.version,
          status: { in: ["ACTIVE", "ACKNOWLEDGED"] },
        },
        data: {
          status: input.status,
          version: { increment: 1 },
          ...(input.status === "RESOLVED"
            ? { resolvedAt: new Date(), resolvedBy: r.auth.userId }
            : {}),
        },
      });
      if (!updated.count)
        fail(
          409,
          "VERSION_CONFLICT",
          "O alerta foi alterado ou já está encerrado",
        );
      const after = await tx.alert.findUniqueOrThrow({ where: { id } });
      await recordAudit(
        tx,
        r.auth,
        {
          action: `ALERT_${input.status}`,
          entityType: "Alert",
          entityId: id,
          projectId: before.projectId ?? undefined,
          oldValues: before,
          newValues: after,
        },
        r,
      );
      return after;
    });
  }
  @Post("projects/:projectId/alerts/evaluate") evaluate(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
  ) {
    return this.evaluation.evaluate(r, uuid.parse(p));
  }
  @Get("alert-settings") async settings(@Req() r: ApiRequest) {
    this.access.execution.admin(r);
    return this.db.alertSetting.upsert({
      where: { tenantId: r.auth.tenantId },
      create: { tenantId: r.auth.tenantId },
      update: {},
    });
  }
  @Patch("alert-settings") @RequestDoc(alertSettingsInput) async saveSettings(
    @Req() r: ApiRequest,
    @Body() body: unknown,
  ) {
    this.access.execution.admin(r);
    const input = alertSettingsInput.parse(body);
    return this.db.$transaction(async (tx) => {
      const before = await tx.alertSetting.findUnique({
        where: { tenantId: r.auth.tenantId },
      });
      const after = await tx.alertSetting.upsert({
        where: { tenantId: r.auth.tenantId },
        create: { tenantId: r.auth.tenantId, ...input },
        update: input,
      });
      await recordAudit(
        tx,
        r.auth,
        {
          action: "ALERT_SETTINGS_UPDATED",
          entityType: "AlertSetting",
          oldValues: before,
          newValues: after,
        },
        r,
      );
      return after;
    });
  }
}
@Module({
  imports: [AnalyticsModule],
  providers: [AlertEvaluationService],
  controllers: [AlertController],
  exports: [AlertEvaluationService],
})
export class AlertModule {}
