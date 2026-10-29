import { Body, Controller, Get, Inject, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { Database } from "../platform.js";
import { Public, TenantRoles, type ApiRequest } from "../auth/security.js";
import { RequestDoc } from "../docs.js";
import { OnboardingService } from "./onboarding.js";
import { SubscriptionService } from "./subscriptions.js";
import { EntitlementService, QuotaService } from "./entitlements.js";
import {
  onboardingInput,
  changePlanInput,
  cancellationInput,
} from "../../../../packages/validation/src/saas.js";
const serialize = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
  );
@ApiTags("SaaS onboarding")
@Controller("api/v1")
export class SignupController {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(OnboardingService) readonly onboarding: OnboardingService,
  ) {}
  @Public() @Get("plans") plans() {
    return this.db.subscriptionPlan.findMany({
      where: { status: "ACTIVE", isPublic: true },
      include: { limits: true, features: { include: { feature: true } } },
      orderBy: { monthlyPrice: "asc" },
    });
  }
  @Public() @Get("onboarding/config") config() {
    return {
      termsVersion: process.env.TERMS_VERSION ?? "draft",
      privacyVersion: process.env.PRIVACY_VERSION ?? "draft",
      termsUrl: process.env.TERMS_URL ?? null,
      privacyUrl: process.env.PRIVACY_URL ?? null,
      salesEmail: process.env.SALES_EMAIL ?? null,
      operationalCurrency: "MZN",
    };
  }
  @Public()
  @Post("onboarding")
  @RequestDoc(onboardingInput)
  signup(@Req() r: ApiRequest, @Body() body: unknown) {
    return this.onboarding.provision(onboardingInput.parse(body), r);
  }
}
@ApiTags("Tenant SaaS API")
@Controller("api/v1")
export class TenantSaasController {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(SubscriptionService) readonly subscriptions: SubscriptionService,
    @Inject(EntitlementService) readonly entitlements: EntitlementService,
    @Inject(QuotaService) readonly quota: QuotaService,
  ) {}
  @Get("entitlements") async features(@Req() r: ApiRequest) {
    const e = await this.entitlements.getTenantEntitlements(r.auth.tenantId);
    return { features: e.features, plan: e.plan.name };
  }
  @TenantRoles("ADMIN")
  @Get(["subscription", "settings/subscription"])
  subscription(@Req() r: ApiRequest) {
    return this.subscriptions.get(r.auth.tenantId);
  }
  @TenantRoles("ADMIN")
  @Post(["subscription/change-plan", "subscriptions/change-plan"])
  @RequestDoc(changePlanInput)
  change(@Req() r: ApiRequest, @Body() body: unknown) {
    return this.subscriptions.change(r, changePlanInput.parse(body));
  }
  @TenantRoles("ADMIN")
  @Post(["subscription/cancel", "subscriptions/cancel"])
  @RequestDoc(cancellationInput)
  cancel(@Req() r: ApiRequest, @Body() body: unknown) {
    return this.subscriptions.cancel(r, cancellationInput.parse(body));
  }
  @TenantRoles("ADMIN") @Get(["usage", "settings/usage"]) async usage(
    @Req() r: ApiRequest,
  ) {
    const usage = await this.quota.getUsage(r.auth.tenantId),
      e = await this.entitlements.getTenantEntitlements(r.auth.tenantId);
    const confirmed = await this.db.document.aggregate({
      where: {
        tenantId: r.auth.tenantId,
        deletedAt: null,
        confirmedAt: { not: null },
      },
      _sum: { sizeBytes: true },
    });
    return serialize({
      usage,
      limits: e.plan.limits,
      confirmedDocumentBytes: confirmed._sum.sizeBytes ?? 0n,
    });
  }
  @TenantRoles("ADMIN") @Get("billing/invoices") invoices(
    @Req() r: ApiRequest,
  ) {
    return this.db.billingInvoice.findMany({
      where: { tenantId: r.auth.tenantId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        invoiceNumber: true,
        periodStart: true,
        periodEnd: true,
        createdAt: true,
        dueDate: true,
        totalAmount: true,
        currency: true,
        status: true,
        paidAt: true,
      },
    });
  }
  @TenantRoles("ADMIN") @Get("onboarding-checklist") async checklist(
    @Req() r: ApiRequest,
  ) {
    const tenantId = r.auth.tenantId;
    const [organizations, users, projects, budgets, tasks] = await Promise.all([
      this.db.organization.count({ where: { tenantId, email: { not: null } } }),
      this.db.tenantUser.count({
        where: { tenantId, status: { not: "DISABLED" } },
      }),
      this.db.project.count({ where: { tenantId } }),
      this.db.budget.count({ where: { tenantId } }),
      this.db.scheduleTask.count({ where: { tenantId } }),
    ]);
    const items = [
      {
        title: "Completar empresa",
        href: "/settings/organizations",
        done: organizations > 0,
      },
      { title: "Convidar equipa", href: "/settings/users", done: users > 1 },
      { title: "Criar primeira obra", href: "/projects", done: projects > 0 },
      { title: "Importar orçamento", href: "/projects", done: budgets > 0 },
      { title: "Criar cronograma", href: "/projects", done: tasks > 0 },
    ];
    return {
      items,
      completed: items.filter((i) => i.done).length,
      total: items.length,
    };
  }
  @Get("legal-acceptances") async legal(@Req() r: ApiRequest) {
    const termsVersion = process.env.TERMS_VERSION ?? "draft",
      privacyVersion = process.env.PRIVACY_VERSION ?? "draft";
    const count = await this.db.userLegalAcceptance.count({
      where: {
        tenantId: r.auth.tenantId,
        userId: r.auth.userId,
        OR: [
          { documentType: "TERMS", version: termsVersion },
          { documentType: "PRIVACY", version: privacyVersion },
        ],
      },
    });
    return {
      termsVersion,
      privacyVersion,
      termsUrl: process.env.TERMS_URL ?? null,
      privacyUrl: process.env.PRIVACY_URL ?? null,
      accepted: count === 2,
    };
  }
  @Post("legal-acceptances") async accept(
    @Req() r: ApiRequest,
    @Body() body: unknown,
  ) {
    const input = z
      .object({
        termsVersion: z.literal(process.env.TERMS_VERSION ?? "draft"),
        privacyVersion: z.literal(process.env.PRIVACY_VERSION ?? "draft"),
      })
      .parse(body);
    return this.db.$transaction(async (tx) => {
      for (const [documentType, version] of [
        ["TERMS", input.termsVersion],
        ["PRIVACY", input.privacyVersion],
      ])
        await tx.userLegalAcceptance.upsert({
          where: {
            userId_tenantId_documentType_version: {
              userId: r.auth.userId,
              tenantId: r.auth.tenantId,
              documentType,
              version,
            },
          },
          create: {
            userId: r.auth.userId,
            tenantId: r.auth.tenantId,
            documentType,
            version,
            ipAddress: r.ip,
          },
          update: {},
        });
      return { ok: true };
    });
  }
}
