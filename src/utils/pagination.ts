export const DEFAULT_PAGE_SIZE = 25;

/** Returns the [from, to] inclusive row range for a 0-based page (for Supabase `.range()`). */
export function rangeFor(page: number, pageSize: number = DEFAULT_PAGE_SIZE): [number, number] {
  const from = page * pageSize;
  return [from, from + pageSize - 1];
}

/** Total page count for a row total (always at least 1). */
export function totalPagesFor(total: number, pageSize: number = DEFAULT_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Strips PostgREST reserved characters so a search term is safe inside `.or(...)`/`.ilike(...)`. */
export function sanitizeSearch(term: string): string {
  return term.replace(/[%,()]/g, "").trim();
}
