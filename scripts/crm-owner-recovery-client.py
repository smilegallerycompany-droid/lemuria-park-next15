"""Run manually by the account owner in the signed-in Yandex Cloud Shell.

getpass keeps the new password out of screen output, files and shell history.
"""
import getpass
import json
from pathlib import Path
import subprocess
import urllib.request
import urllib.error


def main():
    checkpoint = Path.home() / "lemuria-crm-audit-20261104"
    config = json.loads((checkpoint / "owner-recovery.json").read_text())
    print("Восстановление доступа владельца CRM Лемурии.")
    print("Пароль вводится скрыто и не сохраняется в файлы.")
    password = getpass.getpass("Новый пароль (от 12 символов): ")
    confirm = getpass.getpass("Повторите новый пароль: ")
    if password != confirm:
        raise SystemExit("Пароли не совпадают. Ничего не изменено.")
    if not 12 <= len(password) <= 128:
        raise SystemExit("Нужно от 12 до 128 символов. Ничего не изменено.")
    if input("Сохранить новый пароль только для аккаунта владельца? Введите ДА: ").strip() != "ДА":
        raise SystemExit("Отменено. Ничего не изменено.")
    iam = subprocess.check_output(["yc", "iam", "create-token"], text=True, timeout=30).strip()
    request = urllib.request.Request(
        "https://" + config["containerId"] + ".containers.yandexcloud.net/recover-owner",
        data=json.dumps({"password": password}).encode(),
        headers={"Authorization": "Bearer " + iam, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        try:
            code = json.load(error).get("error", "UNKNOWN")
        except Exception:
            code = "UNKNOWN"
        raise SystemExit("Восстановление не подтверждено: " + code) from None
    except Exception:
        raise SystemExit("Результат не подтверждён из-за соединения. Не повторяйте без проверки журнала.") from None
    if result.get("ok"):
        print("Пароль владельца обновлён. Старые сессии этого аккаунта отозваны.")
        print("Откройте вкладку CRM и войдите с новым паролем.")
    else:
        raise SystemExit("Восстановление не подтверждено.")


if __name__ == "__main__":
    main()
