import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import type { ApiRequest } from "../auth/security.js";
import { uuid } from "../../../../packages/validation/src/index.js";
import {
  budgetSchema,
  revisionSchema,
  revisionPatchSchema,
  versionSchema,
  rejectSchema,
  itemCreateSchema,
  itemPatchSchema,
  deleteItemSchema,
  pagingSchema,
  mappingSchema,
  rowPatchSchema,
} from "../../../../packages/validation/src/budget.js";
import { BudgetService } from "./budget.service.js";
import { BudgetItemService } from "./budget-item.service.js";
import { BudgetImportService } from "./import.service.js";
import { exportWorkbook, templateWorkbook } from "./excel.js";
import { RequestDoc } from "../docs.js";
import { recordAudit } from "../audit/audit.module.js";
import type { BudgetNode } from "../../../../packages/domain/src/budget.js";
const xlsx =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
@ApiTags("Budget")
@Controller("api/v1/projects/:projectId/budget")
export class BudgetController {
  constructor(
    @Inject(BudgetService) readonly budgets: BudgetService,
    @Inject(BudgetItemService) readonly items: BudgetItemService,
    @Inject(BudgetImportService) readonly imports: BudgetImportService,
  ) {}
  @Get() summary(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
  ) {
    return this.budgets.summary(req, uuid.parse(projectId));
  }
  @Post() @RequestDoc(budgetSchema) create(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ) {
    return this.budgets.create(
      req,
      uuid.parse(projectId),
      budgetSchema.parse(body),
    );
  }
  @Get("tree") tree(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Query("revisionId") id?: string,
  ) {
    return this.budgets.tree(
      req,
      uuid.parse(projectId),
      id ? uuid.parse(id) : undefined,
    );
  }
  @Get("items") async listItems(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Query() query: Record<string, string>,
  ) {
    const { page, limit } = pagingSchema.parse(query);
    const tree = await this.budgets.tree(
      req,
      uuid.parse(projectId),
      query.revisionId ? uuid.parse(query.revisionId) : undefined,
    );
    const rows: Omit<BudgetNode, "children">[] = [];
    const stack = [...tree.items].reverse();
    while (stack.length) {
      const { children, ...row } = stack.pop()!;
      rows.push(row);
      stack.push(...children.reverse());
    }
    return {
      data: rows.slice((page - 1) * limit, page * limit),
      meta: {
        page,
        limit,
        total: rows.length,
        totalPages: Math.ceil(rows.length / limit),
      },
    };
  }
  @Post("items") @RequestDoc(itemCreateSchema) addItem(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ) {
    return this.items.save(
      req,
      uuid.parse(projectId),
      itemCreateSchema.parse(body),
    );
  }
  @Patch("items/:itemId") @RequestDoc(itemPatchSchema) patchItem(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Param("itemId") itemId: string,
    @Body() body: unknown,
  ) {
    return this.items.save(
      req,
      uuid.parse(projectId),
      itemPatchSchema.parse(body),
      uuid.parse(itemId),
    );
  }
  @Delete("items/:itemId") @RequestDoc(deleteItemSchema) deleteItem(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Param("itemId") itemId: string,
    @Body() body: unknown,
  ) {
    const input = deleteItemSchema.parse(body);
    return this.items.remove(
      req,
      uuid.parse(projectId),
      uuid.parse(itemId),
      input.revisionId,
      input.version,
    );
  }
  @Get("revisions") revisions(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Query() query: Record<string, string>,
  ) {
    const { page, limit } = pagingSchema.parse(query);
    return this.budgets.list(req, uuid.parse(projectId), page, limit);
  }
  @Post("revisions") @RequestDoc(revisionSchema) createRevision(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ) {
    return this.budgets.createRevision(
      req,
      uuid.parse(projectId),
      revisionSchema.parse(body),
    );
  }
  @Get("revisions/compare") compare(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Query("fromRevisionId") from: string,
    @Query("toRevisionId") to: string,
    @Query() query: Record<string, string>,
  ) {
    const { page, limit } = pagingSchema.parse(query);
    return this.budgets.compare(
      req,
      uuid.parse(projectId),
      uuid.parse(from),
      uuid.parse(to),
      page,
      limit,
    );
  }
  @Get("revisions/:revisionId") revision(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Param("revisionId") id: string,
  ) {
    return this.budgets.revision(req, uuid.parse(projectId), uuid.parse(id));
  }
  @Patch("revisions/:revisionId") @RequestDoc(revisionPatchSchema) patch(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Param("revisionId") id: string,
    @Body() body: unknown,
  ) {
    const input = revisionPatchSchema.parse(body);
    return this.budgets.patch(
      req,
      uuid.parse(projectId),
      uuid.parse(id),
      input.version,
      input.description,
    );
  }
  @Post("revisions/:revisionId/submit") @RequestDoc(versionSchema) submit(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Param("revisionId") id: string,
    @Body() body: unknown,
  ) {
    return this.budgets.transition(
      req,
      uuid.parse(projectId),
      uuid.parse(id),
      versionSchema.parse(body).version,
      "SUBMITTED",
    );
  }
  @Post("revisions/:revisionId/approve") @RequestDoc(versionSchema) approve(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Param("revisionId") id: string,
    @Body() body: unknown,
  ) {
    return this.budgets.transition(
      req,
      uuid.parse(projectId),
      uuid.parse(id),
      versionSchema.parse(body).version,
      "APPROVED",
    );
  }
  @Post("revisions/:revisionId/reject") @RequestDoc(rejectSchema) reject(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Param("revisionId") id: string,
    @Body() body: unknown,
  ) {
    const input = rejectSchema.parse(body);
    return this.budgets.transition(
      req,
      uuid.parse(projectId),
      uuid.parse(id),
      input.version,
      "REJECTED",
      input.reason,
    );
  }
  @Post("revisions/:revisionId/cancel") @RequestDoc(versionSchema) cancel(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Param("revisionId") id: string,
    @Body() body: unknown,
  ) {
    return this.budgets.transition(
      req,
      uuid.parse(projectId),
      uuid.parse(id),
      versionSchema.parse(body).version,
      "CANCELLED",
    );
  }
  @Get("revisions/:revisionId/export") @ApiProduces(xlsx) async export(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Param("revisionId") id: string,
    @Res() res: Response,
  ) {
    const revision = await this.budgets.revision(
      req,
      uuid.parse(projectId),
      uuid.parse(id),
    );
    const project = await this.budgets.db.project.findFirstOrThrow({
      where: { tenantId: req.auth.tenantId, id: projectId },
    });
    const buffer = await exportWorkbook(revision.items);
    await recordAudit(
      this.budgets.db,
      req.auth,
      {
        action: "BUDGET_EXPORTED",
        entityType: "BudgetRevision",
        entityId: id,
        projectId,
        newValues: { revision: revision.code, value: revision.total },
      },
      req,
    );
    res
      .type(xlsx)
      .attachment(
        `Orcamento_${project.code.replace(/[^a-zA-Z0-9_-]/g, "_")}_${revision.code}.xlsx`,
      )
      .send(buffer);
  }
  @Get("import/template") @ApiProduces(xlsx) async template(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Res() res: Response,
  ) {
    await this.budgets.access.check(req, uuid.parse(projectId), true);
    res
      .type(xlsx)
      .attachment("budget-import-template.xlsx")
      .send(await templateWorkbook());
  }
  @Post("imports")
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @ApiOperation({
    summary: "Upload XLSX até 10 MiB; processamento assíncrono no worker",
  })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.imports.upload(req, uuid.parse(projectId), file);
  }
  @Get("imports/:importJobId") job(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Param("importJobId") id: string,
    @Query() query: Record<string, string>,
  ) {
    const { page, limit } = pagingSchema.parse(query);
    const status = query.status
      ? z.enum(["VALID", "INVALID", "WARNING"]).parse(query.status)
      : undefined;
    return this.imports.get(
      req,
      uuid.parse(projectId),
      uuid.parse(id),
      page,
      limit,
      status,
    );
  }
  @Patch("imports/:importJobId/mapping") @RequestDoc(mappingSchema) mapping(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Param("importJobId") id: string,
    @Body() body: unknown,
  ) {
    const input = mappingSchema.parse(body);
    return this.imports.correct(
      req,
      uuid.parse(projectId),
      uuid.parse(id),
      input.version,
      { mapping: input.mapping },
    );
  }
  @Patch("imports/:importJobId/rows/:rowNumber")
  @RequestDoc(rowPatchSchema)
  row(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Param("importJobId") id: string,
    @Param("rowNumber") rowNumber: string,
    @Body() body: unknown,
  ) {
    const input = rowPatchSchema.parse(body);
    return this.imports.correct(
      req,
      uuid.parse(projectId),
      uuid.parse(id),
      input.version,
      {
        rowNumber: z.coerce.number().int().min(2).parse(rowNumber),
        data: input.data,
      },
    );
  }
  @Post("imports/:importJobId/confirm") @RequestDoc(versionSchema) confirm(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Param("importJobId") id: string,
    @Body() body: unknown,
  ) {
    return this.imports.confirm(
      req,
      uuid.parse(projectId),
      uuid.parse(id),
      versionSchema.parse(body).version,
    );
  }
  @Post("imports/:importJobId/retry") @RequestDoc(versionSchema) retry(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Param("importJobId") id: string,
    @Body() body: unknown,
  ) {
    return this.imports.retry(
      req,
      uuid.parse(projectId),
      uuid.parse(id),
      versionSchema.parse(body).version,
    );
  }
  @Get("imports/:importJobId/original") @ApiProduces(xlsx) async original(
    @Req() req: ApiRequest,
    @Param("projectId") projectId: string,
    @Param("importJobId") id: string,
    @Res() res: Response,
  ) {
    res
      .type(xlsx)
      .attachment("original.xlsx")
      .send(
        await this.imports.original(req, uuid.parse(projectId), uuid.parse(id)),
      );
  }
}
