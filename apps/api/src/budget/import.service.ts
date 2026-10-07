import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { Database, fail } from "../platform.js";
import { BudgetAccess } from "./budget.access.js";
import { allocateRevision, lockBudget, toLines } from "./budget.repository.js";
import { checksum, storeOriginal, readOriginal } from "./storage.js";
import { persistPreview, type RawImportRow } from "./import-stage.js";
import { mapCells, type ColumnMapping } from "./excel.js";
import { money } from "../../../../packages/domain/src/budget.js";
import {
  importLines,
  validateImport,
} from "../../../../packages/domain/src/budget-import.js";
import { rowPatchSchema } from "../../../../packages/validation/src/budget.js";
import { recordAudit } from "../audit/audit.module.js";
import type { ApiRequest } from "../auth/security.js";
import { redisConnection } from "../../../../packages/config/src/redis.js";
@Injectable()
export class BudgetImportService implements OnModuleDestroy {
  readonly queue = new Queue("budget-import", {
    connection: redisConnection(),
  });
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(BudgetAccess) readonly access: BudgetAccess,
  ) {}
  async onModuleDestroy() {
    await this.queue.close();
  }
  async enqueue(job: {
    id: string;
    tenantId: string;
    projectId: string;
    version: number;
  }) {
    await this.queue.add(
      "parse-budget-xlsx",
      {
        importJobId: job.id,
        tenantId: job.tenantId,
        projectId: job.projectId,
        version: job.version,
      },
      {
        jobId: `${job.id}-${job.version}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );
  }
  async upload(req: ApiRequest, projectId: string, file: Express.Multer.File) {
    const { tenantId } = await this.access.check(req, projectId, true);
    if (
      !file ||
      !file.originalname.toLowerCase().endsWith(".xlsx") ||
      file.buffer[0] !== 0x50 ||
      file.buffer[1] !== 0x4b
    )
      fail(400, "BUDGET_IMPORT_INVALID", "Selecione um ficheiro .xlsx válido");
    const id = randomUUID(),
      key = `tenant/${tenantId}/projects/${projectId}/budget/imports/${id}/original.xlsx`;
    await storeOriginal(key, file.buffer);
    const budget = await this.db.budget.findFirst({
      where: { tenantId, projectId, status: "ACTIVE" },
    });
    const job = await this.db.$transaction(async (tx) => {
      const job = await tx.budgetImportJob.create({
        data: {
          id,
          tenantId,
          projectId,
          budgetId: budget?.id,
          fileName: file.originalname.slice(0, 255),
          fileStorageKey: key,
          fileChecksum: checksum(file.buffer),
          createdBy: req.auth.userId,
        },
      });
      await recordAudit(
        tx,
        req.auth,
        {
          action: "BUDGET_IMPORT_UPLOADED",
          entityType: "BudgetImportJob",
          entityId: id,
          projectId,
          newValues: { fileName: job.fileName, checksum: job.fileChecksum },
        },
        req,
      );
      return job;
    });
    try {
      await this.enqueue(job);
    } catch {
      await this.db.$transaction(async (tx) => {
        await tx.budgetImportJob.update({
          where: { tenantId, id },
          data: {
            status: "FAILED",
            errorMessage: "Fila indisponível. Tente novamente.",
          },
        });
        await recordAudit(
          tx,
          req.auth,
          {
            action: "BUDGET_IMPORT_FAILED",
            entityType: "BudgetImportJob",
            entityId: id,
            projectId,
            newValues: { error: "Fila indisponível" },
          },
          req,
        );
      });
    }
    return this.get(req, projectId, id, 1, 50);
  }
  async get(
    req: ApiRequest,
    projectId: string,
    id: string,
    page: number,
    limit: number,
    status?: "VALID" | "INVALID" | "WARNING",
  ) {
    await this.access.check(req, projectId, true);
    const tenantId = req.auth.tenantId;
    const job =
      (await this.db.budgetImportJob.findFirst({
        where: { tenantId, projectId, id },
      })) ?? fail(404, "RESOURCE_NOT_FOUND", "Importação não encontrada");
    const where = { tenantId, importJobId: id, ...(status ? { status } : {}) };
    const [data, total] = await Promise.all([
      this.db.budgetImportRow.findMany({
        where,
        orderBy: { rowNumber: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.budgetImportRow.count({ where }),
    ]);
    return {
      ...job,
      fileStorageKey: undefined,
      rows: {
        data: data.map((row) => ({
          ...row,
          totalValue:
            row.status !== "INVALID" &&
            row.itemType === "ITEM" &&
            row.quantity &&
            row.unitPrice
              ? money(row.quantity.toFixed(4), row.unitPrice.toFixed(2))
              : null,
        })),
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    };
  }
  async correct(
    req: ApiRequest,
    projectId: string,
    id: string,
    version: number,
    change:
      | { rowNumber: number; data: z.infer<typeof rowPatchSchema>["data"] }
      | { mapping: ColumnMapping },
  ) {
    await this.access.check(req, projectId, true);
    const tenantId = req.auth.tenantId;
    return this.db.$transaction(
      async (tx) => {
        const changed = await tx.budgetImportJob.updateMany({
          where: { tenantId, projectId, id, version, status: "READY" },
          data: { version: { increment: 1 } },
        });
        if (!changed.count)
          fail(
            409,
            "RESOURCE_VERSION_CONFLICT",
            "Preview alterado ou não está pronto",
          );
        const rows = await tx.budgetImportRow.findMany({
          where: { tenantId, importJobId: id },
          orderBy: { rowNumber: "asc" },
        });
        if (
          "rowNumber" in change &&
          !rows.some((r) => r.rowNumber === change.rowNumber)
        )
          fail(404, "RESOURCE_NOT_FOUND", "Linha não encontrada");
        const raw: RawImportRow[] = rows.map((row) => {
          const saved = row.rawData as unknown as Omit<
            RawImportRow,
            "rowNumber"
          >;
          return {
            rowNumber: row.rowNumber,
            cells: saved.cells,
            fields:
              "mapping" in change
                ? mapCells(saved.cells, change.mapping)
                : row.rowNumber === change.rowNumber
                  ? { ...saved.fields, ...change.data }
                  : saved.fields,
          };
        });
        if ("mapping" in change)
          await tx.budgetImportJob.update({
            where: { tenantId, id },
            data: { mapping: change.mapping },
          });
        const result = await persistPreview(tx, tenantId, id, raw);
        await recordAudit(
          tx,
          req.auth,
          {
            action: "BUDGET_IMPORT_PREVIEW_UPDATED",
            entityType: "BudgetImportJob",
            entityId: id,
            projectId,
            newValues: change,
          },
          req,
        );
        return { id: result.id, version: result.version };
      },
      { timeout: 120000 },
    );
  }
  async retry(req: ApiRequest, projectId: string, id: string, version: number) {
    await this.access.check(req, projectId, true);
    const tenantId = req.auth.tenantId;
    const changed = await this.db.budgetImportJob.updateMany({
      where: {
        tenantId,
        projectId,
        id,
        version,
        status: { in: ["FAILED", "UPLOADED"] },
      },
      data: {
        status: "UPLOADED",
        version: { increment: 1 },
        errorMessage: null,
      },
    });
    if (!changed.count)
      fail(
        409,
        "RESOURCE_VERSION_CONFLICT",
        "Importação já processada ou alterada",
      );
    await this.enqueue({ id, tenantId, projectId, version: version + 1 });
    return { id, version: version + 1 };
  }
  async confirm(
    req: ApiRequest,
    projectId: string,
    id: string,
    version: number,
  ) {
    await this.access.check(req, projectId, true);
    const tenantId = req.auth.tenantId,
      scope = { tenantId, projectId };
    return this.db.$transaction(
      async (tx) => {
        const claimed = await tx.budgetImportJob.updateMany({
          where: {
            tenantId,
            projectId,
            id,
            version,
            status: "READY",
            invalidRows: 0,
          },
          data: {
            status: "CONFIRMED",
            version: { increment: 1 },
            confirmedAt: new Date(),
          },
        });
        if (!claimed.count)
          fail(
            409,
            "BUDGET_IMPORT_NOT_READY",
            "Importação inválida, alterada ou já confirmada",
          );
        const job = await tx.budgetImportJob.findFirstOrThrow({
          where: { tenantId, projectId, id },
        });
        const rows = await tx.budgetImportRow.findMany({
          where: { tenantId, importJobId: id },
          orderBy: { rowNumber: "asc" },
        });
        if (!rows.length)
          fail(400, "BUDGET_IMPORT_INVALID", "Importação vazia");
        const checked = validateImport(
          rows.map((r) => ({
            rowNumber: r.rowNumber,
            fields: { ...(r.rawData as unknown as RawImportRow).fields },
          })),
        );
        if (checked.rows.some((r) => r.status === "INVALID"))
          fail(
            400,
            "BUDGET_IMPORT_INVALID",
            "Corrija todas as linhas antes de confirmar",
          );
        await tx.project.update({
          where: { id: projectId, tenantId },
          data: { updatedAt: new Date() },
        });
        let budget = await tx.budget.findFirst({
          where: { ...scope, status: "ACTIVE" },
        });
        if (!budget) {
          budget = await tx.budget.create({
            data: {
              ...scope,
              name: "Orçamento principal",
              createdBy: req.auth.userId,
              updatedBy: req.auth.userId,
            },
          });
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
        }
        await lockBudget(tx, scope);
        let revision = await tx.budgetRevision.findFirst({
          where: { ...scope, budgetId: budget.id, status: "DRAFT" },
        });
        if (
          revision &&
          (await tx.budgetRevisionValue.count({
            where: { tenantId, budgetRevisionId: revision.id },
          })) > 0
        )
          fail(
            409,
            "CONFLICT",
            "Já existe um rascunho com itens. Conclua ou cancele-o antes de importar.",
          );
        revision ??= await allocateRevision(
          tx,
          scope,
          req.auth.userId,
          `Importação: ${job.fileName}`,
        );
        const previous = await tx.budgetRevision.findFirst({
          where: { ...scope, budgetId: budget.id, status: "APPROVED" },
        });
        const previousValues = previous
          ? toLines(
              await tx.budgetRevisionValue.findMany({
                where: {
                  tenantId,
                  budgetId: budget.id,
                  budgetRevisionId: previous.id,
                },
              }),
            )
          : [];
        const historical = await tx.budgetItem.findMany({
          where: { ...scope, budgetId: budget.id },
          orderBy: { updatedAt: "asc" },
        });
        const identities = new Map(historical.map((v) => [v.code, v.id]));
        for (const value of previousValues)
          identities.set(value.code, value.budgetItemId);
        const lines = importLines(checked.rows);
        for (const line of lines)
          if (!identities.has(line.code))
            identities.set(line.code, randomUUID());
        const existing = new Set(historical.map((v) => v.id));
        const byId = new Map(historical.map((v) => [v.id, v]));
        for (const line of lines) {
          const prior = byId.get(identities.get(line.code)!);
          if (prior && prior.itemType !== line.itemType)
            fail(
              400,
              "BUDGET_IMPORT_INVALID",
              "Não altere o tipo de uma identidade existente; utilize outro código.",
            );
        }
        for (let offset = 0; offset < lines.length; offset += 500) {
          const batch = lines.slice(offset, offset + 500);
          await tx.budgetItem.createMany({
            data: batch
              .filter((l) => !existing.has(identities.get(l.code)!))
              .map((l) => ({
                id: identities.get(l.code)!,
                ...scope,
                budgetId: budget.id,
                code: l.code,
                description: l.description,
                itemType: l.itemType,
                unit: l.unit,
                sortOrder: l.sortOrder,
                createdBy: req.auth.userId,
                updatedBy: req.auth.userId,
              })),
          });
        }
        for (let offset = 0; offset < lines.length; offset += 500)
          await tx.budgetRevisionValue.createMany({
            data: lines.slice(offset, offset + 500).map((l) => ({
              ...l,
              budgetItemId: identities.get(l.code)!,
              parentId: l.parentId ? identities.get(l.parentId)! : null,
              tenantId,
              budgetId: budget.id,
              budgetRevisionId: revision!.id,
            })),
          });

        // Synchronize current identity metadata in bulk; historical snapshots stay intact.
        const activeIds = lines.map((line) => identities.get(line.code)!);
        await tx.budgetItem.updateMany({
          where: { ...scope, budgetId: budget.id, id: { notIn: activeIds } },
          data: { isActive: false, updatedBy: req.auth.userId },
        });
        for (let offset = 0; offset < lines.length; offset += 500) {
          const metadata = lines
            .slice(offset, offset + 500)
            .map((line) => ({
              id: identities.get(line.code)!,
              code: line.code,
              description: line.description,
              unit: line.unit,
              parent_id: line.parentId ? identities.get(line.parentId)! : null,
              sort_order: line.sortOrder,
            }));
          await tx.$executeRaw`UPDATE budget_items AS item SET code = value.code, description = value.description, unit = value.unit, parent_id = value.parent_id, sort_order = value.sort_order, is_active = true, updated_at = NOW(), updated_by = ${req.auth.userId}::uuid FROM jsonb_to_recordset(${JSON.stringify(metadata)}::jsonb) AS value(id uuid, code text, description text, unit text, parent_id uuid, sort_order integer) WHERE item.id = value.id AND item.tenant_id = ${tenantId}::uuid AND item.project_id = ${projectId}::uuid AND item.budget_id = ${budget.id}::uuid`;
        }
        revision = await tx.budgetRevision.update({
          where: { tenantId, id: revision.id },
          data: { version: { increment: 1 } },
        });
        const incomingCodes = new Set(lines.map((l) => l.code));
        for (const action of [
          "BUDGET_ITEM_CREATED",
          "BUDGET_ITEM_UPDATED",
          "BUDGET_ITEM_DEACTIVATED",
        ] as const) {
          const affected =
            action === "BUDGET_ITEM_DEACTIVATED"
              ? previousValues.filter((v) => !incomingCodes.has(v.code))
              : lines.filter((l) =>
                  action === "BUDGET_ITEM_CREATED"
                    ? !existing.has(identities.get(l.code)!)
                    : existing.has(identities.get(l.code)!),
                );
          if (affected.length)
            await recordAudit(
              tx,
              req.auth,
              {
                action,
                entityType: "BudgetRevision",
                entityId: revision.id,
                projectId,
                oldValues: { sourceRevisionId: previous?.id ?? null },
                newValues: {
                  importJobId: id,
                  revisionId: revision.id,
                  codes: affected.map((l) => l.code),
                },
              },
              req,
            );
        }
        await tx.budgetImportJob.update({
          where: { tenantId, id },
          data: { budgetId: budget.id, confirmedRevisionId: revision.id },
        });
        await recordAudit(
          tx,
          req.auth,
          {
            action: "BUDGET_REVISION_CREATED",
            entityType: "BudgetRevision",
            entityId: revision.id,
            projectId,
            newValues: {
              revision: revision.code,
              value: checked.total,
              importJobId: id,
            },
          },
          req,
        );
        await recordAudit(
          tx,
          req.auth,
          {
            action: "BUDGET_IMPORT_CONFIRMED",
            entityType: "BudgetImportJob",
            entityId: id,
            projectId,
            newValues: {
              revisionId: revision.id,
              value: checked.total,
              rows: lines.length,
            },
          },
          req,
        );
        return revision;
      },
      { timeout: 120000 },
    );
  }
  async original(req: ApiRequest, projectId: string, id: string) {
    await this.access.check(req, projectId, true);
    const job =
      (await this.db.budgetImportJob.findFirst({
        where: { tenantId: req.auth.tenantId, projectId, id },
      })) ?? fail(404, "RESOURCE_NOT_FOUND", "Importação não encontrada");
    return readOriginal(job.fileStorageKey);
  }
}
