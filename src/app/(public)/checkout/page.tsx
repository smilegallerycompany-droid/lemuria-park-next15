"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Clock3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { H1 } from "@/components/ui/typography";
import { PageSection } from "@/components/layout/page-section";
import { Container } from "@/components/layout/container";
import { checkoutContactFormSchema, type CheckoutContactFormValues } from "@/lib/validation/order";
import { getPublicReservationWithMeta, createPublicOrder } from "@/lib/api/public";
import { ApiClientError } from "@/lib/api/client";
import { formatMoneyFromKopecks, cn } from "@/lib/utils";
import type { PublicReservationDto } from "@/types/dto/reservation";

const COUNTDOWN_TICK_MS = 1000;

const checkoutFormSchema = checkoutContactFormSchema.extend({
  consent: z.boolean().refine((value) => value === true, {
    message: "Необходимо согласие с правилами посещения",
  }),
});
type CheckoutFormValues = CheckoutContactFormValues & { consent: boolean };

function formatSessionDateTime(localDate: string, localTime: string): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  const day = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
  return `${day}, ${localTime}`;
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

type LoadStatus = "loading" | "error" | "not-found" | "missing" | "ready";

function OrderSummary({
  reservation,
  isExpired,
  msRemaining,
}: {
  reservation: PublicReservationDto;
  isExpired: boolean;
  msRemaining: number;
}) {
  return (
    <Card variant="glass" className="p-6 md:p-7">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-orange">Ваш заказ</p>
      <h2 className="mt-2 font-display text-2xl font-semibold text-forest">Сводка брони</h2>

      <div className="mt-5 grid gap-3 text-sm">
        <p className="font-extrabold text-forest">
          {reservation.session.city} · {reservation.session.venue}
        </p>
        <p className="text-muted-foreground">{reservation.session.address}</p>
        <p className="font-bold text-forest">
          {formatSessionDateTime(reservation.session.localDate, reservation.session.localTime)}
        </p>
        <div className="my-1 h-px bg-beige" />
        {reservation.items.map((item) => (
          <p key={item.ticketTypeCode} className="flex justify-between gap-4">
            <span>
              {item.ticketTypeName} × {item.quantity}
            </span>
            <b>{formatMoneyFromKopecks(item.subtotal)}</b>
          </p>
        ))}
        <p className="flex justify-between border-t border-beige pt-4 text-lg">
          <b>Итого</b>
          <b className="font-display text-2xl text-forest">
            {formatMoneyFromKopecks(reservation.totalAmount)}
          </b>
        </p>
      </div>

      <div
        className={cn(
          "mt-5 flex items-center gap-3 rounded-2xl border p-4 text-sm",
          isExpired
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "border-orange/20 bg-orange-soft text-forest",
        )}
        role="status"
      >
        <Clock3 className={cn("shrink-0", !isExpired && "animate-pulse-soft")} aria-hidden />
        <div>
          {isExpired ? (
            <p className="font-extrabold">Время бронирования истекло</p>
          ) : (
            <>
              <p className="font-extrabold">Бронь действует ещё</p>
              <p className="font-display text-2xl font-semibold tabular-nums">
                {formatRemaining(msRemaining)}
              </p>
            </>
          )}
        </div>
      </div>

      {isExpired && (
        <Button asChild className="mt-4 w-full">
          <Link href="/tickets">Вернуться к билетам</Link>
        </Button>
      )}
    </Card>
  );
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reservationPublicId = searchParams.get("reservation");

  const [status, setStatus] = useState<LoadStatus>(reservationPublicId ? "loading" : "missing");
  const [reservation, setReservation] = useState<PublicReservationDto | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [submitError, setSubmitError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    if (!reservationPublicId) {
      setStatus("missing");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    idempotencyKeyRef.current = crypto.randomUUID();
    getPublicReservationWithMeta(reservationPublicId)
      .then(({ data, meta }) => {
        if (cancelled) return;
        setReservation(data);
        if (meta.serverDate) setClockOffsetMs(meta.serverDate.getTime() - Date.now());
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiClientError && error.code === "RESERVATION_NOT_FOUND") {
          setStatus("not-found");
        } else {
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reservationPublicId]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const correctedNow = now + clockOffsetMs;
  const msRemaining = reservation ? new Date(reservation.expiresAt).getTime() - correctedNow : 0;
  const isExpired = reservation ? reservation.status !== "PENDING" || msRemaining <= 0 : false;

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: { customerName: "", customerPhone: "", customerEmail: "", consent: false },
  });

  const onSubmit = async (values: CheckoutFormValues) => {
    if (!reservation || isExpired || form.formState.isSubmitting) return;
    setSubmitError(null);
    try {
      const order = await createPublicOrder(
        {
          reservationPublicId: reservation.publicId,
          customerName: values.customerName,
          customerPhone: values.customerPhone,
          customerEmail: values.customerEmail,
        },
        idempotencyKeyRef.current,
      );
      router.replace(`/checkout/payment?order=${encodeURIComponent(order.number)}`);
    } catch (error) {
      if (error instanceof ApiClientError) setSubmitError(error.message);
      else setSubmitError("Не удалось оформить заказ. Попробуйте ещё раз.");
    }
  };

  return (
    <PageSection tone="jungle" className="py-10 md:py-14">
      <Container>
        <H1 className="font-display text-4xl font-semibold md:text-5xl">Оформление</H1>
        <p className="mt-2 text-muted-foreground">Контакты гостя и подтверждение брони.</p>

        {status === "loading" && (
          <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <Skeleton className="h-80" />
            <Skeleton className="h-96" />
          </div>
        )}

        {(status === "missing" || status === "error" || status === "not-found") && (
          <Card variant="glass" className="mt-8 max-w-lg p-6">
            <p className="text-sm text-muted-foreground">
              {status === "not-found"
                ? "Бронирование не найдено. Возможно, оно уже истекло."
                : status === "missing"
                  ? "Не указано бронирование для оформления."
                  : "Не удалось загрузить данные бронирования."}
            </p>
            <Button asChild className="mt-4">
              <Link href="/tickets">Вернуться к билетам</Link>
            </Button>
          </Card>
        )}

        {status === "ready" && reservation && (
          <div className="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="order-2 lg:sticky lg:top-24 lg:order-1 lg:self-start">
              <OrderSummary
                reservation={reservation}
                isExpired={isExpired}
                msRemaining={msRemaining}
              />
            </div>

            <motion.div
              className="order-1 lg:order-2"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card variant="glass" className="p-6 md:p-7">
                <h2 className="font-display text-2xl font-semibold text-forest">
                  Контактные данные
                </h2>
                <form
                  className="mt-5 grid gap-4 md:grid-cols-2"
                  onSubmit={form.handleSubmit(onSubmit)}
                  noValidate
                >
                  <div className="grid gap-1.5 md:col-span-2">
                    <label htmlFor="checkout-name" className="text-sm font-bold text-foreground">
                      Имя и фамилия
                    </label>
                    <Input
                      id="checkout-name"
                      autoComplete="name"
                      disabled={isExpired}
                      {...form.register("customerName")}
                    />
                    {form.formState.errors.customerName && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.customerName.message}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-1.5">
                    <label htmlFor="checkout-phone" className="text-sm font-bold text-foreground">
                      Телефон
                    </label>
                    <Input
                      id="checkout-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      disabled={isExpired}
                      {...form.register("customerPhone")}
                    />
                    {form.formState.errors.customerPhone && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.customerPhone.message}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-1.5">
                    <label htmlFor="checkout-email" className="text-sm font-bold text-foreground">
                      Email
                    </label>
                    <Input
                      id="checkout-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      disabled={isExpired}
                      {...form.register("customerEmail")}
                    />
                    {form.formState.errors.customerEmail && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.customerEmail.message}
                      </p>
                    )}
                  </div>
                  <label className="flex gap-3 text-sm text-muted-foreground md:col-span-2">
                    <input type="checkbox" disabled={isExpired} {...form.register("consent")} />Я
                    согласен с правилами посещения и обработкой персональных данных.
                  </label>
                  {form.formState.errors.consent && (
                    <p className="text-xs text-destructive md:col-span-2">
                      {form.formState.errors.consent.message}
                    </p>
                  )}
                  <Button
                    className="md:col-span-2"
                    type="submit"
                    size="lg"
                    disabled={isExpired || form.formState.isSubmitting}
                  >
                    {form.formState.isSubmitting ? "Оформляем заказ…" : "Продолжить к оплате"}
                  </Button>
                  {submitError && (
                    <p className="text-xs text-destructive md:col-span-2">{submitError}</p>
                  )}
                </form>
              </Card>
            </motion.div>

            {/* Mobile sticky summary bar */}
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-beige bg-white/90 p-3 backdrop-blur-xl lg:hidden">
              <div className="container-site flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Итого</p>
                  <p className="font-display text-xl font-semibold">
                    {formatMoneyFromKopecks(reservation.totalAmount)}
                  </p>
                </div>
                {!isExpired && (
                  <p className="rounded-full bg-orange-soft px-3 py-1 text-sm font-extrabold tabular-nums text-forest">
                    {formatRemaining(msRemaining)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </Container>
    </PageSection>
  );
}

export default function Checkout() {
  return (
    <Suspense
      fallback={
        <PageSection tone="jungle" className="py-14">
          <Container>
            <Skeleton className="h-10 w-64" />
            <Skeleton className="mt-8 h-80 w-full" />
          </Container>
        </PageSection>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
