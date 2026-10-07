import { Inject, Injectable } from "@nestjs/common";
import { Database, fail } from "../platform.js";
import { BudgetAccess } from "./budget.access.js";
import {
  activeBudget,
  allocateRevision,
  claimDraft,
  lockBudget,
  revisionIn,
  valuesIn,
} from "./budget.repository.js";
import { recordAudit } from "../audit/audit.module.js";
import type { ApiRequest } from "../auth/security.js";
import {
  assertTransition,
  buildTree,
  compareRevisions,
  variation,
} from "../../../../packages/domain/src/budget.js";
import type { z } from "zod";
import type {
  budgetSchema,
  revisionSchema,
} from "../../../../packages/validation/src/budget.js";
@Injectable()
export class BudgetService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(BudgetAccess) readonly access: BudgetAccess,
  ) {}
  async create(
    req: ApiRequest,
    projectId: string,
    input: z.infer<typeof budgetSchema>,
  ) {
    const { tenantId } = await this.access.check(req, projectId, true);
    return this.db.$transaction(async (tx) => {
      const budget = await tx.budget.create({
        data: {
          tenantId,
          projectId,
          ...input,
          createdBy: req.auth.userId,
          updatedBy: req.auth.userId,
        },
      });
      const revision = await allocateRevision(
        tx,
        { tenantId, projectId },
        req.auth.userId,
        "Orçamento Base",
      );
      await recordAudit(
        tx,
        req.auth,
        {
          action: "BUDGET_CREATED",
          entityType: "Budget",
          entityId: budget.id,
          projectId,
          newValues: budget,
        },
        req,
      );
      await recordAudit(
        tx,
        req.auth,
        {
          action: "BUDGET_REVISION_CREATED",
          entityType: "BudgetRevision",
          entityId: revision.id,
          projectId,
          newValues: revision,
        },
        req,
      );
      return { ...budget, revision };
    });
  }
  async summary(req: ApiRequest, projectId: string) {
    const scope = await this.access.check(req, projectId);
    const budget = await activeBudget(this.db, scope);
    const revisions = await this.db.budgetRevision.findMany({
      where: {
        tenantId: scope.tenantId,
        projectId,
        budgetId: budget.id,
        ...(!scope.editor
          ? { status: { in: ["APPROVED" as const, "SUPERSEDED" as const] } }
          : {}),
      },
      orderBy: { revisionNumber: "desc" },
    });
    const approved = revisions.find((r) => r.status === "APPROVED"),
      original = revisions.find(
        (r) =>
          r.revisionNumber === 0 &&
          ["APPROVED", "SUPERSEDED"].includes(r.status),
      );
    const originalTotal = original
      ? buildTree(await valuesIn(this.db, scope, original.id)).total
      : "0.00";
    const currentTotal = approved
      ? buildTree(await valuesIn(this.db, scope, approved.id)).total
      : "0.00";
    return {
      ...budget,
      canEdit: scope.editor,
      currentRevision: approved ?? null,
      workingRevision:
        revisions.find(
          (r) => r.status === "DRAFT" || r.status === "SUBMITTED",
        ) ?? null,
      revisionCount: revisions.length,
      originalTotal,
      currentTotal,
      ...variation(originalTotal, currentTotal),
    };
  }
  async revision(req: ApiRequest, projectId: string, id: string) {
    const scope = await this.access.check(req, projectId);
    const revision = await revisionIn(this.db, scope, id);
    if (!scope.editor && !["APPROVED", "SUPERSEDED"].includes(revision.status))
      fail(404, "BUDGET_REVISION_NOT_FOUND", "Revisão não disponível");
    return {
      ...revision,
      ...buildTree(await valuesIn(this.db, scope, id)),
      canEdit: scope.editor,
    };
  }
  async tree(req: ApiRequest, projectId: string, revisionId?: string) {
    if (revisionId) return this.revision(req, projectId, revisionId);
    const summary = await this.summary(req, projectId);
    const current = summary.workingRevision ?? summary.currentRevision;
    if (!current)
      fail(404, "BUDGET_REVISION_NOT_FOUND", "Nenhuma revisão disponível");
    return this.revision(req, projectId, current.id);
  }
  async list(req: ApiRequest, projectId: string, page: number, limit: number) {
    const scope = await this.access.check(req, projectId);
    const where = {
      tenantId: scope.tenantId,
      projectId,
      ...(!scope.editor
        ? { status: { in: ["APPROVED" as const, "SUPERSEDED" as const] } }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.db.budgetRevision.findMany({
        where,
        orderBy: { revisionNumber: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.budgetRevision.count({ where }),
    ]);
    const totals = await this.db.budgetRevisionValue.groupBy({
      by: ["budgetRevisionId"],
      where: {
        tenantId: scope.tenantId,
        budgetRevisionId: { in: data.map((r) => r.id) },
        itemType: "ITEM",
        isActive: true,
      },
      _sum: { totalValue: true },
    });
    const actors = await this.db.tenantUser.findMany({
      where: {
        tenantId: scope.tenantId,
        userId: {
          in: [
            ...new Set(
              data.flatMap((r) => [
                r.createdBy,
                ...(r.approvedBy ? [r.approvedBy] : []),
              ]),
            ),
          ],
        },
      },
      select: { user: { select: { id: true, name: true } } },
    });
    const names = new Map(actors.map((x) => [x.user.id, x.user.name]));
    const amounts = new Map(
      totals.map((x) => [
        x.budgetRevisionId,
        x._sum.totalValue?.toFixed(2) ?? "0.00",
      ]),
    );
    return {
      data: data.map((r) => ({
        ...r,
        total: amounts.get(r.id) ?? "0.00",
        createdByName: names.get(r.createdBy),
        approvedByName: r.approvedBy ? names.get(r.approvedBy) : null,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
  async createRevision(
    req: ApiRequest,
    projectId: string,
    input: z.infer<typeof revisionSchema>,
  ) {
    const scope = await this.access.check(req, projectId, true);
    return this.db.$transaction(
      async (tx) => {
        await lockBudget(tx, scope);
        const source = input.sourceRevisionId
          ? await revisionIn(tx, scope, input.sourceRevisionId)
          : await tx.budgetRevision.findFirst({
              where: {
                tenantId: scope.tenantId,
                projectId,
                status: "APPROVED",
              },
            });
        if (!source || !["APPROVED", "REJECTED"].includes(source.status))
          fail(
            400,
            "INVALID_REVISION_TRANSITION",
            "Duplique uma revisão aprovada ou rejeitada",
          );
        const revision = await allocateRevision(
          tx,
          scope,
          req.auth.userId,
          input.description,
        );
        const values = await tx.budgetRevisionValue.findMany({
          where: {
            tenantId: scope.tenantId,
            budgetId: source.budgetId,
            budgetRevisionId: source.id,
          },
        });
        for (let offset = 0; offset < values.length; offset += 500)
          await tx.budgetRevisionValue.createMany({
            data: values
              .slice(offset, offset + 500)
              .map(
                ({
                  id: _id,
                  createdAt: _created,
                  updatedAt: _updated,
                  ...v
                }) => ({ ...v, budgetRevisionId: revision.id }),
              ),
          });
        await recordAudit(
          tx,
          req.auth,
          {
            action: "BUDGET_REVISION_CREATED",
            entityType: "BudgetRevision",
            entityId: revision.id,
            projectId,
            newValues: { ...revision, sourceRevisionId: source.id },
          },
          req,
        );
        return revision;
      },
      { timeout: 60000 },
    );
  }
  async patch(
    req: ApiRequest,
    projectId: string,
    id: string,
    version: number,
    description: string,
  ) {
    const scope = await this.access.check(req, projectId, true);
    return this.db.$transaction(async (tx) => {
      const before = await claimDraft(tx, scope, id, version);
      const after = await tx.budgetRevision.update({
        where: { id, tenantId: scope.tenantId, projectId },
        data: { description },
      });
      await recordAudit(
        tx,
        req.auth,
        {
          action: "BUDGET_REVISION_UPDATED",
          entityType: "BudgetRevision",
          entityId: id,
          projectId,
          oldValues: { description: before.description },
          newValues: { description },
        },
        req,
      );
      return after;
    });
  }
  async transition(
    req: ApiRequest,
    projectId: string,
    id: string,
    version: number,
    target: "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED",
    reason?: string,
  ) {
    const scope = await this.access.check(req, projectId, true);
    if (target === "APPROVED" || target === "REJECTED") this.access.admin(req);
    return this.db.$transaction(
      async (tx) => {
        await lockBudget(tx, scope);
        const before = await revisionIn(tx, scope, id);
        assertTransition(before.status, target);
        const tree = buildTree(await valuesIn(tx, scope, id));
        if (target === "SUBMITTED" && !tree.items.length)
          fail(400, "BUDGET_IMPORT_INVALID", "Orçamento vazio");
        const changed = await tx.budgetRevision.updateMany({
          where: {
            id,
            tenantId: scope.tenantId,
            projectId,
            version,
            status: before.status,
          },
          data: { version: { increment: 1 } },
        });
        if (changed.count !== 1)
          fail(
            409,
            "RESOURCE_VERSION_CONFLICT",
            "Revisão alterada por outro utilizador",
          );
        if (target === "APPROVED")
          await tx.budgetRevision.updateMany({
            where: {
              tenantId: scope.tenantId,
              projectId,
              budgetId: before.budgetId,
              status: "APPROVED",
            },
            data: { status: "SUPERSEDED" },
          });
        const after = await tx.budgetRevision.update({
          where: { id, tenantId: scope.tenantId, projectId },
          data: {
            status: target,
            ...(target === "SUBMITTED"
              ? { submittedBy: req.auth.userId, submittedAt: new Date() }
              : {}),
            ...(target === "APPROVED"
              ? { approvedBy: req.auth.userId, approvedAt: new Date() }
              : {}),
            ...(target === "REJECTED"
              ? {
                  rejectedBy: req.auth.userId,
                  rejectedAt: new Date(),
                  rejectionReason: reason,
                }
              : {}),
          },
        });
        await recordAudit(
          tx,
          req.auth,
          {
            action: `BUDGET_REVISION_${target}`,
            entityType: "BudgetRevision",
            entityId: id,
            projectId,
            oldValues: { status: before.status },
            newValues: {
              status: target,
              user: req.auth.userId,
              timestamp: new Date(),
              revision: before.code,
              value: tree.total,
              reason,
            },
          },
          req,
        );
        return after;
      },
      { timeout: 60000 },
    );
  }
  async compare(
    req: ApiRequest,
    projectId: string,
    fromId: string,
    toId: string,
    page = 1,
    limit = 50,
  ) {
    await this.revision(req, projectId, fromId);
    await this.revision(req, projectId, toId);
    const scope = { tenantId: req.auth.tenantId, projectId };
    const result = compareRevisions(
      await valuesIn(this.db, scope, fromId),
      await valuesIn(this.db, scope, toId),
    );
    return {
      ...result,
      fromRevisionId: fromId,
      toRevisionId: toId,
      items: undefined,
      data: result.items.slice((page - 1) * limit, page * limit),
      meta: {
        page,
        limit,
        total: result.items.length,
        totalPages: Math.ceil(result.items.length / limit),
      },
    };
  }
}
