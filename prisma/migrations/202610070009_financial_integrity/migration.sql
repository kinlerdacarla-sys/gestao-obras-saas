CREATE OR REPLACE FUNCTION financial_payment_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND OLD.status='POSTED' AND NEW.status='POSTED' AND (to_jsonb(NEW)-ARRAY['version','updated_at','updated_by'])=(to_jsonb(OLD)-ARRAY['version','updated_at','updated_by']) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.status='POSTED' AND NEW.status='REVERSED' AND (to_jsonb(NEW)-ARRAY['status','version','updated_at','updated_by'])=(to_jsonb(OLD)-ARRAY['status','version','updated_at','updated_by']) AND EXISTS(SELECT 1 FROM payment_reversals WHERE payment_id=OLD.id) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'PAYMENT_IMMUTABLE';
END $$;
CREATE FUNCTION financial_disbursement_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND OLD.status='POSTED' AND NEW.status='REVERSED' AND length(NEW.reversal_reason)>=3 AND (to_jsonb(NEW)-ARRAY['status','version','updated_at','updated_by','reversal_reason'])=(to_jsonb(OLD)-ARRAY['status','version','updated_at','updated_by','reversal_reason']) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'DISBURSEMENT_IMMUTABLE';
END $$;
CREATE TRIGGER financial_disbursement_guard BEFORE UPDATE OR DELETE ON disbursements FOR EACH ROW EXECUTE FUNCTION financial_disbursement_guard();
ALTER TABLE contracts ADD CHECK (advance_recovery_percentage IS NULL OR advance_recovery_percentage BETWEEN 0 AND 100);
ALTER TABLE contracts ADD CHECK (advance_recovery_fixed_amount IS NULL OR advance_recovery_fixed_amount>=0);
ALTER TABLE contracts ADD CHECK (final_approval_role IN ('FINANCIER','CLIENT'));
