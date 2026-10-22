import { Queue } from "bullmq";
import { redisConnection } from "../../../../packages/config/src/redis.js";
import { Post } from "@nestjs/common";
import { recordAudit } from "../audit/audit.module.js";
import { GalleryService, galleryQuery } from "./gallery.js";
import { DocumentModule } from "../document/document.module.js";
import { Res } from "@nestjs/common";
import type { Response } from "express";
import {
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Query,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { ApiRequest } from "../auth/security.js";
import { uuid } from "../../../../packages/validation/src/index.js";
import {
  analyticsQuery,
  compareQuery,
  curveQuery,
} from "../../../../packages/validation/src/analytics.js";
import { ScheduleModule } from "../schedule/schedule.module.js";
import { FinancialModule } from "../financial/financial.module.js";
import { InspectionModule } from "../quality/quality.module.js";
import { AnalyticsService } from "./analytics.service.js";
import {
  AnalyticsAccess,
  ScheduleKpiService,
  FinancialKpiService,
  QualityKpiService,
  ContractKpiService,
} from "./kpis.js";
@ApiTags("Analytics")
@Controller("api/v1")
class AnalyticsController {
  constructor(
    @Inject(AnalyticsService) readonly s: AnalyticsService,
    @Inject(GalleryService) readonly gallery: GalleryService,
  ) {}
  @Get("projects/:projectId/documents") documentsList(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Query() q: unknown,
  ) {
    return this.gallery.list(r, uuid.parse(p), galleryQuery.parse(q), false);
  }
  @Get("projects/:projectId/documents/:id/file") async documentFile(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Res() response: Response,
  ) {
    const { document, bytes } = await this.gallery.file(
      r,
      uuid.parse(p),
      uuid.parse(id),
      false,
    );
    response.setHeader("Content-Type", document.mimeType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
    );
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(bytes);
  }
  @Get("projects/:projectId/gallery") galleryList(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Query() q: unknown,
  ) {
    return this.gallery.list(r, uuid.parse(p), galleryQuery.parse(q));
  }
  @Get("projects/:projectId/gallery/:id/file") async galleryFile(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("id") id: string,
    @Res() response: Response,
  ) {
    const { document, bytes } = await this.gallery.file(
      r,
      uuid.parse(p),
      uuid.parse(id),
    );
    response.setHeader("Content-Type", document.mimeType);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(bytes);
  }
  @Post("projects/:projectId/analytics/snapshots") async regenerate(
    @Req() r: ApiRequest,
    @Param("projectId") raw: string,
  ) {
    const p = uuid.parse(raw);
    this.s.access.execution.admin(r);
    await this.s.access.execution.check(r, p);
    const queue = new Queue("project-kpi-snapshot", {
      connection: redisConnection(),
    });
    try {
      const job = await queue.add(
        "regenerate-current-day",
        { tenantId: r.auth.tenantId, projectId: p },
        { removeOnComplete: 100, removeOnFail: 100 },
      );
      await recordAudit(
        this.s.db,
        r.auth,
        {
          action: "SNAPSHOT_REGENERATION_REQUESTED",
          entityType: "ProjectKpiSnapshot",
          projectId: p,
          newValues: { jobId: job.id },
        },
        r,
      );
      return { jobId: job.id, status: "QUEUED" };
    } finally {
      await queue.close();
    }
  }
  @Get("projects/:projectId/analytics/snapshots") async snapshots(
    @Req() r: ApiRequest,
    @Param("projectId") raw: string,
  ) {
    const p = uuid.parse(raw);
    const { scope, role } = await this.s.access.execution.check(r, p);
    const items = await this.s.db.projectKpiSnapshot.findMany({
      where: scope,
      orderBy: { snapshotDate: "desc" },
      take: 366,
    });
    return {
      items:
        role === "INSPECTOR"
          ? items.map((x) => ({
              snapshotDate: x.snapshotDate,
              plannedProgress: x.plannedProgress,
              actualProgress: x.actualProgress,
              openNcr: x.openNcr,
              criticalNcr: x.criticalNcr,
              overdueNcr: x.overdueNcr,
            }))
          : items,
    };
  }
  @Get("dashboard/worklist") worklist(@Req() r: ApiRequest) {
    return this.s.worklist(r);
  }
  @Get("dashboard/portfolio") portfolio(
    @Req() r: ApiRequest,
    @Query() q: unknown,
  ) {
    return this.s.portfolio(r, analyticsQuery.parse(q));
  }
  @Get("projects/:projectId/analytics") project(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
  ) {
    return this.s.project(r, uuid.parse(p));
  }
  @Get("projects/:projectId/analytics/s-curve") curve(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Query() q: unknown,
  ) {
    return this.s.curve(r, uuid.parse(p), curveQuery.parse(q));
  }
  @Get("analytics/projects/compare") compare(
    @Req() r: ApiRequest,
    @Query() q: unknown,
  ) {
    return this.s.compare(r, compareQuery.parse(q).projects);
  }
}
@Module({
  imports: [ScheduleModule, FinancialModule, InspectionModule, DocumentModule],
  providers: [
    GalleryService,
    AnalyticsService,
    AnalyticsAccess,
    ScheduleKpiService,
    FinancialKpiService,
    QualityKpiService,
    ContractKpiService,
  ],
  controllers: [AnalyticsController],
  exports: [AnalyticsService, AnalyticsAccess, GalleryService],
})
export class AnalyticsModule {}
