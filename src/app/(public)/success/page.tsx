import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { H2, Body } from "@/components/ui/typography";
import { PageSection } from "@/components/layout/page-section";
import { Container } from "@/components/layout/container";
import { getOrderByNumber } from "@/server/services/orders";

interface SuccessPageProps {
  searchParams: Promise<{ order?: string }>;
}

/**
 * Real order-confirmation page — driven entirely by the order's persisted
 * status. No fake QR, no fake "success" state: if the order doesn't exist
 * we send the visitor back to ticket selection; if it isn't paid yet we
 * send them to the (real) payment-waiting page. QR ticket delivery is a
 * later stage — for now a paid order just shows a "preparing" placeholder.
 */
export default async function SuccessPage({ searchParams }: SuccessPageProps) {
  const { order: orderNumber } = await searchParams;
  if (!orderNumber) {
    redirect("/tickets");
  }

  const order = await getOrderByNumber(orderNumber);
  if (!order) {
    redirect("/tickets");
  }

  if (order.status !== "PAID") {
    redirect(`/checkout/payment?order=${encodeURIComponent(orderNumber)}`);
  }

  return (
    <PageSection tone="jungle">
      <Container className="max-w-2xl">
        <Card className="p-7 text-center">
          <H2 as="h1" className="mt-2">
            Подготовка билетов
          </H2>
          <Body className="mt-2 text-muted-foreground">
            Заказ № {order.number} оплачен. Электронные билеты с QR-кодом появятся здесь на
            следующем этапе.
          </Body>
        </Card>
      </Container>
    </PageSection>
  );
}
