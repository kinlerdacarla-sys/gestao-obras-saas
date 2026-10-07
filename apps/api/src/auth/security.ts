import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { Database, fail } from "../platform.js";
import { verifyAccess } from "./crypto.js";
import { configuration } from "../../../../packages/config/src/index.js";
import type { AuthContext } from "../../../../packages/types/src/index.js";
import type { Role } from "../../../../packages/domain/src/index.js";
import { uuid } from "../../../../packages/validation/src/index.js";
export interface ApiRequest extends Request {
  auth: AuthContext;
  cookies: Record<string, string>;
}
export const Public = () => SetMetadata("public", true);
export const TenantRoles = (...roles: Role[]) =>
  SetMetadata("tenantRoles", roles);
export const ProjectRoles = (...roles: Role[]) =>
  SetMetadata("projectRoles", roles);
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<ApiRequest>();
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("origin") !== configuration().WEB_ORIGIN
    )
      fail(403, "FORBIDDEN", "Origem inválida");
    if (
      this.reflector.getAllAndOverride<boolean>("public", [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    let claims;
    try {
      claims = await verifyAccess(
        configuration().JWT_SECRET,
        req.cookies.access ?? "",
      );
    } catch {
      return fail(401, "UNAUTHORIZED", "Sessão inválida");
    }
    if (
      typeof claims.sub !== "string" ||
      typeof claims.tenantId !== "string" ||
      typeof claims.sessionId !== "string"
    )
      return fail(401, "UNAUTHORIZED", "Sessão inválida");
    const session = await this.db.userSession.findFirst({
      where: {
        id: claims.sessionId,
        tenantId: claims.tenantId,
        userId: claims.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: "ACTIVE" },
        tenant: { status: "ACTIVE" },
      },
    });
    const member = await this.db.tenantUser.findFirst({
      where: {
        tenantId: claims.tenantId,
        userId: claims.sub,
        status: "ACTIVE",
      },
    });
    if (!session || !member)
      return fail(401, "UNAUTHORIZED", "Sessão revogada");
    req.auth = {
      userId: claims.sub,
      tenantId: claims.tenantId,
      sessionId: claims.sessionId,
      role: member.role,
    };
    const roles = this.reflector.getAllAndOverride<Role[]>("tenantRoles", [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && !roles.includes(member.role))
      fail(403, "FORBIDDEN", "Sem permissão");
    const projectRoles = this.reflector.getAllAndOverride<Role[]>(
      "projectRoles",
      [context.getHandler(), context.getClass()],
    );
    if (projectRoles && member.role !== "ADMIN") {
      const projectId = uuid.parse(
        String(req.params.projectId ?? req.params.id),
      );
      const assignment = await this.db.projectUser.findFirst({
        where: {
          tenantId: member.tenantId,
          projectId,
          userId: member.userId,
          status: "ACTIVE",
        },
      });
      if (!assignment || !projectRoles.includes(assignment.role))
        fail(403, "PROJECT_ACCESS_DENIED", "Sem permissão nesta obra");
    }
    return true;
  }
}
