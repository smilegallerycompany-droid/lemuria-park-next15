import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Кабинет собственника — скоро",
  robots: { index: false, follow: false },
};

export default function OwnerUnavailablePage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24 text-center">
      <p className="text-sm uppercase tracking-wide text-neutral-500">Лемурия Парк</p>
      <h1 className="mt-3 text-2xl font-semibold">Кабинет собственника ещё не открыт</h1>
      <p className="mt-4 text-neutral-600">
        Этот адрес зарезервирован. Публичный сайт, касса и кабинет директора работают на своих
        хостах.
      </p>
    </main>
  );
}
