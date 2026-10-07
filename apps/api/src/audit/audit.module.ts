import {
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  Req,
} from "@nestjs/common";
import { Database } from "../platform.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { ApiRequest } from "../auth/security.js";
import { TenantRoles } from "../auth/security.js";

export interface AuditEvent {
  action: string;
  entityType: string;
  entityId?: string;
  projectId?: string;
  oldValues?: unknown;
  newValues?: unknown;
}
export function recordAudit(
  tx: Prisma.TransactionClient,
  ctx: { tenantId: string; userId: string | null },
  event: AuditEvent,
  req?: ApiRequest,
) {
  const json = (value: unknown): Prisma.InputJsonValue | undefined =>
    value === undefined
      ? undefined
      : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
  return tx.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      ...event,
      oldValues: json(event.oldValues),
      newValues: json(event.newValues),
      ipAddress: req?.ip,
      userAgent: req?.get("user-agent")?.slice(0, 500),
    },
  });
}
@Injectable()
export class AuditService {
  constructor(@Inject(Database) private readonly db: Database) {}
  list(tenantId: string) {
    return this.db.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
@Controller("api/v1/audit-logs")
@TenantRoles("ADMIN")
class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}
  @Get() list(@Req() req: ApiRequest) {
    return this.audit.list(req.auth.tenantId);
  }
}
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
