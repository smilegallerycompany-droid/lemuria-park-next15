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
    "Семейный зоотеатр с яркими впечатлениями и добрыми эмоциями — билеты на удобное время онлайн.",
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
      title: "Сеансы каждые 30 минут",
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

export const DEFAULT_FAQ = [
  {
    question: "Можно фотографировать?",
    answer: "Да, личная съёмка разрешена. Просим соблюдать рекомендации сотрудников.",
  },
  {
    question: "Сколько длится посещение?",
    answer: "Сеансы проходят по расписанию каждые 30 минут. Вторник — выходной.",
  },
  {
    question: "До какого числа работает выставка?",
    answer: "Выставка в Краснодаре проходит с 1 августа по 15 сентября.",
  },
  {
    question: "Сколько гостей бывает на сеансе?",
    answer: "Не более 15 человек, чтобы всем было комфортно.",
  },
  {
    question: "Можно прийти с маленьким ребёнком?",
    answer: "Да. Дети находятся рядом со взрослыми и следуют правилам посещения.",
  },
];
