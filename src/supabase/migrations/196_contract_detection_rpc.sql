-- 196_contract_detection_rpc.sql  (NEU-007 — pre-booking contract detection)
--
-- REGRESSION FIX. Migration 185 relationship-gated the contract read branch so a
-- contract is only visible once a booking/project already links to it. That closed
-- a real list-scan leak, but it also broke PRE-BOOKING detection: when a Brokerage
-- (or any cross-department ops) user starts a booking, the detection banner queries
-- `quotations` directly and gets [] — the link doesn't exist yet (chicken-and-egg),
-- and the contract is owned by a Pricing user so the dial branch fails too.
--
-- Fix (Marcus's call): scoped SECURITY DEFINER RPCs — the standard pattern here.
--   1) detect_active_contracts_for_customer(name): customer-scoped, returns only
--      HEADER fields (no rate matrices), so it can't be used to dump rate cards.
--   2) get_contract_for_booking(id): by-id full fetch (incl. rates) for the ONE
--      contract the user then selects.
-- Both require a genuine contract/booking VIEW capability (the same OR-set as 185
-- branch A) — so the list-scan leak 185 closed stays closed (no capability → no
-- rows), but legitimate booking-creation detection works again.

-- quotations.id is TEXT (e.g. 'QUO-1780539314751'), not uuid — typed accordingly.
drop function if exists public.detect_active_contracts_for_customer(text);
drop function if exists public.get_contract_for_booking(uuid);
drop function if exists public.get_contract_for_booking(text);

-- Shared capability gate (mirrors the quotations_select branch-A OR-set).
create or replace function public.current_user_can_detect_contracts()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
       current_user_has_module_permission('pricing_quotations','view')
    or current_user_has_module_permission('pricing_contracts','view')
    or current_user_has_module_permission('bd_contracts','view')
    or current_user_has_module_permission('bd_inquiries','view')
    or current_user_can_act_on_booking('view')
    or current_user_has_module_permission('acct_bookings','view');
$$;

-- ─── 1. Detection: customer-scoped header list (no rate matrices) ──────────────
create or replace function public.detect_active_contracts_for_customer(p_customer_name text)
returns table (
  id                      text,
  quote_number            text,
  quotation_name          text,
  customer_name           text,
  contract_status         text,
  contract_validity_start text,
  contract_validity_end   text,
  services                jsonb,
  pol_options             text[],
  pod_options             text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Same client-side guard, enforced server-side: don't dump on a blank/short name.
  if coalesce(btrim(p_customer_name), '') = '' or length(btrim(p_customer_name)) < 3 then
    return;
  end if;

  if not public.current_user_can_detect_contracts() then
    return;
  end if;

  return query
    select
      q.id::text,
      q.quote_number::text,
      q.quotation_name::text,
      q.customer_name::text,
      q.contract_status::text,
      q.contract_validity_start::text,
      q.contract_validity_end::text,
      coalesce(q.services, '[]'::jsonb),
      case when jsonb_typeof(q.details->'contract_general_details'->'port_of_loading') = 'array'
           then array(select jsonb_array_elements_text(q.details->'contract_general_details'->'port_of_loading'))
           else '{}'::text[] end,
      -- POD: brokerage per-service pods win, else contract-level port_of_entry
      coalesce(
        nullif(
          array(
            select jsonb_array_elements_text(sm->'service_details'->'pods')
            from jsonb_array_elements(coalesce(q.services_metadata, '[]'::jsonb)) sm
            where lower(sm->>'service_type') = 'brokerage'
              and jsonb_typeof(sm->'service_details'->'pods') = 'array'
          ),
          '{}'::text[]
        ),
        case when jsonb_typeof(q.details->'contract_general_details'->'port_of_entry') = 'array'
             then array(select jsonb_array_elements_text(q.details->'contract_general_details'->'port_of_entry'))
             else '{}'::text[] end
      )
    from public.quotations q
    where q.quotation_type = 'contract'
      and q.contract_status in ('Active', 'Expiring')
      and q.customer_name ilike '%' || btrim(p_customer_name) || '%';
end;
$$;

-- ─── 2. By-id full fetch (rate matrices) for the selected contract ─────────────
create or replace function public.get_contract_for_booking(p_contract_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.quotations;
begin
  if coalesce(btrim(p_contract_id), '') = '' then
    return null;
  end if;

  if not public.current_user_can_detect_contracts() then
    return null;
  end if;

  select * into v_row
  from public.quotations
  where id = p_contract_id and quotation_type = 'contract';

  if not found then
    return null;
  end if;

  return to_jsonb(v_row);
end;
$$;

grant execute on function public.current_user_can_detect_contracts() to authenticated;
grant execute on function public.detect_active_contracts_for_customer(text) to authenticated;
grant execute on function public.get_contract_for_booking(text) to authenticated;
