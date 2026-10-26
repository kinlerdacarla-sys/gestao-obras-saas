import {
  Injectable,
  Inject,
  CanActivate,
  ExecutionContext,
  SetMetadata,
} from "@nestjs/common";
import type { Request } from "express";
import { Database, Cache, fail } from "../platform.js";
import {
  opaqueToken,
  tokenHash,
  verifyPassword,
  hashPassword,
} from "../auth/crypto.js";
export const PlatformRoute = () => SetMetadata("platformRoute", true);
export interface PlatformRequest extends Request {
  cookies: Record<string, string>;
  platform: {
    id: string;
    userId: string;
    role: "SUPER_ADMIN" | "SUPPORT";
    sessionId: string;
    authenticatedAt: Date;
  };
}
@Injectable()
export class PlatformAuthService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(Cache) readonly cache: Cache,
  ) {}
  async login(email: string, password: string, r: Request) {
    for (const key of [
      `platform:login:ip:${r.ip}`,
      `platform:login:identity:${tokenHash(email)}`,
    ]) {
      const count = (await this.cache.eval(
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],900) end; return n",
        1,
        key,
      )) as number;
      if (count > 10) fail(429, "RATE_LIMITED", "Tente novamente mais tarde");
    }
    const user = await this.db.user.findUnique({ where: { email } });
    const valid = user
      ? await verifyPassword(user.passwordHash, password)
      : (await hashPassword(password), false);
    const platform =
      user &&
      (await this.db.platformUser.findUnique({ where: { userId: user.id } }));
    if (!valid || user?.status !== "ACTIVE" || platform?.status !== "ACTIVE")
      fail(401, "UNAUTHORIZED", "Credenciais inválidas");
    const raw = opaqueToken();
    await this.db.$transaction(async (tx) => {
      const session = await tx.platformSession.create({
        data: {
          platformUserId: platform.id,
          tokenHash: tokenHash(raw),
          expiresAt: new Date(Date.now() + 30 * 60000),
        },
      });
      await tx.platformAuditLog.create({
        data: {
          platformUserId: platform.id,
          action: "PLATFORM_LOGIN",
          entityType: "PlatformSession",
          entityId: session.id,
          ipAddress: r.ip,
        },
      });
    });
    return raw;
  }
  async authenticate(r: PlatformRequest) {
    const raw = r.cookies.platform_access;
    if (!raw || !/^[a-f0-9]{64}$/.test(raw))
      fail(
        401,
        "PLATFORM_SESSION_REQUIRED",
        "Autenticação de plataforma necessária",
      );
    const session = await this.db.platformSession.findUnique({
      where: { tokenHash: tokenHash(raw) },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date())
      fail(401, "PLATFORM_SESSION_REQUIRED", "Sessão de plataforma expirada");
    const platform = await this.db.platformUser.findUnique({
      where: { id: session.platformUserId },
    });
    const user =
      platform &&
      (await this.db.user.findUnique({ where: { id: platform.userId } }));
    if (!platform || platform.status !== "ACTIVE" || user?.status !== "ACTIVE")
      fail(401, "PLATFORM_SESSION_REQUIRED", "Sessão revogada");
    r.platform = {
      id: platform.id,
      userId: platform.userId,
      role: platform.role,
      sessionId: session.id,
      authenticatedAt: session.authenticatedAt,
    };
  }
  superAdmin(r: PlatformRequest, critical = false) {
    if (r.platform.role !== "SUPER_ADMIN")
      fail(403, "PLATFORM_FORBIDDEN", "Apenas Super Admin da plataforma");
    if (
      critical &&
      Date.now() - r.platform.authenticatedAt.getTime() > 10 * 60000
    )
      fail(
        403,
        "REAUTHENTICATION_REQUIRED",
        "Volte a autenticar-se para esta ação",
      );
  }
}
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(
    @Inject(PlatformAuthService) readonly auth: PlatformAuthService,
  ) {}
  async canActivate(context: ExecutionContext) {
    await this.auth.authenticate(
      context.switchToHttp().getRequest<PlatformRequest>(),
    );
    return true;
  }
}
