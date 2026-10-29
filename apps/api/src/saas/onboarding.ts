import { encryptInvitation } from "./invitations.js";
import { Injectable, Inject } from "@nestjs/common";
import { z } from "zod";
import { Database, Cache, fail } from "../platform.js";
import { hashPassword, opaqueToken, tokenHash } from "../auth/crypto.js";
import { NotificationService } from "../notification/notification.module.js";
import { onboardingInput } from "../../../../packages/validation/src/saas.js";
import type { Request } from "express";
import { recordAudit } from "../audit/audit.module.js";
@Injectable()
export class OnboardingService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(Cache) readonly cache: Cache,
    @Inject(NotificationService) readonly mail: NotificationService,
  ) {}
  async provision(
    input: z.infer<typeof onboardingInput>,
    r: Request,
    platformUserId?: string,
  ) {
    this.mail.ensureAvailable();
    if (
      input.termsVersion !== (process.env.TERMS_VERSION ?? "draft") ||
      input.privacyVersion !== (process.env.PRIVACY_VERSION ?? "draft")
    )
      fail(
        400,
        "LEGAL_VERSION_CHANGED",
        "Atualize os documentos legais antes de continuar",
      );
    if (!platformUserId) {
      const n = (await this.cache.eval(
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],3600) end; return n",
        1,
        `onboarding:ip:${r.ip}`,
      )) as number;
      if (n > 5) fail(429, "RATE_LIMITED", "Limite de pedidos atingido");
    }
    const token = opaqueToken();
    const passwordHash = await hashPassword(opaqueToken());
    const result = await this.db.$transaction(async (tx) => {
      const plan = await tx.subscriptionPlan.findFirst({
        where: {
          id: input.planId,
          status: "ACTIVE",
          ...(platformUserId ? {} : { isPublic: true }),
        },
      });
      if (!plan || plan.trialDays < 1)
        fail(409, "TRIAL_UNAVAILABLE", "Contacte vendas para este plano");
      if (await tx.user.findUnique({ where: { email: input.admin.email } }))
        fail(
          409,
          "ONBOARDING_CONFLICT",
          "Contacte o suporte para associar uma conta existente",
        );
      const tenant = await tx.tenant.create({
        data: {
          name: input.company.tradeName || input.company.legalName,
          slug: input.company.slug,
        },
      });
      const user = await tx.user.create({
        data: { ...input.admin, passwordHash, status: "INVITED" },
      });
      await tx.tenantUser.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role: "ADMIN",
          status: "INVITED",
        },
      });
      const company = {
        legalName: input.company.legalName,
        tradeName: input.company.tradeName,
        taxNumber: input.company.taxNumber,
        phone: input.company.phone,
        email: input.company.email,
        address: input.company.address,
      };
      await tx.organization.create({
        data: {
          ...company,
          tenantId: tenant.id,
          organizationType: "CONTRACTOR",
        },
      });
      const now = new Date(),
        trialEnd = new Date(now.getTime() + plan.trialDays * 86400000);
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: "TRIALING",
          trialStart: now,
          trialEnd,
          currentPeriodStart: now,
          currentPeriodEnd: trialEnd,
          billingCycle: "MANUAL",
        },
      });
      await tx.tenantSetting.create({
        data: {
          tenantId: tenant.id,
          timezone: input.timezone,
          dateFormat: input.dateFormat,
        },
      });
      const reset = await tx.passwordReset.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          tokenHash: tokenHash(token),
          expiresAt: new Date(now.getTime() + 86400000),
        },
      });
      await tx.notificationPreference.create({
        data: { tenantId: tenant.id, userId: user.id },
      });
      await tx.invitationDelivery.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          resetId: reset.id,
          ciphertext: encryptInvitation(token),
          expiresAt: reset.expiresAt,
        },
      });
      // Acceptance is recorded by the invited administrator after verifying their email,
      // not falsely attributed to a platform operator provisioning on their behalf.
      await recordAudit(
        tx,
        { tenantId: tenant.id, userId: null },
        {
          action: "TENANT_PROVISIONED",
          entityType: "Tenant",
          entityId: tenant.id,
          newValues: { planId: plan.id, invitationRequired: true },
        },
        r,
      );
      await tx.platformAuditLog.create({
        data: {
          platformUserId,
          tenantId: tenant.id,
          action: "TENANT_CREATED",
          entityType: "Tenant",
          entityId: tenant.id,
          ipAddress: r.ip,
          newValues: {
            planId: plan.id,
            source: platformUserId ? "platform" : "self-service",
          },
        },
      });
      return { tenantId: tenant.id, slug: tenant.slug, trialEnd };
    });
    return { ...result, invitation: "QUEUED" };
  }
}
