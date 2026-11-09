import json
import os
import time
import urllib.request
from urllib.parse import urlparse


def handler(_event, _context):
    failed = 0
    for base, suffix in [(os.environ["APP_URL"], "/login"), (os.environ["API_URL"], "/health/live"), (os.environ["API_URL"], "/health/ready")]:
        try:
            with urllib.request.urlopen(base + suffix, timeout=10) as response:
                if response.status != 200 or urlparse(response.geturl()).hostname != urlparse(base).hostname:
                    failed += 1
                elif suffix.startswith("/health"):
                    result=json.loads(response.read(4096))
                    keys=("api","postgresql","redis") if suffix.endswith("ready") else ("api",)
                    if any(result.get(key)!="up" for key in keys): failed+=1
        except Exception:
            failed += 1
    # No response bodies, URLs with query tokens, credentials or user identities are logged.
    print(json.dumps({
        "_aws": {"Timestamp": int(time.time() * 1000), "CloudWatchMetrics": [{"Namespace": "Obras/Operations", "Dimensions": [["Environment"]], "Metrics": [{"Name": "SyntheticFailure", "Unit": "Count"}]}]},
        "Environment": os.environ["ENVIRONMENT"], "SyntheticFailure": failed,
        "event": "synthetic_check", "level": "error" if failed else "info",
    }))
    return {"failures": failed}
