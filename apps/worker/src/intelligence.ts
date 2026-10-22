import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../api/src/app.js";
import { Database } from "../../api/src/platform.js";
import { AnalyticsService } from "../../api/src/analytics/analytics.service.js";
import { AlertEvaluationService } from "../../api/src/alerts/evaluation.js";
import type { ApiRequest } from "../../api/src/auth/security.js";
import { today } from "../../api/src/schedule/schedule.service.js";
let context:
  ReturnType<typeof NestFactory.createApplicationContext> | undefined;
export function intelligenceContext() {
  return (context ??= NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  }));
}
export async function closeIntelligence() {
  if (context) await (await context).close();
}
export async function workerRequest(
  db: Database,
  tenantId: string,
  userId: string,
): Promise<ApiRequest> {
  const member = await db.tenantUser.findFirst({
    where: {
      tenantId,
      userId,
      status: "ACTIVE",
      user: { status: "ACTIVE" },
      tenant: { status: "ACTIVE" },
    },
  });
  if (!member) throw Error("REPORT_ACCESS_REVOKED");
  return {
    auth: { tenantId, userId, role: member.role, sessionId: "worker" },
    get: () => undefined,
  } as unknown as ApiRequest;
}
export async function snapshotProjectKpis(
  filter: { tenantId?: string; projectId?: string } = {},
) {
  const ctx = await intelligenceContext(),
    db = ctx.get(Database),
    analytics = ctx.get(AnalyticsService),
    alerts = ctx.get(AlertEvaluationService);
  let cursor: string | undefined,
    processed = 0,
    skipped = 0;
  for (;;) {
    const projects = await db.project.findMany({
      where: {
        tenant: { status: "ACTIVE" },
        ...(filter.tenantId ? { tenantId: filter.tenantId } : {}),
        ...(filter.projectId ? { id: filter.projectId } : {}),
      },
      take: 100,
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!projects.length) break;
    for (const p of projects) {
      const actor = await db.tenantUser.findFirst({
        where: {
          tenantId: p.tenantId,
          role: "ADMIN",
          status: "ACTIVE",
          user: { status: "ACTIVE" },
        },
      });
      if (!actor) {
        skipped++;
        continue;
      }
      const r = await workerRequest(db, p.tenantId, actor.userId),
        data = await analytics.project(r, p.id, true),
        f = data.financial!;
      const scope = {
        tenantId: p.tenantId,
        projectId: p.id,
        snapshotDate: new Date(today()),
      };
      const values = {
        plannedProgress: data.schedule.plannedProgress,
        actualProgress: data.schedule.actualProgress,
        approvedBudget: f.approvedBudget,
        currentContracts: f.currentContracts,
        certified: f.certified,
        paid: f.paid,
        fundingDisbursed: f.fundingDisbursed,
        openNcr: data.quality.openNonConformities,
        criticalNcr: data.quality.criticalNonConformities,
        overdueNcr: data.quality.overdueNonConformities,
      };
      await db.projectKpiSnapshot.upsert({
        where: { tenantId_projectId_snapshotDate: scope },
        create: { ...scope, ...values },
        update: values,
      });
      await alerts.evaluate(r, p.id);
      processed++;
    }
    cursor = projects.at(-1)!.id;
  }
  return { processed, skipped };
}
