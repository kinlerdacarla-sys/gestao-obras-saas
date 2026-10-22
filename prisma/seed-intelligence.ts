import { Decimal } from "decimal.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  PrismaClient,
  Role,
} from "../apps/api/src/generated/prisma/client.js";
import { seedBudget } from "./seed-budget.js";
import { seedExecution } from "./seed-execution.js";
import { seedCommercial } from "./seed-commercial.js";
import { seedFinancial } from "./seed-financial.js";
import { calculateSchedule } from "../packages/domain/src/schedule.js";
import { taskLine } from "../apps/api/src/schedule/schedule.service.js";
export async function seedIntelligence(
  db: PrismaClient,
  tenantId: string,
  users: { user: { id: string }; role: Role }[],
) {
  const actor = (role: Role) => users.find((x) => x.role === role)!.user.id,
    admin = actor("ADMIN");
  for (const [code, name, critical] of [
    ["M7-SAUDE", "Centro de Saúde · Demo", false],
    ["M7-ESTRADA", "Estrada Municipal · Demo", true],
  ] as const) {
    const existing = await db.project.findUnique({
      where: { tenantId_code: { tenantId, code } },
    });
    if (existing) {
      if (!critical)
        await healthyBudget(db, tenantId, existing.id, admin, actor("MANAGER"));
      continue;
    }
    const project = await db.project.create({
        data: {
          tenantId,
          code,
          name,
          status: "ACTIVE",
          location: "Maputo",
          createdBy: admin,
          updatedBy: admin,
        },
      }),
      projectId = project.id,
      scope = { tenantId, projectId };
    for (const { user, role } of users) {
      if (critical && ["CLIENT", "FINANCIER"].includes(role)) continue;
      await db.projectUser.create({
        data: { ...scope, userId: user.id, role, status: "ACTIVE" },
      });
    }
    await seedBudget(db, tenantId, projectId, admin);
    if (!critical)
      await healthyBudget(db, tenantId, projectId, admin, actor("MANAGER"));
    await seedExecution(db, tenantId, projectId, admin);
    await seedCommercial(db, tenantId, projectId, admin, actor("MANAGER"));
    await seedFinancial(
      db,
      tenantId,
      projectId,
      admin,
      actor("MANAGER"),
      actor("INSPECTOR"),
      actor("FINANCIER"),
    );
    const tasks = await db.scheduleTask.findMany({ where: scope });
    const calculated = calculateSchedule(
      tasks.map(taskLine),
      "MANUAL",
      new Map(),
      new Date(),
    );
    for (const task of calculated.items.filter(
      (x) => x.taskType !== "SUMMARY",
    )) {
      const real = critical
        ? Math.max(0, Number(task.plannedProgress) - 30).toFixed(2)
        : task.plannedProgress;
      await db.scheduleTask.update({
        where: { id: task.id },
        data: {
          actualProgress: real,
          status:
            Number(real) >= 100
              ? "COMPLETED"
              : Number(real) > 0
                ? "IN_PROGRESS"
                : "NOT_STARTED",
          actualEnd: Number(real) >= 100 ? task.plannedEnd : null,
        },
      });
    }
    const day = new Date(new Date().toISOString().slice(0, 10));
    for (let offset = 0; offset <= 30; offset++) {
      const snapshotDate = new Date(day.getTime() - (30 - offset) * 86400000),
        plan = calculateSchedule(
          tasks.map(taskLine),
          "MANUAL",
          new Map(),
          snapshotDate,
        ).plannedProgress;
      const actual = critical
        ? Math.max(0, Number(plan) - 30).toFixed(2)
        : plan;
      await db.projectProgressSnapshot.upsert({
        where: { projectId_snapshotDate: { projectId, snapshotDate } },
        create: {
          ...scope,
          snapshotDate,
          plannedProgress: plan,
          actualProgress: actual,
          createdBy: admin,
        },
        update: { plannedProgress: plan, actualProgress: actual },
      });
    }
    if (!critical) {
      const log = await db.dailyLog.create({
        data: {
          ...scope,
          logDate: day,
          status: "DRAFT",
          createdBy: actor("MANAGER"),
          generalNotes:
            "Fotografia de demonstração autorizada para todos os participantes da obra.",
        },
      });
      const id = randomUUID(),
        bytes = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
          "base64",
        );
      const key = `tenant/${tenantId}/projects/${projectId}/demo/${id}.png`,
        target = path.resolve(
          process.env.DOCUMENT_STORAGE_PATH ?? "work/document-storage",
          key,
        );
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
      await db.document.create({
        data: {
          id,
          ...scope,
          dailyLogId: log.id,
          createdBy: actor("MANAGER"),
          objectKey: key,
          fileName: "Avanço da obra - demonstração.png",
          mimeType: "image/png",
          sizeBytes: bytes.length,
          checksum: createHash("sha256").update(bytes).digest("hex"),
          visibility: "PUBLIC_PROJECT",
          isPhoto: true,
          confirmedAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      await db.dailyLogPhoto.create({
        data: {
          ...scope,
          dailyLogId: log.id,
          documentId: id,
          createdBy: actor("MANAGER"),
          caption: "Demonstração de visibilidade pública na obra",
        },
      });
      await db.dailyLog.update({
        where: { id: log.id },
        data: { status: "APPROVED", approvedBy: admin, approvedAt: new Date() },
      });
    }
    if (critical) {
      const ncr = await db.nonConformity.create({
        data: {
          ...scope,
          ncrNumber: 1,
          code: "NCR-001",
          title: "Falha crítica na compactação",
          description:
            "Cenário demonstrativo M7: aguarda correção e verificação independente.",
          severity: "CRITICAL",
          category: "WORKMANSHIP",
          status: "OPEN",
          detectedBy: actor("INSPECTOR"),
          createdBy: actor("INSPECTOR"),
          dueDate: new Date(day.getTime() - 86400000),
        },
      });
      await db.alert.create({
        data: {
          ...scope,
          alertType: "NCR_CRITICAL",
          severity: "CRITICAL",
          title: "NCR crítica",
          message: ncr.title,
          entityType: "NonConformity",
          entityId: ncr.id,
          deduplicationKey: `NCR_CRITICAL:${ncr.id}`,
        },
      });
    }
  }
}

// A separate approved demo revision keeps R0 immutable and makes the healthy scenario financially consistent.
async function healthyBudget(
  db: PrismaClient,
  tenantId: string,
  projectId: string,
  admin: string,
  manager: string,
) {
  await db.$transaction(async (tx) => {
    const budget = await tx.budget.findFirst({
      where: { tenantId, projectId },
    });
    if (!budget || budget.revisionSequence !== 0) return;
    const source = await tx.budgetRevision.findFirst({
      where: {
        tenantId,
        projectId,
        budgetId: budget.id,
        revisionNumber: 0,
        status: "APPROVED",
      },
      include: { values: true },
    });
    if (
      !source ||
      !(await tx.auditLog.findFirst({
        where: {
          tenantId,
          entityId: source.id,
          action: "BUDGET_REVISION_APPROVED",
          newValues: { path: ["source"], equals: "development-seed" },
        },
      }))
    )
      return;
    const claimed = await tx.budget.updateMany({
      where: { id: budget.id, revisionSequence: 0 },
      data: { revisionSequence: 1, updatedBy: manager },
    });
    if (!claimed.count) return;
    const revision = await tx.budgetRevision.create({
      data: {
        tenantId,
        projectId,
        budgetId: budget.id,
        revisionNumber: 1,
        code: "R1",
        description:
          "Cenário saudável M7 — orçamento compatível com o âmbito contratado",
        createdBy: manager,
      },
    });
    for (const value of source.values) {
      await tx.budgetRevisionValue.create({
        data: {
          tenantId,
          budgetId: budget.id,
          budgetRevisionId: revision.id,
          budgetItemId: value.budgetItemId,
          parentId: value.parentId,
          code: value.code,
          description: value.description,
          itemType: value.itemType,
          unit: value.unit,
          sortOrder: value.sortOrder,
          isActive: value.isActive,
          quantity: value.quantity,
          unitPrice: value.unitPrice
            ? new Decimal(value.unitPrice.toString()).times(10).toFixed(2)
            : null,
          totalValue: new Decimal(value.totalValue.toString())
            .times(10)
            .toFixed(2),
        },
      });
    }
    await tx.budgetRevision.update({
      where: { id: revision.id },
      data: {
        status: "APPROVED",
        submittedBy: manager,
        submittedAt: new Date(),
        approvedBy: admin,
        approvedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        projectId,
        userId: admin,
        entityType: "BudgetRevision",
        entityId: revision.id,
        action: "BUDGET_REVISION_APPROVED",
        newValues: {
          revision: "R1",
          value: "13250000.00",
          source: "development-seed-m7",
        },
      },
    });
  });
}
