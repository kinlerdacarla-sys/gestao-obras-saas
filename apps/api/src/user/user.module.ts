import { encryptInvitation } from "../saas/invitations.js";
import { QuotaService } from "../saas/entitlements.js";
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
import { Database, fail, notFound } from "../platform.js";
import { TenantRoles, type ApiRequest } from "../auth/security.js";
import { TenantModule, TenantScope } from "../tenant/tenant.module.js";
import {
  inviteSchema,
  userPatchSchema,
  uuid,
} from "../../../../packages/validation/src/index.js";
import { hashPassword, opaqueToken, tokenHash } from "../auth/crypto.js";
import { recordAudit } from "../audit/audit.module.js";
import {
  NotificationModule,
  NotificationService,
} from "../notification/notification.module.js";
import { RequestDoc } from "../docs.js";
import type { z } from "zod";
const publicUser = { id: true, name: true, email: true, status: true } as const;
@Injectable()
export class UserService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(QuotaService) readonly quota: QuotaService,
    @Inject(TenantScope) private readonly scope: TenantScope,
    @Inject(NotificationService)
    private readonly notifications: NotificationService,
  ) {}
  list(req: ApiRequest) {
    return this.db.tenantUser.findMany({
      where: this.scope.where(req.auth),
      select: {
        id: true,
        role: true,
        status: true,
        user: { select: publicUser },
      },
      orderBy: { createdAt: "desc" },
    });
  }
  async get(req: ApiRequest, id: string) {
    const item = await this.db.tenantUser.findFirst({
      where: { ...this.scope.where(req.auth), userId: id },
      select: {
        id: true,
        role: true,
        status: true,
        user: { select: publicUser },
      },
    });
    return item ?? notFound();
  }
  async invite(req: ApiRequest, input: z.infer<typeof inviteSchema>) {
    this.notifications.ensureAvailable();
    if (await this.db.user.findUnique({ where: { email: input.email } }))
      fail(409, "EMAIL_ALREADY_EXISTS", "E-mail já registado");
    const passwordHash = await hashPassword(opaqueToken());
    const token = opaqueToken();
    const user = await this.db.$transaction(async (tx) => {
      await this.quota.assertCanConsume(tx, req.auth.tenantId, "USERS");
      const user = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash },
        select: publicUser,
      });
      await tx.tenantUser.create({
        data: {
          ...this.scope.where(req.auth),
          userId: user.id,
          role: input.role,
        },
      });
      const reset = await tx.passwordReset.create({
        data: {
          ...this.scope.where(req.auth),
          userId: user.id,
          tokenHash: tokenHash(token),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      await tx.invitationDelivery.create({
        data: {
          tenantId: req.auth.tenantId,
          userId: user.id,
          resetId: reset.id,
          ciphertext: encryptInvitation(token),
          expiresAt: reset.expiresAt,
        },
      });
      await recordAudit(
        tx,
        req.auth,
        {
          action: "USER_INVITED",
          entityType: "User",
          entityId: user.id,
          newValues: { name: user.name, email: user.email, role: input.role },
        },
        req,
      );
      return user;
    });

    return user;
  }
  async patch(
    req: ApiRequest,
    id: string,
    input: z.infer<typeof userPatchSchema>,
  ) {
    const before = await this.get(req, id);
    if (id === req.auth.userId && input.role && input.role !== "ADMIN")
      fail(
        403,
        "FORBIDDEN",
        "Não pode remover o seu próprio perfil de administrador",
      );
    return this.db.$transaction(async (tx) => {
      if (input.name)
        await tx.user.update({ where: { id }, data: { name: input.name } });
      const result = await tx.tenantUser.update({
        where: { tenantId_userId: { tenantId: req.auth.tenantId, userId: id } },
        data: { role: input.role },
        select: { role: true, status: true, user: { select: publicUser } },
      });
      await recordAudit(
        tx,
        req.auth,
        {
          action: "USER_UPDATED",
          entityType: "User",
          entityId: id,
          oldValues: before,
          newValues: result,
        },
        req,
      );
      return result;
    });
  }
  async disable(req: ApiRequest, id: string) {
    await this.get(req, id);
    if (id === req.auth.userId)
      fail(403, "FORBIDDEN", "Não pode desativar a própria conta");
    await this.db.$transaction(async (tx) => {
      await tx.tenantUser.updateMany({
        where: { tenantId: req.auth.tenantId, userId: id },
        data: { status: "DISABLED" },
      });
      await tx.userSession.updateMany({
        where: { tenantId: req.auth.tenantId, userId: id },
        data: { revokedAt: new Date() },
      });
      await tx.projectUser.updateMany({
        where: { tenantId: req.auth.tenantId, userId: id },
        data: { status: "DISABLED" },
      });
      await recordAudit(
        tx,
        req.auth,
        { action: "USER_DISABLED", entityType: "User", entityId: id },
        req,
      );
    });
    return { message: "Utilizador desativado neste tenant" };
  }
}
@TenantRoles("ADMIN")
@Controller("api/v1/users")
class UserController {
  constructor(@Inject(UserService) private readonly users: UserService) {}
  @Get() list(@Req() req: ApiRequest) {
    return this.users.list(req);
  }
  @Get(":id") get(@Req() req: ApiRequest, @Param("id") id: string) {
    return this.users.get(req, uuid.parse(id));
  }
  @Post("invite") @RequestDoc(inviteSchema) invite(
    @Req() req: ApiRequest,
    @Body() body: unknown,
  ) {
    return this.users.invite(req, inviteSchema.parse(body));
  }
  @Patch(":id") @RequestDoc(userPatchSchema) patch(
    @Req() req: ApiRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.users.patch(req, uuid.parse(id), userPatchSchema.parse(body));
  }
  @Post(":id/disable") disable(
    @Req() req: ApiRequest,
    @Param("id") id: string,
  ) {
    return this.users.disable(req, uuid.parse(id));
  }
}
@Module({
  imports: [TenantModule, NotificationModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
