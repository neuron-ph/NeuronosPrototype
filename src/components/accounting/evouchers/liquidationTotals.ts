import { supabase } from "../../../utils/supabase/client";
import type { LiquidationSubmission } from "../../../types/evoucher";

export interface LiquidationTotals {
  submissions: LiquidationSubmission[];
  previousTotalSpent: number;
  totalReturned: number;
  netSpent: number;
  remainingBalance: number;
}

export async function fetchLiquidationTotals(
  evoucherId: string,
  advanceAmount: number
): Promise<LiquidationTotals> {
  const { data } = await supabase
    .from("liquidation_submissions")
    .select("*")
    .eq("evoucher_id", evoucherId)
    .order("submitted_at", { ascending: true });

  const submissions = (data ?? []) as LiquidationSubmission[];
  const previousTotalSpent = submissions.reduce((s, r) => s + (r.total_spend ?? 0), 0);
  const totalReturned = submissions.reduce((s, r) => s + (r.unused_return ?? 0), 0);
  const netSpent = previousTotalSpent - totalReturned;
  const remainingBalance = advanceAmount - netSpent;

  return { submissions, previousTotalSpent, totalReturned, netSpent, remainingBalance };
}
