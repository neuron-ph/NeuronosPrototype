-- ============================================================================
-- 204: repoint_live_bookings_to_rate_version (NEU-022 P2)
-- ============================================================================
-- WHY: when a manager amends a contract's rate card, createRateVersion() writes a
-- new immutable rate version. Per Marcus's decision, we do NOT retroactively
-- rewrite existing billings — instead every LIVE booking on the contract is
-- re-pointed to the new version so its RATE CALCULATOR produces the amended rates
-- the next time someone generates billing. Already-generated billings are left
-- exactly as they are.
--
-- SECURITY DEFINER because the amending manager (Pricing) may not hold per-booking
-- edit RLS across every booking on the contract; gated to amend-capable callers.
-- "Live" = any booking not Completed/Cancelled (Draft/Created/Confirmed/In
-- Transit/Delivered). Completed/Cancelled bookings keep their pinned version.
-- ============================================================================

create or replace function public.repoint_live_bookings_to_rate_version(
  p_contract_id text,
  p_version_id text
) returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_count integer;
begin
  -- Only a user who can amend contract rates may re-point.
  if not public.current_user_has_module_permission('pricing_contracts', 'amend') then
    raise exception 'Not authorized to amend contract rates';
  end if;

  update public.bookings
     set rate_version_id = p_version_id,
         updated_at = now()
   where contract_id = p_contract_id
     and coalesce(status, '') not in ('Completed', 'Cancelled');

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

grant execute on function public.repoint_live_bookings_to_rate_version(text, text) to authenticated;
