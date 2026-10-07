import { Inject, Injectable } from "@nestjs/common";
import { Database, fail } from "../platform.js";
import { ProjectService } from "../project/project.service.js";
import type { ApiRequest } from "../auth/security.js";
import { canEditProject } from "../../../../packages/domain/src/index.js";
export type Scope = { tenantId: string; projectId: string };
@Injectable()
export class ExecutionAccess {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(ProjectService) readonly projects: ProjectService,
  ) {}
  async check(req: ApiRequest, projectId: string, write = false) {
    await this.projects.get(req, projectId);
    const member = await this.db.projectUser.findFirst({
      where: {
        tenantId: req.auth.tenantId,
        projectId,
        userId: req.auth.userId,
        status: "ACTIVE",
      },
    });
    const role = req.auth.role === "ADMIN" ? "ADMIN" : member!.role;
    const editor = canEditProject(req.auth.role, member?.role);
    if (write && !editor)
      fail(403, "ACCESS_DENIED", "Sem permissão para editar esta obra");
    return { scope: { tenantId: req.auth.tenantId, projectId }, role, editor };
  }
  admin(req: ApiRequest) {
    if (req.auth.role !== "ADMIN")
      fail(403, "ACCESS_DENIED", "Apenas ADMIN pode executar esta ação");
  }
}
