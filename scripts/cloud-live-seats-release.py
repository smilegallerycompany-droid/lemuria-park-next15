#!/usr/bin/env python3
"""Build and promote the pinned seat-availability overlay in Yandex Cloud."""
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
import urllib.request

SCRIPTS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("release", SCRIPTS / "cloud-cookie-release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
release.BASE = "sha256:63b3b8ea263194f4c38843ab37bfbbe154e8fbc35361bb8ffee8922a9fa6ae7c"
release.WORK = Path(tempfile.gettempdir()) / f"lemuria-live-seats-20261112-{os.getuid()}"
original_payload = release.payload


def payload(before, target, image=None):
    request = original_payload(before, target, image)
    request["description"] = (image["releaseId"] if image else "Restore " + before["id"]) + "; seat availability and cashier checkout navigation"
    return request


release.payload = payload


def build(root, commit):
    assert re.fullmatch(r"[a-f0-9]{40}", commit)
    assert release.active("production")["image"]["imageDigest"] == release.BASE
    assert (root.parent.parent / "digest").read_text().strip() == release.BASE
    assert release.read("production-before.json")["image"]["imageDigest"] == release.BASE
    manifest = json.loads(release.run(
        ["node", str(SCRIPTS / "build-live-seats-overlay.cjs"), str(root), commit], timeout=150))
    assert manifest["baseImageDigest"] == release.BASE
    with tarfile.open(release.WORK / "overlay.tar", "w") as archive:
        paths = [item["path"] for item in manifest["files"]] + ["public/live-seats-release.json"]
        for relative in paths:
            assert ".." not in Path(relative).parts
            assert relative.startswith(".next/") or relative == "public/live-seats-release.json"
            archive.add(root / relative, arcname="app/" + relative, recursive=False)

    crane = str(Path.home() / "lemuria-crm-report-fix-20261104/tools/crane")
    with tempfile.TemporaryDirectory(prefix="lemuria-registry-") as auth_dir:
        env = dict(os.environ, DOCKER_CONFIG=auth_dir)
        subprocess.run([crane, "auth", "login", "cr.yandex", "-u", "iam", "--password-stdin"],
                       input=release.run(["yc", "iam", "create-token"]), text=True,
                       capture_output=True, check=True, env=env, timeout=30)
        tag = release.REPOSITORY + ":" + manifest["releaseId"]
        release.run([crane, "append", "-b", release.REPOSITORY + "@" + release.BASE,
                     "-f", str(release.WORK / "overlay.tar"), "-t", tag], env=env, timeout=180)
        digest = release.run([crane, "digest", tag], env=env)
    assert re.fullmatch(r"sha256:[0-9a-f]{64}", digest)
    image = dict(releaseId=manifest["releaseId"], sourceCommit=commit,
                 digest=digest, image=release.REPOSITORY + "@" + digest)
    release.save("image.json", image)
    print(json.dumps({**image, "counts": manifest["counts"], "files": len(manifest["files"])}))


def verify(target):
    image = release.read("image.json")
    active = release.active(target)
    assert active["image"]["imageDigest"] == image["digest"]

    def get(origin, relative):
        with urllib.request.urlopen(origin + relative, timeout=25) as response:
            assert response.status == 200
            return response.read()

    origin = release.ORIGINS[target]
    public_origin = "https://xn--80ajjjbhwgdz8k.xn--p1ai" if target == "production" else origin
    for host in {origin, public_origin}:
        live = json.loads(get(host, "/api/health/live"))
        ready = json.loads(get(host, "/api/health/ready"))
        assert live["ok"] and live["sha"] == image["sourceCommit"]
        assert ready["ok"] and ready["checks"]["database"] == "ok"

    manifest = json.loads(get(public_origin, "/live-seats-release.json"))
    assert manifest["baseImageDigest"] == release.BASE
    assert manifest["releaseId"] == image["releaseId"]
    assets = [entry for entry in manifest["files"] if entry["path"].startswith(".next/static/")]
    booking = cashier = 0
    for entry in assets:
        relative = entry["path"].removeprefix(".next/")
        body = get(origin if "/(cashier)/" in relative else public_origin, "/_next/" + relative)
        assert hashlib.sha256(body).hexdigest() == entry["sha256"]
        if b"seatLocation" in body:
            booking += 1
        if b"seatForeground" in body:
            cashier += 1
    assert booking == 1 and cashier >= 1
    result = dict(ok=True, target=target, revision=active["id"], digest=image["digest"],
                  releaseId=image["releaseId"], database="ok", assetsVerified=len(assets))
    release.save("staging-accepted.json" if target == "staging" else "production-verified.json", result)
    print(json.dumps(result))


if __name__ == "__main__":
    action = sys.argv[1]
    if action == "snapshot":
        release.snapshot()
    elif action == "build":
        build(Path(sys.argv[2]), sys.argv[3])
    elif action in {"deploy-staging", "deploy-production"}:
        release.deploy(action.removeprefix("deploy-"))
    elif action in {"verify-staging", "verify-production"}:
        verify(action.removeprefix("verify-"))
    elif action in {"rollback-staging", "rollback-production"}:
        release.deploy(action.removeprefix("rollback-"), rollback=True)
    else:
        raise SystemExit("Unknown release action")
