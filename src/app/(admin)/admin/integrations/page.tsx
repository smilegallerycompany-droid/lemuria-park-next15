"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/internal";
import { directorFetch } from "@/lib/director/client";

export default function AdminIntegrationsPage() {
  const [data, setData] = useState<Record<string, { status: string; shopIdMasked?: string | null }> | null>(
    null,
  );
  useEffect(() => {
    directorFetch<Record<string, { status: string; shopIdMasked?: string | null }>>(
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
                <h2 style={{ marginTop: 0, fontSize: 16 }}>{key}</h2>
                <p>
                  Статус: <strong>{value.status}</strong>
                </p>
                {"shopIdMasked" in value && value.shopIdMasked ? (
                  <p>Shop ID: {value.shopIdMasked}</p>
                ) : null}
              </section>
            ))
          : "Загрузка…"}
      </div>
    </div>
  );
}
