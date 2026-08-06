"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/director/PageHeader";
import { directorFetch } from "@/lib/director/client";

type ContentBundle = {
  siteSettings: {
    siteName: string;
    siteSubtitle: string;
    heroTitle: string | null;
    heroDescription: string | null;
    maintenanceMode: boolean;
    sessionGenerationDays: number;
  } | null;
  contactSettings: {
    phone: string;
    email: string | null;
    supportHours: string | null;
    address: string | null;
  } | null;
  faq: Array<{ id: string; question: string; answer: string; sortOrder: number; isPublished: boolean }>;
  gallery: Array<{ id: string; imageUrl: string; altText: string; sortOrder: number; isPublished: boolean }>;
};

export default function DirectorContentPage() {
  const [content, setContent] = useState<ContentBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    directorFetch<ContentBundle>("/api/director/content")
      .then(setContent)
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка"));
  }, []);

  async function save() {
    if (!content) return;
    setError(null);
    setSaved(false);
    try {
      const updated = await directorFetch<ContentBundle>("/api/director/content", {
        method: "PATCH",
        body: JSON.stringify({
          site: content.siteSettings ?? undefined,
          contact: content.contactSettings ?? undefined,
          faq: content.faq,
          gallery: content.gallery,
        }),
      });
      setContent(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    }
  }

  if (!content && !error) return <div className="director-empty">Загрузка…</div>;

  return (
    <>
      <PageHeader
        title="Контент"
        description="Настройки сайта, контакты, FAQ и галерея для публичной страницы."
        actions={
          <button type="button" className="director-btn primary" onClick={save}>
            Сохранить
          </button>
        }
      />
      {error ? <div className="director-alert error">{error}</div> : null}
      {saved ? <div className="director-alert success">Контент обновлён</div> : null}

      {content?.siteSettings ? (
        <section className="director-panel" style={{ marginBottom: 18 }}>
          <div className="director-panel-head">
            <h2>Настройки сайта</h2>
          </div>
          <div className="director-form-grid">
            <div className="director-field">
              <label>Название сайта</label>
              <input
                value={content.siteSettings.siteName}
                onChange={(e) =>
                  setContent({
                    ...content,
                    siteSettings: { ...content.siteSettings!, siteName: e.target.value },
                  })
                }
              />
            </div>
            <div className="director-field">
              <label>Подзаголовок</label>
              <input
                value={content.siteSettings.siteSubtitle}
                onChange={(e) =>
                  setContent({
                    ...content,
                    siteSettings: { ...content.siteSettings!, siteSubtitle: e.target.value },
                  })
                }
              />
            </div>
            <div className="director-field">
              <label>Дней генерации сеансов</label>
              <input
                type="number"
                value={content.siteSettings.sessionGenerationDays}
                onChange={(e) =>
                  setContent({
                    ...content,
                    siteSettings: {
                      ...content.siteSettings!,
                      sessionGenerationDays: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
            <div className="director-field" style={{ gridColumn: "1 / -1" }}>
              <label>Заголовок героя</label>
              <input
                value={content.siteSettings.heroTitle ?? ""}
                onChange={(e) =>
                  setContent({
                    ...content,
                    siteSettings: { ...content.siteSettings!, heroTitle: e.target.value },
                  })
                }
              />
            </div>
            <div className="director-field" style={{ gridColumn: "1 / -1" }}>
              <label>Описание героя</label>
              <textarea
                value={content.siteSettings.heroDescription ?? ""}
                onChange={(e) =>
                  setContent({
                    ...content,
                    siteSettings: { ...content.siteSettings!, heroDescription: e.target.value },
                  })
                }
              />
            </div>
          </div>
        </section>
      ) : null}

      {content?.contactSettings ? (
        <section className="director-panel" style={{ marginBottom: 18 }}>
          <div className="director-panel-head">
            <h2>Контакты</h2>
          </div>
          <div className="director-form-grid">
            <div className="director-field">
              <label>Телефон</label>
              <input
                value={content.contactSettings.phone}
                onChange={(e) =>
                  setContent({
                    ...content,
                    contactSettings: { ...content.contactSettings!, phone: e.target.value },
                  })
                }
              />
            </div>
            <div className="director-field">
              <label>Эл. почта</label>
              <input
                value={content.contactSettings.email ?? ""}
                onChange={(e) =>
                  setContent({
                    ...content,
                    contactSettings: { ...content.contactSettings!, email: e.target.value },
                  })
                }
              />
            </div>
          </div>
        </section>
      ) : null}

      {content ? (
        <section className="director-panel">
          <div className="director-panel-head">
            <h2>Вопросы ({content.faq.length}) · Галерея ({content.gallery.length})</h2>
          </div>
          <div className="director-empty">
            Редактирование списков вопросов и галереи доступно через пакетное обновление.
          </div>
        </section>
      ) : null}
    </>
  );
}
