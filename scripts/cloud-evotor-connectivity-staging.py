#!/usr/bin/env python3
"""Add a connectivity-only Evotor endpoint to the isolated Lemuria staging deployment."""

import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import tempfile
import urllib.error
import urllib.request

SCRIPTS = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("release", SCRIPTS / "cloud-cookie-release.py")
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)
release.BASE = "sha256:f96f0fe6c57380b598c714b050fb43109a559f72aca35d5ac0fe7405d21bc4bb"
default_payload = release.payload
ENDPOINT = "/api/integrations/evotor/checkout"


def payload(before, target, image=None):
    assert target == "staging"
    request = default_payload(before, target, image)
    request["description"] = image["releaseId"] if image else "Restore staging " + before["id"]
    return request


release.payload = payload


def build(root, commit):
    assert re.fullmatch(r"[0-9a-f]{40}", commit)
    assert release.active("staging")["image"]["imageDigest"] == release.BASE
    files = json.loads(release.run([
        "node", str(SCRIPTS / "build-evotor-connectivity-overlay.cjs"), str(root),
    ], timeout=120))
    layer = release.WORK / "evotor-connectivity.tar"
    with tarfile.open(layer, "w") as archive:
        for name in files:
            assert not name.startswith("/") and ".." not in Path(name).parts
            archive.add(root / name, arcname="app/" + name, recursive=False)
    crane = str(Path.home() / "lemuria-crm-report-fix-20261104/tools/crane")
    name = "evotor-connectivity-staging-" + commit[:8]
    uri = release.REPOSITORY + ":" + name
    with tempfile.TemporaryDirectory(prefix="lemuria-evotor-registry-") as auth:
        env = dict(os.environ, DOCKER_CONFIG=auth)
        subprocess.run([crane, "auth", "login", "cr.yandex", "-u", "iam", "--password-stdin"],
                       input=release.run(["yc", "iam", "create-token"]), text=True,
                       capture_output=True, check=True, env=env, timeout=30)
        release.run([crane, "append", "-b", release.REPOSITORY + "@" + release.BASE,
                     "-f", str(layer), "-t", uri], env=env, timeout=180)
        digest = release.run([crane, "digest", uri], env=env)
    assert re.fullmatch(r"sha256:[0-9a-f]{64}", digest)
    release.save("image.json", dict(releaseId=name, sourceCommit=commit, digest=digest,
                                    image=release.REPOSITORY + "@" + digest))


def request(target, path, body=None, authorized=False):
    headers = {"Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if authorized:
        headers["Authorization"] = "Bearer lemuria-evotor-staging-connectivity"
    req = urllib.request.Request(release.ORIGINS[target] + path, headers=headers,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=20) as result:
            return result.status, json.load(result)
    except urllib.error.HTTPError as error:
        return error.code, {}


def verify():
    image = release.read("image.json")
    assert release.active("staging")["image"]["imageDigest"] == image["digest"]
    status, ready = request("staging", "/api/health/ready")
    assert status == 200 and ready["ok"] and ready["checks"]["database"] == "ok"
    status, check = request("staging", ENDPOINT)
    assert status == 200 and check["data"]["mode"] == "CONNECTIVITY_ONLY"
    assert request("staging", ENDPOINT, {"action": "claim"})[0] == 401
    status, claim = request("staging", ENDPOINT, {"action": "claim"}, authorized=True)
    assert status == 200 and claim["data"] == {
        "sale": None, "unresolvedRequestId": None, "mode": "CONNECTIVITY_ONLY",
    }
    assert request("staging", ENDPOINT, {"action": "result"}, authorized=True)[0] == 409
    assert release.active("production")["id"] == release.read("production-before.json")["id"]
    print(json.dumps(dict(staging=release.ORIGINS["staging"] + ENDPOINT, verified=True,
                          mode="CONNECTIVITY_ONLY", productionRevisionPreserved=True)))


if __name__ == "__main__":
    action = sys.argv[1]
    release.WORK = Path(sys.argv[2]).resolve()
    assert release.WORK.is_dir() and release.WORK.parent == Path(tempfile.gettempdir())
    if action == "snapshot":
        release.snapshot()
    elif action == "build":
        build(Path(sys.argv[3]).resolve(), sys.argv[4])
    elif action == "deploy-staging":
        release.deploy("staging")
    elif action == "verify-staging":
        verify()
    elif action == "rollback-staging":
        release.deploy("staging", rollback=True)
    else:
        raise SystemExit("Only staging is supported")
