import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import type { ApiRequest } from "../auth/security.js";
import { uuid } from "../../../../packages/validation/src/index.js";
import { reportRequest } from "../../../../packages/validation/src/reports.js";
import { RequestDoc } from "../docs.js";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { ReportService } from "./report.service.js";
import { ReportDataService } from "./data.js";
@ApiTags("Reports")
@Controller("api/v1/reports")
class ReportController {
  constructor(@Inject(ReportService) readonly s: ReportService) {}
  @Post() @RequestDoc(reportRequest) create(
    @Req() r: ApiRequest,
    @Body() body: unknown,
  ) {
    return this.s.request(r, reportRequest.parse(body));
  }
  @Get() list(@Req() r: ApiRequest) {
    return this.s.list(r);
  }
  @Get(":id") async get(@Req() r: ApiRequest, @Param("id") id: string) {
    return this.s.dto(await this.s.get(r, uuid.parse(id)));
  }
  @Post(":id/download") ticket(@Req() r: ApiRequest, @Param("id") id: string) {
    return this.s.ticket(r, uuid.parse(id));
  }
  @Get(":id/file") async file(
    @Req() r: ApiRequest,
    @Param("id") id: string,
    @Query("expires") expires: string,
    @Query("signature") signature: string,
    @Res() response: Response,
  ) {
    const { job, bytes } = await this.s.download(
      r,
      uuid.parse(id),
      expires ?? "",
      signature ?? "",
    );
    response.setHeader(
      "Content-Type",
      job.format === "PDF"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="report-${job.id}.${job.format.toLowerCase()}"`,
    );
    response.setHeader("Cache-Control", "private, no-store");
    response.send(bytes);
  }
}
@Module({
  imports: [AnalyticsModule],
  providers: [ReportService, ReportDataService],
  controllers: [ReportController],
  exports: [ReportService],
})
export class ReportModule {}
