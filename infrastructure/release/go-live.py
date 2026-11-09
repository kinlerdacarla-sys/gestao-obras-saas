"""Offline evidence gate. Missing critical evidence never authorizes release."""
import argparse
import json
import sys
from pathlib import Path

CRITICAL=("tenant_isolation","auth_https","financial_integrity","rds_backups","restore_drill","tls","production_secrets","db_availability","storage_access","ci","critical_tests","security_scan")
MANUAL=("account_sso","dns_delegation","ses_production_access","budget","staging_approval","production_approval","pilot_uat")
def evaluate(evidence, sha):
    by_item=evidence.get("checks",{})
    result=[]
    for item in (*CRITICAL,*MANUAL):
        entry=by_item.get(item,{})
        status=entry.get("status","MANUAL")
        proof=entry.get("evidence")
        if status not in ("PASS","FAIL","WARNING","MANUAL"): status="FAIL"
        if status=="PASS" and (not proof or not sha or entry.get("sha")!=sha or not entry.get("verified_by") or not entry.get("verified_at")): status="FAIL"
        result.append({"item":item,"status":status,"evidence":proof or "PENDING EXTERNAL ACTION / evidence required"})
    return result
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--evidence",type=Path);p.add_argument("--sha",required=True);a=p.parse_args()
    rows=evaluate(json.loads(a.evidence.read_text()) if a.evidence else {},a.sha)
    print(json.dumps(rows,indent=2))
    sys.exit(0 if all(r["status"]=="PASS" for r in rows) else 1)
