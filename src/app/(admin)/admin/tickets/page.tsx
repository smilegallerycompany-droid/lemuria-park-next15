"use client";

import Link from "next/link";
import { PageHeader } from "@/components/internal";

export default function AdminTicketsPage() {
  return (
    <div className="director-page">
      <PageHeader
        title="Билеты"
        description="Поиск и фильтры билетов"
        actions={
          <Link className="director-btn" href="/director/tickets">
            Открыть билеты
          </Link>
        }
      />
    </div>
  );
}
