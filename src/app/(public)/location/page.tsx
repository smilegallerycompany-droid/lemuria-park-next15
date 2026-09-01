import { getPublicLocationsPayload } from "@/server/services/public-locations";
import { WhereWeAreSection } from "@/components/public/WhereWeAreSection";

export default async function LocationPage() {
  const data = await getPublicLocationsPayload();
  const locations = data.locations;

  if (locations.length === 0) {
    return (
      <main className="page-shell">
        <div className="container" style={{ padding: "48px 0 80px" }}>
          <p className="kicker">Локация</p>
          <h1 className="page-title">Как нас найти</h1>
          <section className="location-map-fallback" style={{ minHeight: 280, marginTop: 24 }}>
            <div className="location-map-fallback-inner">
              <div className="location-map-fallback-icon" aria-hidden>
                ⌖
              </div>
              <strong>Карта пока не опубликована</strong>
              <p>
                Адрес и координаты появятся здесь после того, как администратор заполнит карту
                локации в панели.
              </p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <WhereWeAreSection
        sectionTitle={data.sectionTitle}
        locations={locations}
        initialSlug={locations.length === 1 ? locations[0]!.slug : undefined}
      />
    </main>
  );
}
