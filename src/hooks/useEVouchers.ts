import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase/client";
import type { EVoucher } from "../types/evoucher";
import { queryKeys } from "../lib/queryKeys";

type EVoucherView = "pending" | "my-evouchers" | "all"
  | "acct-pending-disburse" | "acct-waiting-on-rep" | "acct-pending-verification" | "acct-archive"
  | "pending-manager" | "pending-ceo"
  // Department-scoped views (used by the EV Workspace for manager/TL approval queues)
  | "dept-pending-manager"  // pending_manager filtered to a specific department
  | "dept-all";             // all statuses filtered to a specific department

export function useEVouchers(view: EVoucherView, userId?: string, department?: string) {
  const queryClient = useQueryClient();

  const queryFn = useCallback(async (): Promise<EVoucher[]> => {
    let query = supabase.from('evouchers').select('*, evoucher_line_items(*)').order('created_at', { ascending: false });

    if (view === "pending") {
      query = query.in('status', ['pending_manager', 'pending_ceo', 'pending_accounting']);
    } else if (view === "my-evouchers" && userId) {
      query = query.eq('created_by', userId);
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
    } else if (view === "dept-pending-manager") {
      query = query.eq('status', 'pending_manager');
      if (department) query = query.eq('details->>requestor_department', department);
    } else if (view === "dept-all") {
      if (department) query = query.eq('details->>requestor_department', department);
      // no status filter — returns all statuses for the department
    }
    // view === "all" → no filters, returns everything (used by Executive scope)

    const { data, error } = await query;

    if (error) throw new Error(`Failed to fetch ${view} e-vouchers: ${error.message}`);

    // Merge JSONB `details` column into each row so top-level fields like
    // voucher_number, request_date, requestor_name, vendor_name etc. are accessible.
    const evouchers: EVoucher[] = (data || []).map((row: any) => {
      const merged = { ...(row.details || {}), ...row };
      // Normalize: DB column is `evoucher_number` but the EVoucher type expects `voucher_number`
      if (!merged.voucher_number && merged.evoucher_number) {
        merged.voucher_number = merged.evoucher_number;
      }
      // Normalize: fall back to created_at if request_date was never stored
      if (!merged.request_date && merged.created_at) {
        merged.request_date = merged.created_at;
      }
      return merged;
    });

    // AR-side types ("billing", "collection") have been retired from EVoucherTransactionType.
    // All records here are AP-side (expense, cash_advance, reimbursement, budget_request).
    return evouchers;
  }, [view, userId, department]);

  // Include department in the cache key so dept-scoped queries don't collide
  const queryKey = department
    ? ["evouchers", view, userId ?? "", department]
    : queryKeys.evouchers.list(view, userId);

  const { data: evouchers = [], isLoading } = useQuery({
    queryKey,
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
