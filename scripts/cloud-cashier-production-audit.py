#!/usr/bin/env python3
"""Run the read-only audit in the existing private IAM worker, then restore it."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import time
import urllib.request

SCRIPTS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("release", SCRIPTS / "cloud-cookie-release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
release.WORK = Path(tempfile.gettempdir()) / f"lemuria-cashier-prod-audit-{os.getuid()}"


def active(container):
    rows = json.loads(release.run(["yc", "serverless", "container", "revision", "list",
                                  "--container-id", container, "--format", "json-rest"]))
    return next(row for row in rows if row["status"] == "ACTIVE")


def wait(container, digest):
    for _ in range(20):
        if active(container)["image"]["imageDigest"] == digest:
            return
        time.sleep(4)
    raise TimeoutError("The private worker revision did not activate")


def operation(payload):
    token = release.run(["yc", "iam", "create-token"])
    req = urllib.request.Request(
        "https://serverless-containers.api.cloud.yandex.net/containers/v1/revisions:deploy",
        data=json.dumps(payload).encode(), method="POST",
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=40) as res:
        return json.load(res)["id"]


def settings(row, container, image, description):
    value = {k: copy.deepcopy(row[k]) for k in release.FIELDS if k in row}
    value.update(containerId=container, imageSpec=image, description=description)
    return value


def main():
    rows = json.loads(release.run(["yc", "serverless", "container", "list", "--format", "json-rest"]))
    container = next(row["id"] for row in rows if row["name"] == "lemuria-crm-readonly-audit")
    bindings = json.loads(release.run(["yc", "serverless", "container", "list-access-bindings",
                                      "--id", container, "--format", "json"]))
    assert all(binding["subject"]["type"] != "system" for binding in bindings), "Worker must be private"
    prod = release.active("production")
    release.validate_config(prod, "production")
    assert release.database_name(prod) == "lemuria"
    before = active(container)
    original = before["image"]["imageDigest"]
    assert "cashier-production-audit" not in before.get("description", "")
    release.save("worker-before.json", before)

    crane = str(Path.home() / "lemuria-crm-report-fix-20261104/tools/crane")
    with tempfile.TemporaryDirectory(prefix="lemuria-prod-readonly-") as directory:
        env = dict(os.environ, DOCKER_CONFIG=directory)
        subprocess.run([crane, "auth", "login", "cr.yandex", "-u", "iam", "--password-stdin"],
                       input=release.run(["yc", "iam", "create-token"]), text=True,
                       capture_output=True, check=True, env=env, timeout=30)
        layer = Path(directory) / "audit.tar"
        with tarfile.open(layer, "w") as tar:
            tar.add(SCRIPTS / "cashier-production-audit.cjs", arcname="app/cashier-production-audit.cjs")
        base = release.REPOSITORY + "@" + prod["image"]["imageDigest"]
        tag = release.REPOSITORY + ":cashier-production-audit-20261112"
        release.run([crane, "append", "-b", base, "-f", str(layer), "-t", tag], env=env, timeout=180)
        digest = release.run([crane, "digest", tag], env=env)

    def database_key(name):
        return name == "DATABASE_URL" or name.startswith(("DB_", "DATABASE_"))

    database_env = {k: v for k, v in prod["image"]["environment"].items() if database_key(k)}
    database_env.update(APP_ENV="production", RUN_MIGRATE_ON_START="0", RUN_STAGING_SEED_ON_START="0")
    probe = settings(prod, container, {
        "imageUrl": release.REPOSITORY + "@" + digest, "command": {"command": ["node"]},
        "args": {"args": ["/app/cashier-production-audit.cjs"]}, "workingDir": "/app",
        "environment": database_env,
    }, "cashier-production-audit")
    probe["secrets"] = [item for item in prod.get("secrets", []) if database_key(item["environmentVariable"])]
    probe["executionTimeout"] = "120s"
    restore_image = {key: copy.deepcopy(before["image"][key])
                     for key in ["command", "args", "environment", "workingDir"] if key in before["image"]}
    for key in ["command", "args"]:
        if isinstance(restore_image.get(key), list):
            restore_image[key] = {key: restore_image[key]}
    restore_image["imageUrl"] = before["image"]["imageUrl"].split("@")[0] + "@" + original
    restore = settings(before, container, restore_image, before.get("description") or "Restore private audit worker")
    assert active(container)["id"] == before["id"]
    try:
        operation(probe)
        wait(container, digest)
        token = release.run(["yc", "iam", "create-token"])
        req = urllib.request.Request("https://" + container + ".containers.yandexcloud.net/qa",
                                     headers={"Authorization": "Bearer " + token})
        with urllib.request.urlopen(req, timeout=100) as response:
            result = json.load(response)
        assert result["ok"]
        release.save("audit-result.json", result)
        print(json.dumps(result), flush=True)
    finally:
        operation(restore)
        wait(container, original)
        print('{"workerRestored": true}', flush=True)


if __name__ == "__main__":
    main()
