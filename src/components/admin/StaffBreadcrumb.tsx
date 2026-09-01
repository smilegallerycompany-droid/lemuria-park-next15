"use client";

import Link from "next/link";
import { useStaffBasePath, useStaffPortal } from "@/lib/staff-portal";

export function StaffBreadcrumb({ current }: { current: string }) {
  const portal = useStaffPortal();
  const base = useStaffBasePath();
  if (portal !== "admin") return null;
  return (
    <nav className="admin-breadcrumb" aria-label="Навигация раздела">
      <Link href={base}>Администрирование</Link>
      <span aria-hidden>/</span>
      <span>{current}</span>
    </nav>
  );
}
