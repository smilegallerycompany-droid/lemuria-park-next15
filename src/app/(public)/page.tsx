"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Clock3, Leaf, MapPin, Sparkles, Ticket, Users } from "lucide-react";
import { BookingAwwwards as Booking } from "@/components/booking/BookingAwwwards";
import {
  WhereWeAreSection,
  type PublicLocationCard,
} from "@/components/public/WhereWeAreSection";
import { ReviewsMarquee } from "@/components/public/ReviewsMarquee";
import {
  DEFAULT_ABOUT,
  DEFAULT_FAQ,
  DEFAULT_HERO,
  DEFAULT_REVIEWS,
  FAQ_PUBLIC_LIMIT,
  type GuestReview,
} from "@/lib/cms/defaults";

type CmsPayload = {
  site: { name: string; subtitle: string; ctaLabel: string };
  hero: {
    badge: string;
    title: string;
    subtitle: string;
    description: string;
    ctaLabel: string;
    ctaHref: string;
    imageUrl: string;
  } | null;
  about: {
    eyebrow: string;
    title: string;
    description: string;
    benefits: Array<{
      title: string;
      description: string;
      iconKey: string;
      sortOrder: number;
      isActive: boolean;
    }>;
  };
  faq: Array<{ question: string; answer: string }>;
  reviews: GuestReview[];
  contact: { phone: string; email: string | null; supportHours: string | null } | null;
  schedulePreview: Array<{ startsAt: string; localTime: string; remainingHint: string }>;
  locations: { sectionTitle: string; locations: PublicLocationCard[] };
};

const ICON_MAP: Record<string, typeof Leaf> = {
  leaf: Leaf,
  clock: Clock3,
  sparkles: Sparkles,
  map: MapPin,
};

function titleLines(title: string) {
  return title.split("\n").map((line, i) => (
    <span key={i}>
      {i > 0 ? <br /> : null}
      {line}
    </span>
  ));
}

/**
 * Public home — CMS-bound with safe fallbacks.
 * Booking widget talks to production `/api/public/*` (unchanged).
 */
