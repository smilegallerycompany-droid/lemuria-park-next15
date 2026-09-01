import { z } from "zod";

export const aboutBenefitSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  iconKey: z.string().default("leaf"),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export type AboutBenefit = z.infer<typeof aboutBenefitSchema>;

export function parseAboutBenefits(raw: unknown): AboutBenefit[] {
  if (!Array.isArray(raw)) return [];
  const out: AboutBenefit[] = [];
  for (const row of raw) {
    const parsed = aboutBenefitSchema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export const DEFAULT_HERO = {
  heroBadge: "Онлайн-касса",
  heroTitle: "Лемурия\nПарк",
  heroSubtitle: "Зоотеатр лемуров",
  heroDescription:
    "Семейный зоотеатр с яркими впечатлениями и добрыми эмоциями. Билеты на удобное время онлайн.",
  heroCtaLabel: "Купить билет",
  heroCtaHref: "#booking",
  heroImageUrl: "/hero-lemur.png",
  heroActive: true,
};

export const DEFAULT_ABOUT = {
  aboutEyebrow: "Впечатления",
  aboutTitle: "Ближе к природе.\nБлиже друг к другу.",
  aboutDescription:
    "Небольшие группы, спокойный формат посещения и атмосфера, в которой каждый гость успевает рассмотреть лемуров и насладиться шоу зоотеатра.",
  aboutBenefits: [
    {
      title: "Зоотеатр для семьи",
      description: "Спокойный формат и внимание к гостям",
      iconKey: "leaf",
      sortOrder: 0,
      isActive: true,
    },
    {
      title: "Сеанс 20 минут",
      description: "Удобное расписание в течение дня",
      iconKey: "clock",
      sortOrder: 1,
      isActive: true,
    },
    {
      title: "Эмоции для всей семьи",
      description: "Яркие впечатления и добрые эмоции",
      iconKey: "sparkles",
      sortOrder: 2,
      isActive: true,
    },
    {
      title: "Сезонная выставка",
      description: "Актуальные даты и локация в городе",
      iconKey: "map",
      sortOrder: 3,
      isActive: true,
    },
  ] satisfies AboutBenefit[],
};

/** Public homepage FAQ: at most 5 purchase-decision questions. */
export const FAQ_PUBLIC_LIMIT = 5;

export const DEFAULT_FAQ = [
  {
    question: "Сколько длится посещение?",
    answer: "Сеанс длится 20 минут.",
  },
  {
    question: "Сколько человек бывает на одном сеансе?",
    answer: "Не более 15 гостей на сеанс.",
  },
  {
    question: "Можно ли фотографировать и взаимодействовать с лемурами?",
    answer:
      "Личная съёмка разрешена. Соблюдайте рекомендации сотрудников. Правила взаимодействия с лемурами задаёт команда на сеансе.",
  },
  {
    question: "Можно ли купить билет на месте или лучше заранее?",
    answer:
      "Билет можно купить онлайн или в кассе перед сеансом. Мест на сеанс немного, надёжнее взять заранее.",
  },
  {
    question: "Что делать, если я опоздал на сеанс?",
    answer: "Правило для опоздавших уточняйте у кассы или администратора.",
  },
];

export type GuestReview = {
  quote: string;
  author: string;
  rating: 4 | 5;
};

export const DEFAULT_REVIEWS: GuestReview[] = [
  {
    quote: "Сыну очень зашло! Лемуры близко, можно спокойно смотреть и снимать. Вышли все с улыбками.",
    author: "Алина",
    rating: 5,
  },
  {
    quote: "Билеты взяли онлайн, пришли заранее. Всё чётко, фото получились классные.",
    author: "Максим",
    rating: 4,
  },
  {
    quote: "Дочка сначала робела, потом смеялась без остановки. Обязательно придём ещё.",
    author: "Катя",
    rating: 5,
  },
  {
    quote: "Нашли сразу у Kari. Для семьи супер, без давки и суеты.",
    author: "Сергей",
    rating: 5,
  },
  {
    quote: "Сеанс короткий, но эмоций море. Мест мало, мы взяли заранее и не пожалели.",
    author: "Юля",
    rating: 4,
  },
  {
    quote: "Ходили всей семьёй. Дети в восторге, взрослые тоже. Чисто, персонал добрый.",
    author: "Ирина",
    rating: 5,
  },
  {
    quote: "Зашли между магазинами и получили лучшее впечатление за весь день в Мегацентре.",
    author: "Никита",
    rating: 5,
  },
  {
    quote: "Лемуры такие забавные. Старший сын сразу просил ещё один сеанс.",
    author: "Даша",
    rating: 5,
  },
  {
    quote: "В среду утром почти никого. Спокойно, уютно, очень понравилось.",
    author: "Роман",
    rating: 4,
  },
  {
    quote: "Фотографии огонь. Ребёнок теперь всем рассказывает про лемуров.",
    author: "Вика",
    rating: 5,
  },
  {
    quote: "Милое место. 20 минут пролетели, хотелось ещё чуть-чуть посидеть.",
    author: "Олег",
    rating: 4,
  },
  {
    quote: "Брали с мамой и племянницей. Все довольные, особенно дети. Спасибо!",
    author: "Таня",
    rating: 5,
  },
];
