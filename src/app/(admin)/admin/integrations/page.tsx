"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/internal";
import { directorFetch } from "@/lib/director/client";
import { labelConfig, labelIntegration } from "@/lib/director/labels";

export default function AdminIntegrationsPage() {
  const [data, setData] = useState<
    Record<string, { status: string; shopIdMasked?: string | null; provider?: string }> | null
  >(null);
  useEffect(() => {
    directorFetch<Record<string, { status: string; shopIdMasked?: string | null; provider?: string }>>(
      "/api/admin/integrations",
    )
      .then(setData)
      .catch(() => undefined);
  }, []);

  return (
    <div className="director-page">
      <PageHeader title="Интеграции" description="Только статусы, без секретов" />
      <div className="director-grid-2">
        {data
          ? Object.entries(data).map(([key, value]) => (
              <section key={key} className="director-card" style={{ padding: 16 }}>
                <h2 style={{ marginTop: 0, fontSize: 16 }}>{labelIntegration(key)}</h2>
                {"provider" in value && value.provider ? (
                  <p>Сервис: {value.provider === "Yandex Maps" ? "Яндекс Карты" : value.provider}</p>
                ) : null}
                <p>
                  Статус: <strong>{labelConfig(value.status)}</strong>
                </p>
                {"shopIdMasked" in value && value.shopIdMasked ? (
                  <p>Идентификатор магазина: {value.shopIdMasked}</p>
                ) : null}
                {key === "maps" && (value.status === "Not configured" || value.status === "NOT_CONFIGURED") ? (
                  <p style={{ fontSize: 13, opacity: 0.8 }}>
                    На сайте показывается запасная карта без ключа API.
                  </p>
                ) : null}
              </section>
            ))
          : "Загрузка…"}
      </div>
    </div>
  );
}
