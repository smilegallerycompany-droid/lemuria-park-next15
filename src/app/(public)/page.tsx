import { Camera, Heart, MapPin, Users } from "lucide-react";
import { Hero } from "@/components/sections/hero";
import { BookingWidget } from "@/components/booking/booking-widget";
import { SITE } from "@/lib/domain";
import { H2, Body } from "@/components/ui/typography";
import { PageSection } from "@/components/layout/page-section";
import { Container } from "@/components/layout/container";
import { Stack } from "@/components/layout/stack";
import { ImagePlaceholder } from "@/components/common/image-placeholder";
export default function Home() {
  const items = [
    [Users, "Живое общение", "Познакомьтесь с лемурами ближе."],
    [Camera, "Яркие фотографии", "Сохраните настоящие эмоции."],
    [Heart, "Для всей семьи", "Интересно детям и взрослым."],
    [MapPin, "Удобное расписание", "Сеансы каждые 30 минут."],
  ] as const;
  return (
    <>
      <Hero />
      <Container className="relative z-10 -mt-20">
        <BookingWidget />
      </Container>
      <section className="container-site py-16">
        <H2 className="text-center">Почему выбирают Лемурия Парк</H2>
        <div className="mt-9 grid gap-6 md:grid-cols-4">
          {items.map(([Icon, t, d]) => (
            <Stack key={t} direction="row" gap="md">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-green-50 text-green-600">
                <Icon />
              </span>
              <div>
                <h3 className="font-extrabold">{t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{d}</p>
              </div>
            </Stack>
          ))}
        </div>
      </section>
      <PageSection id="gallery" className="bg-green-50/60">
        <Container className="grid items-center gap-10 md:grid-cols-2">
          <ImagePlaceholder className="min-h-80" />
          <div>
            <H2 className="text-4xl">О зоотеатре</H2>
            <Body className="mt-5 text-muted-foreground">
              «Лемурия Парк» — пространство живого общения с кольцехвостыми лемурами. Посещение
              проходит по сеансам, чтобы сохранять спокойную атмосферу.
            </Body>
            <div className="mt-6 flex flex-wrap gap-2">
              {[
                `До ${SITE.capacity} гостей`,
                `Сеансы каждые ${SITE.sessionMinutes} минут`,
                `10:30–21:00`,
              ].map((x) => (
                <span
                  key={x}
                  className="rounded-full bg-white px-4 py-2 text-sm font-bold text-green-700"
                >
                  {x}
                </span>
              ))}
            </div>
          </div>
        </Container>
      </PageSection>
    </>
  );
}
