"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Clock3, Leaf, MapPin, Sparkles, Ticket, Users } from "lucide-react";
import { BookingAwwwards as Booking } from "@/components/booking/BookingAwwwards";

const ADDRESS =
  "Краснодар, МегаЦентр Красная площадь, 2 этаж рядом с магазином Kari";

/**
 * Approved awwwards home composition — visual source of truth.
 * Booking widget talks to production `/api/public/*` (next15 services).
 */
export default function HomePage() {
  return (
    <main>
      <header className="site-header">
        <div className="container header-shell">
          <Link href="/" className="brand">
            <span className="brand-symbol">◉</span>
            <span className="brand-copy">
              Лемурия Парк
              <small>зоотеатр лемуров</small>
            </span>
          </Link>

          <nav className="nav">
            <a href="#booking">Билеты</a>
            <a href="#about">О зоотеатре</a>
            <a href="#visit">Визит</a>
            <a href="#faq">Вопросы</a>
          </nav>

          <div className="header-action">
            <a href="#booking" className="button button-orange">
              Купить билет
            </a>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="container hero-content">
          <motion.div
            className="hero-copy"
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75 }}
          >
            <span className="kicker">Онлайн-касса</span>
            <h1>
              Лемурия
              <br />
              Парк
            </h1>
            <div className="hero-subtitle">Зоотеатр лемуров</div>
            <p>
              Семейный зоотеатр с яркими впечатлениями и добрыми эмоциями — билеты на удобное время
              онлайн.
            </p>
            <div className="hero-actions">
              <a className="button button-orange" href="#booking">
                Купить билет
              </a>
              <span className="button button-ghost">
                <Leaf size={18} /> Сеансы по расписанию
              </span>
            </div>
            <p className="hero-address">
              <MapPin size={16} aria-hidden />
              Краснодар, Мегацентр Красная площадь, второй этаж, рядом с магазином Kari
            </p>
          </motion.div>
        </div>
      </section>

      <Booking />

      <section id="about" className="section container">
        <div className="section-head">
          <div>
            <span className="kicker">Впечатления</span>
            <h2>
              Ближе к природе.
              <br />
              Ближе друг к другу.
            </h2>
          </div>
          <p>
            Небольшие группы, спокойный формат посещения и атмосфера, в которой каждый гость успевает
            рассмотреть лемуров и насладиться шоу зоотеатра.
          </p>
        </div>

        <div className="trust-strip">
          <div className="trust-item">
            <span className="trust-icon">
              <Leaf />
            </span>
            <strong>Зоотеатр для семьи</strong>
          </div>
          <div className="trust-item">
            <span className="trust-icon">
              <Clock3 />
            </span>
            <strong>Сеансы каждые 30 минут</strong>
          </div>
          <div className="trust-item">
            <span className="trust-icon">
              <Sparkles />
            </span>
            <strong>Эмоции для всей семьи</strong>
          </div>
          <div className="trust-item">
            <span className="trust-icon">
              <MapPin />
            </span>
            <strong>С 1 августа по 15 сентября</strong>
          </div>
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
            Короткий понятный маршрут: выберите сеанс, приходите вовремя — и наслаждайтесь
            программой зоотеатра.
          </p>
        </div>

        <div className="visit-grid">
          <article className="visit-card">
            <span className="visit-num">01</span>
            <Ticket className="visit-icon" size={22} aria-hidden />
            <h3>Купите билет онлайн</h3>
            <p>Выберите дату и ближайшее время — места резервируются сразу после оплаты.</p>
          </article>
          <article className="visit-card">
            <span className="visit-num">02</span>
            <Clock3 className="visit-icon" size={22} aria-hidden />
            <h3>Приходите к началу сеанса</h3>
            <p>Сеансы идут каждые 30 минут. Лучше быть на месте за 10 минут до старта.</p>
          </article>
          <article className="visit-card">
            <span className="visit-num">03</span>
            <Users className="visit-icon" size={22} aria-hidden />
            <h3>Небольшие группы</h3>
            <p>До 15 гостей на сеанс — всем комфортно смотреть программу и фотографировать.</p>
          </article>
          <article className="visit-card visit-card-accent">
            <span className="visit-num">04</span>
            <MapPin className="visit-icon" size={22} aria-hidden />
            <h3>Где мы находимся</h3>
            <p>{ADDRESS}</p>
          </article>
        </div>
      </section>

      <section id="faq" className="section container">
        <div className="section-head">
          <div>
            <span className="kicker">FAQ</span>
            <h2>Ответы на частые вопросы</h2>
          </div>
        </div>
        <div className="faq">
          <details>
            <summary>Можно фотографировать?</summary>
            <p>Да, личная съёмка разрешена. Просим соблюдать рекомендации сотрудников.</p>
          </details>
          <details>
            <summary>Сколько длится посещение?</summary>
            <p>Сеансы проходят по расписанию каждые 30 минут. Вторник — выходной.</p>
          </details>
          <details>
            <summary>До какого числа работает выставка?</summary>
            <p>Выставка в Краснодаре проходит с 1 августа по 15 сентября.</p>
          </details>
          <details>
            <summary>Сколько гостей бывает на сеансе?</summary>
            <p>Не более 15 человек, чтобы всем было комфортно.</p>
          </details>
          <details>
            <summary>Можно прийти с маленьким ребёнком?</summary>
            <p>Да. Дети находятся рядом со взрослыми и следуют правилам посещения.</p>
          </details>
        </div>
      </section>

      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <strong style={{ fontSize: 24 }}>Лемурия Парк</strong>
            <p>Зоотеатр лемуров</p>
          </div>
          <div>
            <small>Телефон</small>
            <p>+7 920 971-40-22</p>
          </div>
          <div>
            <small>Адрес</small>
            <p>{ADDRESS}</p>
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
