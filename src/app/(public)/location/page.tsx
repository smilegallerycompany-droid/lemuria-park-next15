import { MapPin, Phone, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SITE } from "@/lib/domain";
import { H1 } from "@/components/ui/typography";
import { PageSection } from "@/components/layout/page-section";
import { Container } from "@/components/layout/container";
export default function Location() {
  return (
    <PageSection tone="jungle">
      <Container>
        <H1 className="text-5xl">Как нас найти</H1>
        <div className="mt-8 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
          <Card className="grid gap-5 p-6">
            <p className="flex gap-3">
              <MapPin className="text-green-600" />
              {SITE.address}
            </p>
            <p className="flex gap-3">
              <Clock className="text-green-600" />
              {SITE.schedule}
            </p>
            <p className="flex gap-3">
              <Phone className="text-green-600" />
              {SITE.phone}
            </p>
            <p className="text-sm text-muted-foreground">
              Перед публикацией нужно указать точный адрес и ссылку на Яндекс Карты.
            </p>
          </Card>
          <Card className="grid min-h-[420px] place-items-center bg-green-50 text-center text-muted-foreground">
            Интерактивная карта будет подключена после получения адреса
          </Card>
        </div>
      </Container>
    </PageSection>
  );
}
