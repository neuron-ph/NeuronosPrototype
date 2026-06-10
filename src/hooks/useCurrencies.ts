import { useQuery } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import { SUPPORTED_ACCOUNTING_CURRENCIES, currencyGlyph } from "../utils/accountingCurrency";

/**
 * Active currencies from the `currencies` master table (NEU-027). This is the
 * single, data-driven source for every currency dropdown — adding a currency in
 * the table makes it appear everywhere with no code change.
 */
export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string | null;
  decimals: number;
  sort_order: number;
}

// Synchronous fallback so dropdowns never render empty (before the query
// resolves, or if the table is unreachable). Mirrors the seeded defaults.
const FALLBACK: CurrencyOption[] = SUPPORTED_ACCOUNTING_CURRENCIES.map((code, i) => ({
  code,
  name: code,
  symbol: currencyGlyph(code),
  decimals: 2,
  sort_order: (i + 1) * 10,
}));

export function useCurrencies() {
  const query = useQuery({
    queryKey: ["currencies", "active"],
    queryFn: async (): Promise<CurrencyOption[]> => {
      const { data, error } = await supabase
        .from("currencies")
        .select("code,name,symbol,decimals,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CurrencyOption[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const currencies = query.data && query.data.length > 0 ? query.data : FALLBACK;
  return { currencies, isLoading: query.isLoading };
}
