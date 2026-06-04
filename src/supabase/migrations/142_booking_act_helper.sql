-- NEU-012 Contract #1 (eliminate ops_bookings umbrella), Step 0 — STRICT.
--
-- Replacement mechanism for the hidden `ops_bookings` umbrella: a SQL EXPRESSION
-- (not a grant, not in the matrix) that ORs the REAL, VISIBLE grants that
-- legitimately let a user act on a booking. The umbrella derivation in
-- current_user_effective_module_grant stays ALIVE until Step 5 — this only adds
-- the new helper so policies/app can migrate off the umbrella one slice at a time.
--
-- "Can do X with a booking" = OR of:
--   ops_forwarding:X · ops_brokerage:X · ops_trucking:X
--   · ops_marine_insurance:X · ops_others:X · ops_projects_bookings_tab:X
--
-- (acct_bookings:view is NOT here — that's an Accounting view-only concern,
--  preserved as a separate explicit disjunct on the SELECT policy in Step 1.)

create or replace function public.current_user_can_act_on_booking(p_action text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.current_user_has_module_permission('ops_forwarding', p_action)
      or public.current_user_has_module_permission('ops_brokerage', p_action)
      or public.current_user_has_module_permission('ops_trucking', p_action)
      or public.current_user_has_module_permission('ops_marine_insurance', p_action)
      or public.current_user_has_module_permission('ops_others', p_action)
      or public.current_user_has_module_permission('ops_projects_bookings_tab', p_action);
$function$;
