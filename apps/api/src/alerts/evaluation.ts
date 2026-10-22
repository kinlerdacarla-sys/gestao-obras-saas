import { notificationChannels } from "../../../../packages/domain/src/notifications.js";
import { Inject, Injectable } from "@nestjs/common";
import { Decimal } from "decimal.js";
import { Database } from "../platform.js";
import { AnalyticsService } from "../analytics/analytics.service.js";
import type { ApiRequest } from "../auth/security.js";
import { recordAudit } from "../audit/audit.module.js";
import {
  executiveDefaults,
  executiveStatus,
} from "../../../../packages/domain/src/analytics.js";
import type {
  ExecutiveAlertType,
  ExecutiveAlertSeverity,
} from "../generated/prisma/client.js";
import { today } from "../schedule/schedule.service.js";
type Candidate = {
  alertType: ExecutiveAlertType;
  severity: ExecutiveAlertSeverity;
  entityType: string;
  entityId: string;
  title: string;
  message: string;
  deduplicationKey: string;
};
@Injectable()
export class AlertEvaluationService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(AnalyticsService) readonly analytics: AnalyticsService,
  ) {}
  async evaluate(r: ApiRequest, p: string) {
    const { scope } = await this.analytics.access.execution.check(r, p, true);
    const [data, configured] = await Promise.all([
      this.analytics.project(r, p, true),
      this.db.alertSetting.findUnique({ where: { tenantId: scope.tenantId } }),
    ]);
    const settings = {
      ...executiveDefaults,
      ...(configured
        ? {
            scheduleDelayThresholdPP: Number(
              configured.scheduleDelayThresholdPP,
            ),
            fundingLowThresholdPercentage: Number(
              configured.fundingLowThresholdPercentage,
            ),
            contractExpiryDays: configured.contractExpiryDays,
            missingDailyLogDays: configured.missingDailyLogDays,
          }
        : {}),
    };
    const candidates: Candidate[] = [];
    const add = (
      alertType: ExecutiveAlertType,
      severity: ExecutiveAlertSeverity,
      entityType: string,
      entityId: string,
      title: string,
      message: string,
    ) =>
      candidates.push({
        alertType,
        severity,
        entityType,
        entityId,
        title,
        message,
        deduplicationKey: `${alertType}:${entityId}`,
      });
    const risk = executiveStatus(
      {
        plannedProgress: data.schedule.plannedProgress ?? "0",
        actualProgress: data.schedule.actualProgress ?? "0",
        criticalNcr: 0,
        overdueNcr: 0,
        approvedBudget: data.financial?.approvedBudget ?? "0",
        forecastFinalCost: data.financial?.forecastFinalCost ?? "0",
        fundingApproved: data.financial?.fundingApproved ?? "0",
        fundingBalance: data.financial?.fundingBalance ?? "0",
      },
      settings,
    );
    for (const type of risk.reasons)
      add(
        type as ExecutiveAlertType,
        "HIGH",
        "Project",
        p,
        {
          SCHEDULE_DELAY: "Desvio de progresso físico",
          BUDGET_OVERRUN_RISK: "Custo conhecido excede orçamento",
          FUNDING_LOW: "Saldo de financiamento reduzido",
        }[type] ?? type,
        `Obra ${data.project.name}: consulte os indicadores para identificar a causa.`,
      );
    if (
      data.financial &&
      new Decimal(data.financial.approvedBudget).gt(0) &&
      new Decimal(data.financial.currentContracts).gt(
        data.financial.approvedBudget,
      )
    )
      add(
        "CONTRACT_OVER_BUDGET",
        "HIGH",
        "Project",
        p,
        "Contratos acima do orçamento",
        "O total contratado excede o orçamento aprovado.",
      );
    const date = new Date(today()),
      expiry = new Date(
        date.getTime() + settings.contractExpiryDays * 86400000,
      ),
      missing = new Date(
        date.getTime() - settings.missingDailyLogDays * 86400000,
      );
    const [ncr, contracts, measurements, inspections, lastLog] =
      await Promise.all([
        this.db.nonConformity.findMany({
          where: {
            ...scope,
            status: { notIn: ["CLOSED", "CANCELLED"] },
            OR: [{ severity: "CRITICAL" }, { dueDate: { lt: date } }],
          },
          select: { id: true, title: true, severity: true, dueDate: true },
        }),
        this.db.contract.findMany({
          where: {
            ...scope,
            status: "ACTIVE",
            endDate: { gte: date, lte: expiry },
          },
          select: { id: true, title: true },
        }),
        this.db.measurement.findMany({
          where: {
            ...scope,
            status: { in: ["SUBMITTED", "FISCAL_REVIEW", "APPROVAL_REVIEW"] },
          },
          select: { id: true, measurementNumber: true },
        }),
        this.db.inspectionRequest.findMany({
          where: { ...scope, status: { in: ["SUBMITTED", "SCHEDULED"] } },
          select: { id: true },
        }),
        this.db.dailyLog.findFirst({
          where: { ...scope, status: "APPROVED" },
          orderBy: { logDate: "desc" },
          select: { logDate: true },
        }),
      ]);
    // M5 has no contractual due date. The documented operational rule is 30 days after certification.
    const unpaid = await this.db.measurement.findMany({
      where: {
        ...scope,
        status: { in: ["CERTIFIED", "PARTIALLY_PAID"] },
        certifiedAt: { lt: new Date(date.getTime() - 30 * 86400000) },
      },
      select: { id: true, code: true, netCertifiedAmount: true },
    });
    const paymentTotals = await this.db.payment.groupBy({
      by: ["measurementId"],
      where: {
        ...scope,
        status: "POSTED",
        measurementId: { in: unpaid.map((x) => x.id) },
      },
      _sum: { amount: true },
    });
    for (const measurement of unpaid) {
      const paid = paymentTotals.find((x) => x.measurementId === measurement.id)
        ?._sum.amount;
      if (
        new Decimal(measurement.netCertifiedAmount.toString()).gt(
          paid?.toString() ?? "0",
        )
      )
        add(
          "PAYMENT_OVERDUE",
          "HIGH",
          "Measurement",
          measurement.id,
          "Pagamento pendente há mais de 30 dias",
          measurement.code,
        );
    }
    for (const x of ncr) {
      if (x.severity === "CRITICAL")
        add(
          "NCR_CRITICAL",
          "CRITICAL",
          "NonConformity",
          x.id,
          "NCR crítica",
          x.title,
        );
      if (x.dueDate && x.dueDate < date)
        add(
          "NCR_OVERDUE",
          "HIGH",
          "NonConformity",
          x.id,
          "NCR fora do prazo",
          x.title,
        );
    }
    for (const x of contracts)
      add(
        "CONTRACT_EXPIRING",
        "WARNING",
        "Contract",
        x.id,
        "Contrato a terminar",
        x.title,
      );
    for (const x of measurements)
      add(
        "MEASUREMENT_PENDING_APPROVAL",
        "INFO",
        "Measurement",
        x.id,
        "Medição pendente",
        String(x.measurementNumber),
      );
    for (const x of inspections)
      add(
        "INSPECTION_PENDING",
        "WARNING",
        "InspectionRequest",
        x.id,
        "Inspeção pendente",
        "Pedido aguarda conclusão da inspeção.",
      );
    if (
      data.project.status === "ACTIVE" &&
      (!lastLog || lastLog.logDate < missing)
    )
      add(
        "DAILY_LOG_MISSING",
        "WARNING",
        "Project",
        p,
        "Diário de obra em falta",
        `Sem diário aprovado nos últimos ${settings.missingDailyLogDays} dias.`,
      );
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM projects WHERE tenant_id=${scope.tenantId}::uuid AND id=${p}::uuid FOR UPDATE`;
        const previous = await tx.alert.findMany({
          where: {
            ...scope,
            status: { in: ["ACTIVE", "ACKNOWLEDGED", "DISMISSED"] },
          },
        });
        let created = 0,
          resolved = 0;
        for (const candidate of candidates) {
          if (
            previous.some(
              (x) => x.deduplicationKey === candidate.deduplicationKey,
            )
          )
            continue;
          const row = await tx.alert.create({
            data: { ...scope, ...candidate },
          });
          created++;
          await recordAudit(tx, r.auth, {
            action: "ALERT_CREATED",
            entityType: "Alert",
            entityId: row.id,
            projectId: p,
            newValues: row,
          });
          if (configured?.enableInApp !== false || configured?.enableEmail) {
            const members = await tx.projectUser.findMany({
              where: {
                ...scope,
                status: "ACTIVE",
                role: { in: ["ADMIN", "MANAGER", "INSPECTOR"] },
              },
              select: { userId: true, role: true },
            });
            const admins = await tx.tenantUser.findMany({
              where: {
                tenantId: scope.tenantId,
                status: "ACTIVE",
                role: "ADMIN",
              },
              select: { userId: true, role: true },
            });
            const ids = [
              ...new Set(
                [...members, ...admins]
                  .filter(
                    (x) =>
                      x.role !== "INSPECTOR" ||
                      [
                        "NCR_OVERDUE",
                        "NCR_CRITICAL",
                        "INSPECTION_PENDING",
                        "SCHEDULE_DELAY",
                        "DAILY_LOG_MISSING",
                      ].includes(candidate.alertType),
                  )
                  .map((x) => x.userId),
              ),
            ];
            const preferences = await tx.notificationPreference.findMany({
              where: { tenantId: scope.tenantId, userId: { in: ids } },
            });
            await tx.notification.createMany({
              data: ids.flatMap((userId) => {
                const channels = notificationChannels(
                  candidate.alertType,
                  preferences.find((x) => x.userId === userId) ?? null,
                );
                const visible =
                  channels.inApp && configured?.enableInApp !== false;
                return visible || (channels.email && configured?.enableEmail)
                  ? [
                      {
                        ...scope,
                        userId,
                        createdBy: r.auth.userId,
                        eventKey: `alert:${row.id}`,
                        type: candidate.alertType,
                        title: candidate.title,
                        message: candidate.message,
                        entityType: candidate.entityType,
                        entityId: candidate.entityId,
                        resourcePath: "/alerts",
                        inAppVisible: visible,
                      },
                    ]
                  : [];
              }),
              skipDuplicates: true,
            });
          }
        }
        const keys = new Set(candidates.map((x) => x.deduplicationKey));
        for (const before of previous) {
          if (keys.has(before.deduplicationKey)) continue;
          const after = await tx.alert.update({
            where: { id: before.id },
            data: {
              status: "RESOLVED",
              resolvedAt: new Date(),
              resolvedBy: r.auth.userId,
              version: { increment: 1 },
            },
          });
          resolved++;
          await recordAudit(tx, r.auth, {
            action: "ALERT_RESOLVED",
            entityType: "Alert",
            entityId: before.id,
            projectId: p,
            oldValues: before,
            newValues: after,
          });
        }
        return { created, resolved, evaluated: candidates.length };
      },
      { timeout: 30000 },
    );
  }
}
