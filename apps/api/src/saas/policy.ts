import { Inject, Injectable } from "@nestjs/common";
import { Cache, Database, fail } from "../platform.js";
import type { ApiRequest } from "../auth/security.js";
import type { Prisma } from "../generated/prisma/client.js";
import { EntitlementService } from "./entitlements.js";
import { effectiveSubscriptionStatus } from "../../../../packages/domain/src/saas.js";
@Injectable()
export class CommercialPolicy {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(Cache) readonly cache: Cache,
    @Inject(EntitlementService) readonly entitlements: EntitlementService,
  ) {}
  async assertMutation(
    tenantId: string,
    tx: Prisma.TransactionClient = this.db,
  ) {
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });
    const subscription = await tx.subscription.findUnique({
      where: { tenantId },
    });
    if (!subscription)
      fail(
        403,
        "SUBSCRIPTION_REQUIRED",
        "Subscrição não configurada; contacte o suporte",
      );
    const status = effectiveSubscriptionStatus(subscription);
    if (tenant.status !== "ACTIVE" || status === "SUSPENDED")
      fail(
        403,
        "SUBSCRIPTION_SUSPENDED",
        "Empresa suspensa: apenas leitura e gestão da subscrição disponíveis",
      );
    if (!["ACTIVE", "TRIALING"].includes(status))
      fail(403, "SUBSCRIPTION_READ_ONLY", "Subscrição em modo de leitura");
  }
  async request(r: ApiRequest) {
    const route = r.path.replace(/\/+$/, "");
    const management =
      /^\/api\/v1\/(auth|entitlements|subscription|subscriptions|billing|usage|data-exports|onboarding-checklist|legal-acceptances)(\/|$)/.test(
        route,
      ) ||
      /^\/api\/v1\/reports\/[a-f0-9-]{36}\/download$/.test(route) ||
      /^\/api\/v1\/settings\/(usage|subscription)(\/|$)/.test(route);
    if (!management && !["GET", "HEAD", "OPTIONS"].includes(r.method))
      await this.assertMutation(r.auth.tenantId);
    if (management) return;
    // These routes are shared across modules: authorization remains in the domain services.
    if (r.auth.role === "CLIENT")
      await this.entitlements.assertFeature(r.auth.tenantId, "CLIENT_PORTAL");
    if (r.auth.role === "FINANCIER")
      await this.entitlements.assertFeature(
        r.auth.tenantId,
        "FINANCIER_PORTAL",
      );
    if (/\/analytics\/projects\/compare$|\/dashboard\/portfolio$/.test(route))
      await this.entitlements.assertFeature(
        r.auth.tenantId,
        "PORTFOLIO_ANALYTICS",
      );
    if (
      /\/(inspections|inspection-requests|non-conformities|corrective-actions|quality|checklist-templates|checklist-template-versions|create-non-conformity)(\/|$)/.test(
        route,
      )
    )
      await this.entitlements.assertFeature(
        r.auth.tenantId,
        "ADVANCED_QUALITY",
      );
    if (/\/(api-keys|public-api)(\/|$)/.test(route))
      await this.entitlements.assertFeature(r.auth.tenantId, "API_ACCESS");
    if (/\/branding(\/|$)/.test(route))
      await this.entitlements.assertFeature(r.auth.tenantId, "CUSTOM_BRANDING");
    if (!["GET", "HEAD", "OPTIONS"].includes(r.method)) {
      const expensive = /reports|data-exports|upload/.test(route);
      for (const key of [
        `tenant:${r.auth.tenantId}`,
        `user:${r.auth.tenantId}:${r.auth.userId}`,
      ]) {
        const count = (await this.cache.eval(
          "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n",
          1,
          `saas:rate:${expensive ? "artifact" : "write"}:${key}`,
        )) as number;
        if (count > (expensive ? 120 : 1200))
          fail(429, "RATE_LIMITED", "Limite temporário de pedidos atingido");
      }
    }
  }
}
