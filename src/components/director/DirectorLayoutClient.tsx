"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { directorFetch } from "@/lib/director/client";

const NAV = [
  { href: "/director", label: "Dashboard" },
  { href: "/director/locations", label: "Locations" },
  { href: "/director/schedule", label: "Schedule" },
  { href: "/director/sessions", label: "Sessions" },
  { href: "/director/prices", label: "Prices" },
  { href: "/director/ticket-types", label: "Ticket types" },
  { href: "/director/orders", label: "Orders" },
  { href: "/director/tickets", label: "Tickets" },
  { href: "/director/staff", label: "Staff" },
  { href: "/director/analytics", label: "Analytics" },
  { href: "/director/content", label: "Content" },
  { href: "/director/audit", label: "Audit" },
  { href: "/director/settings", label: "Settings" },
];

type MeResponse = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export function DirectorLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/director/login";
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    if (isLogin) return;
    directorFetch<MeResponse>("/api/auth/me")
      .then(setMe)
      .catch(() => router.replace("/director/login"));
  }, [isLogin, router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.replace("/director/login");
  }

  if (isLogin) {
    return <div className="director-root">{children}</div>;
  }

  return (
    <div className="director-root">
      <div className="director-shell">
        <aside className="director-sidebar">
          <div className="director-brand">
            <div className="director-brand-mark">L</div>
            <div className="director-brand-copy">
              <strong>Director</strong>
              <small>Lemuria Park</small>
            </div>
          </div>
          <nav className="director-nav" aria-label="Director navigation">
            {NAV.map((item) => {
              const active =
                item.href === "/director"
                  ? pathname === "/director"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={item.href} className={active ? "active" : undefined}>
                  <span className="director-nav-dot" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="director-sidebar-footer">
            {me ? (
              <>
                <div>{me.name}</div>
                <div>{me.email}</div>
                <button type="button" className="director-btn secondary" style={{ marginTop: 10, width: "100%" }} onClick={logout}>
                  Выйти
                </button>
              </>
            ) : (
              <span>Загрузка профиля…</span>
            )}
          </div>
        </aside>
        <main className="director-main">{children}</main>
      </div>
    </div>
  );
}
