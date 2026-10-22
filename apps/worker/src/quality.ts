import type { Database } from "../../api/src/platform.js";
import { notifyQuality } from "../../api/src/notification/quality.js";
import { projectDate } from "../../../packages/domain/src/quality.js";
export async function monitorQualityDeadlines(db: Database, now = new Date()) {
  const today = new Date(projectDate(now)),
    soon = new Date(today.getTime() + 3 * 86400000);
  let cursor: string | undefined,
    count = 0;
  for (;;) {
    const rows = await db.nonConformity.findMany({
      where: {
        status: { notIn: ["CLOSED", "CANCELLED"] },
        dueDate: { lte: soon },
      },
      orderBy: { id: "asc" },
      take: 200,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!rows.length) break;
    for (const n of rows) {
      const type = n.dueDate! < today ? "NCR_OVERDUE" : "NCR_DUE_SOON";
      await db.$transaction(async (tx) =>
        notifyQuality(
          tx,
          { tenantId: n.tenantId, projectId: n.projectId },
          n.detectedBy,
          `deadline:${n.id}:${n.dueDate!.toISOString().slice(0, 10)}:${type}`,
          type,
          n.title,
          `/projects/${n.projectId}/non-conformities/${n.id}`,
          n.responsibleUserId ? [n.responsibleUserId] : undefined,
        ),
      );
      count++;
    }
    cursor = rows.at(-1)!.id;
  }
  return { processed: count };
}
