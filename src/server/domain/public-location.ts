/**
 * Public booking location selection.
 * One ACTIVE location → auto-select. Several → require slug. Unknown/inactive → not found.
 */

export type BookableLocationResolution<T> =
  | { kind: "ok"; location: T }
  | { kind: "need-slug" }
  | { kind: "not-found" };

export function resolveBookableLocation<T extends { slug: string }>(params: {
  slug?: string;
  active: T[];
}): BookableLocationResolution<T> {
  if (params.slug) {
    const found = params.active.find((loc) => loc.slug === params.slug);
    return found ? { kind: "ok", location: found } : { kind: "not-found" };
  }
  if (params.active.length === 1) return { kind: "ok", location: params.active[0]! };
  if (params.active.length === 0) return { kind: "not-found" };
  return { kind: "need-slug" };
}
