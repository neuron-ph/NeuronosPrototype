-- 215: legacy record-visibility resolver honors the org_wide dial
--
-- Context: Marcus's "make every record type cross-departmental" directive. The
-- V2 cross-departmental dial (org_wide) was only honored by the V2 resolver
-- (contacts/customers/quotations/projects/contracts) and the booking resolver
-- (current_user_can_view_booking already does `v_dial in ('everything','org_wide')`).
--
-- The LEGACY resolver current_user_can_view_record — used by financials
-- (invoices/billings/expenses/collections/evouchers), tasks, activities,
-- budget_requests, transactions, journal_entries, financial_filings,
-- liquidations, memos — fell straight through to `return false` for org_wide,
-- so setting those types' dial to org_wide failed CLOSED (the user saw nothing).
--
-- These legacy tables have NO `confidential` column, so org_wide here means
-- "every row of this type is visible to anyone who can open the gating module" —
-- the module grant is the gate, not row ownership. This is intentional: a user
-- granted the Accounting module + org_wide on invoices works them like
-- Accounting staff. (If a confidential column is later added to one of these
-- types, give that type a V2-style resolver instead of relying on this.)

create or replace function public.current_user_can_view_record(p_record_type text, p_owner_id text)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_user_id text; v_dial text;
begin
  select u.id into v_user_id from public.users u where u.auth_id = auth.uid() limit 1;
  if v_user_id is null then return false; end if;
  v_dial := public.current_user_visibility_dial(p_record_type);
  -- org_wide joins everything here: legacy types carry no confidential flag, so
  -- both mean "visible to anyone holding the module grant".
  if v_dial in ('everything', 'org_wide') then return true; end if;
  if p_owner_id is null then return false; end if;
  if v_dial = 'own'  then return p_owner_id = v_user_id; end if;
  if v_dial = 'team' then return p_owner_id = any(public.current_user_team_ids()); end if;
  if v_dial = 'department' then return p_owner_id = any(public.current_user_department_user_ids()); end if;
  return false;
end; $function$;
