-- CreateEnum
CREATE TYPE "ChecklistStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ChecklistVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ChecklistResponseType" AS ENUM ('PASS_FAIL_NA', 'YES_NO_NA', 'TEXT', 'NUMBER', 'DATE');

-- CreateEnum
CREATE TYPE "InspectionRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'SCHEDULED', 'INSPECTION_IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('PASS', 'PASS_WITH_OBSERVATIONS', 'FAIL');

-- CreateEnum
CREATE TYPE "ChecklistResult" AS ENUM ('PASS', 'FAIL', 'NA');

-- CreateEnum
CREATE TYPE "QualitySeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "QualityCategory" AS ENUM ('WORKMANSHIP', 'MATERIAL', 'DESIGN', 'DIMENSION', 'SAFETY', 'DOCUMENTATION', 'EQUIPMENT', 'PROCESS', 'OTHER');

-- CreateEnum
CREATE TYPE "NcrStatus" AS ENUM ('OPEN', 'ASSIGNED', 'CORRECTION_IN_PROGRESS', 'READY_FOR_VERIFICATION', 'CLOSED', 'REOPENED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CorrectiveActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QualityEvidenceType" AS ENUM ('PHOTO', 'DOCUMENT', 'DRAWING', 'TEST_RESULT', 'OTHER');

-- CreateEnum
CREATE TYPE "NcrEventType" AS ENUM ('CREATED', 'ASSIGNED', 'STATUS_CHANGED', 'COMMENTED', 'CORRECTIVE_ACTION_CREATED', 'CORRECTIVE_ACTION_COMPLETED', 'VERIFICATION_APPROVED', 'VERIFICATION_REJECTED', 'CLOSED', 'REOPENED');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "corrective_action_id" UUID,
ADD COLUMN     "inspection_id" UUID;

-- CreateTable
CREATE TABLE "checklist_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "status" "ChecklistStatus" NOT NULL DEFAULT 'DRAFT',
    "current_version" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_template_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "checklist_template_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "ChecklistVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "published_by" UUID,
    "published_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "checklist_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_template_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checklist_template_version_id" UUID NOT NULL,
    "section" TEXT,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "response_type" "ChecklistResponseType" NOT NULL DEFAULT 'PASS_FAIL_NA',
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "allow_comment" BOOLEAN NOT NULL DEFAULT true,
    "require_photo_on_fail" BOOLEAN NOT NULL DEFAULT true,
    "is_hold_point" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "checklist_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "request_number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requested_inspection_date" DATE NOT NULL,
    "schedule_task_id" UUID,
    "budget_item_id" UUID,
    "daily_log_id" UUID,
    "contract_id" UUID,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_inspector_id" UUID,
    "status" "InspectionRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inspection_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "inspection_request_id" UUID,
    "inspection_number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "checklist_template_version_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "inspection_date" DATE NOT NULL,
    "schedule_task_id" UUID,
    "budget_item_id" UUID,
    "daily_log_id" UUID,
    "contract_id" UUID,
    "measurement_id" UUID,
    "inspector_id" UUID NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "overall_result" "InspectionResult",
    "general_comments" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "submitted_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "inspection_id" UUID NOT NULL,
    "template_item_id" UUID NOT NULL,
    "result" "ChecklistResult",
    "text_value" TEXT,
    "numeric_value" DECIMAL(24,6),
    "date_value" DATE,
    "comment" TEXT,
    "is_non_conformity" BOOLEAN NOT NULL DEFAULT false,
    "hold_point_released_by" UUID,
    "hold_point_released_at" TIMESTAMPTZ(6),
    "hold_point_release_reason" TEXT,

    CONSTRAINT "inspection_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_evidence" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inspection_id" UUID NOT NULL,
    "inspection_item_id" UUID,
    "document_id" UUID NOT NULL,
    "caption" TEXT,
    "evidence_type" "QualityEvidenceType" NOT NULL DEFAULT 'PHOTO',

    CONSTRAINT "inspection_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "non_conformities" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "ncr_number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "inspection_id" UUID,
    "inspection_item_id" UUID,
    "daily_log_occurrence_id" UUID,
    "schedule_task_id" UUID,
    "budget_item_id" UUID,
    "daily_log_id" UUID,
    "contract_id" UUID,
    "measurement_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "QualitySeverity" NOT NULL,
    "category" "QualityCategory" NOT NULL,
    "status" "NcrStatus" NOT NULL DEFAULT 'OPEN',
    "responsible_user_id" UUID,
    "responsible_organization_id" UUID,
    "due_date" DATE,
    "detected_by" UUID NOT NULL,
    "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "closed_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "non_conformities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corrective_actions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "non_conformity_id" UUID NOT NULL,
    "action_number" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "responsible_user_id" UUID,
    "responsible_organization_id" UUID,
    "due_date" DATE,
    "status" "CorrectiveActionStatus" NOT NULL DEFAULT 'OPEN',
    "completion_notes" TEXT,
    "completed_by" UUID,
    "completed_at" TIMESTAMPTZ(6),
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "corrective_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corrective_action_evidence" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "corrective_action_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "caption" TEXT,

    CONSTRAINT "corrective_action_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "non_conformity_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "non_conformity_id" UUID NOT NULL,
    "event_type" "NcrEventType" NOT NULL,
    "from_status" "NcrStatus",
    "to_status" "NcrStatus",
    "comment" TEXT,
    "user_id" UUID NOT NULL,

    CONSTRAINT "non_conformity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "non_conformity_comments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "non_conformity_id" UUID NOT NULL,
    "comment" TEXT NOT NULL,

    CONSTRAINT "non_conformity_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_policies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "block_measurement_on_open_critical_ncr" BOOLEAN NOT NULL DEFAULT true,
    "prevent_self_verification" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quality_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "user_id" UUID NOT NULL,
    "event_key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "resource_path" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checklist_templates_tenant_id_id_key" ON "checklist_templates"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_templates_tenant_id_code_key" ON "checklist_templates"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_template_versions_tenant_id_id_key" ON "checklist_template_versions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_template_versions_tenant_id_checklist_template_id_key" ON "checklist_template_versions"("tenant_id", "checklist_template_id", "version_number");

-- CreateIndex
CREATE INDEX "checklist_template_items_tenant_id_checklist_template_versi_idx" ON "checklist_template_items"("tenant_id", "checklist_template_version_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_template_items_tenant_id_id_key" ON "checklist_template_items"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_template_items_checklist_template_version_id_code_key" ON "checklist_template_items"("checklist_template_version_id", "code");

-- CreateIndex
CREATE INDEX "inspection_requests_tenant_id_project_id_status_idx" ON "inspection_requests"("tenant_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "inspection_requests_tenant_id_project_id_requested_inspecti_idx" ON "inspection_requests"("tenant_id", "project_id", "requested_inspection_date");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_requests_tenant_id_project_id_id_key" ON "inspection_requests"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_requests_tenant_id_project_id_request_number_key" ON "inspection_requests"("tenant_id", "project_id", "request_number");

-- CreateIndex
CREATE INDEX "inspections_tenant_id_project_id_status_idx" ON "inspections"("tenant_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "inspections_tenant_id_project_id_inspection_date_idx" ON "inspections"("tenant_id", "project_id", "inspection_date");

-- CreateIndex
CREATE INDEX "inspections_tenant_id_project_id_inspector_id_idx" ON "inspections"("tenant_id", "project_id", "inspector_id");

-- CreateIndex
CREATE INDEX "inspections_tenant_id_project_id_contract_id_idx" ON "inspections"("tenant_id", "project_id", "contract_id");

-- CreateIndex
CREATE INDEX "inspections_tenant_id_project_id_schedule_task_id_idx" ON "inspections"("tenant_id", "project_id", "schedule_task_id");

-- CreateIndex
CREATE INDEX "inspections_tenant_id_project_id_budget_item_id_idx" ON "inspections"("tenant_id", "project_id", "budget_item_id");

-- CreateIndex
CREATE INDEX "inspections_tenant_id_project_id_inspection_request_id_idx" ON "inspections"("tenant_id", "project_id", "inspection_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_tenant_id_project_id_id_key" ON "inspections"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_tenant_id_project_id_inspection_number_key" ON "inspections"("tenant_id", "project_id", "inspection_number");

-- CreateIndex
CREATE INDEX "inspection_items_inspection_id_result_idx" ON "inspection_items"("inspection_id", "result");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_items_tenant_id_project_id_id_key" ON "inspection_items"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_items_inspection_id_template_item_id_key" ON "inspection_items"("inspection_id", "template_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_items_tenant_id_project_id_inspection_id_id_key" ON "inspection_items"("tenant_id", "project_id", "inspection_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_evidence_document_id_key" ON "inspection_evidence"("document_id");

-- CreateIndex
CREATE INDEX "inspection_evidence_tenant_id_project_id_inspection_id_idx" ON "inspection_evidence"("tenant_id", "project_id", "inspection_id");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_evidence_tenant_id_project_id_id_key" ON "inspection_evidence"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "non_conformities_tenant_id_project_id_status_idx" ON "non_conformities"("tenant_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "non_conformities_tenant_id_project_id_severity_idx" ON "non_conformities"("tenant_id", "project_id", "severity");

-- CreateIndex
CREATE INDEX "non_conformities_tenant_id_project_id_category_idx" ON "non_conformities"("tenant_id", "project_id", "category");

-- CreateIndex
CREATE INDEX "non_conformities_tenant_id_project_id_due_date_idx" ON "non_conformities"("tenant_id", "project_id", "due_date");

-- CreateIndex
CREATE INDEX "non_conformities_tenant_id_project_id_responsible_user_id_idx" ON "non_conformities"("tenant_id", "project_id", "responsible_user_id");

-- CreateIndex
CREATE INDEX "non_conformities_tenant_id_project_id_responsible_organizat_idx" ON "non_conformities"("tenant_id", "project_id", "responsible_organization_id");

-- CreateIndex
CREATE INDEX "non_conformities_tenant_id_project_id_contract_id_idx" ON "non_conformities"("tenant_id", "project_id", "contract_id");

-- CreateIndex
CREATE INDEX "non_conformities_tenant_id_project_id_budget_item_id_idx" ON "non_conformities"("tenant_id", "project_id", "budget_item_id");

-- CreateIndex
CREATE INDEX "non_conformities_tenant_id_project_id_measurement_id_idx" ON "non_conformities"("tenant_id", "project_id", "measurement_id");

-- CreateIndex
CREATE INDEX "non_conformities_tenant_id_project_id_schedule_task_id_idx" ON "non_conformities"("tenant_id", "project_id", "schedule_task_id");

-- CreateIndex
CREATE INDEX "non_conformities_tenant_id_project_id_inspection_id_idx" ON "non_conformities"("tenant_id", "project_id", "inspection_id");

-- CreateIndex
CREATE INDEX "non_conformities_tenant_id_project_id_detected_at_idx" ON "non_conformities"("tenant_id", "project_id", "detected_at");

-- CreateIndex
CREATE UNIQUE INDEX "non_conformities_tenant_id_project_id_id_key" ON "non_conformities"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "non_conformities_tenant_id_project_id_ncr_number_key" ON "non_conformities"("tenant_id", "project_id", "ncr_number");

-- CreateIndex
CREATE INDEX "corrective_actions_tenant_id_project_id_non_conformity_id_s_idx" ON "corrective_actions"("tenant_id", "project_id", "non_conformity_id", "status");

-- CreateIndex
CREATE INDEX "corrective_actions_tenant_id_project_id_due_date_idx" ON "corrective_actions"("tenant_id", "project_id", "due_date");

-- CreateIndex
CREATE INDEX "corrective_actions_tenant_id_project_id_responsible_user_id_idx" ON "corrective_actions"("tenant_id", "project_id", "responsible_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "corrective_actions_tenant_id_project_id_id_key" ON "corrective_actions"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "corrective_actions_non_conformity_id_action_number_key" ON "corrective_actions"("non_conformity_id", "action_number");

-- CreateIndex
CREATE UNIQUE INDEX "corrective_action_evidence_document_id_key" ON "corrective_action_evidence"("document_id");

-- CreateIndex
CREATE INDEX "corrective_action_evidence_tenant_id_project_id_corrective__idx" ON "corrective_action_evidence"("tenant_id", "project_id", "corrective_action_id");

-- CreateIndex
CREATE UNIQUE INDEX "corrective_action_evidence_tenant_id_project_id_id_key" ON "corrective_action_evidence"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "non_conformity_events_tenant_id_project_id_non_conformity_i_idx" ON "non_conformity_events"("tenant_id", "project_id", "non_conformity_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "non_conformity_events_tenant_id_project_id_id_key" ON "non_conformity_events"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "non_conformity_comments_tenant_id_project_id_non_conformity_idx" ON "non_conformity_comments"("tenant_id", "project_id", "non_conformity_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "non_conformity_comments_tenant_id_project_id_id_key" ON "non_conformity_comments"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "quality_policies_tenant_id_project_id_id_key" ON "quality_policies"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "quality_policies_tenant_id_project_id_key" ON "quality_policies"("tenant_id", "project_id");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_user_id_read_at_created_at_idx" ON "notifications"("tenant_id", "user_id", "read_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_tenant_id_project_id_id_key" ON "notifications"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_tenant_id_project_id_user_id_event_key_key" ON "notifications"("tenant_id", "project_id", "user_id", "event_key");

ALTER TABLE checklist_templates ADD FOREIGN KEY(tenant_id) REFERENCES tenants(id);
ALTER TABLE checklist_templates ADD FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE checklist_templates ADD CHECK(version>=0);

ALTER TABLE checklist_template_versions ADD FOREIGN KEY(tenant_id) REFERENCES tenants(id);
ALTER TABLE checklist_template_versions ADD FOREIGN KEY(tenant_id,checklist_template_id) REFERENCES checklist_templates(tenant_id,id);
ALTER TABLE checklist_template_versions ADD FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE checklist_template_versions ADD FOREIGN KEY(tenant_id,published_by) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE checklist_template_versions ADD CHECK(version>=0);

ALTER TABLE checklist_template_items ADD FOREIGN KEY(tenant_id) REFERENCES tenants(id);
ALTER TABLE checklist_template_items ADD FOREIGN KEY(tenant_id,checklist_template_version_id) REFERENCES checklist_template_versions(tenant_id,id);
ALTER TABLE checklist_template_items ADD FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_users(tenant_id,user_id);

ALTER TABLE inspection_requests ADD FOREIGN KEY(tenant_id) REFERENCES tenants(id);
ALTER TABLE inspection_requests ADD FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE inspection_requests ADD FOREIGN KEY(tenant_id,project_id,schedule_task_id) REFERENCES schedule_tasks(tenant_id,project_id,id);
ALTER TABLE inspection_requests ADD FOREIGN KEY(tenant_id,project_id,budget_item_id) REFERENCES budget_items(tenant_id,project_id,id);
ALTER TABLE inspection_requests ADD FOREIGN KEY(tenant_id,project_id,daily_log_id) REFERENCES daily_logs(tenant_id,project_id,id);
ALTER TABLE inspection_requests ADD FOREIGN KEY(tenant_id,project_id,contract_id) REFERENCES contracts(tenant_id,project_id,id);
ALTER TABLE inspection_requests ADD FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE inspection_requests ADD FOREIGN KEY(tenant_id,requested_by) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE inspection_requests ADD FOREIGN KEY(tenant_id,assigned_inspector_id) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE inspection_requests ADD CHECK(version>=0);

ALTER TABLE inspections ADD FOREIGN KEY(tenant_id) REFERENCES tenants(id);
ALTER TABLE inspections ADD FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE inspections ADD FOREIGN KEY(tenant_id,checklist_template_version_id) REFERENCES checklist_template_versions(tenant_id,id);
ALTER TABLE inspections ADD FOREIGN KEY(tenant_id,project_id,inspection_request_id) REFERENCES inspection_requests(tenant_id,project_id,id);
ALTER TABLE inspections ADD FOREIGN KEY(tenant_id,project_id,schedule_task_id) REFERENCES schedule_tasks(tenant_id,project_id,id);
ALTER TABLE inspections ADD FOREIGN KEY(tenant_id,project_id,budget_item_id) REFERENCES budget_items(tenant_id,project_id,id);
ALTER TABLE inspections ADD FOREIGN KEY(tenant_id,project_id,daily_log_id) REFERENCES daily_logs(tenant_id,project_id,id);
ALTER TABLE inspections ADD FOREIGN KEY(tenant_id,project_id,contract_id) REFERENCES contracts(tenant_id,project_id,id);
ALTER TABLE inspections ADD FOREIGN KEY(tenant_id,project_id,measurement_id) REFERENCES measurements(tenant_id,project_id,id);
ALTER TABLE inspections ADD FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE inspections ADD FOREIGN KEY(tenant_id,inspector_id) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE inspections ADD FOREIGN KEY(tenant_id,closed_by) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE inspections ADD CHECK(version>=0);

ALTER TABLE inspection_items ADD FOREIGN KEY(tenant_id) REFERENCES tenants(id);
ALTER TABLE inspection_items ADD FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE inspection_items ADD FOREIGN KEY(tenant_id,template_item_id) REFERENCES checklist_template_items(tenant_id,id);
ALTER TABLE inspection_items ADD FOREIGN KEY(tenant_id,project_id,inspection_id) REFERENCES inspections(tenant_id,project_id,id);
ALTER TABLE inspection_items ADD FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE inspection_items ADD FOREIGN KEY(tenant_id,hold_point_released_by) REFERENCES tenant_users(tenant_id,user_id);

ALTER TABLE inspection_evidence ADD FOREIGN KEY(tenant_id) REFERENCES tenants(id);
ALTER TABLE inspection_evidence ADD FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE inspection_evidence ADD FOREIGN KEY(tenant_id,project_id,inspection_id) REFERENCES inspections(tenant_id,project_id,id);
ALTER TABLE inspection_evidence ADD FOREIGN KEY(tenant_id,project_id,inspection_item_id) REFERENCES inspection_items(tenant_id,project_id,id);
ALTER TABLE inspection_evidence ADD FOREIGN KEY(tenant_id,project_id,document_id) REFERENCES documents(tenant_id,project_id,id);
ALTER TABLE inspection_evidence ADD FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_users(tenant_id,user_id);

ALTER TABLE non_conformities ADD FOREIGN KEY(tenant_id) REFERENCES tenants(id);
ALTER TABLE non_conformities ADD FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE non_conformities ADD FOREIGN KEY(tenant_id,project_id,inspection_id) REFERENCES inspections(tenant_id,project_id,id);
ALTER TABLE non_conformities ADD FOREIGN KEY(tenant_id,project_id,inspection_item_id) REFERENCES inspection_items(tenant_id,project_id,id);
ALTER TABLE non_conformities ADD FOREIGN KEY(tenant_id,project_id,schedule_task_id) REFERENCES schedule_tasks(tenant_id,project_id,id);
ALTER TABLE non_conformities ADD FOREIGN KEY(tenant_id,project_id,budget_item_id) REFERENCES budget_items(tenant_id,project_id,id);
ALTER TABLE non_conformities ADD FOREIGN KEY(tenant_id,project_id,daily_log_id) REFERENCES daily_logs(tenant_id,project_id,id);
ALTER TABLE non_conformities ADD FOREIGN KEY(tenant_id,project_id,daily_log_occurrence_id) REFERENCES daily_log_occurrences(tenant_id,project_id,id);
ALTER TABLE non_conformities ADD FOREIGN KEY(tenant_id,project_id,contract_id) REFERENCES contracts(tenant_id,project_id,id);
ALTER TABLE non_conformities ADD FOREIGN KEY(tenant_id,project_id,measurement_id) REFERENCES measurements(tenant_id,project_id,id);
ALTER TABLE non_conformities ADD FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE non_conformities ADD FOREIGN KEY(tenant_id,responsible_user_id) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE non_conformities ADD FOREIGN KEY(tenant_id,detected_by) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE non_conformities ADD FOREIGN KEY(tenant_id,verified_by) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE non_conformities ADD FOREIGN KEY(tenant_id,closed_by) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE non_conformities ADD FOREIGN KEY(tenant_id,responsible_organization_id) REFERENCES organizations(tenant_id,id);
ALTER TABLE non_conformities ADD CHECK(version>=0);

ALTER TABLE corrective_actions ADD FOREIGN KEY(tenant_id) REFERENCES tenants(id);
ALTER TABLE corrective_actions ADD FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE corrective_actions ADD FOREIGN KEY(tenant_id,project_id,non_conformity_id) REFERENCES non_conformities(tenant_id,project_id,id);
ALTER TABLE corrective_actions ADD FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE corrective_actions ADD FOREIGN KEY(tenant_id,responsible_user_id) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE corrective_actions ADD FOREIGN KEY(tenant_id,verified_by) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE corrective_actions ADD FOREIGN KEY(tenant_id,completed_by) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE corrective_actions ADD FOREIGN KEY(tenant_id,responsible_organization_id) REFERENCES organizations(tenant_id,id);
ALTER TABLE corrective_actions ADD CHECK(version>=0);

ALTER TABLE corrective_action_evidence ADD FOREIGN KEY(tenant_id) REFERENCES tenants(id);
ALTER TABLE corrective_action_evidence ADD FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE corrective_action_evidence ADD FOREIGN KEY(tenant_id,project_id,corrective_action_id) REFERENCES corrective_actions(tenant_id,project_id,id);
ALTER TABLE corrective_action_evidence ADD FOREIGN KEY(tenant_id,project_id,document_id) REFERENCES documents(tenant_id,project_id,id);
ALTER TABLE corrective_action_evidence ADD FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_users(tenant_id,user_id);

ALTER TABLE non_conformity_events ADD FOREIGN KEY(tenant_id) REFERENCES tenants(id);
ALTER TABLE non_conformity_events ADD FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE non_conformity_events ADD FOREIGN KEY(tenant_id,project_id,non_conformity_id) REFERENCES non_conformities(tenant_id,project_id,id);
ALTER TABLE non_conformity_events ADD FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE non_conformity_events ADD FOREIGN KEY(tenant_id,user_id) REFERENCES tenant_users(tenant_id,user_id);

ALTER TABLE non_conformity_comments ADD FOREIGN KEY(tenant_id) REFERENCES tenants(id);
ALTER TABLE non_conformity_comments ADD FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE non_conformity_comments ADD FOREIGN KEY(tenant_id,project_id,non_conformity_id) REFERENCES non_conformities(tenant_id,project_id,id);
ALTER TABLE non_conformity_comments ADD FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_users(tenant_id,user_id);

ALTER TABLE quality_policies ADD FOREIGN KEY(tenant_id) REFERENCES tenants(id);
ALTER TABLE quality_policies ADD FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE quality_policies ADD FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE quality_policies ADD CHECK(version>=0);

ALTER TABLE notifications ADD FOREIGN KEY(tenant_id) REFERENCES tenants(id);
ALTER TABLE notifications ADD FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE notifications ADD FOREIGN KEY(tenant_id,created_by) REFERENCES tenant_users(tenant_id,user_id);
ALTER TABLE notifications ADD FOREIGN KEY(tenant_id,user_id) REFERENCES tenant_users(tenant_id,user_id);

ALTER TABLE documents ADD FOREIGN KEY(tenant_id,project_id,inspection_id) REFERENCES inspections(tenant_id,project_id,id);
ALTER TABLE documents ADD FOREIGN KEY(tenant_id,project_id,corrective_action_id) REFERENCES corrective_actions(tenant_id,project_id,id);
ALTER TABLE documents DROP CONSTRAINT document_single_owner;
ALTER TABLE documents ADD CONSTRAINT document_single_owner CHECK(num_nonnulls(daily_log_id,expense_id,contract_id,measurement_id,funding_agreement_id,payment_id,inspection_id,corrective_action_id)=1);
ALTER TABLE inspection_evidence ADD FOREIGN KEY(tenant_id,project_id,inspection_id,inspection_item_id) REFERENCES inspection_items(tenant_id,project_id,inspection_id,id);
ALTER TABLE non_conformities ADD CHECK(inspection_item_id IS NULL OR inspection_id IS NOT NULL);
ALTER TABLE non_conformities ADD FOREIGN KEY(tenant_id,project_id,inspection_id,inspection_item_id) REFERENCES inspection_items(tenant_id,project_id,inspection_id,id);
ALTER TABLE quality_policies ADD CHECK(prevent_self_verification=true);
CREATE FUNCTION quality_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Quality history cannot be deleted'; END $$;
CREATE FUNCTION quality_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status <> 'DRAFT' AND NOT (TG_OP='UPDATE' AND OLD.status='PUBLISHED' AND NEW.status='SUPERSEDED' AND (to_jsonb(OLD)-'status'-'updated_at')=(to_jsonb(NEW)-'status'-'updated_at')) THEN RAISE EXCEPTION 'CHECKLIST_VERSION_IMMUTABLE'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER checklist_version_immutable BEFORE UPDATE OR DELETE ON checklist_template_versions FOR EACH ROW EXECUTE FUNCTION quality_version_guard();
CREATE FUNCTION quality_template_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE vid uuid; BEGIN
 vid:=CASE WHEN TG_OP='DELETE' THEN OLD.checklist_template_version_id ELSE NEW.checklist_template_version_id END;
 IF EXISTS(SELECT 1 FROM checklist_template_versions WHERE id=vid AND status<>'DRAFT') OR (TG_OP='UPDATE' AND NEW.checklist_template_version_id<>OLD.checklist_template_version_id) THEN RAISE EXCEPTION 'CHECKLIST_VERSION_IMMUTABLE'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END $$;
CREATE TRIGGER checklist_item_immutable BEFORE INSERT OR UPDATE OR DELETE ON checklist_template_items FOR EACH ROW EXECUTE FUNCTION quality_template_item_guard();
CREATE FUNCTION quality_inspection_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status='CLOSED' THEN RAISE EXCEPTION 'INSPECTION_IMMUTABLE'; END IF; RETURN NEW; END $$;
CREATE TRIGGER inspection_immutable BEFORE UPDATE ON inspections FOR EACH ROW EXECUTE FUNCTION quality_inspection_guard();
CREATE FUNCTION quality_child_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE iid uuid; BEGIN
 iid:=CASE WHEN TG_OP='DELETE' THEN OLD.inspection_id ELSE NEW.inspection_id END;
 IF EXISTS(SELECT 1 FROM inspections WHERE id=iid AND status='CLOSED') THEN RAISE EXCEPTION 'INSPECTION_IMMUTABLE'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END $$;
CREATE TRIGGER inspection_item_immutable BEFORE INSERT OR UPDATE OR DELETE ON inspection_items FOR EACH ROW EXECUTE FUNCTION quality_child_guard();
CREATE TRIGGER inspection_evidence_immutable BEFORE INSERT OR UPDATE OR DELETE ON inspection_evidence FOR EACH ROW EXECUTE FUNCTION quality_child_guard();
CREATE FUNCTION quality_document_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.inspection_id IS NOT NULL AND EXISTS(SELECT 1 FROM inspections WHERE id=OLD.inspection_id AND status='CLOSED') THEN RAISE EXCEPTION 'INSPECTION_IMMUTABLE'; END IF;
 IF OLD.corrective_action_id IS NOT NULL AND EXISTS(SELECT 1 FROM corrective_actions WHERE id=OLD.corrective_action_id AND status='VERIFIED') THEN RAISE EXCEPTION 'NON_CONFORMITY_IMMUTABLE'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER quality_document_immutable BEFORE UPDATE OR DELETE ON documents FOR EACH ROW EXECUTE FUNCTION quality_document_guard();
CREATE FUNCTION quality_action_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status='VERIFIED' THEN RAISE EXCEPTION 'NON_CONFORMITY_IMMUTABLE'; END IF; RETURN NEW; END $$;
CREATE TRIGGER corrective_action_immutable BEFORE UPDATE ON corrective_actions FOR EACH ROW EXECUTE FUNCTION quality_action_guard();
CREATE TRIGGER inspections_no_delete BEFORE DELETE ON inspections FOR EACH ROW EXECUTE FUNCTION quality_no_delete();
CREATE TRIGGER inspection_requests_no_delete BEFORE DELETE ON inspection_requests FOR EACH ROW EXECUTE FUNCTION quality_no_delete();
CREATE TRIGGER non_conformities_no_delete BEFORE DELETE ON non_conformities FOR EACH ROW EXECUTE FUNCTION quality_no_delete();
CREATE TRIGGER corrective_actions_no_delete BEFORE DELETE ON corrective_actions FOR EACH ROW EXECUTE FUNCTION quality_no_delete();
CREATE TRIGGER non_conformity_events_no_delete BEFORE DELETE ON non_conformity_events FOR EACH ROW EXECUTE FUNCTION quality_no_delete();
CREATE TRIGGER non_conformity_comments_no_delete BEFORE DELETE ON non_conformity_comments FOR EACH ROW EXECUTE FUNCTION quality_no_delete();
CREATE TRIGGER non_conformity_events_no_update BEFORE UPDATE ON non_conformity_events FOR EACH ROW EXECUTE FUNCTION quality_no_delete();
CREATE TRIGGER non_conformity_comments_no_update BEFORE UPDATE ON non_conformity_comments FOR EACH ROW EXECUTE FUNCTION quality_no_delete();
