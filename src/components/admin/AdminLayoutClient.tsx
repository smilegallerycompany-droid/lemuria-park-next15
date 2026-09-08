"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { directorFetch } from "@/lib/director/client";
import { labelRole } from "@/lib/director/labels";
import { StaffPortalProvider } from "@/lib/staff-portal";

const NAV = [
  { href: "/admin", label: "Обзор" },
  { href: "/admin/analytics", label: "Аналитика" },
  { href: "/admin/locations", label: "Локации" },
  { href: "/admin/users", label: "Пользователи" },
  { href: "/admin/orders", label: "Заказы" },
  { href: "/admin/payments", label: "Платежи" },
  { href: "/admin/tickets", label: "Билеты" },
  { href: "/admin/shifts", label: "Смены" },
  { href: "/admin/integrations", label: "Интеграции" },
  { href: "/admin/system", label: "Система" },
  { href: "/admin/audit", label: "Аудит" },
  { href: "/admin/settings", label: "Настройки" },
];

type MeResponse = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/admin/login";
  const [me, setMe] = useState<MeResponse | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (isLogin) return;
    directorFetch<MeResponse>("/api/auth/me")
      .then((user) => {
        if (user.role !== "ADMIN" && user.role !== "OWNER") {
          router.replace("/director");
          return;
        }
        setMe(user);
      })
      .catch(() => router.replace("/admin/login"));
  }, [isLogin, router]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.replace("/admin/login");
  }

  if (isLogin) {
    return <div className="director-root">{children}</div>;
  }

  const crumb =
    NAV.find((item) =>
      item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`),
    )?.label ?? "Раздел";

  return (
    <StaffPortalProvider portal="admin">
    <div className="director-root">
      <div className={`director-shell ${navOpen ? "nav-open" : ""}`}>
        <aside className="director-sidebar" aria-label="Админ-меню">
          <div className="director-brand">
            <div className="director-brand-mark">A</div>
            <div className="director-brand-copy">
              <strong>Управляющий</strong>
              <small>Все локации</small>
            </div>
          </div>
          <nav className="director-nav" aria-label="Навигация управляющего">
            {NAV.map((item) => {
              const active =
                item.href === "/admin"
                  ? pathname === "/admin"
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
                <Link href="/director" className="director-btn secondary" style={{ marginTop: 10, width: "100%", textAlign: "center" }}>
                  К панели директора
                </Link>
                <button
                  type="button"
                  className="director-btn secondary"
                  style={{ marginTop: 8, width: "100%" }}
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
              onClick={() => setNavOpen((v) => !v)}
            >
              Меню
            </button>
            <strong>Лемурия · Управление</strong>
          </div>
          {pathname !== "/admin" ? (
            <nav className="admin-breadcrumb" aria-label="Навигация раздела">
              <Link href="/admin">Управление</Link>
              <span aria-hidden>/</span>
              <span>{crumb}</span>
            </nav>
          ) : null}
          {children}
        </main>
        {navOpen ? (
          <button type="button" className="director-backdrop" aria-label="Закрыть меню" onClick={() => setNavOpen(false)} />
        ) : null}
      </div>
    </div>
    </StaffPortalProvider>
  );
}
