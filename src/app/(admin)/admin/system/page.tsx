"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/internal";
import { directorFetch } from "@/lib/director/client";

export default function AdminSystemPage() {
  const [system, setSystem] = useState<Record<string, string | number | null> | null>(null);
  useEffect(() => {
    directorFetch<{ system: Record<string, string | number | null> }>("/api/admin/dashboard")
      .then((d) => setSystem(d.system))
      .catch(() => undefined);
  }, []);

  return (
    <div className="director-page">
      <PageHeader title="Система" description="Operational health без внешних дорогих запросов" />
      <ul className="director-plain-list">
        {system
          ? Object.entries(system).map(([k, v]) => (
              <li key={k}>
                <span>{k}</span>
                <strong>{v == null ? "—" : String(v)}</strong>
              </li>
            ))
          : null}
      </ul>
    </div>
  );
}
