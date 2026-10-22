import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Injectable,
  Module,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import {
  createHash,
  createHmac,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import type { ApiRequest } from "../auth/security.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  assertVersion,
  editable,
} from "../../../../packages/domain/src/commercial.js";
import { Database, fail } from "../platform.js";
import { ScheduleModule } from "../schedule/schedule.module.js";
import { ExecutionAccess } from "../schedule/access.js";
import { claimLog } from "../daily-log/daily-log.service.js";
import { validBudgetItem } from "../schedule/schedule.service.js";
import { recordAudit } from "../audit/audit.module.js";
import { RequestDoc } from "../docs.js";
import { uploadInput } from "../../../../packages/validation/src/daily-log.js";
import { versionInput } from "../../../../packages/validation/src/schedule.js";
import { uuid } from "../../../../packages/validation/src/index.js";
import { configuration } from "../../../../packages/config/src/index.js";
import { maySeeFile } from "../../../../packages/domain/src/daily-log.js";
type Owner =
  | "dailyLog"
  | "expense"
  | "contract"
  | "measurement"
  | "fundingAgreement"
  | "payment"
  | "inspection"
  | "correctiveAction";
const qualityOwner = (owner: Owner) =>
  ["inspection", "correctiveAction"].includes(owner);
const financialOwner = (owner: Owner) =>
  ["measurement", "fundingAgreement", "payment"].includes(owner);
