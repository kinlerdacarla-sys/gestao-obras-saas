import { notificationScope } from "./scope.js";
import { recordAudit } from "../audit/audit.module.js";
import { Database } from "../platform.js";
import type { ApiRequest } from "../auth/security.js";
import { uuid } from "../../../../packages/validation/src/index.js";
import {
  Injectable,
  Module,
  Controller,
  Get,
  Post,
  Param,
  Req,
  Inject,
} from "@nestjs/common";
import { configuration } from "../../../../packages/config/src/index.js";
import { fail } from "../platform.js";
@Injectable()
export class NotificationService {
  ensureAvailable() {
    if (configuration().NODE_ENV === "production")
      fail(
        503,
        "DELIVERY_UNAVAILABLE",
        "Configure um fornecedor de e-mail antes de ativar convites e recuperação em produção",
      );
  }
  async deliverReset(email: string, token: string) {
    this.ensureAvailable();
    // Development-only delivery adapter. Never log reset credentials in production.
    console.info(
      `[DEV MAIL] ${email}: ${configuration().WEB_ORIGIN}/reset-password?token=${token}`,
    );
  }
}
@Controller("api/v1/notifications")
class NotificationController {
  constructor(@Inject(Database) readonly db: Database) {}
  scope(r: ApiRequest) {
    return notificationScope(this.db, r);
  }
  @Get() async list(@Req() r: ApiRequest) {
    return {
      items: await this.db.notification.findMany({
        where: await this.scope(r),
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    };
  }
  @Post(":id/read") async read(@Req() r: ApiRequest, @Param("id") id: string) {
    const row = await this.db.notification.updateMany({
      where: {
        ...(await this.scope(r)),
        id: uuid.parse(id),
      },
      data: { readAt: new Date() },
    });
    if (!row.count)
      fail(404, "RESOURCE_NOT_FOUND", "Notificação não encontrada");
    await recordAudit(
      this.db,
      r.auth,
      { action: "NOTIFICATION_READ", entityType: "Notification", entityId: id },
      r,
    );
    return { ok: true };
  }
}
@Module({
  providers: [NotificationService],
  controllers: [NotificationController],
  exports: [NotificationService],
})
export class NotificationModule {}
