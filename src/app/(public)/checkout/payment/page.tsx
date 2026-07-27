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

function formatSessionDateTime(localDate: string, localTime: string): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  const day = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
  return `${day}, ${localTime}`;
}

function formatDeadline(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
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

  // A real payment integration lands in the next stage — until then, PAID
  // is the only status that should ever route to the success screen.
  if (dto.status === "PAID") {
    redirect(`/success?order=${encodeURIComponent(dto.number)}`);
  }

  const isExpired = dto.status === "EXPIRED" || dto.status === "CANCELLED";

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
            <p className="flex justify-between gap-4">
              <span>
                {dto.session.city} · {dto.session.venue}
              </span>
            </p>
            <p className="flex justify-between text-muted-foreground">
              <span>{dto.session.address}</span>
            </p>
            <p className="flex justify-between">
              <span>{formatSessionDateTime(dto.session.localDate, dto.session.localTime)}</span>
            </p>
            {dto.items.map((item) => (
              <p key={item.ticketTypeCode} className="flex justify-between">
                <span>
                  {item.ticketTypeName} × {item.quantity}
                </span>
                <b>{formatMoneyFromKopecks(item.subtotal)}</b>
              </p>
            ))}
            <p className="flex justify-between border-t pt-4 text-lg">
              <b>Итого</b>
              <b>{formatMoneyFromKopecks(dto.totalAmount)}</b>
            </p>
          </div>

          {isExpired ? (
            <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              Время ожидания оплаты по этому заказу истекло. Оформите бронирование заново.
            </div>
          ) : (
            <>
              <div
                className="mt-5 rounded-xl border p-3 text-sm text-muted-foreground"
                role="status"
              >
                Заказ создан, места временно зафиксированы. Онлайн-оплата будет подключена на
                следующем этапе.
                {dto.paymentExpiresAt && (
                  <> Дождитесь оплаты до {formatDeadline(dto.paymentExpiresAt)}.</>
                )}
              </div>
              <Body className="mt-5 text-muted-foreground">
                Мы свяжемся с вами по номеру {dto.maskedPhone}, как только оплата станет доступна.
              </Body>
            </>
          )}
        </Card>

        <Button asChild variant="outline" className="mt-5">
          <Link href="/tickets">К выбору билетов</Link>
        </Button>
      </Container>
    </PageSection>
  );
}
