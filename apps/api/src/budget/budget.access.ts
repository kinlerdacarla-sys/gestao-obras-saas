import { Inject, Injectable } from "@nestjs/common";
import { Database, fail } from "../platform.js";
import { ProjectService } from "../project/project.service.js";
import type { ApiRequest } from "../auth/security.js";
import { canEditProject } from "../../../../packages/domain/src/index.js";
@Injectable()
export class BudgetAccess {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(ProjectService) private readonly projects: ProjectService,
  ) {}
  async check(req: ApiRequest, projectId: string, write = false) {
    await this.projects.get(req, projectId);
    const member =
      req.auth.role === "ADMIN"
        ? null
        : await this.db.projectUser.findFirst({
            where: {
              tenantId: req.auth.tenantId,
              projectId,
              userId: req.auth.userId,
              status: "ACTIVE",
            },
          });
    const editor = canEditProject(req.auth.role, member?.role);
    if (write && !editor)
      fail(403, "PROJECT_ACCESS_DENIED", "Sem permissão para editar orçamento");
    return { tenantId: req.auth.tenantId, projectId, editor };
  }
  admin(req: ApiRequest) {
    if (req.auth.role !== "ADMIN")
      fail(403, "FORBIDDEN", "Apenas ADMIN pode aprovar ou rejeitar");
  }
}
