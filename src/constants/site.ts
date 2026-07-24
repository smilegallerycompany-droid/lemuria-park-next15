export const SITE = {
  name: "Лемурия Парк",
  subtitle: "Зоотеатр лемуров",
  phone: "+7 920 971-40-22",
  complaintsPhone: "+7 915 356-00-57",
  schedule: "Ежедневно, 10:30–21:00",
  capacity: 15,
  sessionMinutes: 30,
  address: "Адрес текущей площадки уточняется",
} as const;

export const CTA_BUY_TICKET_LABEL = "Купить билет";
export const CTA_BUY_TICKET_HREF = "/tickets";

export interface NavItem {
  label: string;
  href: string;
}

/** Canonical public navigation, used by SiteHeader (and a subset by SiteFooter/mobile nav). */
export const PRIMARY_NAV: readonly NavItem[] = [
  { label: "О зоотеатре", href: "/about" },
  { label: "Как нас найти", href: "/location" },
  { label: "Галерея", href: "/#gallery" },
];
