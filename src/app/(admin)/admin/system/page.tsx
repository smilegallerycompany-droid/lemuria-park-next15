"use client";

import { useEffect, useState } from "react";
import { PageHeader, StatusBadge } from "@/components/internal";
import { directorFetch } from "@/lib/director/client";

type Component = {
  key: string;
  label: string;
  status: "OK" | "WARNING" | "ERROR" | "NOT_CONFIGURED" | "UNKNOWN";
  lastSuccessfulAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  detail?: string | null;
};

function tone(status: Component["status"]): "success" | "warning" | "danger" | "neutral" {
  if (status === "OK") return "success";
  if (status === "WARNING") return "warning";
  if (status === "ERROR") return "danger";
  return "neutral";
}

export default function AdminSystemPage() {
  const [components, setComponents] = useState<Component[]>([]);

  useEffect(() => {
    directorFetch<{ components: Component[] }>("/api/admin/system")
      .then((d) => setComponents(d.components))
      .catch(() => undefined);
  }, []);

  return (
    <div className="director-page">
      <PageHeader
        title="Система"
        description="Operational health без секретов. NOT_CONFIGURED — не fake OK."
      />
      <div className="director-table-wrap">
        <table className="director-table">
          <thead>
            <tr>
              <th>Компонент</th>
              <th>Статус</th>
              <th>Last success</th>
              <th>Last error</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {components.map((c) => (
              <tr key={c.key}>
                <td>
                  <strong>{c.label}</strong>
                  {c.detail ? (
                    <>
                      <br />
                      <small>{c.detail}</small>
                    </>
                  ) : null}
                </td>
                <td>
                  <StatusBadge label={c.status} tone={tone(c.status)} />
                </td>
                <td>
                  {c.lastSuccessfulAt
                    ? new Date(c.lastSuccessfulAt).toLocaleString("ru-RU")
                    : "—"}
                </td>
                <td>
                  {c.lastErrorAt ? new Date(c.lastErrorAt).toLocaleString("ru-RU") : "—"}
                </td>
                <td>{c.lastErrorMessage ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
