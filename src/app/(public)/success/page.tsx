import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { H2, Body } from "@/components/ui/typography";
import { PageSection } from "@/components/layout/page-section";
import { Container } from "@/components/layout/container";
import { getOrderByNumber } from "@/server/services/orders";
import { toOrderDto } from "@/server/mappers/order";

interface SuccessPageProps {
  searchParams: Promise<{ order?: string }>;
}

/**
 * Real order-confirmation page — driven entirely by the order's persisted
 * status. No fake QR, no fake "success" state: if the order doesn't exist
 * we send the visitor back to ticket selection; if it's still awaiting
 * payment we send them to the (real) payment-waiting page; if it expired
 * or was cancelled we show that plainly, right here. QR ticket delivery is
 * a later stage — for now a paid order just shows a "preparing" placeholder.
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

  if (order.status === "AWAITING_PAYMENT" || order.status === "DRAFT") {
    redirect(`/checkout/payment?order=${encodeURIComponent(orderNumber)}`);
  }

  if (order.status === "EXPIRED" || order.status === "CANCELLED") {
    const dto = await toOrderDto(order);
    return (
      <PageSection tone="jungle">
        <Container className="max-w-2xl">
          <Card variant="glass" className="p-7 text-center">
            <H2 as="h1" className="mt-2 font-display font-semibold">
              {order.status === "EXPIRED" ? "Время оплаты истекло" : "Заказ отменён"}
            </H2>
            <Body className="mt-2 text-muted-foreground">
              Заказ № {dto.number} {order.status === "EXPIRED" ? "не был оплачен вовремя и" : ""}{" "}
              больше не действителен. Чтобы приобрести билеты, оформите бронирование заново.
            </Body>
          </Card>
        </Container>
      </PageSection>
    );
  }

  if (order.status !== "PAID") {
    redirect(`/checkout/payment?order=${encodeURIComponent(orderNumber)}`);
  }

  const dto = await toOrderDto(order);

  // Real payment succeeded but tickets/QR issuance is a later stage — never
  // fabricate a QR here.
  return (
    <PageSection tone="jungle">
      <Container className="max-w-2xl">
        <Card variant="glass" className="p-7 text-center">
          <H2 as="h1" className="mt-2 font-display font-semibold">
            Билеты формируются
          </H2>
          <Body className="mt-2 text-muted-foreground">
            Заказ № {dto.number} оплачен. Электронные билеты с QR-кодом появятся здесь на следующем
            этапе.
          </Body>
        </Card>
      </Container>
    </PageSection>
  );
}
