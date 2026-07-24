import { Check, Download, Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { H2, Body } from "@/components/ui/typography";
import { PageSection } from "@/components/layout/page-section";
import { Container } from "@/components/layout/container";
export default function Success() {
  return (
    <PageSection tone="jungle">
      <Container className="max-w-2xl">
        <Card className="p-7 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-green-500 text-white">
            <Check size={34} />
          </span>
          <H2 as="h1" className="mt-5">
            Оплата прошла успешно!
          </H2>
          <Body className="mt-2 text-muted-foreground">
            Электронный билет готов к использованию.
          </Body>
          <Card className="mt-7 grid items-center gap-5 p-5 text-left sm:grid-cols-[1fr_160px]">
            <div>
              <b className="text-green-700">Лемурия Парк</b>
              <p className="mt-3 text-sm">
                23 июля 2026 · 12:00
                <br />
                Заказ № LP-013456
                <br />2 взрослых, 1 детский
              </p>
            </div>
            <div className="aspect-square bg-[repeating-conic-gradient(#111_0_5%,#fff_0_10%)]" />
          </Card>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Button variant="outline">
              <Download size={17} />
              Скачать билет
            </Button>
            <Button variant="outline">
              <Mail size={17} />
              Отправить ещё раз
            </Button>
          </div>
        </Card>
      </Container>
    </PageSection>
  );
}
