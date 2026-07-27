"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SITE, PRIMARY_NAV, CTA_BUY_TICKET_LABEL, CTA_BUY_TICKET_HREF } from "@/constants/site";

const mobileNav = PRIMARY_NAV.filter((item) => item.href !== "/#gallery");

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/50 bg-white/70 backdrop-blur-xl">
      <div className="container-site flex items-center gap-6 py-3">
        <Link
          href="/"
          className="mr-auto flex items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
        >
          <span className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-leaf/80 to-cream text-lg shadow-soft">
            ◉
          </span>
          <span>
            <span className="block font-display text-lg font-semibold leading-none tracking-tight text-forest">
              {SITE.name}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {SITE.subtitle}
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-bold text-forest/80 lg:flex">
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition hover:text-forest focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Button asChild className="hidden lg:inline-flex">
          <Link href={CTA_BUY_TICKET_HREF}>{CTA_BUY_TICKET_LABEL}</Link>
        </Button>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="grid size-11 place-items-center rounded-2xl bg-orange-soft text-orange lg:hidden"
          aria-label={open ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={open}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/60 lg:hidden"
          >
            <div className="container-site grid gap-4 py-5 text-lg font-bold">
              <Link href="/" onClick={() => setOpen(false)}>
                Главная
              </Link>
              {mobileNav.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
                  {item.label}
                </Link>
              ))}
              <Button asChild>
                <Link href={CTA_BUY_TICKET_HREF} onClick={() => setOpen(false)}>
                  {CTA_BUY_TICKET_LABEL}
                </Link>
              </Button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
