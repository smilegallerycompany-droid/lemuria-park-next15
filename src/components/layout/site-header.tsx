"use client";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SITE, PRIMARY_NAV, CTA_BUY_TICKET_LABEL, CTA_BUY_TICKET_HREF } from "@/constants/site";
const mobileNav = PRIMARY_NAV.filter((item) => item.href !== "/#gallery");
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur">
      <div className="container-site flex items-center gap-8 py-3">
        <Link href="/" className="mr-auto flex items-center gap-3 font-black">
          <span className="grid size-11 place-items-center rounded-full bg-cream text-xl">◉</span>
          <span>
            <span className="block text-lg uppercase leading-none">{SITE.name}</span>
            <span className="text-[10px] uppercase tracking-[.18em] text-muted-foreground">
              {SITE.subtitle}
            </span>
          </span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-bold lg:flex">
          {PRIMARY_NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <Button asChild className="hidden lg:inline-flex">
          <Link href={CTA_BUY_TICKET_HREF}>{CTA_BUY_TICKET_LABEL}</Link>
        </Button>
        <button
          onClick={() => setOpen(!open)}
          className="grid size-11 place-items-center rounded-full bg-orange lg:hidden"
          aria-label="Меню"
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <nav className="container-site grid gap-4 border-t py-5 text-lg font-bold lg:hidden">
          <Link href="/" onClick={() => setOpen(false)}>
            Главная
          </Link>
          {mobileNav.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
          <Button asChild>
            <Link href={CTA_BUY_TICKET_HREF}>{CTA_BUY_TICKET_LABEL}</Link>
          </Button>
        </nav>
      )}
    </header>
  );
}
