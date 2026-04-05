/**
 * useReferenceDataPrefetch
 *
 * Eagerly warms the TanStack Query cache with reference data that feeds
 * dropdowns across all creation panels (users, customers). Called once in
 * AppContent immediately after authentication so that every downstream
 * useUsers / useCustomers call gets a cache hit instead of a cold fetch.
 *
 * The query keys here must exactly match those used by useUsers and
 * useCustomers so the cache is shared — not duplicated.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { queryKeys } from "../lib/queryKeys";

export function useReferenceDataPrefetch() {
  // All active users — matches useUsers() with no filters
  useQuery({
    queryKey: queryKeys.users.filtered({}),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, department, role, is_active, service_type, created_at")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // BD users — matches useUsers({ department: 'Business Development' })
  useQuery({
    queryKey: queryKeys.users.filtered({ department: "Business Development" }),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, department, role, is_active, service_type, created_at")
        .eq("is_active", true)
        .eq("department", "Business Development")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // All customers (no scope) — matches useCustomers() with no arguments
  useQuery({
    queryKey: [...queryKeys.customers.list(), { scope: undefined }],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
}
