-- ============================================================================
-- Accounting v1 — SCHEMA RESTORE
-- ============================================================================
--
-- The inverse of migration 252 (drop_accounting). Generated from the LIVE dev
-- schema on 2026-07-31, immediately before the drop, and proven by a
-- drop -> restore -> verify -> drop cycle on dev.
--
-- Companion to the `archive/accounting-v1` git tag, which holds the code.
-- See docs/archive/ACCOUNTING_V1_MANIFEST.md for how the two fit together and
-- for the seven things restoring files does NOT restore.
--
-- WHAT THIS COVERS
--   tables      accounts, account_detail_types, journal_entries
--   functions   get_account_balances, set_journal_entry_number,
--               update_account_balances_on_je_insert
--   triggers    updated_at on accounts + journal_entries, entry-number autofill,
--               account-balance rollup on posted entries
--   policies    the RLS set as it stood, including the NEU-100 ack carve-outs
--
-- WHAT IT DOES NOT COVER — and why
--   * SEED DATA. The chart of accounts (194 rows on dev) and the 26 detail
--     types are NOT embedded here. They are still reproducible from migrations
--     that remain in the tree:
--         045_seed_chart_of_accounts_freight_forwarding.sql
--         229_add_account_detail_type.sql / 231_add_account_detail_types_table.sql
--     Run those after this file to get a working chart.
--   * JOURNAL ENTRIES. Transactional data, 27 rows on dev at drop time,
--     confirmed disposable by Marcus. Not preserved.
--   * journal_lines and transaction_journal_entries. Neither table ever existed
--     on dev — journal_entries carries its lines in a JSONB `lines` column, and
--     migration 243's TJ table was never applied here. Nothing to restore.
--
-- IMPORTANT: the RLS policies below reference module ids (acct_coa,
-- acct_journal, acct_financials) that no longer exist in the access schema.
-- current_user_has_module_permission() will simply return false for them, so a
-- restore is READ-LOCKED until those modules are re-added per the manifest's
-- Rewiring section. That is deliberate — fail closed, not open.
-- ============================================================================

BEGIN;

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.account_detail_types (
  name text NOT NULL,
  account_types text[] NOT NULL,
  activity text NOT NULL,
  statement_section text NOT NULL,
  sort_order integer DEFAULT 100 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.accounts (
  id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  sub_type text,
  category text,
  sub_category text,
  description text,
  parent_id text,
  balance numeric(15,2) DEFAULT 0,
  normal_balance text DEFAULT 'debit'::text,
  is_active boolean DEFAULT true,
  is_system boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  starting_amount numeric(15,2) DEFAULT 0,
  currency text DEFAULT 'PHP'::text NOT NULL,
  detail_type text
);

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id text NOT NULL,
  entry_number text,
  entry_date timestamp with time zone DEFAULT now(),
  evoucher_id text,
  invoice_id text,
  collection_id text,
  booking_id text,
  project_number text,
  customer_name text,
  description text,
  reference text,
  lines jsonb DEFAULT '[]'::jsonb,
  total_debit numeric(15,2) DEFAULT 0,
  total_credit numeric(15,2) DEFAULT 0,
  status text DEFAULT 'posted'::text,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  transaction_currency text,
  exchange_rate numeric(18,8),
  base_currency text DEFAULT 'PHP'::text NOT NULL,
  source_amount numeric(15,2),
  base_amount numeric(15,2),
  exchange_rate_date date,
  kind text,
  transfer_id text,
  disburse_to_user_id text,
  acknowledged_at timestamp with time zone,
  acknowledged_by text,
  processed_at timestamp with time zone,
  processed_by text,
  meta jsonb DEFAULT '{}'::jsonb
);

-- ── Constraints ─────────────────────────────────────────────────────────────

ALTER TABLE public.account_detail_types ADD CONSTRAINT account_detail_types_pkey PRIMARY KEY (name);
ALTER TABLE public.account_detail_types ADD CONSTRAINT account_detail_types_activity_check
  CHECK ((activity = ANY (ARRAY['Cash'::text, 'Operating'::text, 'Operating (non-cash adjustments)'::text, 'Investing'::text, 'Financing'::text, 'None'::text])));

