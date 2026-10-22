import { HttpException } from "@nestjs/common";
import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import { Database, fail } from "../platform.js";
import { AnalyticsAccess } from "../analytics/kpis.js";
import { ReportDataService } from "./data.js";
import { renderReport } from "./render.js";
import { recordAudit } from "../audit/audit.module.js";
import type { ApiRequest } from "../auth/security.js";
import type { ReportJob } from "../generated/prisma/client.js";
import type { reportRequest } from "../../../../packages/validation/src/reports.js";
import { mayRequestReport } from "../../../../packages/domain/src/reports.js";
import { redisConnection } from "../../../../packages/config/src/redis.js";
import { configuration } from "../../../../packages/config/src/index.js";
@Injectable()
export class ReportService implements OnModuleDestroy {
  readonly queue = new Queue("report-generation", {
    connection: redisConnection(),
  });
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(AnalyticsAccess) readonly access: AnalyticsAccess,
    @Inject(ReportDataService) readonly data: ReportDataService,
  ) {}
  async onModuleDestroy() {
    await this.queue.close();
  }
  async authorize(r: ApiRequest, p: string | null | undefined, type: string) {
    const role = p
      ? (await this.access.execution.check(r, p)).role
      : r.auth.role;
    if (
      !mayRequestReport(role, type) ||
      (type === "PORTFOLIO" && r.auth.role !== "ADMIN")
    )
      fail(403, "ACCESS_DENIED", "Relatório não permitido para este perfil");
    return role;
  }
  dto(job: ReportJob) {
    return {
      id: job.id,
      projectId: job.projectId,
      reportType: job.reportType,
      format: job.format,
      status: job.status,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      expiresAt: job.expiresAt,
    };
  }
  async request(r: ApiRequest, input: z.infer<typeof reportRequest>) {
    const role = await this.authorize(r, input.projectId, input.reportType);
    const job = await this.db.$transaction(async (tx) => {
      const row = await tx.reportJob.create({
        data: {
          tenantId: r.auth.tenantId,
          projectId: input.projectId,
          reportType: input.reportType,
          format: input.format,
          parameters: { ...input.parameters, role },
          requestedBy: r.auth.userId,
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      });
      await recordAudit(
        tx,
        r.auth,
        {
          action: "REPORT_REQUESTED",
          entityType: "ReportJob",
          entityId: row.id,
          projectId: input.projectId,
          newValues: this.dto(row),
        },
        r,
      );
      return row;
    });
    try {
      await this.queue.add(
        "generate",
        { id: job.id },
        {
          jobId: job.id,
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
    } catch {
      await this.failed(job, "REPORT_QUEUE_UNAVAILABLE");
      fail(503, "REPORT_QUEUE_UNAVAILABLE", "Fila de relatórios indisponível");
    }
    return this.dto(job);
  }
  async failed(job: ReportJob, code: string) {
    await this.db.$transaction(async (tx) => {
      await tx.reportJob.update({
        where: { id: job.id },
        data: { status: "FAILED", errorMessage: code },
      });
      await recordAudit(
        tx,
        { tenantId: job.tenantId, userId: job.requestedBy },
        {
          action: "REPORT_FAILED",
          entityType: "ReportJob",
          entityId: job.id,
          projectId: job.projectId ?? undefined,
          newValues: { code },
        },
      );
    });
  }
  async requester(job: ReportJob) {
    const member = await this.db.tenantUser.findFirst({
      where: {
        tenantId: job.tenantId,
        userId: job.requestedBy,
        status: "ACTIVE",
        tenant: { status: "ACTIVE" },
        user: { status: "ACTIVE" },
      },
    });
    if (!member) fail(403, "ACCESS_DENIED", "Acesso revogado");
    return {
      auth: {
        tenantId: job.tenantId,
        userId: job.requestedBy,
        role: member.role,
        sessionId: "worker",
      },
      get: () => undefined,
    } as unknown as ApiRequest;
  }
  file(key: string) {
    const base = path.resolve(
        process.env.DOCUMENT_STORAGE_PATH ?? "work/document-storage",
      ),
      file = path.resolve(base, key);
    if (!file.startsWith(base + path.sep))
      fail(400, "INVALID_OBJECT_KEY", "Chave inválida");
    return file;
  }
  async process(id: string) {
    const job = await this.db.reportJob.findUniqueOrThrow({ where: { id } });
    if (job.status === "COMPLETED" || job.status === "EXPIRED") return;
    try {
      if (job.expiresAt.getTime() < Date.now()) {
        await this.db.reportJob.update({
          where: { id },
          data: { status: "EXPIRED" },
        });
        return;
      }
      const r = await this.requester(job),
        role = await this.authorize(r, job.projectId, job.reportType),
        parameters = job.parameters as {
          role: string;
          date_from?: string;
          date_to?: string;
        };
      if (role !== parameters.role)
        fail(403, "ACCESS_DENIED", "Perfil alterado; solicite novo relatório");
      await this.db.reportJob.update({
        where: { id },
        data: {
          status: "PROCESSING",
          startedAt: new Date(),
          errorMessage: null,
        },
      });
      const signature = job.projectId
        ? await this.data.signature(r, job.projectId)
        : role;
      const collected = await this.data.collect(
        r,
        job.projectId ?? undefined,
        job.reportType,
        parameters,
      );
      const bytes = await renderReport(
        job.format,
        collected.title,
        collected.sections,
        collected.photos,
      );
      // Recheck membership and document policy after rendering, before making the artifact available.
      const latest = await this.requester(job);
      await this.authorize(latest, job.projectId, job.reportType);
      if (
        job.projectId &&
        signature !== (await this.data.signature(latest, job.projectId))
      )
        fail(
          409,
          "REPORT_SCOPE_CHANGED",
          "Permissões alteradas durante geração",
        );
      const objectKey = `tenant/${job.tenantId}/reports/${new Date().getUTCFullYear()}/${job.id}/report.${job.format.toLowerCase()}`;
      const file = this.file(objectKey);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes);
      await this.db.$transaction(async (tx) => {
        await tx.reportJob.update({
          where: { id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            objectKey,
            parameters: { ...parameters, signature },
          },
        });
        await recordAudit(tx, r.auth, {
          action: "REPORT_GENERATED",
          entityType: "ReportJob",
          entityId: id,
          projectId: job.projectId ?? undefined,
          newValues: { format: job.format, bytes: bytes.length },
        });
        if (job.reportType === "PORTFOLIO")
          await recordAudit(tx, r.auth, {
            action: "DASHBOARD_EXPORT_CREATED",
            entityType: "ReportJob",
            entityId: id,
          });
      });
    } catch (error) {
      await this.failed(job, "REPORT_GENERATION_FAILED");
      throw error;
    }
  }
  async get(r: ApiRequest, id: string) {
    const job = await this.db.reportJob.findFirst({
      where: { id, tenantId: r.auth.tenantId, requestedBy: r.auth.userId },
    });
    if (!job) fail(404, "RESOURCE_NOT_FOUND", "Relatório não encontrado");
    const role = await this.authorize(r, job.projectId, job.reportType);
    const params = job.parameters as { role: string; signature?: string };
    if (role !== params.role)
      fail(403, "ACCESS_DENIED", "Perfil alterado; solicite novo relatório");
    return job;
  }
  async list(r: ApiRequest) {
    const rows = await this.db.reportJob.findMany({
      where: { tenantId: r.auth.tenantId, requestedBy: r.auth.userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const permitted = [];
    for (const row of rows) {
      try {
        await this.get(r, row.id);
        permitted.push(this.dto(row));
      } catch (error) {
        if (
          !(error instanceof HttpException) ||
          ![403, 404].includes(error.getStatus())
        )
          throw error;
      }
    }
    return { items: permitted };
  }
  sign(value: string) {
    return createHmac("sha256", configuration().JWT_SECRET)
      .update(`report:${value}`)
      .digest("base64url");
  }
  async ticket(r: ApiRequest, id: string) {
    const job = await this.get(r, id);
    if (job.status !== "COMPLETED" || job.expiresAt.getTime() < Date.now())
      fail(409, "REPORT_NOT_READY", "Relatório indisponível ou expirado");
    const expires = String(Date.now() + 60000),
      value = `${r.auth.tenantId}:${r.auth.userId}:${id}:${expires}`;
    return {
      url: `/api/v1/reports/${id}/file?expires=${expires}&signature=${this.sign(value)}`,
      expiresAt: new Date(Number(expires)).toISOString(),
    };
  }
  async download(
    r: ApiRequest,
    id: string,
    expires: string,
    signature: string,
  ) {
    const expected = this.sign(
        `${r.auth.tenantId}:${r.auth.userId}:${id}:${expires}`,
      ),
      a = Buffer.from(signature),
      b = Buffer.from(expected);
    if (
      !/^\d+$/.test(expires) ||
      Number(expires) < Date.now() ||
      Number(expires) > Date.now() + 61000 ||
      a.length !== b.length ||
      !timingSafeEqual(a, b)
    )
      fail(403, "INVALID_SIGNATURE", "Ligação expirada ou inválida");
    const job = await this.get(r, id);
    if (
      job.status !== "COMPLETED" ||
      !job.objectKey ||
      job.expiresAt.getTime() < Date.now()
    )
      fail(409, "REPORT_NOT_READY", "Relatório indisponível");
    const parameters = job.parameters as { signature: string };
    if (
      job.projectId &&
      parameters.signature !== (await this.data.signature(r, job.projectId))
    )
      fail(
        409,
        "REPORT_SCOPE_CHANGED",
        "Visibilidade alterada; gere novamente o relatório",
      );
    const bytes = await readFile(this.file(job.objectKey));
    await recordAudit(
      this.db,
      r.auth,
      {
        action: "REPORT_DOWNLOADED",
        entityType: "ReportJob",
        entityId: id,
        projectId: job.projectId ?? undefined,
      },
      r,
    );
    return { job, bytes };
  }
}
