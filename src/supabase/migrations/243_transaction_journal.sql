-- Migration 243: Transaction Journal — the pre-posting entity (NEU-099, Doctrine on TJ).
--
-- The Transaction Journal is a NEW, separate pre-posting layer. Every accounting
-- movement (expense, cash advance, invoice/AR, collection, transfer) becomes a
-- transaction_journal_entries row FIRST; when its lifecycle completes it POSTS
-- INTO journal_entries (status='posted'). The General Journal stays posted-only.
--
-- One table + a `kind` discriminator + JSONB `lines` that mirror journal_entries
-- 1:1, so the post-through is a straight copy. `stage` is the TJ's OWN lifecycle,
-- distinct from the GJ's `status`.
--
-- RLS (v1): permissive to authenticated — the UI gates via the acct_transaction_journal
-- permission, and current_user_can_view_record has no visibility config for a brand-new
-- table yet (would lock everyone out). TODO before prod: harden to mirror journal_entries
-- (record-visibility + acct_journal/acct_financials), with an ack carve-out for
-- disburse_to_user_id = get_my_profile_id().

CREATE TABLE IF NOT EXISTS public.transaction_journal_entries (
  id            TEXT PRIMARY KEY,                    -- app-gen: TJ-<kind>-<ts>
  entry_number  TEXT,                                -- TJ-YYYY-NNNN (trigger)
  kind          TEXT NOT NULL CHECK (kind IN ('expense','advance','invoice','collection','transfer')),
  stage         TEXT NOT NULL DEFAULT 'pending'
                  CHECK (stage IN ('pending','awaiting_ack','ready_to_post','posted','void')),
  entry_date    TIMESTAMPTZ DEFAULT now(),

  -- Double-entry lines — identical shape to journal_entries.lines
  -- ({account_id, account_code, account_name, debit, credit, description} + FX).
  lines         JSONB DEFAULT '[]'::jsonb,
  total_debit   NUMERIC(15,2) DEFAULT 0,
  total_credit  NUMERIC(15,2) DEFAULT 0,

  -- FX header — same column names as journal_entries (migration 082) for verbatim copy.
  transaction_currency TEXT,
  exchange_rate        NUMERIC(18,8),
  base_currency        TEXT NOT NULL DEFAULT 'PHP' CHECK (base_currency IN ('PHP','USD')),
  source_amount        NUMERIC(15,2),
  base_amount          NUMERIC(15,2),
  exchange_rate_date   DATE,

  -- Source document (only one is set per row; mirrors journal_entries FKs).
  evoucher_id   TEXT REFERENCES public.evouchers(id)    ON DELETE SET NULL,
  invoice_id    TEXT REFERENCES public.invoices(id)     ON DELETE SET NULL,
  collection_id TEXT REFERENCES public.collections(id)  ON DELETE SET NULL,
  booking_id    TEXT REFERENCES public.bookings(id)     ON DELETE SET NULL,
  transfer_id   TEXT,                                   -- fund transfers (NEU-095) — no table yet
  project_number TEXT,
  customer_name  TEXT,
  description   TEXT,
  reference     TEXT,

  -- Disbursement acknowledgment (expense/advance legs, NEU-100).
  disburse_to_user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  acknowledged_at     TIMESTAMPTZ,
  acknowledged_by     TEXT REFERENCES public.users(id) ON DELETE SET NULL,

  -- Transfer processing (NEU-095).
  processed_at  TIMESTAMPTZ,
  processed_by  TEXT REFERENCES public.users(id) ON DELETE SET NULL,

  -- Back-link to the immutable GJ row this posted into (hard anti-double-post).
  posted_journal_entry_id TEXT REFERENCES public.journal_entries(id) ON DELETE SET NULL,

  meta          JSONB DEFAULT '{}'::jsonb,             -- kind-specific (butal amounts, from/to accounts, pending_process…)
  created_by    TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tj_stage_date ON public.transaction_journal_entries(stage, entry_date);
CREATE INDEX IF NOT EXISTS idx_tj_kind       ON public.transaction_journal_entries(kind);
CREATE INDEX IF NOT EXISTS idx_tj_evoucher   ON public.transaction_journal_entries(evoucher_id);
CREATE INDEX IF NOT EXISTS idx_tj_invoice    ON public.transaction_journal_entries(invoice_id);
CREATE INDEX IF NOT EXISTS idx_tj_collection ON public.transaction_journal_entries(collection_id);
CREATE INDEX IF NOT EXISTS idx_tj_booking    ON public.transaction_journal_entries(booking_id);
-- One TJ entry can post into at most one GJ row — hard invariant against double-posting.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tj_posted_je
  ON public.transaction_journal_entries(posted_journal_entry_id)
  WHERE posted_journal_entry_id IS NOT NULL;

-- entry_number autofill: TJ-YYYY-NNNN (clone of set_journal_entry_number, migration 091).
CREATE OR REPLACE FUNCTION public.set_tj_entry_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_year int;
  v_seq  int;
  v_is_pseudo boolean;
BEGIN
  v_is_pseudo := NEW.entry_number ~ '^TJ-[A-Z]+-[0-9]{10,}$' OR NEW.entry_number ~ '^TJ-[0-9]{10,}$';
  IF NEW.entry_number IS NULL OR NEW.entry_number = '' OR v_is_pseudo THEN
    v_year := EXTRACT(YEAR FROM COALESCE(NEW.entry_date, NEW.created_at, now()))::int;
    v_seq  := public.next_counter('tj_entry_counter_' || v_year);
    NEW.entry_number := 'TJ-' || v_year || '-' || LPAD(v_seq::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_tj_entry_number ON public.transaction_journal_entries;
CREATE TRIGGER trg_set_tj_entry_number
BEFORE INSERT ON public.transaction_journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.set_tj_entry_number();

-- RLS (v1 permissive — see header note).
ALTER TABLE public.transaction_journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tj_select" ON public.transaction_journal_entries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tj_insert" ON public.transaction_journal_entries
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tj_update" ON public.transaction_journal_entries
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tj_delete" ON public.transaction_journal_entries
  FOR DELETE TO authenticated USING (true);
