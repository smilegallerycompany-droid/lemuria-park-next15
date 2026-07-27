import Link from "next/link";
import { SITE } from "@/lib/domain";

export function SiteFooter() {
  return (
    <footer className="mt-8 border-t border-beige bg-gradient-to-b from-cream/40 to-beige/60 py-14">
      <div className="container-site grid gap-10 md:grid-cols-4">
        <div>
          <h3 className="font-display text-xl font-semibold text-forest">Лемурия Парк</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Живое общение, яркие эмоции и фотографии, которые хочется сохранить.
          </p>
        </div>
        <div>
          <h4 className="text-sm font-extrabold uppercase tracking-wide text-forest">
            Посетителям
          </h4>
          <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
            <Link className="hover:text-forest" href="/tickets">
              Купить билет
            </Link>
            <Link className="hover:text-forest" href="/about">
              О зоотеатре
            </Link>
            <Link className="hover:text-forest" href="/location">
              Как нас найти
            </Link>
          </div>
        </div>
        <div>
          <h4 className="text-sm font-extrabold uppercase tracking-wide text-forest">
            Режим работы
          </h4>
          <p className="mt-3 text-sm text-muted-foreground">
            {SITE.schedule}
            <br />
            Сеансы каждые {SITE.sessionMinutes} минут
          </p>
        </div>
        <div>
          <h4 className="text-sm font-extrabold uppercase tracking-wide text-forest">Контакты</h4>
          <p className="mt-3 text-sm text-muted-foreground">
            {SITE.phone}
            <br />
            {SITE.complaintsPhone}
          </p>
        </div>
      </div>
    </footer>
  );
}
