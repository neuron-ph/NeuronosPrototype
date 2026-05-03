/**
 * useFxRevaluation - load open foreign-currency positions and post a
 * period-end revaluation journal entry with an auto-reversing entry.
 */
import { useCallback, useState } from "react";
import { supabase } from "../utils/supabase/client";
import {
  buildRevaluationJournalEntry,
  computeRevaluation,
  type OpenForeignPosition,
  type RevaluationSummary,
} from "../utils/fxRevaluation";
import {
  FX_UNREALIZED_GAIN_CODE,
  FX_UNREALIZED_LOSS_CODE,
  roundMoney,
} from "../utils/accountingCurrency";
import { resolveExchangeRate } from "../utils/exchangeRates";
import { calculateInvoiceBalance } from "../utils/accounting-math";

export function useFxRevaluation() {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<RevaluationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = useCallback(async (asOfDate: string) => {
    setLoading(true);
    setError(null);

    try {
      const { data: invoices } = await supabase
        .from("invoices")
        .select("*")
        .eq("original_currency", "USD")
        .neq("status", "paid")
        .neq("status", "void");

      const { data: collections } = await supabase
        .from("collections")
        .select("*");

      const { data: evouchers } = await supabase
        .from("evouchers")
        .select("*")
        .eq("original_currency", "USD")
        .in("transaction_type", ["cash_advance", "budget_request"])
        .in("status", ["disbursed", "pending_liquidation", "pending_verification"]);

      const { data: arAcct } = await supabase
        .from("accounts")
        .select("id, code, name")
        .eq("code", "1200")
        .maybeSingle();

      const { data: advanceAcct } = await supabase
        .from("accounts")
        .select("id, code, name")
        .eq("code", "1150")
        .maybeSingle();

      const { data: gainAcct } = await supabase
        .from("accounts")
        .select("id, code, name")
        .eq("code", FX_UNREALIZED_GAIN_CODE)
        .maybeSingle();

      const { data: lossAcct } = await supabase
        .from("accounts")
        .select("id, code, name")
        .eq("code", FX_UNREALIZED_LOSS_CODE)
        .maybeSingle();

      if (!gainAcct || !lossAcct) {
        throw new Error("Unrealized FX accounts (4530/7030) not seeded - run migration 086 first.");
      }

      if (!arAcct || !advanceAcct) {
        throw new Error("AR (1200) or Employee Cash Advances Receivable (1150) account missing from COA.");
      }

      const positions: OpenForeignPosition[] = [];

      for (const invoice of invoices ?? []) {
        const financials = calculateInvoiceBalance(invoice as any, (collections ?? []) as any);
        const remaining = (invoice as any).total_amount && financials.balance > 0 ? financials.balance : 0;
        if (remaining < 0.01) continue;

        const rate = Number((invoice as any).exchange_rate) || 1;
        positions.push({
          recordId: (invoice as any).id,
          recordType: "invoice",
          revaluationClass: "receivable",
          accountId: arAcct.id,
          accountCode: arAcct.code,
          accountName: arAcct.name,
          currency: "USD",
          originalAmount: remaining,
          carryingRate: rate,
          carryingBase: roundMoney(Number((invoice as any).base_amount) || remaining * rate),
        });
      }

      for (const evoucher of evouchers ?? []) {
        if (!(evoucher as any).disbursement_journal_entry_id) continue;

        const remaining = Number((evoucher as any).amount) || 0;
        if (remaining < 0.01) continue;

        const rate = Number((evoucher as any).exchange_rate) || 1;
        positions.push({
          recordId: (evoucher as any).id,
          recordType: "evoucher",
          revaluationClass: "receivable",
          accountId: advanceAcct.id,
          accountCode: advanceAcct.code,
          accountName: advanceAcct.name,
          currency: "USD",
          originalAmount: remaining,
          carryingRate: rate,
          carryingBase: roundMoney(Number((evoucher as any).base_amount) || remaining * rate),
        });
      }

      const rateRow = await resolveExchangeRate({
        fromCurrency: "USD",
        toCurrency: "PHP",
        rateDate: asOfDate,
      });

      const result = computeRevaluation({
        asOfDate,
        positions,
        spotRate: () => rateRow.rate,
      });

      setSummary(result);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Revaluation preview failed";
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const post = useCallback(async (createdBy: string) => {
    if (!summary) throw new Error("No revaluation preview to post");

    setLoading(true);
    setError(null);

    try {
      const { data: gainAcct } = await supabase
        .from("accounts")
        .select("id")
        .eq("code", FX_UNREALIZED_GAIN_CODE)
        .maybeSingle();

      const { data: lossAcct } = await supabase
        .from("accounts")
        .select("id")
        .eq("code", FX_UNREALIZED_LOSS_CODE)
        .maybeSingle();

      if (!gainAcct || !lossAcct) {
        throw new Error("Unrealized FX accounts missing");
      }

      const { data: existing } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("reference", summary.idempotencyKey)
        .maybeSingle();

      if (existing) {
        throw new Error(`A revaluation entry for ${summary.asOfDate} already exists.`);
      }

      const { main, reverse } = buildRevaluationJournalEntry({
        summary,
        fxGainAccountId: gainAcct.id,
        fxLossAccountId: lossAcct.id,
        createdBy,
      });

      const { error: mainError } = await supabase.from("journal_entries").insert(main);
      if (mainError) throw mainError;

      const { error: reverseError } = await supabase.from("journal_entries").insert(reverse);
      if (reverseError) throw reverseError;

      return { mainId: main.id, reverseId: reverse.id };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Revaluation post failed";
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [summary]);

  return { loading, summary, error, preview, post };
}
