import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { Prisma, ScheduleTask } from "../generated/prisma/client.js";
import type { ApiRequest } from "../auth/security.js";
import { Database, fail } from "../platform.js";
import { ExecutionAccess, type Scope } from "./access.js";
import { recordAudit } from "../audit/audit.module.js";
import {
  calculateSchedule,
  duration,
  assertDependencies,
  progress,
  variance,
  day,
  type TaskLine,
} from "../../../../packages/domain/src/schedule.js";
import type {
  scheduleCreate,
  schedulePatch,
  taskCreate,
  taskPatch,
  progressInput,
  dependencyInput,
} from "../../../../packages/validation/src/schedule.js";
export const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
export const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Maputo" });
export function taskLine(t: ScheduleTask): TaskLine {
  return {
    ...t,
    actualProgress: t.actualProgress.toString(),
    weight: t.weight.toString(),
  };
}
export async function currentSchedule(
  tx: Prisma.TransactionClient,
  scope: Scope,
  lock = false,
) {
  const schedule =
    (await tx.schedule.findFirst({
      where: { ...scope, status: { not: "ARCHIVED" } },
    })) ?? fail(404, "SCHEDULE_NOT_FOUND", "Cronograma não encontrado");
  if (lock)
    await tx.$queryRaw`SELECT id FROM schedules WHERE id=${schedule.id}::uuid AND tenant_id=${scope.tenantId}::uuid FOR UPDATE`;
  return lock
    ? await tx.schedule.findFirstOrThrow({
        where: { ...scope, id: schedule.id },
      })
    : schedule;
}
export async function compute(
  tx: Prisma.TransactionClient,
  scope: Scope,
  reference = today(),
) {
  const schedule = await currentSchedule(tx, scope);
  const tasks = await tx.scheduleTask.findMany({
    where: { ...scope, scheduleId: schedule.id },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  const values = schedule.budgetRevisionId
    ? await tx.budgetRevisionValue.findMany({
        where: {
          tenantId: scope.tenantId,
          budgetRevisionId: schedule.budgetRevisionId,
          itemType: "ITEM",
          isActive: true,
        },
      })
    : [];
  const calculated = calculateSchedule(
    tasks.map(taskLine),
    schedule.weightingMethod,
    new Map(values.map((v) => [v.budgetItemId, v.totalValue.toString()])),
    reference,
  );
  const originals = new Map(tasks.map((t) => [t.id, t]));
  return {
    schedule,
    ...calculated,
    items: calculated.items.map((t) => ({ ...originals.get(t.id)!, ...t })),
    dependencies: await tx.taskDependency.findMany({
      where: { ...scope, scheduleId: schedule.id },
    }),
  };
}
export async function validBudgetItem(
  tx: Prisma.TransactionClient,
  scope: Scope,
  id?: string | null,
) {
  if (
    id &&
    !(await tx.budgetItem.findFirst({
      where: { ...scope, id, itemType: "ITEM", isActive: true },
    }))
  )
    fail(
      400,
      "INVALID_DEPENDENCY",
      "Rubrica deve ser um ITEM ativo desta obra",
    );
}
export async function updateTaskProgress(
  tx: Prisma.TransactionClient,
  scope: Scope,
  req: ApiRequest,
  id: string,
  input: z.infer<typeof progressInput>,
  dailyLogId?: string,
) {
  await currentSchedule(tx, scope, true);
  const before =
    (await tx.scheduleTask.findFirst({ where: { ...scope, id } })) ??
    fail(404, "TASK_NOT_FOUND", "Tarefa não encontrada");
  if (before.taskType === "SUMMARY" || before.status === "CANCELLED")
    fail(
      400,
      "INVALID_TASK_PROGRESS",
      "Resumos e tarefas canceladas não aceitam progresso manual",
    );
  const value = progress(input.progress),
    when = asDate(input.progressDate);
  if (day(input.progressDate) > day(today()))
    fail(
      400,
      "INVALID_TASK_PROGRESS",
      "Progresso não pode ser registado no futuro",
    );
  const latest = await tx.taskProgressUpdate.findFirst({
    where: { ...scope, taskId: id },
    orderBy: { progressDate: "desc" },
  });
  if (latest && when < latest.progressDate)
    fail(
      400,
      "INVALID_TASK_PROGRESS",
      "Data anterior ao último progresso registado",
    );
  const actualStart = input.actualStart
    ? asDate(input.actualStart)
    : (before.actualStart ?? (value.gt(0) ? when : null));
  const actualEnd = value.eq(100)
    ? asDate(input.actualEnd ?? input.progressDate)
    : null;
  if (
    (actualStart && actualStart > when) ||
    (actualEnd && actualStart && actualEnd < actualStart) ||
    (actualEnd && actualEnd > when)
  )
    fail(400, "INVALID_TASK_DATES", "Datas reais inválidas");
  const changed = await tx.scheduleTask.updateMany({
    where: { ...scope, id, version: input.version },
    data: {
      actualProgress: value.toFixed(2),
      actualStart,
      actualEnd,
      status: value.eq(100)
        ? "COMPLETED"
        : value.gt(0)
          ? "IN_PROGRESS"
          : "NOT_STARTED",
      version: { increment: 1 },
      updatedBy: req.auth.userId,
    },
  });
  if (changed.count !== 1)
    fail(
      409,
      "RESOURCE_VERSION_CONFLICT",
      "Tarefa alterada; atualize a página",
    );
  const update = await tx.taskProgressUpdate.create({
    data: {
      ...scope,
      taskId: id,
      progressDate: when,
      previousProgress: before.actualProgress,
      newProgress: value.toFixed(2),
      notes: input.notes,
      dailyLogId,
      createdBy: req.auth.userId,
    },
  });
  await recordAudit(
    tx,
    req.auth,
    {
      action: "TASK_PROGRESS_UPDATED",
      entityType: "ScheduleTask",
      entityId: id,
      projectId: scope.projectId,
      oldValues: before,
      newValues: update,
    },
    req,
  );
  return tx.scheduleTask.findFirstOrThrow({ where: { ...scope, id } });
}
@Injectable()
export class ScheduleService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(ExecutionAccess) readonly access: ExecutionAccess,
  ) {}
  async read(req: ApiRequest, projectId: string, reference = today()) {
    const { scope, editor } = await this.access.check(req, projectId);
    return {
      ...(await compute(this.db, scope, reference)),
      permissions: { edit: editor, baseline: req.auth.role === "ADMIN" },
    };
  }
  async create(
    req: ApiRequest,
    projectId: string,
    input: z.infer<typeof scheduleCreate>,
  ) {
    const { scope } = await this.access.check(req, projectId, true);
    duration(input.plannedStart, input.plannedEnd, "TASK");
    return this.db.$transaction(async (tx) => {
      await this.revision(
        tx,
        scope,
        input.budgetRevisionId,
        input.weightingMethod,
      );
      const result = await tx.schedule.create({
        data: {
          ...scope,
          ...input,
          plannedStart: asDate(input.plannedStart),
          plannedEnd: asDate(input.plannedEnd),
          createdBy: req.auth.userId,
          updatedBy: req.auth.userId,
        },
      });
      await recordAudit(
        tx,
        req.auth,
        {
          action: "SCHEDULE_CREATED",
          entityType: "Schedule",
          entityId: result.id,
          projectId,
          newValues: result,
        },
        req,
      );
      return result;
    });
  }
  private async revision(
    tx: Prisma.TransactionClient,
    scope: Scope,
    id: string | null | undefined,
    method: string,
  ) {
    if (method === "BUDGET_VALUE" && !id)
      fail(
        400,
        "INVALID_DEPENDENCY",
        "Selecione uma revisão aprovada para ponderar o cronograma",
      );
    if (
      id &&
      !(await tx.budgetRevision.findFirst({
        where: { ...scope, id, status: { in: ["APPROVED", "SUPERSEDED"] } },
      }))
    )
      fail(400, "INVALID_DEPENDENCY", "Revisão deve estar aprovada nesta obra");
  }
  async patch(
    req: ApiRequest,
    projectId: string,
    input: z.infer<typeof schedulePatch>,
  ) {
    const { scope } = await this.access.check(req, projectId, true);
    return this.db.$transaction(async (tx) => {
      const before = await currentSchedule(tx, scope, true);
      const { version, ...data } = input;
      duration(
        input.plannedStart ?? before.plannedStart,
        input.plannedEnd ?? before.plannedEnd,
        "TASK",
      );
      await this.revision(
        tx,
        scope,
        input.budgetRevisionId === undefined
          ? before.budgetRevisionId
          : input.budgetRevisionId,
        input.weightingMethod ?? before.weightingMethod,
      );
      const changed = await tx.schedule.updateMany({
        where: { ...scope, id: before.id, version },
        data: {
          ...data,
          plannedStart: input.plannedStart
            ? asDate(input.plannedStart)
            : undefined,
          plannedEnd: input.plannedEnd ? asDate(input.plannedEnd) : undefined,
          version: { increment: 1 },
          updatedBy: req.auth.userId,
        },
      });
      if (changed.count !== 1)
        fail(409, "RESOURCE_VERSION_CONFLICT", "Cronograma alterado");
      await recordAudit(
        tx,
        req.auth,
        {
          action: "SCHEDULE_UPDATED",
          entityType: "Schedule",
          entityId: before.id,
          projectId,
          oldValues: before,
          newValues: input,
        },
        req,
      );
      return tx.schedule.findUniqueOrThrow({ where: { id: before.id } });
    });
  }
  async task(req: ApiRequest, projectId: string, id: string) {
    const { scope } = await this.access.check(req, projectId);
    const task =
      (await this.db.scheduleTask.findFirst({ where: { ...scope, id } })) ??
      fail(404, "TASK_NOT_FOUND", "Tarefa não encontrada");
    if (task.taskType === "SUMMARY" && task.status !== "CANCELLED")
      return (
        (await compute(this.db, scope)).items.find((t) => t.id === id) ?? task
      );
    return task;
  }
  async createTask(
    req: ApiRequest,
    projectId: string,
    input: z.infer<typeof taskCreate>,
  ) {
    const { scope } = await this.access.check(req, projectId, true);
    return this.db.$transaction(async (tx) => {
      const schedule = await currentSchedule(tx, scope, true);
      await validBudgetItem(tx, scope, input.budgetItemId);
      if (input.taskType === "SUMMARY" && input.budgetItemId)
        fail(400, "INVALID_DEPENDENCY", "Resumo não pode ter rubrica");
      const result = await tx.scheduleTask.create({
        data: {
          ...scope,
          ...input,
          scheduleId: schedule.id,
          plannedStart: asDate(input.plannedStart),
          plannedEnd: asDate(input.plannedEnd),
          durationDays: duration(
            input.plannedStart,
            input.plannedEnd,
            input.taskType,
          ),
          createdBy: req.auth.userId,
          updatedBy: req.auth.userId,
        },
      });
      await compute(tx, scope);
      await recordAudit(
        tx,
        req.auth,
        {
          action: "SCHEDULE_TASK_CREATED",
          entityType: "ScheduleTask",
          entityId: result.id,
          projectId,
          newValues: result,
        },
        req,
      );
      return result;
    });
  }
  async patchTask(
    req: ApiRequest,
    projectId: string,
    id: string,
    input: z.infer<typeof taskPatch>,
    cancel = false,
  ) {
    const { scope } = await this.access.check(req, projectId, true);
    return this.db.$transaction(async (tx) => {
      await currentSchedule(tx, scope, true);
      const before =
        (await tx.scheduleTask.findFirst({ where: { ...scope, id } })) ??
        fail(404, "TASK_NOT_FOUND", "Tarefa não encontrada");
      if (before.status === "CANCELLED")
        fail(409, "INVALID_TASK_PROGRESS", "Tarefa cancelada");
      if (
        cancel &&
        (await tx.scheduleTask.count({
          where: { ...scope, parentId: id, status: { not: "CANCELLED" } },
        }))
      )
        fail(400, "INVALID_DEPENDENCY", "Cancele primeiro as tarefas filhas");
      if (
        cancel &&
        (await tx.taskDependency.count({
          where: { ...scope, OR: [{ predecessorId: id }, { successorId: id }] },
        }))
      )
        fail(400, "INVALID_DEPENDENCY", "Remova primeiro as dependências");
      const { version, ...data } = input;
      const type = input.taskType ?? before.taskType;
      if (
        type !== before.taskType &&
        (before.actualProgress.gt(0) ||
          (await tx.taskProgressUpdate.count({
            where: { ...scope, taskId: id },
          })))
      )
        fail(
          400,
          "INVALID_TASK_PROGRESS",
          "Tipo de tarefa com histórico não pode mudar",
        );
      await validBudgetItem(tx, scope, input.budgetItemId);
      if (
        type === "SUMMARY" &&
        (input.budgetItemId === undefined
          ? before.budgetItemId
          : input.budgetItemId)
      )
        fail(400, "INVALID_DEPENDENCY", "Resumo não pode ter rubrica");
      if (
        input.status &&
        (before.actualProgress.eq(100) ||
          (before.actualProgress.gt(0) && input.status === "NOT_STARTED"))
      )
        fail(
          400,
          "INVALID_TASK_PROGRESS",
          "Estado incompatível com o progresso",
        );
      const changed = await tx.scheduleTask.updateMany({
        where: { ...scope, id, version },
        data: {
          ...data,
          plannedStart: input.plannedStart
            ? asDate(input.plannedStart)
            : undefined,
          plannedEnd: input.plannedEnd ? asDate(input.plannedEnd) : undefined,
          durationDays: duration(
            input.plannedStart ?? before.plannedStart,
            input.plannedEnd ?? before.plannedEnd,
            type,
          ),
          ...(cancel ? { status: "CANCELLED" } : {}),
          version: { increment: 1 },
          updatedBy: req.auth.userId,
        },
      });
      if (changed.count !== 1)
        fail(409, "RESOURCE_VERSION_CONFLICT", "Tarefa alterada");
      await compute(tx, scope);
      const result = await tx.scheduleTask.findFirstOrThrow({
        where: { ...scope, id },
      });
      await recordAudit(
        tx,
        req.auth,
        {
          action: cancel ? "SCHEDULE_TASK_CANCELLED" : "SCHEDULE_TASK_UPDATED",
          entityType: "ScheduleTask",
          entityId: id,
          projectId,
          oldValues: before,
          newValues: result,
        },
        req,
      );
      return result;
    });
  }
  async updateProgress(
    req: ApiRequest,
    projectId: string,
    id: string,
    input: z.infer<typeof progressInput>,
  ) {
    const { scope } = await this.access.check(req, projectId, true);
    return this.db.$transaction((tx) =>
      updateTaskProgress(tx, scope, req, id, input),
    );
  }
  async dependency(
    req: ApiRequest,
    projectId: string,
    input: z.infer<typeof dependencyInput>,
  ) {
    const { scope } = await this.access.check(req, projectId, true);
    return this.db.$transaction(async (tx) => {
      const schedule = await currentSchedule(tx, scope, true);
      const tasks = await tx.scheduleTask.findMany({
        where: {
          ...scope,
          scheduleId: schedule.id,
          status: { not: "CANCELLED" },
          taskType: { not: "SUMMARY" },
        },
        select: { id: true },
      });
      const edges = await tx.taskDependency.findMany({
        where: { ...scope, scheduleId: schedule.id },
      });
      assertDependencies(
        tasks.map((t) => t.id),
        [...edges, input],
      );
      const result = await tx.taskDependency.create({
        data: {
          ...scope,
          ...input,
          scheduleId: schedule.id,
          createdBy: req.auth.userId,
        },
      });
      await recordAudit(
        tx,
        req.auth,
        {
          action: "TASK_DEPENDENCY_CREATED",
          entityType: "TaskDependency",
          entityId: result.id,
          projectId,
          newValues: result,
        },
        req,
      );
      return result;
    });
  }
  async removeDependency(req: ApiRequest, projectId: string, id: string) {
    const { scope } = await this.access.check(req, projectId, true);
    return this.db.$transaction(async (tx) => {
      await currentSchedule(tx, scope, true);
      const before =
        (await tx.taskDependency.findFirst({ where: { ...scope, id } })) ??
        fail(404, "INVALID_DEPENDENCY", "Dependência não encontrada");
      await tx.taskDependency.delete({ where: { id, ...scope } });
      await recordAudit(
        tx,
        req.auth,
        {
          action: "TASK_DEPENDENCY_REMOVED",
          entityType: "TaskDependency",
          entityId: id,
          projectId,
          oldValues: before,
        },
        req,
      );
      return { ok: true };
    });
  }
  async baseline(
    req: ApiRequest,
    projectId: string,
    description?: string | null,
  ) {
    const { scope } = await this.access.check(req, projectId, true);
    this.access.admin(req);
    return this.db.$transaction(
      async (tx) => {
        const schedule = await currentSchedule(tx, scope, true);
        const data = await compute(tx, scope);
        if (!data.items.length || Number(data.totalWeight) === 0)
          fail(
            400,
            "INVALID_TASK_PROGRESS",
            "Adicione tarefas com peso positivo antes da baseline",
          );
        const result = await tx.scheduleBaseline.create({
          data: {
            ...scope,
            scheduleId: schedule.id,
            revisionNumber: schedule.baselineRevision + 1,
            description,
            createdBy: req.auth.userId,
          },
        });
        await tx.scheduleBaselineTask.createMany({
          data: data.items.map((t) => ({
            ...scope,
            baselineId: result.id,
            taskId: t.id,
            code: t.code,
            name: t.name,
            parentId: t.parentId,
            plannedStart: t.plannedStart,
            plannedEnd: t.plannedEnd,
            durationDays: t.durationDays,
            weight: t.normalizedWeight,
            createdBy: req.auth.userId,
          })),
        });
        await tx.schedule.update({
          where: { id: schedule.id, ...scope },
          data: {
            baselineRevision: { increment: 1 },
            version: { increment: 1 },
            updatedBy: req.auth.userId,
          },
        });
        await recordAudit(
          tx,
          req.auth,
          {
            action: "SCHEDULE_BASELINE_CREATED",
            entityType: "ScheduleBaseline",
            entityId: result.id,
            projectId,
            newValues: result,
          },
          req,
        );
        return result;
      },
      { timeout: 20000 },
    );
  }
  async baselines(req: ApiRequest, projectId: string) {
    const { scope } = await this.access.check(req, projectId);
    return this.db.scheduleBaseline.findMany({
      where: scope,
      orderBy: { revisionNumber: "desc" },
    });
  }
  async variance(req: ApiRequest, projectId: string, baselineId?: string) {
    const { scope } = await this.access.check(req, projectId);
    const baseline =
      (await this.db.scheduleBaseline.findFirst({
        where: { ...scope, ...(baselineId ? { id: baselineId } : {}) },
        orderBy: { createdAt: "desc" },
      })) ?? fail(404, "BASELINE_NOT_FOUND", "Baseline não encontrada");
    const saved = await this.db.scheduleBaselineTask.findMany({
        where: { ...scope, baselineId: baseline.id },
      }),
      current = await compute(this.db, scope),
      lookup = new Map(current.items.map((t) => [t.id, t]));
    return {
      baseline,
      items: saved.map((t) => {
        const now = lookup.get(t.taskId);
        return {
          ...t,
          currentStart: now?.plannedStart ?? null,
          currentEnd: now?.plannedEnd ?? null,
          startDeltaDays: now
            ? variance(t.plannedStart, now.plannedStart)
            : null,
          endDeltaDays: now ? variance(t.plannedEnd, now.plannedEnd) : null,
        };
      }),
    };
  }
  async history(req: ApiRequest, projectId: string, page = 1, limit = 50) {
    const { scope } = await this.access.check(req, projectId);
    const [items, total, snapshots] = await Promise.all([
      this.db.taskProgressUpdate.findMany({
        where: scope,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.taskProgressUpdate.count({ where: scope }),
      this.db.projectProgressSnapshot.findMany({
        where: scope,
        orderBy: { snapshotDate: "desc" },
        take: 366,
      }),
    ]);
    return { items, total, page, limit, snapshots };
  }
}
