CREATE UNIQUE INDEX budget_items_project_scope ON budget_items(tenant_id, project_id, id);
CREATE UNIQUE INDEX budget_revisions_project_scope ON budget_revisions(tenant_id, project_id, id);
ALTER TABLE schedules ADD FOREIGN KEY (tenant_id, project_id, budget_revision_id) REFERENCES budget_revisions(tenant_id,project_id,id);
ALTER TABLE schedule_tasks ADD FOREIGN KEY (tenant_id, project_id, budget_item_id) REFERENCES budget_items(tenant_id,project_id,id);
ALTER TABLE daily_log_activities ADD FOREIGN KEY (tenant_id, project_id, budget_item_id) REFERENCES budget_items(tenant_id,project_id,id);
ALTER TABLE daily_log_materials ADD FOREIGN KEY (tenant_id, project_id, budget_item_id) REFERENCES budget_items(tenant_id,project_id,id);
ALTER TABLE daily_log_photos ADD FOREIGN KEY (tenant_id, project_id, budget_item_id) REFERENCES budget_items(tenant_id,project_id,id);
CREATE FUNCTION daily_log_delete_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status IN ('APPROVED','SUBMITTED') THEN RAISE EXCEPTION 'DAILY_LOG_IMMUTABLE'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER diary_delete_guard BEFORE DELETE ON daily_logs FOR EACH ROW EXECUTE FUNCTION daily_log_delete_guard();
