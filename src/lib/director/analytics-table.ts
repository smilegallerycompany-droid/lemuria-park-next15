export type SortDir = "asc" | "desc";

export function sortRows<T>(
  rows: T[],
  key: keyof T | null,
  dir: SortDir,
): T[] {
  if (!key) return rows;
  const copy = [...rows];
  copy.sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") {
      return dir === "asc" ? av - bv : bv - av;
    }
    return dir === "asc"
      ? String(av).localeCompare(String(bv), "ru")
      : String(bv).localeCompare(String(av), "ru");
  });
  return copy;
}

export function toggleSort(
  currentKey: string | null,
  currentDir: SortDir,
  nextKey: string,
): { key: string; dir: SortDir } {
  if (currentKey === nextKey) {
    return { key: nextKey, dir: currentDir === "asc" ? "desc" : "asc" };
  }
  return { key: nextKey, dir: "desc" };
}

/** Director analytics location access: empty locationIds = all locations. */
export function canAccessAnalyticsLocation(
  userLocationIds: string[],
  locationId?: string | null,
): boolean {
  if (!locationId) return true;
  if (userLocationIds.length === 0) return true;
  return userLocationIds.includes(locationId);
}
