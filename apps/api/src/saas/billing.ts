import { Inject, Injectable } from "@nestjs/common";
import { Decimal } from "decimal.js";
import { randomUUID } from "node:crypto";
import { Database, fail } from "../platform.js";
import type {
  BillingInvoice,
  BillingCycle,
} from "../generated/prisma/client.js";
export interface BillingProvider {
  readonly code: string;
  readonly onlinePayments: boolean;
  createCustomer(tenantId: string): Promise<{ id: string }>;
  createSubscription(subscriptionId: string): Promise<{ id: string }>;
  changeSubscription(
    subscriptionId: string,
    cycle: BillingCycle,
  ): Promise<{ id: string }>;
  cancelSubscription(subscriptionId: string): Promise<{ id: string }>;
  createCheckoutSession(): Promise<never>;
  handleWebhook(): Promise<never>;
  getInvoice(tenantId: string, id: string): Promise<BillingInvoice>;
}
@Injectable()
export class ManualBillingProvider implements BillingProvider {
  readonly code = "MANUAL_BILLING";
  readonly onlinePayments = false;
  constructor(@Inject(Database) readonly db: Database) {}
  async createCustomer(tenantId: string) {
    await this.db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    return { id: `manual:${tenantId}` };
  }
  async createSubscription(subscriptionId: string) {
    await this.db.subscription.findUniqueOrThrow({
      where: { id: subscriptionId },
    });
    return { id: `manual:${subscriptionId}` };
  }
  async changeSubscription(subscriptionId: string, _cycle: BillingCycle) {
    return this.createSubscription(subscriptionId);
  }
  async cancelSubscription(subscriptionId: string) {
    return this.createSubscription(subscriptionId);
  }
  async createCheckoutSession(): Promise<never> {
    return fail(
      409,
      "ONLINE_PAYMENT_UNAVAILABLE",
      "Faturação manual: contacte o operador",
    );
  }
  async handleWebhook(): Promise<never> {
    return fail(
      404,
      "WEBHOOK_UNAVAILABLE",
      "Provider manual não recebe webhooks",
    );
  }
  async getInvoice(tenantId: string, id: string) {
    return (
      (await this.db.billingInvoice.findFirst({ where: { tenantId, id } })) ??
      fail(404, "RESOURCE_NOT_FOUND", "Invoice não encontrada")
    );
  }
  async draft(
    tenantId: string,
    idempotencyKey: string,
    subtotal: string,
    tax: string,
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId}::uuid FOR UPDATE`;
      const prior = await tx.billingInvoice.findUnique({
        where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      });
      if (prior) return prior;
      const subscription = await tx.subscription.findUniqueOrThrow({
        where: { tenantId },
      });
      const plan = await tx.subscriptionPlan.findUniqueOrThrow({
        where: { id: subscription.planId },
      });
      const base = new Decimal(subtotal),
        taxes = new Decimal(tax);
      if (
        base.isNegative() ||
        taxes.isNegative() ||
        base.decimalPlaces() > 2 ||
        taxes.decimalPlaces() > 2
      )
        fail(400, "INVALID_AMOUNT", "Valor inválido");
      return tx.billingInvoice.create({
        data: {
          tenantId,
          subscriptionId: subscription.id,
          invoiceNumber: `DRAFT-${randomUUID()}`,
          idempotencyKey,
          periodStart: subscription.currentPeriodStart,
          periodEnd: subscription.currentPeriodEnd,
          subtotal: base.toFixed(2),
          taxAmount: taxes.toFixed(2),
          totalAmount: base.plus(taxes).toFixed(2),
          currency: plan.currency,
        },
      });
    });
  }
}
