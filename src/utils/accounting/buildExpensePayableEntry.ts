import { supabase } from "../supabase/client";

// AP two-step (EVOUCHER PATCH follow-up): recognize the payable BEFORE disbursement.
//
// When an expense-class voucher clears final approval and lands in
// `pending_accounting`, we book the expense and the liability:
//   Dr Expense (per particular, from catalog→COA)  /  Cr Accounts Payable 2000
// This lands `ready_to_post` in the Transaction Journal — an EDITABLE AUTOFILL
// seed (the accountant can change any account, incl. the AP sub-account, at
// finalize). The later disbursement posts Dr AP / Cr Cash, clearing it, so
// "approved-but-unpaid" shows as a real AP balance instead of only a status.
//
// Advance types (cash_advance / budget_request) are EXEMPT — per Marcus's dump,
// cash advances get their journal only at disbursement (Dr 1150 / Cr Cash).
// Fund transfers post their own entry when processed.

const AP_TRADE = { id: "coa-2000", code: "2000", name: "Accounts Payable - Trade" };
const FALLBACK_EXPENSE = { id: "coa-5080", code: "5080", name: "Other Direct Costs" };
const EXEMPT_TYPES = new Set(["cash_advance", "budget_request", "fund_transfer"]);

interface PayableActor {
  id: string;
  name?: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Ensure the pre-disbursement payable entry exists for an expense-class voucher.
 * Idempotent (one `kind='expense'` entry per voucher) and safe to call on every
 * arrival at `pending_accounting`. Returns the entry id, or null if skipped
 * (exempt type, already recognized, or nothing to book).
 */
export async function ensureExpensePayableEntry(
  evoucherId: string,
  evoucherNumber: string,
  actor: PayableActor,
): Promise<string | null> {
  // ── Voucher header ──
  const { data: ev, error: evErr } = await supabase
    .from("evouchers")
    .select("id, transaction_type, amount, currency, exchange_rate")
    .eq("id", evoucherId)
    .maybeSingle();
  if (evErr || !ev) return null;
  if (EXEMPT_TYPES.has(ev.transaction_type as string)) return null;

  // ── Idempotency: one payable (kind='expense') per voucher ──
  const { data: existing } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("evoucher_id", evoucherId)
    .eq("kind", "expense")
    .limit(1);
  if (existing && existing.length) return existing[0].id;

  // ── Resolve each line's expense account via catalog→COA ──
  const { data: rawLines } = await supabase
    .from("evoucher_line_items")
    .select("particular, amount, catalog_item_id")
    .eq("evoucher_id", evoucherId);

  const catalogIds = [...new Set((rawLines ?? []).map((l: any) => l.catalog_item_id).filter(Boolean))];
  const acctByCatalog = new Map<string, { id: string; code: string; name: string }>();
  if (catalogIds.length) {
    const { data: catRows } = await supabase
      .from("catalog_items")
      .select("id, accounts:account_id(id, code, name)")
      .in("id", catalogIds as string[]);
    for (const c of (catRows ?? []) as any[]) {
      const a = c.accounts;
      if (a) acctByCatalog.set(c.id, { id: a.id, code: a.code, name: a.name });
    }
  }

  // Foreign vouchers carry a locked rate; PHP posts at 1:1.
  const rate = ev.currency && ev.currency !== "PHP" ? (Number(ev.exchange_rate) || 1) : 1;

  // Group debits by resolved expense account (falls back to 5080 for any line
  // that can't resolve — still editable at finalize, never blocks the entry).
  const byAccount = new Map<string, { id: string; code: string; name: string; amount: number }>();
  for (const li of (rawLines ?? []) as any[]) {
    const acct = (li.catalog_item_id && acctByCatalog.get(li.catalog_item_id)) || FALLBACK_EXPENSE;
    const base = round2((Number(li.amount) || 0) * rate);
    if (base <= 0) continue;
    const cur = byAccount.get(acct.id) ?? { ...acct, amount: 0 };
    cur.amount = round2(cur.amount + base);
    byAccount.set(acct.id, cur);
  }

  let debitLines = [...byAccount.values()];
  if (debitLines.length === 0) {
    // No relational lines resolved — book the whole voucher amount to the fallback.
    const base = round2((Number(ev.amount) || 0) * rate);
    if (base <= 0) return null;
    debitLines = [{ ...FALLBACK_EXPENSE, amount: base }];
  }

  const total = round2(debitLines.reduce((s, l) => s + l.amount, 0));
  if (total <= 0) return null;

  const lines = [
    ...debitLines.map((l) => ({
      account_id: l.id,
      account_code: l.code,
      account_name: l.name,
      debit: l.amount,
      credit: 0,
      description: `Expense recognized — ${evoucherNumber}`,
    })),
    {
      account_id: AP_TRADE.id,
      account_code: AP_TRADE.code,
      account_name: AP_TRADE.name,
      debit: 0,
      credit: total,
      description: `Payable — ${evoucherNumber}`,
    },
  ];

  const now = new Date().toISOString();
  const entryId = `JE-PAY-${Date.now()}`;
  const { error: insErr } = await supabase.from("journal_entries").insert({
    id: entryId,
    entry_date: now,
    evoucher_id: evoucherId,
    kind: "expense",
    description: `Payable recognition — ${evoucherNumber}`,
    lines,
    total_debit: total,
    total_credit: total,
    status: "ready_to_post",
    created_by: actor.id,
    created_at: now,
    updated_at: now,
  });
  if (insErr) {
    console.error("[payable] insert failed:", insErr);
    return null;
  }
  return entryId;
}
