"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { directorFetch } from "@/lib/director/client";

const NAV = [
  { href: "/director", label: "Дашборд" },
  { href: "/director/locations", label: "Локации" },
  { href: "/director/schedule", label: "Расписание" },
  { href: "/director/sessions", label: "Сеансы" },
  { href: "/director/prices", label: "Цены" },
  { href: "/director/ticket-types", label: "Типы билетов" },
  { href: "/director/orders", label: "Заказы" },
  { href: "/director/tickets", label: "Билеты" },
  { href: "/director/staff", label: "Сотрудники" },
  { href: "/director/analytics", label: "Аналитика" },
  { href: "/director/content", label: "Контент" },
  { href: "/director/audit", label: "Журнал" },
  { href: "/director/settings", label: "Настройки" },
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
              <strong>Директор</strong>
              <small>Лемурия Парк</small>
            </div>
          </div>
          <nav className="director-nav" aria-label="Навигация директора">
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
