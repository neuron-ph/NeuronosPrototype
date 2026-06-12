import { useEffect, useMemo, useState } from "react";
import { DEFAULT_PAGE_SIZE, totalPagesFor } from "../utils/pagination";

interface ClientPaginationResult<T> {
  page: number;
  setPage: (next: number) => void;
  pageItems: T[];
  total: number;
  totalPages: number;
  pageSize: number;
}

/**
 * Client-side pagination over an already-filtered array. Use for prop-fed lists
 * whose filtering is too context-dependent to push into SQL safely — the parent
 * still loads the full set; this only slices it for display.
 *
 * Pass a `resetKey` built from the active filter values so the page snaps back to
 * the first page whenever the filters change.
 */
export function useClientPagination<T>(
  items: T[],
  resetKey: string,
  pageSize: number = DEFAULT_PAGE_SIZE,
): ClientPaginationResult<T> {
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [resetKey]);

  const total = items.length;
  const totalPages = totalPagesFor(total, pageSize);
  const safePage = Math.min(page, totalPages - 1);

  const pageItems = useMemo(
    () => items.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [items, safePage, pageSize],
  );

  return { page: safePage, setPage, pageItems, total, totalPages, pageSize };
}
