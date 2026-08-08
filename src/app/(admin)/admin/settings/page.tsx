"use client";

import Link from "next/link";
import { PageHeader } from "@/components/internal";

export default function AdminSettingsPage() {
  return (
    <div className="director-page">
      <PageHeader
        title="Глобальные настройки"
        description="Критичные transaction constants не меняются вслепую"
        actions={
          <Link className="director-btn" href="/director/settings">
            Настройки директора
          </Link>
        }
      />
    </div>
  );
}
