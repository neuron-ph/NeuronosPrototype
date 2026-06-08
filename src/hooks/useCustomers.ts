import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { queryKeys } from "../lib/queryKeys";
import { useRealtimeSync } from "./useRealtimeSync";

interface UseCustomersOptions {
  enabled?: boolean;
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
