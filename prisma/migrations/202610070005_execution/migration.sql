-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WeightingMethod" AS ENUM ('MANUAL', 'BUDGET_VALUE');

-- CreateEnum
CREATE TYPE "ScheduleTaskType" AS ENUM ('SUMMARY', 'TASK', 'MILESTONE');

-- CreateEnum
CREATE TYPE "ScheduleTaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DependencyType" AS ENUM ('FS', 'SS', 'FF', 'SF');

-- CreateEnum
CREATE TYPE "DailyLogStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REOPENED');

-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('OPERATING', 'IDLE', 'BROKEN', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "OccurrenceType" AS ENUM ('GENERAL', 'DELAY', 'SAFETY', 'QUALITY', 'WEATHER', 'ACCESS', 'MATERIAL', 'EQUIPMENT', 'CLIENT', 'OTHER');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FileVisibility" AS ENUM ('INTERNAL', 'PROJECT_MEMBERS', 'CLIENT_VISIBLE', 'FINANCIER_VISIBLE', 'PUBLIC_PROJECT');

-- CreateTable
CREATE TABLE "schedules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "planned_start" DATE NOT NULL,
    "planned_end" DATE NOT NULL,
    "baseline_revision" INTEGER NOT NULL DEFAULT -1,
    "weighting_method" "WeightingMethod" NOT NULL DEFAULT 'MANUAL',
    "budget_revision_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_tasks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schedule_id" UUID NOT NULL,
    "parent_id" UUID,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "task_type" "ScheduleTaskType" NOT NULL,
    "planned_start" DATE NOT NULL,
    "planned_end" DATE NOT NULL,
    "actual_start" DATE,
    "actual_end" DATE,
    "duration_days" INTEGER NOT NULL,
    "actual_progress" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "weight" DECIMAL(10,6) NOT NULL DEFAULT 1,
    "budget_item_id" UUID,
    "status" "ScheduleTaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID NOT NULL,

    CONSTRAINT "schedule_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_dependencies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schedule_id" UUID NOT NULL,
    "predecessor_id" UUID NOT NULL,
    "successor_id" UUID NOT NULL,
    "dependency_type" "DependencyType" NOT NULL DEFAULT 'FS',
    "lag_days" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_baselines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schedule_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "description" TEXT,

    CONSTRAINT "schedule_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_baseline_tasks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "baseline_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" UUID,
    "planned_start" DATE NOT NULL,
    "planned_end" DATE NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "weight" DECIMAL(10,6) NOT NULL,

    CONSTRAINT "schedule_baseline_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_progress_updates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "task_id" UUID NOT NULL,
    "progress_date" DATE NOT NULL,
    "previous_progress" DECIMAL(5,2) NOT NULL,
    "new_progress" DECIMAL(5,2) NOT NULL,
    "notes" TEXT,
    "daily_log_id" UUID,

    CONSTRAINT "task_progress_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_progress_snapshots" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot_date" DATE NOT NULL,
    "planned_progress" DECIMAL(5,2) NOT NULL,
    "actual_progress" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "project_progress_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "log_date" DATE NOT NULL,
    "status" "DailyLogStatus" NOT NULL DEFAULT 'DRAFT',
    "weather_condition" TEXT,
    "weather_notes" TEXT,
    "temperature_min" DECIMAL(5,2),
    "temperature_max" DECIMAL(5,2),
    "general_notes" TEXT,
    "submitted_by" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "daily_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_log_activities" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "daily_log_id" UUID NOT NULL,
    "schedule_task_id" UUID,
    "budget_item_id" UUID,
    "description" TEXT NOT NULL,
    "progress_before" DECIMAL(5,2),
    "progress_after" DECIMAL(5,2),
    "quantity_completed" DECIMAL(18,4),
    "unit" TEXT,
    "notes" TEXT,

    CONSTRAINT "daily_log_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_log_workforce" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "daily_log_id" UUID NOT NULL,
    "company_name" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "worker_count" INTEGER NOT NULL,
    "hours_per_worker" DECIMAL(8,2),
    "notes" TEXT,

    CONSTRAINT "daily_log_workforce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_log_equipment" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "daily_log_id" UUID NOT NULL,
    "equipment_name" TEXT NOT NULL,
    "identifier" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "hours_worked" DECIMAL(8,2),
    "hours_idle" DECIMAL(8,2),
    "status" "EquipmentStatus" NOT NULL DEFAULT 'OPERATING',
    "notes" TEXT,

    CONSTRAINT "daily_log_equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_log_materials" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "daily_log_id" UUID NOT NULL,
    "material_name" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "budget_item_id" UUID,
    "notes" TEXT,

    CONSTRAINT "daily_log_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_log_deliveries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "daily_log_id" UUID NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4),
    "unit" TEXT,
    "document" TEXT,
    "received_by" TEXT,
    "delivery_time" TIME(0),
    "notes" TEXT,

    CONSTRAINT "daily_log_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_log_occurrences" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "daily_log_id" UUID NOT NULL,
    "occurrence_type" "OccurrenceType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'LOW',
    "occurred_at" TIMESTAMPTZ(6),

    CONSTRAINT "daily_log_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_log_observations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "daily_log_id" UUID NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "daily_log_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "daily_log_id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum" TEXT NOT NULL,
    "visibility" "FileVisibility" NOT NULL DEFAULT 'INTERNAL',
    "is_photo" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_log_photos" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "daily_log_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "caption" TEXT,
    "taken_at" TIMESTAMPTZ(6),
    "schedule_task_id" UUID,
    "budget_item_id" UUID,

    CONSTRAINT "daily_log_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_log_documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "daily_log_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,

    CONSTRAINT "daily_log_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedules_tenant_id_project_id_idx" ON "schedules"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedules_tenant_id_project_id_id_key" ON "schedules"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "schedule_tasks_tenant_id_project_id_schedule_id_parent_id_idx" ON "schedule_tasks"("tenant_id", "project_id", "schedule_id", "parent_id");

-- CreateIndex
CREATE INDEX "schedule_tasks_tenant_id_project_id_idx" ON "schedule_tasks"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_tasks_schedule_id_code_key" ON "schedule_tasks"("schedule_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_tasks_tenant_id_project_id_id_key" ON "schedule_tasks"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "task_dependencies_tenant_id_project_id_idx" ON "task_dependencies"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_dependencies_predecessor_id_successor_id_key" ON "task_dependencies"("predecessor_id", "successor_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_dependencies_tenant_id_project_id_id_key" ON "task_dependencies"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "schedule_baselines_tenant_id_project_id_idx" ON "schedule_baselines"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_baselines_schedule_id_revision_number_key" ON "schedule_baselines"("schedule_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_baselines_tenant_id_project_id_id_key" ON "schedule_baselines"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "schedule_baseline_tasks_tenant_id_project_id_idx" ON "schedule_baseline_tasks"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_baseline_tasks_baseline_id_task_id_key" ON "schedule_baseline_tasks"("baseline_id", "task_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_baseline_tasks_tenant_id_project_id_id_key" ON "schedule_baseline_tasks"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "task_progress_updates_tenant_id_project_id_progress_date_idx" ON "task_progress_updates"("tenant_id", "project_id", "progress_date");

-- CreateIndex
CREATE INDEX "task_progress_updates_tenant_id_project_id_idx" ON "task_progress_updates"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_progress_updates_tenant_id_project_id_id_key" ON "task_progress_updates"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "project_progress_snapshots_tenant_id_project_id_idx" ON "project_progress_snapshots"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_progress_snapshots_project_id_snapshot_date_key" ON "project_progress_snapshots"("project_id", "snapshot_date");

-- CreateIndex
CREATE UNIQUE INDEX "project_progress_snapshots_tenant_id_project_id_id_key" ON "project_progress_snapshots"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "daily_logs_tenant_id_project_id_log_date_status_idx" ON "daily_logs"("tenant_id", "project_id", "log_date", "status");

-- CreateIndex
CREATE INDEX "daily_logs_tenant_id_project_id_idx" ON "daily_logs"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_logs_project_id_log_date_key" ON "daily_logs"("project_id", "log_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_logs_tenant_id_project_id_id_key" ON "daily_logs"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "daily_log_activities_tenant_id_project_id_idx" ON "daily_log_activities"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_log_activities_tenant_id_project_id_id_key" ON "daily_log_activities"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "daily_log_workforce_tenant_id_project_id_idx" ON "daily_log_workforce"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_log_workforce_tenant_id_project_id_id_key" ON "daily_log_workforce"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "daily_log_equipment_tenant_id_project_id_idx" ON "daily_log_equipment"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_log_equipment_tenant_id_project_id_id_key" ON "daily_log_equipment"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "daily_log_materials_tenant_id_project_id_idx" ON "daily_log_materials"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_log_materials_tenant_id_project_id_id_key" ON "daily_log_materials"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "daily_log_deliveries_tenant_id_project_id_idx" ON "daily_log_deliveries"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_log_deliveries_tenant_id_project_id_id_key" ON "daily_log_deliveries"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "daily_log_occurrences_tenant_id_project_id_idx" ON "daily_log_occurrences"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_log_occurrences_tenant_id_project_id_id_key" ON "daily_log_occurrences"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE INDEX "daily_log_observations_tenant_id_project_id_idx" ON "daily_log_observations"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_log_observations_tenant_id_project_id_id_key" ON "daily_log_observations"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_object_key_key" ON "documents"("object_key");

-- CreateIndex
CREATE INDEX "documents_tenant_id_project_id_idx" ON "documents"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_tenant_id_project_id_id_key" ON "documents"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_log_photos_document_id_key" ON "daily_log_photos"("document_id");

-- CreateIndex
CREATE INDEX "daily_log_photos_tenant_id_project_id_idx" ON "daily_log_photos"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_log_photos_tenant_id_project_id_id_key" ON "daily_log_photos"("tenant_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_log_documents_document_id_key" ON "daily_log_documents"("document_id");

-- CreateIndex
CREATE INDEX "daily_log_documents_tenant_id_project_id_idx" ON "daily_log_documents"("tenant_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_log_documents_tenant_id_project_id_id_key" ON "daily_log_documents"("tenant_id", "project_id", "id");

ALTER TABLE "schedules" ADD FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id,id);

ALTER TABLE "schedule_tasks" ADD FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE "schedule_tasks" ADD FOREIGN KEY (tenant_id, project_id, schedule_id) REFERENCES schedules(tenant_id,project_id,id);
ALTER TABLE "schedule_tasks" ADD FOREIGN KEY (tenant_id, project_id, parent_id) REFERENCES schedule_tasks(tenant_id,project_id,id);

ALTER TABLE "task_dependencies" ADD FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE "task_dependencies" ADD FOREIGN KEY (tenant_id, project_id, schedule_id) REFERENCES schedules(tenant_id,project_id,id);
ALTER TABLE "task_dependencies" ADD FOREIGN KEY (tenant_id, project_id, predecessor_id) REFERENCES schedule_tasks(tenant_id,project_id,id);
ALTER TABLE "task_dependencies" ADD FOREIGN KEY (tenant_id, project_id, successor_id) REFERENCES schedule_tasks(tenant_id,project_id,id);

ALTER TABLE "schedule_baselines" ADD FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE "schedule_baselines" ADD FOREIGN KEY (tenant_id, project_id, schedule_id) REFERENCES schedules(tenant_id,project_id,id);

ALTER TABLE "schedule_baseline_tasks" ADD FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE "schedule_baseline_tasks" ADD FOREIGN KEY (tenant_id, project_id, task_id) REFERENCES schedule_tasks(tenant_id,project_id,id);
ALTER TABLE "schedule_baseline_tasks" ADD FOREIGN KEY (tenant_id, project_id, baseline_id) REFERENCES schedule_baselines(tenant_id,project_id,id);

ALTER TABLE "task_progress_updates" ADD FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE "task_progress_updates" ADD FOREIGN KEY (tenant_id, project_id, task_id) REFERENCES schedule_tasks(tenant_id,project_id,id);
ALTER TABLE "task_progress_updates" ADD FOREIGN KEY (tenant_id, project_id, daily_log_id) REFERENCES daily_logs(tenant_id,project_id,id);

ALTER TABLE "project_progress_snapshots" ADD FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id,id);

ALTER TABLE "daily_logs" ADD FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id,id);

ALTER TABLE "daily_log_activities" ADD FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE "daily_log_activities" ADD FOREIGN KEY (tenant_id, project_id, schedule_task_id) REFERENCES schedule_tasks(tenant_id,project_id,id);
ALTER TABLE "daily_log_activities" ADD FOREIGN KEY (tenant_id, project_id, daily_log_id) REFERENCES daily_logs(tenant_id,project_id,id);

ALTER TABLE "daily_log_workforce" ADD FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE "daily_log_workforce" ADD FOREIGN KEY (tenant_id, project_id, daily_log_id) REFERENCES daily_logs(tenant_id,project_id,id);

ALTER TABLE "daily_log_equipment" ADD FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE "daily_log_equipment" ADD FOREIGN KEY (tenant_id, project_id, daily_log_id) REFERENCES daily_logs(tenant_id,project_id,id);

ALTER TABLE "daily_log_materials" ADD FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE "daily_log_materials" ADD FOREIGN KEY (tenant_id, project_id, daily_log_id) REFERENCES daily_logs(tenant_id,project_id,id);

ALTER TABLE "daily_log_deliveries" ADD FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE "daily_log_deliveries" ADD FOREIGN KEY (tenant_id, project_id, daily_log_id) REFERENCES daily_logs(tenant_id,project_id,id);

ALTER TABLE "daily_log_occurrences" ADD FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE "daily_log_occurrences" ADD FOREIGN KEY (tenant_id, project_id, daily_log_id) REFERENCES daily_logs(tenant_id,project_id,id);

ALTER TABLE "daily_log_observations" ADD FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE "daily_log_observations" ADD FOREIGN KEY (tenant_id, project_id, daily_log_id) REFERENCES daily_logs(tenant_id,project_id,id);

ALTER TABLE "documents" ADD FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE "documents" ADD FOREIGN KEY (tenant_id, project_id, daily_log_id) REFERENCES daily_logs(tenant_id,project_id,id);

ALTER TABLE "daily_log_photos" ADD FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE "daily_log_photos" ADD FOREIGN KEY (tenant_id, project_id, schedule_task_id) REFERENCES schedule_tasks(tenant_id,project_id,id);
ALTER TABLE "daily_log_photos" ADD FOREIGN KEY (tenant_id, project_id, daily_log_id) REFERENCES daily_logs(tenant_id,project_id,id);
ALTER TABLE "daily_log_photos" ADD FOREIGN KEY (tenant_id, project_id, document_id) REFERENCES documents(tenant_id,project_id,id);

ALTER TABLE "daily_log_documents" ADD FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE "daily_log_documents" ADD FOREIGN KEY (tenant_id, project_id, daily_log_id) REFERENCES daily_logs(tenant_id,project_id,id);
ALTER TABLE "daily_log_documents" ADD FOREIGN KEY (tenant_id, project_id, document_id) REFERENCES documents(tenant_id,project_id,id);

CREATE UNIQUE INDEX schedules_main ON schedules(project_id) WHERE status <> 'ARCHIVED';
CREATE UNIQUE INDEX schedule_task_budget_once ON schedule_tasks(schedule_id,budget_item_id) WHERE status <> 'CANCELLED' AND budget_item_id IS NOT NULL;
ALTER TABLE schedule_tasks ADD CHECK (actual_progress BETWEEN 0 AND 100 AND weight >= 0), ADD CHECK (planned_end >= planned_start), ADD CHECK ((task_type = 'MILESTONE' AND duration_days=0 AND planned_end=planned_start) OR (task_type <> 'MILESTONE' AND duration_days=planned_end-planned_start+1));
ALTER TABLE task_dependencies ADD CHECK (predecessor_id <> successor_id);
ALTER TABLE daily_log_workforce ADD CHECK (worker_count >= 0 AND hours_per_worker BETWEEN 0 AND 24);
ALTER TABLE task_progress_updates ADD CHECK (previous_progress BETWEEN 0 AND 100 AND new_progress BETWEEN 0 AND 100);
CREATE FUNCTION m3_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable historical record'; END $$;
CREATE TRIGGER baseline_immutable BEFORE UPDATE OR DELETE ON schedule_baselines FOR EACH ROW EXECUTE FUNCTION m3_immutable();
CREATE TRIGGER baseline_task_immutable BEFORE UPDATE OR DELETE ON schedule_baseline_tasks FOR EACH ROW EXECUTE FUNCTION m3_immutable();
CREATE TRIGGER progress_immutable BEFORE UPDATE OR DELETE ON task_progress_updates FOR EACH ROW EXECUTE FUNCTION m3_immutable();
CREATE FUNCTION daily_log_edit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_status text;
BEGIN
 SELECT status INTO current_status FROM daily_logs WHERE id=COALESCE(NEW.daily_log_id,OLD.daily_log_id) FOR UPDATE;
 IF current_status NOT IN ('DRAFT','REOPENED') THEN RAISE EXCEPTION 'DAILY_LOG_IMMUTABLE'; END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER log_child_guard BEFORE INSERT OR UPDATE OR DELETE ON daily_log_activities FOR EACH ROW EXECUTE FUNCTION daily_log_edit_guard();
CREATE TRIGGER log_child_guard BEFORE INSERT OR UPDATE OR DELETE ON daily_log_workforce FOR EACH ROW EXECUTE FUNCTION daily_log_edit_guard();
CREATE TRIGGER log_child_guard BEFORE INSERT OR UPDATE OR DELETE ON daily_log_equipment FOR EACH ROW EXECUTE FUNCTION daily_log_edit_guard();
CREATE TRIGGER log_child_guard BEFORE INSERT OR UPDATE OR DELETE ON daily_log_materials FOR EACH ROW EXECUTE FUNCTION daily_log_edit_guard();
CREATE TRIGGER log_child_guard BEFORE INSERT OR UPDATE OR DELETE ON daily_log_deliveries FOR EACH ROW EXECUTE FUNCTION daily_log_edit_guard();
CREATE TRIGGER log_child_guard BEFORE INSERT OR UPDATE OR DELETE ON daily_log_occurrences FOR EACH ROW EXECUTE FUNCTION daily_log_edit_guard();
CREATE TRIGGER log_child_guard BEFORE INSERT OR UPDATE OR DELETE ON daily_log_observations FOR EACH ROW EXECUTE FUNCTION daily_log_edit_guard();
CREATE TRIGGER log_child_guard BEFORE INSERT OR UPDATE OR DELETE ON daily_log_photos FOR EACH ROW EXECUTE FUNCTION daily_log_edit_guard();
CREATE TRIGGER log_child_guard BEFORE INSERT OR UPDATE OR DELETE ON daily_log_documents FOR EACH ROW EXECUTE FUNCTION daily_log_edit_guard();

CREATE FUNCTION daily_log_state_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status='APPROVED' AND (NEW.status<>'REOPENED' OR NEW.log_date<>OLD.log_date OR NEW.general_notes IS DISTINCT FROM OLD.general_notes OR NEW.weather_condition IS DISTINCT FROM OLD.weather_condition OR NEW.weather_notes IS DISTINCT FROM OLD.weather_notes OR NEW.temperature_min IS DISTINCT FROM OLD.temperature_min OR NEW.temperature_max IS DISTINCT FROM OLD.temperature_max) THEN RAISE EXCEPTION 'DAILY_LOG_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER diary_guard BEFORE UPDATE ON daily_logs FOR EACH ROW EXECUTE FUNCTION daily_log_state_guard();
