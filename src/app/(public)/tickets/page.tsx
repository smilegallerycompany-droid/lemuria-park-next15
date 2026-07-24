import { BookingWidget } from "@/components/booking/booking-widget";
import { H1, Body } from "@/components/ui/typography";
import { PageSection } from "@/components/layout/page-section";
import { Container } from "@/components/layout/container";
export default function Tickets() {
  return (
    <PageSection tone="jungle" className="py-14">
      <Container>
        <H1>Купить билет онлайн</H1>
        <Body className="mt-2 text-muted-foreground">
          Выберите дату, сеанс и количество гостей.
        </Body>
        <div className="mt-8">
          <BookingWidget />
        </div>
      </Container>
    </PageSection>
  );
}
