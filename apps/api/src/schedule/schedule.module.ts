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
import { ProjectModule } from "../project/project.module.js";
import { RequestDoc } from "../docs.js";
import { uuid } from "../../../../packages/validation/src/index.js";
import {
  scheduleCreate,
  schedulePatch,
  taskCreate,
  taskPatch,
  progressInput,
  dependencyInput,
  baselineInput,
  versionInput,
  taskQuery,
} from "../../../../packages/validation/src/schedule.js";
import { ScheduleService } from "./schedule.service.js";
import { ExecutionAccess } from "./access.js";
@ApiTags("Schedule")
@Controller("api/v1/projects/:projectId")
export class ScheduleController {
  constructor(@Inject(ScheduleService) readonly service: ScheduleService) {}
  @Get("schedule") read(@Req() r: ApiRequest, @Param("projectId") p: string) {
    return this.service.read(r, uuid.parse(p));
  }
  @Post("schedule") @RequestDoc(scheduleCreate) create(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Body() b: unknown,
  ) {
    return this.service.create(r, uuid.parse(p), scheduleCreate.parse(b));
  }
  @Patch("schedule") @RequestDoc(schedulePatch) patch(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Body() b: unknown,
  ) {
    return this.service.patch(r, uuid.parse(p), schedulePatch.parse(b));
  }
  @Get("schedule/tree") tree(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
  ) {
    return this.service.read(r, uuid.parse(p));
  }
  @Get("schedule/tasks") async tasks(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Query() raw: unknown,
  ) {
    const q = taskQuery.parse(raw),
      data = await this.service.read(r, uuid.parse(p), q.referenceDate);
    if (q.status === "CANCELLED") {
      const where = {
        tenantId: r.auth.tenantId,
        projectId: p,
        scheduleId: data.schedule.id,
        status: "CANCELLED" as const,
        ...(q.taskType ? { taskType: q.taskType } : {}),
        ...(q.budgetItemId ? { budgetItemId: q.budgetItemId } : {}),
        ...(q.search
          ? {
              OR: [
                { name: { contains: q.search, mode: "insensitive" as const } },
                { code: { contains: q.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };
      const [items, total] = await Promise.all([
        this.service.db.scheduleTask.findMany({
          where,
          orderBy: { code: "asc" },
          skip: (q.page - 1) * q.limit,
          take: q.limit,
        }),
        this.service.db.scheduleTask.count({ where }),
      ]);
      return { items, total, page: q.page, limit: q.limit };
    }
    const filtered = data.items.filter(
      (t) =>
        (!q.status || t.status === q.status) &&
        (!q.taskType || t.taskType === q.taskType) &&
        (!q.budgetItemId || t.budgetItemId === q.budgetItemId) &&
        (!q.delayed ||
          (t.temporalStatus === "DELAYED") === (q.delayed === "true")) &&
        (!q.search ||
          `${t.code} ${t.name}`.toLowerCase().includes(q.search.toLowerCase())),
    );
    return {
      items: filtered.slice((q.page - 1) * q.limit, q.page * q.limit),
      total: filtered.length,
      page: q.page,
      limit: q.limit,
    };
  }
  @Post("schedule/tasks") @RequestDoc(taskCreate) createTask(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Body() b: unknown,
  ) {
    return this.service.createTask(r, uuid.parse(p), taskCreate.parse(b));
  }
  @Get("schedule/tasks/:taskId") task(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("taskId") id: string,
  ) {
    return this.service.task(r, uuid.parse(p), uuid.parse(id));
  }
  @Patch("schedule/tasks/:taskId") @RequestDoc(taskPatch) patchTask(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("taskId") id: string,
    @Body() b: unknown,
  ) {
    return this.service.patchTask(
      r,
      uuid.parse(p),
      uuid.parse(id),
      taskPatch.parse(b),
    );
  }
  @Delete("schedule/tasks/:taskId") @RequestDoc(versionInput) cancel(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("taskId") id: string,
    @Body() b: unknown,
  ) {
    return this.service.patchTask(
      r,
      uuid.parse(p),
      uuid.parse(id),
      versionInput.parse(b),
      true,
    );
  }
  @Post("schedule/tasks/:taskId/progress") @RequestDoc(progressInput) progress(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("taskId") id: string,
    @Body() b: unknown,
  ) {
    return this.service.updateProgress(
      r,
      uuid.parse(p),
      uuid.parse(id),
      progressInput.parse(b),
    );
  }
  @Post("schedule/dependencies") @RequestDoc(dependencyInput) dependency(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Body() b: unknown,
  ) {
    return this.service.dependency(r, uuid.parse(p), dependencyInput.parse(b));
  }
  @Delete("schedule/dependencies/:dependencyId") remove(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Param("dependencyId") id: string,
  ) {
    return this.service.removeDependency(r, uuid.parse(p), uuid.parse(id));
  }
  @Post("schedule/baselines") @RequestDoc(baselineInput) baseline(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Body() b: unknown,
  ) {
    return this.service.baseline(
      r,
      uuid.parse(p),
      baselineInput.parse(b).description,
    );
  }
  @Get("schedule/baselines") baselines(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
  ) {
    return this.service.baselines(r, uuid.parse(p));
  }
  @Get("schedule/variance") variance(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Query("baselineId") id?: string,
  ) {
    return this.service.variance(
      r,
      uuid.parse(p),
      id ? uuid.parse(id) : undefined,
    );
  }
  @Get("progress") async summary(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
  ) {
    const data = await this.service.read(r, uuid.parse(p));
    return {
      plannedProgress: data.plannedProgress,
      actualProgress: data.actualProgress,
      deviation: data.deviation,
      temporalStatus: data.temporalStatus,
      delayed: data.items.filter(
        (t) => t.taskType !== "SUMMARY" && t.temporalStatus === "DELAYED",
      ).length,
      inProgress: data.items.filter(
        (t) => t.taskType !== "SUMMARY" && t.status === "IN_PROGRESS",
      ).length,
      completed: data.items.filter(
        (t) => t.taskType !== "SUMMARY" && t.status === "COMPLETED",
      ).length,
    };
  }
  @Get("progress/history") history(
    @Req() r: ApiRequest,
    @Param("projectId") p: string,
    @Query() raw: unknown,
  ) {
    const q = taskQuery.parse(raw);
    return this.service.history(r, uuid.parse(p), q.page, q.limit);
  }
}
@Module({
  imports: [ProjectModule],
  providers: [ExecutionAccess, ScheduleService],
  controllers: [ScheduleController],
  exports: [ExecutionAccess, ScheduleService],
})
export class ScheduleModule {}
