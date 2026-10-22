import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { ApiRequest } from "../auth/security.js";
import { RequestDoc } from "../docs.js";
import { uuid } from "../../../../packages/validation/src/index.js";
import * as v from "../../../../packages/validation/src/quality.js";
import { QualityService } from "./quality.service.js";
import {
  DocumentModule,
  DocumentService,
} from "../document/document.module.js";
import { ScheduleModule } from "../schedule/schedule.module.js";
import { maySeeFile } from "../../../../packages/domain/src/daily-log.js";
@ApiTags("Quality")
@Controller("api/v1/projects/:projectId")
class QualityController {
  constructor(
    @Inject(QualityService) readonly s: QualityService,
    @Inject(DocumentService) readonly documents: DocumentService,
  ) {}
  @Get("quality/options") options(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
  ) {
    return this.s.options(r, uuid.parse(p));
  }
  @Get("quality/summary") summary(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Query() raw: unknown,
  ) {
    const q = v.query.parse(raw);
    return this.s.summary(r, uuid.parse(p), q);
  }
  @Get("quality/trends") trends(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Query() raw: unknown,
  ) {
    const q = v.query.parse(raw);
    return this.s.trends(r, uuid.parse(p), q);
  }
  @Get("quality/policy") policy(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
  ) {
    return this.s.policy(r, uuid.parse(p));
  }
  @Patch("quality/policy") @RequestDoc(v.policy) setPolicy(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Body() raw: unknown,
  ) {
    const b = v.policy.parse(raw);
    return this.s.setPolicy(r, uuid.parse(p), b);
  }
  @Get("quality/indicators/:kind/:id") indicators(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("kind") kind: string,
    @Param("id") id: string,
  ) {
    return this.s.indicators(r, uuid.parse(p), kind, uuid.parse(id));
  }
  @Get("quality/report") report(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
  ) {
    return this.s.report(r, uuid.parse(p), "quality");
  }
  @Get("inspection-requests") requests(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Query() raw: unknown,
  ) {
    const q = v.query.parse(raw);
    return this.s.requests(r, uuid.parse(p), q);
  }
  @Post("inspection-requests") @RequestDoc(v.request) createRequest(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Body() raw: unknown,
  ) {
    const b = v.request.parse(raw);
    return this.s.saveRequest(r, uuid.parse(p), b);
  }
  @Get("inspection-requests/:id") request(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
  ) {
    return this.s.request(r, uuid.parse(p), uuid.parse(id));
  }
  @Patch("inspection-requests/:id") @RequestDoc(v.requestPatch) patchRequest(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.requestPatch.parse(raw);
    return this.s.saveRequest(r, uuid.parse(p), b, uuid.parse(id));
  }
  @Post("inspection-requests/:id/submit") @RequestDoc(v.action) requestSubmit(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.action.parse(raw);
    return this.s.requestAction(r, uuid.parse(p), uuid.parse(id), "submit", b);
  }
  @Post("inspection-requests/:id/schedule")
  @RequestDoc(v.schedule)
  requestSchedule(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.schedule.parse(raw);
    return this.s.requestAction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "schedule",
      b,
    );
  }
  @Post("inspection-requests/:id/cancel") @RequestDoc(v.action) requestCancel(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.action.parse(raw);
    return this.s.requestAction(r, uuid.parse(p), uuid.parse(id), "cancel", b);
  }
  @Get("inspections") inspections(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Query() raw: unknown,
  ) {
    const q = v.query.parse(raw);
    return this.s.inspections(r, uuid.parse(p), q);
  }
  @Post("inspections") @RequestDoc(v.inspection) createInspection(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Body() raw: unknown,
  ) {
    const b = v.inspection.parse(raw);
    return this.s.saveInspection(r, uuid.parse(p), b);
  }
  @Get("inspections/:id") inspection(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
  ) {
    return this.s.inspection(r, uuid.parse(p), uuid.parse(id));
  }
  @Get("inspections/:id/items") items(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
  ) {
    return this.s
      .inspection(r, uuid.parse(p), uuid.parse(id))
      .then((x) => ({ items: x.items }));
  }
  @Patch("inspections/:id") @RequestDoc(v.inspectionPatch) patchInspection(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.inspectionPatch.parse(raw);
    return this.s.saveInspection(r, uuid.parse(p), b, uuid.parse(id));
  }
  @Patch("inspections/:id/items/:itemId") @RequestDoc(v.answer) answer(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() raw: unknown,
  ) {
    const b = v.answer.parse(raw);
    return this.s.answer(
      r,
      uuid.parse(p),
      uuid.parse(id),
      uuid.parse(itemId),
      b,
    );
  }
  @Post("inspections/:id/start") @RequestDoc(v.action) inspectionStart(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.action.parse(raw);
    return this.s.inspectionAction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "start",
      b,
    );
  }
  @Post("inspections/:id/submit") @RequestDoc(v.action) inspectionSubmit(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.action.parse(raw);
    return this.s.inspectionAction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "submit",
      b,
    );
  }
  @Post("inspections/:id/close") @RequestDoc(v.action) inspectionClose(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.action.parse(raw);
    return this.s.inspectionAction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "close",
      b,
    );
  }
  @Post("inspections/:id/cancel") @RequestDoc(v.action) inspectionCancel(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.action.parse(raw);
    return this.s.inspectionAction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "cancel",
      b,
    );
  }
  @Post("inspections/:id/items/:itemId/release-hold-point")
  @RequestDoc(v.action)
  release(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() raw: unknown,
  ) {
    const b = v.action.parse(raw);
    return this.s.inspectionAction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "release-hold-point",
      b,
      uuid.parse(itemId),
    );
  }
  @Get("inspections/:id/report") inspectionReport(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
  ) {
    return this.s.report(r, uuid.parse(p), "inspection", uuid.parse(id));
  }
  @Get("non-conformities") ncrs(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Query() raw: unknown,
  ) {
    const q = v.query.parse(raw);
    return this.s.ncrs(r, uuid.parse(p), q);
  }
  @Post("non-conformities") @RequestDoc(v.ncr) createNcr(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Body() raw: unknown,
  ) {
    const b = v.ncr.parse(raw);
    return this.s.saveNcr(r, uuid.parse(p), b);
  }
  @Post("daily-log-occurrences/:id/create-non-conformity")
  @RequestDoc(v.ncr)
  fromOccurrence(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.ncr.parse(raw);
    return this.s.saveNcr(r, uuid.parse(p), b, undefined, uuid.parse(id));
  }
  @Get("non-conformities/:id") ncr(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
  ) {
    return this.s.ncr(r, uuid.parse(p), uuid.parse(id));
  }
  @Patch("non-conformities/:id") @RequestDoc(v.ncrPatch) patchNcr(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.ncrPatch.parse(raw);
    return this.s.saveNcr(r, uuid.parse(p), b, uuid.parse(id));
  }
  @Post("non-conformities/:id/assign") @RequestDoc(v.assignment) ncrAssign(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.assignment.parse(raw);
    return this.s.ncrAction(r, uuid.parse(p), uuid.parse(id), "assign", b);
  }
  @Post("non-conformities/:id/start-correction")
  @RequestDoc(v.action)
  ncrStartCorrection(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.action.parse(raw);
    return this.s.ncrAction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "start-correction",
      b,
    );
  }
  @Post("non-conformities/:id/ready-for-verification")
  @RequestDoc(v.action)
  ncrReadyForVerification(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.action.parse(raw);
    return this.s.ncrAction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "ready-for-verification",
      b,
    );
  }
  @Post("non-conformities/:id/verify") @RequestDoc(v.action) ncrVerify(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.action.parse(raw);
    return this.s.ncrAction(r, uuid.parse(p), uuid.parse(id), "verify", b);
  }
  @Post("non-conformities/:id/reject-correction")
  @RequestDoc(v.action)
  ncrRejectCorrection(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.action.parse(raw);
    return this.s.ncrAction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "reject-correction",
      b,
    );
  }
  @Post("non-conformities/:id/close") @RequestDoc(v.action) ncrClose(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.action.parse(raw);
    return this.s.ncrAction(r, uuid.parse(p), uuid.parse(id), "close", b);
  }
  @Post("non-conformities/:id/reopen") @RequestDoc(v.action) ncrReopen(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.action.parse(raw);
    return this.s.ncrAction(r, uuid.parse(p), uuid.parse(id), "reopen", b);
  }
  @Post("non-conformities/:id/cancel") @RequestDoc(v.action) ncrCancel(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.action.parse(raw);
    return this.s.ncrAction(r, uuid.parse(p), uuid.parse(id), "cancel", b);
  }
  @Post("non-conformities/:id/comments") @RequestDoc(v.comment) comment(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.comment.parse(raw);
    return this.s.addComment(r, uuid.parse(p), uuid.parse(id), b);
  }
  @Get("non-conformities/:id/report") ncrReport(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
  ) {
    return this.s.report(r, uuid.parse(p), "ncr", uuid.parse(id));
  }
  @Get("non-conformities/:id/corrective-actions") actions(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
  ) {
    return this.s
      .ncr(r, uuid.parse(p), uuid.parse(id))
      .then((x) => ({ items: x.actions }));
  }
  @Post("non-conformities/:id/corrective-actions")
  @RequestDoc(v.correctiveAction)
  createAction(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.correctiveAction.parse(raw);
    return this.s.saveCorrective(r, uuid.parse(p), uuid.parse(id), b);
  }
  @Get("corrective-actions/:id") corrective(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
  ) {
    return this.s.corrective(r, uuid.parse(p), uuid.parse(id));
  }
  @Patch("corrective-actions/:id") @RequestDoc(v.correctivePatch) patchAction(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.correctivePatch.parse(raw);
    return this.s.saveCorrective(
      r,
      uuid.parse(p),
      undefined,
      b,
      uuid.parse(id),
    );
  }
  @Post("corrective-actions/:id/start") @RequestDoc(v.action) correctiveStart(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.action.parse(raw);
    return this.s.correctiveAction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "start",
      b,
    );
  }
  @Post("corrective-actions/:id/complete")
  @RequestDoc(v.completion)
  correctiveComplete(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.completion.parse(raw);
    return this.s.correctiveAction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "complete",
      b,
    );
  }
  @Post("corrective-actions/:id/verify") @RequestDoc(v.action) correctiveVerify(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.action.parse(raw);
    return this.s.correctiveAction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "verify",
      b,
    );
  }
  @Post("corrective-actions/:id/reject") @RequestDoc(v.action) correctiveReject(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.action.parse(raw);
    return this.s.correctiveAction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "reject",
      b,
    );
  }
  @Post("corrective-actions/:id/cancel") @RequestDoc(v.action) correctiveCancel(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.action.parse(raw);
    return this.s.correctiveAction(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "cancel",
      b,
    );
  }
  @Post("inspections/:id/evidence") @RequestDoc(v.evidence) inspectionEvidence(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.evidence.parse(raw);
    return this.documents.ticket(
      r,
      uuid.parse(p),
      uuid.parse(id),
      b,
      "inspection",
    );
  }
  @Delete("inspections/:id/evidence/:doc")
  @RequestDoc(v.action)
  inspectionRemove(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Param("doc") doc: string,
    @Body() raw: unknown,
  ) {
    const b = v.action.parse(raw);
    return this.documents.remove(
      r,
      uuid.parse(p),
      uuid.parse(id),
      uuid.parse(doc),
      b.version,
      "inspection",
    );
  }
  @Get("inspections/:id/evidence") async inspectionEvidenceList(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
  ) {
    const { scope, role } = await this.s.scope(r, uuid.parse(p));
    await this.s.inspection(r, p, uuid.parse(id));
    const rows = await this.s.db.inspectionEvidence.findMany({
      where: { ...scope, inspectionId: id },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    const docs = await this.s.db.document.findMany({
      where: {
        ...scope,
        id: { in: rows.map((x) => x.documentId) },
        confirmedAt: { not: null },
        deletedAt: null,
      },
    });
    return {
      items: rows.flatMap((row) => {
        const doc = docs.find((x) => x.id === row.documentId);
        return doc && maySeeFile(role, doc.visibility)
          ? [
              {
                ...row,
                document: {
                  id: doc.id,
                  fileName: doc.fileName,
                  mimeType: doc.mimeType,
                  isPhoto: doc.isPhoto,
                },
              },
            ]
          : [];
      }),
    };
  }
  @Post("corrective-actions/:id/evidence")
  @RequestDoc(v.evidence)
  correctiveActionEvidence(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const b = v.evidence.parse(raw);
    return this.documents.ticket(
      r,
      uuid.parse(p),
      uuid.parse(id),
      b,
      "correctiveAction",
    );
  }
  @Delete("corrective-actions/:id/evidence/:doc")
  @RequestDoc(v.action)
  correctiveActionRemove(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Param("doc") doc: string,
    @Body() raw: unknown,
  ) {
    const b = v.action.parse(raw);
    return this.documents.remove(
      r,
      uuid.parse(p),
      uuid.parse(id),
      uuid.parse(doc),
      b.version,
      "correctiveAction",
    );
  }
  @Get("corrective-actions/:id/evidence") async correctiveActionEvidenceList(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
  ) {
    const { scope, role } = await this.s.scope(r, uuid.parse(p));
    await this.s.corrective(r, p, uuid.parse(id));
    const rows = await this.s.db.correctiveActionEvidence.findMany({
      where: { ...scope, correctiveActionId: id },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    const docs = await this.s.db.document.findMany({
      where: {
        ...scope,
        id: { in: rows.map((x) => x.documentId) },
        confirmedAt: { not: null },
        deletedAt: null,
      },
    });
    return {
      items: rows.flatMap((row) => {
        const doc = docs.find((x) => x.id === row.documentId);
        return doc && maySeeFile(role, doc.visibility)
          ? [
              {
                ...row,
                document: {
                  id: doc.id,
                  fileName: doc.fileName,
                  mimeType: doc.mimeType,
                  isPhoto: doc.isPhoto,
                },
              },
            ]
          : [];
      }),
    };
  }
}
@ApiTags("Checklists")
@Controller("api/v1")
class ChecklistController {
  constructor(@Inject(QualityService) readonly s: QualityService) {}
  @Get("checklist-templates") list(@Req() r: ApiRequest, @Query() q: unknown) {
    return this.s.templates(r, v.query.parse(q));
  }
  @Post("checklist-templates") @RequestDoc(v.template) create(
    @Req() r: ApiRequest,
    @Body() b: unknown,
  ) {
    return this.s.createTemplate(r, v.template.parse(b));
  }
  @Get("checklist-templates/:id") get(
    @Req() r: ApiRequest,
    @Param("id") id: string,
  ) {
    return this.s.template(r, uuid.parse(id));
  }
  @Patch("checklist-templates/:id") @RequestDoc(v.templatePatch) patch(
    @Req() r: ApiRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.s.patchTemplate(r, uuid.parse(id), v.templatePatch.parse(b));
  }
  @Post("checklist-templates/:id/versions")
  @RequestDoc(v.templateVersion)
  version(@Req() r: ApiRequest, @Param("id") id: string, @Body() b: unknown) {
    return this.s.newVersion(r, uuid.parse(id), v.templateVersion.parse(b));
  }
  @Get("checklist-template-versions/:id") items(
    @Req() r: ApiRequest,
    @Param("id") id: string,
  ) {
    return this.s.templateItems(r, uuid.parse(id));
  }
  @Patch("checklist-template-versions/:id/items")
  @RequestDoc(v.versionItems)
  saveItems(@Req() r: ApiRequest, @Param("id") id: string, @Body() b: unknown) {
    return this.s.versionAction(
      r,
      uuid.parse(id),
      v.versionItems.parse(b),
      false,
    );
  }
  @Post("checklist-template-versions/:id/publish")
  @RequestDoc(v.action)
  publish(@Req() r: ApiRequest, @Param("id") id: string, @Body() b: unknown) {
    return this.s.versionAction(r, uuid.parse(id), v.action.parse(b), true);
  }
}
@Module({
  imports: [ScheduleModule, DocumentModule],
  providers: [QualityService],
  controllers: [QualityController, ChecklistController],
  exports: [QualityService],
})
export class InspectionModule {}
@Module({ imports: [InspectionModule] })
export class NonConformityModule {}
