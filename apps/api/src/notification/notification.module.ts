import nodemailer from "nodemailer";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
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
    if (
      configuration().NODE_ENV === "production" &&
      (!process.env.SMTP_URL ||
        process.env.MAIL_TRANSPORT !== "smtp" ||
        !process.env.MAIL_FROM)
    )
      fail(503, "DELIVERY_UNAVAILABLE", "Entrega de email não configurada");
  }
  async deliverReset(email: string, token: string) {
    this.ensureAvailable();
    const smtp = process.env.MAIL_TRANSPORT === "smtp";
    if (smtp && !process.env.SMTP_URL)
      fail(503, "DELIVERY_UNAVAILABLE", "SMTP não configurado");
    const transport = smtp
      ? nodemailer.createTransport(process.env.SMTP_URL!)
      : nodemailer.createTransport({
          streamTransport: true,
          buffer: true,
          newline: "unix",
        });
    const message = await transport.sendMail({
      from: process.env.MAIL_FROM ?? "obras@example.test",
      to: email,
      subject: "Definir acesso à plataforma Obras",
      text: `Defina a sua password através deste link temporário: ${configuration().WEB_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`,
    });
    if (!smtp) {
      const folder = path.resolve(
        process.env.MAIL_OUTBOX_PATH ?? "work/mail-outbox",
      );
      await mkdir(folder, { recursive: true, mode: 0o700 });
      await writeFile(
        path.join(folder, `invitation-${randomUUID()}.eml`),
        message.message,
        { mode: 0o600 },
      );
    }
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
