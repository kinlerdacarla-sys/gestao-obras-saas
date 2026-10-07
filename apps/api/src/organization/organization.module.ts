import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { Database, notFound } from "../platform.js";
import { TenantRoles, type ApiRequest } from "../auth/security.js";
import { TenantModule, TenantScope } from "../tenant/tenant.module.js";
import {
  organizationSchema,
  organizationPatchSchema,
  uuid,
} from "../../../../packages/validation/src/index.js";
import { recordAudit } from "../audit/audit.module.js";
import { RequestDoc } from "../docs.js";
import type { z } from "zod";
@Injectable()
export class OrganizationService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(TenantScope) private readonly scope: TenantScope,
  ) {}
  list(req: ApiRequest) {
    return this.db.organization.findMany({
      where: this.scope.where(req.auth),
      orderBy: { legalName: "asc" },
    });
  }
  async get(req: ApiRequest, id: string) {
    return (
      (await this.db.organization.findFirst({
        where: this.scope.resource(req.auth, id),
      })) ?? notFound()
    );
  }
  create(req: ApiRequest, input: z.infer<typeof organizationSchema>) {
    return this.db.$transaction(async (tx) => {
      const result = await tx.organization.create({
        data: { ...input, ...this.scope.where(req.auth) },
      });
      await recordAudit(
        tx,
        req.auth,
        {
          action: "ORGANIZATION_CREATED",
          entityType: "Organization",
          entityId: result.id,
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
    input: z.infer<typeof organizationPatchSchema>,
  ) {
    const before = await this.get(req, id);
    return this.db.$transaction(async (tx) => {
      const result = await tx.organization.update({
        where: { tenantId_id: this.scope.resource(req.auth, id) },
        data: input,
      });
      await recordAudit(
        tx,
        req.auth,
        {
          action: "ORGANIZATION_UPDATED",
          entityType: "Organization",
          entityId: id,
          oldValues: before,
          newValues: result,
        },
        req,
      );
      return result;
    });
  }
}
@TenantRoles("ADMIN")
@Controller("api/v1/organizations")
class OrganizationController {
  constructor(
    @Inject(OrganizationService)
    private readonly organizations: OrganizationService,
  ) {}
  @Get() list(@Req() req: ApiRequest) {
    return this.organizations.list(req);
  }
  @Get(":id") get(@Req() req: ApiRequest, @Param("id") id: string) {
    return this.organizations.get(req, uuid.parse(id));
  }
  @Post() @RequestDoc(organizationSchema) create(
    @Req() req: ApiRequest,
    @Body() body: unknown,
  ) {
    return this.organizations.create(req, organizationSchema.parse(body));
  }
  @Patch(":id") @RequestDoc(organizationPatchSchema) patch(
    @Req() req: ApiRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.organizations.patch(
      req,
      uuid.parse(id),
      organizationPatchSchema.parse(body),
    );
  }
}
@Module({
  imports: [TenantModule],
  controllers: [OrganizationController],
  providers: [OrganizationService],
})
export class OrganizationModule {}
