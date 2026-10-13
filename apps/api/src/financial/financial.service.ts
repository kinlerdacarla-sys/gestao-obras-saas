import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Decimal } from "decimal.js";
import type { z } from "zod";
import type {
  Prisma,
  Measurement,
  MeasurementStatus,
} from "../generated/prisma/client.js";
import { Database, fail } from "../platform.js";
import type { ApiRequest } from "../auth/security.js";
import { ExecutionAccess, type Scope } from "../schedule/access.js";
import { recordAudit } from "../audit/audit.module.js";
import * as v from "../../../../packages/validation/src/financial.js";
import * as d from "../../../../packages/domain/src/financial.js";
type Tx = Prisma.TransactionClient;
type Query = z.infer<typeof v.pageInput>;
const valid: MeasurementStatus[] = [
  "APPROVED",
  "CERTIFIED",
  "PARTIALLY_PAID",
  "PAID",
];
const certified: MeasurementStatus[] = ["CERTIFIED", "PARTIALLY_PAID", "PAID"];
const stamp = (r: ApiRequest) => ({
  createdBy: r.auth.userId,
  updatedBy: r.auth.userId,
});
const page = (q: Query) => ({ skip: (q.page - 1) * q.limit, take: q.limit });
const json = (x: unknown) =>
  JSON.parse(JSON.stringify(x)) as Prisma.InputJsonValue;
const canonical = (x: unknown): string =>
  x !== null && typeof x === "object"
    ? Array.isArray(x)
      ? `[${x.map(canonical).join(",")}]`
      : `{${Object.entries(x)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, value]) => `${JSON.stringify(k)}:${canonical(value)}`)
          .join(",")}}`
    : JSON.stringify(x);
