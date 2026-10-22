import { maySeeFile } from "../../../../packages/domain/src/daily-log.js";
import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import type {
  Prisma,
  Inspection,
  NonConformity,
} from "../generated/prisma/client.js";
import type { ApiRequest } from "../auth/security.js";
import { Database, fail } from "../platform.js";
import { ExecutionAccess, type Scope } from "../schedule/access.js";
import { recordAudit } from "../audit/audit.module.js";
import * as v from "../../../../packages/validation/src/quality.js";
import * as d from "../../../../packages/domain/src/quality.js";
import { notifyQuality } from "../notification/quality.js";
type Tx = Prisma.TransactionClient;
type Q = z.infer<typeof v.query>;
const page = (q: Q) => ({ skip: (q.page - 1) * q.limit, take: q.limit });
const dates = <T extends Record<string, unknown>>(input: T) =>
  Object.fromEntries(
    Object.entries(input).map(([k, x]) => [
      k,
      k.endsWith("Date") && typeof x === "string" ? new Date(x) : x,
    ]),
  );
const active = [
  "OPEN",
  "ASSIGNED",
  "CORRECTION_IN_PROGRESS",
  "READY_FOR_VERIFICATION",
  "REOPENED",
] as const;
@Injectable()
export class QualityService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(ExecutionAccess) readonly access: ExecutionAccess,
  ) {}
  async scope(r: ApiRequest, p: string, roles?: string[]) {
    const a = await this.access.check(r, p);
    if (roles && !roles.includes(a.role))
      fail(403, "ACCESS_DENIED", "Sem permissão de qualidade");
    return a;
  }
  async tx<T>(s: Scope, fn: (tx: Tx) => Promise<T>) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM projects WHERE tenant_id=${s.tenantId}::uuid AND id=${s.projectId}::uuid FOR UPDATE`;
        return fn(tx);
      },
      { timeout: 30000 },
    );
  }
  audit(
    tx: Tx,
    r: ApiRequest,
    s: Scope | { tenantId: string },
    action: string,
    entityType: string,
    id: string,
    before: unknown,
    after: unknown,
  ) {
    return recordAudit(
      tx,
      r.auth,
      {
        action,
        entityType,
        entityId: id,
        ...("projectId" in s ? { projectId: s.projectId } : {}),
        oldValues: before,
        newValues: after,
      },
      r,
    );
  }
  async refs(
    tx: Tx,
    s: Scope,
    b: {
      scheduleTaskId?: string | null;
      budgetItemId?: string | null;
      dailyLogId?: string | null;
      contractId?: string | null;
      measurementId?: string | null;
      responsibleUserId?: string | null;
      responsibleOrganizationId?: string | null;
      inspectorId?: string | null;
      assignedInspectorId?: string | null;
    },
  ) {
    for (const [id, exists] of [
      [
        b.scheduleTaskId,
        () =>
          tx.scheduleTask.findFirst({ where: { ...s, id: b.scheduleTaskId! } }),
      ],
      [
        b.budgetItemId,
        () =>
          tx.budgetItem.findFirst({
            where: { ...s, id: b.budgetItemId!, itemType: "ITEM" },
          }),
      ],
      [
        b.dailyLogId,
        () => tx.dailyLog.findFirst({ where: { ...s, id: b.dailyLogId! } }),
      ],
      [
        b.contractId,
        () => tx.contract.findFirst({ where: { ...s, id: b.contractId! } }),
      ],
      [
        b.measurementId,
        () =>
          tx.measurement.findFirst({ where: { ...s, id: b.measurementId! } }),
      ],
      [
        b.responsibleOrganizationId,
        () =>
          tx.projectOrganization.findFirst({
            where: { ...s, organizationId: b.responsibleOrganizationId! },
          }),
      ],
    ] as const)
      if (id && !(await exists()))
        fail(404, "RESOURCE_NOT_FOUND", "Referência não pertence à obra");
    for (const id of [
      b.responsibleUserId,
      b.inspectorId,
      b.assignedInspectorId,
    ].filter(Boolean) as string[]) {
      const member = await tx.tenantUser.findFirst({
        where: { tenantId: s.tenantId, userId: id, status: "ACTIVE" },
      });
      const project = await tx.projectUser.findFirst({
        where: { ...s, userId: id, status: "ACTIVE" },
      });
      if (!member || (member.role !== "ADMIN" && !project))
        fail(404, "RESOURCE_NOT_FOUND", "Utilizador não pertence à obra");
      if (
        (id === b.inspectorId || id === b.assignedInspectorId) &&
        member.role !== "ADMIN" &&
        project?.role !== "INSPECTOR"
      )
        fail(400, "VALIDATION_ERROR", "Selecione um fiscal da obra");
    }
    if (
      b.measurementId &&
      b.contractId &&
      !(await tx.measurement.findFirst({
        where: { ...s, id: b.measurementId, contractId: b.contractId },
      }))
    )
      fail(400, "VALIDATION_ERROR", "Medição e contrato incompatíveis");
  }
  async options(r: ApiRequest, p: string) {
    const { scope: s, role } = await this.scope(r, p);
    return {
      role,
      users: await this.db.projectUser
        .findMany({
          where: { ...s, status: "ACTIVE" },
          include: { membership: { include: { user: true } } },
        })
        .then((rows) =>
          rows.map((x) => ({
            id: x.userId,
            name: x.membership.user.name,
            role: x.role,
          })),
        ),
      organizations: await this.db.projectOrganization
        .findMany({ where: s, include: { organization: true } })
        .then((rows) =>
          rows.map((x) => ({
            id: x.organizationId,
            name: x.organization.legalName,
          })),
        ),
      templates: await this.db.checklistTemplate.findMany({
        where: { tenantId: s.tenantId, status: "ACTIVE" },
        take: 200,
      }),
      tasks: await this.db.scheduleTask.findMany({
        where: s,
        select: { id: true, code: true, name: true },
        take: 200,
      }),
      budgetItems: await this.db.budgetItem.findMany({
        where: { ...s, itemType: "ITEM" },
        select: { id: true, code: true, description: true },
        take: 200,
      }),
      contracts: await this.db.contract.findMany({
        where: s,
        select: { id: true, contractNumber: true },
        take: 200,
      }),
      measurements: await this.db.measurement.findMany({
        where: s,
        select: { id: true, code: true },
        take: 200,
      }),
      dailyLogs: await this.db.dailyLog.findMany({
        where: s,
        select: { id: true, logDate: true },
        take: 200,
      }),
    };
  }
  async templates(r: ApiRequest, q: Q) {
    const where = {
      tenantId: r.auth.tenantId,
      ...(q.search
        ? { name: { contains: q.search, mode: "insensitive" as const } }
        : {}),
    };
    return {
      items: await this.db.checklistTemplate.findMany({
        where,
        ...page(q),
        orderBy: { code: "asc" },
      }),
      total: await this.db.checklistTemplate.count({ where }),
      ...q,
    };
  }
  async template(r: ApiRequest, id: string) {
    const s = { tenantId: r.auth.tenantId };
    const row =
      (await this.db.checklistTemplate.findFirst({ where: { ...s, id } })) ??
      fail(404, "CHECKLIST_TEMPLATE_NOT_FOUND", "Checklist não encontrado");
    return {
      ...row,
      versions: await this.db.checklistTemplateVersion.findMany({
        where: { ...s, checklistTemplateId: id },
        orderBy: { versionNumber: "desc" },
      }),
    };
  }
  async templateItems(r: ApiRequest, id: string) {
    const row =
      (await this.db.checklistTemplateVersion.findFirst({
        where: { tenantId: r.auth.tenantId, id },
      })) ?? fail(404, "CHECKLIST_TEMPLATE_NOT_FOUND", "Versão não encontrada");
    return {
      ...row,
      items: await this.db.checklistTemplateItem.findMany({
        where: { tenantId: r.auth.tenantId, checklistTemplateVersionId: id },
        orderBy: { sortOrder: "asc" },
      }),
    };
  }
  async createTemplate(r: ApiRequest, b: z.infer<typeof v.template>) {
    this.access.admin(r);
    const { items, ...fields } = b;
    return this.db.$transaction(async (tx) => {
      const s = { tenantId: r.auth.tenantId, createdBy: r.auth.userId };
      const t = await tx.checklistTemplate.create({
        data: { ...s, ...fields },
      });
      const ver = await tx.checklistTemplateVersion.create({
        data: { ...s, checklistTemplateId: t.id, versionNumber: 1 },
      });
      await tx.checklistTemplateItem.createMany({
        data: items.map((i) => ({
          ...s,
          ...i,
          checklistTemplateVersionId: ver.id,
        })),
      });
      await this.audit(
        tx,
        r,
        s,
        "CHECKLIST_TEMPLATE_CREATED",
        "ChecklistTemplate",
        t.id,
        null,
        t,
      );
      return { ...t, draftVersionId: ver.id };
    });
  }
  async patchTemplate(
    r: ApiRequest,
    id: string,
    b: z.infer<typeof v.templatePatch>,
  ) {
    this.access.admin(r);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM checklist_templates WHERE id=${id}::uuid AND tenant_id=${r.auth.tenantId}::uuid FOR UPDATE`;
      const before =
        (await tx.checklistTemplate.findFirst({
          where: { tenantId: r.auth.tenantId, id },
        })) ??
        fail(404, "CHECKLIST_TEMPLATE_NOT_FOUND", "Checklist não encontrado");
      d.assertVersion(before.version, b.version);
      if (b.status === "ACTIVE" && !before.currentVersion)
        fail(
          409,
          "CHECKLIST_VERSION_IMMUTABLE",
          "Publique uma versão primeiro",
        );
      const after = await tx.checklistTemplate.update({
        where: { id },
        data: { ...b, version: { increment: 1 } },
      });
      await this.audit(
        tx,
        r,
        before,
        "CHECKLIST_TEMPLATE_UPDATED",
        "ChecklistTemplate",
        id,
        before,
        after,
      );
      return after;
    });
  }
  async newVersion(
    r: ApiRequest,
    id: string,
    b: z.infer<typeof v.templateVersion>,
  ) {
    this.access.admin(r);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM checklist_templates WHERE id=${id}::uuid AND tenant_id=${r.auth.tenantId}::uuid FOR UPDATE`;
      if (
        !(await tx.checklistTemplate.findFirst({
          where: { tenantId: r.auth.tenantId, id },
        }))
      )
        fail(404, "CHECKLIST_TEMPLATE_NOT_FOUND", "Checklist não encontrado");
      const s = { tenantId: r.auth.tenantId, createdBy: r.auth.userId };
      const last = await tx.checklistTemplateVersion.aggregate({
        where: { tenantId: s.tenantId, checklistTemplateId: id },
        _max: { versionNumber: true },
      });
      const row = await tx.checklistTemplateVersion.create({
        data: {
          ...s,
          checklistTemplateId: id,
          versionNumber: (last._max.versionNumber ?? 0) + 1,
        },
      });
      await tx.checklistTemplateItem.createMany({
        data: b.items.map((i) => ({
          ...s,
          ...i,
          checklistTemplateVersionId: row.id,
        })),
      });
      await this.audit(
        tx,
        r,
        s,
        "CHECKLIST_TEMPLATE_VERSION_CREATED",
        "ChecklistTemplateVersion",
        row.id,
        null,
        row,
      );
      return row;
    });
  }
  async versionAction(
    r: ApiRequest,
    id: string,
    b: z.infer<typeof v.action> | z.infer<typeof v.versionItems>,
    publish: boolean,
  ) {
    this.access.admin(r);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM checklist_templates WHERE id=(SELECT checklist_template_id FROM checklist_template_versions WHERE id=${id}::uuid AND tenant_id=${r.auth.tenantId}::uuid) FOR UPDATE`;
      const row =
        (await tx.checklistTemplateVersion.findFirst({
          where: { tenantId: r.auth.tenantId, id },
        })) ??
        fail(404, "CHECKLIST_TEMPLATE_NOT_FOUND", "Versão não encontrada");
      d.assertVersion(row.version, b.version);
      d.editableChecklist(row.status);
      if (publish) {
        const template = await tx.checklistTemplate.findFirstOrThrow({
          where: { tenantId: r.auth.tenantId, id: row.checklistTemplateId },
        });
        if (row.versionNumber <= template.currentVersion)
          fail(
            409,
            "CHECKLIST_VERSION_IMMUTABLE",
            "Publique uma versão posterior à versão atual",
          );
        const count = await tx.checklistTemplateItem.count({
          where: { checklistTemplateVersionId: id },
        });
        if (!count) fail(400, "VALIDATION_ERROR", "Checklist vazio");
        await tx.checklistTemplateVersion.updateMany({
          where: {
            tenantId: r.auth.tenantId,
            checklistTemplateId: row.checklistTemplateId,
            status: "PUBLISHED",
          },
          data: { status: "SUPERSEDED" },
        });
        await tx.checklistTemplate.update({
          where: { id: row.checklistTemplateId },
          data: {
            status: "ACTIVE",
            currentVersion: row.versionNumber,
            version: { increment: 1 },
          },
        });
      } else if ("items" in b) {
        await tx.checklistTemplateItem.deleteMany({
          where: { checklistTemplateVersionId: id },
        });
        await tx.checklistTemplateItem.createMany({
          data: b.items.map((i) => ({
            ...i,
            tenantId: r.auth.tenantId,
            createdBy: r.auth.userId,
            checklistTemplateVersionId: id,
          })),
        });
      }
      const after = await tx.checklistTemplateVersion.update({
        where: { id },
        data: {
          version: { increment: 1 },
          ...(publish
            ? {
                status: "PUBLISHED",
                publishedBy: r.auth.userId,
                publishedAt: new Date(),
              }
            : {}),
        },
      });
      await this.audit(
        tx,
        r,
        row,
        publish
          ? "CHECKLIST_TEMPLATE_PUBLISHED"
          : "CHECKLIST_TEMPLATE_VERSION_UPDATED",
        "ChecklistTemplateVersion",
        id,
        row,
        after,
      );
      return after;
    });
  }
  async requests(r: ApiRequest, p: string, q: Q) {
    if (
      q.status &&
      ![
        "DRAFT",
        "SUBMITTED",
        "SCHEDULED",
        "INSPECTION_IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
        "REJECTED",
      ].includes(q.status)
    )
      fail(400, "VALIDATION_ERROR", "Estado de pedido inválido");
    const { scope: s } = await this.scope(r, p);
    const where: Prisma.InspectionRequestWhereInput = {
      ...s,
      ...(q.status
        ? { status: q.status as Prisma.EnumInspectionRequestStatusFilter }
        : {}),
      ...(q.search
        ? { title: { contains: q.search, mode: "insensitive" } }
        : {}),
    };
    return {
      items: await this.db.inspectionRequest.findMany({
        where,
        ...page(q),
        orderBy: { requestNumber: "desc" },
      }),
      total: await this.db.inspectionRequest.count({ where }),
      page: q.page,
      limit: q.limit,
    };
  }
  async request(r: ApiRequest, p: string, id: string) {
    const { scope: s } = await this.scope(r, p);
    return (
      (await this.db.inspectionRequest.findFirst({ where: { ...s, id } })) ??
      fail(404, "INSPECTION_REQUEST_NOT_FOUND", "Pedido não encontrado")
    );
  }
  async saveRequest(
    r: ApiRequest,
    p: string,
    b: z.infer<typeof v.request> | z.infer<typeof v.requestPatch>,
    id?: string,
  ) {
    const { scope: s } = await this.scope(r, p, ["ADMIN", "MANAGER"]);
    return this.tx(s, async (tx) => {
      await this.refs(tx, s, b);
      const before = id
        ? await tx.inspectionRequest.findFirst({ where: { ...s, id } })
        : null;
      if (id && !before)
        fail(404, "INSPECTION_REQUEST_NOT_FOUND", "Pedido não encontrado");
      if (before) {
        d.assertVersion(
          before.version,
          (b as z.infer<typeof v.requestPatch>).version,
        );
        if (before.status !== "DRAFT")
          fail(409, "INVALID_INSPECTION_TRANSITION", "Pedido não editável");
      }
      const fields = dates(b);
      delete fields.version;
      const max = before
        ? 0
        : ((
            await tx.inspectionRequest.aggregate({
              where: s,
              _max: { requestNumber: true },
            })
          )._max.requestNumber ?? 0);
      const after = before
        ? await tx.inspectionRequest.update({
            where: { id },
            data: { ...fields, version: { increment: 1 } },
          })
        : await tx.inspectionRequest.create({
            data: {
              ...s,
              ...fields,
              createdBy: r.auth.userId,
              requestedBy: r.auth.userId,
              requestNumber: max + 1,
              code: `IR-${String(max + 1).padStart(3, "0")}`,
            } as Prisma.InspectionRequestUncheckedCreateInput,
          });
      await this.audit(
        tx,
        r,
        s,
        before ? "INSPECTION_REQUEST_UPDATED" : "INSPECTION_REQUEST_CREATED",
        "InspectionRequest",
        after.id,
        before,
        after,
      );
      return after;
    });
  }
  async requestAction(
    r: ApiRequest,
    p: string,
    id: string,
    action: string,
    b: z.infer<typeof v.action> | z.infer<typeof v.schedule>,
  ) {
    const { scope: s } = await this.scope(
      r,
      p,
      action === "schedule" ? ["ADMIN", "INSPECTOR"] : ["ADMIN", "MANAGER"],
    );
    return this.tx(s, async (tx) => {
      const row =
        (await tx.inspectionRequest.findFirst({ where: { ...s, id } })) ??
        fail(404, "INSPECTION_REQUEST_NOT_FOUND", "Pedido não encontrado");
      d.assertVersion(row.version, b.version);
      const target =
        action === "submit"
          ? "SUBMITTED"
          : action === "schedule"
            ? "SCHEDULED"
            : "CANCELLED";
      if (
        !(action === "submit"
          ? row.status === "DRAFT"
          : action === "schedule"
            ? row.status === "SUBMITTED"
            : ["DRAFT", "SUBMITTED", "SCHEDULED"].includes(row.status))
      )
        fail(
          409,
          "INVALID_INSPECTION_TRANSITION",
          "Transição de pedido inválida",
        );
      const assigned =
        "assignedInspectorId" in b ? b.assignedInspectorId : undefined;
      if (assigned) await this.refs(tx, s, { assignedInspectorId: assigned });
      const after = await tx.inspectionRequest.update({
        where: { id },
        data: {
          status: target,
          assignedInspectorId: assigned,
          version: { increment: 1 },
        },
      });
      await this.audit(
        tx,
        r,
        s,
        `INSPECTION_REQUEST_${target}`,
        "InspectionRequest",
        id,
        row,
        after,
      );
      await notifyQuality(
        tx,
        s,
        r.auth.userId,
        `request:${id}:${after.version}`,
        `INSPECTION_REQUEST_${target}`,
        after.title,
        `/projects/${p}/inspection-requests`,
        assigned ? [assigned] : undefined,
      );
      return after;
    });
  }

  async inspection(r: ApiRequest, p: string, id: string) {
    const { scope: s } = await this.scope(r, p);
    const row =
      (await this.db.inspection.findFirst({ where: { ...s, id } })) ??
      fail(404, "INSPECTION_NOT_FOUND", "Inspeção não encontrada");
    const items = await this.db.inspectionItem.findMany({
      where: { ...s, inspectionId: id },
      orderBy: { createdAt: "asc" },
    });
    const rules = await this.db.checklistTemplateItem.findMany({
      where: {
        tenantId: s.tenantId,
        checklistTemplateVersionId: row.checklistTemplateVersionId,
      },
      orderBy: { sortOrder: "asc" },
    });
    return {
      ...row,
      items: rules.map((rule) => ({
        ...items.find((i) => i.templateItemId === rule.id),
        template: rule,
      })),
      nonConformities: await this.db.nonConformity.findMany({
        where: { ...s, inspectionId: id },
        take: 200,
      }),
      history: await this.db.auditLog.findMany({
        where: { ...s, entityId: id },
        orderBy: { createdAt: "asc" },
        take: 200,
      }),
    };
  }
  inspectionWhere(s: Scope, q: Q): Prisma.InspectionWhereInput {
    if (
      q.status &&
      !["DRAFT", "IN_PROGRESS", "SUBMITTED", "CLOSED", "CANCELLED"].includes(
        q.status,
      )
    )
      fail(400, "VALIDATION_ERROR", "Estado de inspeção inválido");
    return {
      ...s,
      ...(q.status
        ? { status: q.status as Prisma.EnumInspectionStatusFilter }
        : {}),
      ...(q.result ? { overallResult: q.result } : {}),
      ...(q.inspector ? { inspectorId: q.inspector } : {}),
      ...(q.contract ? { contractId: q.contract } : {}),
      ...(q.schedule_task ? { scheduleTaskId: q.schedule_task } : {}),
      ...(q.budget_item ? { budgetItemId: q.budget_item } : {}),
      ...(q.date_from || q.date_to
        ? {
            inspectionDate: {
              ...(q.date_from ? { gte: new Date(q.date_from) } : {}),
              ...(q.date_to ? { lte: new Date(q.date_to) } : {}),
            },
          }
        : {}),
      ...(q.search
        ? {
            OR: [
              { title: { contains: q.search, mode: "insensitive" } },
              { code: { contains: q.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
  }
  async inspections(r: ApiRequest, p: string, q: Q) {
    const { scope: s } = await this.scope(r, p);
    const where = this.inspectionWhere(s, q);
    return {
      items: await this.db.inspection.findMany({
        where,
        ...page(q),
        orderBy: { inspectionNumber: "desc" },
      }),
      total: await this.db.inspection.count({ where }),
      page: q.page,
      limit: q.limit,
    };
  }
  editableInspection(row: Inspection) {
    if (!["DRAFT", "IN_PROGRESS"].includes(row.status))
      fail(409, "INSPECTION_IMMUTABLE", "Inspeção não editável");
  }
  async saveInspection(
    r: ApiRequest,
    p: string,
    b: z.infer<typeof v.inspection> | z.infer<typeof v.inspectionPatch>,
    id?: string,
  ) {
    const { scope: s } = await this.scope(r, p, ["ADMIN", "INSPECTOR"]);
    return this.tx(s, async (tx) => {
      await this.refs(tx, s, b);
      const before = id
        ? await tx.inspection.findFirst({ where: { ...s, id } })
        : null;
      if (id && !before)
        fail(404, "INSPECTION_NOT_FOUND", "Inspeção não encontrada");
      const fields = dates(b);
      delete fields.version;
      if (before) {
        d.assertVersion(
          before.version,
          (b as z.infer<typeof v.inspectionPatch>).version,
        );
        this.editableInspection(before);
        const after = await tx.inspection.update({
          where: { id },
          data: { ...fields, version: { increment: 1 } },
        });
        await this.audit(
          tx,
          r,
          s,
          "INSPECTION_UPDATED",
          "Inspection",
          after.id,
          before,
          after,
        );
        return after;
      }
      const input = b as z.infer<typeof v.inspection>;
      const ver = await tx.checklistTemplateVersion.findFirst({
        where: {
          tenantId: s.tenantId,
          id: input.checklistTemplateVersionId,
          status: "PUBLISHED",
        },
      });
      if (
        !ver ||
        !(await tx.checklistTemplate.findFirst({
          where: {
            tenantId: s.tenantId,
            id: ver.checklistTemplateId,
            status: "ACTIVE",
          },
        }))
      )
        fail(
          404,
          "CHECKLIST_TEMPLATE_NOT_FOUND",
          "Escolha uma versão publicada ativa",
        );
      if (input.inspectionRequestId) {
        const request = await tx.inspectionRequest.findFirst({
          where: { ...s, id: input.inspectionRequestId, status: "SCHEDULED" },
        });
        if (!request)
          fail(
            409,
            "INVALID_INSPECTION_TRANSITION",
            "Pedido deve estar agendado",
          );
        for (const key of [
          "scheduleTaskId",
          "budgetItemId",
          "dailyLogId",
          "contractId",
        ] as const) {
          if (input[key] && request[key] && input[key] !== request[key])
            fail(400, "VALIDATION_ERROR", "Origem incompatível com o pedido");
          fields[key] = input[key] ?? request[key];
        }
        await tx.inspectionRequest.update({
          where: { id: request.id },
          data: { status: "INSPECTION_IN_PROGRESS", version: { increment: 1 } },
        });
      }
      const max =
        (
          await tx.inspection.aggregate({
            where: s,
            _max: { inspectionNumber: true },
          })
        )._max.inspectionNumber ?? 0;
      const after = await tx.inspection.create({
        data: {
          ...s,
          ...fields,
          createdBy: r.auth.userId,
          inspectionNumber: max + 1,
          code: `INS-${String(max + 1).padStart(3, "0")}`,
        } as Prisma.InspectionUncheckedCreateInput,
      });
      const items = await tx.checklistTemplateItem.findMany({
        where: { tenantId: s.tenantId, checklistTemplateVersionId: ver.id },
      });
      await tx.inspectionItem.createMany({
        data: items.map((i) => ({
          ...s,
          inspectionId: after.id,
          templateItemId: i.id,
          createdBy: r.auth.userId,
        })),
      });
      await this.audit(
        tx,
        r,
        s,
        "INSPECTION_CREATED",
        "Inspection",
        after.id,
        null,
        after,
      );
      await notifyQuality(
        tx,
        s,
        r.auth.userId,
        `inspection:${after.id}`,
        "INSPECTION_ASSIGNED",
        after.title,
        `/projects/${p}/inspections/${after.id}`,
        [after.inspectorId],
      );
      return after;
    });
  }
  async answer(
    r: ApiRequest,
    p: string,
    id: string,
    itemId: string,
    b: z.infer<typeof v.answer>,
  ) {
    const { scope: s } = await this.scope(r, p, ["ADMIN", "INSPECTOR"]);
    return this.tx(s, async (tx) => {
      const row =
        (await tx.inspection.findFirst({ where: { ...s, id } })) ??
        fail(404, "INSPECTION_NOT_FOUND", "Inspeção não encontrada");
      d.assertVersion(row.version, b.version);
      this.editableInspection(row);
      const item =
        (await tx.inspectionItem.findFirst({
          where: { ...s, id: itemId, inspectionId: id },
        })) ?? fail(404, "RESOURCE_NOT_FOUND", "Item não encontrado");
      const rules = await tx.checklistTemplateItem.findFirstOrThrow({
        where: { tenantId: s.tenantId, id: item.templateItemId },
      });
      if (!rules.allowComment && b.comment)
        fail(400, "VALIDATION_ERROR", "Este item não permite comentários");
      if (
        (["PASS_FAIL_NA", "YES_NO_NA"].includes(rules.responseType) &&
          (b.textValue || b.numericValue || b.dateValue)) ||
        (!["PASS_FAIL_NA", "YES_NO_NA"].includes(rules.responseType) &&
          b.result)
      )
        fail(
          400,
          "VALIDATION_ERROR",
          "Resposta incompatível com o tipo de item",
        );
      if (
        (b.textValue != null && rules.responseType !== "TEXT") ||
        (b.numericValue != null && rules.responseType !== "NUMBER") ||
        (b.dateValue != null && rules.responseType !== "DATE")
      )
        fail(
          400,
          "VALIDATION_ERROR",
          "Resposta incompatível com o tipo de item",
        );
      const fields = { ...b };
      delete (fields as { version?: number }).version;
      const after = await tx.inspectionItem.update({
        where: { id: itemId },
        data: {
          ...fields,
          dateValue:
            fields.dateValue === undefined
              ? undefined
              : fields.dateValue
                ? new Date(fields.dateValue)
                : null,
          holdPointReleasedAt: null,
          holdPointReleasedBy: null,
          holdPointReleaseReason: null,
        },
      });
      const all = await tx.inspectionItem.findMany({
        where: { ...s, inspectionId: id },
      });
      await tx.inspection.update({
        where: { id },
        data: {
          version: { increment: 1 },
          overallResult: d.overall(all, row.generalComments),
        },
      });
      await this.audit(
        tx,
        r,
        s,
        "INSPECTION_ITEM_UPDATED",
        "Inspection",
        id,
        item,
        after,
      );
      return { ...after, version: row.version + 1 };
    });
  }
  async inspectionAction(
    r: ApiRequest,
    p: string,
    id: string,
    action: string,
    b: z.infer<typeof v.action>,
    itemId?: string,
  ) {
    const { scope: s } = await this.scope(r, p, ["ADMIN", "INSPECTOR"]);
    return this.tx(s, async (tx) => {
      const row =
        (await tx.inspection.findFirst({ where: { ...s, id } })) ??
        fail(404, "INSPECTION_NOT_FOUND", "Inspeção não encontrada");
      d.assertVersion(row.version, b.version);
      if (row.status === "CLOSED")
        fail(409, "INSPECTION_IMMUTABLE", "Inspeção encerrada é imutável");
      if (action === "release-hold-point") {
        if (!b.comment?.trim())
          fail(400, "VALIDATION_ERROR", "Justifique a liberação");
        const item =
          (await tx.inspectionItem.findFirst({
            where: { ...s, id: itemId, inspectionId: id },
          })) ?? fail(404, "RESOURCE_NOT_FOUND", "Item não encontrado");
        const rule = await tx.checklistTemplateItem.findFirstOrThrow({
          where: { tenantId: s.tenantId, id: item.templateItemId },
        });
        if (!rule.isHoldPoint || item.result !== "FAIL")
          fail(
            409,
            "HOLD_POINT_NOT_RELEASED",
            "Não existe hold point reprovado",
          );
        await tx.inspectionItem.update({
          where: { id: item.id },
          data: {
            holdPointReleasedBy: r.auth.userId,
            holdPointReleasedAt: new Date(),
            holdPointReleaseReason: b.comment,
          },
        });
        const after = await tx.inspection.update({
          where: { id },
          data: { version: { increment: 1 } },
        });
        await this.audit(
          tx,
          r,
          s,
          "HOLD_POINT_RELEASED",
          "Inspection",
          id,
          item,
          b,
        );
        return after;
      }
      const allowed: Record<string, string[]> = {
        start: ["DRAFT"],
        submit: ["IN_PROGRESS"],
        close: ["SUBMITTED"],
        cancel: ["DRAFT", "IN_PROGRESS"],
      };
      if (!allowed[action]?.includes(row.status))
        fail(
          409,
          "INVALID_INSPECTION_TRANSITION",
          "Transição de inspeção inválida",
        );
      const all = await tx.inspectionItem.findMany({
        where: { ...s, inspectionId: id },
      });
      if (action === "submit" || action === "close") {
        const rules = await tx.checklistTemplateItem.findMany({
          where: {
            tenantId: s.tenantId,
            checklistTemplateVersionId: row.checklistTemplateVersionId,
          },
        });
        const evidence = await tx.inspectionEvidence.findMany({
          where: { ...s, inspectionId: id, evidenceType: "PHOTO" },
        });
        const docs = await tx.document.findMany({
          where: {
            ...s,
            id: { in: evidence.map((e) => e.documentId) },
            confirmedAt: { not: null },
            deletedAt: null,
            isPhoto: true,
          },
          select: { id: true },
        });
        for (const item of all) {
          const rule = rules.find((x) => x.id === item.templateItemId)!;
          d.validateAnswer(
            item,
            rule,
            evidence.some(
              (e) =>
                e.inspectionItemId === item.id &&
                docs.some((x) => x.id === e.documentId),
            ),
          );
          if (action === "close") d.holdPoint(item, rule);
        }
      }
      const status =
        action === "start"
          ? "IN_PROGRESS"
          : action === "submit"
            ? "SUBMITTED"
            : action === "close"
              ? "CLOSED"
              : "CANCELLED";
      const after = await tx.inspection.update({
        where: { id },
        data: {
          status,
          overallResult: d.overall(all, row.generalComments),
          version: { increment: 1 },
          ...(action === "submit" ? { submittedAt: new Date() } : {}),
          ...(action === "close"
            ? { closedAt: new Date(), closedBy: r.auth.userId }
            : {}),
        },
      });
      if (
        row.inspectionRequestId &&
        (action === "close" || action === "cancel")
      )
        await tx.inspectionRequest.update({
          where: { id: row.inspectionRequestId },
          data: {
            status: action === "close" ? "COMPLETED" : "SCHEDULED",
            version: { increment: 1 },
          },
        });
      await this.audit(
        tx,
        r,
        s,
        `INSPECTION_${action === "start" ? "STARTED" : status}`,
        "Inspection",
        id,
        row,
        after,
      );
      return after;
    });
  }

  ncrWhere(s: Scope, q: Q): Prisma.NonConformityWhereInput {
    if (
      q.status &&
      ![...active, "CLOSED", "CANCELLED"].includes(
        q.status as (typeof active)[number],
      )
    )
      fail(400, "VALIDATION_ERROR", "Estado de NCR inválido");
    return {
      ...s,
      ...(q.status ? { status: q.status as Prisma.EnumNcrStatusFilter } : {}),
      ...(q.severity ? { severity: q.severity } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.contract ? { contractId: q.contract } : {}),
      ...(q.schedule_task ? { scheduleTaskId: q.schedule_task } : {}),
      ...(q.budget_item ? { budgetItemId: q.budget_item } : {}),
      ...(q.measurement ? { measurementId: q.measurement } : {}),
      ...(q.responsible_user ? { responsibleUserId: q.responsible_user } : {}),
      ...(q.responsible_organization
        ? { responsibleOrganizationId: q.responsible_organization }
        : {}),
      ...(q.overdue === "true"
        ? {
            AND: [
              { status: { in: [...active] } },
              { dueDate: { lt: new Date(d.projectDate()) } },
            ],
          }
        : {}),
      ...(q.overdue === "false"
        ? {
            NOT: {
              AND: [
                { status: { in: [...active] } },
                { dueDate: { lt: new Date(d.projectDate()) } },
              ],
            },
          }
        : {}),
      ...(q.date_from || q.date_to
        ? {
            detectedAt: {
              ...(q.date_from ? { gte: new Date(q.date_from) } : {}),
              ...(q.date_to
                ? { lt: new Date(new Date(q.date_to).getTime() + 86400000) }
                : {}),
            },
          }
        : {}),
      ...(q.search
        ? {
            OR: [
              { title: { contains: q.search, mode: "insensitive" } },
              { code: { contains: q.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
  }
  async ncrs(r: ApiRequest, p: string, q: Q) {
    const { scope: s } = await this.scope(r, p);
    const where = this.ncrWhere(s, q);
    return {
      items: (
        await this.db.nonConformity.findMany({
          where,
          ...page(q),
          orderBy: { ncrNumber: "desc" },
        })
      ).map((n) => ({
        ...n,
        isOverdue: d.overdue(n.dueDate, n.status),
        daysOpen: Math.floor(
          ((n.closedAt ?? new Date()).getTime() - n.detectedAt.getTime()) /
            86400000,
        ),
      })),
      total: await this.db.nonConformity.count({ where }),
      page: q.page,
      limit: q.limit,
    };
  }
  async ncr(r: ApiRequest, p: string, id: string) {
    const { scope: s } = await this.scope(r, p);
    const row =
      (await this.db.nonConformity.findFirst({ where: { ...s, id } })) ??
      fail(404, "NON_CONFORMITY_NOT_FOUND", "NCR não encontrada");
    return {
      ...row,
      isOverdue: d.overdue(row.dueDate, row.status),
      actions: await this.db.correctiveAction.findMany({
        where: { ...s, nonConformityId: id },
        orderBy: { actionNumber: "asc" },
        take: 200,
      }),
      events: await this.db.nonConformityEvent.findMany({
        where: { ...s, nonConformityId: id },
        orderBy: { createdAt: "asc" },
        take: 500,
      }),
      comments: await this.db.nonConformityComment.findMany({
        where: { ...s, nonConformityId: id },
        orderBy: { createdAt: "asc" },
        take: 200,
      }),
    };
  }
  async event(
    tx: Tx,
    r: ApiRequest,
    s: Scope,
    id: string,
    type: Prisma.NonConformityEventUncheckedCreateInput["eventType"],
    from: NonConformity["status"] | null,
    to: NonConformity["status"] | null,
    comment?: string | null,
  ) {
    return tx.nonConformityEvent.create({
      data: {
        ...s,
        nonConformityId: id,
        eventType: type,
        fromStatus: from,
        toStatus: to,
        comment,
        userId: r.auth.userId,
        createdBy: r.auth.userId,
      },
    });
  }
  editableNcr(row: NonConformity) {
    if (["CLOSED", "CANCELLED"].includes(row.status))
      fail(
        409,
        "NON_CONFORMITY_IMMUTABLE",
        "NCR encerrada; reabra para novas ações",
      );
  }
  async saveNcr(
    r: ApiRequest,
    p: string,
    b: z.infer<typeof v.ncr> | z.infer<typeof v.ncrPatch>,
    id?: string,
    occurrenceId?: string,
  ) {
    const { scope: s } = await this.scope(r, p, ["ADMIN", "INSPECTOR"]);
    return this.tx(s, async (tx) => {
      await this.refs(tx, s, b);
      const before = id
        ? await tx.nonConformity.findFirst({ where: { ...s, id } })
        : null;
      if (id && !before)
        fail(404, "NON_CONFORMITY_NOT_FOUND", "NCR não encontrada");
      if (before) {
        d.assertVersion(
          before.version,
          (b as z.infer<typeof v.ncrPatch>).version,
        );
        this.editableNcr(before);
      }
      const fields = dates(b);
      delete fields.version;
      const inspectionId = b.inspectionId ?? before?.inspectionId;
      if (inspectionId) {
        const inspection =
          (await tx.inspection.findFirst({
            where: { ...s, id: inspectionId },
          })) ?? fail(404, "INSPECTION_NOT_FOUND", "Inspeção não encontrada");
        for (const key of [
          "scheduleTaskId",
          "budgetItemId",
          "contractId",
          "measurementId",
          "dailyLogId",
        ] as const) {
          if (b[key] && inspection[key] && b[key] !== inspection[key])
            fail(400, "VALIDATION_ERROR", "Origem incompatível com inspeção");
          if (!before) fields[key] = b[key] ?? inspection[key];
        }
      }
      const itemId = b.inspectionItemId ?? before?.inspectionItemId;
      if (itemId) {
        if (!inspectionId) fail(400, "VALIDATION_ERROR", "Indique a inspeção");
        const item =
          (await tx.inspectionItem.findFirst({
            where: { ...s, id: itemId, inspectionId },
          })) ??
          fail(404, "RESOURCE_NOT_FOUND", "Item não pertence à inspeção");
        if (
          !(await tx.inspection.findFirst({
            where: { ...s, id: inspectionId, status: "CLOSED" },
          }))
        )
          await tx.inspectionItem.update({
            where: { id: item.id },
            data: { isNonConformity: true },
          });
      }
      if (occurrenceId) {
        const occurrence =
          (await tx.dailyLogOccurrence.findFirst({
            where: { ...s, id: occurrenceId },
          })) ?? fail(404, "RESOURCE_NOT_FOUND", "Ocorrência não encontrada");
        fields.dailyLogId = occurrence.dailyLogId;
        fields.dailyLogOccurrenceId = occurrenceId;
      }
      const max = before
        ? 0
        : ((
            await tx.nonConformity.aggregate({
              where: s,
              _max: { ncrNumber: true },
            })
          )._max.ncrNumber ?? 0);
      const after = before
        ? await tx.nonConformity.update({
            where: { id },
            data: { ...fields, version: { increment: 1 } },
          })
        : await tx.nonConformity.create({
            data: {
              ...s,
              ...fields,
              createdBy: r.auth.userId,
              detectedBy: r.auth.userId,
              ncrNumber: max + 1,
              code: `NCR-${String(max + 1).padStart(3, "0")}`,
            } as Prisma.NonConformityUncheckedCreateInput,
          });
      await this.event(
        tx,
        r,
        s,
        after.id,
        before ? "STATUS_CHANGED" : "CREATED",
        before?.status ?? null,
        after.status,
      );
      await this.audit(
        tx,
        r,
        s,
        before ? "NCR_UPDATED" : "NCR_CREATED",
        "NonConformity",
        after.id,
        before,
        after,
      );
      if (after.severity === "CRITICAL")
        await notifyQuality(
          tx,
          s,
          r.auth.userId,
          `ncr-critical:${after.id}:${after.version}`,
          "NCR_CRITICAL_CREATED",
          after.title,
          `/projects/${p}/non-conformities/${after.id}`,
        );
      return after;
    });
  }
  async ncrAction(
    r: ApiRequest,
    p: string,
    id: string,
    action: string,
    b: z.infer<typeof v.action> | z.infer<typeof v.assignment>,
  ) {
    const read = await this.scope(r, p);
    return this.tx(read.scope, async (tx) => {
      const s = read.scope;
      const row =
        (await tx.nonConformity.findFirst({ where: { ...s, id } })) ??
        fail(404, "NON_CONFORMITY_NOT_FOUND", "NCR não encontrada");
      d.assertVersion(row.version, b.version);
      const verifying = [
        "verify",
        "close",
        "reopen",
        "reject-correction",
      ].includes(action);
      const actions = await tx.correctiveAction.findMany({
        where: { ...s, nonConformityId: id, status: { not: "CANCELLED" } },
      });
      if (verifying && action !== "reopen")
        for (const a of actions) d.independent(a.completedBy, r.auth.userId);
      if (
        !(
          verifying ? ["ADMIN", "INSPECTOR"] : ["ADMIN", "MANAGER", "INSPECTOR"]
        ).includes(read.role)
      )
        fail(
          403,
          "NCR_VERIFICATION_NOT_ALLOWED",
          "Sem permissão para esta transição",
        );
      if (action === "verify") {
        if (row.status !== "READY_FOR_VERIFICATION")
          fail(
            409,
            "INVALID_NCR_TRANSITION",
            "NCR não está pronta para verificação",
          );
        if (
          !actions.length ||
          actions.some((a) => !["COMPLETED", "VERIFIED"].includes(a.status))
        )
          fail(
            409,
            "NCR_CLOSE_REQUIRES_VERIFIED_ACTIONS",
            "Conclua as ações corretivas",
          );
        for (const a of actions.filter((a) => a.status === "COMPLETED")) {
          await tx.correctiveAction.update({
            where: { id: a.id },
            data: {
              status: "VERIFIED",
              verifiedBy: r.auth.userId,
              verifiedAt: new Date(),
              version: { increment: 1 },
            },
          });
          await this.audit(
            tx,
            r,
            s,
            "CORRECTIVE_ACTION_VERIFIED",
            "CorrectiveAction",
            a.id,
            a,
            { status: "VERIFIED" },
          );
        }
        const after = await tx.nonConformity.update({
          where: { id },
          data: {
            verifiedBy: r.auth.userId,
            verifiedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await this.event(
          tx,
          r,
          s,
          id,
          "VERIFICATION_APPROVED",
          row.status,
          row.status,
          b.comment,
        );
        await this.audit(
          tx,
          r,
          s,
          "NCR_VERIFIED",
          "NonConformity",
          id,
          row,
          after,
        );
        return after;
      }
      const targets: Record<string, NonConformity["status"]> = {
        assign: "ASSIGNED",
        "start-correction": "CORRECTION_IN_PROGRESS",
        "ready-for-verification": "READY_FOR_VERIFICATION",
        close: "CLOSED",
        reopen: "REOPENED",
        "reject-correction": "REOPENED",
        cancel: "CANCELLED",
      };
      const target = targets[action];
      if (!target) fail(400, "INVALID_NCR_TRANSITION", "Ação desconhecida");
      d.transition(row.status, target, "NCR");
      if (action === "assign") {
        if (
          !("responsibleUserId" in b || "responsibleOrganizationId" in b) ||
          (!b.responsibleUserId && !b.responsibleOrganizationId)
        )
          fail(400, "VALIDATION_ERROR", "Indique responsável");
        await this.refs(tx, s, b);
      }
      if (
        action === "ready-for-verification" &&
        (!actions.some((a) => a.status === "COMPLETED") ||
          actions.some((a) => !["COMPLETED", "VERIFIED"].includes(a.status)))
      )
        fail(
          409,
          "NCR_CLOSE_REQUIRES_VERIFIED_ACTIONS",
          "Conclua todas as ações",
        );
      if (
        action === "close" &&
        (!actions.length ||
          actions.some((a) => a.status !== "VERIFIED") ||
          !row.verifiedAt)
      )
        fail(
          409,
          "NCR_CLOSE_REQUIRES_VERIFIED_ACTIONS",
          "Verifique todas as ações antes de encerrar",
        );
      if (
        ["reopen", "reject-correction", "cancel"].includes(action) &&
        !b.comment?.trim()
      )
        fail(400, "VALIDATION_ERROR", "Indique o motivo");
      if (action === "reject-correction")
        for (const a of actions.filter((a) => a.status === "COMPLETED")) {
          await tx.correctiveAction.update({
            where: { id: a.id },
            data: { status: "REJECTED", version: { increment: 1 } },
          });
          await this.audit(
            tx,
            r,
            s,
            "CORRECTIVE_ACTION_REJECTED",
            "CorrectiveAction",
            a.id,
            a,
            { status: "REJECTED", comment: b.comment },
          );
        }
      const assign =
        "responsibleUserId" in b || "responsibleOrganizationId" in b
          ? {
              responsibleUserId: b.responsibleUserId,
              responsibleOrganizationId: b.responsibleOrganizationId,
              dueDate:
                b.dueDate === undefined
                  ? undefined
                  : b.dueDate
                    ? new Date(b.dueDate)
                    : null,
            }
          : {};
      const after = await tx.nonConformity.update({
        where: { id },
        data: {
          status: target,
          version: { increment: 1 },
          ...assign,
          ...(action === "close"
            ? { closedBy: r.auth.userId, closedAt: new Date() }
            : {}),
          ...(target === "REOPENED"
            ? {
                closedBy: null,
                closedAt: null,
                verifiedBy: null,
                verifiedAt: null,
              }
            : {}),
        },
      });
      const event =
        action === "assign"
          ? "ASSIGNED"
          : action === "close"
            ? "CLOSED"
            : action === "reject-correction"
              ? "VERIFICATION_REJECTED"
              : action === "reopen"
                ? "REOPENED"
                : "STATUS_CHANGED";
      await this.event(tx, r, s, id, event, row.status, target, b.comment);
      await this.audit(
        tx,
        r,
        s,
        action === "close"
          ? "NCR_CLOSED"
          : action === "reopen"
            ? "NCR_REOPENED"
            : action === "assign"
              ? "NCR_ASSIGNED"
              : "NCR_STATUS_CHANGED",
        "NonConformity",
        id,
        row,
        after,
      );
      await notifyQuality(
        tx,
        s,
        r.auth.userId,
        `ncr:${id}:${after.version}`,
        `NCR_${target}`,
        after.title,
        `/projects/${p}/non-conformities/${id}`,
        after.responsibleUserId ? [after.responsibleUserId] : undefined,
      );
      return after;
    });
  }
  async addComment(
    r: ApiRequest,
    p: string,
    id: string,
    b: z.infer<typeof v.comment>,
  ) {
    const { scope: s } = await this.scope(r, p, [
      "ADMIN",
      "MANAGER",
      "INSPECTOR",
    ]);
    return this.tx(s, async (tx) => {
      const row =
        (await tx.nonConformity.findFirst({ where: { ...s, id } })) ??
        fail(404, "NON_CONFORMITY_NOT_FOUND", "NCR não encontrada");
      d.assertVersion(row.version, b.version);
      this.editableNcr(row);
      const comment = await tx.nonConformityComment.create({
        data: {
          ...s,
          nonConformityId: id,
          comment: b.comment,
          createdBy: r.auth.userId,
        },
      });
      await tx.nonConformity.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
      await this.event(
        tx,
        r,
        s,
        id,
        "COMMENTED",
        row.status,
        row.status,
        b.comment,
      );
      await this.audit(
        tx,
        r,
        s,
        "NCR_COMMENTED",
        "NonConformity",
        id,
        null,
        comment,
      );
      return comment;
    });
  }
  async corrective(r: ApiRequest, p: string, id: string) {
    const { scope: s } = await this.scope(r, p);
    return (
      (await this.db.correctiveAction.findFirst({ where: { ...s, id } })) ??
      fail(404, "CORRECTIVE_ACTION_NOT_FOUND", "Ação não encontrada")
    );
  }
  async saveCorrective(
    r: ApiRequest,
    p: string,
    ncrId: string | undefined,
    b: z.infer<typeof v.correctiveAction> | z.infer<typeof v.correctivePatch>,
    id?: string,
  ) {
    const { scope: s } = await this.scope(r, p, ["ADMIN", "MANAGER"]);
    return this.tx(s, async (tx) => {
      const before = id
        ? await tx.correctiveAction.findFirst({ where: { ...s, id } })
        : null;
      if (id && !before)
        fail(404, "CORRECTIVE_ACTION_NOT_FOUND", "Ação não encontrada");
      const parent =
        (await tx.nonConformity.findFirst({
          where: { ...s, id: before?.nonConformityId ?? ncrId },
        })) ?? fail(404, "NON_CONFORMITY_NOT_FOUND", "NCR não encontrada");
      this.editableNcr(parent);
      if (parent.status !== "CORRECTION_IN_PROGRESS")
        fail(409, "INVALID_NCR_TRANSITION", "Inicie a correção primeiro");
      d.assertVersion(before?.version ?? parent.version, b.version);
      if (
        before &&
        !["OPEN", "IN_PROGRESS", "REJECTED"].includes(before.status)
      )
        fail(409, "NON_CONFORMITY_IMMUTABLE", "Ação não editável");
      await this.refs(tx, s, b);
      const fields = dates(b);
      delete fields.version;
      const max = before
        ? 0
        : ((
            await tx.correctiveAction.aggregate({
              where: { ...s, nonConformityId: parent.id },
              _max: { actionNumber: true },
            })
          )._max.actionNumber ?? 0);
      const after = before
        ? await tx.correctiveAction.update({
            where: { id },
            data: { ...fields, version: { increment: 1 } },
          })
        : await tx.correctiveAction.create({
            data: {
              ...s,
              ...fields,
              nonConformityId: parent.id,
              actionNumber: max + 1,
              createdBy: r.auth.userId,
            } as Prisma.CorrectiveActionUncheckedCreateInput,
          });
      await tx.nonConformity.update({
        where: { id: parent.id },
        data: { version: { increment: 1 }, verifiedBy: null, verifiedAt: null },
      });
      await this.event(
        tx,
        r,
        s,
        parent.id,
        before ? "STATUS_CHANGED" : "CORRECTIVE_ACTION_CREATED",
        parent.status,
        parent.status,
        b.description,
      );
      await this.audit(
        tx,
        r,
        s,
        before ? "CORRECTIVE_ACTION_UPDATED" : "CORRECTIVE_ACTION_CREATED",
        "CorrectiveAction",
        after.id,
        before,
        after,
      );
      return after;
    });
  }
  async correctiveAction(
    r: ApiRequest,
    p: string,
    id: string,
    action: string,
    b: z.infer<typeof v.action> | z.infer<typeof v.completion>,
  ) {
    const { scope: s, role } = await this.scope(r, p);
    return this.tx(s, async (tx) => {
      const row =
        (await tx.correctiveAction.findFirst({ where: { ...s, id } })) ??
        fail(404, "CORRECTIVE_ACTION_NOT_FOUND", "Ação não encontrada");
      d.assertVersion(row.version, b.version);
      const parent = await tx.nonConformity.findFirstOrThrow({
        where: { ...s, id: row.nonConformityId },
      });
      this.editableNcr(parent);
      const verifying = action === "verify" || action === "reject";
      if (verifying) d.independent(row.completedBy, r.auth.userId);
      if (
        !(verifying ? ["ADMIN", "INSPECTOR"] : ["ADMIN", "MANAGER"]).includes(
          role,
        )
      )
        fail(403, "NCR_VERIFICATION_NOT_ALLOWED", "Sem permissão para a ação");
      const target = (
        {
          start: "IN_PROGRESS",
          complete: "COMPLETED",
          verify: "VERIFIED",
          reject: "REJECTED",
          cancel: "CANCELLED",
        } as const
      )[action as "start"];
      if (!target)
        fail(400, "INVALID_CORRECTIVE_ACTION_TRANSITION", "Ação desconhecida");
      d.transition(row.status, target, "CORRECTIVE_ACTION");
      if (!verifying && parent.status !== "CORRECTION_IN_PROGRESS")
        fail(409, "INVALID_NCR_TRANSITION", "NCR não está em correção");
      if (verifying && parent.status !== "READY_FOR_VERIFICATION")
        fail(
          409,
          "INVALID_NCR_TRANSITION",
          "NCR não está pronta para verificação",
        );
      if (action === "complete") {
        if (!("completionNotes" in b))
          fail(400, "VALIDATION_ERROR", "Descreva a correção");
        const evidence = await tx.document.count({
          where: {
            ...s,
            correctiveActionId: id,
            confirmedAt: { not: null },
            deletedAt: null,
          },
        });
        if (!evidence)
          fail(
            400,
            "VALIDATION_ERROR",
            "Anexe evidência confirmada da correção",
          );
      }
      if (action === "reject" && !b.comment?.trim())
        fail(400, "VALIDATION_ERROR", "Indique o motivo");
      const after = await tx.correctiveAction.update({
        where: { id },
        data: {
          status: target,
          version: { increment: 1 },
          ...(action === "complete"
            ? {
                completedBy: r.auth.userId,
                completedAt: new Date(),
                completionNotes:
                  "completionNotes" in b ? b.completionNotes : null,
              }
            : {}),
          ...(action === "verify"
            ? { verifiedBy: r.auth.userId, verifiedAt: new Date() }
            : {}),
          ...(action === "start"
            ? {
                completedBy: null,
                completedAt: null,
                verifiedBy: null,
                verifiedAt: null,
              }
            : {}),
        },
      });
      await tx.nonConformity.update({
        where: { id: parent.id },
        data: {
          version: { increment: 1 },
          ...(action === "reject"
            ? { status: "REOPENED", verifiedAt: null, verifiedBy: null }
            : {}),
        },
      });
      await this.event(
        tx,
        r,
        s,
        parent.id,
        action === "complete"
          ? "CORRECTIVE_ACTION_COMPLETED"
          : action === "verify"
            ? "VERIFICATION_APPROVED"
            : action === "reject"
              ? "VERIFICATION_REJECTED"
              : "STATUS_CHANGED",
        parent.status,
        action === "reject" ? "REOPENED" : parent.status,
        b.comment,
      );
      await this.audit(
        tx,
        r,
        s,
        `CORRECTIVE_ACTION_${action === "start" ? "STARTED" : target}`,
        "CorrectiveAction",
        id,
        row,
        after,
      );
      if (action === "complete" || action === "reject")
        await notifyQuality(
          tx,
          s,
          r.auth.userId,
          `action:${id}:${after.version}`,
          `CORRECTIVE_ACTION_${target}`,
          parent.title,
          `/projects/${p}/non-conformities/${parent.id}`,
        );
      return after;
    });
  }

  async policy(r: ApiRequest, p: string) {
    const { scope: s } = await this.scope(r, p);
    return (
      (await this.db.qualityPolicy.findFirst({ where: s })) ?? {
        ...s,
        version: 0,
        blockMeasurementOnOpenCriticalNcr: true,
        preventSelfVerification: true,
      }
    );
  }
  async setPolicy(r: ApiRequest, p: string, b: z.infer<typeof v.policy>) {
    const { scope: s } = await this.scope(r, p, ["ADMIN"]);
    return this.tx(s, async (tx) => {
      const before = await tx.qualityPolicy.findFirst({ where: s });
      d.assertVersion(before?.version ?? 0, b.version);
      const after = await tx.qualityPolicy.upsert({
        where: { tenantId_projectId: s },
        create: { ...s, ...b, version: 1, createdBy: r.auth.userId },
        update: { ...b, version: { increment: 1 } },
      });
      await this.audit(
        tx,
        r,
        s,
        "QUALITY_POLICY_UPDATED",
        "QualityPolicy",
        after.id,
        before,
        after,
      );
      return after;
    });
  }
  async summary(r: ApiRequest, p: string, q: Q) {
    const { scope: s } = await this.scope(r, p);
    return this.db.$transaction(
      async (tx) => {
        const inspections = this.inspectionWhere(s, q),
          ncr = this.ncrWhere(s, q);
        const [groups, ngroups, overdue, average] = await Promise.all([
          tx.inspection.groupBy({
            by: ["status", "overallResult"],
            where: inspections,
            _count: true,
          }),
          tx.nonConformity.groupBy({
            by: ["status", "severity"],
            where: ncr,
            _count: true,
          }),
          tx.nonConformity.count({
            where: {
              AND: [
                ncr,
                {
                  status: { in: [...active] },
                  dueDate: { lt: new Date(d.projectDate()) },
                },
              ],
            },
          }),
          tx.$queryRaw<
            { days: number | null }[]
          >`SELECT AVG(EXTRACT(EPOCH FROM (closed_at-detected_at))/86400)::float8 AS days FROM non_conformities WHERE tenant_id=${s.tenantId}::uuid AND project_id=${p}::uuid AND status='CLOSED'
 AND (${q.status ?? null}::text IS NULL OR status::text=${q.status ?? null})
 AND (${q.severity ?? null}::text IS NULL OR severity::text=${q.severity ?? null})
 AND (${q.category ?? null}::text IS NULL OR category::text=${q.category ?? null})
 AND (${q.contract ?? null}::uuid IS NULL OR contract_id=${q.contract ?? null}::uuid)
 AND (${q.schedule_task ?? null}::uuid IS NULL OR schedule_task_id=${q.schedule_task ?? null}::uuid)
 AND (${q.budget_item ?? null}::uuid IS NULL OR budget_item_id=${q.budget_item ?? null}::uuid)
 AND (${q.measurement ?? null}::uuid IS NULL OR measurement_id=${q.measurement ?? null}::uuid)
 AND (${q.responsible_user ?? null}::uuid IS NULL OR responsible_user_id=${q.responsible_user ?? null}::uuid)
 AND (${q.responsible_organization ?? null}::uuid IS NULL OR responsible_organization_id=${q.responsible_organization ?? null}::uuid)
 AND (${q.date_from ?? null}::date IS NULL OR detected_at>=${q.date_from ?? null}::date)
 AND (${q.date_to ?? null}::date IS NULL OR detected_at<${q.date_to ?? null}::date+interval '1 day')
 AND (${q.search ?? null}::text IS NULL OR title ILIKE '%'||${q.search ?? null}||'%' OR code ILIKE '%'||${q.search ?? null}||'%')
 AND ${q.overdue !== "true"}`,
        ]);
        const completed = groups.filter((x) => x.status === "CLOSED"),
          passed = completed
            .filter((x) => x.overallResult === "PASS")
            .reduce((n, x) => n + x._count, 0),
          totalCompleted = completed.reduce((n, x) => n + x._count, 0),
          closed = ngroups
            .filter((x) => x.status === "CLOSED")
            .reduce((n, x) => n + x._count, 0),
          totalNcr = ngroups.reduce((n, x) => n + x._count, 0),
          open = ngroups.filter(
            (x) => !["CLOSED", "CANCELLED"].includes(x.status),
          );
        return {
          inspectionsTotal: groups.reduce((n, x) => n + x._count, 0),
          inspectionsCompleted: totalCompleted,
          inspectionsPassed: passed,
          inspectionsFailed: completed
            .filter((x) => x.overallResult === "FAIL")
            .reduce((n, x) => n + x._count, 0),
          inspectionsWithObservations: completed
            .filter((x) => x.overallResult === "PASS_WITH_OBSERVATIONS")
            .reduce((n, x) => n + x._count, 0),
          openNonConformities: open.reduce((n, x) => n + x._count, 0),
          overdueNonConformities: overdue,
          criticalNonConformities: open
            .filter((x) => x.severity === "CRITICAL")
            .reduce((n, x) => n + x._count, 0),
          closedNonConformities: closed,
          totalNonConformities: totalNcr,
          averageClosureDays: Math.round((average[0]?.days ?? 0) * 100) / 100,
          firstPassRate: d.rate(passed, totalCompleted),
          closureRate: d.rate(closed, totalNcr),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async trends(r: ApiRequest, p: string, q: Q) {
    const { scope: s } = await this.scope(r, p);
    const interval = q.interval;
    const rows = await this.db.$queryRaw<
      {
        period: Date;
        inspections: bigint;
        failed_inspections: bigint;
        ncr_created: bigint;
        ncr_closed: bigint;
        critical_ncr: bigint;
      }[]
    >`
 WITH events AS (
 SELECT date_trunc(${interval},inspection_date) period,1 inspections,CASE WHEN overall_result='FAIL' THEN 1 ELSE 0 END failed_inspections,0 ncr_created,0 ncr_closed,0 critical_ncr FROM inspections WHERE tenant_id=${s.tenantId}::uuid AND project_id=${p}::uuid
 UNION ALL SELECT date_trunc(${interval},detected_at AT TIME ZONE 'Africa/Maputo'),0,0,1,0,CASE WHEN severity='CRITICAL' THEN 1 ELSE 0 END FROM non_conformities WHERE tenant_id=${s.tenantId}::uuid AND project_id=${p}::uuid
 UNION ALL SELECT date_trunc(${interval},closed_at AT TIME ZONE 'Africa/Maputo'),0,0,0,1,0 FROM non_conformities WHERE tenant_id=${s.tenantId}::uuid AND project_id=${p}::uuid AND status='CLOSED')
 SELECT period,sum(inspections) inspections,sum(failed_inspections) failed_inspections,sum(ncr_created) ncr_created,sum(ncr_closed) ncr_closed,sum(critical_ncr) critical_ncr FROM events GROUP BY period ORDER BY period`;
    return {
      interval,
      series: rows.map((x) => ({
        ...x,
        inspections: Number(x.inspections),
        failed_inspections: Number(x.failed_inspections),
        ncr_created: Number(x.ncr_created),
        ncr_closed: Number(x.ncr_closed),
        critical_ncr: Number(x.critical_ncr),
      })),
      category: await this.db.nonConformity.groupBy({
        by: ["category"],
        where: s,
        _count: true,
      }),
      severity: await this.db.nonConformity.groupBy({
        by: ["severity"],
        where: s,
        _count: true,
      }),
      organizations: await this.db.nonConformity.groupBy({
        by: ["responsibleOrganizationId"],
        where: s,
        _count: true,
      }),
    };
  }
  async indicators(r: ApiRequest, p: string, kind: string, id: string) {
    const { scope: s } = await this.scope(r, p);
    const key = (
      {
        schedule: "scheduleTaskId",
        budget: "budgetItemId",
        contracts: "contractId",
        measurements: "measurementId",
        "daily-logs": "dailyLogId",
      } as const
    )[kind as "schedule"];
    if (!key) fail(404, "RESOURCE_NOT_FOUND", "Origem inválida");
    await this.refs(this.db, s, { [key]: id });
    const where = { ...s, [key]: id };
    const [inspectionCount, open, critical, overdue, holds] = await Promise.all(
      [
        this.db.inspection.count({ where }),
        this.db.nonConformity.count({
          where: { ...where, status: { in: [...active] } },
        }),
        this.db.nonConformity.count({
          where: {
            ...where,
            status: { in: [...active] },
            severity: "CRITICAL",
          },
        }),
        this.db.nonConformity.count({
          where: {
            ...where,
            status: { in: [...active] },
            dueDate: { lt: new Date(d.projectDate()) },
          },
        }),
        this.db.$queryRaw<
          { count: bigint }[]
        >`SELECT count(*) FROM inspection_items i JOIN inspections x ON x.id=i.inspection_id JOIN checklist_template_items t ON t.id=i.template_item_id WHERE x.tenant_id=${s.tenantId}::uuid AND x.project_id=${p}::uuid AND (to_jsonb(x)->>${key.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())})=${id} AND t.is_hold_point AND i.result='FAIL' AND i.hold_point_released_at IS NULL AND x.status<>'CANCELLED'`,
      ],
    );
    return {
      inspectionCount,
      openNcrCount: open,
      criticalNcrCount: critical,
      overdueNcrCount: overdue,
      unreleasedHoldPoints: Number(holds[0]?.count ?? 0),
      qualityStatus:
        critical || Number(holds[0]?.count)
          ? "CRITICAL"
          : open
            ? "NON_CONFORMING"
            : inspectionCount
              ? "OBSERVATION"
              : "OK",
    };
  }
  async report(r: ApiRequest, p: string, kind: string, id?: string) {
    const { scope: s } = await this.scope(r, p);
    const project = await this.db.project.findFirstOrThrow({
      where: { tenantId: s.tenantId, id: p },
      select: { id: true, code: true, name: true, location: true },
    });
    const data =
      kind === "inspection"
        ? await this.inspection(r, p, id!)
        : kind === "ncr"
          ? await this.ncr(r, p, id!)
          : {
              summary: await this.summary(r, p, v.query.parse({})),
              trends: await this.trends(r, p, v.query.parse({})),
            };
    let evidence: unknown[] = [];
    if (kind === "inspection") {
      const docs = await this.db.document.findMany({
        where: {
          ...s,
          inspectionId: id,
          confirmedAt: { not: null },
          deletedAt: null,
        },
      });
      const { role } = await this.scope(r, p);
      evidence = docs
        .filter((doc) => maySeeFile(role, doc.visibility))
        .map((doc) => ({
          id: doc.id,
          fileName: doc.fileName,
          isPhoto: doc.isPhoto,
          contentUrl: `/api/v1/projects/${p}/inspections/${id}/documents/${doc.id}/content`,
        }));
    }
    const signerId = "closedBy" in data ? data.closedBy : null;
    const inspectorId = "inspectorId" in data ? data.inspectorId : null;
    const inspectorIdentity = inspectorId
      ? await this.db.user.findUnique({
          where: { id: inspectorId },
          select: { id: true, name: true },
        })
      : null;
    const checklistVersion =
      "checklistTemplateVersionId" in data
        ? await this.db.checklistTemplateVersion.findFirst({
            where: {
              id: data.checklistTemplateVersionId,
              tenantId: s.tenantId,
            },
          })
        : null;
    const checklist = checklistVersion
      ? await this.db.checklistTemplate.findFirst({
          where: {
            id: checklistVersion.checklistTemplateId,
            tenantId: s.tenantId,
          },
          select: { id: true, code: true, name: true },
        })
      : null;
    const signer = signerId
      ? await this.db.user.findUnique({
          where: { id: signerId },
          select: { id: true, name: true },
        })
      : null;
    return {
      project,
      generatedAt: new Date(),
      kind,
      data,
      evidence,
      closedByIdentity: signer,
      inspectorIdentity,
      checklist: checklist && {
        ...checklist,
        versionNumber: checklistVersion!.versionNumber,
      },
    };
  }
}
