"use client";

import Link from "next/link";
import { PageHeader } from "@/components/internal";

export default function AdminOrdersPage() {
  return (
    <div className="director-page">
      <PageHeader
        title="Заказы"
        description="Полный список заказов доступен в панели директора"
        actions={
          <Link className="director-btn" href="/director/orders">
            Открыть заказы
          </Link>
        }
      />
    </div>
  );
}