export function ownerWhere(owner: Owner, id: string) {
  return { [`${owner}Id`]: id };
}
function signature(id: string, userId: string, expiry: number) {
  return createHmac("sha256", configuration().JWT_SECRET)
    .update(`upload:${id}:${userId}:${expiry}`)
    .digest("hex");
}
export function fileSignature(bytes: Buffer, mime: string) {
  return mime === "image/png"
    ? bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mime === "image/jpeg"
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : mime === "image/webp"
        ? bytes.subarray(0, 4).toString() === "RIFF" &&
          bytes.subarray(8, 12).toString() === "WEBP"
        : mime === "application/pdf"
          ? bytes.subarray(0, 5).toString() === "%PDF-"
          : false;
}
@Injectable()
export class DocumentService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(ExecutionAccess) readonly access: ExecutionAccess,
  ) {}
  async authorize(
    req: ApiRequest,
    projectId: string,
    owner: Owner,
    write = false,
  ) {
    const result = await this.access.check(
      req,
      projectId,
      write && !financialOwner(owner) && !qualityOwner(owner),
    );
    if (qualityOwner(owner)) {
      if (
        write &&
        !(
          owner === "inspection" ? ["ADMIN", "INSPECTOR"] : ["ADMIN", "MANAGER"]
        ).includes(result.role)
      )
        fail(403, "ACCESS_DENIED", "Sem permissão para evidência de qualidade");
      return result;
    }
    if (financialOwner(owner)) {
      const allowed = write
        ? owner === "measurement"
          ? ["ADMIN", "MANAGER"]
          : ["ADMIN"]
        : owner === "measurement"
          ? ["ADMIN", "MANAGER", "INSPECTOR", "FINANCIER", "CLIENT"]
          : ["ADMIN", "MANAGER", "FINANCIER", "CLIENT"];
      if (!allowed.includes(result.role))
        fail(403, "ACCESS_DENIED", "Sem acesso aos comprovativos financeiros");
      return result;
    }
    if (
      owner !== "dailyLog" &&
      (result.role === "CLIENT" ||
        (owner === "expense" && !["ADMIN", "MANAGER"].includes(result.role)))
    )
      fail(403, "ACCESS_DENIED", "Sem acesso aos comprovativos");
    return result;
  }
  async claimOwner(
    tx: Prisma.TransactionClient,
    scope: { tenantId: string; projectId: string },
    id: string,
    version: number,
    owner: Owner,
    userId: string,
  ) {
    if (qualityOwner(owner)) {
      await tx.$queryRaw`SELECT id FROM projects WHERE tenant_id=${scope.tenantId}::uuid AND id=${scope.projectId}::uuid FOR UPDATE`;
      const row = await this.qualityRecord(tx, scope, id, owner);
      if (!row) fail(404, "RESOURCE_NOT_FOUND", "Origem não encontrada");
      assertVersion(row.version, version);
      if (
        !(
          owner === "inspection"
            ? ["DRAFT", "IN_PROGRESS"]
            : ["OPEN", "IN_PROGRESS", "REJECTED"]
        ).includes(row.status)
      )
        fail(
          409,
          owner === "inspection"
            ? "INSPECTION_IMMUTABLE"
            : "NON_CONFORMITY_IMMUTABLE",
          "Origem não editável",
        );
      if (owner === "correctiveAction") {
        const a = await tx.correctiveAction.findFirstOrThrow({
          where: { ...scope, id },
        });
        const n = await tx.nonConformity.findFirstOrThrow({
          where: { ...scope, id: a.nonConformityId },
        });
        if (n.status !== "CORRECTION_IN_PROGRESS")
          fail(409, "NON_CONFORMITY_IMMUTABLE", "NCR não está em correção");
        await tx.correctiveAction.update({
          where: { id },
          data: { version: { increment: 1 } },
        });
      } else
        await tx.inspection.update({
          where: { id },
          data: { version: { increment: 1 } },
        });
      return { version: row.version, logDate: new Date() };
    }
    if (owner === "dailyLog") return claimLog(tx, scope, id, version);
    if (financialOwner(owner)) {
      const row = await this.financialRecord(tx, scope, id, owner);
      if (!row)
        fail(404, "RESOURCE_NOT_FOUND", "Registo financeiro não encontrado");
      assertVersion(row.version, version);
      if (
        !(
          owner === "payment"
            ? ["POSTED"]
            : owner === "fundingAgreement"
              ? ["DRAFT", "ACTIVE"]
              : ["DRAFT"]
        ).includes(row.status)
      )
        fail(409, "FINANCIAL_RECORD_IMMUTABLE", "Registo não editável");
      const where = { ...scope, id, version },
        data = { version: { increment: 1 }, updatedBy: userId };
      const changed =
        owner === "measurement"
          ? await tx.measurement.updateMany({ where, data })
          : owner === "fundingAgreement"
            ? await tx.fundingAgreement.updateMany({ where, data })
            : await tx.payment.updateMany({ where, data });
      if (changed.count !== 1) assertVersion(-1, 0);
      return { version: row.version, logDate: new Date() };
    }
    const row =
      owner === "expense"
        ? await tx.expense.findFirst({ where: { ...scope, id } })
        : await tx.contract.findFirst({ where: { ...scope, id } });
    if (!row)
      fail(
        404,
        owner === "expense" ? "EXPENSE_NOT_FOUND" : "CONTRACT_NOT_FOUND",
        "Registo não encontrado",
      );
    assertVersion(row.version, version);
    editable(row.status, owner === "expense" ? "EXPENSE" : "CONTRACT");
    const where = { ...scope, id, version };
    const data = { version: { increment: 1 }, updatedBy: userId };
    const changed =
      owner === "expense"
        ? await tx.expense.updateMany({ where, data })
        : await tx.contract.updateMany({ where, data });
    if (changed.count !== 1) assertVersion(-1, 0);
    return { version: row.version, logDate: new Date() };
  }
  qualityRecord(
    tx: Prisma.TransactionClient,
    scope: { tenantId: string; projectId: string },
    id: string,
    owner: Owner,
  ) {
    return owner === "inspection"
      ? tx.inspection.findFirst({ where: { ...scope, id } })
      : tx.correctiveAction.findFirst({ where: { ...scope, id } });
  }
  financialRecord(
    tx: Prisma.TransactionClient,
    scope: { tenantId: string; projectId: string },
    id: string,
    owner: Owner,
  ) {
    return owner === "measurement"
      ? tx.measurement.findFirst({ where: { ...scope, id } })
      : owner === "fundingAgreement"
        ? tx.fundingAgreement.findFirst({ where: { ...scope, id } })
        : tx.payment.findFirst({ where: { ...scope, id } });
  }
  private file(key: string) {
    const base = path.resolve(
        process.env.DOCUMENT_STORAGE_PATH ?? "work/document-storage",
      ),
      target = path.resolve(base, key);
    if (!target.startsWith(base + path.sep))
      fail(400, "ACCESS_DENIED", "Chave inválida");
    return target;
  }
  async ticket(
    req: ApiRequest,
    projectId: string,
    logId: string,
    input: z.infer<typeof uploadInput> & {
      inspectionItemId?: string | null;
      evidenceType?: "PHOTO" | "DOCUMENT" | "DRAWING" | "TEST_RESULT" | "OTHER";
    },
    owner: Owner = "dailyLog",
    documentType:
      | "INVOICE"
      | "RECEIPT"
      | "DELIVERY_NOTE"
      | "PURCHASE_ORDER"
      | "MEASUREMENT_SHEET"
      | "CERTIFICATE"
      | "PAYMENT_PROOF"
      | "DISBURSEMENT_PROOF"
      | "OTHER" = "OTHER",
  ) {
    const { scope } = await this.authorize(req, projectId, owner, true);
    const ext = path.extname(input.fileName).toLowerCase(),
      allowed: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".pdf": "application/pdf",
      };
    if (
      allowed[ext] !== input.mimeType ||
      /[\\/]/.test(input.fileName) ||
      [...input.fileName].some((c) => c.charCodeAt(0) < 32) ||
      (input.isPhoto && input.mimeType === "application/pdf")
    )
      fail(400, "VALIDATION_ERROR", "Formato de ficheiro inválido");
    return this.db.$transaction(async (tx) => {
      const log = await this.claimOwner(
        tx,
        scope,
        logId,
        input.version,
        owner,
        req.auth.userId,
      );
      await validBudgetItem(tx, scope, input.budgetItemId);
      if (
        input.scheduleTaskId &&
        !(await tx.scheduleTask.findFirst({
          where: {
            ...scope,
            id: input.scheduleTaskId,
            status: { not: "CANCELLED" },
          },
        }))
      )
        fail(404, "TASK_NOT_FOUND", "Tarefa não encontrada");
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000),
        id = randomUUID(),
        date = log.logDate.toISOString().slice(0, 10).replaceAll("-", "/");
      const document = await tx.document.create({
        data: {
          ...scope,
          id,
          ...ownerWhere(owner, logId),
          objectKey: `tenant/${scope.tenantId}/projects/${projectId}/daily-logs/${date}/${input.isPhoto ? "photos" : "documents"}/${id}${ext}`,
          fileName: input.fileName,
          mimeType: input.mimeType,
          sizeBytes: BigInt(input.sizeBytes),
          checksum: input.checksum,
          visibility: input.visibility,
          isPhoto: input.isPhoto,
          expiresAt,
          createdBy: req.auth.userId,
        },
      });
      if (qualityOwner(owner)) {
        if (owner === "inspection") {
          if (
            input.inspectionItemId &&
            !(await tx.inspectionItem.findFirst({
              where: {
                ...scope,
                id: input.inspectionItemId,
                inspectionId: logId,
              },
            }))
          )
            fail(404, "RESOURCE_NOT_FOUND", "Item não pertence à inspeção");
          await tx.inspectionEvidence.create({
            data: {
              ...scope,
              inspectionId: logId,
              inspectionItemId: input.inspectionItemId,
              documentId: id,
              caption: input.caption,
              evidenceType:
                input.evidenceType ?? (input.isPhoto ? "PHOTO" : "DOCUMENT"),
              createdBy: req.auth.userId,
            },
          });
        } else
          await tx.correctiveActionEvidence.create({
            data: {
              ...scope,
              correctiveActionId: logId,
              documentId: id,
              caption: input.caption,
              createdBy: req.auth.userId,
            },
          });
      } else if (owner === "expense")
        await tx.expenseDocument.create({
          data: {
            ...scope,
            expenseId: logId,
            documentId: id,
            documentType: documentType as
              | "INVOICE"
              | "RECEIPT"
              | "DELIVERY_NOTE"
              | "PURCHASE_ORDER"
              | "OTHER",
            createdBy: req.auth.userId,
            updatedBy: req.auth.userId,
          },
        });
      else if (owner === "contract")
        await tx.contractDocument.create({
          data: {
            ...scope,
            contractId: logId,
            documentId: id,
            createdBy: req.auth.userId,
            updatedBy: req.auth.userId,
          },
        });
      else if (financialOwner(owner)) {
        const common = {
          ...scope,
          documentId: id,
          documentType: documentType as
            | "MEASUREMENT_SHEET"
            | "CERTIFICATE"
            | "INVOICE"
            | "PAYMENT_PROOF"
            | "DISBURSEMENT_PROOF"
            | "OTHER",
          createdBy: req.auth.userId,
          updatedBy: req.auth.userId,
        };
        if (owner === "measurement")
          await tx.measurementDocument.create({
            data: { ...common, measurementId: logId },
          });
        else if (owner === "fundingAgreement")
          await tx.fundingDocument.create({
            data: { ...common, fundingAgreementId: logId },
          });
        else
          await tx.paymentDocument.create({
            data: { ...common, paymentId: logId },
          });
      } else if (input.isPhoto)
        await tx.dailyLogPhoto.create({
          data: {
            ...scope,
            dailyLogId: logId,
            documentId: id,
            caption: input.caption,
            takenAt: input.takenAt ? new Date(input.takenAt) : null,
            scheduleTaskId: input.scheduleTaskId,
            budgetItemId: input.budgetItemId,
            createdBy: req.auth.userId,
          },
        });
      else
        await tx.dailyLogDocument.create({
          data: {
            ...scope,
            dailyLogId: logId,
            documentId: id,
            createdBy: req.auth.userId,
          },
        });
      const expiry = expiresAt.getTime();
      return {
        id: document.id,
        uploadUrl: `/api/v1/projects/${projectId}/${owner === "inspection" ? "inspections" : owner === "correctiveAction" ? "corrective-actions" : owner === "dailyLog" ? "daily-logs" : owner === "expense" ? "expenses" : owner === "measurement" ? "measurements" : owner === "fundingAgreement" ? "funding-agreements" : owner === "payment" ? "payments" : "contracts"}/${logId}/documents/${id}/upload?expires=${expiry}&signature=${signature(id, req.auth.userId, expiry)}`,
        method: "PUT",
        expiresAt,
        version: log.version + 1,
      };
    });
  }
  async upload(
    req: ApiRequest,
    projectId: string,
    logId: string,
    id: string,
    expires: string,
    sig: string,
    file?: Express.Multer.File,
    owner: Owner = "dailyLog",
  ) {
    const { scope } = await this.authorize(req, projectId, owner, true);
    const expiry = Number(expires),
      expected = signature(id, req.auth.userId, expiry);
    if (
      !Number.isSafeInteger(expiry) ||
      expiry < Date.now() ||
      !sig ||
      !/^[a-f0-9]{64}$/.test(sig) ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    )
      fail(403, "ACCESS_DENIED", "URL expirada ou inválida");
    const document =
      (await this.db.document.findFirst({
        where: {
          ...scope,
          id,
          ...ownerWhere(owner, logId),
          createdBy: req.auth.userId,
          confirmedAt: null,
          deletedAt: null,
        },
      })) ?? fail(404, "PHOTO_NOT_FOUND", "Ficheiro não encontrado");
    if (document.expiresAt.getTime() !== expiry)
      fail(403, "ACCESS_DENIED", "URL inválida");
    if (
      !file ||
      file.size !== Number(document.sizeBytes) ||
      file.mimetype !== document.mimeType ||
      createHash("sha256").update(file.buffer).digest("hex") !==
        document.checksum ||
      !fileSignature(file.buffer, document.mimeType)
    )
      fail(
        400,
        "VALIDATION_ERROR",
        "Tamanho, checksum ou conteúdo do ficheiro inválido",
      );
    const log = qualityOwner(owner)
      ? await this.qualityRecord(this.db, scope, logId, owner)
      : financialOwner(owner)
        ? await this.financialRecord(this.db, scope, logId, owner)
        : owner === "dailyLog"
          ? await this.db.dailyLog.findFirst({ where: { ...scope, id: logId } })
          : owner === "expense"
            ? await this.db.expense.findFirst({
                where: { ...scope, id: logId },
              })
            : await this.db.contract.findFirst({
                where: { ...scope, id: logId },
              });
    if (
      !log ||
      !(
        owner === "inspection"
          ? ["DRAFT", "IN_PROGRESS"]
          : owner === "correctiveAction"
            ? ["OPEN", "IN_PROGRESS", "REJECTED"]
            : owner === "dailyLog"
              ? ["DRAFT", "REOPENED"]
              : owner === "payment"
                ? ["POSTED"]
                : owner === "fundingAgreement"
                  ? ["DRAFT", "ACTIVE"]
                  : ["DRAFT"]
      ).includes(log.status)
    )
      fail(
        409,
        owner === "dailyLog"
          ? "DAILY_LOG_IMMUTABLE"
          : owner === "expense"
            ? "EXPENSE_IMMUTABLE"
            : "CONTRACT_IMMUTABLE",
        "Registo não editável",
      );
    const target = this.file(document.objectKey);
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await writeFile(target, file.buffer, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await readFile(target);
      if (
        createHash("sha256").update(existing).digest("hex") !==
        document.checksum
      )
        fail(409, "CONFLICT", "Upload já existe");
    }
    return { ok: true };
  }
  async confirm(
    req: ApiRequest,
    projectId: string,
    logId: string,
    id: string,
    version: number,
    owner: Owner = "dailyLog",
  ) {
    const { scope } = await this.authorize(req, projectId, owner, true);
    return this.db.$transaction(async (tx) => {
      await this.claimOwner(tx, scope, logId, version, owner, req.auth.userId);
      const document =
        (await tx.document.findFirst({
          where: {
            ...scope,
            id,
            ...ownerWhere(owner, logId),
            createdBy: req.auth.userId,
            confirmedAt: null,
            deletedAt: null,
            expiresAt: { gt: new Date() },
          },
        })) ??
        fail(404, "PHOTO_NOT_FOUND", "Upload não encontrado ou expirado");
      let bytes: Buffer;
      try {
        bytes = await readFile(this.file(document.objectKey));
      } catch {
        return fail(400, "VALIDATION_ERROR", "Upload ainda não recebido");
      }
      if (
        bytes.length !== Number(document.sizeBytes) ||
        createHash("sha256").update(bytes).digest("hex") !==
          document.checksum ||
        !fileSignature(bytes, document.mimeType)
      )
        fail(400, "VALIDATION_ERROR", "Conteúdo inválido");
      await tx.document.update({
        where: { ...scope, id },
        data: { confirmedAt: new Date() },
      });
      await recordAudit(
        tx,
        req.auth,
        {
          action: qualityOwner(owner)
            ? "QUALITY_EVIDENCE_ADDED"
            : financialOwner(owner)
              ? `${owner.toUpperCase()}_DOCUMENT_ATTACHED`
              : owner === "expense"
                ? "EXPENSE_DOCUMENT_ATTACHED"
                : owner === "contract"
                  ? "CONTRACT_DOCUMENT_ATTACHED"
                  : document.isPhoto
                    ? "PHOTO_UPLOADED"
                    : "DOCUMENT_UPLOADED",
          entityType: "Document",
          entityId: id,
          projectId,
          newValues: {
            fileName: document.fileName,
            checksum: document.checksum,
            sizeBytes: document.sizeBytes.toString(),
            visibility: document.visibility,
          },
        },
        req,
      );
      return { id, version: version + 1 };
    });
  }
  async download(
    req: ApiRequest,
    projectId: string,
    logId: string,
    id: string,
    owner: Owner = "dailyLog",
  ) {
    const { scope, role } = await this.authorize(req, projectId, owner);
    const document =
      (await this.db.document.findFirst({
        where: {
          ...scope,
          id,
          ...ownerWhere(owner, logId),
          confirmedAt: { not: null },
          deletedAt: null,
        },
      })) ?? fail(404, "PHOTO_NOT_FOUND", "Ficheiro não encontrado");
    const log = await this.db.dailyLog.findFirst({
      where: { ...scope, id: logId },
    });
    if (
      owner === "dailyLog" &&
      (!maySeeFile(role, document.visibility) ||
        (["CLIENT", "FINANCIER"].includes(role) && log?.status !== "APPROVED"))
    )
      fail(403, "ACCESS_DENIED", "Sem acesso ao ficheiro");
    if (qualityOwner(owner) && !maySeeFile(role, document.visibility))
      fail(403, "ACCESS_DENIED", "Sem acesso à evidência");
    return { document, bytes: await readFile(this.file(document.objectKey)) };
  }
  async remove(
    req: ApiRequest,
    projectId: string,
    logId: string,
    id: string,
    version: number,
    owner: Owner = "dailyLog",
  ) {
    const { scope } = await this.authorize(req, projectId, owner, true);
    return this.db.$transaction(async (tx) => {
      await this.claimOwner(tx, scope, logId, version, owner, req.auth.userId);
      const document =
        (await tx.document.findFirst({
          where: { ...scope, id, ...ownerWhere(owner, logId), deletedAt: null },
        })) ?? fail(404, "PHOTO_NOT_FOUND", "Ficheiro não encontrado");
      await tx.document.update({
        where: { ...scope, id },
        data: { deletedAt: new Date() },
      });
      await recordAudit(
        tx,
        req.auth,
        {
          action: document.isPhoto ? "PHOTO_DELETED" : "DOCUMENT_DELETED",
          entityType: "Document",
          entityId: id,
          projectId,
          newValues: { deleted: true },
        },
        req,
      );
      return { ok: true, version: version + 1 };
    });
  }
}
@ApiTags("Documents")
@Controller("api/v1/projects/:projectId/daily-logs/:dailyLogId")
class DocumentController {
  constructor(@Inject(DocumentService) readonly service: DocumentService) {}
  @Post("photos") @RequestDoc(uploadInput) photo(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("dailyLogId") l: string,
    @Body() b: unknown,
  ) {
    return this.service.ticket(
      r,
      uuid.parse(p),
      uuid.parse(l),
      uploadInput.parse(b),
    );
  }
  @Post("documents") @RequestDoc(uploadInput) ticket(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("dailyLogId") l: string,
    @Body() b: unknown,
  ) {
    return this.service.ticket(
      r,
      uuid.parse(p),
      uuid.parse(l),
      uploadInput.parse(b),
    );
  }
  @Put("documents/:id/upload")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  upload(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("dailyLogId") l: string,
    @Param("id") id: string,
    @Query("expires") expires: string,
    @Query("signature") sig: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.upload(
      r,
      uuid.parse(p),
      uuid.parse(l),
      uuid.parse(id),
      expires,
      sig,
      file,
    );
  }
  @Post("documents/:id/confirm") @RequestDoc(versionInput) confirm(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("dailyLogId") l: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.confirm(
      r,
      uuid.parse(p),
      uuid.parse(l),
      uuid.parse(id),
      versionInput.parse(b).version,
    );
  }
  @Get("documents/:id/content") async content(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("dailyLogId") l: string,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const { document, bytes } = await this.service.download(
      r,
      uuid.parse(p),
      uuid.parse(l),
      uuid.parse(id),
    );
    res.setHeader("Content-Type", document.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.send(bytes);
  }
  @Delete("documents/:id") @RequestDoc(versionInput) remove(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("dailyLogId") l: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.remove(
      r,
      uuid.parse(p),
      uuid.parse(l),
      uuid.parse(id),
      versionInput.parse(b).version,
    );
  }
}
@Module({
  imports: [ScheduleModule],
  providers: [DocumentService],
  controllers: [DocumentController],
  exports: [DocumentService],
})
export class DocumentModule {}
