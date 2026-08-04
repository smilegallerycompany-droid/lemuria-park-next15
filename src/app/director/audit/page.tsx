"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/director/PageHeader";
import { directorFetch, formatDateTime } from "@/lib/director/client";

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  actor: { name: string; email: string; role: string } | null;
};

export default function DirectorAuditPage() {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    directorFetch<{ logs: AuditRow[] }>("/api/director/audit?limit=200")
      .then((data) => setLogs(data.logs))
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка"));
  }, []);

  return (
    <>
      <PageHeader title="Audit" description="Журнал действий staff/director с фильтрами через API." />
      {error ? <div className="director-alert error">{error}</div> : null}

      <section className="director-panel">
        <div className="director-table-wrap">
          <table className="director-table">
            <thead>
              <tr>
                <th>Время</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.createdAt)}</td>
                  <td>
                    {log.actor ? (
                      <>
                        {log.actor.name}
                        <div style={{ fontSize: 12, color: "var(--dir-muted)" }}>{log.actor.role}</div>
                      </>
                    ) : (
                      "system"
                    )}
                  </td>
                  <td>
                    <span className="director-badge orange">{log.action}</span>
                  </td>
                  <td>
                    {log.entityType}
                    {log.entityId ? ` · ${log.entityId.slice(0, 8)}…` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
