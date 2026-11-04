"""Proposed external sender. Runs only after the GitHub OIDC scope is approved.

No database access, local credential files, report artifacts, or financial logging.
"""
import json
import os
import re
import urllib.error
import urllib.request


def call(url, *, token=None, data=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(
        url, data=None if data is None else json.dumps(data).encode(), headers=headers,
        method="GET" if data is None else "POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=35) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"HTTP_{error.code}") from None
    except Exception:
        # urllib exceptions may contain credential-bearing URLs. Never log them.
        raise RuntimeError("NETWORK_OR_RESPONSE_ERROR") from None


def main():
    iam = os.environ["YC_IAM_TOKEN"]
    print("::add-mask::" + iam)
    ids = json.loads(os.environ["REPORT_CHAT_IDS"])
    # Initial release is owner only; expanding this requires an explicit change.
    if not isinstance(ids, list) or len(ids) != 1 or not re.fullmatch(r"\d+", str(ids[0])):
        raise RuntimeError("OWNER_RECIPIENT_NOT_CONFIGURED")
    worker = os.environ["REPORT_WORKER_URL"]
    if worker != "https://bbar83r32o43u8ipsbo3.containers.yandexcloud.net/":
        raise RuntimeError("UNEXPECTED_REPORT_SOURCE")
    report = call(worker, token=iam, data={"mode": "preview"})
    if not report.get("ok") or not isinstance(report.get("text"), str):
        raise RuntimeError("REPORT_NOT_READY")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", report.get("date", "")):
        raise RuntimeError("INVALID_REPORT_DATE")
    payload = call(
        "https://payload.lockbox.api.cloud.yandex.net/lockbox/v1/secrets/"
        "e6qo0gctoaoatlf5rtct/payload", token=iam,
    )
    bot_token = next(entry["textValue"] for entry in payload["entries"]
                     if entry["key"] == "TELEGRAM_BOT_TOKEN")
    print("::add-mask::" + bot_token)
    bot_api = "https://api.telegram.org/bot" + bot_token + "/"
    identity = call(bot_api + "getMe")
    if identity.get("result", {}).get("username") != "lemuriapark_reports_bot":
        raise RuntimeError("UNEXPECTED_TELEGRAM_BOT")
    result = call(bot_api + "sendMessage", data={
        "chat_id": str(ids[0]), "text": report["text"],
        "link_preview_options": {"is_disabled": True},
    })
    if not result.get("ok"):
        raise RuntimeError("TELEGRAM_SEND_FAILED")
    print("REPORT_DELIVERED date=" + report["date"] + " recipients=1")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # No traceback: never emit URL/token/body/recipient/financial details.
        code = str(error) if re.fullmatch(r"[A-Z0-9_]+", str(error)) else "REPORT_FAILED"
        raise SystemExit(code) from None
