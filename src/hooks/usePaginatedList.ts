import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { DEFAULT_PAGE_SIZE, rangeFor, totalPagesFor } from "../utils/pagination";

/**
 * A PostgREST query builder (the object returned by `supabase.from(...).select(...)`).
 * Kept as `any` because @supabase/supabase-js does not export the intermediate builder type.
 */
type QueryBuilder = any;

interface UsePaginatedListOptions<T> {
  /** Table name passed to `supabase.from(table)`. */
  table: string;
  /** Columns + embeds, e.g. `"*, customers(name)"`. Defaults to `"*"`. */
  select?: string;
  /**
   * React Query key. MUST include every filter value AND the page so the query
   * refetches when any of them change.
   */
  queryKey: readonly unknown[];
  /**
   * Applies filters and ordering to the base builder and returns it.
   * Always include a deterministic `.order(...)` with a unique tiebreaker
   * (e.g. `.order("created_at", { ascending: false }).order("id")`) — OFFSET
   * paging is unstable on non-unique sorts.
   */
  buildQuery: (base: QueryBuilder) => QueryBuilder;
  /** 0-based page index. Owned by the calling component. */
  page: number;
  pageSize?: number;
  enabled?: boolean;
  /** `"exact"` (default) is correct but full-scans under RLS; use `"estimated"` for very large tables. */
  count?: "exact" | "planned" | "estimated";
}

interface PaginatedResult<T> {
  rows: T[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  isFetching: boolean;
}

/**
 * Server-side pagination over a Supabase table in a single round-trip:
 * runs `.select(cols, { count }).range(from, to)` with caller-supplied filters.
 */
export function usePaginatedList<T = any>({
  table,
  select = "*",
  queryKey,
  buildQuery,
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  enabled = true,
  count = "exact",
}: UsePaginatedListOptions<T>): PaginatedResult<T> {
  const [from, to] = rangeFor(page, pageSize);

  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const base = supabase.from(table).select(select, { count });
      const query = buildQuery(base).range(from, to);
      const { data, count: total, error } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as T[], total: total ?? 0 };
    },
  });

  const total = data?.total ?? 0;
  return {
    rows: data?.rows ?? [],
    total,
    totalPages: totalPagesFor(total, pageSize),
    page,
    pageSize,
    isLoading,
    isFetching,
  };
}
