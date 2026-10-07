import { Injectable, Module } from "@nestjs/common";
import type { AuthContext } from "../../../../packages/types/src/index.js";
import { fail } from "../platform.js";
@Injectable()
export class TenantScope {
  where(ctx: AuthContext) {
    if (!ctx.tenantId) fail(403, "TENANT_ACCESS_DENIED", "Tenant inválido");
    return { tenantId: ctx.tenantId };
  }
  resource(ctx: AuthContext, id: string) {
    return { ...this.where(ctx), id };
  }
}
@Module({ providers: [TenantScope], exports: [TenantScope] })
export class TenantModule {}
