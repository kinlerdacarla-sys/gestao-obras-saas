-- Initialize ledgers from legacy M4 terms without altering financial balances.
INSERT INTO advance_transactions(id,tenant_id,project_id,contract_id,type,amount,created_at,updated_at,created_by,updated_by)
SELECT gen_random_uuid(),tenant_id,project_id,id,'ADVANCE_GRANTED',advance_amount,now(),now(),created_by,updated_by FROM contracts c
WHERE status NOT IN ('DRAFT','CANCELLED') AND advance_amount>0 AND NOT EXISTS(SELECT 1 FROM advance_transactions a WHERE a.contract_id=c.id AND a.type='ADVANCE_GRANTED');
INSERT INTO advance_transactions(id,tenant_id,project_id,contract_id,type,amount,created_at,updated_at,created_by,updated_by)
SELECT gen_random_uuid(),tenant_id,project_id,id,'ADVANCE_RECOVERED',advance_recovered_amount,now(),now(),created_by,updated_by FROM contracts c
WHERE status NOT IN ('DRAFT','CANCELLED') AND advance_recovered_amount>0 AND NOT EXISTS(SELECT 1 FROM advance_transactions a WHERE a.contract_id=c.id AND a.type='ADVANCE_RECOVERED');
