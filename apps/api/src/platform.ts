import { safeErrorTracker } from "./saas/observability.js";
import { SaasPolicyError } from "../../../packages/domain/src/saas.js";
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Global,
  HttpException,
  Injectable,
  Module,
  OnModuleDestroy,
} from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { Redis } from "ioredis";
import type { Response } from "express";
import { ZodError } from "zod";
import { configuration } from "../../../packages/config/src/index.js";
import { BudgetError } from "../../../packages/domain/src/budget.js";
import { CommercialError } from "../../../packages/domain/src/commercial.js";
import { ScheduleError } from "../../../packages/domain/src/schedule.js";

@Injectable()
export class Database extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: configuration().DATABASE_URL,
        connectionTimeoutMillis: 5000,
      }),
    });
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
@Injectable()
export class Cache extends Redis implements OnModuleDestroy {
  constructor() {
    super(configuration().REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });
  }
  async onModuleDestroy() {
    await this.quit();
  }
}
export function fail(status: number, code: string, message: string): never {
  throw new HttpException(
    { statusCode: status, code, message, details: [] },
    status,
  );
}
export const notFound = (): never =>
  fail(404, "RESOURCE_NOT_FOUND", "Recurso não encontrado");
@Catch()
export class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof SaasPolicyError)
      return response.status(409).json({
        statusCode: 409,
        code: error.code,
        message: error.message,
        details: error.details,
      });
    if (error instanceof CommercialError)
      return response.status(error.status).json({
        statusCode: error.status,
        code: error.code,
        message: error.message,
        details: [],
      });
    if (error instanceof ScheduleError)
      return response.status(400).json({
        statusCode: 400,
        code: error.code,
        message: error.message,
        details: [],
      });
    if (error instanceof BudgetError) {
      const status = error.code === "BUDGET_REVISION_IMMUTABLE" ? 409 : 400;
      return response.status(status).json({
        statusCode: status,
        code: error.code,
        message: error.message,
        details: [],
      });
    }
    if (error instanceof ZodError)
      return response.status(400).json({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Dados inválidos",
        details: error.issues,
      });
    if (error instanceof HttpException) {
      const status = error.getStatus();
      const body = error.getResponse();
      return response.status(status).json(
        typeof body === "object" && "code" in body
          ? body
          : {
              statusCode: status,
              code:
                status === 401
                  ? "UNAUTHORIZED"
                  : status === 403
                    ? "FORBIDDEN"
                    : status === 404
                      ? "RESOURCE_NOT_FOUND"
                      : "VALIDATION_ERROR",
              message: error.message,
              details: [],
            },
      );
    }
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "P2002"
    )
      return response.status(409).json({
        statusCode: 409,
        code: "CONFLICT",
        message: "Já existe um registo com estes dados",
        details: [],
      });
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "P2025"
    )
      return response.status(404).json({
        statusCode: 404,
        code: "RESOURCE_NOT_FOUND",
        message: "Recurso não encontrado",
        details: [],
      });
    safeErrorTracker.capture({
      requestId: String(response.locals.requestId ?? "unknown"),
      errorType: error instanceof Error ? error.name : "UnknownError",
      environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
      release: process.env.RELEASE_SHA ?? "development",
    });
    return response.status(500).json({
      statusCode: 500,
      code: "INTERNAL_ERROR",
      message: "Erro interno",
      details: [],
    });
  }
}
@Global()
@Module({ providers: [Database, Cache], exports: [Database, Cache] })
export class PlatformModule {}
