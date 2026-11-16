#!/usr/bin/env python3
"""Deploy the cashier ticket correction over the pinned live image, via staging."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import time
import urllib.error
import tempfile
import urllib.request

SCRIPTS = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("release", SCRIPTS / "cloud-cookie-release.py")
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)
release.BASE = "sha256:b15fe159978df8b0da624f28626d137353943812d44e9496701ea616764a873a"
original_payload = release.payload


def payload(before, target, image=None):
    request = original_payload(before, target, image)
    version = image["releaseId"] if image else "Restore " + before["id"]
    request["description"] = version + "; cashier ticket correction"
    return request


release.payload = payload


def build(root, commit):
    assert release.active("production")["image"]["imageDigest"] == release.BASE
    assert release.read("production-before.json")["image"]["imageDigest"] == release.BASE
    manifest = json.loads(release.run([
        "node", str(SCRIPTS / "build-cashier-ticket-correction-overlay.cjs"),
        str(root), commit,
    ], timeout=120))
    assert manifest["baseImageDigest"] == release.BASE
    layer = release.WORK / "overlay.tar"
    with tarfile.open(layer, "w") as archive:
        for name in [*(item["path"] for item in manifest["files"]), "public/cashier-ticket-correction-release.json"]:
            assert not name.startswith("/") and ".." not in Path(name).parts
            archive.add(root / name, arcname="app/" + name, recursive=False)
    crane = str(Path.home() / "lemuria-crm-report-fix-20261104/tools/crane")
    tag = release.REPOSITORY + ":" + manifest["releaseId"]
    with tempfile.TemporaryDirectory(prefix="lemuria-registry-") as auth_dir:
        env = dict(os.environ, DOCKER_CONFIG=auth_dir)
        subprocess.run([crane, "auth", "login", "cr.yandex", "-u", "iam", "--password-stdin"],
                       input=release.run(["yc", "iam", "create-token"]), text=True,
                       capture_output=True, check=True, env=env, timeout=30)
        release.run([crane, "append", "-b", release.REPOSITORY + "@" + release.BASE,
                     "-f", str(layer), "-t", tag], env=env, timeout=180)
        digest = release.run([crane, "digest", tag], env=env)
    assert re.fullmatch(r"sha256:[a-f0-9]{64}", digest)
    image = dict(releaseId=manifest["releaseId"], sourceCommit=commit,
                 digest=digest, image=release.REPOSITORY + "@" + digest)
    release.save("image.json", image)
    print(json.dumps({**image, "files": len(manifest["files"])}))


def verify(target):
    image = release.read("image.json")
    current = release.active(target)
    assert current["image"]["imageDigest"] == image["digest"]

    def get(relative):
        with urllib.request.urlopen(release.ORIGINS[target] + relative, timeout=30) as response:
            assert response.status == 200
            return response.read()

    live, ready = (json.loads(get("/api/health/" + route)) for route in ("live", "ready"))
    assert live["ok"] and live["sha"] == image["sourceCommit"]
    assert ready["ok"] and ready["checks"]["database"] == "ok"
    manifest = json.loads(get("/cashier-ticket-correction-release.json"))
    assert manifest["releaseId"] == image["releaseId"]
    assert manifest["baseImageDigest"] == release.BASE
    previous = json.loads(get("/cashier-break-controls-release.json"))
    assert previous["releaseId"] == manifest["previousRelease"]
    assets = [entry for entry in manifest["files"] if entry["path"].startswith(".next/static/")]
    assert assets
    for item in assets:
        body = get("/_next/" + item["path"].removeprefix(".next/"))
        assert hashlib.sha256(body).hexdigest() == item["sha256"], item["path"]
    result = dict(ok=True, target=target, revision=current["id"], digest=image["digest"],
                  database="ok", assetsVerified=len(assets), releaseId=image["releaseId"])
    if target == "staging":
        release.save("staging-http.json", result)
    else:
        release.save("production-verified.json", result)
    print(json.dumps(result))


def run_staging_test(commit):
    checked = release.read("staging-http.json")
    stage = release.active("staging")
    assert stage["image"]["imageDigest"] == checked["digest"]
    assert release.database_name(stage) == "lemuria_staging"
    staging_folder = "b1gpfp37hftb0vfqsdl6"
    worker = "staging-cashier-ticket-correction-qa-worker.cjs"
    layer = release.WORK / "qa-layer.tar"
    with tarfile.open(layer, "w") as archive:
        archive.add(SCRIPTS / worker, "app/" + worker)
    crane = str(Path.home() / "lemuria-crm-report-fix-20261104/tools/crane")
    tag = release.REPOSITORY + ":staging-cashier-ticket-correction-qa-" + commit[:8]
    token = release.run(["yc", "iam", "create-token"])
    with tempfile.TemporaryDirectory(prefix="lemuria-qa-registry-") as auth:
        env = dict(os.environ, DOCKER_CONFIG=auth)
        subprocess.run([crane, "auth", "login", "cr.yandex", "-u", "iam", "--password-stdin"],
                       input=token, text=True, capture_output=True, check=True, env=env, timeout=30)
        release.run([crane, "append", "-b", release.REPOSITORY + "@" + checked["digest"],
                     "-f", str(layer), "-t", tag], env=env, timeout=180)
        digest = release.run([crane, "digest", tag], env=env)
    assert re.fullmatch(r"sha256:[a-f0-9]{64}", digest)
    created = json.loads(release.run(["yc", "serverless", "container", "create", "--folder-id", staging_folder,
        "--name", "lemuria-ticket-qa-" + commit[:8], "--format", "json-rest"]))
    cid = created["id"]
    try:
        image = dict(image=release.REPOSITORY + "@" + digest, sourceCommit=commit,
                     releaseId="temporary-cashier-ticket-qa")
        payload = release.payload(stage, "staging", image)
        payload.update(containerId=cid, executionTimeout="120s", concurrency="1")
        payload.pop("provisionPolicy", None)
        payload.pop("asyncInvocationConfig", None)
        payload["imageSpec"].update(command={"command": ["node"]}, args={"args": ["/app/" + worker]})
        headers = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}
        request = urllib.request.Request(
            "https://serverless-containers.api.cloud.yandex.net/containers/v1/revisions:deploy",
            method="POST", headers=headers, data=json.dumps(payload).encode(),
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            operation = json.load(response)
        print(json.dumps({"testing": True, "operation": operation["id"]}), flush=True)
        for _ in range(24):
            revisions = json.loads(release.run(["yc", "serverless", "container", "revision", "list",
                "--container-id", cid, "--format", "json-rest"]))
            if any(row["status"] == "ACTIVE" and row["image"]["imageDigest"] == digest for row in revisions):
                break
            time.sleep(4)
        else:
            raise RuntimeError("Temporary QA container is not ready")
        invoke = urllib.request.Request("https://" + cid + ".containers.yandexcloud.net/test",
            method="POST", data=b"{}", headers=headers)
        try:
            with urllib.request.urlopen(invoke, timeout=115) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            result = json.loads(error.read())
        print(json.dumps(result), flush=True)
        assert result["ok"] and result["ticketCount"] == 2 and result["reconciled"], result
        release.save("staging-accepted.json", {**checked, **result})
    finally:
        release.run(["yc", "serverless", "container", "delete", "--id", cid], timeout=90)


if __name__ == "__main__":
    action = sys.argv[1]
    release.WORK = Path(sys.argv[2]).resolve()
    assert release.WORK.is_dir() and release.WORK.parent == Path(tempfile.gettempdir())
    if action == "snapshot":
        release.snapshot()
    elif action == "build":
        build(Path(sys.argv[3]).resolve(), sys.argv[4])
    elif action in {"deploy-staging", "deploy-production"}:
        release.deploy(action.removeprefix("deploy-"))
    elif action in {"verify-staging", "verify-production"}:
        verify(action.removeprefix("verify-"))
    elif action == "test-staging":
        run_staging_test(sys.argv[3])
    elif action in {"rollback-staging", "rollback-production"}:
        release.deploy(action.removeprefix("rollback-"), rollback=True)
    else:
        raise SystemExit("Unknown release action")
