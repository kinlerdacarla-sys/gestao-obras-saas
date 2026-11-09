"""Bounded read-only smoke/load against an explicitly identified staging origin."""
import concurrent.futures
import json
import math
import os
import time
import urllib.request
import urllib.error
from urllib.parse import urlparse
base=os.environ["STAGING_API_URL"].rstrip("/")
if os.environ.get("APP_ENV")!="staging" or urlparse(base).hostname!=os.environ.get("AUTHORIZED_STAGING_HOST"):
    raise SystemExit("Explicit staging host required")
if urlparse(base).scheme!="https" and urlparse(base).hostname not in ("127.0.0.1","localhost"): raise SystemExit("HTTPS required")
def call(route,cookie="",payload=None):
    start=time.monotonic()
    req=urllib.request.Request(base+"/api/v1"+route,data=payload,headers={"Cookie":cookie,"Content-Type":"application/json","Origin":os.environ["STAGING_WEB_URL"]})
    with urllib.request.urlopen(req,timeout=15) as r:
        r.read()
        return 1000*(time.monotonic()-start),r.headers
body=json.dumps({"tenantSlug":os.environ["SMOKE_TENANT"],"email":os.environ["SMOKE_EMAIL"],"password":os.environ["SMOKE_PASSWORD"]}).encode()
login,headers=call("/auth/login",payload=body)
print(json.dumps({"path":"/auth/login","samples":1,"elapsed_ms":round(login,2)}))
cookie="; ".join(v.split(";")[0] for v in headers.get_all("Set-Cookie",[]))
paths=json.loads(os.environ["STAGING_READ_PATHS"])
if not isinstance(paths,list) or not paths or any(not isinstance(r,str) or not r.startswith("/") or "://" in r for r in paths):raise ValueError("Invalid read paths")
bad=False
try:
    for route in paths:
        def sample(_):
            try:return call(route,cookie)[0]
            except (OSError,ValueError):return None
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: samples=list(pool.map(sample,range(20)))
        good=sorted(v for v in samples if v is not None); errors=len(samples)-len(good)
        p95=good[math.ceil(len(good)*.95)-1] if good else None
        limit=1000 if "dashboard" in route else 500
        print(json.dumps({"path":route,"samples":len(samples),"errors":errors,"p95_ms":round(p95,2) if p95 else None,"target_ms":limit}))
        bad |= bool(errors or p95 is None or p95>=limit)
finally:call("/auth/logout",cookie,b"{}")
raise SystemExit(int(bad))
