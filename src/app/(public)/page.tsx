"use client";

import Link from "next/link";
import { Camera, Clock3, Heart, Sparkles, Users } from "lucide-react";
import { motion } from "framer-motion";
import { Hero } from "@/components/sections/hero";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { H2, Body } from "@/components/ui/typography";
import { Container } from "@/components/layout/container";
import { CTA_BUY_TICKET_HREF, CTA_BUY_TICKET_LABEL } from "@/constants/site";

const benefits = [
  {
    icon: Users,
    title: "Живое общение",
    description: "Настоящий контакт с кольцехвостыми лемурами — без стекла и суеты.",
  },
  {
    icon: Sparkles,
    title: "Небольшие группы",
    description: "До 15 гостей на сеанс, чтобы атмосфера оставалась спокойной и тёплой.",
  },
  {
    icon: Clock3,
    title: "20 минут впечатлений",
    description: "Короткий насыщенный визит — идеально для семьи с детьми.",
  },
  {
    icon: Camera,
    title: "Яркие эмоции",
    description: "Кадры и моменты, которые хочется пересматривать снова и снова.",
  },
  {
    icon: Heart,
    title: "Семейный отдых",
    description: "Интересно и взрослым, и детям — без сложных правил и очередей.",
  },
] as const;

const cardVariants = {
  hidden: { opacity: 0, y: 18 },
  show: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: index * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function Home() {
  return (
    <>
      <Hero />

      <section className="relative z-10 -mt-8 pb-6 md:-mt-12">
        <Container>
          <Card
            variant="glass"
            className="flex flex-col items-start justify-between gap-4 p-5 md:flex-row md:items-center md:p-7"
          >
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-orange">Билеты онлайн</p>
              <p className="mt-1 font-display text-2xl font-semibold text-forest">
                Выберите сеанс и зафиксируйте места
              </p>
            </div>
            <Button asChild size="lg">
              <Link href={CTA_BUY_TICKET_HREF}>{CTA_BUY_TICKET_LABEL}</Link>
            </Button>
          </Card>
        </Container>
      </section>

      <section className="py-16 md:py-20">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <H2 className="font-display text-3xl font-semibold md:text-4xl">
              Почему выбирают Лемурия Парк
            </H2>
            <Body className="mt-3 text-muted-foreground">
              Современный зоотеатр с мягкой атмосферой джунглей — для тех, кто ценит живые эмоции.
            </Body>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((item, index) => (
              <motion.div
                key={item.title}
                custom={index}
                variants={cardVariants}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-40px" }}
                whileHover={{ y: -4, scale: 1.01 }}
                transition={{ type: "spring", stiffness: 320, damping: 24 }}
              >
                <Card variant="glass" className="h-full p-6">
                  <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-leaf/50 to-cream text-forest">
                    <item.icon size={22} aria-hidden />
                  </span>
                  <h3 className="mt-5 font-display text-xl font-semibold text-forest">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </Container>
      </section>

      <section id="gallery" className="pb-20">
        <Container>
          <Card variant="soft" className="grid overflow-hidden md:grid-cols-[1.1fr_0.9fr]">
            <div
              className="min-h-64 bg-cover bg-center md:min-h-[380px]"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, rgba(198,232,176,0.55), rgba(255,228,196,0.45)), url('/assets/lemur.png')",
                backgroundSize: "cover, 70%",
                backgroundPosition: "center, 80% 20%",
                backgroundRepeat: "no-repeat",
              }}
              role="img"
              aria-label="Атмосфера зоотеатра Лемурия Парк"
            />
            <div className="flex flex-col justify-center p-8 md:p-10">
              <H2 className="font-display text-3xl font-semibold">О зоотеатре</H2>
              <Body className="mt-4 text-muted-foreground">
                «Лемурия Парк» — пространство живого общения с кольцехвостыми лемурами. Посещение
                проходит по сеансам, чтобы сохранять спокойную и безопасную атмосферу.
              </Body>
              <Button asChild className="mt-7 w-fit" variant="outline">
                <Link href="/about">Подробнее о парке</Link>
              </Button>
            </div>
          </Card>
        </Container>
      </section>
    </>
  );
}
