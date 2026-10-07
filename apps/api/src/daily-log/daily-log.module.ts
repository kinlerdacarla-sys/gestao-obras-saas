import {
  Body,
  Controller,
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
import { versionInput } from "../../../../packages/validation/src/schedule.js";
import {
  logCreate,
  logPatch,
  logQuery,
  activityInput,
  activityPatch,
  workforceInput,
  equipmentInput,
  materialInput,
  deliveryInput,
  occurrenceInput,
  observationInput,
} from "../../../../packages/validation/src/daily-log.js";
import { ScheduleModule } from "../schedule/schedule.module.js";
import { DocumentModule } from "../document/document.module.js";
import { DailyLogService } from "./daily-log.service.js";
@ApiTags("DailyLog")
@Controller("api/v1/projects/:projectId/daily-logs")
class DailyLogController {
  constructor(@Inject(DailyLogService) readonly service: DailyLogService) {}
  @Get() list(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Query() q: unknown,
  ) {
    return this.service.list(r, uuid.parse(p), logQuery.parse(q));
  }
  @Post() @RequestDoc(logCreate) create(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Body() b: unknown,
  ) {
    return this.service.create(r, uuid.parse(p), logCreate.parse(b));
  }
  @Get(":id") get(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
  ) {
    return this.service.get(r, uuid.parse(p), uuid.parse(id));
  }
  @Patch(":id") @RequestDoc(logPatch) patch(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.patch(
      r,
      uuid.parse(p),
      uuid.parse(id),
      logPatch.parse(b),
    );
  }
  @Get(":id/summary") async summary(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
  ) {
    return (await this.service.get(r, uuid.parse(p), uuid.parse(id))).summary;
  }
  @Get(":id/photos") async photos(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
  ) {
    return (await this.service.get(r, uuid.parse(p), uuid.parse(id))).photos;
  }
  @Get(":id/documents") async documents(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
  ) {
    return (await this.service.get(r, uuid.parse(p), uuid.parse(id))).documents;
  }
  @Post(":id/submit") @RequestDoc(versionInput) submit(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.transition(
      r,
      uuid.parse(p),
      uuid.parse(id),
      versionInput.parse(b).version,
      "submit",
    );
  }
  @Post(":id/approve") @RequestDoc(versionInput) approve(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.transition(
      r,
      uuid.parse(p),
      uuid.parse(id),
      versionInput.parse(b).version,
      "approve",
    );
  }
  @Post(":id/reopen") @RequestDoc(versionInput) reopen(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.transition(
      r,
      uuid.parse(p),
      uuid.parse(id),
      versionInput.parse(b).version,
      "reopen",
    );
  }
  @Post(":id/activities") @RequestDoc(activityInput) activities(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.add(r, uuid.parse(p), uuid.parse(id), "activities", b);
  }
  @Patch(":id/activities/:activityId") @RequestDoc(activityPatch) activity(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Param("activityId") a: string,
    @Body() b: unknown,
  ) {
    return this.service.patchActivity(
      r,
      uuid.parse(p),
      uuid.parse(id),
      uuid.parse(a),
      activityPatch.parse(b),
    );
  }
  @Post(":id/workforce") @RequestDoc(workforceInput) workforce(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.add(r, uuid.parse(p), uuid.parse(id), "workforce", b);
  }
  @Post(":id/equipment") @RequestDoc(equipmentInput) equipment(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.add(r, uuid.parse(p), uuid.parse(id), "equipment", b);
  }
  @Post(":id/materials") @RequestDoc(materialInput) materials(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.add(r, uuid.parse(p), uuid.parse(id), "materials", b);
  }
  @Post(":id/deliveries") @RequestDoc(deliveryInput) deliveries(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.add(r, uuid.parse(p), uuid.parse(id), "deliveries", b);
  }
  @Post(":id/occurrences") @RequestDoc(occurrenceInput) occurrences(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.add(r, uuid.parse(p), uuid.parse(id), "occurrences", b);
  }
  @Post(":id/observations") @RequestDoc(observationInput) observations(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.add(
      r,
      uuid.parse(p),
      uuid.parse(id),
      "observations",
      b,
    );
  }
}
@Module({
  imports: [ScheduleModule, DocumentModule],
  providers: [DailyLogService],
  controllers: [DailyLogController],
  exports: [DailyLogService],
})
export class DailyLogModule {}
