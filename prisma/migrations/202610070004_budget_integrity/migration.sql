CREATE UNIQUE INDEX budgets_one_active ON budgets(tenant_id,project_id) WHERE status='ACTIVE';
CREATE UNIQUE INDEX budget_one_working_revision ON budget_revisions(budget_id) WHERE status IN ('DRAFT','SUBMITTED');
CREATE UNIQUE INDEX budget_one_approved_revision ON budget_revisions(budget_id) WHERE status='APPROVED';
ALTER TABLE budget_import_jobs ADD CONSTRAINT import_project_tenant_fk FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id);
ALTER TABLE budget_items ADD CONSTRAINT item_parent_budget_fk FOREIGN KEY(tenant_id,budget_id,parent_id) REFERENCES budget_items(tenant_id,budget_id,id);
ALTER TABLE budget_revision_values ADD CONSTRAINT value_parent_revision_fk FOREIGN KEY(budget_revision_id,parent_id) REFERENCES budget_revision_values(budget_revision_id,budget_item_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE budget_revision_values ADD CONSTRAINT item_financial_values CHECK (
 (item_type='GROUP' AND quantity IS NULL AND unit_price IS NULL AND unit IS NULL AND total_value=0)
 OR (item_type='ITEM' AND quantity>=0 AND quantity IS NOT NULL AND unit_price>=0 AND unit_price IS NOT NULL AND unit IS NOT NULL AND length(unit)>0 AND total_value=round(quantity*unit_price,2))
);
CREATE FUNCTION guard_budget_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision_status text;
BEGIN
 SELECT status INTO revision_status FROM budget_revisions WHERE id=COALESCE(NEW.budget_revision_id,OLD.budget_revision_id) AND tenant_id=COALESCE(NEW.tenant_id,OLD.tenant_id) FOR SHARE;
 IF revision_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'BUDGET_REVISION_IMMUTABLE'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND (NEW.budget_revision_id<>OLD.budget_revision_id OR NEW.budget_item_id<>OLD.budget_item_id OR NEW.tenant_id<>OLD.tenant_id) THEN RAISE EXCEPTION 'Snapshot identity is immutable'; END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER budget_snapshot_immutable BEFORE INSERT OR UPDATE OR DELETE ON budget_revision_values FOR EACH ROW EXECUTE FUNCTION guard_budget_snapshot();
CREATE FUNCTION guard_budget_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Budget history cannot be deleted'; END IF;
 IF OLD.status IN ('APPROVED','SUPERSEDED','REJECTED','CANCELLED') AND
    NOT (OLD.status='APPROVED' AND NEW.status='SUPERSEDED' AND (to_jsonb(OLD)-'status')=(to_jsonb(NEW)-'status')) THEN RAISE EXCEPTION 'BUDGET_REVISION_IMMUTABLE'; END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER budget_revision_history BEFORE UPDATE OR DELETE ON budget_revisions FOR EACH ROW EXECUTE FUNCTION guard_budget_revision();
