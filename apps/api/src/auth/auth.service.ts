import { Inject, Injectable } from "@nestjs/common";
import { Cache, Database, fail } from "../platform.js";
import {
  hashPassword,
  opaqueToken,
  signAccess,
  tokenHash,
  verifyPassword,
} from "./crypto.js";
import { configuration } from "../../../../packages/config/src/index.js";
import { recordAudit } from "../audit/audit.module.js";
import type { ApiRequest } from "./security.js";
import { NotificationService } from "../notification/notification.module.js";

@Injectable()
export class AuthService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Cache) private readonly cache: Cache,
    @Inject(NotificationService)
    private readonly notifications: NotificationService,
  ) {}
  async limit(req: ApiRequest, identity: string) {
    for (const key of [
      `auth:ip:${req.ip}`,
      `auth:identity:${tokenHash(identity)}`,
    ]) {
      const count = (await this.cache.eval(
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],900) end; return n",
        1,
        key,
      )) as number;
      if (count > 20) fail(429, "RATE_LIMITED", "Tente novamente mais tarde");
    }
  }
  async login(
    input: { email: string; password: string; tenantSlug: string },
    req: ApiRequest,
  ) {
    await this.limit(req, input.email + input.tenantSlug);
    const tenant = await this.db.tenant.findUnique({
      where: { slug: input.tenantSlug },
    });
    const user = await this.db.user.findUnique({
      where: { email: input.email },
    });
    const validPassword = user
      ? await verifyPassword(user.passwordHash, input.password)
      : (await hashPassword(input.password), false);
    const member =
      tenant && user
        ? await this.db.tenantUser.findFirst({
            where: { tenantId: tenant.id, userId: user.id, status: "ACTIVE" },
          })
        : null;
    if (
      !tenant ||
      tenant.status !== "ACTIVE" ||
      !user ||
      user.status !== "ACTIVE" ||
      !member ||
      !validPassword
    ) {
      // Unknown tenants cannot own audit rows; the rate limiter still records attempts.
      if (tenant)
        await recordAudit(
          this.db,
          { tenantId: tenant.id, userId: member ? user!.id : null },
          { action: "LOGIN_FAILED", entityType: "Session" },
          req,
        );
      fail(401, "UNAUTHORIZED", "Credenciais inválidas");
    }
    const refresh = opaqueToken();
    const session = await this.db.$transaction(async (tx) => {
      const session = await tx.userSession.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          refreshTokenHash: tokenHash(refresh),
          expiresAt: new Date(Date.now() + 7 * 86400000),
          ipAddress: req.ip,
          userAgent: req.get("user-agent")?.slice(0, 500),
        },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      await recordAudit(
        tx,
        { tenantId: tenant.id, userId: user.id },
        { action: "LOGIN", entityType: "Session", entityId: session.id },
        req,
      );
      return session;
    });
    return {
      refresh,
      access: await signAccess(
        configuration().JWT_SECRET,
        user.id,
        tenant.id,
        session.id,
      ),
    };
  }
  async refresh(raw: string) {
    if (!/^[a-f0-9]{64}$/.test(raw))
      fail(401, "UNAUTHORIZED", "Token inválido");
    const oldHash = tokenHash(raw);
    // Token hash is the sole credential lookup exception before authenticated tenant context exists.
    const session = await this.db.userSession.findUnique({
      where: { refreshTokenHash: oldHash },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date())
      fail(401, "UNAUTHORIZED", "Sessão inválida");
    const member = await this.db.tenantUser.findFirst({
      where: {
        tenantId: session.tenantId,
        userId: session.userId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
        tenant: { status: "ACTIVE" },
      },
    });
    if (!member) fail(401, "UNAUTHORIZED", "Sessão inválida");
    const refresh = opaqueToken();
    const changed = await this.db.userSession.updateMany({
      where: {
        id: session.id,
        tenantId: session.tenantId,
        refreshTokenHash: oldHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { refreshTokenHash: tokenHash(refresh) },
    });
    if (changed.count !== 1) fail(401, "UNAUTHORIZED", "Token já utilizado");
    return {
      refresh,
      access: await signAccess(
        configuration().JWT_SECRET,
        session.userId,
        session.tenantId,
        session.id,
      ),
    };
  }
  async logout(req: ApiRequest) {
    await this.db.$transaction(async (tx) => {
      await tx.userSession.updateMany({
        where: {
          id: req.auth.sessionId,
          tenantId: req.auth.tenantId,
          userId: req.auth.userId,
        },
        data: { revokedAt: new Date() },
      });
      await recordAudit(
        tx,
        req.auth,
        {
          action: "LOGOUT",
          entityType: "Session",
          entityId: req.auth.sessionId,
        },
        req,
      );
    });
    return { message: "Sessão terminada" };
  }
  async me(req: ApiRequest) {
    const member = await this.db.tenantUser.findFirstOrThrow({
      where: { tenantId: req.auth.tenantId, userId: req.auth.userId },
      select: {
        role: true,
        tenant: { select: { name: true, slug: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
    return member;
  }
  async forgot(input: { email: string; tenantSlug: string }, req: ApiRequest) {
    this.notifications.ensureAvailable();
    await this.limit(req, input.email + input.tenantSlug);
    const tenant = await this.db.tenant.findUnique({
      where: { slug: input.tenantSlug },
    });
    if (tenant?.status === "ACTIVE") {
      const member = await this.db.tenantUser.findFirst({
        where: {
          tenantId: tenant.id,
          status: { in: ["INVITED", "ACTIVE"] },
          user: { email: input.email, status: { in: ["ACTIVE", "INVITED"] } },
        },
        include: { user: true },
      });
      if (member) {
        const token = opaqueToken();
        await this.db.passwordReset.create({
          data: {
            tenantId: tenant.id,
            userId: member.userId,
            tokenHash: tokenHash(token),
            expiresAt: new Date(Date.now() + 30 * 60000),
          },
        });
        await this.notifications.deliverReset(member.user.email, token);
      }
    }
    return {
      message: "Se os dados forem válidos, receberá instruções de recuperação",
    };
  }
  async reset(input: { token: string; password: string }, req: ApiRequest) {
    await this.limit(req, "reset");
    const reset = await this.db.passwordReset.findUnique({
      where: { tokenHash: tokenHash(input.token) },
    });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date())
      fail(400, "VALIDATION_ERROR", "Token inválido ou expirado");
    const passwordHash = await hashPassword(input.password);
    await this.db.$transaction(async (tx) => {
      const claimed = await tx.passwordReset.updateMany({
        where: {
          id: reset.id,
          tenantId: reset.tenantId,
          usedAt: null,
          expiresAt: { gt: new Date() },
          tenant: { status: "ACTIVE" },
          user: { status: { in: ["ACTIVE", "INVITED"] } },
        },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) fail(400, "VALIDATION_ERROR", "Token inválido");
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash, status: "ACTIVE", emailVerifiedAt: new Date() },
      });
      await tx.tenantUser.updateMany({
        where: {
          tenantId: reset.tenantId,
          userId: reset.userId,
          status: "INVITED",
        },
        data: { status: "ACTIVE" },
      });
      await tx.passwordReset.updateMany({
        where: { tenantId: reset.tenantId, userId: reset.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      // Global password change revokes this user's sessions across memberships, deliberately.
      await tx.userSession.updateMany({
        where: { userId: reset.userId },
        data: { revokedAt: new Date() },
      });
      await recordAudit(
        tx,
        { tenantId: reset.tenantId, userId: reset.userId },
        {
          action: "PASSWORD_RESET",
          entityType: "User",
          entityId: reset.userId,
        },
        req,
      );
    });
    return { message: "Password atualizada" };
  }
}
