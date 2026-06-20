import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { queryKeys } from "../lib/queryKeys";
import { useRealtimeSync } from "./useRealtimeSync";
import { usePaginatedList } from "./usePaginatedList";
import { sanitizeSearch } from "../utils/pagination";

interface UseCustomersOptions {
  enabled?: boolean;
}

interface UseCustomersPaginatedOptions {
  page: number;
  search?: string;
  industry?: string;
  status?: string;
  /** owner_id filter ("All" = no filter). */
  owner?: string;
  enabled?: boolean;
}

/**
 * Server-paginated customers. Visibility stays RLS/crew-based (no owner scope) —
 * the `owner` arg here is the optional UI owner filter, not a security boundary.
 * Search covers name (the customers table has no company_name column).
 */
export function useCustomersPaginated({
  page,
  search = "",
  industry = "All",
  status = "All",
  owner = "All",
  enabled = true,
}: UseCustomersPaginatedOptions) {
  const result = usePaginatedList<any>({
    table: "customers",
    queryKey: [...queryKeys.customers.list(), "paginated", { search, industry, status, owner }, page],
    page,
    enabled,
    buildQuery: (q) => {
      let b = q.order("created_at", { ascending: false }).order("id");
      if (industry && industry !== "All") b = b.eq("industry", industry);
      if (status && status !== "All") b = b.eq("status", status);
      if (owner && owner !== "All") b = b.eq("owner_id", owner);
      const s = sanitizeSearch(search);
      if (s) b = b.ilike("name", `%${s}%`);
      return b;
    },
  });

  useRealtimeSync({ table: "customers", queryKey: queryKeys.customers.all(), enabled });

  return result;
}

// Customer visibility is CREW-based and enforced by RLS (migration 189):
// owner OR participant of linked bookings/projects, within the user's dial.
// No client-side owner_id scope filter — it would over-hide crew-visible rows
// (e.g. an ops user's customers-via-bookings, whose owner is a BD user).
// RLS is the boundary; the rows that arrive ARE the user's world.
export function useCustomers({ enabled = true }: UseCustomersOptions = {}) {
  const queryClient = useQueryClient();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: queryKeys.customers.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled,
    staleTime: 30_000,
  });

  useRealtimeSync({ table: "customers", queryKey: queryKeys.customers.all(), enabled });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.customers.all() });
  return { customers, isLoading, invalidate };
}
