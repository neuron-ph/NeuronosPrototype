-- Migration 244: unify the Transaction Journal INTO journal_entries (NEU-099 v2).
--
-- Marcus (2026-07-18): one journal, two lenses. The Transaction Journal and the
-- General Journal are the SAME module/component; the General Journal is just the
-- posted-only VIEW. So the pre-posting pipeline lives in journal_entries with
-- extra statuses + lifecycle fields, NOT a separate table (reverses migration 243).
--
-- journal_entries.status is free-text (no CHECK). Pre-posting rows use:
--   'pending' | 'awaiting_ack' | 'ready_to_post'   (in addition to draft/posted/void)
-- Balances/statements already read status='posted', so pipeline rows are inert
-- until posted. "Posting" is now a status flip (ready_to_post -> posted), not a
-- cross-table copy.

-- Retire the separate pre-posting table from migration 243 (dev-only; never prod).
DROP TRIGGER IF EXISTS trg_set_tj_entry_number ON public.transaction_journal_entries;
DROP TABLE IF EXISTS public.transaction_journal_entries;
DROP FUNCTION IF EXISTS public.set_tj_entry_number();

-- Lifecycle fields for the pre-posting pipeline, added onto journal_entries.
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS kind                TEXT,        -- expense|advance|invoice|collection|transfer (nullable; source also derivable from FKs)
  ADD COLUMN IF NOT EXISTS transfer_id         TEXT,        -- fund transfers (NEU-095)
  ADD COLUMN IF NOT EXISTS disburse_to_user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS acknowledged_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_by     TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processed_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processed_by        TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meta                JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_journal_entries_kind ON public.journal_entries(kind);
