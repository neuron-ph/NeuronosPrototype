import { useQuery } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";

/**
 * Active bank accounts from the `bank_accounts` master table (NEU-071). The
 * invoice print selects one of these instead of free-typing bank details.
 * Optionally currency-tagged so a foreign-currency invoice can suggest the
 * matching account. Managed in Admin → Profiling → Bank Accounts.
 */
export interface BankAccountOption {
  id: string;
  label: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  currency: string | null;
  sort_order: number;
}

export function useBankAccounts() {
  const query = useQuery({
    queryKey: ["bank_accounts", "active"],
    queryFn: async (): Promise<BankAccountOption[]> => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id,label,bank_name,account_name,account_number,currency,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BankAccountOption[];
    },
    staleTime: 10 * 60 * 1000,
  });

  return { bankAccounts: query.data ?? [], isLoading: query.isLoading };
}
