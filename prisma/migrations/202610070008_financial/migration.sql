-- CreateEnum
CREATE TYPE "MeasurementStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'FISCAL_REVIEW', 'FISCAL_REJECTED', 'APPROVAL_REVIEW', 'APPROVED', 'CERTIFIED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdvanceRecoveryMethod" AS ENUM ('PERCENTAGE', 'FIXED', 'MANUAL');

-- CreateEnum
CREATE TYPE "RetentionTransactionType" AS ENUM ('WITHHELD', 'RELEASED', 'REVERSED');

-- CreateEnum
CREATE TYPE "AdvanceTransactionType" AS ENUM ('ADVANCE_GRANTED', 'ADVANCE_RECOVERED', 'ADVANCE_REVERSED');

-- CreateEnum
CREATE TYPE "RetentionReleaseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "MeasurementDeductionType" AS ENUM ('PENALTY', 'ADVANCE_RECOVERY', 'OTHER');

-- CreateEnum
CREATE TYPE "MeasurementReviewType" AS ENUM ('FISCAL', 'CLIENT', 'FINANCIER', 'ADMIN');

-- CreateEnum
CREATE TYPE "MeasurementDecision" AS ENUM ('APPROVED', 'REJECTED', 'REQUEST_CHANGES');

-- CreateEnum
CREATE TYPE "FundingAgreementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DisbursementRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_DISBURSED', 'DISBURSED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinancialPostingStatus" AS ENUM ('POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'CHEQUE', 'MOBILE_MONEY', 'OTHER');

-- CreateEnum
CREATE TYPE "FinancialDocumentType" AS ENUM ('MEASUREMENT_SHEET', 'CERTIFICATE', 'INVOICE', 'PAYMENT_PROOF', 'DISBURSEMENT_PROOF', 'OTHER');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "funding_agreement_id" UUID,
ADD COLUMN     "measurement_id" UUID,
ADD COLUMN     "payment_id" UUID;

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "advance_recovery_fixed_amount" DECIMAL(18,2),
ADD COLUMN     "advance_recovery_method" "AdvanceRecoveryMethod" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "advance_recovery_percentage" DECIMAL(5,2),
ADD COLUMN     "final_approval_role" "Role" NOT NULL DEFAULT 'FINANCIER',
ADD COLUMN     "measurement_sequence" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "measurements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "measurement_number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "description" TEXT,
    "status" "MeasurementStatus" NOT NULL DEFAULT 'DRAFT',
    "gross_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "retention_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "advance_recovery_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "other_deductions_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "net_certified_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "manual_advance_recovery" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "submitted_by" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "fiscal_reviewed_by" UUID,
    "fiscal_reviewed_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "certified_by" UUID,
    "certified_at" TIMESTAMPTZ(6),
    "rejected_by" UUID,
    "rejected_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "measurement_id" UUID NOT NULL,
    "contract_item_id" UUID NOT NULL,
    "budget_item_id" UUID,
    "description" TEXT NOT NULL,
    "unit" TEXT,
    "contract_quantity" DECIMAL(18,4) NOT NULL,
    "previous_quantity" DECIMAL(18,4) NOT NULL,
    "current_quantity" DECIMAL(18,4) NOT NULL,
    "cumulative_quantity" DECIMAL(18,4) NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "previous_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "current_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cumulative_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "measurement_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_transactions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "measurement_id" UUID,
    "retention_release_id" UUID,
    "type" "RetentionTransactionType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "retention_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advance_transactions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "measurement_id" UUID,
    "retention_release_id" UUID,
    "type" "AdvanceTransactionType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "advance_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_releases" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RetentionReleaseStatus" NOT NULL DEFAULT 'DRAFT',
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "retention_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_deductions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "measurement_id" UUID NOT NULL,
    "type" "MeasurementDeductionType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "measurement_deductions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_reviews" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "measurement_id" UUID NOT NULL,
    "review_type" "MeasurementReviewType" NOT NULL,
    "decision" "MeasurementDecision" NOT NULL,
    "comments" TEXT,
    "reviewed_by" UUID NOT NULL,
    "reviewed_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "measurement_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_transitions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "measurement_id" UUID NOT NULL,
    "from_status" "MeasurementStatus" NOT NULL,
    "to_status" "MeasurementStatus" NOT NULL,
    "comments" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "measurement_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_reversals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "measurement_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "measurement_reversals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funding_agreements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "financier_organization_id" UUID NOT NULL,
    "agreement_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "approved_amount" DECIMAL(18,2) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "FundingAgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "request_sequence" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "funding_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disbursement_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "funding_agreement_id" UUID NOT NULL,
    "measurement_id" UUID,
    "request_number" INTEGER NOT NULL,
    "requested_amount" DECIMAL(18,2) NOT NULL,
    "approved_amount" DECIMAL(18,2),
    "disbursed_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "DisbursementRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "rejected_by" UUID,
    "rejected_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "disbursement_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disbursements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "funding_agreement_id" UUID NOT NULL,
    "disbursement_request_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "disbursement_date" DATE NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "status" "FinancialPostingStatus" NOT NULL DEFAULT 'POSTED',
    "reversal_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "disbursements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "contract_id" UUID,
    "measurement_id" UUID,
    "expense_id" UUID,
    "retention_release_id" UUID,
    "payment_number" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "status" "FinancialPostingStatus" NOT NULL DEFAULT 'POSTED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_reversals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "payment_reversals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_operations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "result" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "financial_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_baselines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "source" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "financial_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurement_documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "measurement_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "document_type" "FinancialDocumentType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "measurement_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funding_documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "funding_agreement_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "document_type" "FinancialDocumentType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "funding_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "document_type" "FinancialDocumentType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "payment_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "measurements_tenant_id_project_id_status_created_at_idx" ON "measurements"("tenant_id", "project_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "measurements_tenant_id_project_id_contract_id_status_idx" ON "measurements"("tenant_id", "project_id", "contract_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "measurements_tenant_id_project_id_id_key" ON "measurements"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "measurements_contract_id_measurement_number_key" ON "measurements"("contract_id", "measurement_number");

-- CreateIndex
CREATE INDEX "measurement_items_tenant_id_project_id_measurement_id_idx" ON "measurement_items"("tenant_id", "project_id", "measurement_id");

-- CreateIndex
CREATE INDEX "measurement_items_tenant_id_project_id_contract_item_id_idx" ON "measurement_items"("tenant_id", "project_id", "contract_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_items_tenant_id_project_id_id_key" ON "measurement_items"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_items_measurement_id_contract_item_id_key" ON "measurement_items"("measurement_id", "contract_item_id");

-- CreateIndex
CREATE INDEX "retention_transactions_tenant_id_project_id_contract_id_typ_idx" ON "retention_transactions"("tenant_id", "project_id", "contract_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "retention_transactions_tenant_id_project_id_id_key" ON "retention_transactions"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "retention_transactions_measurement_id_type_key" ON "retention_transactions"("measurement_id", "type");

-- CreateIndex
CREATE INDEX "advance_transactions_tenant_id_project_id_contract_id_type_idx" ON "advance_transactions"("tenant_id", "project_id", "contract_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "advance_transactions_tenant_id_project_id_id_key" ON "advance_transactions"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "advance_transactions_measurement_id_type_key" ON "advance_transactions"("measurement_id", "type");

-- CreateIndex
CREATE INDEX "retention_releases_tenant_id_project_id_contract_id_status_idx" ON "retention_releases"("tenant_id", "project_id", "contract_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "retention_releases_tenant_id_project_id_id_key" ON "retention_releases"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "measurement_deductions_tenant_id_project_id_measurement_id_idx" ON "measurement_deductions"("tenant_id", "project_id", "measurement_id");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_deductions_tenant_id_project_id_id_key" ON "measurement_deductions"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "measurement_reviews_tenant_id_project_id_measurement_id_cre_idx" ON "measurement_reviews"("tenant_id", "project_id", "measurement_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_reviews_tenant_id_project_id_id_key" ON "measurement_reviews"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "measurement_transitions_tenant_id_project_id_measurement_id_idx" ON "measurement_transitions"("tenant_id", "project_id", "measurement_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_transitions_tenant_id_project_id_id_key" ON "measurement_transitions"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_reversals_tenant_id_project_id_id_key" ON "measurement_reversals"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_reversals_measurement_id_key" ON "measurement_reversals"("measurement_id");

-- CreateIndex
CREATE INDEX "funding_agreements_tenant_id_project_id_status_idx" ON "funding_agreements"("tenant_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "funding_agreements_tenant_id_project_id_id_key" ON "funding_agreements"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "funding_agreements_tenant_id_project_id_agreement_number_key" ON "funding_agreements"("tenant_id", "project_id", "agreement_number");

-- CreateIndex
CREATE INDEX "disbursement_requests_tenant_id_project_id_funding_agreemen_idx" ON "disbursement_requests"("tenant_id", "project_id", "funding_agreement_id", "status");

-- CreateIndex
CREATE INDEX "disbursement_requests_tenant_id_project_id_measurement_id_idx" ON "disbursement_requests"("tenant_id", "project_id", "measurement_id");

-- CreateIndex
CREATE UNIQUE INDEX "disbursement_requests_tenant_id_project_id_id_key" ON "disbursement_requests"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "disbursement_requests_funding_agreement_id_request_number_key" ON "disbursement_requests"("funding_agreement_id", "request_number");

-- CreateIndex
CREATE INDEX "disbursements_tenant_id_project_id_funding_agreement_id_sta_idx" ON "disbursements"("tenant_id", "project_id", "funding_agreement_id", "status");

-- CreateIndex
CREATE INDEX "disbursements_tenant_id_project_id_disbursement_request_id_idx" ON "disbursements"("tenant_id", "project_id", "disbursement_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "disbursements_tenant_id_project_id_id_key" ON "disbursements"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_project_id_payment_date_idx" ON "payments"("tenant_id", "project_id", "payment_date");

-- CreateIndex
CREATE INDEX "payments_tenant_id_project_id_measurement_id_status_idx" ON "payments"("tenant_id", "project_id", "measurement_id", "status");

-- CreateIndex
CREATE INDEX "payments_tenant_id_project_id_expense_id_status_idx" ON "payments"("tenant_id", "project_id", "expense_id", "status");

-- CreateIndex
CREATE INDEX "payments_tenant_id_project_id_retention_release_id_status_idx" ON "payments"("tenant_id", "project_id", "retention_release_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_project_id_id_key" ON "payments"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_project_id_payment_number_key" ON "payments"("tenant_id", "project_id", "payment_number");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reversals_tenant_id_project_id_id_key" ON "payment_reversals"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reversals_payment_id_key" ON "payment_reversals"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_operations_tenant_id_project_id_id_key" ON "financial_operations"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_operations_tenant_id_project_id_created_by_key_key" ON "financial_operations"("tenant_id", "project_id", "created_by", "key");

-- CreateIndex
CREATE UNIQUE INDEX "financial_baselines_tenant_id_project_id_id_key" ON "financial_baselines"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_baselines_tenant_id_project_id_key" ON "financial_baselines"("tenant_id", "project_id");

-- CreateIndex
CREATE INDEX "measurement_documents_tenant_id_project_id_measurement_id_idx" ON "measurement_documents"("tenant_id", "project_id", "measurement_id");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_documents_tenant_id_project_id_id_key" ON "measurement_documents"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "measurement_documents_document_id_key" ON "measurement_documents"("document_id");

-- CreateIndex
CREATE INDEX "funding_documents_tenant_id_project_id_funding_agreement_id_idx" ON "funding_documents"("tenant_id", "project_id", "funding_agreement_id");

-- CreateIndex
CREATE UNIQUE INDEX "funding_documents_tenant_id_project_id_id_key" ON "funding_documents"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "funding_documents_document_id_key" ON "funding_documents"("document_id");

-- CreateIndex
CREATE INDEX "payment_documents_tenant_id_project_id_payment_id_idx" ON "payment_documents"("tenant_id", "project_id", "payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_documents_tenant_id_project_id_id_key" ON "payment_documents"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_documents_document_id_key" ON "payment_documents"("document_id");

ALTER TABLE measurements ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE measurements ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE measurements ADD FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE measurement_items ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE measurement_items ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE measurement_items ADD FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE retention_transactions ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE retention_transactions ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE retention_transactions ADD FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE advance_transactions ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE advance_transactions ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE advance_transactions ADD FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE retention_releases ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE retention_releases ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE retention_releases ADD FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE measurement_deductions ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE measurement_deductions ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE measurement_deductions ADD FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE measurement_reviews ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE measurement_reviews ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE measurement_reviews ADD FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE measurement_transitions ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE measurement_transitions ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE measurement_transitions ADD FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE measurement_reversals ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE measurement_reversals ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE measurement_reversals ADD FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE funding_agreements ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE funding_agreements ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE funding_agreements ADD FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE disbursement_requests ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE disbursement_requests ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE disbursement_requests ADD FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE disbursements ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE disbursements ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE disbursements ADD FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE payments ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE payments ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE payments ADD FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE payment_reversals ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE payment_reversals ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE payment_reversals ADD FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE financial_operations ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE financial_operations ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE financial_operations ADD FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE financial_baselines ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE financial_baselines ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE financial_baselines ADD FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE measurement_documents ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE measurement_documents ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE measurement_documents ADD FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE funding_documents ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE funding_documents ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE funding_documents ADD FOREIGN KEY (updated_by) REFERENCES users(id);

ALTER TABLE payment_documents ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE payment_documents ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE payment_documents ADD FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE measurements ADD FOREIGN KEY (tenant_id,project_id,contract_id) REFERENCES contracts(tenant_id,project_id,id);
ALTER TABLE measurement_items ADD FOREIGN KEY (tenant_id,project_id,measurement_id) REFERENCES measurements(tenant_id,project_id,id);
ALTER TABLE measurement_items ADD FOREIGN KEY (tenant_id,project_id,contract_item_id) REFERENCES contract_items(tenant_id,project_id,id);
ALTER TABLE measurement_items ADD FOREIGN KEY (tenant_id,project_id,budget_item_id) REFERENCES budget_items(tenant_id,project_id,id);
ALTER TABLE retention_transactions ADD FOREIGN KEY (tenant_id,project_id,contract_id) REFERENCES contracts(tenant_id,project_id,id);
ALTER TABLE retention_transactions ADD FOREIGN KEY (tenant_id,project_id,measurement_id) REFERENCES measurements(tenant_id,project_id,id);
ALTER TABLE retention_transactions ADD FOREIGN KEY (tenant_id,project_id,retention_release_id) REFERENCES retention_releases(tenant_id,project_id,id);
ALTER TABLE advance_transactions ADD FOREIGN KEY (tenant_id,project_id,contract_id) REFERENCES contracts(tenant_id,project_id,id);
ALTER TABLE advance_transactions ADD FOREIGN KEY (tenant_id,project_id,measurement_id) REFERENCES measurements(tenant_id,project_id,id);
ALTER TABLE advance_transactions ADD FOREIGN KEY (tenant_id,project_id,retention_release_id) REFERENCES retention_releases(tenant_id,project_id,id);
ALTER TABLE retention_releases ADD FOREIGN KEY (tenant_id,project_id,contract_id) REFERENCES contracts(tenant_id,project_id,id);
ALTER TABLE measurement_deductions ADD FOREIGN KEY (tenant_id,project_id,measurement_id) REFERENCES measurements(tenant_id,project_id,id);
ALTER TABLE measurement_reviews ADD FOREIGN KEY (tenant_id,project_id,measurement_id) REFERENCES measurements(tenant_id,project_id,id);
ALTER TABLE measurement_transitions ADD FOREIGN KEY (tenant_id,project_id,measurement_id) REFERENCES measurements(tenant_id,project_id,id);
ALTER TABLE measurement_reversals ADD FOREIGN KEY (tenant_id,project_id,measurement_id) REFERENCES measurements(tenant_id,project_id,id);
ALTER TABLE disbursement_requests ADD FOREIGN KEY (tenant_id,project_id,measurement_id) REFERENCES measurements(tenant_id,project_id,id);
ALTER TABLE disbursement_requests ADD FOREIGN KEY (tenant_id,project_id,funding_agreement_id) REFERENCES funding_agreements(tenant_id,project_id,id);
ALTER TABLE disbursements ADD FOREIGN KEY (tenant_id,project_id,funding_agreement_id) REFERENCES funding_agreements(tenant_id,project_id,id);
ALTER TABLE disbursements ADD FOREIGN KEY (tenant_id,project_id,disbursement_request_id) REFERENCES disbursement_requests(tenant_id,project_id,id);
ALTER TABLE payments ADD FOREIGN KEY (tenant_id,project_id,contract_id) REFERENCES contracts(tenant_id,project_id,id);
ALTER TABLE payments ADD FOREIGN KEY (tenant_id,project_id,measurement_id) REFERENCES measurements(tenant_id,project_id,id);
ALTER TABLE payments ADD FOREIGN KEY (tenant_id,project_id,retention_release_id) REFERENCES retention_releases(tenant_id,project_id,id);
ALTER TABLE payments ADD FOREIGN KEY (tenant_id,project_id,expense_id) REFERENCES expenses(tenant_id,project_id,id);
ALTER TABLE payment_reversals ADD FOREIGN KEY (tenant_id,project_id,payment_id) REFERENCES payments(tenant_id,project_id,id);
ALTER TABLE measurement_documents ADD FOREIGN KEY (tenant_id,project_id,measurement_id) REFERENCES measurements(tenant_id,project_id,id);
ALTER TABLE measurement_documents ADD FOREIGN KEY (tenant_id,project_id,document_id) REFERENCES documents(tenant_id,project_id,id);
ALTER TABLE funding_documents ADD FOREIGN KEY (tenant_id,project_id,funding_agreement_id) REFERENCES funding_agreements(tenant_id,project_id,id);
ALTER TABLE funding_documents ADD FOREIGN KEY (tenant_id,project_id,document_id) REFERENCES documents(tenant_id,project_id,id);
ALTER TABLE payment_documents ADD FOREIGN KEY (tenant_id,project_id,payment_id) REFERENCES payments(tenant_id,project_id,id);
ALTER TABLE payment_documents ADD FOREIGN KEY (tenant_id,project_id,document_id) REFERENCES documents(tenant_id,project_id,id);
ALTER TABLE funding_agreements ADD FOREIGN KEY (tenant_id,financier_organization_id) REFERENCES organizations(tenant_id,id);
ALTER TABLE payments ADD FOREIGN KEY (tenant_id,supplier_id) REFERENCES suppliers(tenant_id,id);
ALTER TABLE payments ADD CHECK (num_nonnulls(measurement_id,expense_id,retention_release_id)=1 AND amount>0);
ALTER TABLE measurements ADD CHECK (period_end>=period_start AND gross_amount>=0 AND retention_amount>=0 AND advance_recovery_amount>=0 AND other_deductions_amount>=0 AND net_certified_amount=gross_amount-retention_amount-advance_recovery_amount-other_deductions_amount AND net_certified_amount>=0);
ALTER TABLE measurement_items ADD CHECK (current_quantity>=0 AND previous_quantity>=0 AND cumulative_quantity=previous_quantity+current_quantity AND cumulative_quantity<=contract_quantity AND current_amount=round(current_quantity*unit_price,2) AND cumulative_amount=previous_amount+current_amount);
ALTER TABLE funding_agreements ADD CHECK (approved_amount>0 AND (end_date IS NULL OR end_date>=start_date));
ALTER TABLE disbursement_requests ADD CHECK (requested_amount>0 AND (approved_amount IS NULL OR approved_amount BETWEEN 0 AND requested_amount) AND disbursed_amount>=0 AND disbursed_amount<=coalesce(approved_amount,0));
ALTER TABLE disbursements ADD CHECK (amount>0);
ALTER TABLE retention_releases ADD CHECK (amount>0);
ALTER TABLE retention_transactions ADD CHECK (amount>=0);
ALTER TABLE advance_transactions ADD CHECK (amount>=0);
ALTER TABLE measurement_deductions ADD CHECK (amount>0);
CREATE UNIQUE INDEX advance_grant_once ON advance_transactions(contract_id) WHERE type='ADVANCE_GRANTED';
CREATE UNIQUE INDEX retention_release_once ON retention_transactions(retention_release_id) WHERE type='RELEASED';
ALTER TABLE documents DROP CONSTRAINT document_single_owner;
ALTER TABLE documents ADD CONSTRAINT document_single_owner CHECK(num_nonnulls(daily_log_id,expense_id,contract_id,measurement_id,funding_agreement_id,payment_id)=1);
ALTER TABLE documents ADD FOREIGN KEY (tenant_id,project_id,measurement_id) REFERENCES measurements(tenant_id,project_id,id);
ALTER TABLE documents ADD FOREIGN KEY (tenant_id,project_id,funding_agreement_id) REFERENCES funding_agreements(tenant_id,project_id,id);
ALTER TABLE documents ADD FOREIGN KEY (tenant_id,project_id,payment_id) REFERENCES payments(tenant_id,project_id,id);
CREATE OR REPLACE FUNCTION commercial_contract_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' AND OLD.status<>'DRAFT' THEN RAISE EXCEPTION 'CONTRACT_IMMUTABLE'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.original_value<>OLD.original_value THEN RAISE EXCEPTION 'CONTRACT_IMMUTABLE'; END IF;
  IF OLD.status<>'DRAFT' AND (to_jsonb(NEW)-ARRAY['status','current_value','version','updated_at','updated_by','amendment_sequence','measurement_sequence','advance_recovered_amount','advance_recovery_method','advance_recovery_percentage','advance_recovery_fixed_amount','final_approval_role']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','current_value','version','updated_at','updated_by','amendment_sequence','measurement_sequence','advance_recovered_amount','advance_recovery_method','advance_recovery_percentage','advance_recovery_fixed_amount','final_approval_role']) THEN RAISE EXCEPTION 'CONTRACT_IMMUTABLE'; END IF;
  RETURN NEW;
 END IF; RETURN OLD;
END $$;
CREATE FUNCTION financial_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FINANCIAL_RECORD_IMMUTABLE'; END $$;
CREATE FUNCTION financial_measurement_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status IN ('CERTIFIED','PARTIALLY_PAID','PAID','CANCELLED') THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'MEASUREMENT_IMMUTABLE'; END IF;
  IF (to_jsonb(NEW)-ARRAY['status','version','updated_at','updated_by']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updated_at','updated_by']) THEN RAISE EXCEPTION 'MEASUREMENT_IMMUTABLE'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER financial_measurement_guard BEFORE UPDATE OR DELETE ON measurements FOR EACH ROW EXECUTE FUNCTION financial_measurement_guard();
CREATE FUNCTION financial_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE mid uuid; st text; BEGIN
 IF TG_OP='DELETE' THEN mid=OLD.measurement_id; ELSE mid=NEW.measurement_id; END IF;
 SELECT status::text INTO st FROM measurements WHERE id=mid FOR UPDATE;
 IF st IN ('CERTIFIED','PARTIALLY_PAID','PAID','CANCELLED') THEN RAISE EXCEPTION 'MEASUREMENT_IMMUTABLE'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER financial_item_guard BEFORE INSERT OR UPDATE OR DELETE ON measurement_items FOR EACH ROW EXECUTE FUNCTION financial_item_guard();
CREATE TRIGGER financial_deduction_guard BEFORE INSERT OR UPDATE OR DELETE ON measurement_deductions FOR EACH ROW EXECUTE FUNCTION financial_item_guard();
CREATE FUNCTION financial_payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND OLD.status='POSTED' AND NEW.status='REVERSED' AND (to_jsonb(NEW)-ARRAY['status','version','updated_at','updated_by'])=(to_jsonb(OLD)-ARRAY['status','version','updated_at','updated_by']) AND EXISTS(SELECT 1 FROM payment_reversals WHERE payment_id=OLD.id) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'PAYMENT_IMMUTABLE';
END $$;
CREATE TRIGGER financial_payment_guard BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION financial_payment_guard();
CREATE TRIGGER immutable_retention_transactions BEFORE UPDATE OR DELETE ON retention_transactions FOR EACH ROW EXECUTE FUNCTION financial_append_only();
CREATE TRIGGER immutable_advance_transactions BEFORE UPDATE OR DELETE ON advance_transactions FOR EACH ROW EXECUTE FUNCTION financial_append_only();
CREATE TRIGGER immutable_measurement_reviews BEFORE UPDATE OR DELETE ON measurement_reviews FOR EACH ROW EXECUTE FUNCTION financial_append_only();
CREATE TRIGGER immutable_measurement_transitions BEFORE UPDATE OR DELETE ON measurement_transitions FOR EACH ROW EXECUTE FUNCTION financial_append_only();
CREATE TRIGGER immutable_measurement_reversals BEFORE UPDATE OR DELETE ON measurement_reversals FOR EACH ROW EXECUTE FUNCTION financial_append_only();
CREATE TRIGGER immutable_payment_reversals BEFORE UPDATE OR DELETE ON payment_reversals FOR EACH ROW EXECUTE FUNCTION financial_append_only();
CREATE TRIGGER immutable_financial_operations BEFORE UPDATE OR DELETE ON financial_operations FOR EACH ROW EXECUTE FUNCTION financial_append_only();
CREATE TRIGGER immutable_financial_baselines BEFORE UPDATE OR DELETE ON financial_baselines FOR EACH ROW EXECUTE FUNCTION financial_append_only();
