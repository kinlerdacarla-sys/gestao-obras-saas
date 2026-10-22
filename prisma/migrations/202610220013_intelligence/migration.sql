-- CreateEnum
CREATE TYPE "ExecutiveAlertType" AS ENUM ('SCHEDULE_DELAY', 'BUDGET_OVERRUN_RISK', 'CONTRACT_OVER_BUDGET', 'FUNDING_LOW', 'PAYMENT_OVERDUE', 'MEASUREMENT_PENDING_APPROVAL', 'NCR_OVERDUE', 'NCR_CRITICAL', 'CONTRACT_EXPIRING', 'INSPECTION_PENDING', 'DAILY_LOG_MISSING');

-- CreateEnum
CREATE TYPE "ExecutiveAlertSeverity" AS ENUM ('INFO', 'WARNING', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ExecutiveAlertStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('PROJECT_EXECUTIVE', 'PROJECT_PROGRESS', 'FINANCIAL', 'MEASUREMENTS', 'CONTRACTS', 'QUALITY', 'DAILY_LOG', 'FUNDING', 'PORTFOLIO');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('PDF', 'XLSX');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "project_kpi_snapshots" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "planned_progress" DECIMAL(5,2),
    "actual_progress" DECIMAL(5,2),
    "approved_budget" DECIMAL(18,2) NOT NULL,
    "current_contracts" DECIMAL(18,2) NOT NULL,
    "certified" DECIMAL(18,2) NOT NULL,
    "paid" DECIMAL(18,2) NOT NULL,
    "funding_disbursed" DECIMAL(18,2) NOT NULL,
    "open_ncr" INTEGER NOT NULL,
    "critical_ncr" INTEGER NOT NULL,
    "overdue_ncr" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_kpi_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID,
    "alert_type" "ExecutiveAlertType" NOT NULL,
    "severity" "ExecutiveAlertSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "status" "ExecutiveAlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" UUID,
    "deduplication_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_settings" (
    "tenant_id" UUID NOT NULL,
    "schedule_delay_threshold_pp" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "funding_low_threshold_percentage" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "contract_expiry_days" INTEGER NOT NULL DEFAULT 30,
    "missing_daily_log_days" INTEGER NOT NULL DEFAULT 3,
    "enable_email" BOOLEAN NOT NULL DEFAULT false,
    "enable_in_app" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "alert_settings_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "email_enabled" BOOLEAN NOT NULL DEFAULT false,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "daily_digest_enabled" BOOLEAN NOT NULL DEFAULT false,
    "inspection_notifications" BOOLEAN NOT NULL DEFAULT true,
    "measurement_notifications" BOOLEAN NOT NULL DEFAULT true,
    "quality_notifications" BOOLEAN NOT NULL DEFAULT true,
    "financial_notifications" BOOLEAN NOT NULL DEFAULT true,
    "schedule_notifications" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("tenant_id","user_id")
);

-- CreateTable
CREATE TABLE "report_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID,
    "report_type" "ReportType" NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "parameters" JSONB NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'QUEUED',
    "requested_by" UUID NOT NULL,
    "object_key" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "report_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_kpi_snapshots_tenant_id_snapshot_date_idx" ON "project_kpi_snapshots"("tenant_id", "snapshot_date");

-- CreateIndex
CREATE UNIQUE INDEX "project_kpi_snapshots_tenant_id_project_id_snapshot_date_key" ON "project_kpi_snapshots"("tenant_id", "project_id", "snapshot_date");

-- CreateIndex
CREATE INDEX "alerts_tenant_id_project_id_status_severity_idx" ON "alerts"("tenant_id", "project_id", "status", "severity");

-- CreateIndex
CREATE INDEX "report_jobs_tenant_id_requested_by_created_at_idx" ON "report_jobs"("tenant_id", "requested_by", "created_at");

-- CreateIndex
CREATE INDEX "report_jobs_tenant_id_project_id_status_idx" ON "report_jobs"("tenant_id", "project_id", "status");

-- Tenant/project scope is enforced in the database as well as the API.
ALTER TABLE project_kpi_snapshots ADD CONSTRAINT kpi_project_scope FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE alerts ADD CONSTRAINT alert_tenant_scope FOREIGN KEY(tenant_id) REFERENCES tenants(id);
ALTER TABLE alerts ADD CONSTRAINT alert_project_scope FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE alert_settings ADD CONSTRAINT alert_settings_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id);
ALTER TABLE notification_preferences ADD CONSTRAINT notification_preference_member FOREIGN KEY(tenant_id,user_id) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE report_jobs ADD CONSTRAINT report_requester_scope FOREIGN KEY(tenant_id,requested_by) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE report_jobs ADD CONSTRAINT report_project_scope FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id);
CREATE UNIQUE INDEX alerts_one_open_condition ON alerts(tenant_id,deduplication_key) WHERE status IN ('ACTIVE','ACKNOWLEDGED','DISMISSED');
CREATE TRIGGER alerts_no_delete BEFORE DELETE ON alerts FOR EACH ROW EXECUTE FUNCTION quality_no_delete();
CREATE TRIGGER report_jobs_no_delete BEFORE DELETE ON report_jobs FOR EACH ROW EXECUTE FUNCTION quality_no_delete();
ALTER TABLE alert_settings ADD CONSTRAINT alert_settings_bounds CHECK (schedule_delay_threshold_pp BETWEEN 0 AND 100 AND funding_low_threshold_percentage BETWEEN 0 AND 100 AND contract_expiry_days BETWEEN 1 AND 365 AND missing_daily_log_days BETWEEN 1 AND 365);
