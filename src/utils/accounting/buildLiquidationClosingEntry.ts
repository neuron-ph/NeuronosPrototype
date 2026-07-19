import { supabase } from "../supabase/client";

// NEU-102/105: build the ONE balanced closing entry that liquidates a cash advance.
//
//   DR  Expense (per booking's catalog→COA account)   = total expensed
//   DR  Cash (disbursement source account)            = butal (unused cash returned)
//       CR  1150 Employee Cash Advances Receivable    = expensed + butal
//
// It lands as `ready_to_post` (kind='liquidation') so it flows through the
// Transaction Journal like every other producer; posting it (postJournalEntry)
// flips the e-voucher to `posted` + stamps closing_journal_entry_id. The advance
// receivable (1150) clears to zero when expensed + butal == the advance.

const AR_1150 = "1150";        // Employee Cash Advances Receivable
const FALLBACK_EXPENSE = "6660"; // Miscellaneous Expense — used when a catalog item has no linked COA account

const round = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

interface Line { account_id: string; account_code?: string; account_name?: string; debit: number; credit: number; description: string; }

export async function buildLiquidationClosingEntry(params: {
  evoucherId: string;
  evoucherNumber: string;
  advanceAmount: number;
  actor: { id: string; name?: string | null };
}): Promise<{ jeId: string } | null> {
  const { evoucherId, evoucherNumber, advanceAmount, actor } = params;

  // 1. Aggregate every liquidation line across all submissions for this advance.
  const { data: subs } = await supabase
    .from("liquidation_submissions")
    .select("line_items, unused_return")
    .eq("evoucher_id", evoucherId);
  const allLines = (subs ?? []).flatMap((s: any) => (Array.isArray(s.line_items) ? s.line_items : []));
  const butal = round((subs ?? []).reduce((sum: number, s: any) => sum + (Number(s.unused_return) || 0), 0));
  if (allLines.length === 0) return null;

  // 2. Source account (butal cash lands back where the advance came from) + voucher context.
  const { data: ev } = await supabase
    .from("evouchers")
    .select("disbursement_source_account_id, disbursement_source_account_name, customer_name, project_number")
    .eq("id", evoucherId)
    .maybeSingle();

  // 3. Resolve each catalog item's linked COA account (NEU-091 autofill).
  const catIds = Array.from(new Set(allLines.map((l: any) => l.catalog_item_id).filter(Boolean)));
  const { data: catItems } = catIds.length
    ? await supabase.from("catalog_items").select("id, account_id").in("id", catIds as string[])
    : { data: [] as any[] };
  const catAccountMap = new Map((catItems ?? []).map((c: any) => [c.id, c.account_id]));

  // 4. Load the accounts we need (line accounts + 1150 + fallback + source).
  const acctIds = new Set<string>();
  for (const l of allLines) {
    const a = catAccountMap.get(l.catalog_item_id);
    if (a) acctIds.add(a);
  }
  if (ev?.disbursement_source_account_id) acctIds.add(ev.disbursement_source_account_id);

  const [byId, byCode] = await Promise.all([
    acctIds.size
      ? supabase.from("accounts").select("id, code, name").in("id", Array.from(acctIds))
      : Promise.resolve({ data: [] as any[] }),
    supabase.from("accounts").select("id, code, name").in("code", [AR_1150, FALLBACK_EXPENSE]),
  ]);
  const acctById = new Map((byId.data ?? []).map((a: any) => [a.id, a]));
  const acctByCode = new Map((byCode.data ?? []).map((a: any) => [a.code, a]));
  const ar1150 = acctByCode.get(AR_1150);
  const fallbackExpense = acctByCode.get(FALLBACK_EXPENSE);
  if (!ar1150) throw new Error("1150 Employee Cash Advances Receivable account not found");

  // 5. Group expenses by resolved COA account.
  const byAccount = new Map<string, { acct: any; amount: number }>();
  let expensedTotal = 0;
  for (const l of allLines) {
    const amt = Number(l.amount) || 0;
    if (amt <= 0) continue;
    expensedTotal += amt;
    const acctId = catAccountMap.get(l.catalog_item_id);
    const acct = (acctId && acctById.get(acctId)) || fallbackExpense;
    if (!acct) continue;
    const cur = byAccount.get(acct.id) ?? { acct, amount: 0 };
    cur.amount += amt;
    byAccount.set(acct.id, cur);
  }
  expensedTotal = round(expensedTotal);

  // 6. Assemble the balanced lines.
  const lines: Line[] = [];
  for (const { acct, amount } of byAccount.values()) {
    lines.push({ account_id: acct.id, account_code: acct.code, account_name: acct.name, debit: round(amount), credit: 0, description: `Liquidation — ${evoucherNumber}` });
  }
  if (butal > 0) {
    const cash = (ev?.disbursement_source_account_id && acctById.get(ev.disbursement_source_account_id)) ||
      { id: ev?.disbursement_source_account_id, code: undefined, name: ev?.disbursement_source_account_name || "Cash" };
    lines.push({ account_id: cash.id, account_code: cash.code, account_name: cash.name, debit: butal, credit: 0, description: `Butal (unused cash returned) — ${evoucherNumber}` });
  }
  const cr1150 = round(expensedTotal + butal);
  lines.push({ account_id: ar1150.id, account_code: ar1150.code, account_name: ar1150.name, debit: 0, credit: cr1150, description: `Clear cash advance — ${evoucherNumber}` });

  const now = new Date().toISOString();
  const jeId = `JE-LIQ-${Date.now()}`;
  const { error } = await supabase.from("journal_entries").insert({
    id: jeId,
    entry_date: now,
    evoucher_id: evoucherId,
    kind: "liquidation",
    description: `Liquidation — ${evoucherNumber}${ev?.customer_name ? ` · ${ev.customer_name}` : ""}`,
    reference: evoucherNumber,
    project_number: ev?.project_number || null,
    customer_name: ev?.customer_name || null,
    lines,
    total_debit: cr1150,
    total_credit: cr1150,
    transaction_currency: "PHP",
    exchange_rate: 1,
    base_currency: "PHP",
    status: "ready_to_post",
    meta: { advance_amount: round(advanceAmount), expensed_total: expensedTotal, butal_returned: butal },
    created_by: actor.id,
    created_at: now,
    updated_at: now,
  });
  if (error) throw error;
  return { jeId };
}
