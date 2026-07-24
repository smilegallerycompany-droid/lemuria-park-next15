"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { H1 } from "@/components/ui/typography";
import { PageSection } from "@/components/layout/page-section";
import { Container } from "@/components/layout/container";
export default function Checkout() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <PageSection tone="jungle" className="py-14">
      <Container>
        <H1>Оформление заказа</H1>
        <div className="mt-8 grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
          <Card className="p-6">
            <h2 className="text-xl font-black">Ваш заказ</h2>
            <div className="mt-5 grid gap-3 text-sm">
              <p className="flex justify-between">
                <span>23 июля 2026 · 12:00</span>
                <b>—</b>
              </p>
              <p className="flex justify-between">
                <span>Взрослые × 2</span>
                <b>1 600 ₽</b>
              </p>
              <p className="flex justify-between">
                <span>Детский × 1</span>
                <b>600 ₽</b>
              </p>
              <p className="flex justify-between border-t pt-4 text-lg">
                <b>Итого</b>
                <b>2 200 ₽</b>
              </p>
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="text-xl font-black">Контактные данные</h2>
            <form
              className="mt-5 grid gap-4 md:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                await new Promise((r) => setTimeout(r, 700));
                router.push("/success");
              }}
            >
              <div className="grid gap-1.5">
                <label htmlFor="checkout-first-name" className="text-sm font-bold text-foreground">
                  Имя
                </label>
                <Input
                  id="checkout-first-name"
                  name="firstName"
                  placeholder="Имя"
                  autoComplete="given-name"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="checkout-last-name" className="text-sm font-bold text-foreground">
                  Фамилия
                </label>
                <Input
                  id="checkout-last-name"
                  name="lastName"
                  placeholder="Фамилия"
                  autoComplete="family-name"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="checkout-phone" className="text-sm font-bold text-foreground">
                  Телефон
                </label>
                <Input
                  id="checkout-phone"
                  name="phone"
                  placeholder="Телефон"
                  autoComplete="tel"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="checkout-email" className="text-sm font-bold text-foreground">
                  Email
                </label>
                <Input
                  id="checkout-email"
                  name="email"
                  type="email"
                  placeholder="Email"
                  autoComplete="email"
                  required
                />
              </div>
              <label className="flex gap-3 text-sm text-muted-foreground md:col-span-2">
                <input type="checkbox" required />Я согласен с правилами посещения и обработкой
                персональных данных.
              </label>
              <Button className="md:col-span-2" disabled={loading}>
                {loading ? "Создаём бронирование…" : "Оплатить через ЮKassa · 2 200 ₽"}
              </Button>
            </form>
          </Card>
        </div>
      </Container>
    </PageSection>
  );
}
