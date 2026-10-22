import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Decimal } from "decimal.js";
import type { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import { Cache, Database, fail } from "../platform.js";
import type { ApiRequest } from "../auth/security.js";
import { FinancialService } from "../financial/financial.service.js";
import {
  AnalyticsAccess,
  ScheduleKpiService,
  FinancialKpiService,
  QualityKpiService,
  ContractKpiService,
} from "./kpis.js";
import {
  executiveDefaults,
  executiveStatus,
} from "../../../../packages/domain/src/analytics.js";
import type {
  analyticsQuery,
  curveQuery,
} from "../../../../packages/validation/src/analytics.js";
@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(Cache) readonly cache: Cache,
    @Inject(AnalyticsAccess) readonly access: AnalyticsAccess,
    @Inject(ScheduleKpiService) readonly schedule: ScheduleKpiService,
    @Inject(FinancialKpiService) readonly financial: FinancialKpiService,
    @Inject(QualityKpiService) readonly quality: QualityKpiService,
    @Inject(ContractKpiService) readonly contracts: ContractKpiService,
    @Inject(FinancialService) readonly ledger: FinancialService,
  ) {}
  async project(r: ApiRequest, p: string, refresh = false) {
    const { scope, role } = await this.access.execution.check(r, p);
    // Permission is checked before every cache hit; revoking membership takes immediate effect.
    const key = `analytics:v1:${scope.tenantId}:${p}:${r.auth.userId}:${role}`;
    if (!refresh) {
      const hit = await this.cache.get(key).catch(() => null);
      if (hit)
        return JSON.parse(hit) as Awaited<
          ReturnType<AnalyticsService["calculate"]>
        >;
    }
    const data = await this.calculate(r, p, role);
    await this.cache
      .set(key, JSON.stringify(data), "EX", 60)
      .catch(() => undefined);
    return data;
  }
  async calculate(r: ApiRequest, p: string, role: string) {
    const scope = { tenantId: r.auth.tenantId, projectId: p };
    const [project, schedule, quality, financial, contracts] =
      await Promise.all([
        this.db.project.findFirstOrThrow({
          where: { tenantId: scope.tenantId, id: p },
          include: {
            organizations: {
              include: {
                organization: { select: { id: true, legalName: true } },
              },
            },
            users: {
              where: { role: "MANAGER", status: "ACTIVE" },
              include: {
                membership: {
                  include: { user: { select: { id: true, name: true } } },
                },
              },
            },
          },
        }),
        this.schedule.calculate(scope),
        this.quality.calculate(r, p),
        role === "INSPECTOR" ? null : this.financial.calculate(r, p),
        role === "INSPECTOR" ? null : this.contracts.calculate(scope),
      ]);
    const settings = await this.db.alertSetting.findUnique({
      where: { tenantId: scope.tenantId },
    });
    const risk = executiveStatus(
      {
        plannedProgress: schedule.plannedProgress ?? "0",
        actualProgress: schedule.actualProgress ?? "0",
        criticalNcr: quality.criticalNonConformities,
        approvedBudget: financial?.approvedBudget ?? "0",
        forecastFinalCost: financial?.forecastFinalCost ?? "0",
        fundingApproved: financial?.fundingApproved ?? "0",
        fundingBalance: financial?.fundingBalance ?? "0",
        overdueNcr: quality.overdueNonConformities,
      },
      settings
        ? {
            ...executiveDefaults,
            scheduleDelayThresholdPP: Number(settings.scheduleDelayThresholdPP),
            fundingLowThresholdPercentage: Number(
              settings.fundingLowThresholdPercentage,
            ),
          }
        : executiveDefaults,
    );
    // External roles receive aggregate cost indicators, never detailed internal expense records.
    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        status: project.status,
        startDate: project.startDate,
        plannedEndDate: project.plannedEndDate,
        managers: project.users.map((x) => ({
          id: x.userId,
          name: x.membership.user.name,
        })),
        organizations: project.organizations.map((x) => ({
          relationship: x.relationshipType,
          ...x.organization,
        })),
      },
      role,
      schedule,
      financial,
      quality,
      contracts,
      executiveStatus: risk.status,
      riskReasons: risk.reasons,
      assessedAt: new Date().toISOString(),
      assessmentComplete: schedule.available && financial !== null,
      drilldowns: {
        quality: `/projects/${p}/non-conformities`,
        schedule: `/projects/${p}/schedule`,
        measurements: `/projects/${p}/measurements`,
      },
    };
  }
  async portfolio(r: ApiRequest, q: z.infer<typeof analyticsQuery>) {
    const where: Prisma.ProjectWhereInput = {
      ...this.access.visible(r),
      ...(q.project ? { id: q.project } : {}),
      ...(q.status
        ? { status: q.status }
        : q.portfolio === "active"
          ? { status: "ACTIVE" }
          : q.portfolio === "completed"
            ? { status: "COMPLETED" }
            : {}),
      ...(q.manager
        ? {
            AND: [
              {
                users: {
                  some: {
                    tenantId: r.auth.tenantId,
                    userId: q.manager,
                    role: "MANAGER",
                    status: "ACTIVE",
                  },
                },
              },
            ],
          }
        : {}),
      ...(q.client
        ? {
            organizations: {
              some: {
                tenantId: r.auth.tenantId,
                organizationId: q.client,
                relationshipType: "OWNER",
              },
            },
          }
        : {}),
      ...(q.date_from || q.date_to
        ? {
            startDate: {
              ...(q.date_from ? { gte: new Date(q.date_from) } : {}),
              ...(q.date_to ? { lte: new Date(q.date_to) } : {}),
            },
          }
        : {}),
    };
    const visible = await this.db.project.findMany({
      where,
      select: { id: true, updatedAt: true },
      orderBy: { code: "asc" },
    });
    // The permission signature is recomputed from current memberships before portfolio cache access.
    const assignments = await this.db.projectUser.findMany({
      where: {
        tenantId: r.auth.tenantId,
        userId: r.auth.userId,
        status: "ACTIVE",
      },
      select: { projectId: true, role: true },
      orderBy: { projectId: "asc" },
    });
    const signature = createHash("sha256")
      .update(JSON.stringify({ q, visible, assignments }))
      .digest("hex");
    const key = `portfolio:v1:${r.auth.tenantId}:${r.auth.userId}:${r.auth.role}:${signature}`;
    const hit = await this.cache.get(key).catch(() => null);
    if (hit)
      return JSON.parse(hit) as {
        items: Awaited<ReturnType<AnalyticsService["project"]>>[];
        totals: Record<string, string | number>;
        assessedAt: string;
      };
    const rows: Awaited<ReturnType<AnalyticsService["project"]>>[] = [];
    for (let i = 0; i < visible.length; i += 4)
      rows.push(
        ...(await Promise.all(
          visible.slice(i, i + 4).map((x) => this.project(r, x.id)),
        )),
      );
    const items =
      q.portfolio === "at-risk"
        ? rows.filter((x) =>
            ["AT_RISK", "CRITICAL"].includes(x.executiveStatus),
          )
        : rows;
    const sum = (
      get: (x: (typeof items)[number]) => string | null | undefined,
    ) => items.reduce((v, x) => v.plus(get(x) ?? 0), new Decimal(0)).toFixed(2);
    const data = {
      items,
      totals: {
        total: items.length,
        active: items.filter((x) => x.project.status === "ACTIVE").length,
        planning: items.filter((x) => x.project.status === "PLANNING").length,
        completed: items.filter((x) => x.project.status === "COMPLETED").length,
        approvedBudget: sum((x) => x.financial?.approvedBudget),
        currentContracts: sum((x) => x.financial?.currentContracts),
        certified: sum((x) => x.financial?.certified),
        paid: sum((x) => x.financial?.paid),
        fundingApproved: sum((x) => x.financial?.fundingApproved),
        fundingDisbursed: sum((x) => x.financial?.fundingDisbursed),
        openNcr: items.reduce((n, x) => n + x.quality.openNonConformities, 0),
        criticalNcr: items.reduce(
          (n, x) => n + x.quality.criticalNonConformities,
          0,
        ),
        delayedTasks: items.reduce((n, x) => n + x.schedule.delayedTasks, 0),
      },
      assessedAt: new Date().toISOString(),
    };
    await this.cache
      .set(key, JSON.stringify(data), "EX", 30)
      .catch(() => undefined);
    return data;
  }
  async worklist(r: ApiRequest) {
    const projects = await this.db.project.findMany({
      where: this.access.visible(r),
      select: { id: true },
    });
    const assignments = await this.db.projectUser.findMany({
      where: {
        tenantId: r.auth.tenantId,
        userId: r.auth.userId,
        status: "ACTIVE",
      },
      select: { projectId: true, role: true },
    });
    const allowed = (roles: string[]) =>
      r.auth.role === "ADMIN"
        ? projects.map((x) => x.id)
        : assignments
            .filter((x) => roles.includes(x.role))
            .map((x) => x.projectId);
    const scope = (roles: string[]) => ({
      tenantId: r.auth.tenantId,
      projectId: { in: allowed(roles) },
    });
    const [inspections, requests, measurements, diaries, expenses, ncr] =
      await Promise.all([
        this.db.inspection.findMany({
          where: {
            ...scope(["INSPECTOR"]),
            status: { in: ["DRAFT", "IN_PROGRESS", "SUBMITTED"] },
          },
          select: {
            id: true,
            projectId: true,
            code: true,
            status: true,
            inspectionDate: true,
          },
          take: 10,
          orderBy: { inspectionDate: "asc" },
        }),
        this.db.inspectionRequest.findMany({
          where: {
            ...scope(["INSPECTOR"]),
            status: { in: ["SUBMITTED", "SCHEDULED"] },
          },
          select: { id: true, projectId: true, code: true, status: true },
          take: 10,
          orderBy: { createdAt: "asc" },
        }),
        this.db.measurement.findMany({
          where: {
            ...scope(["MANAGER", "INSPECTOR", "FINANCIER"]),
            status: { in: ["SUBMITTED", "FISCAL_REVIEW", "APPROVAL_REVIEW"] },
          },
          select: { id: true, projectId: true, code: true, status: true },
          take: 10,
          orderBy: { createdAt: "asc" },
        }),
        this.db.dailyLog.findMany({
          where: {
            ...scope(["MANAGER"]),
            status: { in: ["DRAFT", "SUBMITTED"] },
          },
          select: { id: true, projectId: true, logDate: true, status: true },
          take: 10,
          orderBy: { logDate: "desc" },
        }),
        this.db.expense.findMany({
          where: { ...scope(["MANAGER"]), status: "SUBMITTED" },
          select: {
            id: true,
            projectId: true,
            expenseNumber: true,
            status: true,
          },
          take: 10,
          orderBy: { createdAt: "asc" },
        }),
        this.db.nonConformity.findMany({
          where: {
            ...scope(["MANAGER", "INSPECTOR"]),
            status: { notIn: ["CLOSED", "CANCELLED"] },
          },
          select: {
            id: true,
            projectId: true,
            code: true,
            title: true,
            status: true,
          },
          take: 10,
          orderBy: { dueDate: "asc" },
        }),
      ]);
    return { inspections, requests, measurements, diaries, expenses, ncr };
  }
  async compare(r: ApiRequest, ids: string[]) {
    if (new Set(ids).size !== ids.length)
      fail(400, "VALIDATION_ERROR", "Não repita obras");
    return { items: await Promise.all(ids.map((p) => this.project(r, p))) };
  }
  async curve(r: ApiRequest, p: string, q: z.infer<typeof curveQuery>) {
    await this.access.execution.check(r, p);
    const data = await this.ledger.curve(r, p);
    const grouped = new Map<string, (typeof data.items)[number]>();
    for (const item of data.items) {
      if ((q.from && item.date < q.from) || (q.to && item.date > q.to))
        continue;
      const date = new Date(item.date);
      if (q.granularity === "WEEK")
        date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      const key =
        q.granularity === "MONTH"
          ? item.date.slice(0, 7) + "-01"
          : date.toISOString().slice(0, 10);
      grouped.set(key, item);
    }
    return {
      ...data,
      granularity: q.granularity,
      items: [...grouped].map(([period, item]) => ({
        ...item,
        period,
        plannedFinancial: data.baselineSource ? item.planned_financial : null,
        actualFinancial: data.baselineSource ? item.actual_financial : null,
        plannedPhysical: item.planned_physical,
        actualPhysical: item.actual_physical,
      })),
      sources: {
        plannedPhysical: "Snapshots do cronograma M3",
        actualPhysical: "Snapshots de progresso real M3",
        plannedFinancial: data.plannedFinancialAssumption,
        actualFinancial:
          "Certificações acumuladas líquidas de estornos / baseline financeira M5",
      },
    };
  }
}
