-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BudgetItemType" AS ENUM ('GROUP', 'ITEM');

-- CreateEnum
CREATE TYPE "BudgetRevisionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BudgetImportStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'READY', 'FAILED', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BudgetRowStatus" AS ENUM ('VALID', 'INVALID', 'WARNING');

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "BudgetStatus" NOT NULL DEFAULT 'ACTIVE',
    "revision_sequence" INTEGER NOT NULL DEFAULT -1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "budget_id" UUID NOT NULL,
    "parent_id" UUID,
    "code" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "item_type" "BudgetItemType" NOT NULL,
    "unit" VARCHAR(30),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "budget_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_revisions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "budget_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "description" TEXT,
    "status" "BudgetRevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_by" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "rejected_by" UUID,
    "rejected_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,

    CONSTRAINT "budget_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_revision_values" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "budget_id" UUID NOT NULL,
    "budget_revision_id" UUID NOT NULL,
    "budget_item_id" UUID NOT NULL,
    "parent_id" UUID,
    "code" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "item_type" "BudgetItemType" NOT NULL,
    "unit" VARCHAR(30),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "quantity" DECIMAL(18,4),
    "unit_price" DECIMAL(18,2),
    "total_value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "budget_revision_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_import_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "budget_id" UUID,
    "file_name" TEXT NOT NULL,
    "file_storage_key" TEXT NOT NULL,
    "file_checksum" TEXT NOT NULL,
    "status" "BudgetImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "mapping" JSONB,
    "headers" JSONB,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "invalid_rows" INTEGER NOT NULL DEFAULT 0,
    "preview_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "confirmed_at" TIMESTAMPTZ(6),
    "confirmed_revision_id" UUID,
    "error_message" TEXT,

    CONSTRAINT "budget_import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_import_rows" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "import_job_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "unit" TEXT,
    "quantity" DECIMAL(18,4),
    "unit_price" DECIMAL(18,2),
    "parent_code" TEXT,
    "item_type" "BudgetItemType" NOT NULL DEFAULT 'ITEM',
    "status" "BudgetRowStatus" NOT NULL,
    "errors" JSONB,
    "raw_data" JSONB NOT NULL,

    CONSTRAINT "budget_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budgets_tenant_id_project_id_idx" ON "budgets"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_tenant_id_project_id_id_key" ON "budgets"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "budget_items_tenant_id_project_id_budget_id_parent_id_idx" ON "budget_items"("tenant_id", "project_id", "budget_id", "parent_id");

-- CreateIndex
CREATE INDEX "budget_items_budget_id_code_idx" ON "budget_items"("budget_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "budget_items_tenant_id_budget_id_id_key" ON "budget_items"("tenant_id", "budget_id", "id");

-- CreateIndex
CREATE INDEX "budget_revisions_tenant_id_budget_id_status_idx" ON "budget_revisions"("tenant_id", "budget_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "budget_revisions_budget_id_revision_number_key" ON "budget_revisions"("budget_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "budget_revisions_tenant_id_budget_id_id_key" ON "budget_revisions"("tenant_id", "budget_id", "id");

-- CreateIndex
CREATE INDEX "budget_revision_values_tenant_id_budget_id_budget_revision__idx" ON "budget_revision_values"("tenant_id", "budget_id", "budget_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_revision_values_budget_revision_id_budget_item_id_key" ON "budget_revision_values"("budget_revision_id", "budget_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_revision_values_budget_revision_id_code_key" ON "budget_revision_values"("budget_revision_id", "code");

-- CreateIndex
CREATE INDEX "budget_import_jobs_tenant_id_project_id_status_idx" ON "budget_import_jobs"("tenant_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "budget_import_jobs_tenant_id_id_key" ON "budget_import_jobs"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "budget_import_rows_tenant_id_import_job_id_status_idx" ON "budget_import_rows"("tenant_id", "import_job_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "budget_import_rows_import_job_id_row_number_key" ON "budget_import_rows"("import_job_id", "row_number");

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_tenant_id_project_id_fkey" FOREIGN KEY ("tenant_id", "project_id") REFERENCES "projects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_tenant_id_project_id_budget_id_fkey" FOREIGN KEY ("tenant_id", "project_id", "budget_id") REFERENCES "budgets"("tenant_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_revisions" ADD CONSTRAINT "budget_revisions_tenant_id_project_id_budget_id_fkey" FOREIGN KEY ("tenant_id", "project_id", "budget_id") REFERENCES "budgets"("tenant_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_revision_values" ADD CONSTRAINT "budget_revision_values_tenant_id_budget_id_budget_revision_fkey" FOREIGN KEY ("tenant_id", "budget_id", "budget_revision_id") REFERENCES "budget_revisions"("tenant_id", "budget_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_revision_values" ADD CONSTRAINT "budget_revision_values_tenant_id_budget_id_budget_item_id_fkey" FOREIGN KEY ("tenant_id", "budget_id", "budget_item_id") REFERENCES "budget_items"("tenant_id", "budget_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_import_jobs" ADD CONSTRAINT "budget_import_jobs_tenant_id_project_id_budget_id_fkey" FOREIGN KEY ("tenant_id", "project_id", "budget_id") REFERENCES "budgets"("tenant_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_import_rows" ADD CONSTRAINT "budget_import_rows_tenant_id_import_job_id_fkey" FOREIGN KEY ("tenant_id", "import_job_id") REFERENCES "budget_import_jobs"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
