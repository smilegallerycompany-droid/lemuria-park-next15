"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/internal";
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

  return (
    <div className="director-page">
      <PageHeader title="Пользователи" description="ADMIN / OWNER управление ролями и доступом" />
      {error ? <p className="director-error">{error}</p> : null}
      <div className="director-toolbar" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Все роли</option>
          {["OWNER", "ADMIN", "DIRECTOR", "CASHIER"].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="director-btn" onClick={() => load().catch(() => undefined)}>
          Применить
        </button>
      </div>
      <div className="director-table-wrap">
        <table className="director-table">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Email</th>
              <th>Role</th>
              <th>Locations</th>
              <th>Status</th>
              <th>Last login</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
