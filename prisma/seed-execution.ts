import type { PrismaClient } from "../apps/api/src/generated/prisma/client.js";
import { calculateSchedule } from "../packages/domain/src/schedule.js";
import { taskLine } from "../apps/api/src/schedule/schedule.service.js";
export async function seedExecution(
  db: PrismaClient,
  tenantId: string,
  projectId: string,
  userId: string,
) {
  if (await db.schedule.findFirst({ where: { tenantId, projectId } })) return;
  const scope = { tenantId, projectId },
    now = new Date(),
    day = new Date(now.toISOString().slice(0, 10));
  const at = (offset: number) => new Date(day.getTime() + offset * 86400000);
  await db.$transaction(
    async (tx) => {
      const schedule = await tx.schedule.create({
        data: {
          ...scope,
          name: "Planeamento · Edifício Demo",
          status: "ACTIVE",
          plannedStart: at(-30),
          plannedEnd: at(60),
          baselineRevision: 0,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      const definitions = [
        ["1", "Trabalhos Preliminares", null, 0, -30, -25],
        ["1.1", "Mobilização", "1", 100, -30, -25],
        ["2", "Fundações", null, 0, -24, 15],
        ["2.1", "Escavação", "2", 75, -24, 0],
        ["2.2", "Betão de limpeza", "2", 40, -10, 5],
        ["2.3", "Sapatas", "2", 10, -3, 15],
        ["3", "Estrutura", null, 0, 16, 60],
        ["3.1", "Pilares", "3", 0, 16, 30],
        ["3.2", "Vigas", "3", 0, 31, 45],
        ["3.3", "Lajes", "3", 0, 46, 60],
      ] as const;
      const ids = new Map<string, string>();
      for (const [code, name, parent, progress, start, end] of definitions) {
        const task = await tx.scheduleTask.create({
          data: {
            ...scope,
            scheduleId: schedule.id,
            parentId: parent ? ids.get(parent) : null,
            code,
            name,
            taskType: parent ? "TASK" : "SUMMARY",
            plannedStart: at(start),
            plannedEnd: at(end),
            durationDays: end - start + 1,
            actualProgress: progress,
            weight: parent ? 1 : 0,
            status:
              progress === 100
                ? "COMPLETED"
                : progress > 0
                  ? "IN_PROGRESS"
                  : "NOT_STARTED",
            actualStart: progress > 0 ? at(start) : null,
            actualEnd: progress === 100 ? at(end) : null,
            sortOrder: ids.size,
            createdBy: userId,
            updatedBy: userId,
          },
        });
        ids.set(code, task.id);
        if (progress > 0)
          await tx.taskProgressUpdate.create({
            data: {
              ...scope,
              taskId: task.id,
              progressDate: at(-1),
              previousProgress: 0,
              newProgress: progress,
              notes: "Progresso inicial de demonstração",
              createdBy: userId,
            },
          });
      }
      for (const [from, to] of [
        ["1.1", "2.1"],
        ["2.1", "2.2"],
        ["2.2", "2.3"],
        ["2.3", "3.1"],
        ["3.1", "3.2"],
        ["3.2", "3.3"],
      ])
        await tx.taskDependency.create({
          data: {
            ...scope,
            scheduleId: schedule.id,
            predecessorId: ids.get(from)!,
            successorId: ids.get(to)!,
            createdBy: userId,
          },
        });
      const baseline = await tx.scheduleBaseline.create({
        data: {
          ...scope,
          scheduleId: schedule.id,
          revisionNumber: 0,
          description: "Baseline 0",
          createdBy: userId,
        },
      });
      const tasks = await tx.scheduleTask.findMany({
          where: { ...scope, scheduleId: schedule.id },
        }),
        calculated = calculateSchedule(
          tasks.map(taskLine),
          "MANUAL",
          new Map(),
          day,
        );
      await tx.scheduleBaselineTask.createMany({
        data: calculated.items.map((t) => ({
          ...scope,
          baselineId: baseline.id,
          taskId: t.id,
          parentId: t.parentId,
          code: t.code,
          name: t.name,
          plannedStart: t.plannedStart,
          plannedEnd: t.plannedEnd,
          durationDays: t.durationDays,
          weight: t.normalizedWeight,
          createdBy: userId,
        })),
      });
      for (const offset of [-3, -2, -1]) {
        const log = await tx.dailyLog.create({
          data: {
            ...scope,
            logDate: at(offset),
            weatherCondition: "Sol",
            generalNotes: "Registo demonstrativo da execução da obra.",
            createdBy: userId,
          },
        });
        await tx.dailyLogActivity.create({
          data: {
            ...scope,
            dailyLogId: log.id,
            scheduleTaskId: ids.get("2.1"),
            description: "Escavação e preparação da frente de trabalho",
            createdBy: userId,
          },
        });
        await tx.dailyLogWorkforce.create({
          data: {
            ...scope,
            dailyLogId: log.id,
            companyName: "Construtora Demo",
            trade: "Construção civil",
            workerCount: 8,
            hoursPerWorker: 8,
            createdBy: userId,
          },
        });
        await tx.dailyLogEquipment.create({
          data: {
            ...scope,
            dailyLogId: log.id,
            equipmentName: "Escavadora",
            quantity: 1,
            hoursWorked: 6,
            createdBy: userId,
          },
        });
        await tx.dailyLog.update({
          where: { id: log.id },
          data: {
            status: "APPROVED",
            submittedBy: userId,
            submittedAt: at(offset),
            approvedBy: userId,
            approvedAt: at(offset),
            version: 2,
          },
        });
      }
      await tx.projectProgressSnapshot.create({
        data: {
          ...scope,
          snapshotDate: day,
          plannedProgress: calculated.plannedProgress,
          actualProgress: calculated.actualProgress,
          createdBy: userId,
        },
      });
    },
    { timeout: 20000 },
  );
}
