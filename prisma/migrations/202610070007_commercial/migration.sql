-- CreateEnum
CREATE TYPE "SupplierType" AS ENUM ('SUPPLIER', 'SUBCONTRACTOR', 'CONSULTANT', 'SERVICE_PROVIDER', 'OTHER');

-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('CONSTRUCTION', 'SUBCONTRACT', 'SUPPLY', 'SERVICE', 'CONSULTANCY', 'OTHER');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'TERMINATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AmendmentType" AS ENUM ('ADDITION', 'OMISSION', 'TIME_EXTENSION', 'OTHER');

-- CreateEnum
CREATE TYPE "CommercialApproval" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "CostCenterStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ExpenseDocumentType" AS ENUM ('INVOICE', 'RECEIPT', 'DELIVERY_NOTE', 'PURCHASE_ORDER', 'OTHER');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "contract_id" UUID,
ADD COLUMN     "expense_id" UUID,
ALTER COLUMN "daily_log_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organization_id" UUID,
    "supplier_type" "SupplierType" NOT NULL,
    "legal_name" VARCHAR(200) NOT NULL,
    "trade_name" TEXT,
    "tax_number" VARCHAR(50),
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "contact_person" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "contract_number" VARCHAR(100) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "contract_type" "ContractType" NOT NULL,
    "original_value" DECIMAL(18,2) NOT NULL,
    "current_value" DECIMAL(18,2) NOT NULL,
    "retention_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "advance_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "advance_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "advance_recovered_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "start_date" DATE,
    "end_date" DATE,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "amendment_sequence" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "budget_item_id" UUID,
    "code" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL(18,4),
    "unit_price" DECIMAL(18,2),
    "total_value" DECIMAL(18,2) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "contract_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_amendments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "amendment_number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "amendment_type" "AmendmentType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "CommercialApproval" NOT NULL DEFAULT 'DRAFT',
    "effective_date" DATE,
    "submitted_by" UUID,
    "submitted_at" TIMESTAMPTZ(6),
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

    CONSTRAINT "contract_amendments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parent_id" UUID,
    "status" "CostCenterStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "expense_number" VARCHAR(100) NOT NULL,
    "supplier_id" UUID,
    "contract_id" UUID,
    "budget_item_id" UUID,
    "cost_center_id" UUID NOT NULL,
    "expense_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "document_number" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_by" UUID,
    "submitted_at" TIMESTAMPTZ(6),
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

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_reversals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "expense_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "expense_reversals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "expense_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "document_type" "ExpenseDocumentType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "expense_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "contract_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_status_idx" ON "suppliers"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_id_key" ON "suppliers"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_organization_id_key" ON "suppliers"("tenant_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_tax_number_key" ON "suppliers"("tenant_id", "tax_number");

