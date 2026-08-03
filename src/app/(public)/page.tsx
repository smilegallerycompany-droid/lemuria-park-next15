"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Camera, Leaf, MapPin, Sparkles } from "lucide-react";
import { BookingAwwwards as Booking } from "@/components/booking/BookingAwwwards";

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
            <a href="#gallery">Галерея</a>
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
              Пространство живого общения, ярких впечатлений и добрых эмоций для всей семьи.
            </p>
            <div className="hero-actions">
              <a className="button button-orange" href="#booking">
                Купить билет
              </a>
              <span className="button button-ghost">
                <Leaf size={18} /> Живое общение
              </span>
            </div>
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
            Небольшие группы, спокойный формат посещения и атмосфера, в которой каждый гость
            успевает почувствовать настоящий контакт с животными.
          </p>
        </div>

        <div className="trust-strip">
          <div className="trust-item">
            <span className="trust-icon">
              <Leaf />
            </span>
            <strong>Живое общение</strong>
          </div>
          <div className="trust-item">
            <span className="trust-icon">
              <Camera />
            </span>
            <strong>Яркие фотографии</strong>
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
            <strong>Удобное расположение</strong>
          </div>
        </div>
      </section>

      <section id="gallery" className="section container">
        <div className="section-head">
          <div>
            <span className="kicker">Галерея</span>
            <h2>
              Моменты, которые
              <br />
              хочется сохранить
            </h2>
          </div>
          <p>Минимум постановки — максимум живых эмоций и настоящего интереса.</p>
        </div>

        <div className="gallery">
          <figure>
            <Image src="/gallery-1.png" alt="Лемур" width={1200} height={900} />
          </figure>
          <figure>
            <Image src="/gallery-2.png" alt="Лемур" width={800} height={600} />
          </figure>
          <figure>
            <Image src="/hero-lemur.png" alt="Лемур" width={800} height={600} />
          </figure>
          <figure>
            <Image src="/gallery-2.png" alt="Лемур" width={800} height={600} />
          </figure>
          <figure>
            <Image src="/gallery-1.png" alt="Лемур" width={800} height={600} />
          </figure>
        </div>
      </section>

      <section id="faq" className="section container">
        <div className="section-head">
          <div>
            <span className="kicker">Перед визитом</span>
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
            <p>Сеансы проходят по расписанию каждые 30 минут.</p>
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
            <p>Москва, ВДНХ</p>
          </div>
          <div>
            <small>Документы</small>
            <p>Политика · Оферта</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
