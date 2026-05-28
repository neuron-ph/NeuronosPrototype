import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { queryKeys } from "../lib/queryKeys";
import type { DataScope } from "./useDataScope";
import { useRealtimeSync } from "./useRealtimeSync";

interface UseCustomersOptions {
  scope?: DataScope;
  enabled?: boolean;
}

export function useCustomers({ scope, enabled = true }: UseCustomersOptions = {}) {
  const queryClient = useQueryClient();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: [...queryKeys.customers.list(), { scope }],
    queryFn: async () => {
      let query = supabase.from("customers").select("*").order("created_at", { ascending: false });
      if (scope?.type === "userIds") query = query.in("owner_id", scope.ids);
      else if (scope?.type === "own") query = query.eq("owner_id", scope.userId);
      const { data, error } = await query;
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
