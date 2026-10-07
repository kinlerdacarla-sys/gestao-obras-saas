import type { Database } from "../../api/src/platform.js";
import { compute, today } from "../../api/src/schedule/schedule.service.js";
/** Fixed-size project batches; upsert makes retry safe for each logical date. */
export async function snapshotProgress(db: Database, date = today()) {
  let cursor: string | undefined;
  let count = 0;
  for (;;) {
    const schedules = await db.schedule.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { id: "asc" },
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!schedules.length) break;
    for (const schedule of schedules) {
      const scope = {
        tenantId: schedule.tenantId,
        projectId: schedule.projectId,
      };
      const result = await compute(db, scope, date);
      const data = {
        ...scope,
        snapshotDate: new Date(`${date}T00:00:00.000Z`),
        plannedProgress: result.plannedProgress,
        actualProgress: result.actualProgress,
        createdBy: schedule.createdBy,
      };
      await db.projectProgressSnapshot.upsert({
        where: {
          projectId_snapshotDate: {
            projectId: scope.projectId,
            snapshotDate: data.snapshotDate,
          },
        },
        create: data,
        update: {
          plannedProgress: data.plannedProgress,
          actualProgress: data.actualProgress,
        },
      });
      count++;
    }
    cursor = schedules.at(-1)!.id;
  }
  return { count, date };
}
