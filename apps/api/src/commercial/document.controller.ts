import {
  Body,
  Controller,
  Get,
  Inject,
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
import type { ApiRequest } from "../auth/security.js";
import { fail } from "../platform.js";
import { document as financialDocument } from "../../../../packages/validation/src/financial.js";
import { DocumentService, ownerWhere } from "../document/document.module.js";
import { RequestDoc } from "../docs.js";
import {
  documentInput,
  actionInput,
} from "../../../../packages/validation/src/commercial.js";
import { uuid } from "../../../../packages/validation/src/index.js";
const owner = (kind: string) =>
  kind === "expenses"
    ? "expense"
    : kind === "contracts"
      ? "contract"
      : kind === "measurements"
        ? "measurement"
        : kind === "funding-agreements"
          ? "fundingAgreement"
          : kind === "payments"
            ? "payment"
            : fail(404, "RESOURCE_NOT_FOUND", "Recurso não encontrado");
@ApiTags("Commercial documents")
@Controller("api/v1/projects/:projectId/:kind/:ownerId/documents")
export class CommercialDocumentController {
  constructor(@Inject(DocumentService) readonly s: DocumentService) {}
  @Get() async list(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("kind") k: string,
    @Param("ownerId") id: string,
  ) {
    const o = owner(k),
      { scope } = await this.s.authorize(r, uuid.parse(p), o);
    const record = ["measurement", "fundingAgreement", "payment"].includes(o)
      ? await this.s.financialRecord(this.s.db, scope, uuid.parse(id), o)
      : o === "expense"
        ? await this.s.db.expense.findFirst({
            where: { ...scope, id: uuid.parse(id) },
          })
        : await this.s.db.contract.findFirst({
            where: { ...scope, id: uuid.parse(id) },
          });
    if (!record)
      fail(
        404,
        o === "expense" ? "EXPENSE_NOT_FOUND" : "CONTRACT_NOT_FOUND",
        "Registo não encontrado",
      );
    return {
      items: (
        await this.s.db.document.findMany({
          where: {
            ...scope,
            ...ownerWhere(o, uuid.parse(id)),
            confirmedAt: { not: null },
            deletedAt: null,
          },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
        })
      ).map((x) => ({ ...x, sizeBytes: x.sizeBytes.toString() })),
    };
  }
  @Post() @RequestDoc(documentInput) ticket(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("kind") k: string,
    @Param("ownerId") id: string,
    @Body() b: unknown,
  ) {
    const i = ["measurements", "funding-agreements", "payments"].includes(k)
      ? financialDocument.parse(b)
      : documentInput.parse(b);
    return this.s.ticket(
      r,
      uuid.parse(p),
      uuid.parse(id),
      { ...i, visibility: "INTERNAL", isPhoto: false },
      owner(k),
      i.documentType,
    );
  }
  @Put(":id/upload")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  upload(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("kind") k: string,
    @Param("ownerId") id: string,
    @Param("id") doc: string,
    @Query("expires") expires: string,
    @Query("signature") sig: string,
    @UploadedFile() f?: Express.Multer.File,
  ) {
    return this.s.upload(
      r,
      uuid.parse(p),
      uuid.parse(id),
      uuid.parse(doc),
      expires,
      sig,
      f,
      owner(k),
    );
  }
  @Post(":id/confirm") @RequestDoc(actionInput) confirm(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("kind") k: string,
    @Param("ownerId") id: string,
    @Param("id") doc: string,
    @Body() b: unknown,
  ) {
    return this.s.confirm(
      r,
      uuid.parse(p),
      uuid.parse(id),
      uuid.parse(doc),
      actionInput.parse(b).version,
      owner(k),
    );
  }
  @Get(":id/content") async content(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("kind") k: string,
    @Param("ownerId") id: string,
    @Param("id") doc: string,
    @Res() res: Response,
  ) {
    const { document, bytes } = await this.s.download(
      r,
      uuid.parse(p),
      uuid.parse(id),
      uuid.parse(doc),
      owner(k),
    );
    res.setHeader("Content-Type", document.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.send(bytes);
  }
}
