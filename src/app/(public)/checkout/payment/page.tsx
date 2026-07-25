import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { H1, Body } from "@/components/ui/typography";
import { PageSection } from "@/components/layout/page-section";
import { Container } from "@/components/layout/container";
import { getOrderByNumber } from "@/server/services/orders";
import { toOrderDto } from "@/server/mappers/order";
import { formatMoneyFromKopecks } from "@/lib/utils";

interface PaymentPageProps {
  searchParams: Promise<{ order?: string }>;
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  AWAITING_PAYMENT: "Ожидает оплаты",
  PAID: "Оплачен",
  CANCELLED: "Отменён",
  REFUNDED: "Возвращён",
  EXPIRED: "Истёк",
};

function formatSessionDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/**
 * Real "awaiting payment" page — this stage does not integrate a payment
 * provider yet, so there is intentionally no button that simulates payment
 * and no QR code here. It only reflects the order's real, server-persisted
 * state.
 */
export default async function CheckoutPaymentPage({ searchParams }: PaymentPageProps) {
  const { order: orderNumber } = await searchParams;
  if (!orderNumber) {
    redirect("/tickets");
  }

  const order = await getOrderByNumber(orderNumber);
  if (!order) {
    redirect("/tickets");
  }

  const dto = await toOrderDto(order);
  const timezone = dto.session?.locationTimezone ?? "UTC";

  return (
    <PageSection tone="jungle" className="py-14">
      <Container className="max-w-2xl">
        <H1>Ожидание оплаты</H1>
        <Card className="mt-8 p-6">
          <p className="text-sm text-muted-foreground">Заказ № {dto.number}</p>
          <p className="mt-1 text-2xl font-black">
            {ORDER_STATUS_LABELS[dto.status] ?? dto.status}
          </p>

          <div className="mt-5 grid gap-3 text-sm">
            {dto.session && (
              <p className="flex justify-between gap-4">
                <span>
                  {dto.session.locationCity} · {dto.session.locationName}
                </span>
              </p>
            )}
            {dto.session && (
              <p className="flex justify-between">
                <span>{formatSessionDateTime(dto.session.startsAt, timezone)}</span>
              </p>
            )}
            {dto.items.map((item) => (
              <p key={item.ticketTypeCode} className="flex justify-between">
                <span>
                  {item.ticketTypeName} × {item.quantity}
                </span>
                <b>{formatMoneyFromKopecks(item.subtotalAmount)}</b>
              </p>
            ))}
            <p className="flex justify-between border-t pt-4 text-lg">
              <b>Итого</b>
              <b>{formatMoneyFromKopecks(dto.totalAmount)}</b>
            </p>
          </div>

          <Body className="mt-5 text-muted-foreground">
            Приём онлайн-оплаты подключается на следующем этапе. Мы свяжемся с вами по номеру{" "}
            {dto.customer.phone}, как только оплата станет доступна.
          </Body>
        </Card>

        <Button asChild variant="outline" className="mt-5">
          <Link href="/tickets">К выбору билетов</Link>
        </Button>
      </Container>
    </PageSection>
  );
}
