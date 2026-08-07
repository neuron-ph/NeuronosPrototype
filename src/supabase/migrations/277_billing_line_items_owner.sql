-- 277 — billing lines get an owner, so the billings dial can actually answer
--
-- Finding P4. 42 of 60 users open the Financials module and see zeros: every KPI
-- ₱0.00, every table empty, no error. Two independent causes; this migration is
-- the one that matters.
--
-- `current_user_can_view_record(record_type, owner_id)` decides visibility by
-- comparing the user's dial for that surface against the row's OWNER:
--
--     if v_dial in ('everything','org_wide') then return true; end if;
--     if p_owner_id is null then return false; end if;      <-- always, here
--
-- Every policy on billing_line_items passes NULL, because the table has 43
-- columns and not one of them records who created the row. So anybody whose
-- `billings` dial is own/team/department is denied every billing line, at the
-- database, no matter what the client does.
--
-- This is not billings being conceptually special. Migration 147 stamped a
-- creator onto collections, evouchers, expenses, invoices and quotations and
-- SKIPPED billing_line_items — because there was no column to stamp. It is the
-- one financial table that never got an owner.
--
-- Measured before fixing (all 60 users have `billings` set EXPLICITLY; not one
-- falls back to a default, so these are deliberate configurations being
-- mis-enforced rather than an unset dial):
--
--     own          39 users    sees zero billing lines
--     team          3 users    sees zero billing lines
--     everything   11 users    sees them
--     org_wide      7 users    sees them
--
-- REJECTED ALTERNATIVE: deriving billings visibility from the parent booking.
-- It reads well — a billing line is money on a job — but it collapses two
-- independently-configurable dials into one. The Access Configuration matrix
-- would show a billings setting that does nothing, and "sees all the money
-- without seeing all the jobs" — an ordinary Accounting posture — becomes
-- unexpressible. Record visibility is per-surface and individually configurable;
-- that is the doctrine, and this respects it. The billings dial now governs
-- billings, on its own terms, exactly as the invoices dial governs invoices.
--
-- NO BACKFILL, deliberately (Marcus's call). The 277 existing rows keep a NULL
-- creator and therefore stay invisible to own/team users, exactly as today.
-- org_wide and everything users are unaffected — their branch returns true
-- before the NULL check. New rows get stamped from here on.

alter table public.billing_line_items
  add column if not exists created_by text;

comment on column public.billing_line_items.created_by is
  'Row owner, for the billings visibility dial. Added by 277 (finding P4) — this '
  'table was the only financial table migration 147 could not stamp. Existing '
  'rows are NULL by design: no backfill.';

-- Same trigger function the four sibling tables already use (migration 146/147).
-- Additive: it fills only when blank, so no existing insert path changes.
drop trigger if exists billing_line_items_stamp_creator on public.billing_line_items;
create trigger billing_line_items_stamp_creator
  before insert on public.billing_line_items
  for each row execute function public.set_created_by_from_auth();

-- The policies stop passing NULL and start asking about the actual owner.
-- INSERT is untouched: a row has no owner until the trigger above gives it one.
drop policy if exists billing_line_items_select on public.billing_line_items;
create policy billing_line_items_select on public.billing_line_items
  for select
  using (current_user_can_view_record('billings', created_by));

drop policy if exists billing_line_items_update on public.billing_line_items;
create policy billing_line_items_update on public.billing_line_items
  for update
  using (
    current_user_can_billings('edit')
    and current_user_can_view_record('billings', created_by)
  )
  with check (current_user_can_billings('edit'));

-- Keeps 275's delete guards intact — invoiced lines are still undeletable — and
-- adds the owner question the other three now ask.
drop policy if exists billing_line_items_delete on public.billing_line_items;
create policy billing_line_items_delete on public.billing_line_items
  for delete
  using (
    invoice_id is null
    and coalesce(lower(status), 'unbilled') not in ('invoiced', 'billed', 'paid')
    and current_user_can_billings('delete')
    and current_user_can_view_record('billings', created_by)
  );
