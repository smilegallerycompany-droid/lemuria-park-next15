#!/usr/bin/env python3
"""Deploy the separate product sales over the pinned live image, via staging."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request

SCRIPTS = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("release", SCRIPTS / "cloud-cookie-release.py")
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)
release.BASE = "sha256:c9d562672b4ec85ab07ad357f64584bf50ea547fb08f3704103edbfdf87ecd7b"
original_payload = release.payload


def payload(before, target, image=None):
    request = original_payload(before, target, image)
    version = image["releaseId"] if image else "Restore " + before["id"]
    request["description"] = version + "; standalone feed and photo at cashier"
    return request


release.payload = payload


def build(root, commit):
    assert release.active("production")["image"]["imageDigest"] == release.BASE
    assert release.read("production-before.json")["image"]["imageDigest"] == release.BASE
    manifest = json.loads(release.run([
        "node", str(SCRIPTS / "build-cashier-standalone-extras-overlay.cjs"),
        str(root), commit,
    ], timeout=120))
    assert manifest["baseImageDigest"] == release.BASE
    layer = release.WORK / "overlay.tar"
    with tarfile.open(layer, "w") as archive:
        for name in [*(item["path"] for item in manifest["files"]), "public/cashier-standalone-extras-release.json"]:
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
    manifest = json.loads(get("/cashier-standalone-extras-release.json"))
    assert manifest["releaseId"] == image["releaseId"]
    assert manifest["baseImageDigest"] == release.BASE
    previous = json.loads(get("/cashier-end-time-release.json"))
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
    stage = release.read("staging-http.json")
    assert release.active("staging")["image"]["imageDigest"] == stage["digest"]
    spec = importlib.util.spec_from_file_location("qa", SCRIPTS / "cloud-staging-finance-qa.py")
    qa = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(qa)
    qa.r.WORK = release.WORK
    qa.WORKER = "staging-standalone-extras-qa-worker.cjs"
    qa.IMAGE_PREFIX = "staging-standalone-extras-qa"
    qa.FOLDERS = ("b1gpfp37hftb0vfqsdl6", "b1g6627fmdlm7ms0eah1")
    qa.build(commit, (release.WORK / "audit-before.json").exists())
    before = release.read("audit-before.json")
    worker = release.read("container.json")["id"]
    digest = release.read("qa-image.json")["digest"]
    assert qa.active(worker)["image"]["imageDigest"] == before["image"]["imageDigest"]

    def wait_until(expected):
        for _ in range(24):
            if qa.active(worker)["image"]["imageDigest"] == expected:
                return
            time.sleep(4)
        raise RuntimeError("QA worker did not reach expected revision")

    qa.deploy()
    try:
        wait_until(digest)
        qa.call("test")
        result = release.read("test-result.json")
        assert result["ok"] and result["reportCorrect"] and result["orderCount"] == 0, result
    finally:
        if qa.active(worker)["image"]["imageDigest"] == digest:
            qa.deploy(restore=True)
            wait_until(before["image"]["imageDigest"])
    release.save("staging-accepted.json", {**stage, "checkoutTest": result})


if __name__ == "__main__":
    action = sys.argv[1]
    release.WORK = Path(sys.argv[2]).resolve()
    assert release.WORK.is_dir() and release.WORK.parent == Path(tempfile.gettempdir())
    if action == "snapshot":
        release.snapshot()
    elif action == "build":
        build(Path(sys.argv[3]).resolve(), sys.argv[4])
    elif action == "qa-staging":
        run_staging_test(sys.argv[3])
    elif action in {"deploy-staging", "deploy-production"}:
        release.deploy(action.removeprefix("deploy-"))
    elif action in {"verify-staging", "verify-production"}:
        verify(action.removeprefix("verify-"))
    elif action in {"rollback-staging", "rollback-production"}:
        release.deploy(action.removeprefix("rollback-"), rollback=True)
    else:
        raise SystemExit("Unknown release action")
