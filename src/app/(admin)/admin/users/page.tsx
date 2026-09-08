"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader, ConfirmDialog } from "@/components/internal";
import { directorFetch } from "@/lib/director/client";
import { labelRole, labelStatus } from "@/lib/director/labels";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  locations: Array<{ location: { id: string; name: string; city: string } }>;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [nextRole, setNextRole] = useState("CASHIER");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | { title: string; run: () => Promise<void> }>(null);

  async function load() {
    const params = new URLSearchParams();
    if (role) params.set("role", role);
    if (q) params.set("q", q);
    const data = await directorFetch<{ users: UserRow[] }>(`/api/admin/users?${params}`);
    setUsers(data.users);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Ошибка"));
  }, []);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await directorFetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...body, confirm: true }),
      });
      await load();
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  }

  function onSelect(u: UserRow) {
    setSelected(u);
    setNextRole(u.role === "OWNER" ? "OWNER" : u.role);
  }

  function submitRole(e: FormEvent) {
    e.preventDefault();
    if (!selected || nextRole === selected.role) return;
    setConfirm({
      title: `Сменить роль ${selected.name} на «${labelRole(nextRole)}»?`,
      run: () => patch(selected.id, { role: nextRole }),
    });
  }

  return (
    <div className="director-page">
      <PageHeader title="Пользователи" description="Роли и доступ сотрудников. Владельца изменить нельзя." />
      {error ? <p className="director-error">{error}</p> : null}
      <div className="director-toolbar" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Роль">
          <option value="">Все роли</option>
          {["OWNER", "ADMIN", "DIRECTOR", "CASHIER"].map((r) => (
            <option key={r} value={r}>
              {labelRole(r)}
            </option>
          ))}
        </select>
        <input placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск" />
        <button type="button" className="director-btn primary" onClick={() => load().catch(() => undefined)}>
          Применить
        </button>
      </div>
      <div className="director-table-wrap">
        <table className="director-table">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Эл. почта</th>
              <th>Роль</th>
              <th>Локации</th>
              <th>Статус</th>
              <th>Последний вход</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{labelRole(u.role)}</td>
                <td>{u.locations.map((l) => l.location.city).join(", ") || "—"}</td>
                <td>{labelStatus(u.status)}</td>
                <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("ru-RU") : "—"}</td>
                <td>
                  <button type="button" className="director-btn secondary" onClick={() => onSelect(u)}>
                    Изменить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <section className="director-card" style={{ marginTop: 16, padding: 16 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>
            {selected.name} · {selected.email}
          </h2>
          <form onSubmit={submitRole} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label>
              Роль{" "}
              <select
                value={nextRole}
                onChange={(e) => setNextRole(e.target.value)}
                disabled={selected.role === "OWNER" || busy}
              >
                {["CASHIER", "DIRECTOR", "ADMIN"].map((r) => (
                  <option key={r} value={r}>
                    {labelRole(r)}
                  </option>
                ))}
                {selected.role === "OWNER" ? <option value="OWNER">{labelRole("OWNER")}</option> : null}
              </select>
            </label>
            <button type="submit" className="director-btn primary" disabled={busy || nextRole === selected.role}>
              Сохранить роль
            </button>
            {selected.status === "ACTIVE" ? (
              <button
                type="button"
                className="director-btn secondary"
                disabled={busy || selected.role === "OWNER"}
                onClick={() =>
                  setConfirm({
                    title: `Отключить ${selected.name}? Сессии будут отозваны.`,
                    run: () => patch(selected.id, { status: "DISABLED", revokeSessions: true }),
                  })
                }
              >
                Отключить
              </button>
            ) : (
              <button
                type="button"
                className="director-btn primary"
                disabled={busy}
                onClick={() => void patch(selected.id, { status: "ACTIVE" })}
              >
                Включить
              </button>
            )}
            <button type="button" className="director-btn secondary" onClick={() => setSelected(null)}>
              Закрыть
            </button>
          </form>
          <p style={{ margin: "12px 0 0", color: "var(--muted)", fontSize: 13 }}>
            Назначить OWNER и отключить последнего OWNER нельзя. Секреты не отображаются.
          </p>
        </section>
      ) : null}

      {confirm ? (
        <ConfirmDialog
          open
          title={confirm.title}
          confirmLabel="Подтвердить"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const run = confirm.run;
            setConfirm(null);
            void run();
          }}
        />
      ) : null}
    </div>
  );
}
