export const SITE = {
  name: "Лемурия Парк",
  subtitle: "Зоотеатр лемуров",
  phone: "+7 920 971-40-22",
  complaintsPhone: "+7 915 356-00-57",
  schedule: "Ежедневно, 10:30–21:00",
  capacity: 15,
  sessionMinutes: 30,
  visitMinutes: 20,
  address:
    "Краснодар, МегаЦентр Красная площадь, 2 этаж рядом с магазином Kari",
} as const;

/** Primary CTA scrolls to the booking cashier on the home page. */
export const CTA_BUY_TICKET_LABEL = "Купить билет";
export const CTA_BUY_TICKET_HREF = "/#booking";

export interface NavItem {
  label: string;
  href: string;
}

/** Secondary navigation — never competes with the booking cashier above. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { label: "Как добраться", href: "/location" },
  { label: "О зоотеатре", href: "/about" },
];