export default function HomePage() {
  const [cms, setCms] = useState<CmsPayload | null>(null);

  useEffect(() => {
    fetch("/api/public/content")
      .then((r) => r.json())
      .then((body) => {
        if (body?.ok && body.data) setCms(body.data);
      })
      .catch(() => {
        /* fallback defaults below */
      });
  }, []);

  const hero = cms?.hero ?? {
    badge: DEFAULT_HERO.heroBadge,
    title: DEFAULT_HERO.heroTitle,
    subtitle: DEFAULT_HERO.heroSubtitle,
    description: DEFAULT_HERO.heroDescription,
    ctaLabel: DEFAULT_HERO.heroCtaLabel,
    ctaHref: DEFAULT_HERO.heroCtaHref,
    imageUrl: DEFAULT_HERO.heroImageUrl,
  };

  const about = cms?.about ?? {
    eyebrow: DEFAULT_ABOUT.aboutEyebrow,
    title: DEFAULT_ABOUT.aboutTitle,
    description: DEFAULT_ABOUT.aboutDescription,
    benefits: DEFAULT_ABOUT.aboutBenefits,
  };

  const faq = (cms?.faq?.length ? cms.faq : DEFAULT_FAQ).slice(0, FAQ_PUBLIC_LIMIT);
  const reviews = cms?.reviews?.length ? cms.reviews : DEFAULT_REVIEWS;
  const site = cms?.site ?? {
    name: "Лемурия Парк",
    subtitle: "Зоотеатр лемуров",
    ctaLabel: "Купить билет",
  };

  const locations = cms?.locations?.locations ?? [];
  const sectionTitle = cms?.locations?.sectionTitle ?? "Где мы находимся?";

  const primaryAddress =
    locations[0]?.address ??
    "Краснодар, МегаЦентр Красная площадь, 2 этаж рядом с магазином Kari";
  const primaryPhone = cms?.contact?.phone ?? locations[0]?.phone ?? "+7 920 971-40-22";

  const benefits = useMemo(
    () => [...about.benefits].filter((b) => b.isActive !== false).sort((a, b) => a.sortOrder - b.sortOrder),
    [about.benefits],
  );

  const heroStyle =
    hero.imageUrl && hero.imageUrl !== "/hero-lemur.png"
      ? ({ ["--hero-image" as string]: `url(${hero.imageUrl})` } as React.CSSProperties)
      : undefined;

  return (
    <main>
      <header className="site-header">
        <div className="container header-shell">
          <Link href="/" className="brand">
            <span className="brand-symbol">◉</span>
            <span className="brand-copy">
              {site.name}
              <small>{site.subtitle}</small>
            </span>
          </Link>

          <nav className="nav">
            <a href="#booking">Билеты</a>
            <a href="#about">О зоотеатре</a>
            <a href="#location">Где мы</a>
            <a href="#faq">Вопросы</a>
          </nav>

          <div className="header-action">
            <a href="#booking" className="button button-orange">
              {site.ctaLabel}
            </a>
          </div>
        </div>
      </header>

      {cms?.hero === null ? null : (
        <section className="hero" style={heroStyle}>
          <div className="container hero-content">
            <motion.div
              className="hero-copy"
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.75 }}
            >
              <span className="kicker">{hero.badge}</span>
              <h1>{titleLines(hero.title)}</h1>
              <div className="hero-subtitle">{hero.subtitle}</div>
              <p>{hero.description}</p>
              <div className="hero-actions">
                <a className="button button-orange" href={hero.ctaHref || "#booking"}>
                  {hero.ctaLabel}
                </a>
                <span className="button button-ghost">
                  <Leaf size={18} /> Сеансы по расписанию
                </span>
              </div>
              <p className="hero-address">
                <MapPin size={16} aria-hidden />
                {primaryAddress}
              </p>
            </motion.div>
          </div>
        </section>
      )}

      <Booking />

      <section id="about" className="section container">
        <div className="section-head">
          <div>
            <span className="kicker">{about.eyebrow}</span>
            <h2>{titleLines(about.title)}</h2>
          </div>
          <p>{about.description}</p>
        </div>

        <div className="trust-strip">
          {benefits.slice(0, 6).map((b) => {
            const Icon = ICON_MAP[b.iconKey] ?? Leaf;
            return (
              <div className="trust-item" key={`${b.sortOrder}-${b.title}`}>
                <span className="trust-icon">
                  <Icon />
                </span>
                <strong>{b.title}</strong>
              </div>
            );
          })}
        </div>
      </section>

      <section id="visit" className="section container">
        <div className="section-head">
          <div>
            <span className="kicker">Перед визитом</span>
            <h2>
              Как проходит
              <br />
              посещение
            </h2>
          </div>
          <p>
            Короткий понятный маршрут: выберите сеанс, приходите вовремя и наслаждайтесь программой
            зоотеатра.
          </p>
        </div>
        <div className="visit-grid">
          <article className="visit-card">
            <span className="visit-num">01</span>
            <Ticket className="visit-icon" size={22} aria-hidden />
            <h3>Купите билет онлайн</h3>
            <p>Выберите дату и ближайшее время. Места резервируются сразу после оплаты.</p>
          </article>
          <article className="visit-card">
            <span className="visit-num">02</span>
            <Clock3 className="visit-icon" size={22} aria-hidden />
            <h3>Приходите к началу сеанса</h3>
            <p>Сеанс длится 20 минут. Лучше быть на месте за 10 минут до старта.</p>
          </article>
          <article className="visit-card">
            <span className="visit-num">03</span>
            <Users className="visit-icon" size={22} aria-hidden />
            <h3>Небольшие группы</h3>
            <p>До 15 гостей на сеанс. Всем комфортно смотреть программу и фотографировать.</p>
          </article>
          <article className="visit-card">
            <span className="visit-num">04</span>
            <MapPin className="visit-icon" size={22} aria-hidden />
            <h3>Где мы находимся</h3>
            <p>{primaryAddress}</p>
          </article>
        </div>
      </section>

      {cms?.schedulePreview && cms.schedulePreview.length > 0 ? (
        <section id="schedule-preview" className="section container">
          <div className="section-head">
            <div>
              <span className="kicker">Расписание</span>
              <h2>Ближайшие сеансы</h2>
            </div>
          </div>
          <ul className="schedule-preview-list">
            {cms.schedulePreview.map((s) => (
              <li key={s.startsAt}>
                <strong>{s.localTime}</strong>
                <span>{s.remainingHint}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ReviewsMarquee reviews={reviews} />

      {locations.length > 0 ? (
        <WhereWeAreSection sectionTitle={sectionTitle} locations={locations} />
      ) : null}

      <section id="faq" className="section container">
        <div className="section-head">
          <div>
            <span className="kicker">FAQ</span>
            <h2>Перед покупкой</h2>
          </div>
        </div>
        <div className="faq">
          {faq.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <strong style={{ fontSize: 24 }}>{site.name}</strong>
            <p>{site.subtitle}</p>
          </div>
          <div>
            <small>Телефон</small>
            <p>{primaryPhone}</p>
          </div>
          <div>
            <small>Адрес</small>
            <p>{primaryAddress}</p>
          </div>
          <div>
            <small>Документы</small>
            <p>
              <Link href="/policy" style={{ color: "inherit" }}>
                Политика
              </Link>
              {" · "}
              <Link href="/offer" style={{ color: "inherit" }}>
                Оферта
              </Link>
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
