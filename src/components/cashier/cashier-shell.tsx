"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/cashier", label: "Рабочее место", exact: true },
  { href: "/cashier/sessions", label: "Сеансы" },
  { href: "/cashier/orders", label: "Заказы" },
  { href: "/cashier/scan", label: "Сканер" },
  { href: "/cashier/profile", label: "Профиль" },
];

export function CashierShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="cashier-root cashier-shell">
      <header className="cashier-topbar">
        <div className="cashier-brand">Касса · Лемурия</div>
      </header>
      <nav className="cashier-nav" aria-label="Касса">
        {NAV.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} className={active ? "active" : undefined}>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <main className="cashier-main">{children}</main>
    </div>
  );
}
