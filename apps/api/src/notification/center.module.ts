import { notificationScope } from "./scope.js";
import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { Database } from "../platform.js";
import type { ApiRequest } from "../auth/security.js";
import { notificationPreferences } from "../../../../packages/validation/src/intelligence.js";
import { recordAudit } from "../audit/audit.module.js";
import { RequestDoc } from "../docs.js";
@Controller("api/v1/notifications")
class NotificationCenterController {
  constructor(@Inject(Database) readonly db: Database) {}
  scope(r: ApiRequest) {
    return notificationScope(this.db, r);
  }
  @Get("unread-count") async unread(@Req() r: ApiRequest) {
    return {
      count: await this.db.notification.count({
        where: { ...(await this.scope(r)), readAt: null },
      }),
    };
  }
  @Post("read-all") async readAll(@Req() r: ApiRequest) {
    const scope = await this.scope(r);
    return this.db.$transaction(async (tx) => {
      const result = await tx.notification.updateMany({
        where: { ...scope, readAt: null },
        data: { readAt: new Date() },
      });
      await recordAudit(
        tx,
        r.auth,
        {
          action: "NOTIFICATION_READ",
          entityType: "Notification",
          newValues: { all: true, count: result.count },
        },
        r,
      );
      return result;
    });
  }
  @Get("preferences") preferences(@Req() r: ApiRequest) {
    const scope = { tenantId: r.auth.tenantId, userId: r.auth.userId };
    return this.db.notificationPreference.upsert({
      where: { tenantId_userId: scope },
      create: scope,
      update: {},
    });
  }
  @Patch("preferences") @RequestDoc(notificationPreferences) async save(
    @Req() r: ApiRequest,
    @Body() body: unknown,
  ) {
    const input = notificationPreferences.parse(body),
      scope = { tenantId: r.auth.tenantId, userId: r.auth.userId };
    return this.db.$transaction(async (tx) => {
      const before = await tx.notificationPreference.findUnique({
        where: { tenantId_userId: scope },
      });
      const after = await tx.notificationPreference.upsert({
        where: { tenantId_userId: scope },
        create: { ...scope, ...input },
        update: input,
      });
      await recordAudit(
        tx,
        r.auth,
        {
          action: "NOTIFICATION_PREFERENCE_UPDATED",
          entityType: "NotificationPreference",
          oldValues: before,
          newValues: after,
        },
        r,
      );
      return after;
    });
  }
}
@Module({ controllers: [NotificationCenterController] })
export class NotificationCenterModule {}
