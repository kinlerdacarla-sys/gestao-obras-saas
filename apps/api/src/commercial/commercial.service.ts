import { Inject, Injectable } from "@nestjs/common";
import { Decimal } from "decimal.js";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import { Database, fail } from "../platform.js";
import type { ApiRequest } from "../auth/security.js";
import { ExecutionAccess } from "../schedule/access.js";
import { validBudgetItem } from "../schedule/schedule.service.js";
import { recordAudit } from "../audit/audit.module.js";
import * as v from "../../../../packages/validation/src/commercial.js";
import * as d from "../../../../packages/domain/src/commercial.js";
type Tx = Prisma.TransactionClient;
type Scope = { tenantId: string; projectId: string };
type Query = z.infer<typeof v.pageInput>;
const dates = (s?: string | null) => (s ? new Date(s) : null);
const stamp = (r: ApiRequest) => ({
  createdBy: r.auth.userId,
  updatedBy: r.auth.userId,
});
const paging = (q: Query) => ({ skip: (q.page - 1) * q.limit, take: q.limit });
const enumFilter = <const T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined =>
  value === undefined
    ? undefined
    : allowed.includes(value as T)
      ? (value as T)
      : fail(400, "VALIDATION_ERROR", "Filtro inválido");
@Injectable()
export class CommercialService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(ExecutionAccess) readonly access: ExecutionAccess,
  ) {}
  admin(r: ApiRequest) {
    this.access.admin(r);
  }
  async scope(
    r: ApiRequest,
    p: string,
    mode: "read" | "write" | "expense" | "expenseWrite" | "cost" = "read",
  ) {
    const a = await this.access.check(
      r,
      p,
      mode === "write" || mode === "expenseWrite",
    );
    if (
      a.role === "CLIENT" ||
      ((mode === "expense" || mode === "expenseWrite") &&
        !["ADMIN", "MANAGER"].includes(a.role)) ||
      (mode === "cost" && a.role === "INSPECTOR")
    )
      fail(403, "ACCESS_DENIED", "Sem permissão comercial");
    return a.scope;
  }
  audit(
    tx: Tx,
    r: ApiRequest,
    action: string,
    entityType: string,
    id: string,
    p: string | undefined,
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
        projectId: p,
        oldValues: before,
        newValues: after,
      },
      r,
    );
  }
  async supplier(r: ApiRequest, id: string, tx: Tx = this.db) {
    return (
      (await tx.supplier.findFirst({
        where: { tenantId: r.auth.tenantId, id },
      })) ?? fail(404, "SUPPLIER_NOT_FOUND", "Fornecedor não encontrado")
    );
  }
  async suppliers(r: ApiRequest, q: Query) {
    if (!["ADMIN", "MANAGER"].includes(r.auth.role))
      fail(403, "ACCESS_DENIED", "Sem acesso ao cadastro comercial");
    const where: Prisma.SupplierWhereInput = {
      tenantId: r.auth.tenantId,
      supplierType: enumFilter(q.type, [
        "SUPPLIER",
        "SUBCONTRACTOR",
        "CONSULTANT",
        "SERVICE_PROVIDER",
        "OTHER",
      ]),
      status: enumFilter(q.status, ["ACTIVE", "INACTIVE", "BLOCKED"]),
      ...(q.search
        ? {
            OR: [
              { legalName: { contains: q.search, mode: "insensitive" } },
              { taxNumber: { contains: q.search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.supplier.findMany({
        where,
        ...paging(q),
        orderBy: { legalName: "asc" },
      }),
      this.db.supplier.count({ where }),
    ]);
    const allowedProjects =
      r.auth.role === "ADMIN"
        ? undefined
        : (
            await this.db.projectUser.findMany({
              where: {
                tenantId: r.auth.tenantId,
                userId: r.auth.userId,
                status: "ACTIVE",
              },
              select: { projectId: true },
            })
          ).map((x) => x.projectId);
    const counts = await this.db.contract.groupBy({
      by: ["supplierId"],
      where: {
        tenantId: r.auth.tenantId,
        supplierId: { in: items.map((x) => x.id) },
        ...(allowedProjects ? { projectId: { in: allowedProjects } } : {}),
      },
      _count: { id: true },
    });
    return {
      items: items.map((x) => ({
        ...x,
        contractCount:
          counts.find((c) => c.supplierId === x.id)?._count.id ?? 0,
      })),
      total,
      page: q.page,
      limit: q.limit,
    };
  }
  async saveSupplier(
    r: ApiRequest,
    input: z.infer<typeof v.supplierInput> | z.infer<typeof v.supplierPatch>,
    id?: string,
    deactivate = false,
  ) {
    this.admin(r);
    return this.db.$transaction(async (tx) => {
      const before = id ? await this.supplier(r, id, tx) : null;
      if (before)
        d.assertVersion(
          before.version,
          (input as z.infer<typeof v.supplierPatch>).version,
        );
      const { version: _v, ...raw } = input as z.infer<typeof v.supplierPatch>;
      void _v;
      const data = { ...raw };
      if (data.organizationId) {
        const org = await tx.organization.findFirst({
          where: { tenantId: r.auth.tenantId, id: data.organizationId },
        });
        if (!org) fail(404, "RESOURCE_NOT_FOUND", "Organização não encontrada");
        data.legalName = org.legalName;
        data.taxNumber = org.taxNumber;
      } else if (data.taxNumber) {
        const org = await tx.organization.findFirst({
          where: { tenantId: r.auth.tenantId, taxNumber: data.taxNumber },
        });
        if (org) {
          data.organizationId = org.id;
          data.legalName = org.legalName;
        }
      }
      if (
        !data.organizationId &&
        !before?.organizationId &&
        !data.taxNumber &&
        data.legalName
      ) {
        const org = await tx.organization.findFirst({
          where: {
            tenantId: r.auth.tenantId,
            legalName: { equals: data.legalName, mode: "insensitive" },
          },
        });
        if (org) {
          data.organizationId = org.id;
          data.legalName = org.legalName;
          data.taxNumber = org.taxNumber;
        }
      }
      let result;
      if (before) {
        const c = await tx.supplier.updateMany({
          where: { tenantId: r.auth.tenantId, id, version: before.version },
          data: {
            ...data,
            version: { increment: 1 },
            updatedBy: r.auth.userId,
          },
        });
        if (c.count !== 1) d.assertVersion(-1, 0);
        result = await this.supplier(r, id!, tx);
      } else
        result = await tx.supplier.create({
          data: {
            ...(data as z.infer<typeof v.supplierInput>),
            tenantId: r.auth.tenantId,
            ...stamp(r),
          },
        });
      await this.audit(
        tx,
        r,
        deactivate
          ? "SUPPLIER_DEACTIVATED"
          : before
            ? "SUPPLIER_UPDATED"
            : "SUPPLIER_CREATED",
        "Supplier",
        result.id,
        undefined,
        before,
        result,
      );
      return result;
    });
  }
  async contract(tx: Tx, s: Scope, id: string, lock = false) {
    if (lock)
      await tx.$queryRaw`SELECT id FROM contracts WHERE tenant_id=${s.tenantId}::uuid AND project_id=${s.projectId}::uuid AND id=${id}::uuid FOR UPDATE`;
    return (
      (await tx.contract.findFirst({ where: { ...s, id } })) ??
      fail(404, "CONTRACT_NOT_FOUND", "Contrato não encontrado")
    );
  }
  async contracts(r: ApiRequest, p: string, q: Query) {
    const s = await this.scope(r, p);
    const where: Prisma.ContractWhereInput = {
      ...s,
      status: enumFilter(q.status, [
        "DRAFT",
        "ACTIVE",
        "SUSPENDED",
        "COMPLETED",
        "TERMINATED",
        "CANCELLED",
      ]),
      supplierId: q.supplier ?? undefined,
      ...(q.search
        ? {
            OR: [
              { title: { contains: q.search, mode: "insensitive" } },
              { contractNumber: { contains: q.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.contract.findMany({
        where,
        ...paging(q),
        orderBy: { createdAt: "desc" },
      }),
      this.db.contract.count({ where }),
    ]);
    const suppliers = await this.db.supplier.findMany({
      where: {
        tenantId: s.tenantId,
        id: { in: items.map((x) => x.supplierId) },
      },
      select: { id: true, legalName: true },
    });
    return {
      items: items.map((x) => ({
        ...x,
        supplierName: suppliers.find((a) => a.id === x.supplierId)?.legalName,
      })),
      total,
      page: q.page,
      limit: q.limit,
    };
  }
  async readContract(r: ApiRequest, p: string, id: string) {
    const s = await this.scope(r, p),
      c = await this.contract(this.db, s, id);
    const changes = await this.db.contractAmendment.groupBy({
      by: ["amendmentType"],
      where: { ...s, contractId: id, status: "APPROVED" },
      _sum: { amount: true },
    });
    const sum = (type: string) =>
      d.fixed(
        new Decimal(
          changes.find((x) => x.amendmentType === type)?._sum.amount ?? 0,
        ),
      );
    return {
      approvedAdditions: sum("ADDITION"),
      approvedOmissions: sum("OMISSION"),
      ...c,
      advanceOutstandingAmount: d.fixed(
        new Decimal(c.advanceAmount).minus(c.advanceRecoveredAmount),
      ),
      supplierName: (await this.supplier(r, c.supplierId)).legalName,
    };
  }
  async saveContract(
    r: ApiRequest,
    p: string,
    input: z.infer<typeof v.contractInput> | z.infer<typeof v.contractPatch>,
    id?: string,
  ) {
    const s = await this.scope(r, p, "write");
    return this.db.$transaction(async (tx) => {
      const before = id ? await this.contract(tx, s, id, true) : null;
      if (before) {
        d.assertVersion(
          before.version,
          (input as z.infer<typeof v.contractPatch>).version,
        );
        d.editable(before.status, "CONTRACT");
      }
      const { version: _v, ...data } = input as z.infer<
        typeof v.contractPatch
      > & { originalValue?: string };
      void _v;
      const supplier = await this.supplier(
        r,
        data.supplierId ?? before!.supplierId,
        tx,
      );
      if (supplier.status !== "ACTIVE")
        fail(409, "SUPPLIER_INACTIVE", "Fornecedor deve estar ativo");
      const original = before?.originalValue.toString() ?? data.originalValue!;
      d.amount(original);
      const retention =
        data.retentionPercentage ??
        before?.retentionPercentage.toString() ??
        "0";
      d.percentage(retention);
      const percent =
        data.advancePercentage ?? before?.advancePercentage.toString() ?? "0";
      const advance = d.calculateAdvance(
        original,
        percent,
        data.advanceAmount ??
          (Number(percent) > 0
            ? "0"
            : (before?.advanceAmount.toString() ?? "0")),
      );
      const start =
          data.startDate === undefined
            ? before?.startDate
            : dates(data.startDate),
        end =
          data.endDate === undefined ? before?.endDate : dates(data.endDate);
      if (start && end && start > end)
        fail(400, "VALIDATION_ERROR", "Prazo inválido");
      const common = {
        ...data,
        startDate: start,
        endDate: end,
        retentionPercentage: retention,
        advancePercentage: percent,
        advanceAmount: advance,
        updatedBy: r.auth.userId,
      };
      const result = before
        ? await tx.contract.update({
            where: { ...s, id: before.id },
            data: { ...common, version: { increment: 1 } },
          })
        : await tx.contract.create({
            data: {
              ...(common as Omit<
                z.infer<typeof v.contractInput>,
                "startDate" | "endDate"
              >),
              ...s,
              startDate: start,
              endDate: end,
              originalValue: original,
              currentValue: original,
              ...stamp(r),
            },
          });
      await this.audit(
        tx,
        r,
        before ? "CONTRACT_UPDATED" : "CONTRACT_CREATED",
        "Contract",
        result.id,
        p,
        before,
        result,
      );
      return result;
    });
  }
  async transitionContract(
    r: ApiRequest,
    p: string,
    id: string,
    action: string,
    version: number,
  ) {
    this.admin(r);
    const s = await this.scope(r, p, "write");
    return this.db.$transaction(async (tx) => {
      const c = await this.contract(tx, s, id, true);
      d.assertVersion(c.version, version);
      const status = d.contractTransition(c.status, action) as typeof c.status;
      if (action === "activate" && c.status === "DRAFT") {
        const sum = await tx.contractItem.aggregate({
          where: { ...s, contractId: id, deletedAt: null },
          _sum: { totalValue: true },
        });
        if (!new Decimal(sum._sum.totalValue ?? 0).eq(c.originalValue))
          fail(
            409,
            "INVALID_CONTRACT_TRANSITION",
            "Total dos itens deve igualar o valor original",
          );
        if ((await this.supplier(r, c.supplierId, tx)).status !== "ACTIVE")
          fail(409, "SUPPLIER_INACTIVE", "Fornecedor inativo");
      }
      const result = await tx.contract.update({
        where: { ...s, id },
        data: { status, version: { increment: 1 }, updatedBy: r.auth.userId },
      });
      const event: Record<string, string> = {
        activate: "ACTIVATED",
        suspend: "SUSPENDED",
        complete: "COMPLETED",
        terminate: "TERMINATED",
      };
      await this.audit(
        tx,
        r,
        "CONTRACT_" + event[action],
        "Contract",
        id,
        p,
        c,
        result,
      );
      return result;
    });
  }
  async items(r: ApiRequest, p: string, id: string, q: Query) {
    const s = await this.scope(r, p);
    await this.contract(this.db, s, id);
    const where = { ...s, contractId: id, deletedAt: null };
    const [items, total] = await this.db.$transaction([
      this.db.contractItem.findMany({
        where,
        ...paging(q),
        orderBy: { createdAt: "asc" },
      }),
      this.db.contractItem.count({ where }),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }
  async saveItem(
    r: ApiRequest,
    p: string,
    id: string,
    input: z.infer<typeof v.itemInput> | z.infer<typeof v.actionInput>,
    itemId?: string,
    remove = false,
  ) {
    const s = await this.scope(r, p, "write");
    return this.db.$transaction(async (tx) => {
      const c = await this.contract(tx, s, id, true);
      d.assertVersion(c.version, input.version);
      d.editable(c.status, "CONTRACT");
      const before = itemId
        ? await tx.contractItem.findFirst({
            where: { ...s, contractId: id, id: itemId, deletedAt: null },
          })
        : null;
      if (itemId && !before)
        fail(404, "CONTRACT_ITEM_NOT_FOUND", "Item não encontrado");
      const { version: _v, ...raw } = input as z.infer<typeof v.itemInput>;
      void _v;
      await validBudgetItem(tx, s, raw.budgetItemId);
      const data = remove
        ? { deletedAt: new Date() }
        : {
            ...raw,
            totalValue: d.contractItemTotal(
              raw.quantity,
              raw.unitPrice,
              raw.totalValue,
            ),
          };
      const result = before
        ? await tx.contractItem.update({
            where: { ...s, id: before.id },
            data: {
              ...data,
              version: { increment: 1 },
              updatedBy: r.auth.userId,
            },
          })
        : await tx.contractItem.create({
            data: {
              ...(data as Omit<z.infer<typeof v.itemInput>, "version"> & {
                totalValue: string;
              }),
              ...s,
              contractId: id,
              ...stamp(r),
            },
          });
      await tx.contract.update({
        where: { ...s, id },
        data: { version: { increment: 1 }, updatedBy: r.auth.userId },
      });
      await this.audit(
        tx,
        r,
        remove
          ? "CONTRACT_ITEM_REMOVED"
          : before
            ? "CONTRACT_ITEM_UPDATED"
            : "CONTRACT_ITEM_CREATED",
        "ContractItem",
        result.id,
        p,
        before,
        result,
      );
      return { ...result, contractVersion: c.version + 1 };
    });
  }
  async amendments(r: ApiRequest, p: string, id: string, q: Query) {
    const s = await this.scope(r, p);
    await this.contract(this.db, s, id);
    const role = (await this.access.check(r, p)).role;
    const where: Prisma.ContractAmendmentWhereInput = {
      ...s,
      contractId: id,
      ...(role === "FINANCIER"
        ? { status: "APPROVED" as const }
        : {
            status: enumFilter(q.status, [
              "DRAFT",
              "SUBMITTED",
              "APPROVED",
              "REJECTED",
              "CANCELLED",
            ]),
          }),
    };
    const [items, total] = await this.db.$transaction([
      this.db.contractAmendment.findMany({
        where,
        ...paging(q),
        orderBy: { amendmentNumber: "desc" },
      }),
      this.db.contractAmendment.count({ where }),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }
  async saveAmendment(
    r: ApiRequest,
    p: string,
    id: string,
    input: z.infer<typeof v.amendmentInput> | z.infer<typeof v.amendmentPatch>,
    amendId?: string,
  ) {
    const s = await this.scope(r, p, "write");
    return this.db.$transaction(async (tx) => {
      const c = await this.contract(tx, s, id, true);
      if (!["ACTIVE", "SUSPENDED"].includes(c.status))
        fail(
          409,
          "INVALID_AMENDMENT_TRANSITION",
          "Contrato deve estar ativo ou suspenso",
        );
      const before = amendId
        ? await tx.contractAmendment.findFirst({
            where: { ...s, contractId: id, id: amendId },
          })
        : null;
      if (amendId && !before)
        fail(404, "CONTRACT_AMENDMENT_NOT_FOUND", "Adenda não encontrada");
      if (before) {
        d.assertVersion(
          before.version,
          (input as z.infer<typeof v.amendmentPatch>).version,
        );
        d.editable(before.status, "CONTRACT_AMENDMENT");
      }
      const { version: _v, ...raw } = input as z.infer<typeof v.amendmentPatch>;
      void _v;
      const type = raw.amendmentType ?? before!.amendmentType,
        amount = raw.amount ?? before!.amount.toString();
      if (
        ["ADDITION", "OMISSION"].includes(type)
          ? !d.amount(amount).gt(0)
          : !d.amount(amount).eq(0)
      )
        fail(
          400,
          "VALIDATION_ERROR",
          "Adições/supressões exigem valor positivo; restantes tipos exigem zero",
        );
      const data = {
        ...raw,
        effectiveDate:
          raw.effectiveDate === undefined
            ? before?.effectiveDate
            : dates(raw.effectiveDate),
      };
      const result = before
        ? await tx.contractAmendment.update({
            where: { ...s, id: before.id },
            data: {
              ...data,
              version: { increment: 1 },
              updatedBy: r.auth.userId,
            },
          })
        : await tx.contractAmendment.create({
            data: {
              ...(data as Omit<
                z.infer<typeof v.amendmentInput>,
                "effectiveDate"
              >),
              effectiveDate: data.effectiveDate,
              ...s,
              contractId: id,
              amendmentNumber: c.amendmentSequence + 1,
              code: `AD-${String(c.amendmentSequence + 1).padStart(3, "0")}`,
              ...stamp(r),
            },
          });
      if (!before)
        await tx.contract.update({
          where: { ...s, id },
          data: {
            amendmentSequence: { increment: 1 },
            version: { increment: 1 },
            updatedBy: r.auth.userId,
          },
        });
      await this.audit(
        tx,
        r,
        before ? "CONTRACT_AMENDMENT_UPDATED" : "CONTRACT_AMENDMENT_CREATED",
        "ContractAmendment",
        result.id,
        p,
        before,
        result,
      );
      return result;
    });
  }
  async transitionAmendment(
    r: ApiRequest,
    p: string,
    id: string,
    aid: string,
    action: string,
    input: z.infer<typeof v.actionInput>,
  ) {
    if (action !== "submit") this.admin(r);
    const s = await this.scope(r, p, "write");
    return this.db.$transaction(async (tx) => {
      const c = await this.contract(tx, s, id, true);
      if (!["ACTIVE", "SUSPENDED"].includes(c.status))
        fail(
          409,
          "INVALID_AMENDMENT_TRANSITION",
          "Contrato não permite adendas",
        );
      const a =
        (await tx.contractAmendment.findFirst({
          where: { ...s, contractId: id, id: aid },
        })) ??
        fail(404, "CONTRACT_AMENDMENT_NOT_FOUND", "Adenda não encontrada");
      d.assertVersion(a.version, input.version);
      const status = d.approvalTransition(a.status, action) as typeof a.status;
      if (action === "approve")
        d.selfApproval(
          a.createdBy,
          r.auth.userId,
          process.env.PREVENT_SELF_APPROVAL !== "false",
        );
      if (action === "reject" && !input.reason)
        fail(400, "VALIDATION_ERROR", "Motivo obrigatório");
      const result = await tx.contractAmendment.update({
        where: { ...s, id: aid },
        data: {
          status,
          version: { increment: 1 },
          updatedBy: r.auth.userId,
          ...(action === "submit"
            ? { submittedBy: r.auth.userId, submittedAt: new Date() }
            : action === "approve"
              ? { approvedBy: r.auth.userId, approvedAt: new Date() }
              : {
                  rejectedBy: r.auth.userId,
                  rejectedAt: new Date(),
                  rejectionReason: input.reason,
                }),
        },
      });
      if (action === "approve") {
        const sums = await tx.contractAmendment.groupBy({
          by: ["amendmentType"],
          where: { ...s, contractId: id, status: "APPROVED" },
          _sum: { amount: true },
        });
        const value = (type: string) =>
          sums.find((x) => x.amendmentType === type)?._sum.amount?.toString() ??
          "0";
        await tx.contract.update({
          where: { ...s, id },
          data: {
            currentValue: d.currentContractValue(
              c.originalValue.toString(),
              value("ADDITION"),
              value("OMISSION"),
            ),
            version: { increment: 1 },
            updatedBy: r.auth.userId,
          },
        });
      }
      await this.audit(
        tx,
        r,
        "CONTRACT_AMENDMENT_" +
          (action === "submit"
            ? "SUBMITTED"
            : action === "approve"
              ? "APPROVED"
              : "REJECTED"),
        "ContractAmendment",
        aid,
        p,
        a,
        result,
      );
      return result;
    });
  }
  async centers(r: ApiRequest, p: string, q: Query) {
    const s = await this.scope(r, p, "expense");
    const where = {
      ...s,
      status: enumFilter(q.status, ["ACTIVE", "INACTIVE"]),
    };
    const [items, total] = await this.db.$transaction([
      this.db.costCenter.findMany({
        where,
        ...paging(q),
        orderBy: { code: "asc" },
      }),
      this.db.costCenter.count({ where }),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }
  async saveCenter(
    r: ApiRequest,
    p: string,
    input: z.infer<typeof v.centerInput> | z.infer<typeof v.centerPatch>,
    id?: string,
  ) {
    const s = await this.scope(r, p, "expenseWrite");
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id=${p}::uuid AND tenant_id=${s.tenantId}::uuid FOR UPDATE`;
      const before = id
        ? await tx.costCenter.findFirst({ where: { ...s, id } })
        : null;
      if (id && !before)
        fail(404, "COST_CENTER_NOT_FOUND", "Centro não encontrado");
      if (before)
        d.assertVersion(
          before.version,
          (input as z.infer<typeof v.centerPatch>).version,
        );
      const { version: _v, ...data } = input as z.infer<typeof v.centerPatch>;
      void _v;
      if (data.parentId) {
        const nodes = await tx.costCenter.findMany({
            where: s,
            select: { id: true, parentId: true, status: true },
          }),
          map = new Map(nodes.map((x) => [x.id, x]));
        let current: string | null = data.parentId;
        const seen = new Set<string>(id ? [id] : []);
        while (current) {
          if (seen.has(current))
            fail(400, "INVALID_DEPENDENCY", "Ciclo na hierarquia");
          seen.add(current);
          const node = map.get(current);
          if (!node || node.status !== "ACTIVE")
            fail(400, "COST_CENTER_NOT_FOUND", "Centro pai indisponível");
          current = node.parentId;
        }
      }
      const result = before
        ? await tx.costCenter.update({
            where: { ...s, id: before.id },
            data: {
              ...data,
              version: { increment: 1 },
              updatedBy: r.auth.userId,
            },
          })
        : await tx.costCenter.create({
            data: {
              ...(data as z.infer<typeof v.centerInput>),
              ...s,
              ...stamp(r),
            },
          });
      await this.audit(
        tx,
        r,
        data.status === "INACTIVE"
          ? "COST_CENTER_DEACTIVATED"
          : before
            ? "COST_CENTER_UPDATED"
            : "COST_CENTER_CREATED",
        "CostCenter",
        result.id,
        p,
        before,
        result,
      );
      return result;
    });
  }
  async expense(tx: Tx, s: Scope, id: string, lock = false) {
    if (lock)
      await tx.$queryRaw`SELECT id FROM expenses WHERE tenant_id=${s.tenantId}::uuid AND project_id=${s.projectId}::uuid AND id=${id}::uuid FOR UPDATE`;
    return (
      (await tx.expense.findFirst({ where: { ...s, id } })) ??
      fail(404, "EXPENSE_NOT_FOUND", "Despesa não encontrada")
    );
  }
  async expenses(r: ApiRequest, p: string, q: Query) {
    const s = await this.scope(r, p, "expense");
    const where: Prisma.ExpenseWhereInput = {
      ...s,
      status: enumFilter(q.status, [
        "DRAFT",
        "SUBMITTED",
        "APPROVED",
        "REJECTED",
        "CANCELLED",
        "REVERSED",
      ]),
      supplierId: q.supplier ?? undefined,
      contractId: q.contract ?? undefined,
      costCenterId: q.cost_center ?? undefined,
      budgetItemId: q.budget_item ?? undefined,
      expenseDate: {
        gte: q.date_from ? dates(q.date_from)! : undefined,
        lte: q.date_to ? dates(q.date_to)! : undefined,
      },
      ...(q.search
        ? {
            OR: [
              { description: { contains: q.search, mode: "insensitive" } },
              { expenseNumber: { contains: q.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.expense.findMany({
        where,
        ...paging(q),
        orderBy: [{ expenseDate: "desc" }, { id: "asc" }],
      }),
      this.db.expense.count({ where }),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }
  async readExpense(r: ApiRequest, p: string, id: string) {
    const s = await this.scope(r, p, "expense");
    const e = await this.expense(this.db, s, id);
    return {
      ...e,
      reversal: await this.db.expenseReversal.findFirst({
        where: { ...s, expenseId: id },
      }),
    };
  }
  async saveExpense(
    r: ApiRequest,
    p: string,
    input: z.infer<typeof v.expenseInput> | z.infer<typeof v.expensePatch>,
    id?: string,
  ) {
    const s = await this.scope(r, p, "expenseWrite");
    return this.db.$transaction(async (tx) => {
      const before = id ? await this.expense(tx, s, id, true) : null;
      if (before) {
        d.assertVersion(
          before.version,
          (input as z.infer<typeof v.expensePatch>).version,
        );
        d.editable(before.status, "EXPENSE");
      }
      const { version: _v, ...raw } = input as z.infer<typeof v.expensePatch>;
      void _v;
      const data = { ...before, ...raw };
      const cc = await tx.costCenter.findFirst({
        where: { ...s, id: data.costCenterId, status: "ACTIVE" },
      });
      if (!cc)
        fail(
          404,
          "COST_CENTER_NOT_FOUND",
          "Centro de custo não encontrado ou inativo",
        );
      await validBudgetItem(tx, s, data.budgetItemId);
      if (
        data.supplierId &&
        (await this.supplier(r, data.supplierId, tx)).status !== "ACTIVE"
      )
        fail(409, "SUPPLIER_INACTIVE", "Fornecedor inativo");
      if (data.contractId) {
        const c = await this.contract(tx, s, data.contractId);
        if (!["ACTIVE", "SUSPENDED", "COMPLETED"].includes(c.status))
          fail(
            409,
            "INVALID_CONTRACT_TRANSITION",
            "Contrato não disponível para despesa",
          );
        if (data.supplierId && data.supplierId !== c.supplierId)
          fail(400, "VALIDATION_ERROR", "Fornecedor difere do contrato");
        raw.supplierId = c.supplierId;
      }
      const total = d.expenseTotal(
        String(data.subtotal),
        String(data.taxAmount ?? "0"),
      );
      const values = {
        ...raw,
        expenseDate: raw.expenseDate
          ? dates(raw.expenseDate)!
          : before!.expenseDate,
        totalAmount: total,
        updatedBy: r.auth.userId,
      };
      const result = before
        ? await tx.expense.update({
            where: { ...s, id: before.id },
            data: { ...values, version: { increment: 1 } },
          })
        : await tx.expense.create({
            data: {
              ...(values as Omit<
                z.infer<typeof v.expenseInput>,
                "expenseDate"
              > & { expenseDate: Date; totalAmount: string }),
              ...s,
              ...stamp(r),
            },
          });
      await this.audit(
        tx,
        r,
        before ? "EXPENSE_UPDATED" : "EXPENSE_CREATED",
        "Expense",
        result.id,
        p,
        before,
        result,
      );
      return result;
    });
  }
  async transitionExpense(
    r: ApiRequest,
    p: string,
    id: string,
    action: string,
    input: z.infer<typeof v.actionInput>,
  ) {
    if (action !== "submit") this.admin(r);
    const s = await this.scope(r, p, "expenseWrite");
    return this.db.$transaction(async (tx) => {
      const e = await this.expense(tx, s, id, true);
      d.assertVersion(e.version, input.version);
      const status = d.approvalTransition(
        e.status,
        action,
        true,
      ) as typeof e.status;
      if (action === "approve")
        d.selfApproval(
          e.createdBy,
          r.auth.userId,
          process.env.PREVENT_SELF_APPROVAL !== "false",
        );
      if (["reject", "reverse"].includes(action) && !input.reason)
        fail(400, "VALIDATION_ERROR", "Motivo obrigatório");
      if (action === "reverse")
        await tx.expenseReversal.create({
          data: { ...s, expenseId: id, reason: input.reason!, ...stamp(r) },
        });
      const result = await tx.expense.update({
        where: { ...s, id },
        data: {
          status,
          version: { increment: 1 },
          updatedBy: r.auth.userId,
          ...(action === "submit"
            ? { submittedBy: r.auth.userId, submittedAt: new Date() }
            : action === "approve"
              ? { approvedBy: r.auth.userId, approvedAt: new Date() }
              : action === "reject"
                ? {
                    rejectedBy: r.auth.userId,
                    rejectedAt: new Date(),
                    rejectionReason: input.reason,
                  }
                : {}),
        },
      });
      await this.audit(
        tx,
        r,
        "EXPENSE_" +
          {
            submit: "SUBMITTED",
            approve: "APPROVED",
            reject: "REJECTED",
            reverse: "REVERSED",
          }[action],
        "Expense",
        id,
        p,
        e,
        result,
      );
      return result;
    });
  }
  async history(
    r: ApiRequest,
    p: string,
    kind: "Contract" | "Expense",
    id: string,
    q: Query,
  ) {
    const s = await this.scope(r, p, kind === "Expense" ? "expense" : "write");
    if (kind === "Contract") await this.contract(this.db, s, id);
    else await this.expense(this.db, s, id);
    const ids =
      kind === "Contract"
        ? [
            id,
            ...(
              await this.db.contractAmendment.findMany({
                where: { ...s, contractId: id },
                select: { id: true },
              })
            ).map((x) => x.id),
            ...(
              await this.db.contractItem.findMany({
                where: { ...s, contractId: id },
                select: { id: true },
              })
            ).map((x) => x.id),
          ]
        : [id];
    return {
      items: await this.db.auditLog.findMany({
        where: { ...s, entityId: { in: ids } },
        ...paging(q),
        orderBy: { createdAt: "desc" },
      }),
    };
  }
}
