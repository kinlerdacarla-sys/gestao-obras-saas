import { Inject, Injectable } from "@nestjs/common";
import { Decimal } from "decimal.js";
import { Database } from "../platform.js";
import { ExecutionAccess, type Scope } from "../schedule/access.js";
import { compute, today } from "../schedule/schedule.service.js";
import { FinancialService } from "../financial/financial.service.js";
import { QualityService } from "../quality/quality.service.js";
import type { ApiRequest } from "../auth/security.js";
import { query } from "../../../../packages/validation/src/quality.js";
import {
  financialIndicators,
  forecastSchedule,
} from "../../../../packages/domain/src/analytics.js";
const money = (value: unknown) => new Decimal(String(value ?? 0)).toFixed(2);
const contractStatuses = [
  "ACTIVE",
  "SUSPENDED",
  "COMPLETED",
  "TERMINATED",
] as const;
@Injectable()
export class ScheduleKpiService {
  constructor(@Inject(Database) readonly db: Database) {}
  async calculate(scope: Scope) {
    const schedule = await this.db.schedule.findFirst({
      where: { ...scope, status: { not: "ARCHIVED" } },
    });
    if (!schedule)
      return {
        available: false,
        plannedProgress: null,
        actualProgress: null,
        progressVariance: null,
        delayedTasks: 0,
        atRiskTasks: 0,
        completedTasks: 0,
        totalTasks: 0,
        plannedEnd: null,
        forecastEnd: null,
        scheduleVarianceDays: null,
        forecastConfidence: "LOW",
      };
    const current = await compute(this.db, scope);
    const tasks = current.items.filter((x) => x.taskType !== "SUMMARY");
    const observations = await this.db.projectProgressSnapshot.count({
      where: scope,
    });
    return {
      available: true,
      plannedProgress: current.plannedProgress,
      actualProgress: current.actualProgress,
      progressVariance: current.deviation,
      delayedTasks: tasks.filter((x) => x.temporalStatus === "DELAYED").length,
      atRiskTasks: tasks.filter((x) => x.temporalStatus === "AT_RISK").length,
      completedTasks: tasks.filter((x) =>
        new Decimal(x.actualProgress).gte(100),
      ).length,
      totalTasks: tasks.length,
      plannedEnd: schedule.plannedEnd.toISOString().slice(0, 10),
      ...forecastSchedule({
        start: schedule.plannedStart.toISOString(),
        plannedEnd: schedule.plannedEnd.toISOString(),
        reference: today(),
        actualProgress: current.actualProgress,
        observations,
        actualEnd:
          tasks.length && tasks.every((x) => x.actualEnd)
            ? new Date(
                Math.max(...tasks.map((x) => x.actualEnd!.getTime())),
              ).toISOString()
            : null,
      }),
    };
  }
}
@Injectable()
export class FinancialKpiService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(FinancialService) readonly financial: FinancialService,
  ) {}
  async calculate(r: ApiRequest, p: string) {
    const scope = { tenantId: r.auth.tenantId, projectId: p };
    const [base, original, expenses, direct] = await Promise.all([
      this.financial.summary(r, p),
      this.db.budgetRevision.findFirst({
        where: { ...scope, revisionNumber: 0 },
        select: { id: true },
      }),
      this.db.expense.aggregate({
        where: { ...scope, status: "APPROVED" },
        _sum: { totalAmount: true },
      }),
      this.db.expense.aggregate({
        where: { ...scope, status: "APPROVED", contractId: null },
        _sum: { totalAmount: true },
      }),
    ]);
    const originalValues = original
      ? await this.db.budgetRevisionValue.aggregate({
          where: {
            tenantId: scope.tenantId,
            budgetRevisionId: original.id,
            itemType: "ITEM",
            isActive: true,
          },
          _sum: { totalValue: true },
        })
      : null;
    const originalBudget = money(originalValues?._sum.totalValue);
    return {
      ...base,
      originalBudget,
      budgetVariance: new Decimal(base.approvedBudget)
        .minus(originalBudget)
        .toFixed(2),
      currentContracts: base.currentContractValue,
      approvedExpenses: money(expenses._sum.totalAmount),
      directExpenses: money(direct._sum.totalAmount),
      retentionBalance: base.retentionAvailable,
      fundingApproved: base.approvedFunding,
      fundingDisbursed: base.disbursed,
      ...financialIndicators({
        approvedBudget: base.approvedBudget,
        currentContracts: base.currentContractValue,
        certified: base.certified,
        paid: base.paid,
        fundingApproved: base.approvedFunding,
        fundingDisbursed: base.disbursed,
        directExpenses: money(direct._sum.totalAmount),
      }),
      forecastAssumption:
        "Contratos vigentes + despesas aprovadas sem contrato. Não inclui custos futuros não aprovados; adendas aprovadas já integram os contratos.",
    };
  }
}
@Injectable()
export class QualityKpiService {
  constructor(@Inject(QualityService) readonly quality: QualityService) {}
  async calculate(r: ApiRequest, p: string) {
    const [summary, breakdowns] = await Promise.all([
      this.quality.summary(r, p, query.parse({})),
      this.quality.trends(r, p, query.parse({})),
    ]);
    return {
      ...summary,
      byCategory: breakdowns.category,
      byOrganization: breakdowns.organizations,
    };
  }
}
@Injectable()
export class ContractKpiService {
  constructor(@Inject(Database) readonly db: Database) {}
  async calculate(scope: Scope) {
    const [groups, endingSoon] = await Promise.all([
      this.db.contract.groupBy({
        by: ["status"],
        where: { ...scope, status: { in: [...contractStatuses] } },
        _count: true,
        _sum: { originalValue: true, currentValue: true },
      }),
      this.db.contract.count({
        where: {
          ...scope,
          status: "ACTIVE",
          endDate: {
            gte: new Date(today()),
            lte: new Date(Date.parse(today()) + 30 * 86400000),
          },
        },
      }),
    ]);
    const amendments = await this.db.contractAmendment.groupBy({
      by: ["amendmentType"],
      where: { ...scope, status: "APPROVED" },
      _sum: { amount: true },
    });
    const linked = await this.db.nonConformity.findMany({
      where: {
        ...scope,
        status: { notIn: ["CLOSED", "CANCELLED"] },
        contractId: { not: null },
      },
      distinct: ["contractId"],
      select: { contractId: true },
    });
    const total = (field: "originalValue" | "currentValue") =>
      groups
        .reduce(
          (sum, x) => sum.plus(String(x._sum[field] ?? 0)),
          new Decimal(0),
        )
        .toFixed(2);
    return {
      totalContracts: groups.reduce((sum, x) => sum + x._count, 0),
      originalValue: total("originalValue"),
      currentValue: total("currentValue"),
      active: groups.find((x) => x.status === "ACTIVE")?._count ?? 0,
      completed: groups.find((x) => x.status === "COMPLETED")?._count ?? 0,
      endingSoon,
      additions: money(
        amendments.find((x) => x.amendmentType === "ADDITION")?._sum.amount,
      ),
      omissions: money(
        amendments.find((x) => x.amendmentType === "OMISSION")?._sum.amount,
      ),
      contractsWithOpenNcr: linked.length,
    };
  }
}
@Injectable()
export class AnalyticsAccess {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(ExecutionAccess) readonly execution: ExecutionAccess,
  ) {}
  visible(r: ApiRequest) {
    return {
      tenantId: r.auth.tenantId,
      ...(r.auth.role === "ADMIN"
        ? {}
        : {
            users: {
              some: {
                tenantId: r.auth.tenantId,
                userId: r.auth.userId,
                status: "ACTIVE" as const,
              },
            },
          }),
    };
  }
}
