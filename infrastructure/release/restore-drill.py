"""Disposable local PostgreSQL restore. No host connection strings or production targets accepted."""
import json
import subprocess
import time
import uuid
from pathlib import Path

root = Path(__file__).resolve().parents[2]
project = "m9-drill-" + uuid.uuid4().hex[:12]
compose = ["docker","compose","-p",project,"--profile","validation"]
def run(*args, stdin=None, capture=False):
    return subprocess.run([*compose,*args],cwd=root,input=stdin,stdout=subprocess.PIPE if capture else None,check=True).stdout
def sql(command):
    return run("exec","-T","postgres-test","psql","-U","obras","-d","obras_test","-At","-v","ON_ERROR_STOP=1","-c",command,capture=True).strip()
start=time.monotonic()
try:
    base=json.loads(subprocess.check_output(["docker","compose","--profile","validation","config","--format","json"],cwd=root))
    image=base["services"]["tests"].get("image") or base["name"]+"-tests"
    subprocess.run(["docker","tag",image,project+"-tests"],check=True)
    run("up","-d","--wait","postgres-test","redis-test")
    # Both DBs live only in a newly generated Compose project with tmpfs, never an existing DB.
    run("run","--rm","--no-deps","tests","sh","-ec","npm run migrate && npm run seed")
    expected=sql("SELECT id FROM projects ORDER BY id LIMIT 1")
    if not expected: raise RuntimeError("Representative project missing")
    run("exec","-T","postgres-test","pg_dump","-U","obras","-Fc","-f","/tmp/isolated.dump","obras_test")
    run("exec","-T","postgres-test","createdb","-U","obras","obras_restored")
    run("exec","-T","postgres-test","pg_restore","-U","obras","--exit-on-error","-d","obras_restored","/tmp/isolated.dump")
    run("exec","-T","postgres-test","psql","-U","obras","-d","obras_restored",stdin=(root/"infrastructure/release/integrity.sql").read_bytes())
    restored=run("exec","-T","postgres-test","psql","-U","obras","-d","obras_restored","-Atc","SELECT id FROM projects ORDER BY id LIMIT 1",capture=True).strip()
    if restored!=expected: raise RuntimeError("Restored project mismatch")
    run("run","--rm","--no-deps","tests","sh","-ec",'''export DATABASE_URL="${DATABASE_URL%/*}/obras_restored"; npx prisma migrate status; npm run start:api & pid=$!; trap 'kill $pid' EXIT; node -e "let ok=false;for(let i=0;i<50;i++){try{const r=await fetch('http://localhost:3001/health/ready');if(r.ok){ok=true;break}}catch{}await new Promise(r=>setTimeout(r,1000))}if(!ok)process.exit(1)"'''.replace("npm run start:api","npx tsx apps/api/src/main.ts"))
    print(json.dumps({"target":"local-isolated","integrity":"PASS","restored_project":"verified","api_ready":"PASS","elapsed_seconds":round(time.monotonic()-start,2)}))
finally:
    run("down","-v","--remove-orphans")
    subprocess.run(["docker","image","rm",project+"-tests"],check=False)
