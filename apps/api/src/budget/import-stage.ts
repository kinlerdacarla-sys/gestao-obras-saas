import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import {
  validateImport,
  type ImportFields,
} from "../../../../packages/domain/src/budget-import.js";
import {
  defaultMapping,
  mapCells,
  readWorkbook,
  type ColumnMapping,
} from "./excel.js";
import { checksum, readOriginal } from "./storage.js";
import { recordAudit } from "../audit/audit.module.js";
import { fromBuffer } from "yauzl";
export function verifyZip(buffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(new Error("XLSX inválido"));
      let size = 0,
        count = 0;
      zip.on("entry", (entry) => {
        size += entry.uncompressedSize;
        count++;
        if (
          size > 64 * 1024 * 1024 ||
          count > 2000 ||
          entry.generalPurposeBitFlag & 1
        ) {
          zip.close();
          reject(new Error("Ficheiro excede os limites de segurança"));
          return;
        }
        zip.readEntry();
      });
      zip.on("error", reject);
      zip.on("end", resolve);
      zip.readEntry();
    });
  });
}
export interface RawImportRow {
  rowNumber: number;
  cells: Record<string, string>;
  fields: ImportFields;
}
export async function persistPreview(
  tx: Prisma.TransactionClient,
  tenantId: string,
  id: string,
  input: RawImportRow[],
) {
  const validation = validateImport(
    input.map((r) => ({ rowNumber: r.rowNumber, fields: r.fields })),
  );
  await tx.budgetImportRow.deleteMany({ where: { tenantId, importJobId: id } });
  const raw = new Map(input.map((r) => [r.rowNumber, r]));
  for (let offset = 0; offset < validation.rows.length; offset += 500)
    await tx.budgetImportRow.createMany({
      data: validation.rows.slice(offset, offset + 500).map((row) => ({
        tenantId,
        importJobId: id,
        rowNumber: row.rowNumber,
        code: row.fields.code,
        description: row.fields.description,
        unit: row.fields.unit || null,
        quantity:
          row.status === "INVALID" || row.fields.itemType === "GROUP"
            ? null
            : row.fields.quantity,
        unitPrice:
          row.status === "INVALID" || row.fields.itemType === "GROUP"
            ? null
            : row.fields.unitPrice,
        parentCode: row.fields.parentCode ?? null,
        itemType: row.fields.itemType === "GROUP" ? "GROUP" : "ITEM",
        status: row.status,
        errors: [...row.errors, ...row.warnings],
        rawData: JSON.parse(
          JSON.stringify({
            cells: raw.get(row.rowNumber)!.cells,
            fields: raw.get(row.rowNumber)!.fields,
          }),
        ) as Prisma.InputJsonValue,
      })),
    });
  return tx.budgetImportJob.update({
    where: { id, tenantId },
    data: {
      status: "READY",
      totalRows: validation.rows.length,
      validRows: validation.rows.filter((r) => r.status !== "INVALID").length,
      invalidRows: validation.rows.filter((r) => r.status === "INVALID").length,
      previewTotal: validation.total,
      processedAt: new Date(),
      errorMessage: null,
    },
  });
}
export async function processBudgetImport(
  db: PrismaClient,
  payload: {
    tenantId: string;
    projectId: string;
    importJobId: string;
    version: number;
  },
) {
  const { tenantId, projectId, importJobId: id, version } = payload;
  const job = await db.budgetImportJob.findFirst({
    where: { tenantId, projectId, id, version },
  });
  if (!job || ["READY", "CONFIRMED", "CANCELLED"].includes(job.status)) return;
  await db.budgetImportJob.updateMany({
    where: {
      tenantId,
      projectId,
      id,
      version,
      status: { in: ["UPLOADED", "PROCESSING", "FAILED"] },
    },
    data: { status: "PROCESSING" },
  });
  try {
    const buffer = await readOriginal(job.fileStorageKey);
    if (checksum(buffer) !== job.fileChecksum)
      throw new Error("Checksum do ficheiro original divergente");
    await verifyZip(buffer);
    const parsed = await readWorkbook(buffer),
      mapping =
        (job.mapping as ColumnMapping | null) ?? defaultMapping(parsed.headers);
    await db.$transaction(
      async (tx) => {
        const locked = await tx.budgetImportJob.updateMany({
          where: { tenantId, projectId, id, version, status: "PROCESSING" },
          data: { status: "PROCESSING" },
        });
        if (!locked.count) return;
        await tx.budgetImportJob.update({
          where: { tenantId, id },
          data: { headers: parsed.headers, mapping },
        });
        await persistPreview(
          tx,
          tenantId,
          id,
          parsed.rows.map((r) => ({
            ...r,
            fields: mapCells(r.cells, mapping),
          })),
        );
      },
      { timeout: 120000 },
    );
  } catch (error) {
    await db.$transaction(async (tx) => {
      const changed = await tx.budgetImportJob.updateMany({
        where: { tenantId, projectId, id, version, status: "PROCESSING" },
        data: {
          status: "FAILED",
          errorMessage: (error as Error).message.slice(0, 500),
        },
      });
      if (changed.count)
        await recordAudit(
          tx,
          { tenantId, userId: job.createdBy },
          {
            action: "BUDGET_IMPORT_FAILED",
            entityType: "BudgetImportJob",
            entityId: id,
            projectId,
            newValues: { error: (error as Error).message.slice(0, 500) },
          },
        );
    });
    throw error;
  }
}