-- CreateIndex
CREATE INDEX "contracts_tenant_id_project_id_status_idx" ON "contracts"("tenant_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "contracts_tenant_id_supplier_id_idx" ON "contracts"("tenant_id", "supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_tenant_id_project_id_id_key" ON "contracts"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_tenant_id_project_id_contract_number_key" ON "contracts"("tenant_id", "project_id", "contract_number");

-- CreateIndex
CREATE INDEX "contract_items_tenant_id_project_id_contract_id_idx" ON "contract_items"("tenant_id", "project_id", "contract_id");

-- CreateIndex
CREATE INDEX "contract_items_tenant_id_project_id_budget_item_id_idx" ON "contract_items"("tenant_id", "project_id", "budget_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_items_tenant_id_project_id_id_key" ON "contract_items"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "contract_amendments_tenant_id_project_id_contract_id_status_idx" ON "contract_amendments"("tenant_id", "project_id", "contract_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "contract_amendments_tenant_id_project_id_id_key" ON "contract_amendments"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_amendments_contract_id_amendment_number_key" ON "contract_amendments"("contract_id", "amendment_number");

-- CreateIndex
CREATE INDEX "cost_centers_tenant_id_project_id_parent_id_idx" ON "cost_centers"("tenant_id", "project_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_tenant_id_project_id_id_key" ON "cost_centers"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_project_id_code_key" ON "cost_centers"("project_id", "code");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_project_id_expense_date_idx" ON "expenses"("tenant_id", "project_id", "expense_date");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_project_id_status_idx" ON "expenses"("tenant_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_project_id_supplier_id_idx" ON "expenses"("tenant_id", "project_id", "supplier_id");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_project_id_contract_id_idx" ON "expenses"("tenant_id", "project_id", "contract_id");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_project_id_cost_center_id_idx" ON "expenses"("tenant_id", "project_id", "cost_center_id");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_project_id_budget_item_id_idx" ON "expenses"("tenant_id", "project_id", "budget_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_tenant_id_project_id_id_key" ON "expenses"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_tenant_id_project_id_expense_number_key" ON "expenses"("tenant_id", "project_id", "expense_number");

-- CreateIndex
CREATE UNIQUE INDEX "expense_reversals_expense_id_key" ON "expense_reversals"("expense_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_reversals_tenant_id_project_id_id_key" ON "expense_reversals"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_documents_document_id_key" ON "expense_documents"("document_id");

-- CreateIndex
CREATE INDEX "expense_documents_tenant_id_project_id_expense_id_idx" ON "expense_documents"("tenant_id", "project_id", "expense_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_documents_tenant_id_project_id_id_key" ON "expense_documents"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_documents_document_id_key" ON "contract_documents"("document_id");

-- CreateIndex
CREATE INDEX "contract_documents_tenant_id_project_id_contract_id_idx" ON "contract_documents"("tenant_id", "project_id", "contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_documents_tenant_id_project_id_id_key" ON "contract_documents"("tenant_id", "project_id", "id");

-- Composite ownership keys prohibit cross-project and cross-tenant links.
ALTER TABLE suppliers ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE suppliers ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE suppliers ADD FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE contracts ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE contracts ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE contracts ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE contracts ADD FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE contract_items ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE contract_items ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE contract_items ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE contract_items ADD FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE contract_amendments ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE contract_amendments ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE contract_amendments ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE contract_amendments ADD FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE cost_centers ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE cost_centers ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE cost_centers ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE cost_centers ADD FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE expenses ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE expenses ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE expenses ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE expenses ADD FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE expense_reversals ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE expense_reversals ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE expense_reversals ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE expense_reversals ADD FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE expense_documents ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE expense_documents ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE expense_documents ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE expense_documents ADD FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE contract_documents ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE contract_documents ADD FOREIGN KEY (tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE contract_documents ADD FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE contract_documents ADD FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE suppliers ADD FOREIGN KEY (tenant_id,organization_id) REFERENCES organizations(tenant_id,id);
ALTER TABLE contracts ADD FOREIGN KEY (tenant_id,supplier_id) REFERENCES suppliers(tenant_id,id);
ALTER TABLE expenses ADD FOREIGN KEY (tenant_id,supplier_id) REFERENCES suppliers(tenant_id,id);
ALTER TABLE contract_items ADD FOREIGN KEY (tenant_id,project_id,contract_id) REFERENCES contracts(tenant_id,project_id,id);
ALTER TABLE contract_items ADD FOREIGN KEY (tenant_id,project_id,budget_item_id) REFERENCES budget_items(tenant_id,project_id,id);
ALTER TABLE contract_amendments ADD FOREIGN KEY (tenant_id,project_id,contract_id) REFERENCES contracts(tenant_id,project_id,id);
ALTER TABLE cost_centers ADD FOREIGN KEY (tenant_id,project_id,parent_id) REFERENCES cost_centers(tenant_id,project_id,id);
ALTER TABLE expenses ADD FOREIGN KEY (tenant_id,project_id,contract_id) REFERENCES contracts(tenant_id,project_id,id);
ALTER TABLE expenses ADD FOREIGN KEY (tenant_id,project_id,budget_item_id) REFERENCES budget_items(tenant_id,project_id,id);
ALTER TABLE expenses ADD FOREIGN KEY (tenant_id,project_id,cost_center_id) REFERENCES cost_centers(tenant_id,project_id,id);
ALTER TABLE expense_reversals ADD FOREIGN KEY (tenant_id,project_id,expense_id) REFERENCES expenses(tenant_id,project_id,id);
ALTER TABLE expense_documents ADD FOREIGN KEY (tenant_id,project_id,expense_id) REFERENCES expenses(tenant_id,project_id,id);
ALTER TABLE expense_documents ADD FOREIGN KEY (tenant_id,project_id,document_id) REFERENCES documents(tenant_id,project_id,id);
ALTER TABLE contract_documents ADD FOREIGN KEY (tenant_id,project_id,contract_id) REFERENCES contracts(tenant_id,project_id,id);
ALTER TABLE contract_documents ADD FOREIGN KEY (tenant_id,project_id,document_id) REFERENCES documents(tenant_id,project_id,id);
ALTER TABLE documents ADD FOREIGN KEY (tenant_id,project_id,expense_id) REFERENCES expenses(tenant_id,project_id,id);
ALTER TABLE documents ADD FOREIGN KEY (tenant_id,project_id,contract_id) REFERENCES contracts(tenant_id,project_id,id);
ALTER TABLE documents ADD CONSTRAINT document_single_owner CHECK (num_nonnulls(daily_log_id,expense_id,contract_id)=1);
ALTER TABLE contracts ADD CHECK (original_value>=0 AND current_value>=0 AND retention_percentage BETWEEN 0 AND 100 AND advance_percentage BETWEEN 0 AND 100 AND advance_amount BETWEEN 0 AND original_value AND advance_recovered_amount BETWEEN 0 AND advance_amount AND (end_date IS NULL OR start_date IS NULL OR end_date>=start_date));
ALTER TABLE expenses ADD CHECK (subtotal>=0 AND tax_amount>=0 AND total_amount=subtotal+tax_amount);
ALTER TABLE contract_items ADD CHECK (total_value>=0 AND ((quantity IS NULL AND unit_price IS NULL) OR (quantity>=0 AND unit_price>=0 AND total_value=round(quantity*unit_price,2))));
ALTER TABLE contract_amendments ADD CHECK ((amendment_type IN ('ADDITION','OMISSION') AND amount>0) OR (amendment_type IN ('TIME_EXTENSION','OTHER') AND amount=0));
CREATE FUNCTION commercial_contract_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' AND OLD.status<>'DRAFT' THEN RAISE EXCEPTION 'CONTRACT_IMMUTABLE'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.original_value<>OLD.original_value THEN RAISE EXCEPTION 'CONTRACT_IMMUTABLE'; END IF;
  IF OLD.status<>'DRAFT' AND (to_jsonb(NEW)-ARRAY['status','current_value','version','updated_at','updated_by','amendment_sequence']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','current_value','version','updated_at','updated_by','amendment_sequence']) THEN RAISE EXCEPTION 'CONTRACT_IMMUTABLE'; END IF;
  RETURN NEW;
 END IF; RETURN OLD;
END $$;
CREATE TRIGGER commercial_contract_guard BEFORE UPDATE OR DELETE ON contracts FOR EACH ROW EXECUTE FUNCTION commercial_contract_guard();
CREATE FUNCTION commercial_approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status::text IN ('APPROVED','REVERSED') THEN
  IF TG_OP='UPDATE' AND TG_TABLE_NAME='expenses' AND OLD.status::text='APPROVED' AND NEW.status::text='REVERSED' AND (to_jsonb(NEW)-ARRAY['status','version','updated_at','updated_by'])=(to_jsonb(OLD)-ARRAY['status','version','updated_at','updated_by']) AND EXISTS(SELECT 1 FROM expense_reversals WHERE expense_id=OLD.id) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'COMMERCIAL_RECORD_IMMUTABLE';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER commercial_amendment_guard BEFORE UPDATE OR DELETE ON contract_amendments FOR EACH ROW EXECUTE FUNCTION commercial_approval_guard();
CREATE TRIGGER commercial_expense_guard BEFORE UPDATE OR DELETE ON expenses FOR EACH ROW EXECUTE FUNCTION commercial_approval_guard();
CREATE FUNCTION commercial_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE cid uuid; st text; BEGIN
 IF TG_OP='DELETE' THEN cid=OLD.contract_id; ELSE cid=NEW.contract_id; END IF;
 SELECT status::text INTO st FROM contracts WHERE id=cid FOR UPDATE;
 IF st<>'DRAFT' THEN RAISE EXCEPTION 'CONTRACT_IMMUTABLE'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER commercial_item_guard BEFORE INSERT OR UPDATE OR DELETE ON contract_items FOR EACH ROW EXECUTE FUNCTION commercial_item_guard();
CREATE FUNCTION commercial_reversal_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'REVERSAL_IMMUTABLE'; END $$;
CREATE TRIGGER commercial_reversal_guard BEFORE UPDATE OR DELETE ON expense_reversals FOR EACH ROW EXECUTE FUNCTION commercial_reversal_guard();
