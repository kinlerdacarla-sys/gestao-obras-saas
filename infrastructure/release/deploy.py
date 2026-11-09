"""Deploy an approved immutable image set. No Terraform operations or secret output."""
import argparse
import json
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path


def run(*args, output=False, stdin=None):
    result = subprocess.run(args, input=stdin, text=True, check=True, stdout=subprocess.PIPE if output else None)
    return result.stdout if output else None


def aws(service, action, *args):
    data = run("aws", service, action, *args, "--output", "json", output=True)
    return json.loads(data) if data.strip() else {}


def deployment(config, sha):
    target = os.environ["DEPLOY_ENVIRONMENT"]
    if target=="production" and json.loads(Path("staging-evidence.json").read_text()).get("sha")!=sha: raise ValueError("Staging SHA mismatch")
    if target not in ("staging", "production") or config["environment"] != target or not re.fullmatch("[a-f0-9]{40}", sha):
        raise ValueError("Target/SHA mismatch")
    account = aws("sts", "get-caller-identity")["Account"]
    if account != os.environ["AUTHORIZED_ACCOUNT_ID"] or config["region"] != os.environ["AWS_REGION"]:
        raise ValueError("Unauthorized account/region")
    cluster = config["cluster"]
    previous, revisions, digests = {}, {}, {}
    registry = config["repositories"]["api"].split("/")[0]
    if not registry.startswith(account + ".dkr.ecr."):
        raise ValueError("ECR account mismatch")
    token = run("aws", "ecr", "get-login-password", output=True)
    run("docker", "login", "--username", "AWS", "--password-stdin", registry, stdin=token)
    for name in ("migration", "api", "worker", "web"):
        repository = config["repositories"][name]
        if repository.split("/")[0] != registry:
            raise ValueError("Mixed registries")
        image = repository + ":" + sha
        run("docker", "tag", "obras-" + name + ":" + sha, image)
        run("docker", "push", image)
        repo_name = repository.split("/", 1)[1]
        run("aws", "ecr", "wait", "image-scan-complete", "--repository-name", repo_name, "--image-id", "imageTag=" + sha)
        scan = aws("ecr", "describe-image-scan-findings", "--repository-name", repo_name, "--image-id", "imageTag=" + sha)
        if scan["imageScanStatus"]["status"] != "COMPLETE" or scan["imageScanFindings"]["findingSeverityCounts"].get("CRITICAL", 0):
            raise ValueError("Container scan is not clean")
        digest = scan["imageId"]["imageDigest"]
        digests[name] = digest
        template = aws("ecs", "describe-task-definition", "--task-definition", config["task_definitions"][name])["taskDefinition"]
        allowed = ("family","taskRoleArn","executionRoleArn","networkMode","containerDefinitions","volumes","placementConstraints","requiresCompatibilities","cpu","memory","runtimePlatform","ephemeralStorage")
        task = {k: template[k] for k in allowed if k in template}
        container = task["containerDefinitions"][0]
        container["image"] = repository + "@" + digest
        container["environment"] = [v for v in container.get("environment", []) if v["name"] != "RELEASE_SHA"] + [{"name":"RELEASE_SHA","value":sha}]
        with tempfile.TemporaryDirectory() as tmp:
            f = Path(tmp)/"task.json"
            f.write_text(json.dumps(task))
            revisions[name] = aws("ecs","register-task-definition","--cli-input-json","file://" + str(f))["taskDefinition"]["taskDefinitionArn"]
    if target == "production" and digests != json.loads(Path("staging-evidence.json").read_text())["digests"]:
        raise ValueError("Image digests differ from staged release")
    net = {"awsvpcConfiguration":{"subnets":config["private_subnets"],"securityGroups":[config["migration_security_group"]],"assignPublicIp":"DISABLED"}}
    overrides=[]
    if os.environ.get("RISKY_MIGRATION","").lower()=="true":
        snapshot=config["db_identifier"]+"-"+sha[:10]+"-"+str(int(time.time()))
        aws("rds","create-db-snapshot","--db-instance-identifier",config["db_identifier"],"--db-snapshot-identifier",snapshot)
        run("aws","rds","wait","db-snapshot-available","--db-snapshot-identifier",snapshot)
        overrides=["--overrides",json.dumps({"containerOverrides":[{"name":"migration","environment":[{"name":"MIGRATION_SNAPSHOT_ID","value":snapshot}]}]})]
    result = aws("ecs","run-task","--cluster",cluster,"--launch-type","FARGATE","--network-configuration",json.dumps(net),"--task-definition",revisions["migration"],*overrides)
    if result.get("failures") or len(result["tasks"]) != 1: raise RuntimeError("Migration task not started")
    task = result["tasks"][0]["taskArn"]
    run("aws","ecs","wait","tasks-stopped","--cluster",cluster,"--tasks",task)
    stopped = aws("ecs","describe-tasks","--cluster",cluster,"--tasks",task)["tasks"][0]
    if stopped["containers"][0].get("exitCode") != 0: raise RuntimeError("Migration failed")
    changed = []
    try:
        for name in ("api","worker","web"):
            old = aws("ecs","describe-services","--cluster",cluster,"--services",name)["services"][0]
            previous[name] = {"revision":old["taskDefinition"],"count":old["desiredCount"]}
            aws("ecs","update-service","--cluster",cluster,"--service",name,"--task-definition",revisions[name],"--desired-count",str(2 if target=="production" and name!="worker" else 1))
            changed.append(name)
        run("aws","ecs","wait","services-stable","--cluster",cluster,"--services",*changed)
        for service in aws("ecs","describe-services","--cluster",cluster,"--services",*changed)["services"]:
            if service["taskDefinition"] != revisions[service["serviceName"]] or service["runningCount"] != service["desiredCount"]:
                raise RuntimeError("Circuit breaker reverted rollout")
        # Fetch ephemeral smoke credentials in memory. Never write the values to evidence/logs.
        creds = json.loads(aws("secretsmanager","get-secret-value","--secret-id",config["runtime_secret_arns"]["smoke"])["SecretString"])
        env = dict(os.environ, SMOKE_API_URL=config["api_url"], SMOKE_WEB_URL=config["app_url"])
        env.update({k:creds[k] for k in ("SMOKE_TENANT","SMOKE_EMAIL","SMOKE_PASSWORD")})
        subprocess.run(["node","infrastructure/docker/smoke.mjs"],env=env,check=True)
    except Exception:
        for name in reversed(changed):
            aws("ecs","update-service","--cluster",cluster,"--service",name,"--task-definition",previous[name]["revision"],"--desired-count",str(previous[name]["count"]))
        if changed: run("aws","ecs","wait","services-stable","--cluster",cluster,"--services",*changed)
        raise
    Path(target+"-evidence.json").write_text(json.dumps({"sha":sha,"environment":target,"digests":digests,"previous":previous,"revisions":revisions,"smoke":"PASS"},indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--sha", required=True)
    deployment(json.loads(os.environ["DEPLOYMENT_CONFIG"]), parser.parse_args().sha)
