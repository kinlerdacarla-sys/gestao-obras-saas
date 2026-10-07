import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";
import type { ApiRequest } from "../auth/security.js";
import { Database, fail } from "../platform.js";
import { ExecutionAccess, type Scope } from "../schedule/access.js";
import {
  asDate,
  updateTaskProgress,
  validBudgetItem,
} from "../schedule/schedule.service.js";
import { recordAudit } from "../audit/audit.module.js";
import {
  manHours,
  maySeeFile,
  nextLogState,
} from "../../../../packages/domain/src/daily-log.js";
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
export async function claimLog(
  tx: Prisma.TransactionClient,
  scope: Scope,
  id: string,
  version: number,
) {
  const log =
    (await tx.dailyLog.findFirst({ where: { ...scope, id } })) ??
    fail(404, "DAILY_LOG_NOT_FOUND", "Diário não encontrado");
  if (!["DRAFT", "REOPENED"].includes(log.status))
    fail(409, "DAILY_LOG_IMMUTABLE", "Este diário não permite alterações");
  const result = await tx.dailyLog.updateMany({
    where: { ...scope, id, version, status: { in: ["DRAFT", "REOPENED"] } },
    data: { version: { increment: 1 } },
  });
  if (result.count !== 1)
    fail(
      409,
      "RESOURCE_VERSION_CONFLICT",
      "Diário alterado; atualize a página",
    );
  return log;
}
@Injectable()
export class DailyLogService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(ExecutionAccess) readonly access: ExecutionAccess,
  ) {}
  async get(req: ApiRequest, projectId: string, id: string) {
    const { scope, role, editor } = await this.access.check(req, projectId);
    const log =
      (await this.db.dailyLog.findFirst({
        where: {
          ...scope,
          id,
          ...(["CLIENT", "FINANCIER"].includes(role)
            ? { status: "APPROVED" as const }
            : {}),
        },
      })) ?? fail(404, "DAILY_LOG_NOT_FOUND", "Diário não encontrado");
    const where = { ...scope, dailyLogId: id };
    const [
      activities,
      workforce,
      equipment,
      materials,
      deliveries,
      occurrences,
      observations,
      documents,
      photos,
    ] = await Promise.all([
      this.db.dailyLogActivity.findMany({ where }),
      this.db.dailyLogWorkforce.findMany({ where }),
      this.db.dailyLogEquipment.findMany({ where }),
      this.db.dailyLogMaterial.findMany({ where }),
      this.db.dailyLogDelivery.findMany({ where }),
      this.db.dailyLogOccurrence.findMany({ where }),
      this.db.dailyLogObservation.findMany({ where }),
      this.db.document.findMany({
        where: { ...where, confirmedAt: { not: null }, deletedAt: null },
      }),
      this.db.dailyLogPhoto.findMany({ where }),
    ]);
    const files = documents
      .filter((d) => maySeeFile(role, d.visibility))
      .map((d) => ({
        ...d,
        sizeBytes: d.sizeBytes.toString(),
        ...photos.find((p) => p.documentId === d.id),
        id: d.id,
        objectKey: undefined,
      }));
    return {
      ...log,
      activities,
      workforce,
      equipment,
      materials,
      deliveries,
      occurrences,
      observations,
      photos: files.filter((f) => f.isPhoto),
      documents: files.filter((f) => !f.isPhoto),
      summary: {
        date: log.logDate,
        workers: workforce.reduce((n, r) => n + r.workerCount, 0),
        manHours: manHours(
          workforce.map((r) => ({
            ...r,
            hoursPerWorker: r.hoursPerWorker?.toString() ?? null,
          })),
        ),
        equipment: equipment.reduce((n, r) => n + r.quantity, 0),
        activities: activities.length,
        deliveries: deliveries.length,
        occurrences: occurrences.length,
        photos: files.filter((f) => f.isPhoto).length,
      },
      permissions: {
        edit: editor && ["DRAFT", "REOPENED"].includes(log.status),
        observe:
          (editor || role === "INSPECTOR") &&
          ["DRAFT", "REOPENED"].includes(log.status),
        approve: req.auth.role === "ADMIN" && log.status === "SUBMITTED",
        reopen: req.auth.role === "ADMIN" && log.status === "APPROVED",
      },
    };
  }
  async list(req: ApiRequest, projectId: string, q: z.infer<typeof logQuery>) {
    const { scope, role, editor } = await this.access.check(req, projectId);
    const external = ["CLIENT", "FINANCIER"].includes(role);
    const ids = q.hasOccurrences
      ? await this.db.dailyLogOccurrence.findMany({
          where: scope,
          select: { dailyLogId: true },
          distinct: ["dailyLogId"],
        })
      : [];
    const where: Prisma.DailyLogWhereInput = {
      ...scope,
      ...(external
        ? { status: "APPROVED" }
        : q.status
          ? { status: q.status }
          : {}),
      ...(q.createdBy ? { createdBy: q.createdBy } : {}),
      logDate: {
        ...(q.from ? { gte: asDate(q.from) } : {}),
        ...(q.to ? { lte: asDate(q.to) } : {}),
      },
      ...(q.hasOccurrences
        ? {
            id:
              q.hasOccurrences === "true"
                ? { in: ids.map((r) => r.dailyLogId) }
                : { notIn: ids.map((r) => r.dailyLogId) },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.dailyLog.findMany({
        where,
        orderBy: { logDate: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.dailyLog.count({ where }),
    ]);
    const selected = rows.map((r) => r.id),
      groupWhere = { ...scope, dailyLogId: { in: selected } };
    const [workers, activities, occurrences, files, users] = await Promise.all([
      this.db.dailyLogWorkforce.groupBy({
        by: ["dailyLogId"],
        where: groupWhere,
        _sum: { workerCount: true },
      }),
      this.db.dailyLogActivity.groupBy({
        by: ["dailyLogId"],
        where: groupWhere,
        _count: true,
      }),
      this.db.dailyLogOccurrence.groupBy({
        by: ["dailyLogId"],
        where: groupWhere,
        _count: true,
      }),
      this.db.document.findMany({
        where: {
          ...groupWhere,
          isPhoto: true,
          confirmedAt: { not: null },
          deletedAt: null,
        },
        select: { dailyLogId: true, visibility: true },
      }),
      this.db.user.findMany({
        where: { id: { in: rows.map((r) => r.createdBy) } },
        select: { id: true, name: true },
      }),
    ]);
    return {
      items: rows.map((r) => ({
        ...r,
        workers:
          workers.find((w) => w.dailyLogId === r.id)?._sum.workerCount ?? 0,
        activities: activities.find((w) => w.dailyLogId === r.id)?._count ?? 0,
        occurrences:
          occurrences.find((w) => w.dailyLogId === r.id)?._count ?? 0,
        photos: files.filter(
          (f) => f.dailyLogId === r.id && maySeeFile(role, f.visibility),
        ).length,
        responsible: users.find((u) => u.id === r.createdBy)?.name,
      })),
      total,
      page: q.page,
      limit: q.limit,
      permissions: { edit: editor },
    };
  }
  async create(
    req: ApiRequest,
    projectId: string,
    input: z.infer<typeof logCreate>,
  ) {
    const { scope } = await this.access.check(req, projectId, true);
    this.temperature(input);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id=${projectId}::uuid AND tenant_id=${scope.tenantId}::uuid FOR UPDATE`;
      if (
        await tx.dailyLog.findFirst({
          where: { ...scope, logDate: asDate(input.logDate) },
        })
      )
        fail(409, "DAILY_LOG_ALREADY_EXISTS", "Já existe diário nesta data");
      const result = await tx.dailyLog.create({
        data: {
          ...scope,
          ...input,
          logDate: asDate(input.logDate),
          createdBy: req.auth.userId,
        },
      });
      await this.audit(
        tx,
        req,
        projectId,
        "DAILY_LOG_CREATED",
        result.id,
        result,
      );
      return result;
    });
  }
  private temperature(input: {
    temperatureMin?: string | null;
    temperatureMax?: string | null;
  }) {
    if (
      input.temperatureMin != null &&
      input.temperatureMax != null &&
      Number(input.temperatureMin) > Number(input.temperatureMax)
    )
      fail(400, "VALIDATION_ERROR", "Temperatura mínima superior à máxima");
  }
  async patch(
    req: ApiRequest,
    projectId: string,
    id: string,
    input: z.infer<typeof logPatch>,
  ) {
    const { scope } = await this.access.check(req, projectId, true);
    return this.db.$transaction(async (tx) => {
      const before = await claimLog(tx, scope, id, input.version);
      const { version: _version, ...data } = input;
      void _version;
      this.temperature({
        temperatureMin:
          input.temperatureMin === undefined
            ? before.temperatureMin?.toString()
            : input.temperatureMin,
        temperatureMax:
          input.temperatureMax === undefined
            ? before.temperatureMax?.toString()
            : input.temperatureMax,
      });
      const result = await tx.dailyLog.update({
        where: { ...scope, id },
        data,
      });
      await this.audit(
        tx,
        req,
        projectId,
        "DAILY_LOG_UPDATED",
        id,
        result,
        before,
      );
      return result;
    });
  }
  async transition(
    req: ApiRequest,
    projectId: string,
    id: string,
    version: number,
    action: string,
  ) {
    const { scope } = await this.access.check(req, projectId, true);
    if (action !== "submit") this.access.admin(req);
    return this.db.$transaction(async (tx) => {
      const before =
        (await tx.dailyLog.findFirst({ where: { ...scope, id } })) ??
        fail(404, "DAILY_LOG_NOT_FOUND", "Diário não encontrado");
      const status = nextLogState(
        before.status,
        action,
        req.auth.role === "ADMIN",
      );
      if (!status)
        fail(409, "INVALID_DAILY_LOG_TRANSITION", "Transição inválida");
      const result = await tx.dailyLog.updateMany({
        where: { ...scope, id, version, status: before.status },
        data: {
          status: status as "SUBMITTED" | "APPROVED" | "REOPENED",
          version: { increment: 1 },
          ...(action === "submit"
            ? { submittedAt: new Date(), submittedBy: req.auth.userId }
            : action === "approve"
              ? { approvedAt: new Date(), approvedBy: req.auth.userId }
              : {}),
        },
      });
      if (result.count !== 1)
        fail(409, "RESOURCE_VERSION_CONFLICT", "Diário alterado");
      const updated = await tx.dailyLog.findFirstOrThrow({
        where: { ...scope, id },
      });
      await this.audit(
        tx,
        req,
        projectId,
        `DAILY_LOG_${status}`,
        id,
        updated,
        before,
      );
      return updated;
    });
  }
  async add(
    req: ApiRequest,
    projectId: string,
    id: string,
    kind: string,
    body: unknown,
  ) {
    const { scope, role, editor } = await this.access.check(req, projectId);
    if (!editor && !(kind === "observations" && role === "INSPECTOR"))
      fail(403, "ACCESS_DENIED", "Sem permissão para editar diário");
    return this.db.$transaction(async (tx) => {
      const common = { ...scope, dailyLogId: id, createdBy: req.auth.userId };
      let result: { id: string };
      let action: string;
      switch (kind) {
        case "activities": {
          const input = activityInput.parse(body);
          const log = await claimLog(tx, scope, id, input.version);
          await validBudgetItem(tx, scope, input.budgetItemId);
          const task = input.scheduleTaskId
            ? await tx.scheduleTask.findFirst({
                where: {
                  ...scope,
                  id: input.scheduleTaskId,
                  status: { not: "CANCELLED" },
                  taskType: { not: "SUMMARY" },
                },
              })
            : null;
          if (input.scheduleTaskId && !task)
            fail(404, "TASK_NOT_FOUND", "Tarefa não encontrada");
          if (input.updateTaskProgress)
            await updateTaskProgress(
              tx,
              scope,
              req,
              task!.id,
              {
                version: input.taskVersion!,
                progress: input.progressAfter!,
                progressDate: log.logDate.toISOString().slice(0, 10),
                notes: input.notes,
              },
              id,
            );
          const {
            version: _version,
            taskVersion: _taskVersion,
            updateTaskProgress: _update,
            ...data
          } = input;
          void _version;
          void _taskVersion;
          void _update;
          result = await tx.dailyLogActivity.create({
            data: {
              ...common,
              ...data,
              progressBefore: input.updateTaskProgress
                ? task!.actualProgress
                : null,
            },
          });
          action = "DAILY_LOG_ACTIVITY_CREATED";
          break;
        }
        case "workforce": {
          const { version, ...data } = workforceInput.parse(body);
          await claimLog(tx, scope, id, version);
          result = await tx.dailyLogWorkforce.create({
            data: { ...common, ...data },
          });
          action = "WORKFORCE_ADDED";
          break;
        }
        case "equipment": {
          const { version, ...data } = equipmentInput.parse(body);
          await claimLog(tx, scope, id, version);
          result = await tx.dailyLogEquipment.create({
            data: { ...common, ...data },
          });
          action = "EQUIPMENT_ADDED";
          break;
        }
        case "materials": {
          const { version, ...data } = materialInput.parse(body);
          await claimLog(tx, scope, id, version);
          await validBudgetItem(tx, scope, data.budgetItemId);
          result = await tx.dailyLogMaterial.create({
            data: { ...common, ...data },
          });
          action = "MATERIAL_ADDED";
          break;
        }
        case "deliveries": {
          const { version, ...data } = deliveryInput.parse(body);
          await claimLog(tx, scope, id, version);
          result = await tx.dailyLogDelivery.create({
            data: {
              ...common,
              ...data,
              deliveryTime: data.deliveryTime
                ? new Date(`1970-01-01T${data.deliveryTime}:00.000Z`)
                : null,
            },
          });
          action = "DELIVERY_ADDED";
          break;
        }
        case "occurrences": {
          const { version, ...data } = occurrenceInput.parse(body);
          await claimLog(tx, scope, id, version);
          result = await tx.dailyLogOccurrence.create({
            data: {
              ...common,
              ...data,
              occurredAt: data.occurredAt ? new Date(data.occurredAt) : null,
            },
          });
          action = "OCCURRENCE_CREATED";
          break;
        }
        case "observations": {
          const { version, ...data } = observationInput.parse(body);
          await claimLog(tx, scope, id, version);
          result = await tx.dailyLogObservation.create({
            data: { ...common, ...data },
          });
          action = "DAILY_LOG_OBSERVATION_CREATED";
          break;
        }
        default:
          return fail(
            404,
            "RESOURCE_NOT_FOUND",
            "Tipo de registo desconhecido",
          );
      }
      await this.audit(tx, req, projectId, action, result.id, result);
      return {
        item: result,
        version: (
          await tx.dailyLog.findFirstOrThrow({ where: { ...scope, id } })
        ).version,
      };
    });
  }
  async patchActivity(
    req: ApiRequest,
    projectId: string,
    id: string,
    activityId: string,
    input: z.infer<typeof activityPatch>,
  ) {
    const { scope } = await this.access.check(req, projectId, true);
    return this.db.$transaction(async (tx) => {
      await claimLog(tx, scope, id, input.version);
      const before =
        (await tx.dailyLogActivity.findFirst({
          where: { ...scope, id: activityId, dailyLogId: id },
        })) ?? fail(404, "RESOURCE_NOT_FOUND", "Atividade não encontrada");
      const { version: _version, ...data } = input;
      void _version;
      const result = await tx.dailyLogActivity.update({
        where: { ...scope, id: activityId },
        data,
      });
      await this.audit(
        tx,
        req,
        projectId,
        "DAILY_LOG_ACTIVITY_UPDATED",
        activityId,
        result,
        before,
      );
      return result;
    });
  }
  private audit(
    tx: Prisma.TransactionClient,
    req: ApiRequest,
    projectId: string,
    action: string,
    id: string,
    result: unknown,
    before?: unknown,
  ) {
    return recordAudit(
      tx,
      req.auth,
      {
        action,
        entityType: "DailyLog",
        entityId: id,
        projectId,
        newValues: result,
        oldValues: before,
      },
      req,
    );
  }
}
