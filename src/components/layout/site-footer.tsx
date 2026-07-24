import Link from "next/link";
import { SITE } from "@/lib/domain";
export function SiteFooter() {
  return (
    <footer className="bg-[#17321c] py-12 text-white">
      <div className="container-site grid gap-10 md:grid-cols-4">
        <div>
          <h3 className="text-xl font-black">ЛЕМУРИЯ ПАРК</h3>
          <p className="mt-3 text-sm text-white/70">
            Живое общение, яркие эмоции и фотографии, которые хочется сохранить.
          </p>
        </div>
        <div>
          <h4 className="font-bold">Посетителям</h4>
          <div className="mt-3 grid gap-2 text-sm text-white/70">
            <Link href="/tickets">Купить билет</Link>
            <Link href="/about">О зоотеатре</Link>
            <Link href="/location">Как нас найти</Link>
          </div>
        </div>
        <div>
          <h4 className="font-bold">Режим работы</h4>
          <p className="mt-3 text-sm text-white/70">
            {SITE.schedule}
            <br />
            Сеансы каждые {SITE.sessionMinutes} минут
          </p>
        </div>
        <div>
          <h4 className="font-bold">Контакты</h4>
          <p className="mt-3 text-sm text-white/70">
            {SITE.phone}
            <br />
            {SITE.complaintsPhone}
          </p>
        </div>
      </div>
    </footer>
  );
}
