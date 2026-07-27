"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Leaf, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE, CTA_BUY_TICKET_LABEL, CTA_BUY_TICKET_HREF } from "@/constants/site";

export function Hero() {
  return (
    <section className="hero-mesh relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(rgba(120,160,90,0.12) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      <div className="container-site relative grid min-h-[min(92vh,820px)] items-center gap-10 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6 lg:py-20">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10"
        >
          <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-forest">
            <Leaf size={16} className="text-leaf" aria-hidden />
            Живое общение с лемурами
          </span>

          <h1 className="mt-6 font-display text-[clamp(2.75rem,8vw,5.5rem)] font-semibold leading-[0.95] tracking-tight text-forest">
            {SITE.name}
          </h1>

          <p className="mt-4 max-w-lg text-lg font-medium text-muted-foreground md:text-xl">
            Зоотеатр, где семья встречается с кольцехвостыми лемурами — близко, спокойно и с
            настоящими эмоциями.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href={CTA_BUY_TICKET_HREF}>{CTA_BUY_TICKET_LABEL}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/about">
                <Sparkles size={16} aria-hidden />
                Узнать больше
              </Link>
            </Button>
          </div>

          <dl className="mt-10 grid max-w-md grid-cols-3 gap-3">
            {[
              ["15", "гостей"],
              ["20", "минут"],
              ["30", "мин · сеанс"],
            ].map(([value, label]) => (
              <div key={label} className="glass rounded-2xl p-3 text-center">
                <dt className="font-display text-2xl font-semibold text-forest">{value}</dt>
                <dd className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {label}
                </dd>
              </div>
            ))}
          </dl>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto w-full max-w-[560px]"
        >
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 size-[88%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-leaf/40 via-cream to-orange-soft blur-2xl"
          />
          <div className="glass-strong relative overflow-hidden rounded-[2.5rem] p-4 md:p-6">
            <Image
              src="/assets/lemur.png"
              alt="Кольцехвостый лемур в Лемурия Парк"
              width={900}
              height={900}
              className="relative z-10 mx-auto h-auto max-h-[min(58vh,540px)] w-full object-contain drop-shadow-2xl"
              priority
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
