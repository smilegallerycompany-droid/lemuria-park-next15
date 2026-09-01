"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getPublicOrder } from "@/lib/api/public";

/**
 * Polls order status after return from YooKassa. Never marks paid on the client.
 * Staging test pay is a separate protected server adapter — not a fake ЮKassa success.
 */
export function PaymentStatusClient({
  orderNumber,
  confirmationUrl,
  paymentConfigured,
  stagingTestPayEnabled,
}: {
  orderNumber: string;
  confirmationUrl: string | null;
  paymentConfigured: boolean;
  stagingTestPayEnabled?: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [stagingBusy, setStagingBusy] = useState(false);
  const [stagingError, setStagingError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const order = await getPublicOrder(orderNumber);
        if (cancelled) return;
        if (order.status === "PAID") {
          router.replace(`/success?order=${encodeURIComponent(orderNumber)}`);
          return;
        }
        if (order.status === "EXPIRED" || order.status === "CANCELLED") {
          setMessage("Заказ больше недоступен для оплаты.");
          router.refresh();
        }
      } catch {
        // keep polling quietly
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [orderNumber, router]);

  async function stagingPay() {
    if (stagingBusy) return;
    setStagingBusy(true);
    setStagingError(null);
    try {
      const res = await fetch("/api/public/staging-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber }),
      });
      const payload = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!payload.ok) {
        setStagingError(payload.error?.message ?? "Тестовая оплата не прошла");
        return;
      }
      router.replace(`/success?order=${encodeURIComponent(orderNumber)}`);
    } catch {
      setStagingError("Сеть недоступна. Повторите попытку — заказ не будет оплачен дважды.");
    } finally {
      setStagingBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
      {paymentConfigured && confirmationUrl ? (
        <a className="button button-orange" href={confirmationUrl}>
          Перейти к оплате в ЮKassa
        </a>
      ) : stagingTestPayEnabled ? (
        <>
          <p style={{ color: "var(--orange-deep)", margin: 0, fontWeight: 700 }}>
            STAGING / TEST: ЮKassa не подключена. Это не настоящая оплата.
          </p>
          <button
            type="button"
            className="button button-orange"
            disabled={stagingBusy}
            onClick={() => void stagingPay()}
          >
            {stagingBusy ? "Проводим тестовую оплату…" : "Тестовая оплата STAGING"}
          </button>
          {stagingError ? <p style={{ color: "var(--orange-deep)", margin: 0 }}>{stagingError}</p> : null}
        </>
      ) : (
        <p style={{ color: "var(--orange-deep)", margin: 0, fontWeight: 700 }}>
          ЮKassa ещё не подключена (нет YUKASSA_SHOP_ID / YUKASSA_SECRET_KEY). Оплата не
          создаётся и успех не симулируется.
        </p>
      )}
      {message && <p style={{ color: "var(--muted)", margin: 0 }}>{message}</p>}
      <p style={{ color: "var(--muted)", margin: 0, fontSize: 13 }}>
        После подтверждения оплаты страница обновится автоматически по статусу заказа.
      </p>
    </div>
  );
}
