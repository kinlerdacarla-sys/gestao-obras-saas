import { HttpException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import type { Scope } from "../schedule/access.js";
export async function checkQualityCertification(
  tx: Prisma.TransactionClient,
  s: Scope,
  m: { id: string; contractId: string },
) {
  const policy = await tx.qualityPolicy.findFirst({ where: s });
  if (policy?.blockMeasurementOnOpenCriticalNcr === false) return;
  const items = await tx.measurementItem.findMany({
    where: { ...s, measurementId: m.id },
    select: { budgetItemId: true },
  });
  const rows = await tx.nonConformity.findMany({
    where: {
      ...s,
      severity: "CRITICAL",
      status: { not: "CLOSED" },
      OR: [
        { measurementId: m.id },
        { contractId: m.contractId },
        {
          budgetItemId: {
            in: items.flatMap((i) => (i.budgetItemId ? [i.budgetItemId] : [])),
          },
        },
      ],
    },
    select: { id: true, code: true, title: true, status: true },
    take: 200,
    orderBy: { ncrNumber: "asc" },
  });
  if (rows.length)
    throw new HttpException(
      {
        statusCode: 409,
        code: "MEASUREMENT_BLOCKED_BY_CRITICAL_NCR",
        message: "Certificação bloqueada por NCR crítica",
        details: rows,
      },
      409,
    );
}
