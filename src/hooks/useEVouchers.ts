import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import type { EVoucher } from "../types/evoucher";
import { queryKeys } from "../lib/queryKeys";

type EVoucherView = "pending" | "my-evouchers" | "all"
  | "acct-pending-disburse" | "acct-waiting-on-rep" | "acct-pending-verification" | "acct-archive"
  | "pending-manager" | "pending-ceo";

export function useEVouchers(view: EVoucherView, userId?: string) {
  const queryClient = useQueryClient();

  const queryFn = useCallback(async (): Promise<EVoucher[]> => {
    let query = supabase.from('evouchers').select('*, evoucher_line_items(*)').order('created_at', { ascending: false });

    if (view === "pending") {
      query = query.in('status', ['pending_manager', 'pending_ceo', 'pending_accounting']);
    } else if (view === "my-evouchers" && userId) {
      query = query.eq('requestor_id', userId);
    } else if (view === "my-evouchers" && !userId) {
      return [];
    } else if (view === "acct-pending-disburse") {
      query = query.eq('status', 'pending_accounting');
    } else if (view === "acct-waiting-on-rep") {
      query = query.in('status', ['disbursed', 'pending_liquidation']);
    } else if (view === "acct-pending-verification") {
      query = query.eq('status', 'pending_verification');
    } else if (view === "acct-archive") {
      query = query.eq('status', 'posted');
    } else if (view === "pending-manager") {
      query = query.eq('status', 'pending_manager');
    } else if (view === "pending-ceo") {
      query = query.eq('status', 'pending_ceo');
    }

    const { data, error } = await query;

    if (error) throw new Error(`Failed to fetch ${view} e-vouchers: ${error.message}`);

    const evouchers: EVoucher[] = data || [];

    // AR-side types ("billing", "collection") have been retired from EVoucherTransactionType.
    // All records here are AP-side (expense, cash_advance, reimbursement, budget_request).
    return evouchers;
  }, [view, userId]);

  const { data: evouchers = [], isLoading } = useQuery({
    queryKey: queryKeys.evouchers.list(view, userId),
    queryFn,
    staleTime: 30_000,
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.evouchers.all() });
  }, [queryClient]);

  return {
    evouchers,
    isLoading,
    refresh,
  };
}
