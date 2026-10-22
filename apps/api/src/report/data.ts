import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Database, fail } from "../platform.js";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { GalleryService, galleryQuery } from "../analytics/gallery.js";
import type { ApiRequest } from "../auth/security.js";
import type { ReportType } from "../generated/prisma/client.js";
import type { ReportSection } from "./render.js";
@Injectable()
export class ReportDataService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(AnalyticsService) readonly analytics: AnalyticsService,
    @Inject(GalleryService) readonly gallery: GalleryService,
  ) {}
  async signature(r: ApiRequest, p: string) {
    const { role, scope } = await this.analytics.access.execution.check(r, p);
    const documents = await this.db.document.findMany({
      where: scope,
      select: {
        id: true,
        visibility: true,
        deletedAt: true,
        confirmedAt: true,
      },
      orderBy: { id: "asc" },
    });
    return createHash("sha256")
      .update(JSON.stringify({ role, documents }))
      .digest("hex");
  }
  async collect(
    r: ApiRequest,
    p: string | undefined,
    type: ReportType,
    parameters: { date_from?: string; date_to?: string },
  ) {
    const sections: ReportSection[] = [],
      photos: { name: string; bytes: Buffer }[] = [];
    const add = (title: string, rows: Record<string, unknown>[]) => {
      if (rows.length > 20000)
        fail(
          400,
          "REPORT_TOO_LARGE",
          "Reduza o período do relatório (máximo 20 mil linhas por secção)",
        );
      sections.push({ title, rows });
    };
    if (type === "PORTFOLIO") {
      const data = await this.analytics.portfolio(r, {
        portfolio: "all",
        ...parameters,
      });
      add(
        "Portfolio",
        data.items.map((x) => ({
          Obra: x.project.name,
          Codigo: x.project.code,
          Estado: x.executiveStatus,
          Planeado: x.schedule.plannedProgress,
          Real: x.schedule.actualProgress,
          Desvio: x.schedule.progressVariance,
          Orcamento: x.financial?.approvedBudget,
          Contratos: x.financial?.currentContracts,
          Certificado: x.financial?.certified,
          Pago: x.financial?.paid,
          NCR: x.quality.openNonConformities,
          Fim: x.schedule.forecastEnd,
        })),
      );
      return { title: "Portfólio executivo", sections, photos };
    }
    const projectId = p!,
      scope = { tenantId: r.auth.tenantId, projectId },
      data = await this.analytics.project(r, projectId, true);
    const all = type === "PROJECT_EXECUTIVE",
      progress = all || type === "PROJECT_PROGRESS";
    const period = {
      ...(parameters.date_from ? { gte: new Date(parameters.date_from) } : {}),
      ...(parameters.date_to
        ? { lt: new Date(Date.parse(parameters.date_to) + 86400000) }
        : {}),
    };
    add("Identificação", [
      {
        Obra: data.project.name,
        Codigo: data.project.code,
        Estado: data.project.status,
        Avaliacao: data.executiveStatus,
        Emitido: data.assessedAt,
        De: parameters.date_from,
        Ate: parameters.date_to,
      },
    ]);
    if (all)
      add("Riscos e participantes", [
        {
          Estado: data.executiveStatus,
          Riscos: data.riskReasons,
          Gestores: data.project.managers,
          Organizacoes: data.project.organizations,
        },
      ]);
    if ((all || type === "FINANCIAL" || type === "CONTRACTS") && data.contracts)
      add("Resumo contratual", [data.contracts]);
    if (all || type === "QUALITY")
      add(
        "Inspeções",
        await this.db.inspection.findMany({
          where: {
            ...scope,
            ...(Object.keys(period).length ? { inspectionDate: period } : {}),
          },
          select: {
            code: true,
            status: true,
            inspectionDate: true,
            overallResult: true,
          },
          take: 20001,
          orderBy: { inspectionDate: "desc" },
        }),
      );
    if (type === "FINANCIAL" && ["ADMIN", "MANAGER"].includes(data.role))
      add(
        "Despesas diretas aprovadas",
        await this.db.expense.findMany({
          where: {
            ...scope,
            status: "APPROVED",
            contractId: null,
            ...(Object.keys(period).length ? { expenseDate: period } : {}),
          },
          select: {
            expenseNumber: true,
            expenseDate: true,
            description: true,
            totalAmount: true,
          },
          take: 20001,
        }),
      );
    if (type === "DAILY_LOG") {
      const logs = await this.db.dailyLog.findMany({
        where: {
          ...scope,
          ...(Object.keys(period).length ? { logDate: period } : {}),
        },
        select: { id: true },
        take: 20001,
      });
      if (logs.length > 20000)
        fail(400, "REPORT_TOO_LARGE", "Reduza o período");
      const where = { ...scope, dailyLogId: { in: logs.map((x) => x.id) } };
      const [
        activities,
        workforce,
        equipment,
        materials,
        deliveries,
        occurrences,
      ] = await Promise.all([
        this.db.dailyLogActivity.findMany({
          where,
          select: {
            dailyLogId: true,
            description: true,
            quantityCompleted: true,
            unit: true,
            progressBefore: true,
            progressAfter: true,
          },
          take: 20001,
        }),
        this.db.dailyLogWorkforce.findMany({
          where,
          select: {
            dailyLogId: true,
            companyName: true,
            trade: true,
            workerCount: true,
            hoursPerWorker: true,
          },
          take: 20001,
        }),
        this.db.dailyLogEquipment.findMany({
          where,
          select: {
            dailyLogId: true,
            equipmentName: true,
            quantity: true,
            hoursWorked: true,
            hoursIdle: true,
            status: true,
          },
          take: 20001,
        }),
        this.db.dailyLogMaterial.findMany({
          where,
          select: {
            dailyLogId: true,
            materialName: true,
            quantity: true,
            unit: true,
          },
          take: 20001,
        }),
        this.db.dailyLogDelivery.findMany({
          where,
          select: {
            dailyLogId: true,
            supplierName: true,
            description: true,
            quantity: true,
            unit: true,
          },
          take: 20001,
        }),
        this.db.dailyLogOccurrence.findMany({
          where,
          select: {
            dailyLogId: true,
            title: true,
            description: true,
            severity: true,
            occurrenceType: true,
          },
          take: 20001,
        }),
      ]);
      add("Atividades do diário", activities);
      add("Mão de obra", workforce);
      add("Equipamentos", equipment);
      add("Materiais", materials);
      add("Entregas", deliveries);
      add("Ocorrências", occurrences);
    }
    if (progress) {
      add("Schedule", [data.schedule]);
      add(
        "Atividades",
        await this.db.scheduleTask.findMany({
          where: { ...scope, status: { not: "CANCELLED" } },
          select: {
            code: true,
            name: true,
            taskType: true,
            status: true,
            plannedStart: true,
            plannedEnd: true,
            actualStart: true,
            actualEnd: true,
            actualProgress: true,
          },
          take: 20001,
          orderBy: { sortOrder: "asc" },
        }),
      );
      if (data.role !== "INSPECTOR") {
        const curve = await this.analytics.curve(r, projectId, {
          from: parameters.date_from,
          to: parameters.date_to,
          granularity: "DAY",
        });
        add("Curva S", curve.items);
        add("Fontes Curva S", [curve.sources]);
      }
    }
    if ((all || type === "FINANCIAL" || type === "FUNDING") && data.financial) {
      add("BudgetSummary", [data.financial]);
    }
    if (all || type === "QUALITY") add("Quality", [data.quality]);
    if (all || type === "QUALITY")
      add(
        "Não conformidades",
        await this.db.nonConformity.findMany({
          where: {
            ...scope,
            ...(Object.keys(period).length ? { detectedAt: period } : {}),
          },
          select: {
            code: true,
            title: true,
            status: true,
            severity: true,
            category: true,
            detectedAt: true,
            dueDate: true,
            closedAt: true,
          },
          take: 20001,
          orderBy: { detectedAt: "desc" },
        }),
      );
    if (
      (all && ["ADMIN", "MANAGER"].includes(data.role)) ||
      type === "CONTRACTS"
    )
      add(
        "Contracts",
        await this.db.contract.findMany({
          where: scope,
          select: {
            contractNumber: true,
            title: true,
            status: true,
            originalValue: true,
            currentValue: true,
            startDate: true,
            endDate: true,
          },
          take: 20001,
          orderBy: { contractNumber: "asc" },
        }),
      );
    if (all || type === "MEASUREMENTS" || type === "FINANCIAL")
      add(
        "Measurements",
        await this.db.measurement.findMany({
          where: {
            ...scope,
            ...(Object.keys(period).length ? { createdAt: period } : {}),
          },
          select: {
            measurementNumber: true,
            status: true,
            grossAmount: true,
            netCertifiedAmount: true,
            certifiedAt: true,
          },
          take: 20001,
          orderBy: { createdAt: "asc" },
        }),
      );
    if ((all || type === "FINANCIAL") && data.financial)
      add(
        "Payments",
        await this.db.payment.findMany({
          where: {
            ...scope,
            status: "POSTED",
            ...(Object.keys(period).length ? { createdAt: period } : {}),
          },
          select: { amount: true, createdAt: true },
          take: 20001,
          orderBy: { createdAt: "asc" },
        }),
      );
    if ((all || type === "FUNDING") && data.financial)
      add(
        "Funding",
        await this.db.fundingAgreement.findMany({
          where: scope,
          select: { title: true, status: true, approvedAmount: true },
          take: 20001,
        }),
      );
    if (progress || type === "DAILY_LOG")
      add(
        "DailyLogs",
        await this.db.dailyLog.findMany({
          where: {
            ...scope,
            ...(["CLIENT", "FINANCIER"].includes(data.role)
              ? { status: "APPROVED" as const }
              : {}),
            ...(Object.keys(period).length ? { logDate: period } : {}),
          },
          select: { logDate: true, status: true },
          take: 20001,
          orderBy: { logDate: "asc" },
        }),
      );
    if (progress) {
      const gallery = await this.gallery.list(
        r,
        projectId,
        galleryQuery.parse({
          date_from: parameters.date_from,
          date_to: parameters.date_to,
          limit: 8,
        }),
      );
      for (const photo of gallery.items) {
        const file = await this.gallery.file(r, projectId, photo.id);
        if (["image/png", "image/jpeg"].includes(file.document.mimeType))
          photos.push({ name: photo.fileName, bytes: file.bytes });
      }
    }
    return {
      title: `${data.project.name} / ${{ PROJECT_EXECUTIVE: "Relatório executivo", PROJECT_PROGRESS: "Relatório de progresso", FINANCIAL: "Relatório financeiro", MEASUREMENTS: "Medições", CONTRACTS: "Contratos", QUALITY: "Qualidade", DAILY_LOG: "Diário de obra", FUNDING: "Financiamento", PORTFOLIO: "Portfólio" }[type]}`,
      sections,
      photos,
    };
  }
}
