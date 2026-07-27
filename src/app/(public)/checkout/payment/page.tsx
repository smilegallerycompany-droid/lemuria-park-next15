import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { H1, Body } from "@/components/ui/typography";
import { PageSection } from "@/components/layout/page-section";
import { Container } from "@/components/layout/container";
import { PaymentWaitingVisual } from "@/components/checkout/payment-waiting-visual";
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

export default async function CheckoutPaymentPage({ searchParams }: PaymentPageProps) {
  const { order: orderNumber } = await searchParams;
  if (!orderNumber) redirect("/tickets");

  const order = await getOrderByNumber(orderNumber);
  if (!order) redirect("/tickets");

  const dto = await toOrderDto(order);
  if (dto.status === "PAID") redirect(`/success?order=${encodeURIComponent(dto.number)}`);

  const isExpired = dto.status === "EXPIRED" || dto.status === "CANCELLED";

  return (
    <PageSection tone="jungle" className="py-10 md:py-14">
      <Container className="max-w-2xl">
        <H1 className="font-display text-4xl font-semibold">Ожидание оплаты</H1>
        <Card variant="glass" className="mt-8 overflow-hidden p-6 md:p-8">
          <PaymentWaitingVisual />

          <p className="mt-6 text-sm text-muted-foreground">Заказ № {dto.number}</p>
          <p className="mt-1 font-display text-3xl font-semibold text-forest">
            {ORDER_STATUS_LABELS[dto.status] ?? dto.status}
          </p>

          <div className="mt-6 grid gap-3 text-sm">
            <p className="font-extrabold text-forest">
              {dto.session.city} · {dto.session.venue}
            </p>
            <p className="text-muted-foreground">{dto.session.address}</p>
            <p>{formatSessionDateTime(dto.session.localDate, dto.session.localTime)}</p>
            <div className="my-1 h-px bg-beige" />
            {dto.items.map((item) => (
              <p key={item.ticketTypeCode} className="flex justify-between">
                <span>
                  {item.ticketTypeName} × {item.quantity}
                </span>
                <b>{formatMoneyFromKopecks(item.subtotal)}</b>
              </p>
            ))}
            <p className="flex justify-between border-t border-beige pt-4 text-lg">
              <b>Итого</b>
              <b className="font-display text-2xl">{formatMoneyFromKopecks(dto.totalAmount)}</b>
            </p>
          </div>

          {isExpired ? (
            <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              Время ожидания оплаты истекло. Оформите бронирование заново.
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-beige bg-cream/70 p-4 text-sm text-muted-foreground">
              Заказ создан, места временно зафиксированы. Онлайн-оплата будет подключена на
              следующем этапе.
              {dto.paymentExpiresAt && (
                <> Дождитесь оплаты до {formatDeadline(dto.paymentExpiresAt)}.</>
              )}
              <Body className="mt-3 text-muted-foreground">
                Мы свяжемся с вами по номеру {dto.maskedPhone}, как только оплата станет доступна.
              </Body>
            </div>
          )}
        </Card>

        <Button asChild variant="outline" className="mt-5">
          <Link href="/tickets">К выбору билетов</Link>
        </Button>
      </Container>
    </PageSection>
  );
}
