import { supabase } from "../supabase/client";

// NEU-099 (unified journal, migration 244): the Transaction Journal and General
// Journal are ONE table (journal_entries) — the GJ is just the posted-only view.
// "Posting" a pre-posting entry is therefore a status flip (ready_to_post →
// posted) plus the source-document side-effects. Balances/statements read
// status='posted', so an entry only affects the books once posted here.

export interface PostActor {
  id?: string | null;
  name?: string | null;
}

/**
 * Post a `ready_to_post` journal entry into the final (posted) ledger.
 * Guarded + concurrency-safe (the status-scoped UPDATE can only fire once).
 */
export async function postJournalEntry(jeId: string, _actor?: PostActor): Promise<void> {
  const { data: je, error: loadErr } = await supabase
    .from("journal_entries")
    .select("id, status, lines, total_debit, total_credit, invoice_id, collection_id, evoucher_id, kind")
    .eq("id", jeId)
    .maybeSingle();
  if (loadErr) throw new Error(`Journal entry load failed: ${loadErr.message}`);
  if (!je) throw new Error(`Journal entry ${jeId} not found`);

  // ── Lifecycle + balance guards ──
  if (je.status === "posted") throw new Error(`Journal entry ${jeId} is already posted`);
  if (je.status !== "ready_to_post") {
    throw new Error(`Journal entry ${jeId} is not ready to post (status: ${je.status})`);
  }
  const lines = Array.isArray(je.lines) ? je.lines : [];
  if (lines.length === 0) throw new Error(`Journal entry ${jeId} has no lines`);
  const totalDebit = Number(je.total_debit) || 0;
  const totalCredit = Number(je.total_credit) || 0;
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Journal entry ${jeId} is unbalanced (Dr ${totalDebit} ≠ Cr ${totalCredit})`);
  }

  const now = new Date().toISOString();
  const { data: updated, error: postErr } = await supabase
    .from("journal_entries")
    .update({ status: "posted", updated_at: now })
    .eq("id", jeId)
    .eq("status", "ready_to_post") // concurrency guard: only the first flip wins
    .select("id");
  if (postErr) throw new Error(`Posting failed: ${postErr.message}`);
  if (!updated?.length) throw new Error(`Journal entry ${jeId} was already posted concurrently`);

  await applySourceEffects(je, now);
}

// Source-document side-effects the old per-document GL sheets used to run.
async function applySourceEffects(je: any, now: string): Promise<void> {
  if (je.invoice_id) {
    await supabase
      .from("invoices")
      .update({ status: "posted", posted: true, posted_at: now, journal_entry_id: je.id, updated_at: now })
      .eq("id", je.invoice_id);
  } else if (je.collection_id) {
    await supabase
      .from("collections")
      .update({ journal_entry_id: je.id, updated_at: now })
      .eq("id", je.collection_id);
  } else if (je.evoucher_id && je.kind === "liquidation") {
    // NEU-102: posting the liquidation closing entry closes the advance voucher.
    await supabase
      .from("evouchers")
      .update({ status: "posted", closing_journal_entry_id: je.id, updated_at: now })
      .eq("id", je.evoucher_id);
  }
}
