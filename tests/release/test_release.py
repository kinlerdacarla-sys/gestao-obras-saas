"""Offline orchestration checks: no AWS credentials or network access."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

def load(name, filename):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).resolve().parents[2]/"infrastructure"/"release"/filename)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
deploy=load("release","deploy.py")
gate=load("gate","go-live.py")
SHA="a"*40

class ReleaseSafety(unittest.TestCase):
    def simulate(self, *, migration=0, scan=0, smoke_failure=False):
        calls=[]
        config=dict(environment="staging",region="local",cluster="fixture",repositories={n:"local.dkr.ecr.invalid/"+n for n in ("migration","api","worker","web")},task_definitions={n:n for n in ("migration","api","worker","web")},private_subnets=[],migration_security_group="",runtime_secret_arns={"smoke":"fixture"},api_url="",app_url="")
        def aws(service,action,*args):
            calls.append((action,args))
            if action=="get-caller-identity":return {"Account":"local"}
            if action=="describe-image-scan-findings":return {"imageScanStatus":{"status":"COMPLETE"},"imageScanFindings":{"findingSeverityCounts":{"CRITICAL":scan}},"imageId":{"imageDigest":"digest"}}
            if action=="describe-task-definition":return {"taskDefinition":{"family":args[-1],"containerDefinitions":[{"name":args[-1]}]}}
            if action=="register-task-definition":
                task=json.loads(Path(args[-1][7:]).read_text())
                return {"taskDefinition":{"taskDefinitionArn":"new-"+task["family"]}}
            if action=="run-task":return {"tasks":[{"taskArn":"fixture-task"}]}
            if action=="describe-tasks":return {"tasks":[{"containers":[{"exitCode":migration}]}]}
            if action=="describe-services":
                names=args[args.index("--services")+1:]
                return {"services":[{"serviceName":n,"taskDefinition":("old-" if len(names)==1 else "new-")+n,"desiredCount":1,"runningCount":1} for n in names]}
            if action=="get-secret-value":return {"SecretString":json.dumps(dict(SMOKE_TENANT="",SMOKE_EMAIL="",SMOKE_PASSWORD=""))}
            return {}
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ,{"DEPLOY_ENVIRONMENT":"staging","AUTHORIZED_ACCOUNT_ID":"local","AWS_REGION":"local","RISKY_MIGRATION":"false"}),patch.object(deploy,"aws",side_effect=aws),patch.object(deploy,"run",return_value=""),patch.object(deploy.subprocess,"run",side_effect=RuntimeError("smoke failed") if smoke_failure else None):
            previous=os.getcwd()
            try:
                os.chdir(tmp)
                with self.assertRaises((ValueError,RuntimeError)):deploy.deployment(config,SHA)
            finally:os.chdir(previous)
        return calls
    def test_failed_migration_does_not_touch_serving_tasks(self):
        calls=self.simulate(migration=1)
        self.assertNotIn("update-service",[a for a,_ in calls])
    def test_critical_scan_prevents_migration(self):
        self.assertNotIn("run-task",[a for a,_ in self.simulate(scan=1)])
    def test_failed_smoke_restores_previous_revisions_and_counts(self):
        updates=[args for a,args in self.simulate(smoke_failure=True) if a=="update-service"]
        self.assertEqual(len(updates),6)
        self.assertEqual([args[args.index("--task-definition")+1] for args in updates[3:]],["old-web","old-worker","old-api"])
    def test_unsubstantiated_pass_does_not_open_gate(self):
        rows=gate.evaluate({"checks":{"tls":{"status":"PASS"}}},SHA)
        self.assertEqual(next(r for r in rows if r["item"]=="tls")["status"],"FAIL")
        self.assertTrue(any(r["status"]=="MANUAL" for r in rows))
