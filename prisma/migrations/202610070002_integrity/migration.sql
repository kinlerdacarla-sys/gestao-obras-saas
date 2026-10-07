ALTER TABLE projects ADD CONSTRAINT projects_currency_mzn CHECK (currency = 'MZN');
ALTER TABLE projects ADD CONSTRAINT projects_value_nonnegative CHECK (contract_value IS NULL OR contract_value >= 0);
ALTER TABLE projects ADD CONSTRAINT projects_date_order CHECK (start_date IS NULL OR planned_end_date IS NULL OR planned_end_date >= start_date);

CREATE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
