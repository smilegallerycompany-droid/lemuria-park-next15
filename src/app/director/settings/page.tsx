"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/director/PageHeader";
import { directorFetch } from "@/lib/director/client";

type SiteSettings = {
  maintenanceMode: boolean;
  reservationTtlMinutes: number;
  paymentTtlMinutes: number;
  defaultCapacity: number;
  defaultSessionInterval: number;
  sessionGenerationDays: number;
  policyUrl: string | null;
  offerUrl: string | null;
};

export default function DirectorSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    directorFetch<{ siteSettings: SiteSettings | null }>("/api/director/content")
      .then((data) => setSettings(data.siteSettings))
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка"));
  }, []);

  async function save() {
    if (!settings) return;
    setSaved(false);
    setError(null);
    try {
      const data = await directorFetch<{ siteSettings: SiteSettings | null }>("/api/director/content", {
        method: "PATCH",
        body: JSON.stringify({ site: settings }),
      });
      setSettings(data.siteSettings);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    }
  }

  if (!settings && !error) return <div className="director-empty">Загрузка…</div>;

  return (
    <>
      <PageHeader
        title="Settings"
        description="Операционные TTL, генерация сеансов и legal URLs."
        actions={
          <button type="button" className="director-btn primary" onClick={save} disabled={!settings}>
            Сохранить
          </button>
        }
      />
      {error ? <div className="director-alert error">{error}</div> : null}
      {saved ? <div className="director-alert success">Настройки сохранены</div> : null}

      {settings ? (
        <section className="director-panel">
          <div className="director-form-grid">
            <div className="director-field">
              <label>Maintenance mode</label>
              <select
                value={settings.maintenanceMode ? "1" : "0"}
                onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.value === "1" })}
              >
                <option value="0">Off</option>
                <option value="1">On</option>
              </select>
            </div>
            <div className="director-field">
              <label>Reservation TTL (min)</label>
              <input
                type="number"
                value={settings.reservationTtlMinutes}
                onChange={(e) => setSettings({ ...settings, reservationTtlMinutes: Number(e.target.value) })}
              />
            </div>
            <div className="director-field">
              <label>Payment TTL (min)</label>
              <input
                type="number"
                value={settings.paymentTtlMinutes}
                onChange={(e) => setSettings({ ...settings, paymentTtlMinutes: Number(e.target.value) })}
              />
            </div>
            <div className="director-field">
              <label>Default capacity</label>
              <input
                type="number"
                value={settings.defaultCapacity}
                onChange={(e) => setSettings({ ...settings, defaultCapacity: Number(e.target.value) })}
              />
            </div>
            <div className="director-field">
              <label>Session interval (min)</label>
              <input
                type="number"
                value={settings.defaultSessionInterval}
                onChange={(e) => setSettings({ ...settings, defaultSessionInterval: Number(e.target.value) })}
              />
            </div>
            <div className="director-field">
              <label>Generation window (days)</label>
              <input
                type="number"
                value={settings.sessionGenerationDays}
                onChange={(e) => setSettings({ ...settings, sessionGenerationDays: Number(e.target.value) })}
              />
            </div>
            <div className="director-field">
              <label>Policy URL</label>
              <input
                value={settings.policyUrl ?? ""}
                onChange={(e) => setSettings({ ...settings, policyUrl: e.target.value || null })}
              />
            </div>
            <div className="director-field">
              <label>Offer URL</label>
              <input
                value={settings.offerUrl ?? ""}
                onChange={(e) => setSettings({ ...settings, offerUrl: e.target.value || null })}
              />
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
