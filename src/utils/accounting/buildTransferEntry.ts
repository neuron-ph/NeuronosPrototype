import { supabase } from "../supabase/client";

// NEU-095: build the fund-transfer Transaction Journal entry when the approver
// (Mark Javier) processes it:
//
//   DR  To account     = amount
//       CR  From account = amount
//
// Lands as `ready_to_post` (kind='transfer', transfer_id = the voucher id) so it
// flows through the TJ like every other producer; posting it hits the ledger.

const round = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export async function buildTransferEntry(params: {
  evoucherId: string;
  evoucherNumber: string;
  actor: { id: string; name?: string | null };
}): Promise<{ jeId: string } | null> {
  const { evoucherId, evoucherNumber, actor } = params;

  const { data: ev } = await supabase
    .from("evouchers")
    .select("amount, currency, exchange_rate, details")
    .eq("id", evoucherId)
    .maybeSingle();
  if (!ev) return null;

  const details = (ev.details as any) || {};
  const fromId = details.from_account_id;
  const toId = details.to_account_id;
  const amount = round(ev.amount);
  if (!fromId || !toId) throw new Error("Transfer is missing its From/To account");
  if (fromId === toId) throw new Error("Transfer From and To accounts must differ");
  if (amount <= 0) throw new Error("Transfer amount must be positive");

  const { data: accts } = await supabase.from("accounts").select("id, code, name").in("id", [fromId, toId]);
  const byId = new Map((accts ?? []).map((a: any) => [a.id, a]));
  const from = byId.get(fromId);
  const to = byId.get(toId);
  if (!from || !to) throw new Error("Transfer accounts not found");

  const now = new Date().toISOString();
  const jeId = `JE-XFER-${Date.now()}`;
  const lines = [
    { account_id: to.id, account_code: to.code, account_name: to.name, debit: amount, credit: 0, description: `Transfer in — ${evoucherNumber}` },
    { account_id: from.id, account_code: from.code, account_name: from.name, debit: 0, credit: amount, description: `Transfer out — ${evoucherNumber}` },
  ];

  const { error } = await supabase.from("journal_entries").insert({
    id: jeId,
    entry_date: now,
    evoucher_id: evoucherId,
    transfer_id: evoucherId,
    kind: "transfer",
    description: `Transfer of Funds — ${from.code} → ${to.code} (${evoucherNumber})`,
    reference: evoucherNumber,
    lines,
    total_debit: amount,
    total_credit: amount,
    transaction_currency: ev.currency || "PHP",
    exchange_rate: ev.exchange_rate || 1,
    base_currency: "PHP",
    status: "ready_to_post",
    meta: { from_account: from.code, to_account: to.code, amount },
    created_by: actor.id,
    created_at: now,
    updated_at: now,
  });
  if (error) throw error;
  return { jeId };
}
