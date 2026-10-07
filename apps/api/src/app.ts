import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { PlatformModule, Errors } from "./platform.js";
import { SessionGuard } from "./auth/security.js";
import { AuthModule } from "./auth/auth.module.js";
import { TenantModule } from "./tenant/tenant.module.js";
import { UserModule } from "./user/user.module.js";
import { OrganizationModule } from "./organization/organization.module.js";
import { ProjectModule } from "./project/project.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { HealthModule } from "./health/health.module.js";
import { NotificationModule } from "./notification/notification.module.js";
import { configuration } from "../../../packages/config/src/index.js";
import { completeResponseDocs } from "./response-docs.js";
import { completeBudgetDocs } from "./budget/docs.js";
import { BudgetModule } from "./budget/budget.module.js";
import { ScheduleModule } from "./schedule/schedule.module.js";
import { DailyLogModule } from "./daily-log/daily-log.module.js";
import { completeExecutionDocs } from "./schedule/docs.js";
@Module({
  imports: [
    PlatformModule,
    AuthModule,
    TenantModule,
    UserModule,
    OrganizationModule,
    ProjectModule,
    AuditModule,
    HealthModule,
    NotificationModule,
    BudgetModule,
    ScheduleModule,
    DailyLogModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: SessionGuard }],
})
export class AppModule {}
export async function createApp() {
  const app = await NestFactory.create(AppModule, {
    logger:
      configuration().NODE_ENV === "test" ? false : ["error", "warn", "log"],
  });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: configuration().WEB_ORIGIN, credentials: true });
  app.useGlobalFilters(new Errors());
  app.enableShutdownHooks();
  if (configuration().NODE_ENV !== "production") {
    const config = new DocumentBuilder()
      .setTitle("Obras • Core SaaS")
      .setDescription(
        "M1 + M2 + M3. Cookies HttpOnly; mutações exigem Origin igual a WEB_ORIGIN. Valores monetários e progresso são strings decimais.",
      )
      .setVersion("3.0.0")
      .addCookieAuth("access")
      .build();
    const document = SwaggerModule.createDocument(app, config);
    completeResponseDocs(document);
    completeBudgetDocs(document);
    completeExecutionDocs(document);
    document.security = [{ access: [] }];
    SwaggerModule.setup("api/docs", app, document);
  }
  return app;
}
