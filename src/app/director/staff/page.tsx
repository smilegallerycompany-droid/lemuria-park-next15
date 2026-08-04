"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/director/PageHeader";
import { ConfirmCheckbox } from "@/components/director/ConfirmCheckbox";
import { directorFetch } from "@/lib/director/client";

type LocationOption = { id: string; name: string };

type StaffRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
  locations: Array<{ location: { id: string; name: string } }>;
};

export default function DirectorStaffPage() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    email: "",
    name: "",
    password: "",
    role: "CASHIER",
    locationIds: [] as string[],
  });
  const [confirmByUser, setConfirmByUser] = useState<Record<string, boolean>>({});

  async function load() {
    const [staffData, locationsData] = await Promise.all([
      directorFetch<{ staff: StaffRow[] }>("/api/director/staff"),
      directorFetch<{ locations: LocationOption[] }>("/api/director/locations"),
    ]);
    setStaff(staffData.staff);
    setLocations(locationsData.locations);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Ошибка"));
  }, []);

  async function createStaffMember() {
    setError(null);
    try {
      await directorFetch("/api/director/staff", {
        method: "POST",
        body: JSON.stringify(createForm),
      });
      setCreateForm({ email: "", name: "", password: "", role: "CASHIER", locationIds: [] });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать");
    }
  }

  async function patchStaff(userId: string, body: Record<string, unknown>) {
    setError(null);
    setMessage(null);
    try {
      const result = await directorFetch<{ temporaryPassword?: string }>(`/api/director/staff/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (result.temporaryPassword) {
        setMessage(`Временный пароль: ${result.temporaryPassword}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  return (
    <>
      <PageHeader title="Staff" description="Кассиры и директора: доступы, локации, блокировка." />
      {error ? <div className="director-alert error">{error}</div> : null}
      {message ? <div className="director-alert success">{message}</div> : null}

      <section className="director-panel" style={{ marginBottom: 18 }}>
        <div className="director-panel-head">
          <h2>Новый сотрудник</h2>
        </div>
        <div className="director-form-grid">
          <div className="director-field">
            <label>Email</label>
            <input value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
          </div>
          <div className="director-field">
            <label>Имя</label>
            <input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
          </div>
          <div className="director-field">
            <label>Пароль</label>
            <input
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
            />
          </div>
          <div className="director-field">
            <label>Роль</label>
            <select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
              <option value="CASHIER">CASHIER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
          <div className="director-field" style={{ gridColumn: "1 / -1" }}>
            <label>Локации</label>
            <select
              multiple
              value={createForm.locationIds}
              onChange={(e) =>
                setCreateForm({
                  ...createForm,
                  locationIds: Array.from(e.target.selectedOptions).map((option) => option.value),
                })
              }
              style={{ minHeight: 96 }}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ padding: "0 18px 18px" }}>
          <button type="button" className="director-btn primary" onClick={createStaffMember}>
            Создать
          </button>
        </div>
      </section>

      <section className="director-panel">
        <div className="director-table-wrap">
          <table className="director-table">
            <thead>
              <tr>
                <th>Сотрудник</th>
                <th>Роль</th>
                <th>Локации</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((user) => {
                const confirmed = confirmByUser[user.id] ?? false;
                return (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name}</strong>
                      <div style={{ fontSize: 12, color: "var(--dir-muted)" }}>{user.email}</div>
                    </td>
                    <td>{user.role}</td>
                    <td>{user.locations.map((item) => item.location.name).join(", ") || "—"}</td>
                    <td>{user.status}</td>
                    <td style={{ minWidth: 280 }}>
                      <ConfirmCheckbox
                        id={`confirm-${user.id}`}
                        checked={confirmed}
                        onChange={(value) => setConfirmByUser((prev) => ({ ...prev, [user.id]: value }))}
                        label="Подтверждаю изменение доступа"
                      />
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        <button
                          type="button"
                          className="director-btn secondary"
                          disabled={!confirmed}
                          onClick={() =>
                            patchStaff(user.id, {
                              confirm: true,
                              resetPassword: true,
                            })
                          }
                        >
                          Reset password
                        </button>
                        <button
                          type="button"
                          className="director-btn danger"
                          disabled={!confirmed || user.status === "DISABLED"}
                          onClick={() => patchStaff(user.id, { confirm: true, status: "DISABLED" })}
                        >
                          Disable
                        </button>
                        <button
                          type="button"
                          className="director-btn secondary"
                          disabled={!confirmed || locations.length === 0}
                          onClick={() =>
                            patchStaff(user.id, {
                              confirm: true,
                              locationIds: locations[0] ? [locations[0].id] : [],
                            })
                          }
                        >
                          Assign 1st location
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
