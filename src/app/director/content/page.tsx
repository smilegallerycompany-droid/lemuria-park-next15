"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/director/PageHeader";
import { directorFetch } from "@/lib/director/client";
import { FAQ_PUBLIC_LIMIT } from "@/lib/cms/defaults";

type Benefit = {
  title: string;
  description: string;
  iconKey: string;
  sortOrder: number;
  isActive: boolean;
};

type SiteSettings = {
  siteName: string;
  siteSubtitle: string;
  ctaLabel: string;
  heroBadge: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroDescription: string | null;
  heroImageUrl: string | null;
  heroCtaLabel: string | null;
  heroCtaHref: string | null;
  heroActive: boolean;
  aboutEyebrow: string | null;
  aboutTitle: string | null;
  aboutDescription: string | null;
  aboutBenefits: Benefit[] | null;
  sessionGenerationDays: number;
  maintenanceMode: boolean;
};

type ContentBundle = {
  siteSettings: SiteSettings | null;
  contactSettings: {
    phone: string;
    email: string | null;
    supportHours: string | null;
  } | null;
  faq: Array<{ id: string; question: string; answer: string; sortOrder: number; isPublished: boolean }>;
  gallery: Array<{
    id: string;
    imageUrl: string;
    altText: string;
    caption: string | null;
    sortOrder: number;
    isPublished: boolean;
  }>;
};

function emptySite(): SiteSettings {
  return {
    siteName: "Лемурия Парк",
    siteSubtitle: "Зоотеатр лемуров",
    ctaLabel: "Купить билет",
    heroBadge: "Онлайн-касса",
    heroTitle: "Лемурия\nПарк",
    heroSubtitle: "Зоотеатр лемуров",
    heroDescription: "",
    heroImageUrl: "/hero-lemur.png",
    heroCtaLabel: "Купить билет",
    heroCtaHref: "#booking",
    heroActive: true,
    aboutEyebrow: "Впечатления",
    aboutTitle: "Ближе к природе.\nБлиже друг к другу.",
    aboutDescription: "",
    aboutBenefits: [],
    sessionGenerationDays: 60,
    maintenanceMode: false,
  };
}

