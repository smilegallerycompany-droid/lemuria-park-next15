import { BookingWidget } from "@/components/booking/booking-widget";
import { H1, Body } from "@/components/ui/typography";
import { PageSection } from "@/components/layout/page-section";
import { Container } from "@/components/layout/container";

export default function Tickets() {
  return (
    <PageSection tone="jungle" className="py-10 md:py-14">
      <Container>
        <div className="max-w-2xl">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-orange">Билеты</p>
          <H1 className="mt-2 font-display text-4xl font-semibold md:text-5xl">Купить билет</H1>
          <Body className="mt-3 text-muted-foreground">
            Выберите дату, удобный сеанс и количество гостей — места резервируются на 15 минут.
          </Body>
        </div>
        <div className="mt-8">
          <BookingWidget />
        </div>
      </Container>
    </PageSection>
  );
}
