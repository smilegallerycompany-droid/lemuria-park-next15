import { MapPin, Phone, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SITE } from "@/lib/domain";
import { H1 } from "@/components/ui/typography";
import { PageSection } from "@/components/layout/page-section";
import { Container } from "@/components/layout/container";

export default function Location() {
  return (
    <PageSection tone="jungle" className="py-14">
      <Container>
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-orange">Локация</p>
        <H1 className="mt-2 font-display text-4xl font-semibold md:text-5xl">Как нас найти</H1>
        <div className="mt-8 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
          <Card variant="glass" className="grid gap-5 p-6">
            <p className="flex gap-3 text-forest">
              <MapPin className="shrink-0 text-orange" aria-hidden />
              {SITE.address}
            </p>
            <p className="flex gap-3 text-forest">
              <Clock className="shrink-0 text-orange" aria-hidden />
              {SITE.schedule}
            </p>
            <p className="flex gap-3 text-forest">
              <Phone className="shrink-0 text-orange" aria-hidden />
              {SITE.phone}
            </p>
            <p className="text-sm text-muted-foreground">
              Перед публикацией нужно указать точный адрес и ссылку на Яндекс Карты.
            </p>
          </Card>
          <Card
            variant="soft"
            className="grid min-h-[420px] place-items-center text-center text-muted-foreground"
          >
            Интерактивная карта будет подключена после получения адреса
          </Card>
        </div>
      </Container>
    </PageSection>
  );
}
