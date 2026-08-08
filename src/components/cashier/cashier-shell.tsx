"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/cashier", label: "Продажа", exact: true, mobile: true },
  { href: "/cashier/sessions", label: "Сеансы", exact: false, mobile: true },
  { href: "/cashier/scan", label: "Сканер", exact: false, mobile: true, highlight: true },
  { href: "/cashier/orders", label: "Заказы", exact: false, mobile: true },
  { href: "/cashier/profile", label: "Профиль", exact: false, mobile: true },
];

export function CashierShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/cashier/login";

  if (isLogin) {
    return <div className="cashier-root">{children}</div>;
  }

  return (
    <div className="cashier-root cashier-shell">
      <header className="cashier-topbar">
        <div className="cashier-brand">Касса · Лемурия</div>
      </header>
      <nav className="cashier-nav cashier-nav-desktop" aria-label="Касса">
        {NAV.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${active ? "active" : ""} ${item.highlight ? "scan-link" : ""}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <main className="cashier-main">{children}</main>
      <nav className="cashier-bottom-nav" aria-label="Мобильная навигация кассы">
        {NAV.filter((item) => item.mobile).map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${active ? "active" : ""} ${item.highlight ? "scan-link" : ""}`}
            >
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
