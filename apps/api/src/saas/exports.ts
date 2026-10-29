import {
  Injectable,
  Inject,
  OnModuleDestroy,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { Queue } from "bullmq";
import type { Response } from "express";
import { z } from "zod";
import { Database, fail } from "../platform.js";
import { TenantRoles, type ApiRequest } from "../auth/security.js";
import { recordAudit } from "../audit/audit.module.js";
import { redisConnection } from "../../../../packages/config/src/redis.js";
import { configuration } from "../../../../packages/config/src/index.js";
import { exportTables } from "./export-tables.js";
const serial = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
const signature = (id: string, userId: string, expires: number) =>
  createHmac("sha256", configuration().JWT_SECRET)
    .update(`tenant-export:${id}:${userId}:${expires}`)
    .digest("hex");
@Injectable()
export class DataExportService implements OnModuleDestroy {
  readonly queue = new Queue("tenant-data-export", {
    connection: redisConnection(),
  });
  constructor(@Inject(Database) readonly db: Database) {}
  async onModuleDestroy() {
    await this.queue.close();
  }
  file(id: string) {
    return path.join(
      path.resolve(
        process.env.DOCUMENT_STORAGE_PATH ?? "work/document-storage",
      ),
      "tenant-exports",
      `${z.uuid().parse(id)}.json.gz`,
    );
  }
  async allowed(tenantId: string, userId: string) {
    if (
      !(await this.db.tenantUser.findFirst({
        where: {
          tenantId,
          userId,
          role: "ADMIN",
          status: "ACTIVE",
          user: { status: "ACTIVE" },
        },
      }))
    )
      fail(403, "ACCESS_DENIED", "Exportação restrita ao administrador");
    const settings = await this.db.tenantSetting.findUnique({
      where: { tenantId },
    });
    if (settings?.exportAllowed === false)
      fail(403, "EXPORT_DISABLED", "Exportação desativada pelo operador");
  }
  dto(row: {
    id: string;
    status: string;
    createdAt: Date;
    expiresAt: Date;
    completedAt: Date | null;
    errorCode: string | null;
  }) {
    return {
      id: row.id,
      status: row.expiresAt < new Date() ? "EXPIRED" : row.status,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      expiresAt: row.expiresAt,
      errorCode: row.errorCode,
    };
  }
  async request(r: ApiRequest) {
    await this.allowed(r.auth.tenantId, r.auth.userId);
    const job = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tenants WHERE id=${r.auth.tenantId}::uuid FOR UPDATE`;
      if (
        (await tx.dataExportJob.count({
          where: {
            tenantId: r.auth.tenantId,
            createdAt: { gt: new Date(Date.now() - 86400000) },
            status: { not: "FAILED" },
          },
        })) >= 3
      )
        fail(429, "EXPORT_RATE_LIMITED", "Máximo de três exportações por dia");
      const row = await tx.dataExportJob.create({
        data: {
          tenantId: r.auth.tenantId,
          requestedBy: r.auth.userId,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      await recordAudit(
        tx,
        r.auth,
        {
          action: "TENANT_DATA_EXPORT_REQUESTED",
          entityType: "DataExportJob",
          entityId: row.id,
        },
        r,
      );
      return row;
    });
    try {
      await this.queue.add(
        "export",
        { id: job.id },
        {
          jobId: job.id,
          attempts: 3,
          backoff: { type: "exponential", delay: 3000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
    } catch {
      await this.db.dataExportJob.update({
        where: { id: job.id },
        data: { status: "FAILED", errorCode: "QUEUE_UNAVAILABLE" },
      });
      fail(503, "QUEUE_UNAVAILABLE", "Exportação indisponível");
    }
    return this.dto(job);
  }
  async get(r: ApiRequest, id: string) {
    await this.allowed(r.auth.tenantId, r.auth.userId);
    return (
      (await this.db.dataExportJob.findFirst({
        where: { id, tenantId: r.auth.tenantId, requestedBy: r.auth.userId },
      })) ?? fail(404, "RESOURCE_NOT_FOUND", "Exportação não encontrada")
    );
  }
  async process(id: string) {
    const job = await this.db.dataExportJob.findUniqueOrThrow({
      where: { id },
    });
    if (job.status === "COMPLETED" || job.expiresAt <= new Date()) return;
    const claimed = await this.db.dataExportJob.updateMany({
      where: {
        id,
        OR: [
          { status: { in: ["QUEUED", "FAILED"] } },
          {
            status: "PROCESSING",
            startedAt: { lt: new Date(Date.now() - 10 * 60000) },
          },
        ],
      },
      data: { status: "PROCESSING", startedAt: new Date(), errorCode: null },
    });
    if (!claimed.count) return;
    try {
      await this.allowed(job.tenantId, job.requestedBy);
      const data = await this.db.$transaction(
        async (tx) => {
          const result: Record<string, unknown> = {
            format: "obras-tenant-export-v1",
            exportedAt: new Date().toISOString(),
          };
          result.tenant = await tx.tenant.findUniqueOrThrow({
            where: { id: job.tenantId },
          });
          result.users = await tx.user.findMany({
            where: { memberships: { some: { tenantId: job.tenantId } } },
            select: {
              id: true,
              name: true,
              email: true,
              status: true,
              createdAt: true,
            },
          });
          let totalSize = 0;
          for (const table of exportTables) {
            const columns = await tx.$queryRaw<
              { column_name: string; data_type: string }[]
            >`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=${table} ORDER BY ordinal_position`;
            const safe = columns.filter(
              (c) =>
                !/password|token|secret|ciphertext|object_key|external_customer|external_subscription/i.test(
                  c.column_name,
                ) &&
                !(
                  table === "audit_logs" &&
                  [
                    "old_values",
                    "new_values",
                    "ip_address",
                    "user_agent",
                  ].includes(c.column_name)
                ),
            );
            const fields = safe
              .map(
                (c) =>
                  `'${c.column_name}', "${c.column_name}"${["numeric", "bigint"].includes(c.data_type) ? "::text" : ""}`,
              )
              .join(",");
            // Identifiers originate exclusively from the compiled allowlist and database metadata.
            const rows = await tx.$queryRawUnsafe<{ row: unknown }[]>(
              `SELECT jsonb_build_object(${fields}) AS row FROM "${table}" WHERE tenant_id=$1::uuid LIMIT 100001`,
              job.tenantId,
            );
            if (rows.length > 100000) throw Error("EXPORT_TOO_LARGE");
            const values = rows.map((x) => x.row);
            totalSize += Buffer.byteLength(serial(values));
            if (totalSize > 256 * 1024 * 1024) throw Error("EXPORT_TOO_LARGE");
            result[table] = values;
          }
          return result;
        },
        { isolationLevel: "RepeatableRead", timeout: 120000 },
      );
      if(job.expiresAt <= new Date()) throw Error("EXPORT_EXPIRED");
      const bytes = gzipSync(Buffer.from(serial(data)));
      await this.allowed(job.tenantId, job.requestedBy);
      await mkdir(path.dirname(this.file(id)), {
        recursive: true,
        mode: 0o700,
      });
      await writeFile(this.file(id), bytes, { mode: 0o600 });
      await this.db.$transaction(async (tx) => {
        await tx.dataExportJob.update({
          where: { id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            objectKey: `tenant-exports/${id}.json.gz`,
            sizeBytes: BigInt(bytes.length),
          },
        });
        await recordAudit(
          tx,
          { tenantId: job.tenantId, userId: job.requestedBy },
          {
            action: "TENANT_DATA_EXPORT_COMPLETED",
            entityType: "DataExportJob",
            entityId: id,
          },
        );
      });
    } catch (error) {
      await unlink(this.file(id)).catch(() => {});
      await this.db.dataExportJob.update({
        where: { id },
        data: {
          status: "FAILED",
          errorCode:
            error instanceof Error && error.message === "EXPORT_TOO_LARGE"
              ? "EXPORT_TOO_LARGE"
              : "EXPORT_FAILED",
        },
      });
      throw Error("EXPORT_FAILED");
    }
  }
}
@ApiTags("Tenant data export")
@TenantRoles("ADMIN")
@Controller("api/v1/data-exports")
export class DataExportController {
  constructor(@Inject(DataExportService) readonly exports: DataExportService) {}
  @Post() request(@Req() r: ApiRequest) {
    return this.exports.request(r);
  }
  @Get() async list(@Req() r: ApiRequest) {
    await this.exports.allowed(r.auth.tenantId, r.auth.userId);
    return (
      await this.exports.db.dataExportJob.findMany({
        where: { tenantId: r.auth.tenantId, requestedBy: r.auth.userId },
        orderBy: { createdAt: "desc" },
        take: 30,
      })
    ).map((x) => this.exports.dto(x));
  }
  @Get(":id") async get(@Req() r: ApiRequest, @Param("id") id: string) {
    const row = await this.exports.get(r, z.uuid().parse(id));
    const expires = Math.floor(Date.now() / 1000) + 60;
    return {
      ...this.exports.dto(row),
      downloadUrl:
        row.status === "COMPLETED" && row.expiresAt > new Date()
          ? `/api/v1/data-exports/${row.id}/download?expires=${expires}&signature=${signature(row.id, r.auth.userId, expires)}`
          : null,
    };
  }
  @Get(":id/download") async download(
    @Req() r: ApiRequest,
    @Param("id") raw: string,
    @Query() query: unknown,
    @Res() res: Response,
  ) {
    const id = z.uuid().parse(raw),
      input = z
        .object({
          expires: z.coerce.number().int(),
          signature: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .parse(query);
    const now = Math.floor(Date.now() / 1000);
    if (
      input.expires < now ||
      input.expires > now + 60 ||
      !timingSafeEqual(
        Buffer.from(input.signature, "hex"),
        Buffer.from(signature(id, r.auth.userId, input.expires), "hex"),
      )
    )
      fail(403, "INVALID_SIGNATURE", "Ligação expirada ou inválida");
    const job = await this.exports.get(r, id);
    if (job.status !== "COMPLETED" || job.expiresAt <= new Date())
      fail(410, "EXPORT_EXPIRED", "Exportação indisponível");
    const bytes = await readFile(this.exports.file(id));
    await recordAudit(
      this.exports.db,
      r.auth,
      {
        action: "TENANT_DATA_EXPORT_DOWNLOADED",
        entityType: "DataExportJob",
        entityId: id,
      },
      r,
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="tenant-export-${id}.json.gz"`,
    );
    res.send(bytes);
  }
}
