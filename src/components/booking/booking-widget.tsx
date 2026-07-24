"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { PRICES, type TicketCounts } from "@/lib/domain";
import { formatMoney, cn } from "@/lib/utils";
const sessions = ["11:00", "12:00", "13:00", "14:00"];
export function BookingWidget({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [time, setTime] = useState("12:00");
  const [counts, setCounts] = useState<TicketCounts>({ adult: 2, child: 1, toddler: 0 });
  const total = useMemo(() => counts.adult * PRICES.adult + counts.child * PRICES.child, [counts]);
  const setCount = (k: keyof TicketCounts, next: number) => setCounts((v) => ({ ...v, [k]: next }));
  const go = () => {
    sessionStorage.setItem(
      "lemuria-order",
      JSON.stringify({ date: "2026-07-23", time, counts, total }),
    );
    router.push("/checkout");
  };
  return (
    <Card className={cn("p-5 md:p-7", compact && "shadow-none")}>
      <h2 className="mb-6 text-2xl font-black">Купите билет онлайн</h2>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.35fr_1.45fr_.7fr]">
        <section>
          <p className="mb-3 text-sm font-extrabold text-forest">1. Выберите дату</p>
          <input
            className="h-12 w-full rounded-xl border px-3"
            type="date"
            defaultValue="2026-07-23"
          />
        </section>
        <section>
          <p className="mb-3 text-sm font-extrabold text-forest">2. Выберите сеанс</p>
          <div className="grid grid-cols-4 gap-2">
            {sessions.map((s) => (
              <button
                key={s}
                onClick={() => setTime(s)}
                className={cn(
                  "rounded-xl border p-2 text-xs",
                  s === time && "border-leaf bg-leaf text-leaf-foreground",
                )}
              >
                <b className="block text-sm">{s}</b>Осталось 10
              </button>
            ))}
          </div>
        </section>
        <section>
          <p className="mb-3 text-sm font-extrabold text-forest">3. Количество билетов</p>
          {(
            [
              ["adult", "Взрослый (от 12 лет)", PRICES.adult],
              ["child", "Детский (3–11 лет)", PRICES.child],
              ["toddler", "Дети до 3 лет", 0],
            ] as const
          ).map(([k, label, price]) => (
            <div key={k} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 py-1 text-sm">
              <span>{label}</span>
              <span className="text-muted-foreground">{formatMoney(price)}</span>
              <QuantityStepper
                value={counts[k]}
                onChange={(next) => setCount(k, next)}
                min={0}
                max={10}
                valueLabel={label}
                decreaseLabel={`Уменьшить: ${label}`}
                increaseLabel={`Увеличить: ${label}`}
              />
            </div>
          ))}
        </section>
        <section className="flex flex-col justify-end">
          <span className="text-sm">Итого</span>
          <strong className="my-2 text-3xl">{formatMoney(total)}</strong>
          <Button onClick={go}>Перейти к оплате</Button>
        </section>
      </div>
    </Card>
  );
}