ALTER TABLE public.accounts ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);
ALTER TABLE public.accounts ADD CONSTRAINT accounts_code_key UNIQUE (code);
ALTER TABLE public.accounts ADD CONSTRAINT accounts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_currency_fk FOREIGN KEY (currency) REFERENCES currencies(code);

ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_base_currency_fk FOREIGN KEY (base_currency) REFERENCES currencies(code);
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_evoucher_id_fkey FOREIGN KEY (evoucher_id) REFERENCES evouchers(id) ON DELETE SET NULL;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE SET NULL;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_disburse_to_user_id_fkey FOREIGN KEY (disburse_to_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_acc_code     ON public.accounts USING btree (code);
CREATE INDEX IF NOT EXISTS idx_acc_type     ON public.accounts USING btree (type);
CREATE INDEX IF NOT EXISTS idx_acc_parent   ON public.accounts USING btree (parent_id);
CREATE INDEX IF NOT EXISTS idx_acc_active   ON public.accounts USING btree (is_active) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_accounts_currency ON public.accounts USING btree (currency);

CREATE INDEX IF NOT EXISTS idx_je_date       ON public.journal_entries USING btree (entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_je_evoucher   ON public.journal_entries USING btree (evoucher_id);
CREATE INDEX IF NOT EXISTS idx_je_invoice    ON public.journal_entries USING btree (invoice_id);
CREATE INDEX IF NOT EXISTS idx_je_collection ON public.journal_entries USING btree (collection_id);
CREATE INDEX IF NOT EXISTS idx_je_booking    ON public.journal_entries USING btree (booking_id);
CREATE INDEX IF NOT EXISTS idx_je_status     ON public.journal_entries USING btree (status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_kind ON public.journal_entries USING btree (kind);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status_date ON public.journal_entries USING btree (status, entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_transaction_currency ON public.journal_entries USING btree (transaction_currency);

-- ── Functions ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_account_balances(p_from timestamp with time zone, p_to timestamp with time zone, p_cumulative boolean)
 RETURNS TABLE(account_id text, account_code text, account_name text, total_debit numeric, total_credit numeric)
 LANGUAGE sql
 STABLE
AS $function$
  select
    line->>'account_id'                            as account_id,
    max(line->>'account_code')                     as account_code,
    max(line->>'account_name')                     as account_name,
    sum(coalesce((line->>'debit')::numeric, 0))    as total_debit,
    sum(coalesce((line->>'credit')::numeric, 0))   as total_credit
  from public.journal_entries je
  cross join lateral jsonb_array_elements(coalesce(je.lines, '[]'::jsonb)) as line
  where je.status = 'posted'
    and case when p_cumulative then je.entry_date <= p_to
             else je.entry_date >= p_from and je.entry_date <= p_to end
    and (line->>'account_id') is not null
    and (line->>'account_code') is not null
  group by line->>'account_id';
$function$;

CREATE OR REPLACE FUNCTION public.set_journal_entry_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_year int;
  v_seq  int;
  v_is_pseudo boolean;
BEGIN
  v_is_pseudo := NEW.entry_number ~ '^JE-[A-Z]+-[0-9]{10,}$' OR NEW.entry_number ~ '^JE-[0-9]{10,}$';

  IF NEW.entry_number IS NULL OR NEW.entry_number = '' OR v_is_pseudo THEN
    v_year := EXTRACT(YEAR FROM COALESCE(NEW.entry_date, NEW.created_at, now()))::int;
    v_seq  := public.next_counter('journal_entry_counter_' || v_year);
    NEW.entry_number := 'JE-' || v_year || '-' || LPAD(v_seq::text, 4, '0');
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_account_balances_on_je_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  line_record jsonb;
  acct_id text;
  line_debit numeric;
  line_credit numeric;
  acct_normal_balance text;
  delta numeric;
BEGIN
  IF NEW.status != 'posted' THEN
    RETURN NEW;
  END IF;
  FOR line_record IN SELECT * FROM jsonb_array_elements(NEW.lines::jsonb)
  LOOP
    acct_id := line_record->>'account_id';
    line_debit  := COALESCE((line_record->>'debit')::numeric, 0);
    line_credit := COALESCE((line_record->>'credit')::numeric, 0);
    SELECT normal_balance INTO acct_normal_balance FROM accounts WHERE id = acct_id;
    IF acct_normal_balance = 'debit' THEN
      delta := line_debit - line_credit;
    ELSE
      delta := line_credit - line_debit;
    END IF;
    UPDATE accounts SET balance = COALESCE(balance, 0) + delta, updated_at = NOW() WHERE id = acct_id;
  END LOOP;
  RETURN NEW;
END;
$function$;

-- ── Triggers ────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_accounts_updated_at ON public.accounts;
CREATE TRIGGER trg_accounts_updated_at BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_journal_entries_updated_at ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_updated_at BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_set_journal_entry_number ON public.journal_entries;
CREATE TRIGGER trg_set_journal_entry_number BEFORE INSERT ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION set_journal_entry_number();

DROP TRIGGER IF EXISTS trg_update_account_balances_on_je_insert ON public.journal_entries;
CREATE TRIGGER trg_update_account_balances_on_je_insert AFTER INSERT ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION update_account_balances_on_je_insert();

-- ── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE public.accounts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_detail_types  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries       ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_detail_types_select ON public.account_detail_types FOR SELECT TO authenticated USING (true);
CREATE POLICY account_detail_types_write  ON public.account_detail_types FOR ALL    TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY accounts_select ON public.accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY accounts_insert ON public.accounts FOR INSERT TO authenticated WITH CHECK (current_user_has_module_permission('acct_coa'::text, 'create'::text));
CREATE POLICY accounts_update ON public.accounts FOR UPDATE TO authenticated USING (current_user_has_module_permission('acct_coa'::text, 'edit'::text)) WITH CHECK (true);
CREATE POLICY accounts_delete ON public.accounts FOR DELETE TO authenticated USING (current_user_has_module_permission('acct_coa'::text, 'delete'::text));

CREATE POLICY journal_entries_select ON public.journal_entries FOR SELECT TO authenticated
  USING (current_user_can_view_record('journal_entries'::text, created_by));
CREATE POLICY journal_entries_insert ON public.journal_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY journal_entries_update ON public.journal_entries FOR UPDATE TO authenticated
  USING (((current_user_has_module_permission('acct_journal'::text, 'view'::text) OR current_user_has_module_permission('acct_financials'::text, 'view'::text)) AND current_user_can_view_record('journal_entries'::text, created_by)))
  WITH CHECK (true);
CREATE POLICY journal_entries_delete ON public.journal_entries FOR DELETE TO authenticated
  USING (((current_user_has_module_permission('acct_journal'::text, 'view'::text) OR current_user_has_module_permission('acct_financials'::text, 'view'::text)) AND current_user_can_view_record('journal_entries'::text, created_by)));

-- NEU-100 ack carve-outs (migration 248): the cash receiver may see and release
-- ONLY their own advance entry, awaiting_ack -> ready_to_post.
CREATE POLICY journal_entries_select_ack ON public.journal_entries FOR SELECT TO authenticated
  USING ((disburse_to_user_id = get_my_profile_id()));
CREATE POLICY journal_entries_update_ack ON public.journal_entries FOR UPDATE TO authenticated
  USING (((kind = 'advance'::text) AND (status = 'awaiting_ack'::text) AND (disburse_to_user_id = get_my_profile_id())))
  WITH CHECK (((kind = 'advance'::text) AND (status = 'ready_to_post'::text) AND (disburse_to_user_id = get_my_profile_id())));

COMMIT;

-- ── After restoring, to get a WORKING chart ─────────────────────────────────
--   \i src/supabase/migrations/231_add_account_detail_types_table.sql   -- detail-type rows
--   \i src/supabase/migrations/045_seed_chart_of_accounts_freight_forwarding.sql
-- then re-add the acct_coa / acct_journal / acct_statements modules to the
-- access schema (see the manifest's Rewiring section) or everything stays
-- read-locked by the policies above.
