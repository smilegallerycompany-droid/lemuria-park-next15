"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { H1 } from "@/components/ui/typography";
import { PageSection } from "@/components/layout/page-section";
import { Container } from "@/components/layout/container";
import { checkoutContactFormSchema, type CheckoutContactFormValues } from "@/lib/validation/order";
import { getReservation, createOrder } from "@/lib/api/public";
import { ApiClientError } from "@/lib/api/client";
import { formatMoneyFromKopecks } from "@/lib/utils";
import type { ReservationDto } from "@/types/dto/reservation";

const COUNTDOWN_TICK_MS = 1000;

const checkoutFormSchema = checkoutContactFormSchema.extend({
  consent: z.boolean().refine((value) => value === true, {
    message: "Необходимо согласие с правилами посещения",
  }),
});
type CheckoutFormValues = CheckoutContactFormValues & { consent: boolean };

function formatSessionDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

type LoadStatus = "loading" | "error" | "not-found" | "missing" | "ready";

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reservationId = searchParams.get("reservation");

  const [status, setStatus] = useState<LoadStatus>(reservationId ? "loading" : "missing");
  const [reservation, setReservation] = useState<ReservationDto | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!reservationId) {
      setStatus("missing");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    getReservation(reservationId)
      .then((data) => {
        if (cancelled) return;
        setReservation(data);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiClientError && error.code === "NOT_FOUND") {
          setStatus("not-found");
        } else {
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reservationId]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const msRemaining = reservation ? new Date(reservation.expiresAt).getTime() - now : 0;
  const isExpired = reservation ? reservation.status !== "PENDING" || msRemaining <= 0 : false;

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: { customerName: "", customerPhone: "", customerEmail: "", consent: false },
  });

  const onSubmit = async (values: CheckoutFormValues) => {
    if (!reservation || isExpired) return;
    setSubmitError(null);
    try {
      const order = await createOrder({
        reservationId: reservation.id,
        customerName: values.customerName,
        customerPhone: values.customerPhone,
        customerEmail: values.customerEmail,
      });
      router.push(`/checkout/payment?order=${encodeURIComponent(order.number)}`);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setSubmitError(error.message);
      } else {
        setSubmitError("Не удалось оформить заказ. Попробуйте ещё раз.");
      }
    }
  };

  const timezone = reservation?.session?.locationTimezone ?? "UTC";

  return (
    <PageSection tone="jungle" className="py-14">
      <Container>
        <H1>Оформление заказа</H1>

        {status === "loading" && (
          <p className="mt-8 text-sm text-muted-foreground" role="status">
            Загружаем данные бронирования…
          </p>
        )}

        {status === "missing" && (
          <div className="mt-8 grid gap-3">
            <p className="text-sm text-muted-foreground">Не указано бронирование для оформления.</p>
            <Button asChild className="w-fit">
              <Link href="/tickets">Вернуться к билетам</Link>
            </Button>
          </div>
        )}

        {(status === "error" || status === "not-found") && (
          <div className="mt-8 grid gap-3">
            <p className="text-sm text-muted-foreground">
              {status === "not-found"
                ? "Бронирование не найдено. Возможно, оно уже истекло."
                : "Не удалось загрузить данные бронирования."}
            </p>
            <Button asChild className="w-fit">
              <Link href="/tickets">Вернуться к билетам</Link>
            </Button>
          </div>
        )}

        {status === "ready" && reservation && (
          <div className="mt-8 grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
            <Card className="p-6">
              <h2 className="text-xl font-black">Ваш заказ</h2>
              <div className="mt-5 grid gap-3 text-sm">
                {reservation.session && (
                  <p className="flex justify-between gap-4">
                    <span>
                      {reservation.session.locationCity} · {reservation.session.locationName}
                    </span>
                  </p>
                )}
                {reservation.session && (
                  <p className="flex justify-between">
                    <span>{formatSessionDateTime(reservation.session.startsAt, timezone)}</span>
                  </p>
                )}
                {reservation.items.map((item) => (
                  <p key={item.ticketTypeCode} className="flex justify-between">
                    <span>
                      {item.ticketTypeName} × {item.quantity}
                    </span>
                    <b>{formatMoneyFromKopecks(item.subtotalAmount)}</b>
                  </p>
                ))}
                <p className="flex justify-between border-t pt-4 text-lg">
                  <b>Итого</b>
                  <b>{formatMoneyFromKopecks(reservation.totalAmount)}</b>
                </p>
              </div>

              <div
                className={
                  isExpired
                    ? "mt-5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                    : "mt-5 rounded-xl border p-3 text-sm text-muted-foreground"
                }
                role="status"
              >
                {isExpired ? (
                  "Время бронирования истекло"
                ) : (
                  <>Бронь действует ещё: {formatRemaining(msRemaining)}</>
                )}
              </div>

              {isExpired && (
                <Button asChild className="mt-4 w-fit">
                  <Link href="/tickets">Вернуться к билетам</Link>
                </Button>
              )}
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-black">Контактные данные</h2>
              <form
                className="mt-5 grid gap-4 md:grid-cols-2"
                onSubmit={form.handleSubmit(onSubmit)}
                noValidate
              >
                <div className="grid gap-1.5">
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
                <div className="grid gap-1.5 md:col-span-2">
                  <label htmlFor="checkout-email" className="text-sm font-bold text-foreground">
                    Email
                  </label>
                  <Input
                    id="checkout-email"
                    type="email"
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
                  <input type="checkbox" disabled={isExpired} {...form.register("consent")} />
                  Я согласен с правилами посещения и обработкой персональных данных.
                </label>
                {form.formState.errors.consent && (
                  <p className="text-xs text-destructive md:col-span-2">
                    {form.formState.errors.consent.message}
                  </p>
                )}
                <Button
                  className="md:col-span-2"
                  type="submit"
                  disabled={isExpired || form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? "Оформляем заказ…" : "Продолжить к оплате"}
                </Button>
                {submitError && (
                  <p className="text-xs text-destructive md:col-span-2">{submitError}</p>
                )}
              </form>
            </Card>
          </div>
        )}
      </Container>
    </PageSection>
  );
}

export default function Checkout() {
  return (
    <Suspense fallback={null}>
      <CheckoutContent />
    </Suspense>
  );
}
