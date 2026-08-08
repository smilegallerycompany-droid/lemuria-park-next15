"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { directorFetch } from "@/lib/director/client";
import { labelRole } from "@/lib/director/labels";

const NAV = [
  { href: "/director", label: "Обзор" },
  { href: "/director/analytics", label: "Аналитика" },
  { href: "/director/orders", label: "Заказы" },
  { href: "/director/tickets", label: "Билеты" },
  { href: "/director/schedule", label: "Расписание" },
  { href: "/director/sessions", label: "Сеансы" },
  { href: "/director/prices", label: "Цены" },
  { href: "/director/ticket-types", label: "Типы билетов" },
  { href: "/director/locations", label: "Локации" },
  { href: "/director/staff", label: "Сотрудники" },
  { href: "/director/content", label: "Контент" },
  { href: "/director/audit", label: "Аудит" },
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
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (isLogin) return;
    directorFetch<MeResponse>("/api/auth/me")
      .then(setMe)
      .catch(() => router.replace("/director/login"));
  }, [isLogin, router]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.replace("/director/login");
  }

  if (isLogin) {
    return <div className="director-root">{children}</div>;
  }

  return (
    <div className="director-root">
      <div className={`director-shell ${navOpen ? "nav-open" : ""}`}>
        <aside className="director-sidebar" aria-label="Боковое меню">
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
                <div className="director-role-badge">{labelRole(me.role)}</div>
                <button
                  type="button"
                  className="director-btn secondary"
                  style={{ marginTop: 10, width: "100%" }}
                  onClick={logout}
                >
                  Выйти
                </button>
              </>
            ) : (
              <span>Загрузка профиля…</span>
            )}
          </div>
        </aside>
        <main className="director-main">
          <div className="director-mobile-bar">
            <button
              type="button"
              className="director-btn secondary"
              aria-expanded={navOpen}
              aria-controls="director-drawer"
              onClick={() => setNavOpen((v) => !v)}
            >
              Меню
            </button>
            <strong>Лемурия · Директор</strong>
          </div>
          {children}
        </main>
        {navOpen ? (
          <button
            type="button"
            className="director-nav-backdrop"
            aria-label="Закрыть меню"
            onClick={() => setNavOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}
