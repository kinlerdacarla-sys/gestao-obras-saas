import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Database, fail } from "../platform.js";
import { BudgetAccess } from "./budget.access.js";
import { claimDraft, valuesIn } from "./budget.repository.js";
import type { ApiRequest } from "../auth/security.js";
import { recordAudit } from "../audit/audit.module.js";
import {
  buildTree,
  money,
  type BudgetLine,
} from "../../../../packages/domain/src/budget.js";
import type { z } from "zod";
import type {
  itemCreateSchema,
  itemPatchSchema,
} from "../../../../packages/validation/src/budget.js";
@Injectable()
export class BudgetItemService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(BudgetAccess) readonly access: BudgetAccess,
  ) {}
  async save(
    req: ApiRequest,
    projectId: string,
    input: z.infer<typeof itemCreateSchema> | z.infer<typeof itemPatchSchema>,
    itemId?: string,
  ) {
    const scope = await this.access.check(req, projectId, true);
    const { revisionId, version, ...fields } = input;
    return this.db.$transaction(
      async (tx) => {
        const revision = await claimDraft(tx, scope, revisionId, version);
        const lines = await valuesIn(tx, scope, revisionId);
        const before = itemId
          ? lines.find((x) => x.budgetItemId === itemId && x.isActive)
          : undefined;
        if (itemId && !before)
          fail(404, "BUDGET_ITEM_NOT_FOUND", "Item não encontrado");
        const id = itemId ?? randomUUID();
        const line = {
          ...before,
          ...fields,
          budgetItemId: id,
          isActive: true,
        } as BudgetLine;
        if (before && before.itemType !== line.itemType)
          fail(
            400,
            "BUDGET_IMPORT_INVALID",
            "O tipo da identidade não pode ser alterado",
          );
        line.totalValue =
          line.itemType === "GROUP"
            ? "0.00"
            : money(line.quantity ?? "", line.unitPrice ?? "");
        buildTree([...lines.filter((x) => x.budgetItemId !== id), line]);
        if (!before)
          await tx.budgetItem.create({
            data: {
              id,
              tenantId: scope.tenantId,
              projectId,
              budgetId: revision.budgetId,
              parentId: line.parentId,
              code: line.code,
              description: line.description,
              itemType: line.itemType,
              unit: line.unit,
              sortOrder: line.sortOrder,
              createdBy: req.auth.userId,
              updatedBy: req.auth.userId,
            },
          });
        if (before)
          await tx.budgetItem.updateMany({
            where: {
              id,
              tenantId: scope.tenantId,
              projectId,
              budgetId: revision.budgetId,
            },
            data: {
              code: line.code,
              description: line.description,
              parentId: line.parentId,
              unit: line.unit,
              sortOrder: line.sortOrder,
              isActive: true,
              updatedBy: req.auth.userId,
            },
          });
        const data = {
          ...line,
          tenantId: scope.tenantId,
          budgetId: revision.budgetId,
          budgetRevisionId: revisionId,
        };
        await tx.budgetRevisionValue.upsert({
          where: {
            budgetRevisionId_budgetItemId: {
              budgetRevisionId: revisionId,
              budgetItemId: id,
            },
          },
          create: data,
          update: data,
        });
        await recordAudit(
          tx,
          req.auth,
          {
            action: before ? "BUDGET_ITEM_UPDATED" : "BUDGET_ITEM_CREATED",
            entityType: "BudgetItem",
            entityId: id,
            projectId,
            oldValues: before,
            newValues: { ...line, revisionId },
          },
          req,
        );
        return { ...line, version: version + 1 };
      },
      { timeout: 60000 },
    );
  }
  async remove(
    req: ApiRequest,
    projectId: string,
    itemId: string,
    revisionId: string,
    version: number,
  ) {
    const scope = await this.access.check(req, projectId, true);
    return this.db.$transaction(async (tx) => {
      const revision = await claimDraft(tx, scope, revisionId, version);
      const lines = await valuesIn(tx, scope, revisionId);
      const before = lines.find((x) => x.budgetItemId === itemId && x.isActive);
      if (!before) fail(404, "BUDGET_ITEM_NOT_FOUND", "Item não encontrado");
      if (lines.some((x) => x.parentId === itemId && x.isActive))
        fail(409, "CONFLICT", "Desative primeiro os descendentes deste grupo");
      await tx.budgetRevisionValue.updateMany({
        where: {
          tenantId: scope.tenantId,
          budgetRevisionId: revisionId,
          budgetItemId: itemId,
        },
        data: { isActive: false },
      });
      await tx.budgetItem.updateMany({
        where: {
          tenantId: scope.tenantId,
          projectId,
          budgetId: revision.budgetId,
          id: itemId,
        },
        data: { isActive: false, updatedBy: req.auth.userId },
      });
      await recordAudit(
        tx,
        req.auth,
        {
          action: "BUDGET_ITEM_DEACTIVATED",
          entityType: "BudgetItem",
          entityId: itemId,
          projectId,
          oldValues: before,
          newValues: { isActive: false, revisionId },
        },
        req,
      );
      return { version: version + 1 };
    });
  }
}
