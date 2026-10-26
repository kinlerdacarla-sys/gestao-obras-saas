-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'SUPPORT');

-- CreateEnum
CREATE TYPE "PlatformUserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'ANNUAL', 'MANUAL');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "TenantStatus" ADD VALUE 'CLOSED';

-- CreateTable
CREATE TABLE "platform_users" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "PlatformRole" NOT NULL,
    "status" "PlatformUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_sessions" (
    "id" UUID NOT NULL,
    "platform_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "authenticated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "status" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "monthly_price" DECIMAL(18,2),
    "annual_price" DECIMAL(18,2),
    "currency" VARCHAR(3) NOT NULL,
    "trial_days" INTEGER NOT NULL DEFAULT 14,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_limits" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "limit_key" TEXT NOT NULL,
    "limit_value" INTEGER,
    "unlimited" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "plan_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "features" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_features" (
    "plan_id" UUID NOT NULL,
    "feature_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "plan_features_pkey" PRIMARY KEY ("plan_id","feature_id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "billing_cycle" "BillingCycle" NOT NULL DEFAULT 'MANUAL',
    "trial_start" TIMESTAMPTZ(6),
    "trial_end" TIMESTAMPTZ(6),
    "current_period_start" TIMESTAMPTZ(6) NOT NULL,
    "current_period_end" TIMESTAMPTZ(6) NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMPTZ(6),
    "suspended_at" TIMESTAMPTZ(6),
    "external_customer_id" TEXT,
    "external_subscription_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_usage" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "usage_key" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "used_quantity" BIGINT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_settings" (
    "tenant_id" UUID NOT NULL,
    "default_currency" TEXT NOT NULL DEFAULT 'MZN',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Maputo',
    "date_format" TEXT NOT NULL DEFAULT 'dd/MM/yyyy',
    "company_logo_document_id" UUID,
    "support_email" TEXT,
    "branding_primary" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "export_allowed" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "tenant_status_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "from_status" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "changed_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" UUID NOT NULL,
    "platform_user_id" UUID,
    "tenant_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_sessions" (
    "id" UUID NOT NULL,
    "platform_user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "authorized_by" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "support_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "rollout_percentage" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_feature_overrides" (
    "tenant_id" UUID NOT NULL,
    "feature_flag_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "tenant_feature_overrides_pkey" PRIMARY KEY ("tenant_id","feature_flag_id")
);

-- CreateTable
CREATE TABLE "billing_invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "tax_amount" DECIMAL(18,2) NOT NULL,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "due_date" DATE,
    "paid_at" TIMESTAMPTZ(6),
    "external_invoice_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_export_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "requested_by" UUID NOT NULL,
    "object_key" TEXT,
    "error_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "data_export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_legal_acceptances" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID,
    "document_type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,

    CONSTRAINT "user_legal_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_users_user_id_key" ON "platform_users"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_sessions_token_hash_key" ON "platform_sessions"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "plan_limits_plan_id_limit_key_key" ON "plan_limits"("plan_id", "limit_key");

-- CreateIndex
CREATE UNIQUE INDEX "features_code_key" ON "features"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenant_id_key" ON "subscriptions"("tenant_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_trial_end_idx" ON "subscriptions"("status", "trial_end");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenant_id_id_key" ON "subscriptions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_usage_tenant_id_usage_key_period_start_key" ON "tenant_usage"("tenant_id", "usage_key", "period_start");

-- CreateIndex
CREATE INDEX "tenant_status_events_tenant_id_created_at_idx" ON "tenant_status_events"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "platform_audit_logs_tenant_id_created_at_idx" ON "platform_audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "support_sessions_platform_user_id_status_expires_at_idx" ON "support_sessions"("platform_user_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_code_key" ON "feature_flags"("code");

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoices_invoice_number_key" ON "billing_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "billing_invoices_tenant_id_created_at_idx" ON "billing_invoices"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoices_tenant_id_idempotency_key_key" ON "billing_invoices"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "data_export_jobs_tenant_id_created_at_idx" ON "data_export_jobs"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_legal_acceptances_user_id_tenant_id_document_type_vers_key" ON "user_legal_acceptances"("user_id", "tenant_id", "document_type", "version");

-- AddForeignKey
ALTER TABLE "plan_limits" ADD CONSTRAINT "plan_limits_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "features"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_users" ADD CONSTRAINT "platform_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;

ALTER TABLE "platform_sessions" ADD CONSTRAINT "platform_sessions_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT;

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT;

ALTER TABLE "tenant_usage" ADD CONSTRAINT "tenant_usage_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "tenant_status_events" ADD CONSTRAINT "tenant_status_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "tenant_status_events" ADD CONSTRAINT "tenant_status_events_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "platform_users"("id") ON DELETE RESTRICT;

ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT;

ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT;

ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_authorized_by_fkey" FOREIGN KEY ("authorized_by") REFERENCES "platform_users"("id") ON DELETE RESTRICT;

ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "tenant_feature_overrides" ADD CONSTRAINT "tenant_feature_overrides_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "tenant_feature_overrides" ADD CONSTRAINT "tenant_feature_overrides_feature_flag_id_fkey" FOREIGN KEY ("feature_flag_id") REFERENCES "feature_flags"("id") ON DELETE RESTRICT;

ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "data_export_jobs" ADD CONSTRAINT "data_export_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "user_legal_acceptances" ADD CONSTRAINT "user_legal_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;

ALTER TABLE "user_legal_acceptances" ADD CONSTRAINT "user_legal_acceptances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE billing_invoices ADD CONSTRAINT billing_invoice_subscription_tenant_fkey FOREIGN KEY (tenant_id, subscription_id) REFERENCES subscriptions(tenant_id, id);
ALTER TABLE plan_limits ADD CONSTRAINT plan_limit_valid CHECK ((unlimited AND limit_value IS NULL) OR (NOT unlimited AND limit_value >= 0 AND limit_value IS NOT NULL));
ALTER TABLE plan_limits ADD CONSTRAINT plan_limit_key_valid CHECK (limit_key IN ('ACTIVE_PROJECTS','USERS','STORAGE_GB','MONTHLY_REPORTS','MONTHLY_AI_ACTIONS'));
ALTER TABLE tenant_usage ADD CONSTRAINT usage_nonnegative CHECK (used_quantity >= 0 AND period_end > period_start);
ALTER TABLE subscriptions ADD CONSTRAINT subscription_period_valid CHECK (current_period_end > current_period_start AND (trial_end IS NULL OR trial_end > trial_start));
ALTER TABLE subscription_plans ADD CONSTRAINT plan_prices_valid CHECK ((monthly_price IS NULL OR monthly_price >= 0) AND (annual_price IS NULL OR annual_price >= 0) AND trial_days BETWEEN 0 AND 365);
ALTER TABLE feature_flags ADD CONSTRAINT rollout_valid CHECK (rollout_percentage BETWEEN 0 AND 100);
ALTER TABLE billing_invoices ADD CONSTRAINT invoice_amounts_valid CHECK (subtotal >= 0 AND tax_amount >= 0 AND total_amount = subtotal + tax_amount AND period_end > period_start);
ALTER TABLE billing_invoices ADD CONSTRAINT invoice_status_valid CHECK (status IN ('DRAFT','ISSUED','PAID','VOID','OVERDUE'));
ALTER TABLE support_sessions ADD CONSTRAINT support_session_valid CHECK (status IN ('ACTIVE','EXPIRED','TERMINATED') AND length(trim(reason)) >= 10 AND expires_at > started_at AND expires_at <= started_at + interval '30 minutes');
ALTER TABLE data_export_jobs ADD CONSTRAINT export_status_valid CHECK (status IN ('QUEUED','PROCESSING','COMPLETED','FAILED','EXPIRED'));
ALTER TABLE user_legal_acceptances ADD CONSTRAINT legal_type_valid CHECK (document_type IN ('TERMS','PRIVACY'));
CREATE FUNCTION prevent_platform_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Platform audit is append-only'; END $$;
CREATE TRIGGER platform_audit_immutable BEFORE UPDATE OR DELETE ON platform_audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_platform_audit_mutation();
CREATE TRIGGER tenant_status_history_immutable BEFORE UPDATE OR DELETE ON tenant_status_events FOR EACH ROW EXECUTE FUNCTION prevent_platform_audit_mutation();
