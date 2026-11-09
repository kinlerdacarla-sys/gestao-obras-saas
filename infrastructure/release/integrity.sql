\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '120s';
DO $checks$
DECLARE t record; n bigint;
BEGIN
  FOR t IN SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='tenant_id' LOOP
    EXECUTE format('SELECT count(*) FROM %I x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE x.tenant_id IS NOT NULL AND t.id IS NULL', t.table_name) INTO n;
    IF n>0 THEN RAISE EXCEPTION 'tenant integrity: % (% violations)',t.table_name,n; END IF;
  END LOOP;
  FOR t IN SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('project_id','tenant_id') GROUP BY table_name HAVING count(*)=2 LOOP
    EXECUTE format('SELECT count(*) FROM %I x LEFT JOIN projects p ON p.id=x.project_id AND p.tenant_id=x.tenant_id WHERE x.project_id IS NOT NULL AND p.id IS NULL',t.table_name) INTO n;
    IF n>0 THEN RAISE EXCEPTION 'project scope: % (% violations)',t.table_name,n; END IF;
  END LOOP;
  FOR t IN
    SELECT c.conrelid::regclass AS child, c.confrelid::regclass AS parent,
           string_agg(format('p.%I=x.%I',pa.attname,ca.attname),' AND ' ORDER BY k.ord) AS join_sql
    FROM pg_constraint c CROSS JOIN LATERAL unnest(c.conkey,c.confkey) WITH ORDINALITY AS k(child_col,parent_col,ord)
    JOIN pg_attribute ca ON ca.attrelid=c.conrelid AND ca.attnum=k.child_col
    JOIN pg_attribute pa ON pa.attrelid=c.confrelid AND pa.attnum=k.parent_col
    WHERE c.contype='f' AND c.connamespace='public'::regnamespace
      AND EXISTS(SELECT FROM pg_attribute a WHERE a.attrelid=c.conrelid AND a.attname='tenant_id')
      AND EXISTS(SELECT FROM pg_attribute a WHERE a.attrelid=c.confrelid AND a.attname='tenant_id')
    GROUP BY c.oid,c.conrelid,c.confrelid
  LOOP
    EXECUTE format('SELECT count(*) FROM %s x JOIN %s p ON %s WHERE x.tenant_id<>p.tenant_id',t.child,t.parent,t.join_sql) INTO n;
    IF n>0 THEN RAISE EXCEPTION 'cross-tenant FK: % -> % (% violations)',t.child,t.parent,n; END IF;
  END LOOP;
  IF EXISTS(SELECT FROM measurements WHERE net_certified_amount <> gross_amount-retention_amount-advance_recovery_amount-other_deductions_amount) THEN RAISE EXCEPTION 'measurement net mismatch'; END IF;
  IF EXISTS(SELECT FROM contracts c WHERE c.current_value<>c.original_value+COALESCE((SELECT SUM(CASE a.amendment_type WHEN 'ADDITION' THEN a.amount WHEN 'OMISSION' THEN -a.amount ELSE 0 END) FROM contract_amendments a WHERE a.contract_id=c.id AND a.status='APPROVED'),0)) THEN RAISE EXCEPTION 'contract amended total mismatch'; END IF;
  IF EXISTS(SELECT FROM budget_revision_values WHERE item_type='ITEM' AND is_active AND quantity IS NOT NULL AND unit_price IS NOT NULL AND total_value<>round(quantity*unit_price,2)) THEN RAISE EXCEPTION 'budget line total mismatch'; END IF;
  IF EXISTS(SELECT FROM expenses WHERE total_amount<>subtotal+tax_amount) THEN RAISE EXCEPTION 'expense total mismatch'; END IF;
  IF EXISTS(SELECT FROM payments p JOIN measurements m ON m.id=p.measurement_id WHERE p.status='POSTED' GROUP BY m.id HAVING SUM(p.amount)>m.net_certified_amount) THEN RAISE EXCEPTION 'measurement overpaid'; END IF;
  IF EXISTS(SELECT FROM payments p JOIN expenses e ON e.id=p.expense_id WHERE p.status='POSTED' GROUP BY e.id HAVING SUM(p.amount)>e.total_amount) THEN RAISE EXCEPTION 'expense overpaid'; END IF;
  IF EXISTS(SELECT FROM payments p JOIN retention_releases r ON r.id=p.retention_release_id WHERE p.status='POSTED' GROUP BY r.id HAVING SUM(p.amount)>r.amount) THEN RAISE EXCEPTION 'retention release overpaid'; END IF;
  IF EXISTS(SELECT FROM retention_transactions GROUP BY tenant_id,contract_id HAVING SUM(CASE WHEN type='WITHHELD' THEN amount ELSE -amount END)<0) THEN RAISE EXCEPTION 'negative retention balance'; END IF;
  IF EXISTS(SELECT FROM advance_transactions GROUP BY tenant_id,contract_id HAVING SUM(CASE WHEN type='ADVANCE_RECOVERED' THEN -amount ELSE amount END)<0) THEN RAISE EXCEPTION 'negative advance balance'; END IF;
  IF EXISTS(SELECT FROM disbursements d JOIN funding_agreements f ON f.id=d.funding_agreement_id WHERE d.status='POSTED' GROUP BY f.id HAVING SUM(d.amount)>f.approved_amount) THEN RAISE EXCEPTION 'funding exceeded'; END IF;
  IF EXISTS(SELECT FROM documents WHERE confirmed_at IS NOT NULL AND (object_key NOT LIKE 'tenant/'||tenant_id||'/projects/'||project_id||'/%' OR size_bytes<0)) THEN RAISE EXCEPTION 'document scope mismatch'; END IF;
END
$checks$;
SELECT 'PASS' AS integrity_check, count(*) AS tenant_count FROM tenants;
COMMIT;
