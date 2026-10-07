import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { ProjectService } from "./project.service.js";
import { TenantModule } from "../tenant/tenant.module.js";
import {
  ProjectRoles,
  TenantRoles,
  type ApiRequest,
} from "../auth/security.js";
import {
  projectSchema,
  projectPatchSchema,
  projectUserSchema,
  projectUserPatchSchema,
  projectOrganizationSchema,
  uuid,
} from "../../../../packages/validation/src/index.js";
import { RequestDoc } from "../docs.js";
@Controller("api/v1/projects")
class ProjectController {
  constructor(
    @Inject(ProjectService) private readonly projects: ProjectService,
  ) {}
  @Get() list(@Req() req: ApiRequest) {
    return this.projects.list(req);
  }
  @Get(":id") get(@Req() req: ApiRequest, @Param("id") id: string) {
    return this.projects.get(req, uuid.parse(id));
  }
  @Post() @TenantRoles("ADMIN") @RequestDoc(projectSchema) create(
    @Req() req: ApiRequest,
    @Body() body: unknown,
  ) {
    return this.projects.create(req, projectSchema.parse(body));
  }
  @Patch(":id") @ProjectRoles("MANAGER") @RequestDoc(projectPatchSchema) patch(
    @Req() req: ApiRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.projects.patch(
      req,
      uuid.parse(id),
      projectPatchSchema.parse(body),
    );
  }
  @Get(":id/users") users(@Req() req: ApiRequest, @Param("id") id: string) {
    return this.projects.users(req, uuid.parse(id));
  }
  @Post(":id/users")
  @TenantRoles("ADMIN")
  @RequestDoc(projectUserSchema)
  addUser(
    @Req() req: ApiRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.projects.addUser(
      req,
      uuid.parse(id),
      projectUserSchema.parse(body),
    );
  }
  @Patch(":projectId/users/:userId")
  @TenantRoles("ADMIN")
  @RequestDoc(projectUserPatchSchema)
  patchUser(
    @Req() req: ApiRequest,
    @Param("projectId") id: string,
    @Param("userId") userId: string,
    @Body() body: unknown,
  ) {
    return this.projects.patchUser(
      req,
      uuid.parse(id),
      uuid.parse(userId),
      projectUserPatchSchema.parse(body),
    );
  }
  @Delete(":projectId/users/:userId") @TenantRoles("ADMIN") removeUser(
    @Req() req: ApiRequest,
    @Param("projectId") id: string,
    @Param("userId") userId: string,
  ) {
    return this.projects.removeUser(req, uuid.parse(id), uuid.parse(userId));
  }
  @Get(":id/organizations") organizations(
    @Req() req: ApiRequest,
    @Param("id") id: string,
  ) {
    return this.projects.organizations(req, uuid.parse(id));
  }
  @Post(":id/organizations")
  @TenantRoles("ADMIN")
  @RequestDoc(projectOrganizationSchema)
  addOrganization(
    @Req() req: ApiRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.projects.addOrganization(
      req,
      uuid.parse(id),
      projectOrganizationSchema.parse(body),
    );
  }
  @Delete(":projectId/organizations/:organizationId")
  @TenantRoles("ADMIN")
  removeOrganization(
    @Req() req: ApiRequest,
    @Param("projectId") id: string,
    @Param("organizationId") organizationId: string,
  ) {
    return this.projects.removeOrganization(
      req,
      uuid.parse(id),
      uuid.parse(organizationId),
    );
  }
}
@Controller("api/v1/dashboard")
class DashboardController {
  constructor(
    @Inject(ProjectService) private readonly projects: ProjectService,
  ) {}
  @Get() dashboard(@Req() req: ApiRequest) {
    return this.projects.dashboard(req);
  }
}
@Module({
  imports: [TenantModule],
  controllers: [ProjectController, DashboardController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
