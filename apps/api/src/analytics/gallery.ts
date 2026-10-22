import { Inject, Injectable } from "@nestjs/common";
import { Database, fail } from "../platform.js";
import { ExecutionAccess } from "../schedule/access.js";
import { DocumentService } from "../document/document.module.js";
import type { ApiRequest } from "../auth/security.js";
import { maySeeFile } from "../../../../packages/domain/src/daily-log.js";
import { z } from "zod";
export const galleryQuery = z
  .object({
    date_from: z.iso.date().optional(),
    date_to: z.iso.date().optional(),
    daily_log: z.uuid().optional(),
    inspection: z.uuid().optional(),
    activity: z.uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(24),
  })
  .strict();
@Injectable()
export class GalleryService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(ExecutionAccess) readonly access: ExecutionAccess,
    @Inject(DocumentService) readonly documents: DocumentService,
  ) {}
  async list(
    r: ApiRequest,
    p: string,
    q: z.infer<typeof galleryQuery>,
    photosOnly = true,
  ) {
    const { scope, role } = await this.access.check(r, p);
    const visibility = (
      [
        "INTERNAL",
        "PROJECT_MEMBERS",
        "CLIENT_VISIBLE",
        "FINANCIER_VISIBLE",
        "PUBLIC_PROJECT",
      ] as const
    ).filter((x) => maySeeFile(role, x));
    const external = ["CLIENT", "FINANCIER"].includes(role),
      staff = ["ADMIN", "MANAGER"].includes(role);
    const logs = external
      ? await this.db.dailyLog.findMany({
          where: { ...scope, status: "APPROVED" },
          select: { id: true },
        })
      : null;
    const linked = q.activity
      ? await this.db.dailyLogPhoto.findMany({
          where: { ...scope, scheduleTaskId: q.activity },
          select: { documentId: true },
        })
      : null;
    const where = {
      ...scope,
      ...(photosOnly ? { isPhoto: true } : {}),
      confirmedAt: { not: null },
      deletedAt: null,
      visibility: { in: visibility },
      ...(!staff ? { expenseId: null } : {}),
      ...(role === "CLIENT" ? { contractId: null } : {}),
      ...(role === "INSPECTOR"
        ? { fundingAgreementId: null, paymentId: null }
        : {}),
      ...(q.daily_log ? { dailyLogId: q.daily_log } : {}),
      ...(q.inspection ? { inspectionId: q.inspection } : {}),
      ...(linked ? { id: { in: linked.map((x) => x.documentId) } } : {}),
      ...(q.date_from || q.date_to
        ? {
            createdAt: {
              ...(q.date_from ? { gte: new Date(q.date_from) } : {}),
              ...(q.date_to
                ? { lt: new Date(Date.parse(q.date_to) + 86400000) }
                : {}),
            },
          }
        : {}),
      ...(logs
        ? {
            OR: [
              { dailyLogId: { in: logs.map((x) => x.id) } },
              { dailyLogId: null },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.document.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        select: {
          id: true,
          fileName: true,
          createdAt: true,
          visibility: true,
          dailyLogId: true,
          inspectionId: true,
          correctiveActionId: true,
        },
      }),
      this.db.document.count({ where }),
    ]);
    return {
      items: rows.map((x) => ({
        ...x,
        url: `/api/v1/projects/${p}/${photosOnly ? "gallery" : "documents"}/${x.id}/file`,
      })),
      total,
      page: q.page,
      limit: q.limit,
    };
  }
  async file(r: ApiRequest, p: string, id: string, photosOnly = true) {
    const { scope, role } = await this.access.check(r, p);
    const doc = await this.db.document.findFirst({
      where: {
        ...scope,
        id,
        ...(photosOnly ? { isPhoto: true } : {}),
        confirmedAt: { not: null },
        deletedAt: null,
      },
    });
    if (!doc) fail(404, "RESOURCE_NOT_FOUND", "Ficheiro não encontrado");
    if (!maySeeFile(role, doc.visibility))
      fail(403, "ACCESS_DENIED", "Sem acesso ao ficheiro");
    const owners = [
      "inspection",
      "correctiveAction",
      "dailyLog",
      "expense",
      "contract",
      "measurement",
      "fundingAgreement",
      "payment",
    ] as const;
    const owner = owners.find((x) => doc[`${x}Id`]);
    if (!owner) fail(404, "RESOURCE_NOT_FOUND", "Origem não encontrada");
    return this.documents.download(r, p, doc[`${owner}Id`]!, id, owner);
  }
}
