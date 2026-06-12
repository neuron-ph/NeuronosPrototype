import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { DEFAULT_PAGE_SIZE } from "../utils/pagination";

type QueryBuilder = any;

interface UseLoadMoreListOptions<T> {
  table: string;
  select?: string;
  /** MUST include every filter value — changing it restarts the list from the first page. */
  queryKey: readonly unknown[];
  /** Applies filters + a deterministic `.order(...)` (with a unique tiebreaker). */
  buildQuery: (base: QueryBuilder) => QueryBuilder;
  pageSize?: number;
  enabled?: boolean;
}

interface LoadMoreResult<T> {
  rows: T[];
  total: number;
  loaded: number;
  hasMore: boolean;
  loadMore: () => void;
  isLoading: boolean;
  isFetchingNextPage: boolean;
}

/**
 * Incremental "Load more" pagination for grouped list views (preserves grouping —
 * each click appends the next page of rows to the accumulated set).
 */
export function useLoadMoreList<T = any>({
  table,
  select = "*",
  queryKey,
  buildQuery,
  pageSize = DEFAULT_PAGE_SIZE,
  enabled = true,
}: UseLoadMoreListOptions<T>): LoadMoreResult<T> {
  const query = useInfiniteQuery({
    queryKey,
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = (pageParam as number) * pageSize;
      const to = from + pageSize - 1;
      const base = supabase.from(table).select(select, { count: "exact" });
      const { data, count, error } = await buildQuery(base).range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as T[], total: count ?? 0 };
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.rows.length, 0);
      return loaded < (lastPage.total ?? 0) ? allPages.length : undefined;
    },
  });

  const pages = query.data?.pages ?? [];
  const rows = pages.flatMap((p) => p.rows);
  const total = pages[0]?.total ?? 0;

  return {
    rows,
    total,
    loaded: rows.length,
    hasMore: Boolean(query.hasNextPage),
    loadMore: () => query.fetchNextPage(),
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
