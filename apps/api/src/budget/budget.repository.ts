import type {
  Prisma,
  BudgetRevisionValue,
} from "../generated/prisma/client.js";
import { fail } from "../platform.js";
import {
  assertDraft,
  type BudgetLine,
} from "../../../../packages/domain/src/budget.js";
export type Scope = { tenantId: string; projectId: string };
export const toLines = (values: BudgetRevisionValue[]): BudgetLine[] =>
  values.map((v) => ({
    budgetItemId: v.budgetItemId,
    parentId: v.parentId,
    code: v.code,
    description: v.description,
    itemType: v.itemType,
    unit: v.unit,
    sortOrder: v.sortOrder,
    isActive: v.isActive,
    quantity: v.quantity?.toFixed(4) ?? null,
    unitPrice: v.unitPrice?.toFixed(2) ?? null,
    totalValue: v.totalValue.toFixed(2),
  }));
export async function activeBudget(tx: Prisma.TransactionClient, scope: Scope) {
  scope = { tenantId: scope.tenantId, projectId: scope.projectId };
  return (
    (await tx.budget.findFirst({ where: { ...scope, status: "ACTIVE" } })) ??
    fail(404, "BUDGET_NOT_FOUND", "Esta obra ainda não possui orçamento.")
  );
}
export async function lockBudget(tx: Prisma.TransactionClient, scope: Scope) {
  scope = { tenantId: scope.tenantId, projectId: scope.projectId };
  const budget = await activeBudget(tx, scope);
  return tx.budget.update({
    where: { id: budget.id, ...scope },
    data: { revisionSequence: { increment: 0 } },
  });
}
export async function revisionIn(
  tx: Prisma.TransactionClient,
  scope: Scope,
  id: string,
) {
  scope = { tenantId: scope.tenantId, projectId: scope.projectId };
  return (
    (await tx.budgetRevision.findFirst({ where: { ...scope, id } })) ??
    fail(404, "BUDGET_REVISION_NOT_FOUND", "Revisão não encontrada")
  );
}
export async function claimDraft(
  tx: Prisma.TransactionClient,
  scope: Scope,
  id: string,
  version: number,
) {
  scope = { tenantId: scope.tenantId, projectId: scope.projectId };
  const revision = await revisionIn(tx, scope, id);
  assertDraft(revision.status);
  const changed = await tx.budgetRevision.updateMany({
    where: { ...scope, id, version, status: "DRAFT" },
    data: { version: { increment: 1 } },
  });
  if (changed.count !== 1)
    fail(
      409,
      "RESOURCE_VERSION_CONFLICT",
      "Dados alterados por outro utilizador. Atualize a página.",
    );
  return revision;
}
export async function valuesIn(
  tx: Prisma.TransactionClient,
  scope: Scope,
  revisionId: string,
) {
  const revision = await revisionIn(tx, scope, revisionId);
  return toLines(
    await tx.budgetRevisionValue.findMany({
      where: {
        tenantId: scope.tenantId,
        budgetId: revision.budgetId,
        budgetRevisionId: revisionId,
      },
    }),
  );
}
export async function allocateRevision(
  tx: Prisma.TransactionClient,
  scope: Scope,
  userId: string,
  description?: string,
) {
  scope = { tenantId: scope.tenantId, projectId: scope.projectId };
  const budget = await lockBudget(tx, scope);
  if (
    await tx.budgetRevision.findFirst({
      where: {
        ...scope,
        budgetId: budget.id,
        status: { in: ["DRAFT", "SUBMITTED"] },
      },
    })
  )
    fail(
      409,
      "CONFLICT",
      "Já existe uma revisão em preparação. Conclua ou cancele-a.",
    );
  const next = await tx.budget.update({
    where: { id: budget.id, ...scope },
    data: { revisionSequence: { increment: 1 } },
  });
  return tx.budgetRevision.create({
    data: {
      ...scope,
      budgetId: budget.id,
      revisionNumber: next.revisionSequence,
      code: `R${next.revisionSequence}`,
      description,
      createdBy: userId,
    },
  });
}
