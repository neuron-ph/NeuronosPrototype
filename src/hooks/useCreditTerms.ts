import { useQuery } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";

/**
 * Active credit terms from the `credit_terms` master table (NEU-071). Single
 * source for the invoice Credit Terms dropdown — `net_days` drives the due-date
 * derivation directly (no string parsing). Adding a term in Profiling makes it
 * appear with no code change.
 */
export interface CreditTermOption {
  id: string;
  label: string;
  net_days: number;
  sort_order: number;
}

// Synchronous fallback so the dropdown never renders empty before the query
// resolves or if the table is unreachable. Mirrors the seeded defaults.
const FALLBACK: CreditTermOption[] = [
  { id: "f-receipt", label: "Due on receipt", net_days: 0, sort_order: 10 },
  { id: "f-cod", label: "COD", net_days: 0, sort_order: 20 },
  { id: "f-net7", label: "NET 7", net_days: 7, sort_order: 30 },
  { id: "f-net15", label: "NET 15", net_days: 15, sort_order: 40 },
  { id: "f-net30", label: "NET 30", net_days: 30, sort_order: 50 },
  { id: "f-net45", label: "NET 45", net_days: 45, sort_order: 60 },
  { id: "f-net60", label: "NET 60", net_days: 60, sort_order: 70 },
];

export function useCreditTerms() {
  const query = useQuery({
    queryKey: ["credit_terms", "active"],
    queryFn: async (): Promise<CreditTermOption[]> => {
      const { data, error } = await supabase
        .from("credit_terms")
        .select("id,label,net_days,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CreditTermOption[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const creditTerms = query.data && query.data.length > 0 ? query.data : FALLBACK;
  return { creditTerms, isLoading: query.isLoading };
}