export default function DirectorContentPage() {
  const [content, setContent] = useState<ContentBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [faqDraft, setFaqDraft] = useState({ question: "", answer: "" });
  const [uploading, setUploading] = useState(false);

  async function reload() {
    const data = await directorFetch<ContentBundle>("/api/director/content");
    setContent(data);
  }

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка"));
  }, []);

  const site = content?.siteSettings ?? emptySite();
  const benefits = useMemo(() => {
    const raw = site.aboutBenefits;
    return Array.isArray(raw) ? raw : [];
  }, [site.aboutBenefits]);

  function patchSite(partial: Partial<SiteSettings>) {
    if (!content) return;
    setContent({
      ...content,
      siteSettings: { ...(content.siteSettings ?? emptySite()), ...partial },
    });
  }

  async function saveSite() {
    if (!content?.siteSettings) return;
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const updated = await directorFetch<ContentBundle>("/api/director/content", {
        method: "PATCH",
        body: JSON.stringify({
          site: content.siteSettings,
          contact: content.contactSettings ?? undefined,
        }),
      });
      setContent(updated);
      setSaved("Hero / About / контакты сохранены");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  async function addFaq() {
    if (!faqDraft.question.trim() || !faqDraft.answer.trim()) return;
    const published = (content?.faq ?? []).filter((f) => f.isPublished).length;
    if (published >= FAQ_PUBLIC_LIMIT) {
      setError(`На главной максимум ${FAQ_PUBLIC_LIMIT} вопросов. Скройте один, чтобы добавить новый.`);
      return;
    }
    setError(null);
    try {
      await directorFetch("/api/director/content/faq", {
        method: "POST",
        body: JSON.stringify({
          question: faqDraft.question.trim(),
          answer: faqDraft.answer.trim(),
          sortOrder: content?.faq.length ?? 0,
          isPublished: true,
        }),
      });
      setFaqDraft({ question: "", answer: "" });
      setSaved("FAQ добавлен");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "FAQ create failed");
    }
  }

  async function patchFaq(
    id: string,
    body: Record<string, unknown>,
  ) {
    setError(null);
    try {
      await directorFetch(`/api/director/content/faq/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await reload();
      setSaved("FAQ обновлён");
    } catch (err) {
      setError(err instanceof Error ? err.message : "FAQ update failed");
    }
  }

  async function uploadGallery(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("altText", file.name);
      form.append("sortOrder", String(content?.gallery.length ?? 0));
      const res = await fetch("/api/director/content/gallery", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "Upload failed");
      setSaved("Изображение загружено");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function patchGallery(id: string, body: Record<string, unknown>) {
    try {
      await directorFetch(`/api/director/content/gallery/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await reload();
      setSaved("Gallery обновлён");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gallery update failed");
    }
  }

  if (!content && !error) return <div className="director-empty">Загрузка…</div>;

  return (
    <>
      <PageHeader
        title="Content CMS"
        description="Hero, About, FAQ и Gallery публичного сайта. Preview справа."
        actions={
          <button
            type="button"
            className="director-btn primary"
            disabled={saving}
            onClick={saveSite}
          >
            {saving ? "Сохранение…" : "Сохранить Hero/About"}
          </button>
        }
      />
      {error ? <div className="director-alert error">{error}</div> : null}
      {saved ? <div className="director-alert success">{saved}</div> : null}

      <div className="director-grid-2" style={{ alignItems: "start" }}>
        <div>
          <section className="director-panel" style={{ marginBottom: 18 }}>
            <div className="director-panel-head">
              <h2>Hero</h2>
            </div>
            <div className="director-form-grid">
              <div className="director-field">
                <label>Badge</label>
                <input
                  value={site.heroBadge ?? ""}
                  onChange={(e) => patchSite({ heroBadge: e.target.value })}
                />
              </div>
              <div className="director-field">
                <label>CTA text</label>
                <input
                  value={site.heroCtaLabel ?? ""}
                  onChange={(e) => patchSite({ heroCtaLabel: e.target.value })}
                />
              </div>
              <div className="director-field" style={{ gridColumn: "1 / -1" }}>
                <label>H1 (используйте \\n для переноса)</label>
                <input
                  value={site.heroTitle ?? ""}
                  onChange={(e) => patchSite({ heroTitle: e.target.value })}
                />
              </div>
              <div className="director-field">
                <label>Subtitle</label>
                <input
                  value={site.heroSubtitle ?? ""}
                  onChange={(e) => patchSite({ heroSubtitle: e.target.value })}
                />
              </div>
              <div className="director-field">
                <label>CTA href / anchor</label>
                <input
                  value={site.heroCtaHref ?? "#booking"}
                  onChange={(e) => patchSite({ heroCtaHref: e.target.value })}
                />
              </div>
              <div className="director-field" style={{ gridColumn: "1 / -1" }}>
                <label>Description</label>
                <textarea
                  value={site.heroDescription ?? ""}
                  onChange={(e) => patchSite({ heroDescription: e.target.value })}
                />
              </div>
              <div className="director-field" style={{ gridColumn: "1 / -1" }}>
                <label>Hero image URL</label>
                <input
                  value={site.heroImageUrl ?? ""}
                  onChange={(e) => patchSite({ heroImageUrl: e.target.value })}
                />
              </div>
              <label className="director-field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={site.heroActive}
                  onChange={(e) => patchSite({ heroActive: e.target.checked })}
                />
                Hero active
              </label>
            </div>
          </section>

          <section className="director-panel" style={{ marginBottom: 18 }}>
            <div className="director-panel-head">
              <h2>About</h2>
            </div>
            <div className="director-form-grid">
              <div className="director-field">
                <label>Eyebrow</label>
                <input
                  value={site.aboutEyebrow ?? ""}
                  onChange={(e) => patchSite({ aboutEyebrow: e.target.value })}
                />
              </div>
              <div className="director-field" style={{ gridColumn: "1 / -1" }}>
                <label>Title</label>
                <input
                  value={site.aboutTitle ?? ""}
                  onChange={(e) => patchSite({ aboutTitle: e.target.value })}
                />
              </div>
              <div className="director-field" style={{ gridColumn: "1 / -1" }}>
                <label>Description</label>
                <textarea
                  value={site.aboutDescription ?? ""}
                  onChange={(e) => patchSite({ aboutDescription: e.target.value })}
                />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <strong>Преимущества ({benefits.length})</strong>
              {benefits.map((b, idx) => (
                <div key={idx} className="director-form-grid" style={{ marginTop: 8, borderTop: "1px solid #eee", paddingTop: 8 }}>
                  <div className="director-field">
                    <label>Title</label>
                    <input
                      value={b.title}
                      onChange={(e) => {
                        const next = [...benefits];
                        next[idx] = { ...b, title: e.target.value };
                        patchSite({ aboutBenefits: next });
                      }}
                    />
                  </div>
                  <div className="director-field">
                    <label>Icon key</label>
                    <input
                      value={b.iconKey}
                      onChange={(e) => {
                        const next = [...benefits];
                        next[idx] = { ...b, iconKey: e.target.value };
                        patchSite({ aboutBenefits: next });
                      }}
                    />
                  </div>
                  <div className="director-field" style={{ gridColumn: "1 / -1" }}>
                    <label>Description</label>
                    <input
                      value={b.description}
                      onChange={(e) => {
                        const next = [...benefits];
                        next[idx] = { ...b, description: e.target.value };
                        patchSite({ aboutBenefits: next });
                      }}
                    />
                  </div>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={b.isActive}
                      onChange={(e) => {
                        const next = [...benefits];
                        next[idx] = { ...b, isActive: e.target.checked };
                        patchSite({ aboutBenefits: next });
                      }}
                    />
                    Active
                  </label>
                </div>
              ))}
              <button
                type="button"
                className="director-btn secondary"
                style={{ marginTop: 8 }}
                onClick={() =>
                  patchSite({
                    aboutBenefits: [
                      ...benefits,
                      {
                        title: "Новое преимущество",
                        description: "",
                        iconKey: "leaf",
                        sortOrder: benefits.length,
                        isActive: true,
                      },
                    ],
                  })
                }
              >
                + преимущество
              </button>
            </div>
          </section>

          <section className="director-panel" style={{ marginBottom: 18 }}>
            <div className="director-panel-head">
              <h2>FAQ</h2>
            </div>
            <p style={{ margin: "0 0 12px", color: "#4f5b49", fontSize: 14 }}>
              На главной показываются только {FAQ_PUBLIC_LIMIT} вопросов — те, что снимают сомнения перед
              покупкой билета. Не превращайте FAQ в энциклопедию.
            </p>
            <div className="director-form-grid">
              <div className="director-field">
                <label>Question</label>
                <input
                  value={faqDraft.question}
                  onChange={(e) => setFaqDraft({ ...faqDraft, question: e.target.value })}
                />
              </div>
              <div className="director-field" style={{ gridColumn: "1 / -1" }}>
                <label>Answer</label>
                <textarea
                  value={faqDraft.answer}
                  onChange={(e) => setFaqDraft({ ...faqDraft, answer: e.target.value })}
                />
              </div>
            </div>
            <button type="button" className="director-btn secondary" onClick={addFaq}>
              Добавить FAQ
            </button>
            <div className="director-table-wrap" style={{ marginTop: 12 }}>
              <table className="director-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Question</th>
                    <th>Active</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(content?.faq ?? []).map((f) => (
                    <tr key={f.id}>
                      <td>
                        <input
                          type="number"
                          style={{ width: 64 }}
                          value={f.sortOrder}
                          onChange={(e) =>
                            patchFaq(f.id, { sortOrder: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td>
                        <div>{f.question}</div>
                        <small style={{ color: "#666" }}>{f.answer.slice(0, 80)}</small>
                      </td>
                      <td>{f.isPublished ? "yes" : "archived"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {f.isPublished ? (
                          <button
                            type="button"
                            className="director-btn secondary"
                            onClick={() => patchFaq(f.id, { archive: true })}
                          >
                            Archive
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="director-btn secondary"
                            onClick={() => patchFaq(f.id, { restore: true })}
                          >
                            Restore
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="director-panel">
            <div className="director-panel-head">
              <h2>Gallery</h2>
            </div>
            <input
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadGallery(file);
              }}
            />
            <div className="director-table-wrap" style={{ marginTop: 12 }}>
              <table className="director-table">
                <thead>
                  <tr>
                    <th>Preview</th>
                    <th>Alt / caption</th>
                    <th>Order</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(content?.gallery ?? []).map((g) => (
                    <tr key={g.id}>
                      <td>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={g.imageUrl} alt={g.altText} width={72} height={48} style={{ objectFit: "cover" }} />
                      </td>
                      <td>
                        <input
                          value={g.altText}
                          onBlur={(e) => {
                            if (e.target.value !== g.altText) {
                              void patchGallery(g.id, { altText: e.target.value });
                            }
                          }}
                          onChange={(e) => {
                            if (!content) return;
                            setContent({
                              ...content,
                              gallery: content.gallery.map((row) =>
                                row.id === g.id ? { ...row, altText: e.target.value } : row,
                              ),
                            });
                          }}
                        />
                        <input
                          placeholder="caption"
                          value={g.caption ?? ""}
                          onBlur={(e) => {
                            const next = e.target.value || null;
                            if (next !== g.caption) void patchGallery(g.id, { caption: next });
                          }}
                          onChange={(e) => {
                            if (!content) return;
                            setContent({
                              ...content,
                              gallery: content.gallery.map((row) =>
                                row.id === g.id ? { ...row, caption: e.target.value } : row,
                              ),
                            });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          style={{ width: 64 }}
                          value={g.sortOrder}
                          onChange={(e) =>
                            patchGallery(g.id, { sortOrder: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td>
                        {g.isPublished ? (
                          <button
                            type="button"
                            className="director-btn secondary"
                            onClick={() => patchGallery(g.id, { archive: true })}
                          >
                            Archive
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="director-btn secondary"
                            onClick={() => patchGallery(g.id, { restore: true })}
                          >
                            Restore
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="director-panel" style={{ position: "sticky", top: 16 }}>
          <div className="director-panel-head">
            <h2>Preview</h2>
          </div>
          <div style={{ padding: 12, background: "#f6f8f4", borderRadius: 12 }}>
            <span className="kicker" style={{ fontSize: 12 }}>{site.heroBadge}</span>
            <h3 style={{ whiteSpace: "pre-line", margin: "8px 0" }}>{site.heroTitle}</h3>
            <div style={{ opacity: 0.8 }}>{site.heroSubtitle}</div>
            <p style={{ fontSize: 14 }}>{site.heroDescription}</p>
            <div style={{ marginTop: 8 }}>
              <span className="director-btn primary">{site.heroCtaLabel}</span>
              <small style={{ marginLeft: 8 }}>{site.heroCtaHref}</small>
            </div>
            {!site.heroActive ? (
              <p style={{ color: "#a30", marginTop: 12 }}>Hero выключен (active=false)</p>
            ) : null}
          </div>
        </aside>
      </div>
    </>
  );
}
