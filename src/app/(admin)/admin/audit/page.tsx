"use client";

import Link from "next/link";
import { PageHeader } from "@/components/internal";

export default function AdminAuditPage() {
  return (
    <div className="director-page">
      <PageHeader
        title="Аудит"
        description="Журнал действий"
        actions={
          <Link className="director-btn" href="/director/audit">
            Открыть аудит
          </Link>
        }
      />
    </div>
  );
}