@Injectable()
export class FinancialService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(ExecutionAccess) readonly access: ExecutionAccess,
  ) {}
  async scope(r: ApiRequest, p: string, roles?: string[]) {
    const a = await this.access.check(r, p);
    if (roles && !roles.includes(a.role))
      fail(403, "ACCESS_DENIED", "Sem permissão financeira");
    return a;
  }
  audit(
    tx: Tx,
    r: ApiRequest,
    scope: Scope,
    action: string,
    entityType: string,
    id: string,
    before: unknown,
    after: unknown,
  ) {
    return recordAudit(
      tx,
      r.auth,
      {
        action,
        entityType,
        entityId: id,
        projectId: scope.projectId,
        oldValues: before,
        newValues: after,
      },
      r,
    );
  }
  async transaction<T>(
    r: ApiRequest,
    scope: Scope,
    fn: (tx: Tx) => Promise<T>,
    operation?: { action: string; body: unknown },
  ) {
    const key = operation ? r.get("Idempotency-Key") : undefined;
    if (operation && (!key || key.length < 8 || key.length > 128))
      fail(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Envie Idempotency-Key com 8 a 128 caracteres",
      );
    const hash = operation
      ? createHash("sha256").update(canonical(operation)).digest("hex")
      : "";
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM projects WHERE tenant_id=${scope.tenantId}::uuid AND id=${scope.projectId}::uuid FOR UPDATE`;
        if (key) {
          const existing = await tx.financialOperation.findUnique({
            where: {
              tenantId_projectId_createdBy_key: {
                ...scope,
                createdBy: r.auth.userId,
                key,
              },
            },
          });
          if (existing) {
            if (existing.requestHash !== hash)
              fail(
                409,
                "IDEMPOTENCY_CONFLICT",
                "Chave já utilizada com outro pedido",
              );
            return existing.result as T;
          }
        }
        const result = await fn(tx);
        if (key)
          await tx.financialOperation.create({
            data: {
              ...scope,
              ...stamp(r),
              key,
              requestHash: hash,
              result: json(result),
            },
          });
        return result;
      },
      { timeout: 30000 },
    );
  }
  async measurement(tx: Tx, s: Scope, id: string) {
    return (
      (await tx.measurement.findFirst({ where: { ...s, id } })) ??
      fail(404, "MEASUREMENT_NOT_FOUND", "Medição não encontrada")
    );
  }
  async contract(tx: Tx, s: Scope, id: string) {
    return (
      (await tx.contract.findFirst({ where: { ...s, id } })) ??
      fail(404, "CONTRACT_NOT_FOUND", "Contrato não encontrado")
    );
  }
  draft(m: Measurement) {
    if (m.status !== "DRAFT")
      fail(409, "MEASUREMENT_IMMUTABLE", "Apenas rascunhos podem ser editados");
  }
  async listMeasurements(r: ApiRequest, p: string, q: Query) {
    const { scope } = await this.scope(r, p);
    const where: Prisma.MeasurementWhereInput = {
      ...scope,
      contractId: q.contract ?? undefined,
    };
    if (q.status) {
      if (
        ![
          "DRAFT",
          "SUBMITTED",
          "FISCAL_REVIEW",
          "FISCAL_REJECTED",
          "APPROVAL_REVIEW",
          ...valid,
          "CANCELLED",
        ].includes(q.status)
      )
        fail(400, "VALIDATION_ERROR", "Estado inválido");
      where.status = q.status as MeasurementStatus;
    }
    const [items, total] = await Promise.all([
      this.db.measurement.findMany({
        where,
        ...page(q),
        orderBy: { createdAt: "desc" },
      }),
      this.db.measurement.count({ where }),
    ]);
    const sums = await this.db.payment.groupBy({
      by: ["measurementId"],
      where: {
        ...scope,
        measurementId: { in: items.map((x) => x.id) },
        status: "POSTED",
      },
      _sum: { amount: true },
    });
    const contracts = await this.db.contract.findMany({
      where: { ...scope, id: { in: items.map((x) => x.contractId) } },
      select: { id: true, contractNumber: true },
    });
    return {
      items: items.map((x) => {
        const paid =
          sums.find((a) => a.measurementId === x.id)?._sum.amount?.toString() ??
          "0";
        return {
          ...x,
          contractNumber: contracts.find((c) => c.id === x.contractId)
            ?.contractNumber,
          paid: d.fixed(new Decimal(paid)),
          outstandingPayable: d.fixed(
            new Decimal(x.netCertifiedAmount.toString()).minus(paid),
          ),
        };
      }),
      total,
      page: q.page,
      limit: q.limit,
    };
  }
  async readMeasurement(r: ApiRequest, p: string, id: string) {
    const { scope } = await this.scope(r, p);
    const m = await this.measurement(this.db, scope, id);
    const contract = await this.contract(this.db, scope, m.contractId);
    const [transitions, reviews, deductions, paid] = await Promise.all([
      this.db.measurementTransition.findMany({
        where: { ...scope, measurementId: id },
        orderBy: { createdAt: "asc" },
        take: 200,
      }),
      this.db.measurementReview.findMany({
        where: { ...scope, measurementId: id },
        orderBy: { createdAt: "asc" },
        take: 200,
      }),
      this.db.measurementDeduction.findMany({
        where: { ...scope, measurementId: id },
        take: 200,
      }),
      this.db.payment.aggregate({
        where: { ...scope, measurementId: id, status: "POSTED" },
        _sum: { amount: true },
      }),
    ]);
    const actors = await this.db.user.findMany({
      where: {
        id: {
          in: [
            ...transitions.map((x) => x.createdBy),
            ...reviews.map((x) => x.reviewedBy),
          ],
        },
      },
      select: { id: true, name: true },
    });
    return {
      ...m,
      contractNumber: contract.contractNumber,
      finalApprovalRole: contract.finalApprovalRole,
      transitions: transitions.map((x) => ({
        ...x,
        actorName:
          actors.find((a) => a.id === x.createdBy)?.name ?? x.createdBy,
      })),
      reviews: reviews.map((x) => ({
        ...x,
        actorName:
          actors.find((a) => a.id === x.reviewedBy)?.name ?? x.reviewedBy,
      })),
      deductions,
      paid: paid._sum.amount?.toString() ?? "0",
      outstandingPayable: d.fixed(
        new Decimal(m.netCertifiedAmount.toString()).minus(
          paid._sum.amount?.toString() ?? 0,
        ),
      ),
    };
  }
  async saveMeasurement(
    r: ApiRequest,
    p: string,
    input: z.infer<typeof v.measurement> | z.infer<typeof v.measurementPatch>,
    id?: string,
  ) {
    const { scope } = await this.scope(r, p, ["ADMIN", "MANAGER"]);
    return this.transaction(r, scope, async (tx) => {
      if (id) {
        const old = await this.measurement(tx, scope, id);
        d.assertVersion(
          old.version,
          (input as z.infer<typeof v.measurementPatch>).version,
        );
        this.draft(old);
        const data = input as z.infer<typeof v.measurementPatch>;
        const start = data.periodStart
            ? new Date(data.periodStart)
            : old.periodStart,
          end = data.periodEnd ? new Date(data.periodEnd) : old.periodEnd;
        if (end < start) fail(400, "VALIDATION_ERROR", "Período inválido");
        const result = await tx.measurement.update({
          where: { id },
          data: {
            periodStart: start,
            periodEnd: end,
            description: data.description,
            manualAdvanceRecovery: data.manualAdvanceRecovery,
            version: { increment: 1 },
            updatedBy: r.auth.userId,
          },
        });
        await this.recalculate(tx, scope, result);
        await this.audit(
          tx,
          r,
          scope,
          "MEASUREMENT_UPDATED",
          "Measurement",
          id,
          old,
          result,
        );
        return this.measurement(tx, scope, id);
      }
      const data = input as z.infer<typeof v.measurement>;
      const c = await this.contract(tx, scope, data.contractId);
      if (c.status !== "ACTIVE")
        fail(
          409,
          "INVALID_MEASUREMENT_TRANSITION",
          "Contrato deve estar ativo",
        );
      if (data.periodEnd < data.periodStart)
        fail(400, "VALIDATION_ERROR", "Período inválido");
      const seq = await tx.contract.update({
        where: { id: c.id },
        data: { measurementSequence: { increment: 1 } },
      });
      const result = await tx.measurement.create({
        data: {
          ...scope,
          ...stamp(r),
          contractId: c.id,
          measurementNumber: seq.measurementSequence,
          code: `MED-${String(seq.measurementSequence).padStart(3, "0")}`,
          periodStart: new Date(data.periodStart),
          periodEnd: new Date(data.periodEnd),
          description: data.description,
          manualAdvanceRecovery: data.manualAdvanceRecovery,
        },
      });
      await this.ensureAdvance(tx, r, scope, c.id);
      await this.audit(
        tx,
        r,
        scope,
        "MEASUREMENT_CREATED",
        "Measurement",
        result.id,
        null,
        result,
      );
      return result;
    });
  }
  async items(r: ApiRequest, p: string, id: string, q: Query) {
    const { scope } = await this.scope(r, p);
    await this.measurement(this.db, scope, id);
    const where = { ...scope, measurementId: id };
    const [items, total] = await Promise.all([
      this.db.measurementItem.findMany({
        where,
        ...page(q),
        orderBy: { createdAt: "asc" },
      }),
      this.db.measurementItem.count({ where }),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }
  async saveItem(
    r: ApiRequest,
    p: string,
    id: string,
    input: z.infer<typeof v.item> | z.infer<typeof v.action>,
    itemId?: string,
    remove = false,
  ) {
    const { scope } = await this.scope(r, p, ["ADMIN", "MANAGER"]);
    return this.transaction(r, scope, async (tx) => {
      const m = await this.measurement(tx, scope, id);
      d.assertVersion(m.version, input.version);
      this.draft(m);
      if (
        itemId &&
        !(await tx.measurementItem.findFirst({
          where: { ...scope, id: itemId, measurementId: id },
        }))
      )
        fail(404, "RESOURCE_NOT_FOUND", "Item não encontrado");
      if (remove) await tx.measurementItem.delete({ where: { id: itemId } });
      else {
        const data = input as z.infer<typeof v.item>;
        const ci =
          (await tx.contractItem.findFirst({
            where: {
              ...scope,
              id: data.contractItemId,
              contractId: m.contractId,
              deletedAt: null,
            },
          })) ??
          fail(404, "RESOURCE_NOT_FOUND", "Item contratual não encontrado");
        const values = {
          contractItemId: ci.id,
          budgetItemId: ci.budgetItemId,
          description: ci.description,
          unit: ci.unit,
          contractQuantity: ci.quantity ?? "1",
          unitPrice: ci.unitPrice ?? ci.totalValue,
          currentQuantity: data.currentQuantity,
          previousQuantity: "0",
          cumulativeQuantity: data.currentQuantity,
          previousAmount: "0",
          currentAmount: d.fixed(
            new Decimal(data.currentQuantity).mul(
              (ci.unitPrice ?? ci.totalValue).toString(),
            ),
          ),
          cumulativeAmount: d.fixed(
            new Decimal(data.currentQuantity).mul(
              (ci.unitPrice ?? ci.totalValue).toString(),
            ),
          ),
        };
        if (
          new Decimal(data.currentQuantity).gt((ci.quantity ?? "1").toString())
        )
          fail(
            409,
            "MEASUREMENT_QUANTITY_EXCEEDS_CONTRACT",
            "Quantidade excede contrato",
          );
        if (itemId)
          await tx.measurementItem.update({
            where: { id: itemId },
            data: values,
          });
        else
          await tx.measurementItem.create({
            data: { ...scope, ...stamp(r), measurementId: id, ...values },
          });
      }
      await this.recalculate(tx, scope, m);
      const result = await tx.measurement.update({
        where: { id },
        data: { version: { increment: 1 }, updatedBy: r.auth.userId },
      });
      await this.audit(
        tx,
        r,
        scope,
        "MEASUREMENT_UPDATED",
        "Measurement",
        id,
        m,
        result,
      );
      return result;
    });
  }
  async deduction(
    r: ApiRequest,
    p: string,
    id: string,
    input: z.infer<typeof v.deduction> | z.infer<typeof v.action>,
    deductionId?: string,
  ) {
    const { scope } = await this.scope(r, p, ["ADMIN", "MANAGER"]);
    return this.transaction(r, scope, async (tx) => {
      const m = await this.measurement(tx, scope, id);
      d.assertVersion(m.version, input.version);
      this.draft(m);
      if (deductionId) {
        const found = await tx.measurementDeduction.findFirst({
          where: { ...scope, id: deductionId, measurementId: id },
        });
        if (!found) fail(404, "RESOURCE_NOT_FOUND", "Dedução não encontrada");
        await tx.measurementDeduction.delete({ where: { id: deductionId } });
      } else {
        const data = input as z.infer<typeof v.deduction>;
        if (d.amount(data.amount).lte(0))
          fail(400, "VALIDATION_ERROR", "Valor deve ser positivo");
        await tx.measurementDeduction.create({
          data: {
            ...scope,
            ...stamp(r),
            measurementId: id,
            type: data.type,
            description: data.description,
            amount: data.amount,
          },
        });
      }
      await this.recalculate(tx, scope, m);
      const result = await tx.measurement.update({
        where: { id },
        data: { version: { increment: 1 }, updatedBy: r.auth.userId },
      });
      await this.audit(
        tx,
        r,
        scope,
        "MEASUREMENT_UPDATED",
        "Measurement",
        id,
        m,
        result,
      );
      return result;
    });
  }
  async ensureAdvance(tx: Tx, r: ApiRequest, s: Scope, id: string) {
    const c = await this.contract(tx, s, id);
    if (["DRAFT", "CANCELLED"].includes(c.status)) return;
    const exists = await tx.advanceTransaction.findFirst({
      where: { ...s, contractId: id, type: "ADVANCE_GRANTED" },
    });
    if (!exists && c.advanceAmount.gt(0)) {
      const row = await tx.advanceTransaction.create({
        data: {
          ...s,
          ...stamp(r),
          contractId: id,
          type: "ADVANCE_GRANTED",
          amount: c.advanceAmount,
        },
      });
      await this.audit(
        tx,
        r,
        s,
        "ADVANCE_GRANTED",
        "AdvanceTransaction",
        row.id,
        null,
        row,
      );
    }
  }
  async balances(tx: Tx, s: Scope, id: string) {
    const [ret, adv] = await Promise.all([
      tx.retentionTransaction.groupBy({
        by: ["type"],
        where: { ...s, contractId: id },
        _sum: { amount: true },
      }),
      tx.advanceTransaction.groupBy({
        by: ["type"],
        where: { ...s, contractId: id },
        _sum: { amount: true },
      }),
    ]);
    return {
      retentionAvailable: d.ledgerBalance(
        ret.map((x) => ({
          type: x.type,
          amount: x._sum.amount?.toString() ?? "0",
        })),
        ["WITHHELD"],
      ),
      advanceOutstanding: d.ledgerBalance(
        adv.map((x) => ({
          type: x.type,
          amount: x._sum.amount?.toString() ?? "0",
        })),
        ["ADVANCE_GRANTED", "ADVANCE_REVERSED"],
      ),
    };
  }
  async recalculate(tx: Tx, s: Scope, m: Measurement) {
    const c = await this.contract(tx, s, m.contractId);
    const rows = await tx.measurementItem.findMany({
      where: { ...s, measurementId: m.id },
    });
    const ids = rows.map((x) => x.contractItemId);
    const [previous, contractItems, deductions] = await Promise.all([
      tx.$queryRaw<
        { contract_item_id: string; quantity: Decimal; amount: Decimal }[]
      >`SELECT i.contract_item_id,sum(i.current_quantity) AS quantity,sum(i.current_amount) AS amount FROM measurement_items i JOIN measurements m ON m.id=i.measurement_id AND m.tenant_id=i.tenant_id AND m.project_id=i.project_id WHERE m.tenant_id=${s.tenantId}::uuid AND m.project_id=${s.projectId}::uuid AND m.contract_id=${c.id}::uuid AND m.measurement_number<${m.measurementNumber} AND m.status::text IN ('APPROVED','CERTIFIED','PARTIALLY_PAID','PAID') GROUP BY i.contract_item_id`,
      tx.contractItem.findMany({
        where: { ...s, id: { in: ids }, contractId: c.id, deletedAt: null },
      }),
      tx.measurementDeduction.aggregate({
        where: { ...s, measurementId: m.id },
        _sum: { amount: true },
      }),
    ]);
    let gross = new Decimal(0);
    for (const row of rows) {
      const ci =
        contractItems.find((x) => x.id === row.contractItemId) ??
        fail(409, "RESOURCE_NOT_FOUND", "Item contratual indisponível");
      const prev = previous.find((x) => x.contract_item_id === ci.id);
      const values = d.measurementValues(
        prev?.quantity.toString() ?? "0",
        row.currentQuantity.toString(),
        (ci.quantity ?? "1").toString(),
        (ci.unitPrice ?? ci.totalValue).toString(),
        ci.totalValue.toString(),
        prev?.amount.toString() ?? "0",
      );
      gross = gross.plus(values.currentAmount);
      await tx.measurementItem.update({ where: { id: row.id }, data: values });
    }
    const prior = await tx.measurement.aggregate({
      where: {
        ...s,
        contractId: c.id,
        id: { not: m.id },
        status: { in: valid },
      },
      _sum: { grossAmount: true },
    });
    if (
      gross
        .plus(prior._sum.grossAmount?.toString() ?? 0)
        .gt(c.currentValue.toString())
    )
      fail(
        409,
        "MEASUREMENT_VALUE_EXCEEDS_CONTRACT",
        "Medições excedem valor contratual atual",
      );
    const balance = await this.balances(tx, s, c.id);
    const reserved = await tx.measurement.aggregate({
      where: {
        ...s,
        contractId: c.id,
        status: "APPROVED",
        measurementNumber: { lt: m.measurementNumber },
      },
      _sum: { advanceRecoveryAmount: true },
    });
    const available = Decimal.max(
      0,
      new Decimal(balance.advanceOutstanding).minus(
        reserved._sum.advanceRecoveryAmount?.toString() ?? 0,
      ),
    );
    const advance = d.recovery(
      d.fixed(gross),
      d.fixed(available),
      c.advanceRecoveryMethod,
      c.advanceRecoveryPercentage?.toString() ?? "0",
      c.advanceRecoveryFixedAmount?.toString() ?? "0",
      m.manualAdvanceRecovery.toString(),
    );
    return tx.measurement.update({
      where: { id: m.id },
      data: d.measurementTotals(
        d.fixed(gross),
        c.retentionPercentage.toString(),
        advance,
        deductions._sum.amount?.toString() ?? "0",
      ),
    });
  }
  async transition(
    r: ApiRequest,
    p: string,
    id: string,
    action: string,
    input: z.infer<typeof v.action>,
  ) {
    const roles = action.startsWith("fiscal")
      ? ["ADMIN", "INSPECTOR"]
      : action === "approve" || action === "reject"
        ? ["ADMIN", "FINANCIER", "CLIENT"]
        : action === "certify" || action === "reverse"
          ? ["ADMIN"]
          : ["ADMIN", "MANAGER"];
    const { scope, role } = await this.scope(r, p, roles);
    return this.transaction(
      r,
      scope,
      async (tx) => {
        let m = await this.measurement(tx, scope, id);
        const before = m;
        d.assertVersion(m.version, input.version);
        const c = await this.contract(tx, scope, m.contractId);
        let status: MeasurementStatus = m.status;
        const data: Prisma.MeasurementUpdateInput = {
          version: { increment: 1 },
          updatedBy: r.auth.userId,
        };
        const requireState = (states: MeasurementStatus[]) => {
          if (!states.includes(m.status))
            fail(
              409,
              action === "certify" && certified.includes(m.status)
                ? "MEASUREMENT_ALREADY_CERTIFIED"
                : "INVALID_MEASUREMENT_TRANSITION",
              "Transição de medição inválida",
            );
        };
        if (["fiscal-approve", "approve", "certify"].includes(action))
          d.independent(m.createdBy, r.auth.userId);
        if (
          ["approve", "reject"].includes(action) &&
          role !== "ADMIN" &&
          role !== c.finalApprovalRole
        )
          fail(
            403,
            "ACCESS_DENIED",
            "Aprovação final atribuída a outro perfil",
          );
        if (action === "submit") {
          requireState(["DRAFT"]);
          if (
            !(await tx.measurementItem.count({
              where: { ...scope, measurementId: id },
            }))
          )
            fail(400, "VALIDATION_ERROR", "Adicione itens");
          m = await this.recalculate(tx, scope, m);
          if (m.grossAmount.lte(0))
            fail(400, "VALIDATION_ERROR", "Medição deve ter valor positivo");
          status = "SUBMITTED";
          data.submittedBy = r.auth.userId;
          data.submittedAt = new Date();
        } else if (action === "fiscal-start") {
          requireState(["SUBMITTED"]);
          status = "FISCAL_REVIEW";
        } else if (
          action === "fiscal-approve" ||
          action === "fiscal-reject" ||
          action === "fiscal-request-changes"
        ) {
          requireState(["SUBMITTED", "FISCAL_REVIEW"]);
          if (action !== "fiscal-approve" && !input.reason)
            fail(400, "VALIDATION_ERROR", "Justificação obrigatória");
          if (m.status === "SUBMITTED")
            await tx.measurementTransition.create({
              data: {
                ...scope,
                ...stamp(r),
                measurementId: id,
                fromStatus: "SUBMITTED",
                toStatus: "FISCAL_REVIEW",
              },
            });
          status =
            action === "fiscal-approve" ? "APPROVAL_REVIEW" : "FISCAL_REJECTED";
          data.fiscalReviewedBy = r.auth.userId;
          data.fiscalReviewedAt = new Date();
          await tx.measurementReview.create({
            data: {
              ...scope,
              ...stamp(r),
              measurementId: id,
              reviewType: "FISCAL",
              decision:
                action === "fiscal-approve"
                  ? "APPROVED"
                  : action === "fiscal-reject"
                    ? "REJECTED"
                    : "REQUEST_CHANGES",
              comments: input.reason,
              reviewedBy: r.auth.userId,
              reviewedAt: new Date(),
            },
          });
        } else if (action === "reopen") {
          requireState(["FISCAL_REJECTED"]);
          status = "DRAFT";
        } else if (action === "approve" || action === "reject") {
          requireState(["APPROVAL_REVIEW"]);
          if (action === "reject" && !input.reason)
            fail(400, "VALIDATION_ERROR", "Justificação obrigatória");
          if (action === "approve") {
            if (
              await tx.measurement.count({
                where: {
                  ...scope,
                  contractId: c.id,
                  measurementNumber: { gt: m.measurementNumber },
                  status: { in: valid },
                },
              })
            )
              fail(
                409,
                "INVALID_MEASUREMENT_TRANSITION",
                "Existe medição posterior válida",
              );
            m = await this.recalculate(tx, scope, m);
            status = "APPROVED";
            data.approvedBy = r.auth.userId;
            data.approvedAt = new Date();
          } else {
            status = "DRAFT";
            data.rejectedBy = r.auth.userId;
            data.rejectedAt = new Date();
            data.rejectionReason = input.reason;
          }
          await tx.measurementReview.create({
            data: {
              ...scope,
              ...stamp(r),
              measurementId: id,
              reviewType:
                role === "CLIENT"
                  ? "CLIENT"
                  : role === "FINANCIER"
                    ? "FINANCIER"
                    : "ADMIN",
              decision: action === "approve" ? "APPROVED" : "REJECTED",
              comments: input.reason,
              reviewedBy: r.auth.userId,
              reviewedAt: new Date(),
            },
          });
        } else if (action === "certify") {
          requireState(["APPROVED"]);
          if (
            await tx.measurement.count({
              where: {
                ...scope,
                contractId: c.id,
                measurementNumber: { lt: m.measurementNumber },
                status: "APPROVED",
              },
            })
          )
            fail(
              409,
              "INVALID_MEASUREMENT_TRANSITION",
              "Certifique as medições anteriores primeiro",
            );
          const calculated = await this.recalculate(tx, scope, m);
          if (!calculated.netCertifiedAmount.eq(m.netCertifiedAmount))
            fail(
              409,
              "INVALID_MEASUREMENT_TRANSITION",
              "Cálculo alterado após aprovação",
            );
          m = calculated;
          status = "CERTIFIED";
          data.certifiedBy = r.auth.userId;
          data.certifiedAt = new Date();
          const ret = await tx.retentionTransaction.create({
            data: {
              ...scope,
              ...stamp(r),
              contractId: c.id,
              measurementId: id,
              type: "WITHHELD",
              amount: m.retentionAmount,
            },
          });
          const adv = await tx.advanceTransaction.create({
            data: {
              ...scope,
              ...stamp(r),
              contractId: c.id,
              measurementId: id,
              type: "ADVANCE_RECOVERED",
              amount: m.advanceRecoveryAmount,
            },
          });
          await tx.contract.update({
            where: { id: c.id },
            data: {
              advanceRecoveredAmount: { increment: m.advanceRecoveryAmount },
            },
          });
          await this.audit(
            tx,
            r,
            scope,
            "RETENTION_WITHHELD",
            "RetentionTransaction",
            ret.id,
            null,
            ret,
          );
          await this.audit(
            tx,
            r,
            scope,
            "ADVANCE_RECOVERED",
            "AdvanceTransaction",
            adv.id,
            null,
            adv,
          );
          const total = await tx.contract.aggregate({
            where: {
              ...scope,
              status: {
                in: ["ACTIVE", "SUSPENDED", "COMPLETED", "TERMINATED"],
              },
            },
            _sum: { currentValue: true },
          });
          await tx.financialBaseline.upsert({
            where: { tenantId_projectId: scope },
            create: {
              ...scope,
              ...stamp(r),
              amount: total._sum.currentValue ?? 0,
              source: "CONTRACT_VALUE_AT_FIRST_CERTIFICATION",
            },
            update: {},
          });
        } else if (action === "reverse") {
          requireState(certified);
          if (!input.reason)
            fail(400, "VALIDATION_ERROR", "Justificação obrigatória");
          if (
            (await tx.payment.count({
              where: { ...scope, measurementId: id, status: "POSTED" },
            })) ||
            (await tx.measurement.count({
              where: {
                ...scope,
                contractId: c.id,
                measurementNumber: { gt: m.measurementNumber },
                status: { in: valid },
              },
            })) ||
            (await tx.disbursementRequest.count({
              where: {
                ...scope,
                measurementId: id,
                status: {
                  in: ["APPROVED", "PARTIALLY_DISBURSED", "DISBURSED"],
                },
              },
            }))
          )
            fail(
              409,
              "INVALID_MEASUREMENT_TRANSITION",
              "Estorne pagamentos e dependências antes da medição",
            );
          const balance = await this.balances(tx, scope, c.id);
          if (
            new Decimal(balance.retentionAvailable).lt(
              m.retentionAmount.toString(),
            )
          )
            fail(
              409,
              "RETENTION_EXCEEDS_AVAILABLE_BALANCE",
              "Retenção já libertada",
            );
          await tx.measurementReversal.create({
            data: {
              ...scope,
              ...stamp(r),
              measurementId: id,
              reason: input.reason,
            },
          });
          await tx.retentionTransaction.create({
            data: {
              ...scope,
              ...stamp(r),
              contractId: c.id,
              measurementId: id,
              type: "REVERSED",
              amount: m.retentionAmount,
              description: input.reason,
            },
          });
          await tx.advanceTransaction.create({
            data: {
              ...scope,
              ...stamp(r),
              contractId: c.id,
              measurementId: id,
              type: "ADVANCE_REVERSED",
              amount: m.advanceRecoveryAmount,
              description: input.reason,
            },
          });
          await tx.contract.update({
            where: { id: c.id },
            data: {
              advanceRecoveredAmount: { decrement: m.advanceRecoveryAmount },
            },
          });
          status = "CANCELLED";
        } else fail(400, "INVALID_MEASUREMENT_TRANSITION", "Ação inválida");
        data.status = status;
        const result = await tx.measurement.update({ where: { id }, data });
        await tx.measurementTransition.create({
          data: {
            ...scope,
            ...stamp(r),
            measurementId: id,
            fromStatus: before.status,
            toStatus: status,
            comments: input.reason,
          },
        });
        await this.audit(
          tx,
          r,
          scope,
          `MEASUREMENT_${({ submit: "SUBMITTED", approve: "APPROVED", reject: "REJECTED", certify: "CERTIFIED", reverse: "REVERSED", "fiscal-approve": "FISCAL_APPROVED", "fiscal-reject": "FISCAL_REJECTED", "fiscal-request-changes": "FISCAL_CHANGES_REQUESTED", "fiscal-start": "FISCAL_REVIEW_STARTED", reopen: "REOPENED" } as Record<string, string>)[action] ?? action.toUpperCase().replaceAll("-", "_")}`,
          "Measurement",
          id,
          before,
          result,
        );
        return result;
      },
      ["certify", "reverse"].includes(action)
        ? { action: `measurement:${id}:${action}`, body: input }
        : undefined,
    );
  }
  async settings(
    r: ApiRequest,
    p: string,
    id: string,
    input: z.infer<typeof v.settings>,
  ) {
    const { scope } = await this.scope(r, p, ["ADMIN"]);
    return this.transaction(r, scope, async (tx) => {
      const c = await this.contract(tx, scope, id);
      d.assertVersion(c.version, input.version);
      if (
        await tx.measurement.count({
          where: {
            ...scope,
            contractId: id,
            status: { notIn: ["DRAFT", "FISCAL_REJECTED", "CANCELLED"] },
          },
        })
      )
        fail(
          409,
          "CONTRACT_IMMUTABLE",
          "Condições financeiras já em utilização",
        );
      d.percentage(input.advanceRecoveryPercentage ?? "0");
      d.amount(input.advanceRecoveryFixedAmount ?? "0");
      d.recovery(
        "100",
        "100",
        input.advanceRecoveryMethod,
        input.advanceRecoveryPercentage ?? "0",
        input.advanceRecoveryFixedAmount ?? "0",
        "0",
      );
      const result = await tx.contract.update({
        where: { id },
        data: { ...input, version: { increment: 1 }, updatedBy: r.auth.userId },
      });
      await this.ensureAdvance(tx, r, scope, id);
      await this.audit(
        tx,
        r,
        scope,
        "CONTRACT_FINANCIAL_SETTINGS_UPDATED",
        "Contract",
        id,
        c,
        result,
      );
      return result;
    });
  }
  async retention(r: ApiRequest, p: string, id: string, q: Query) {
    const { scope } = await this.scope(r, p);
    await this.contract(this.db, scope, id);
    const where = { ...scope, contractId: id };
    const [balance, transactions, advances, releases] = await Promise.all([
      this.balances(this.db, scope, id),
      this.db.retentionTransaction.findMany({
        where,
        ...page(q),
        orderBy: { createdAt: "desc" },
      }),
      this.db.advanceTransaction.findMany({
        where,
        ...page(q),
        orderBy: { createdAt: "desc" },
      }),
      this.db.retentionRelease.findMany({
        where,
        ...page(q),
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return { ...balance, transactions, advances, releases };
  }
  async createRelease(
    r: ApiRequest,
    p: string,
    id: string,
    input: z.infer<typeof v.release>,
  ) {
    const { scope } = await this.scope(r, p, ["ADMIN", "MANAGER"]);
    return this.transaction(r, scope, async (tx) => {
      await this.contract(tx, scope, id);
      const b = await this.balances(tx, scope, id);
      if (
        d.amount(input.amount).lte(0) ||
        d.amount(input.amount).gt(b.retentionAvailable)
      )
        fail(
          409,
          "RETENTION_EXCEEDS_AVAILABLE_BALANCE",
          "Libertação excede saldo disponível",
        );
      const result = await tx.retentionRelease.create({
        data: { ...scope, ...stamp(r), contractId: id, ...input },
      });
      await this.audit(
        tx,
        r,
        scope,
        "RETENTION_RELEASE_CREATED",
        "RetentionRelease",
        result.id,
        null,
        result,
      );
      return result;
    });
  }
  async releaseAction(
    r: ApiRequest,
    p: string,
    id: string,
    action: string,
    input: z.infer<typeof v.action>,
  ) {
    const { scope } = await this.scope(
      r,
      p,
      action === "submit" ? ["ADMIN", "MANAGER"] : ["ADMIN", "FINANCIER"],
    );
    return this.transaction(r, scope, async (tx) => {
      const old =
        (await tx.retentionRelease.findFirst({ where: { ...scope, id } })) ??
        fail(404, "RESOURCE_NOT_FOUND", "Libertação não encontrada");
      d.assertVersion(old.version, input.version);
      if (old.status !== (action === "submit" ? "DRAFT" : "SUBMITTED"))
        fail(409, "INVALID_MEASUREMENT_TRANSITION", "Estado inválido");
      if (action !== "submit") d.independent(old.createdBy, r.auth.userId);
      if (action === "approve") {
        const b = await this.balances(tx, scope, old.contractId);
        if (old.amount.gt(b.retentionAvailable))
          fail(
            409,
            "RETENTION_EXCEEDS_AVAILABLE_BALANCE",
            "Saldo insuficiente",
          );
        await tx.retentionTransaction.create({
          data: {
            ...scope,
            ...stamp(r),
            contractId: old.contractId,
            retentionReleaseId: id,
            type: "RELEASED",
            amount: old.amount,
            description: old.reason,
          },
        });
      }
      const result = await tx.retentionRelease.update({
        where: { id },
        data: {
          status:
            action === "submit"
              ? "SUBMITTED"
              : action === "approve"
                ? "APPROVED"
                : "REJECTED",
          approvedBy: action === "approve" ? r.auth.userId : undefined,
          approvedAt: action === "approve" ? new Date() : undefined,
          version: { increment: 1 },
          updatedBy: r.auth.userId,
        },
      });
      await this.audit(
        tx,
        r,
        scope,
        `RETENTION_RELEASE_${action === "approve" ? "APPROVED" : action === "submit" ? "SUBMITTED" : "REJECTED"}`,
        "RetentionRelease",
        id,
        old,
        result,
      );
      return result;
    });
  }

  async funding(tx: Tx, s: Scope, id: string) {
    return (
      (await tx.fundingAgreement.findFirst({ where: { ...s, id } })) ??
      fail(404, "FUNDING_AGREEMENT_NOT_FOUND", "Acordo não encontrado")
    );
  }
  async listFunding(r: ApiRequest, p: string, q: Query) {
    const { scope } = await this.scope(r, p, [
      "ADMIN",
      "MANAGER",
      "FINANCIER",
      "CLIENT",
    ]);
    const [items, total] = await Promise.all([
      this.db.fundingAgreement.findMany({
        where: scope,
        ...page(q),
        orderBy: { createdAt: "desc" },
      }),
      this.db.fundingAgreement.count({ where: scope }),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }
  async readFunding(r: ApiRequest, p: string, id: string) {
    const { scope } = await this.scope(r, p, [
      "ADMIN",
      "MANAGER",
      "FINANCIER",
      "CLIENT",
    ]);
    const agreement = await this.funding(this.db, scope, id);
    const paid = await this.db.disbursement.aggregate({
      where: { ...scope, fundingAgreementId: id, status: "POSTED" },
      _sum: { amount: true },
    });
    return {
      ...agreement,
      disbursed: paid._sum.amount?.toString() ?? "0",
      fundingBalance: d.fixed(
        new Decimal(agreement.approvedAmount.toString()).minus(
          paid._sum.amount?.toString() ?? 0,
        ),
      ),
    };
  }
  async saveFunding(
    r: ApiRequest,
    p: string,
    input: z.infer<typeof v.funding> | z.infer<typeof v.fundingPatch>,
    id?: string,
  ) {
    const { scope } = await this.scope(r, p, ["ADMIN"]);
    return this.transaction(r, scope, async (tx) => {
      const old = id ? await this.funding(tx, scope, id) : null;
      const data = { ...old, ...input };
      if (old)
        d.assertVersion(
          old.version,
          (input as z.infer<typeof v.fundingPatch>).version,
        );
      if (
        !data.financierOrganizationId ||
        !(await tx.organization.findFirst({
          where: { tenantId: scope.tenantId, id: data.financierOrganizationId },
        }))
      )
        fail(
          404,
          "RESOURCE_NOT_FOUND",
          "Organização financiadora não encontrada",
        );
      const approved = String(data.approvedAmount);
      if (d.amount(approved).lte(0))
        fail(400, "VALIDATION_ERROR", "Financiamento deve ser positivo");
      const start = new Date(data.startDate!),
        end = data.endDate ? new Date(data.endDate) : null;
      if (end && end < start) fail(400, "VALIDATION_ERROR", "Datas inválidas");
      if (old) {
        const committed = await tx.disbursementRequest.aggregate({
          where: {
            ...scope,
            fundingAgreementId: id,
            status: { in: ["APPROVED", "PARTIALLY_DISBURSED", "DISBURSED"] },
          },
          _sum: { approvedAmount: true },
        });
        if (
          ["DRAFT", "CANCELLED"].includes(String(data.status)) &&
          new Decimal(committed._sum.approvedAmount?.toString() ?? 0).gt(0)
        )
          fail(
            409,
            "INVALID_DISBURSEMENT_TRANSITION",
            "Acordo com compromissos não pode voltar a rascunho ou ser cancelado",
          );
        if (
          new Decimal(approved).lt(
            committed._sum.approvedAmount?.toString() ?? 0,
          )
        )
          fail(
            409,
            "FUNDING_LIMIT_EXCEEDED",
            "Limite inferior aos pedidos aprovados",
          );
        if (
          old.status !== "DRAFT" &&
          data.financierOrganizationId !== old.financierOrganizationId
        )
          fail(
            409,
            "INVALID_DISBURSEMENT_TRANSITION",
            "Financiador não pode ser substituído",
          );
      }
      const values = {
        financierOrganizationId: data.financierOrganizationId,
        agreementNumber: data.agreementNumber!,
        title: data.title!,
        description: data.description,
        approvedAmount: approved,
        startDate: start,
        endDate: end,
        status: data.status,
      };
      const result = id
        ? await tx.fundingAgreement.update({
            where: { id },
            data: {
              ...values,
              version: { increment: 1 },
              updatedBy: r.auth.userId,
            },
          })
        : await tx.fundingAgreement.create({
            data: { ...scope, ...stamp(r), ...values },
          });
      await this.audit(
        tx,
        r,
        scope,
        old ? "FUNDING_AGREEMENT_UPDATED" : "FUNDING_AGREEMENT_CREATED",
        "FundingAgreement",
        result.id,
        old,
        result,
      );
      return result;
    });
  }
  async listRequests(r: ApiRequest, p: string, q: Query) {
    const { scope } = await this.scope(r, p, [
      "ADMIN",
      "MANAGER",
      "FINANCIER",
      "CLIENT",
    ]);
    const [items, total] = await Promise.all([
      this.db.disbursementRequest.findMany({
        where: scope,
        ...page(q),
        orderBy: { createdAt: "desc" },
      }),
      this.db.disbursementRequest.count({ where: scope }),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }
  async createRequest(
    r: ApiRequest,
    p: string,
    input: z.infer<typeof v.request>,
  ) {
    const { scope } = await this.scope(r, p, ["ADMIN", "MANAGER"]);
    return this.transaction(r, scope, async (tx) => {
      const agreement = await this.funding(tx, scope, input.fundingAgreementId);
      if (agreement.status !== "ACTIVE")
        fail(409, "INVALID_DISBURSEMENT_TRANSITION", "Acordo não ativo");
      if (d.amount(input.requestedAmount).lte(0))
        fail(400, "VALIDATION_ERROR", "Valor deve ser positivo");
      if (input.measurementId) {
        const m = await this.measurement(tx, scope, input.measurementId);
        if (!certified.includes(m.status))
          fail(
            409,
            "INVALID_DISBURSEMENT_TRANSITION",
            "Medição deve estar certificada",
          );
      }
      const seq = await tx.fundingAgreement.update({
        where: { id: agreement.id },
        data: { requestSequence: { increment: 1 } },
      });
      const result = await tx.disbursementRequest.create({
        data: {
          ...scope,
          ...stamp(r),
          ...input,
          requestNumber: seq.requestSequence,
          requestedBy: r.auth.userId,
          requestedAt: new Date(),
        },
      });
      await this.audit(
        tx,
        r,
        scope,
        "DISBURSEMENT_REQUEST_CREATED",
        "DisbursementRequest",
        result.id,
        null,
        result,
      );
      return result;
    });
  }
  async requestAction(
    r: ApiRequest,
    p: string,
    id: string,
    action: string,
    input: z.infer<typeof v.approveRequest>,
  ) {
    const { scope } = await this.scope(
      r,
      p,
      action === "submit" ? ["ADMIN", "MANAGER"] : ["ADMIN", "FINANCIER"],
    );
    return this.transaction(r, scope, async (tx) => {
      const old =
        (await tx.disbursementRequest.findFirst({ where: { ...scope, id } })) ??
        fail(404, "DISBURSEMENT_REQUEST_NOT_FOUND", "Pedido não encontrado");
      d.assertVersion(old.version, input.version);
      if (old.status !== (action === "submit" ? "DRAFT" : "SUBMITTED"))
        fail(409, "INVALID_DISBURSEMENT_TRANSITION", "Estado inválido");
      const agreement = await this.funding(tx, scope, old.fundingAgreementId);
      if (agreement.status !== "ACTIVE")
        fail(409, "INVALID_DISBURSEMENT_TRANSITION", "Acordo não ativo");
      let approved: string | undefined;
      if (action !== "submit") d.independent(old.createdBy, r.auth.userId);
      if (action === "approve") {
        approved = input.approvedAmount ?? old.requestedAmount.toString();
        if (
          d.amount(approved).lte(0) ||
          d.amount(approved).gt(old.requestedAmount.toString())
        )
          fail(400, "VALIDATION_ERROR", "Valor aprovado inválido");
        const committed = await tx.disbursementRequest.aggregate({
          where: {
            ...scope,
            fundingAgreementId: agreement.id,
            status: { in: ["APPROVED", "PARTIALLY_DISBURSED", "DISBURSED"] },
          },
          _sum: { approvedAmount: true },
        });
        if (
          new Decimal(approved)
            .plus(committed._sum.approvedAmount?.toString() ?? 0)
            .gt(agreement.approvedAmount.toString())
        )
          fail(
            409,
            "FUNDING_LIMIT_EXCEEDED",
            "Pedidos excedem limite financiado",
          );
      }
      if (action === "reject" && !input.reason)
        fail(400, "VALIDATION_ERROR", "Justificação obrigatória");
      const result = await tx.disbursementRequest.update({
        where: { id },
        data: {
          status:
            action === "submit"
              ? "SUBMITTED"
              : action === "approve"
                ? "APPROVED"
                : "REJECTED",
          approvedAmount: approved,
          approvedBy: action === "approve" ? r.auth.userId : undefined,
          approvedAt: action === "approve" ? new Date() : undefined,
          rejectedBy: action === "reject" ? r.auth.userId : undefined,
          rejectedAt: action === "reject" ? new Date() : undefined,
          rejectionReason: action === "reject" ? input.reason : undefined,
          version: { increment: 1 },
          updatedBy: r.auth.userId,
        },
      });
      await this.audit(
        tx,
        r,
        scope,
        `DISBURSEMENT_REQUEST_${action === "submit" ? "SUBMITTED" : action === "approve" ? "APPROVED" : "REJECTED"}`,
        "DisbursementRequest",
        id,
        old,
        result,
      );
      return result;
    });
  }
  async postDisbursement(
    r: ApiRequest,
    p: string,
    id: string,
    input: z.infer<typeof v.disbursement>,
  ) {
    const { scope } = await this.scope(r, p, ["ADMIN", "FINANCIER"]);
    return this.transaction(
      r,
      scope,
      async (tx) => {
        const request =
          (await tx.disbursementRequest.findFirst({
            where: { ...scope, id },
          })) ??
          fail(404, "DISBURSEMENT_REQUEST_NOT_FOUND", "Pedido não encontrado");
        d.assertVersion(request.version, input.version);
        if (!["APPROVED", "PARTIALLY_DISBURSED"].includes(request.status))
          fail(409, "INVALID_DISBURSEMENT_TRANSITION", "Pedido não aprovado");
        const agreement = await this.funding(
          tx,
          scope,
          request.fundingAgreementId,
        );
        if (agreement.status !== "ACTIVE")
          fail(409, "INVALID_DISBURSEMENT_TRANSITION", "Acordo não ativo");
        const amount = d.amount(input.amount),
          total = amount.plus(request.disbursedAmount.toString());
        if (amount.lte(0) || total.gt(request.approvedAmount!.toString()))
          fail(
            409,
            "FUNDING_LIMIT_EXCEEDED",
            "Desembolso excede pedido aprovado",
          );
        const result = await tx.disbursement.create({
          data: {
            ...scope,
            ...stamp(r),
            fundingAgreementId: agreement.id,
            disbursementRequestId: id,
            amount: input.amount,
            disbursementDate: new Date(input.disbursementDate),
            reference: input.reference,
            notes: input.notes,
          },
        });
        await tx.disbursementRequest.update({
          where: { id },
          data: {
            disbursedAmount: d.fixed(total),
            status: total.eq(request.approvedAmount!.toString())
              ? "DISBURSED"
              : "PARTIALLY_DISBURSED",
            version: { increment: 1 },
            updatedBy: r.auth.userId,
          },
        });
        await this.audit(
          tx,
          r,
          scope,
          "DISBURSEMENT_POSTED",
          "Disbursement",
          result.id,
          null,
          result,
        );
        return result;
      },
      { action: `disbursement:${id}`, body: input },
    );
  }
  async reverseDisbursement(
    r: ApiRequest,
    p: string,
    id: string,
    input: z.infer<typeof v.action>,
  ) {
    const { scope } = await this.scope(r, p, ["ADMIN"]);
    return this.transaction(
      r,
      scope,
      async (tx) => {
        const old =
          (await tx.disbursement.findFirst({ where: { ...scope, id } })) ??
          fail(404, "RESOURCE_NOT_FOUND", "Desembolso não encontrado");
        d.assertVersion(old.version, input.version);
        if (old.status !== "POSTED")
          fail(
            409,
            "INVALID_DISBURSEMENT_TRANSITION",
            "Desembolso já estornado",
          );
        if (!input.reason)
          fail(400, "VALIDATION_ERROR", "Justificação obrigatória");
        const result = await tx.disbursement.update({
          where: { id },
          data: {
            status: "REVERSED",
            reversalReason: input.reason,
            version: { increment: 1 },
            updatedBy: r.auth.userId,
          },
        });
        const request = await tx.disbursementRequest.findFirstOrThrow({
          where: { ...scope, id: old.disbursementRequestId },
        });
        const total = new Decimal(request.disbursedAmount.toString()).minus(
          old.amount.toString(),
        );
        await tx.disbursementRequest.update({
          where: { id: request.id },
          data: {
            disbursedAmount: d.fixed(total),
            status: total.eq(0) ? "APPROVED" : "PARTIALLY_DISBURSED",
            version: { increment: 1 },
            updatedBy: r.auth.userId,
          },
        });
        await this.audit(
          tx,
          r,
          scope,
          "DISBURSEMENT_REVERSED",
          "Disbursement",
          id,
          old,
          result,
        );
        return result;
      },
      { action: `disbursement:${id}:reverse`, body: input },
    );
  }
  async listPayments(r: ApiRequest, p: string, q: Query) {
    const { scope } = await this.scope(r, p, [
      "ADMIN",
      "MANAGER",
      "FINANCIER",
      "CLIENT",
    ]);
    const where: Prisma.PaymentWhereInput = {
      ...scope,
      supplierId: q.supplier ?? undefined,
      contractId: q.contract ?? undefined,
    };
    const [items, total] = await Promise.all([
      this.db.payment.findMany({
        where,
        ...page(q),
        orderBy: { paymentDate: "desc" },
      }),
      this.db.payment.count({ where }),
    ]);
    const [suppliers, measurements, expenses] = await Promise.all([
      this.db.supplier.findMany({
        where: {
          tenantId: scope.tenantId,
          id: { in: items.map((x) => x.supplierId) },
        },
        select: { id: true, legalName: true },
      }),
      this.db.measurement.findMany({
        where: {
          ...scope,
          id: {
            in: items.flatMap((x) =>
              x.measurementId ? [x.measurementId] : [],
            ),
          },
        },
        select: { id: true, code: true },
      }),
      this.db.expense.findMany({
        where: {
          ...scope,
          id: { in: items.flatMap((x) => (x.expenseId ? [x.expenseId] : [])) },
        },
        select: { id: true, expenseNumber: true },
      }),
    ]);
    return {
      items: items.map((x) => ({
        ...x,
        supplierName: suppliers.find((a) => a.id === x.supplierId)?.legalName,
        measurementCode: measurements.find((a) => a.id === x.measurementId)
          ?.code,
        expenseNumber: expenses.find((a) => a.id === x.expenseId)
          ?.expenseNumber,
      })),
      total,
      page: q.page,
      limit: q.limit,
    };
  }
  async readPayment(r: ApiRequest, p: string, id: string) {
    const { scope } = await this.scope(r, p, [
      "ADMIN",
      "MANAGER",
      "FINANCIER",
      "CLIENT",
    ]);
    return (
      (await this.db.payment.findFirst({ where: { ...scope, id } })) ??
      fail(404, "PAYMENT_NOT_FOUND", "Pagamento não encontrado")
    );
  }
  async paymentStatus(
    tx: Tx,
    r: ApiRequest,
    s: Scope,
    measurementId?: string | null,
    releaseId?: string | null,
  ) {
    if (measurementId) {
      const m = await this.measurement(tx, s, measurementId);
      const sum = await tx.payment.aggregate({
        where: { ...s, measurementId, status: "POSTED" },
        _sum: { amount: true },
      });
      const status = d.paymentState(
        m.netCertifiedAmount.toString(),
        sum._sum.amount?.toString() ?? "0",
      );
      await tx.measurement.update({
        where: { id: measurementId },
        data: { status, version: { increment: 1 }, updatedBy: r.auth.userId },
      });
      if (status !== m.status)
        await tx.measurementTransition.create({
          data: {
            ...s,
            ...stamp(r),
            measurementId,
            fromStatus: m.status,
            toStatus: status,
            comments: "Saldo de pagamentos atualizado",
          },
        });
    }
    if (releaseId) {
      const release = await tx.retentionRelease.findFirstOrThrow({
        where: { ...s, id: releaseId },
      });
      const sum = await tx.payment.aggregate({
        where: { ...s, retentionReleaseId: releaseId, status: "POSTED" },
        _sum: { amount: true },
      });
      await tx.retentionRelease.update({
        where: { id: releaseId },
        data: {
          status: release.amount.eq(sum._sum.amount ?? 0) ? "PAID" : "APPROVED",
          version: { increment: 1 },
          updatedBy: r.auth.userId,
        },
      });
    }
  }
  async postPayment(
    r: ApiRequest,
    p: string,
    input: z.infer<typeof v.payment>,
  ) {
    const { scope } = await this.scope(r, p, ["ADMIN"]);
    return this.transaction(
      r,
      scope,
      async (tx) => {
        if (
          [
            input.measurementId,
            input.expenseId,
            input.retentionReleaseId,
          ].filter(Boolean).length !== 1
        )
          fail(400, "INVALID_PAYMENT_SOURCE", "Escolha exatamente uma origem");
        let net = "0",
          supplierId: string | null = null,
          contractId: string | null = null;
        const source: Prisma.PaymentWhereInput = {};
        if (input.measurementId) {
          const m = await this.measurement(tx, scope, input.measurementId);
          if (!certified.includes(m.status))
            fail(409, "INVALID_PAYMENT_SOURCE", "Medição não certificada");
          const c = await this.contract(tx, scope, m.contractId);
          supplierId = c.supplierId;
          contractId = c.id;
          net = m.netCertifiedAmount.toString();
          source.measurementId = m.id;
        } else if (input.expenseId) {
          await tx.$queryRaw`SELECT id FROM expenses WHERE tenant_id=${scope.tenantId}::uuid AND project_id=${scope.projectId}::uuid AND id=${input.expenseId}::uuid FOR UPDATE`;
          const e =
            (await tx.expense.findFirst({
              where: { ...scope, id: input.expenseId },
            })) ?? fail(404, "RESOURCE_NOT_FOUND", "Despesa não encontrada");
          if (e.status !== "APPROVED" || !e.supplierId)
            fail(
              409,
              "INVALID_PAYMENT_SOURCE",
              "Despesa deve estar aprovada e possuir fornecedor",
            );
          supplierId = e.supplierId;
          contractId = e.contractId;
          net = e.totalAmount.toString();
          source.expenseId = e.id;
        } else {
          const release =
            (await tx.retentionRelease.findFirst({
              where: { ...scope, id: input.retentionReleaseId! },
            })) ?? fail(404, "RESOURCE_NOT_FOUND", "Libertação não encontrada");
          if (!["APPROVED", "PAID"].includes(release.status))
            fail(409, "INVALID_PAYMENT_SOURCE", "Libertação não aprovada");
          const c = await this.contract(tx, scope, release.contractId);
          supplierId = c.supplierId;
          contractId = c.id;
          net = release.amount.toString();
          source.retentionReleaseId = release.id;
        }
        if (
          input.supplierId !== supplierId ||
          (input.contractId && input.contractId !== contractId)
        )
          fail(
            400,
            "INVALID_PAYMENT_SOURCE",
            "Fornecedor ou contrato não corresponde à origem",
          );
        const paid = await tx.payment.aggregate({
          where: { ...scope, ...source, status: "POSTED" },
          _sum: { amount: true },
        });
        const amount = d.amount(input.amount);
        if (
          amount.lte(0) ||
          amount.plus(paid._sum.amount?.toString() ?? 0).gt(net)
        )
          fail(409, "PAYMENT_EXCEEDS_OUTSTANDING", "Pagamento excede saldo");
        const seq = await tx.payment.aggregate({
          where: scope,
          _max: { paymentNumber: true },
        });
        const result = await tx.payment.create({
          data: {
            ...scope,
            ...stamp(r),
            ...input,
            contractId,
            supplierId: supplierId!,
            paymentNumber: (seq._max.paymentNumber ?? 0) + 1,
            paymentDate: new Date(input.paymentDate),
          },
        });
        await this.paymentStatus(
          tx,
          r,
          scope,
          input.measurementId,
          input.retentionReleaseId,
        );
        await this.audit(
          tx,
          r,
          scope,
          "PAYMENT_POSTED",
          "Payment",
          result.id,
          null,
          result,
        );
        return result;
      },
      { action: "payment:create", body: input },
    );
  }
  async reversePayment(
    r: ApiRequest,
    p: string,
    id: string,
    input: z.infer<typeof v.action>,
  ) {
    const { scope } = await this.scope(r, p, ["ADMIN"]);
    return this.transaction(
      r,
      scope,
      async (tx) => {
        const old =
          (await tx.payment.findFirst({ where: { ...scope, id } })) ??
          fail(404, "PAYMENT_NOT_FOUND", "Pagamento não encontrado");
        d.assertVersion(old.version, input.version);
        if (old.status === "REVERSED")
          fail(409, "PAYMENT_ALREADY_REVERSED", "Pagamento já estornado");
        if (!input.reason)
          fail(400, "VALIDATION_ERROR", "Justificação obrigatória");
        await tx.paymentReversal.create({
          data: { ...scope, ...stamp(r), paymentId: id, reason: input.reason },
        });
        const result = await tx.payment.update({
          where: { id },
          data: {
            status: "REVERSED",
            version: { increment: 1 },
            updatedBy: r.auth.userId,
          },
        });
        await this.paymentStatus(
          tx,
          r,
          scope,
          old.measurementId,
          old.retentionReleaseId,
        );
        await this.audit(
          tx,
          r,
          scope,
          "PAYMENT_REVERSED",
          "Payment",
          id,
          old,
          result,
        );
        return result;
      },
      { action: `payment:${id}:reverse`, body: input },
    );
  }

  async summary(r: ApiRequest, p: string) {
    const { scope } = await this.scope(r, p, [
      "ADMIN",
      "MANAGER",
      "FINANCIER",
      "CLIENT",
    ]);
    return this.db.$transaction(
      async (tx) => {
        const revision = await tx.budgetRevision.findFirst({
          where: { ...scope, status: "APPROVED" },
          orderBy: { revisionNumber: "desc" },
        });
        const budget = revision
          ? await tx.budgetRevisionValue.aggregate({
              where: {
                tenantId: scope.tenantId,
                budgetRevisionId: revision.id,
                itemType: "ITEM",
                isActive: true,
              },
              _sum: { totalValue: true },
            })
          : null;
        const [
          contracts,
          measured,
          cert,
          paid,
          funding,
          disbursed,
          ret,
          adv,
          physical,
        ] = await Promise.all([
          tx.contract.aggregate({
            where: {
              ...scope,
              status: {
                in: ["ACTIVE", "SUSPENDED", "COMPLETED", "TERMINATED"],
              },
            },
            _sum: { currentValue: true },
          }),
          tx.measurement.aggregate({
            where: { ...scope, status: { in: valid } },
            _sum: { grossAmount: true },
          }),
          tx.measurement.aggregate({
            where: { ...scope, status: { in: certified } },
            _sum: { grossAmount: true, netCertifiedAmount: true },
          }),
          tx.payment.aggregate({
            where: { ...scope, status: "POSTED", measurementId: { not: null } },
            _sum: { amount: true },
          }),
          tx.fundingAgreement.aggregate({
            where: {
              ...scope,
              status: { in: ["ACTIVE", "SUSPENDED", "CLOSED"] },
            },
            _sum: { approvedAmount: true },
          }),
          tx.disbursement.aggregate({
            where: { ...scope, status: "POSTED" },
            _sum: { amount: true },
          }),
          tx.retentionTransaction.groupBy({
            by: ["type"],
            where: scope,
            _sum: { amount: true },
          }),
          tx.advanceTransaction.groupBy({
            by: ["type"],
            where: scope,
            _sum: { amount: true },
          }),
          tx.projectProgressSnapshot.findFirst({
            where: scope,
            orderBy: { snapshotDate: "desc" },
          }),
        ]);
        const money = (x: unknown) => d.fixed(new Decimal(String(x ?? 0)));
        const current = money(contracts._sum.currentValue),
          gross = money(measured._sum.grossAmount),
          certifiedAmount = money(cert._sum.grossAmount),
          net = money(cert._sum.netCertifiedAmount),
          paidAmount = money(paid._sum.amount),
          fundingAmount = money(funding._sum.approvedAmount),
          disbursedAmount = money(disbursed._sum.amount);
        const percent = (value: string) =>
          new Decimal(current).eq(0)
            ? "0.00"
            : new Decimal(value).div(current).mul(100).toFixed(2);
        const financialProgress = percent(certifiedAmount);
        return {
          currency: "MZN",
          approvedBudget: money(budget?._sum.totalValue),
          currentContractValue: current,
          grossMeasured: gross,
          certified: certifiedAmount,
          retentionWithheld: d.ledgerBalance(
            ret
              .filter((x) => x.type !== "RELEASED")
              .map((x) => ({
                type: x.type,
                amount: String(x._sum.amount ?? 0),
              })),
            ["WITHHELD"],
          ),
          retentionAvailable: d.ledgerBalance(
            ret.map((x) => ({
              type: x.type,
              amount: String(x._sum.amount ?? 0),
            })),
            ["WITHHELD"],
          ),
          advanceOutstanding: d.ledgerBalance(
            adv.map((x) => ({
              type: x.type,
              amount: String(x._sum.amount ?? 0),
            })),
            ["ADVANCE_GRANTED", "ADVANCE_REVERSED"],
          ),
          netCertified: net,
          paid: paidAmount,
          outstandingPayable: d.fixed(new Decimal(net).minus(paidAmount)),
          approvedFunding: fundingAmount,
          disbursed: disbursedAmount,
          fundingBalance: d.fixed(
            new Decimal(fundingAmount).minus(disbursedAmount),
          ),
          financialProgress,
          measurementProgress: percent(gross),
          physicalProgress: physical?.actualProgress.toString() ?? "0",
          physicalFinancialVariance: new Decimal(
            physical?.actualProgress.toString() ?? 0,
          )
            .minus(financialProgress)
            .toFixed(2),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async curve(r: ApiRequest, p: string) {
    const { scope } = await this.scope(r, p, [
      "ADMIN",
      "MANAGER",
      "FINANCIER",
      "CLIENT",
    ]);
    const [baseline, physical, events] = await Promise.all([
      this.db.financialBaseline.findUnique({
        where: { tenantId_projectId: scope },
      }),
      this.db.projectProgressSnapshot.findMany({
        where: scope,
        orderBy: { snapshotDate: "asc" },
      }),
      this.db.$queryRaw<
        { day: Date; amount: Decimal }[]
      >`SELECT day,sum(amount) AS amount FROM (SELECT certified_at::date AS day,gross_amount AS amount FROM measurements WHERE tenant_id=${scope.tenantId}::uuid AND project_id=${p}::uuid AND certified_at IS NOT NULL UNION ALL SELECT r.created_at::date AS day,-m.gross_amount AS amount FROM measurement_reversals r JOIN measurements m ON m.id=r.measurement_id AND m.tenant_id=r.tenant_id AND m.project_id=r.project_id WHERE r.tenant_id=${scope.tenantId}::uuid AND r.project_id=${p}::uuid) events GROUP BY day ORDER BY day`,
    ]);
    const days = [
      ...new Set([
        ...physical.map((x) => x.snapshotDate.toISOString().slice(0, 10)),
        ...events.map((x) => x.day.toISOString().slice(0, 10)),
      ]),
    ].sort();
    let planned = "0",
      actual = "0",
      certifiedAmount = new Decimal(0);
    const denominator = new Decimal(baseline?.amount.toString() ?? 0);
    return {
      baselineAmount: denominator.toFixed(2),
      baselineSource: baseline?.source ?? null,
      plannedFinancialAssumption:
        "Proporcional ao progresso físico planeado da baseline M3",
      items: days.map((date) => {
        const snapshot = physical.find((x) =>
          x.snapshotDate.toISOString().startsWith(date),
        );
        if (snapshot) {
          planned = snapshot.plannedProgress.toString();
          actual = snapshot.actualProgress.toString();
        }
        for (const event of events.filter((x) =>
          x.day.toISOString().startsWith(date),
        ))
          certifiedAmount = certifiedAmount.plus(event.amount.toString());
        return {
          date,
          planned_physical: planned,
          actual_physical: actual,
          planned_financial: planned,
          actual_financial: denominator.eq(0)
            ? "0.00"
            : certifiedAmount.div(denominator).mul(100).toFixed(2),
          certifiedCumulative: certifiedAmount.toFixed(2),
        };
      }),
    };
  }
}
