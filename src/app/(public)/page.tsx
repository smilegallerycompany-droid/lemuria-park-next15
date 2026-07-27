"use client";

import Link from "next/link";
import { Clock3, MapPin, Phone, Users } from "lucide-react";
import { Hero } from "@/components/sections/hero";
import { BookingWidget } from "@/components/booking/booking-widget";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/layout/container";
import { SITE } from "@/constants/site";

/**
 * Home = online ticket counter. Booking is the first step.
 * Secondary visit info sits below and never blocks purchase.
 */
export default function Home() {
  return (
    <>
      <Hero />

      <section id="booking" className="scroll-mt-24 py-6 pb-8 md:py-8">
        <Container>
          <BookingWidget />
        </Container>
      </section>

      <section
        className="border-t border-beige/70 py-12 md:py-16"
        aria-labelledby="visit-info-heading"
      >
        <Container>
          <h2 id="visit-info-heading" className="font-display text-2xl font-semibold text-forest">
            Перед визитом
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Коротко о том, что важно знать, чтобы спокойно приехать на сеанс.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Users,
                title: `До ${SITE.capacity} гостей`,
                text: "Небольшие группы — спокойная атмосфера.",
              },
              {
                icon: Clock3,
                title: `${SITE.visitMinutes} минут`,
                text: `Сеансы каждые ${SITE.sessionMinutes} минут.`,
              },
              {
                icon: MapPin,
                title: "Адрес",
                text: SITE.address,
              },
              {
                icon: Phone,
                title: "Телефон",
                text: SITE.phone,
              },
            ].map((item) => (
              <Card key={item.title} variant="soft" className="p-4">
                <item.icon size={18} className="text-orange" aria-hidden />
                <h3 className="mt-3 text-sm font-extrabold text-forest">{item.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
              </Card>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/location">Как добраться</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/about">О зоотеатре</Link>
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}
