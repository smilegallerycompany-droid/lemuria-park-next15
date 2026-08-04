"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/director/PageHeader";
import { directorFetch } from "@/lib/director/client";
import { formatMoneyFromKopecks } from "@/lib/utils";

type PriceRow = {
  id: string;
  dayType: string;
  priceAmount: number;
  isActive: boolean;
  location: { name: string };
  ticketType: { code: string; name: string };
};

type LocationOption = { id: string; name: string };
type TicketTypeOption = { id: string; code: string; name: string };

export default function DirectorPricesPage() {
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [ticketTypes, setTicketTypes] = useState<TicketTypeOption[]>([]);
  const [filterLocationId, setFilterLocationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    locationId: "",
    ticketTypeId: "",
    dayType: "WEEKDAY",
    priceRubles: "",
  });

  async function loadPrices(locationId?: string) {
    const query = locationId ? `?locationId=${locationId}` : "";
    const data = await directorFetch<{ prices: PriceRow[] }>(`/api/director/prices${query}`);
    setPrices(data.prices);
  }

  useEffect(() => {
    Promise.all([
      directorFetch<{ locations: LocationOption[] }>("/api/director/locations"),
      directorFetch<{ ticketTypes: TicketTypeOption[] }>("/api/director/ticket-types"),
    ])
      .then(([locationsData, typesData]) => {
        setLocations(locationsData.locations);
        setTicketTypes(typesData.ticketTypes);
        const firstLocation = locationsData.locations[0]?.id ?? "";
        setFilterLocationId(firstLocation);
        setForm((prev) => ({
          ...prev,
          locationId: firstLocation,
          ticketTypeId: typesData.ticketTypes[0]?.id ?? "",
        }));
        return loadPrices(firstLocation || undefined);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка"));
  }, []);

  useEffect(() => {
    loadPrices(filterLocationId || undefined).catch((err) =>
      setError(err instanceof Error ? err.message : "Ошибка"),
    );
  }, [filterLocationId]);

  async function createPrice() {
    const rubles = Number(form.priceRubles.replace(",", "."));
    if (!form.locationId || !form.ticketTypeId || Number.isNaN(rubles)) return;
    setError(null);
    try {
      await directorFetch("/api/director/prices", {
        method: "POST",
        body: JSON.stringify({
          locationId: form.locationId,
          ticketTypeId: form.ticketTypeId,
          dayType: form.dayType,
          priceAmount: Math.round(rubles * 100),
        }),
      });
      setForm((prev) => ({ ...prev, priceRubles: "" }));
      await loadPrices(filterLocationId || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать");
    }
  }

  async function toggleActive(price: PriceRow) {
    try {
      await directorFetch(`/api/director/prices/${price.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !price.isActive }),
      });
      await loadPrices(filterLocationId || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка обновления");
    }
  }

  return (
    <>
      <PageHeader
        title="Prices"
        description="Правила цен в копейках на сервере; ввод и отображение — в рублях."
        actions={
          <select value={filterLocationId} onChange={(e) => setFilterLocationId(e.target.value)}>
            <option value="">Все локации</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        }
      />
      {error ? <div className="director-alert error">{error}</div> : null}

      <section className="director-panel" style={{ marginBottom: 18 }}>
        <div className="director-panel-head">
          <h2>Новое правило</h2>
        </div>
        <div className="director-form-grid">
          <div className="director-field">
            <label>Локация</label>
            <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>
          <div className="director-field">
            <label>Тип билета</label>
            <select value={form.ticketTypeId} onChange={(e) => setForm({ ...form, ticketTypeId: e.target.value })}>
              {ticketTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>
          <div className="director-field">
            <label>Day type</label>
            <select value={form.dayType} onChange={(e) => setForm({ ...form, dayType: e.target.value })}>
              <option value="WEEKDAY">WEEKDAY</option>
              <option value="WEEKEND">WEEKEND</option>
            </select>
          </div>
          <div className="director-field">
            <label>Цена (₽)</label>
            <input
              value={form.priceRubles}
              onChange={(e) => setForm({ ...form, priceRubles: e.target.value })}
              placeholder="900"
            />
          </div>
        </div>
        <div style={{ padding: "0 18px 18px" }}>
          <button type="button" className="director-btn primary" onClick={createPrice}>
            Добавить
          </button>
        </div>
      </section>

      <section className="director-panel">
        <div className="director-table-wrap">
          <table className="director-table">
            <thead>
              <tr>
                <th>Локация</th>
                <th>Тип</th>
                <th>Day</th>
                <th>Цена</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {prices.map((price) => (
                <tr key={price.id}>
                  <td>{price.location.name}</td>
                  <td>
                    {price.ticketType.name}
                    <div style={{ fontSize: 12, color: "var(--dir-muted)" }}>{price.ticketType.code}</div>
                  </td>
                  <td>{price.dayType}</td>
                  <td>{formatMoneyFromKopecks(price.priceAmount)}</td>
                  <td>
                    <span className={`director-badge ${price.isActive ? "green" : "neutral"}`}>
                      {price.isActive ? "ACTIVE" : "OFF"}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="director-btn secondary" onClick={() => toggleActive(price)}>
                      {price.isActive ? "Выключить" : "Включить"}
                    </button>
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
