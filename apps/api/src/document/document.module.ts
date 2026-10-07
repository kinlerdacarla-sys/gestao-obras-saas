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
    input: z.infer<typeof uploadInput>,
  ) {
    const { scope } = await this.access.check(req, projectId, true);
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
      const log = await claimLog(tx, scope, logId, input.version);
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
          dailyLogId: logId,
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
      if (input.isPhoto)
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
        uploadUrl: `/api/v1/projects/${projectId}/daily-logs/${logId}/documents/${id}/upload?expires=${expiry}&signature=${signature(id, req.auth.userId, expiry)}`,
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
  ) {
    const { scope } = await this.access.check(req, projectId, true);
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
          dailyLogId: logId,
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
    const log = await this.db.dailyLog.findFirst({
      where: { ...scope, id: logId },
    });
    if (!log || !["DRAFT", "REOPENED"].includes(log.status))
      fail(409, "DAILY_LOG_IMMUTABLE", "Diário não editável");
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
  ) {
    const { scope } = await this.access.check(req, projectId, true);
    return this.db.$transaction(async (tx) => {
      await claimLog(tx, scope, logId, version);
      const document =
        (await tx.document.findFirst({
          where: {
            ...scope,
            id,
            dailyLogId: logId,
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
          action: document.isPhoto ? "PHOTO_UPLOADED" : "DOCUMENT_UPLOADED",
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
  ) {
    const { scope, role } = await this.access.check(req, projectId);
    const document =
      (await this.db.document.findFirst({
        where: {
          ...scope,
          id,
          dailyLogId: logId,
          confirmedAt: { not: null },
          deletedAt: null,
        },
      })) ?? fail(404, "PHOTO_NOT_FOUND", "Ficheiro não encontrado");
    const log = await this.db.dailyLog.findFirst({
      where: { ...scope, id: logId },
    });
    if (
      !maySeeFile(role, document.visibility) ||
      (["CLIENT", "FINANCIER"].includes(role) && log?.status !== "APPROVED")
    )
      fail(403, "ACCESS_DENIED", "Sem acesso ao ficheiro");
    return { document, bytes: await readFile(this.file(document.objectKey)) };
  }
  async remove(
    req: ApiRequest,
    projectId: string,
    logId: string,
    id: string,
    version: number,
  ) {
    const { scope } = await this.access.check(req, projectId, true);
    return this.db.$transaction(async (tx) => {
      await claimLog(tx, scope, logId, version);
      const document =
        (await tx.document.findFirst({
          where: { ...scope, id, dailyLogId: logId, deletedAt: null },
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
