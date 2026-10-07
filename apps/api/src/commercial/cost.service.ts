import { Inject, Injectable } from "@nestjs/common";
import { Decimal } from "decimal.js";
import { Prisma } from "../generated/prisma/client.js";
import { CommercialService } from "./commercial.service.js";
import type { ApiRequest } from "../auth/security.js";
import {
  fixed,
  remainingBudget,
  overcontracted,
} from "../../../../packages/domain/src/commercial.js";
@Injectable()
export class CostService {
  constructor(@Inject(CommercialService) readonly service: CommercialService) {}
  async summary(r: ApiRequest, p: string) {
    const s = await this.service.scope(r, p, "cost");
    return this.service.db.$transaction(
      async (tx) => {
        const revision = await tx.budgetRevision.findFirst({
          where: { ...s, status: "APPROVED" },
          orderBy: { revisionNumber: "desc" },
        });
        const budget = revision
          ? await tx.budgetRevisionValue.aggregate({
              where: {
                tenantId: s.tenantId,
                budgetRevisionId: revision.id,
                itemType: "ITEM",
                isActive: true,
              },
              _sum: { totalValue: true },
            })
          : null;
        const contracts = await tx.contract.aggregate({
          where: {
            ...s,
            status: { in: ["ACTIVE", "SUSPENDED", "COMPLETED", "TERMINATED"] },
          },
          _sum: { originalValue: true, currentValue: true },
        });
        const active = await tx.contract.aggregate({
          where: { ...s, status: "ACTIVE" },
          _sum: { currentValue: true },
        });
        const amendments = await tx.$queryRaw<
          { kind: string; amount: Prisma.Decimal }[]
        >`SELECT a.amendment_type::text AS kind, SUM(a.amount) AS amount FROM contract_amendments a JOIN contracts c ON c.id=a.contract_id AND c.tenant_id=a.tenant_id AND c.project_id=a.project_id WHERE a.tenant_id=${s.tenantId}::uuid AND a.project_id=${p}::uuid AND a.status='APPROVED' AND c.status NOT IN ('DRAFT','CANCELLED') GROUP BY a.amendment_type`;
        const expenses = await tx.expense.aggregate({
            where: { ...s, status: "APPROVED" },
            _sum: { totalAmount: true },
          }),
          direct = await tx.expense.aggregate({
            where: { ...s, status: "APPROVED", contractId: null },
            _sum: { totalAmount: true },
          });
        const money = (x: Prisma.Decimal | null | undefined) =>
          fixed(new Decimal(x ?? 0));
        const approvedBudget = money(budget?._sum.totalValue),
          currentContracted = money(contracts._sum.currentValue),
          approvedDirectExpenses = money(direct._sum.totalAmount);
        return {
          approvedBudget,
          contractedOriginal: money(contracts._sum.originalValue),
          approvedAdditions: money(
            amendments.find((x) => x.kind === "ADDITION")?.amount,
          ),
          approvedOmissions: money(
            amendments.find((x) => x.kind === "OMISSION")?.amount,
          ),
          currentContracted,
          approvedExpenses: money(expenses._sum.totalAmount),
          approvedDirectExpenses,
          committedCost: money(active._sum.currentValue),
          remainingBudget: remainingBudget(
            approvedBudget,
            currentContracted,
            approvedDirectExpenses,
          ),
          currency: "MZN",
          budgetRevisionId: revision?.id ?? null,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async items(r: ApiRequest, p: string, page: number, limit: number) {
    const s = await this.service.scope(r, p, "cost");
    return this.service.db.$transaction(
      async (tx) => {
        const revision = await tx.budgetRevision.findFirst({
          where: { ...s, status: "APPROVED" },
          orderBy: { revisionNumber: "desc" },
        });
        if (!revision) return { items: [], total: 0, page, limit };
        const where = {
          tenantId: s.tenantId,
          budgetRevisionId: revision.id,
          itemType: "ITEM" as const,
          isActive: true,
        };
        const [rows, total] = await Promise.all([
          tx.budgetRevisionValue.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { code: "asc" },
          }),
          tx.budgetRevisionValue.count({ where }),
        ]);
        const ids = rows.map((x) => x.budgetItemId);
        if (!ids.length) return { items: [], total, page, limit };
        const contracted = await tx.$queryRaw<
          { id: string; value: Prisma.Decimal }[]
        >`SELECT i.budget_item_id AS id,SUM(i.total_value) AS value FROM contract_items i JOIN contracts c ON c.id=i.contract_id AND c.tenant_id=i.tenant_id AND c.project_id=i.project_id WHERE i.tenant_id=${s.tenantId}::uuid AND i.project_id=${p}::uuid AND i.deleted_at IS NULL AND c.status NOT IN ('DRAFT','CANCELLED') AND i.budget_item_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) GROUP BY i.budget_item_id`;
        const expenses = await tx.expense.groupBy({
          by: ["budgetItemId", "contractId"],
          where: { ...s, budgetItemId: { in: ids }, status: "APPROVED" },
          _sum: { totalAmount: true },
        });
        return {
          items: rows.map((row) => {
            const cv = fixed(
                new Decimal(
                  contracted.find((x) => x.id === row.budgetItemId)?.value ?? 0,
                ),
              ),
              exp = expenses.filter((x) => x.budgetItemId === row.budgetItemId),
              sum = (direct: boolean) =>
                fixed(
                  exp
                    .filter((x) => !direct || x.contractId === null)
                    .reduce(
                      (a, x) => a.plus(x._sum.totalAmount ?? 0),
                      new Decimal(0),
                    ),
                ),
              bv = row.totalValue.toFixed(2),
              remaining = remainingBudget(bv, cv, sum(true));
            return {
              budgetItemId: row.budgetItemId,
              code: row.code,
              description: row.description,
              budgetValue: bv,
              contractedValue: cv,
              approvedExpenseValue: sum(false),
              approvedDirectExpenses: sum(true),
              remainingValue: remaining,
              variance: fixed(new Decimal(remaining).neg()),
              warnings: overcontracted(bv, cv),
            };
          }),
          total,
          page,
          limit,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
}
