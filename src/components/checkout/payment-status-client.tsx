"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getPublicOrder } from "@/lib/api/public";

/**
 * Polls order status after return from YooKassa. Never marks paid on the client.
 */
export function PaymentStatusClient({
  orderNumber,
  confirmationUrl,
  paymentConfigured,
}: {
  orderNumber: string;
  confirmationUrl: string | null;
  paymentConfigured: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

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

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
      {paymentConfigured && confirmationUrl ? (
        <a className="button button-orange" href={confirmationUrl}>
          Перейти к оплате в ЮKassa
        </a>
      ) : (
        <p style={{ color: "var(--orange-deep)", margin: 0, fontWeight: 700 }}>
          ЮKassa ещё не подключена (нет YUKASSA_SHOP_ID / YUKASSA_SECRET_KEY). Оплата не
          создаётся и успех не симулируется.
        </p>
      )}
      {message && <p style={{ color: "var(--muted)", margin: 0 }}>{message}</p>}
      <p style={{ color: "var(--muted)", margin: 0, fontSize: 13 }}>
        После реальной оплаты страница обновится автоматически по статусу заказа.
      </p>
    </div>
  );
}
