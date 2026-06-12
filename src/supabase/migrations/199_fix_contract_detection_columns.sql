-- ============================================================================
-- 199: Fix detect_active_contracts_for_customer column references (NEU-007)
-- ============================================================================
-- Migration 196 selected q.contract_validity_start / q.contract_validity_end,
-- but those columns do not exist on public.quotations — the real columns are
-- contract_start_date / contract_end_date. The RPC therefore 400'd on every
-- call ("column q.contract_validity_start does not exist"), spamming the console
-- on every booking-panel load and breaking contract detection + the contract-as-
-- container picker. The OUTPUT column names stay contract_validity_start/_end
-- (the app reads those); only the table column references are corrected.
-- ============================================================================

create or replace function public.detect_active_contracts_for_customer(p_customer_name text)
 returns table(id text, quote_number text, quotation_name text, customer_name text, contract_status text, contract_validity_start text, contract_validity_end text, services jsonb, pol_options text[], pod_options text[])
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
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
      q.contract_start_date::text,
      q.contract_end_date::text,
      coalesce(q.services, '[]'::jsonb),
      case when jsonb_typeof(q.details->'contract_general_details'->'port_of_loading') = 'array'
           then array(select jsonb_array_elements_text(q.details->'contract_general_details'->'port_of_loading'))
           else '{}'::text[] end,
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
$function$;
