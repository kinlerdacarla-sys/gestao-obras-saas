import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { Public } from "../auth/security.js";
import { Database, fail } from "../platform.js";
import { configuration } from "../../../../packages/config/src/index.js";
import {
  PlatformAuthService,
  PlatformGuard,
  PlatformRoute,
  type PlatformRequest,
} from "./platform-auth.js";
import { maintenanceActive } from "../../../../packages/domain/src/maintenance.js";
@Public()
@Controller("api/v1/service-info")
export class ServiceInfo {
  constructor(@Inject(Database) readonly db: Database) {}
  @Get() async get() {
    const row = await this.db.platformControl.findUnique({
      where: { key: "maintenance" },
    });
    return {
      maintenance: maintenanceActive(row?.value),
      supportEmail: configuration().SUPPORT_EMAIL ?? null,
    };
  }
}
@PlatformRoute()
@UseGuards(PlatformGuard)
@Controller("api/v1/platform/maintenance")
export class MaintenanceController {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(PlatformAuthService) readonly auth: PlatformAuthService,
  ) {}
  @Get() async get(@Req() r: PlatformRequest) {
    this.auth.superAdmin(r);
    return (
      (await this.db.platformControl.findUnique({
        where: { key: "maintenance" },
      })) ?? { version: 0, value: { enabled: false } }
    );
  }
  @Post() async set(@Req() r: PlatformRequest, @Body() raw: unknown) {
    this.auth.superAdmin(r, true);
    const input = z
      .object({
        enabled: z.boolean(),
        version: z.number().int().nonnegative(),
        minutes: z.number().int().min(1).max(240),
        reason: z.string().trim().min(10).max(300),
      })
      .parse(raw);
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(8062027)`;
      const old = await tx.platformControl.findUnique({
        where: { key: "maintenance" },
      });
      if ((old?.version ?? 0) !== input.version)
        fail(409, "VERSION_CONFLICT", "Estado alterado");
      const value = {
        enabled: input.enabled,
        until: new Date(Date.now() + input.minutes * 60000).toISOString(),
      };
      const result = await tx.platformControl.upsert({
        where: { key: "maintenance" },
        create: { key: "maintenance", value, version: 1 },
        update: { value, version: { increment: 1 } },
      });
      await tx.platformAuditLog.create({
        data: {
          platformUserId: r.platform.id,
          entityType: "PlatformControl",
          action: input.enabled ? "MAINTENANCE_STARTED" : "MAINTENANCE_ENDED",
          newValues: { ...value, reason: input.reason },
        },
      });
      return result;
    });
  }
}
