"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/internal";
import { directorFetch } from "@/lib/director/client";

type Loc = { id: string; name: string; city: string; status: string; slug: string };

export default function AdminLocationsPage() {
  const [locations, setLocations] = useState<Loc[]>([]);
  useEffect(() => {
    directorFetch<{ locations: Loc[] }>("/api/director/locations")
      .then((d) => setLocations(d.locations))
      .catch(() => undefined);
  }, []);

  return (
    <div className="director-page">
      <PageHeader title="Локации" description="Управление через director API" />
      <div className="director-table-wrap">
        <table className="director-table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Город</th>
              <th>Статус</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {locations.map((l) => (
              <tr key={l.id}>
                <td>{l.name}</td>
                <td>{l.city}</td>
                <td>{l.status}</td>
                <td>
                  <Link href={`/director/locations/${l.id}`}>Редактировать</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
