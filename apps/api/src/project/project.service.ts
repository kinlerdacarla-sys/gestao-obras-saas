import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import { Database, fail, notFound } from "../platform.js";
import { TenantScope } from "../tenant/tenant.module.js";
import type { ApiRequest } from "../auth/security.js";
import { canEditProject } from "../../../../packages/domain/src/index.js";
import {
  projectSchema,
  projectPatchSchema,
  projectUserSchema,
  projectUserPatchSchema,
  projectOrganizationSchema,
} from "../../../../packages/validation/src/index.js";
import { recordAudit } from "../audit/audit.module.js";
import type { Prisma } from "../generated/prisma/client.js";
@Injectable()
export class ProjectService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(TenantScope) private readonly scope: TenantScope,
  ) {}
  private visible(req: ApiRequest): Prisma.ProjectWhereInput {
    return {
      ...this.scope.where(req.auth),
      ...(req.auth.role === "ADMIN"
        ? {}
        : {
            users: {
              some: {
                tenantId: req.auth.tenantId,
                userId: req.auth.userId,
                status: "ACTIVE",
              },
            },
          }),
    };
  }
  list(req: ApiRequest) {
    return this.db.project.findMany({
      where: this.visible(req),
      orderBy: { createdAt: "desc" },
    });
  }
  async get(req: ApiRequest, id: string) {
    return (
      (await this.db.project.findFirst({
        where: { ...this.visible(req), id },
      })) ?? notFound()
    );
  }
  private dates(input: Partial<z.infer<typeof projectSchema>>) {
    return {
      ...input,
      startDate:
        input.startDate === undefined
          ? undefined
          : input.startDate
            ? new Date(input.startDate)
            : null,
      plannedEndDate:
        input.plannedEndDate === undefined
          ? undefined
          : input.plannedEndDate
            ? new Date(input.plannedEndDate)
            : null,
    };
  }
  private validateDates(
    start: Date | null | undefined,
    end: Date | null | undefined,
  ) {
    if (start && end && end < start)
      fail(400, "VALIDATION_ERROR", "Data final deve ser posterior à inicial");
  }
  create(req: ApiRequest, input: z.infer<typeof projectSchema>) {
    const dates = this.dates(input);
    this.validateDates(dates.startDate, dates.plannedEndDate);
    return this.db.$transaction(async (tx) => {
      const result = await tx.project.create({
        data: {
          ...input,
          ...dates,
          ...this.scope.where(req.auth),
          createdBy: req.auth.userId,
          updatedBy: req.auth.userId,
        },
      });
      await recordAudit(
        tx,
        req.auth,
        {
          action: "PROJECT_CREATED",
          entityType: "Project",
          entityId: result.id,
          projectId: result.id,
          newValues: result,
        },
        req,
      );
      return result;
    });
  }
  async patch(
    req: ApiRequest,
    id: string,
    input: z.infer<typeof projectPatchSchema>,
  ) {
    const before = await this.get(req, id);
    const assignment = await this.db.projectUser.findFirst({
      where: {
        tenantId: req.auth.tenantId,
        projectId: id,
        userId: req.auth.userId,
        status: "ACTIVE",
      },
    });
    if (!canEditProject(req.auth.role, assignment?.role))
      fail(403, "PROJECT_ACCESS_DENIED", "Sem permissão para editar esta obra");
    if (
      req.auth.role !== "ADMIN" &&
      (input.code !== undefined ||
        input.contractValue !== undefined ||
        input.currency !== undefined)
    )
      fail(
        403,
        "FORBIDDEN",
        "Apenas administradores podem alterar código e valor contratual",
      );
    const dates = this.dates(input);
    this.validateDates(
      dates.startDate === undefined ? before.startDate : dates.startDate,
      dates.plannedEndDate === undefined
        ? before.plannedEndDate
        : dates.plannedEndDate,
    );
    return this.db.$transaction(async (tx) => {
      const result = await tx.project.update({
        where: { tenantId_id: this.scope.resource(req.auth, id) },
        data: { ...dates, updatedBy: req.auth.userId },
      });
      await recordAudit(
        tx,
        req.auth,
        {
          action: "PROJECT_UPDATED",
          entityType: "Project",
          entityId: id,
          projectId: id,
          oldValues: before,
          newValues: result,
        },
        req,
      );
      return result;
    });
  }
  async users(req: ApiRequest, id: string) {
    await this.get(req, id);
    return this.db.projectUser.findMany({
      where: { tenantId: req.auth.tenantId, projectId: id },
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
        membership: {
          select: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
  }
  async addUser(
    req: ApiRequest,
    id: string,
    input: z.infer<typeof projectUserSchema>,
  ) {
    await this.get(req, id);
    const member = await this.db.tenantUser.findFirst({
      where: {
        tenantId: req.auth.tenantId,
        userId: input.userId,
        status: { in: ["ACTIVE", "INVITED"] },
      },
    });
    if (!member) notFound();
    return this.db.$transaction(async (tx) => {
      const result = await tx.projectUser.create({
        data: { ...input, tenantId: req.auth.tenantId, projectId: id },
      });
      await recordAudit(
        tx,
        req.auth,
        {
          action: "PROJECT_USER_ADDED",
          entityType: "ProjectUser",
          entityId: result.id,
          projectId: id,
          newValues: result,
        },
        req,
      );
      return result;
    });
  }
  async patchUser(
    req: ApiRequest,
    id: string,
    userId: string,
    input: z.infer<typeof projectUserPatchSchema>,
  ) {
    await this.get(req, id);
    const before =
      (await this.db.projectUser.findFirst({
        where: { tenantId: req.auth.tenantId, projectId: id, userId },
      })) ?? notFound();
    return this.db.$transaction(async (tx) => {
      const result = await tx.projectUser.update({
        where: { id: before.id, tenantId: req.auth.tenantId },
        data: input,
      });
      await recordAudit(
        tx,
        req.auth,
        {
          action: "PROJECT_USER_UPDATED",
          entityType: "ProjectUser",
          entityId: before.id,
          projectId: id,
          oldValues: before,
          newValues: result,
        },
        req,
      );
      return result;
    });
  }
  async removeUser(req: ApiRequest, id: string, userId: string) {
    await this.get(req, id);
    return this.db.$transaction(async (tx) => {
      const before =
        (await tx.projectUser.findFirst({
          where: { tenantId: req.auth.tenantId, projectId: id, userId },
        })) ?? notFound();
      await tx.projectUser.deleteMany({
        where: { tenantId: req.auth.tenantId, projectId: id, userId },
      });
      await recordAudit(
        tx,
        req.auth,
        {
          action: "PROJECT_USER_REMOVED",
          entityType: "ProjectUser",
          entityId: before.id,
          projectId: id,
          oldValues: before,
        },
        req,
      );
      return { message: "Associação removida" };
    });
  }
  async organizations(req: ApiRequest, id: string) {
    await this.get(req, id);
    return this.db.projectOrganization.findMany({
      where: { tenantId: req.auth.tenantId, projectId: id },
      include: { organization: true },
    });
  }
  async addOrganization(
    req: ApiRequest,
    id: string,
    input: z.infer<typeof projectOrganizationSchema>,
  ) {
    await this.get(req, id);
    if (
      !(await this.db.organization.findFirst({
        where: this.scope.resource(req.auth, input.organizationId),
      }))
    )
      notFound();
    return this.db.$transaction(async (tx) => {
      const result = await tx.projectOrganization.create({
        data: { ...input, tenantId: req.auth.tenantId, projectId: id },
      });
      await recordAudit(
        tx,
        req.auth,
        {
          action: "PROJECT_ORGANIZATION_ADDED",
          entityType: "ProjectOrganization",
          entityId: result.id,
          projectId: id,
          newValues: result,
        },
        req,
      );
      return result;
    });
  }
  async removeOrganization(
    req: ApiRequest,
    id: string,
    organizationId: string,
  ) {
    await this.get(req, id);
    return this.db.$transaction(async (tx) => {
      const before =
        (await tx.projectOrganization.findFirst({
          where: { tenantId: req.auth.tenantId, projectId: id, organizationId },
        })) ?? notFound();
      await tx.projectOrganization.deleteMany({
        where: { tenantId: req.auth.tenantId, projectId: id, organizationId },
      });
      await recordAudit(
        tx,
        req.auth,
        {
          action: "PROJECT_ORGANIZATION_REMOVED",
          entityType: "ProjectOrganization",
          entityId: before.id,
          projectId: id,
          oldValues: before,
        },
        req,
      );
      return { message: "Associação removida" };
    });
  }
  async dashboard(req: ApiRequest) {
    const [total, active, completed, recent, users] = await Promise.all([
      this.db.project.count({ where: this.visible(req) }),
      this.db.project.count({
        where: { ...this.visible(req), status: "ACTIVE" },
      }),
      this.db.project.count({
        where: { ...this.visible(req), status: "COMPLETED" },
      }),
      this.db.project.findMany({
        where: this.visible(req),
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      req.auth.role === "ADMIN"
        ? this.db.tenantUser.count({
            where: { tenantId: req.auth.tenantId, status: "ACTIVE" },
          })
        : Promise.resolve(null),
    ]);
    return { total, active, completed, users, recent };
  }
}
