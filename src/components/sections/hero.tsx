"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { SITE } from "@/constants/site";

/**
 * Compact cashier intro — brand + visit essentials only.
 * The booking widget immediately below is the main interface.
 */
export function Hero() {
  return (
    <section className="hero-mesh relative overflow-hidden border-b border-beige/60">
      <div className="container-site relative grid items-center gap-6 py-8 md:grid-cols-[1fr_auto] md:gap-10 md:py-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-orange">
            Онлайн-касса
          </p>
          <h1 className="mt-2 font-display text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-tight tracking-tight text-forest">
            {SITE.name}
          </h1>
          <p className="mt-2 max-w-xl text-base text-muted-foreground md:text-lg">
            Выберите дату и сеанс — места резервируются сразу. {SITE.schedule}.
          </p>

          <dl className="mt-5 flex flex-wrap gap-2">
            {[
              [`До ${SITE.capacity}`, "гостей"],
              [`${SITE.visitMinutes} мин`, "визит"],
              [`каждые ${SITE.sessionMinutes} мин`, "сеансы"],
            ].map(([value, label]) => (
              <div
                key={label}
                className="glass inline-flex items-baseline gap-1.5 rounded-full px-3 py-1.5 text-sm"
              >
                <dt className="font-extrabold text-forest">{value}</dt>
                <dd className="text-muted-foreground">{label}</dd>
              </div>
            ))}
          </dl>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="relative mx-auto hidden w-[140px] shrink-0 sm:block md:w-[180px]"
        >
          <Image
            src="/assets/lemur.png"
            alt=""
            width={360}
            height={360}
            className="h-auto w-full object-contain drop-shadow-xl"
            priority
          />
        </motion.div>
      </div>
    </section>
  );
}
