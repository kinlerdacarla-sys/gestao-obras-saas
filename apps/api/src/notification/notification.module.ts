import { Injectable, Module } from "@nestjs/common";
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
@Module({ providers: [NotificationService], exports: [NotificationService] })
export class NotificationModule {}
