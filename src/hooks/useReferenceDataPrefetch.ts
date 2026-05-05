/**
 * useReferenceDataPrefetch
 *
 * Warms only the small, high-hit user lists that feed common dropdowns.
 * The previous customer-wide prefetch was loading the full customers table
 * on every authenticated app boot, which was unnecessary pressure on prod.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { queryKeys } from "../lib/queryKeys";

export function useReferenceDataPrefetch() {
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
}
