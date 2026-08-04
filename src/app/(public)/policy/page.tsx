import Link from "next/link";

export default function PolicyPage() {
  return (
    <main className="page-shell">
      <div className="container" style={{ maxWidth: 820 }}>
        <Link href="/">← На главную</Link>
        <h1 className="page-title">Политика обработки персональных данных</h1>
        <div className="success-card" style={{ display: "grid", gap: 16, lineHeight: 1.7 }}>
          <p>
            ООО «Лемурия Парк» (оператор) обрабатывает персональные данные покупателей билетов в
            целях оформления заказа, связи по вопросам посещения и исполнения договора.
          </p>
          <p>
            Состав данных: имя, телефон, email, сведения о заказе и посещении. Данные хранятся в
            инфраструктуре на территории РФ (Яндекс Облако) и не передаются без законного основания.
          </p>
          <p>
            Вы можете запросить уточнение, блокирование или удаление данных, написав на{" "}
            <a href="mailto:info@lemuriapark.ru">info@lemuriapark.ru</a> или позвонив по телефону
            сайта.
          </p>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            Документ носит информационный характер и будет заменён финальной юридической редакцией
            перед промышленным запуском.
          </p>
        </div>
      </div>
    </main>
  );
}
