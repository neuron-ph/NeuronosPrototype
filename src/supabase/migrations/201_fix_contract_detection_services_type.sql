-- ============================================================================
-- 201: detect_active_contracts_for_customer — services is text[], not jsonb
-- ============================================================================
-- After 199 fixed the column names, the RPC still 400'd for customers that
-- actually have contracts: "COALESCE types text[] and jsonb cannot be matched".
-- Cause: public.quotations.services is text[] (udt _text), but the RPC did
-- coalesce(q.services, '[]'::jsonb) and returns services jsonb. Convert the
-- text[] to a jsonb array with to_jsonb(). Output/return shape unchanged.
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
      to_jsonb(coalesce(q.services, '{}'::text[])),
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
