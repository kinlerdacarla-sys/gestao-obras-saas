-- Preserve historical records while allowing an explicit reopening transition.
CREATE FUNCTION quality_ncr_closed_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status='CLOSED' AND NOT (NEW.status='REOPENED' AND (to_jsonb(OLD)-'status'-'version'-'updated_at'-'closed_by'-'closed_at'-'verified_by'-'verified_at')=(to_jsonb(NEW)-'status'-'version'-'updated_at'-'closed_by'-'closed_at'-'verified_by'-'verified_at')) THEN RAISE EXCEPTION 'NON_CONFORMITY_IMMUTABLE'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER ncr_closed_immutable BEFORE UPDATE ON non_conformities FOR EACH ROW EXECUTE FUNCTION quality_ncr_closed_guard();
CREATE FUNCTION quality_answer_template_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM inspections i JOIN checklist_template_items t ON t.checklist_template_version_id=i.checklist_template_version_id AND t.tenant_id=i.tenant_id WHERE i.id=NEW.inspection_id AND t.id=NEW.template_item_id) THEN RAISE EXCEPTION 'Checklist item must belong to inspection version'; END IF;
 IF TG_OP='UPDATE' AND (NEW.inspection_id<>OLD.inspection_id OR NEW.template_item_id<>OLD.template_item_id OR NEW.tenant_id<>OLD.tenant_id OR NEW.project_id<>OLD.project_id) THEN RAISE EXCEPTION 'Inspection answer identity immutable'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER inspection_answer_template BEFORE INSERT OR UPDATE ON inspection_items FOR EACH ROW EXECUTE FUNCTION quality_answer_template_guard();
CREATE FUNCTION quality_correction_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM corrective_actions WHERE id=NEW.corrective_action_id AND status IN ('VERIFIED','CANCELLED')) THEN RAISE EXCEPTION 'NON_CONFORMITY_IMMUTABLE'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER corrective_evidence_immutable BEFORE INSERT ON corrective_action_evidence FOR EACH ROW EXECUTE FUNCTION quality_correction_evidence_guard();
CREATE TRIGGER corrective_evidence_no_update BEFORE UPDATE OR DELETE ON corrective_action_evidence FOR EACH ROW EXECUTE FUNCTION quality_no_delete();
CREATE TRIGGER inspection_evidence_no_update BEFORE UPDATE OR DELETE ON inspection_evidence FOR EACH ROW EXECUTE FUNCTION quality_no_delete();

CREATE FUNCTION quality_evidence_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='inspection_evidence' THEN
   IF NOT EXISTS(SELECT 1 FROM documents WHERE id=NEW.document_id AND inspection_id=NEW.inspection_id AND tenant_id=NEW.tenant_id AND project_id=NEW.project_id) THEN RAISE EXCEPTION 'Evidence document owner mismatch'; END IF;
 ELSE
   IF NOT EXISTS(SELECT 1 FROM documents WHERE id=NEW.document_id AND corrective_action_id=NEW.corrective_action_id AND tenant_id=NEW.tenant_id AND project_id=NEW.project_id) THEN RAISE EXCEPTION 'Evidence document owner mismatch'; END IF;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER inspection_evidence_owner BEFORE INSERT ON inspection_evidence FOR EACH ROW EXECUTE FUNCTION quality_evidence_owner_guard();
CREATE TRIGGER corrective_evidence_owner BEFORE INSERT ON corrective_action_evidence FOR EACH ROW EXECUTE FUNCTION quality_evidence_owner_guard();
