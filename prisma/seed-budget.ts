import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../apps/api/src/generated/prisma/client.js";
import { money } from "../packages/domain/src/budget.js";
export async function seedBudget(
  db: PrismaClient,
  tenantId: string,
  projectId: string,
  userId: string,
) {
  if (await db.budget.findFirst({ where: { tenantId, projectId } })) return;
  await db.$transaction(async (tx) => {
    const budget = await tx.budget.create({
      data: {
        tenantId,
        projectId,
        name: "Orçamento Demo",
        revisionSequence: 0,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    const revision = await tx.budgetRevision.create({
      data: {
        tenantId,
        projectId,
        budgetId: budget.id,
        revisionNumber: 0,
        code: "R0",
        description: "Orçamento Base",
        createdBy: userId,
      },
    });
    const rows: [
      string,
      string,
      "GROUP" | "ITEM",
      string | null,
      string | null,
      string | null,
      string | null,
    ][] = [
      ["01", "Trabalhos Preliminares", "GROUP", null, null, null, null],
      ["01.01", "Estaleiro", "GROUP", "01", null, null, null],
      ["01.01.001", "Mobilização", "ITEM", "01.01", "un", "1", "250000"],
      ["02", "Fundações", "GROUP", null, null, null, null],
      ["02.01", "Escavação", "GROUP", "02", null, null, null],
      ["02.01.001", "Escavação", "ITEM", "02.01", "m³", "500", "450"],
      ["02.02", "Betão", "GROUP", "02", null, null, null],
      ["02.02.001", "Betão C25", "ITEM", "02.02", "m³", "100", "8500"],
    ];
    const ids = new Map(rows.map((r) => [r[0], randomUUID()]));
    for (const [
      i,
      [code, description, itemType, parent, unit, quantity, unitPrice],
    ] of rows.entries()) {
      const id = ids.get(code)!,
        parentId = parent ? ids.get(parent)! : null;
      await tx.budgetItem.create({
        data: {
          id,
          tenantId,
          projectId,
          budgetId: budget.id,
          code,
          description,
          itemType,
          parentId,
          unit,
          sortOrder: i,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      await tx.budgetRevisionValue.create({
        data: {
          tenantId,
          budgetId: budget.id,
          budgetRevisionId: revision.id,
          budgetItemId: id,
          code,
          description,
          itemType,
          parentId,
          unit,
          sortOrder: i,
          quantity,
          unitPrice,
          totalValue: itemType === "ITEM" ? money(quantity!, unitPrice!) : "0",
        },
      });
    }
    await tx.budgetRevision.update({
      where: { id: revision.id, tenantId, projectId },
      data: {
        status: "APPROVED",
        submittedAt: new Date(),
        submittedBy: userId,
        approvedAt: new Date(),
        approvedBy: userId,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        projectId,
        userId,
        entityType: "BudgetRevision",
        entityId: revision.id,
        action: "BUDGET_REVISION_APPROVED",
        newValues: {
          revision: "R0",
          value: "1325000.00",
          source: "development-seed",
        },
      },
    });
  });
}
