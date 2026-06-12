-- ============================================================================
-- 202: current_user_can_act_on_booking — honor the per-door Bookings grant
-- ============================================================================
-- NEU-006 / NEU-012 doctrine: "While in [Module], they can [Action] [Record]."
-- "While in the Projects module, can Create Bookings" = <door>_projects_bookings_tab.
--
-- The helper only ORed the 5 service modules + ops_projects_bookings_tab, so a
-- Pricing user authorised by pricing_projects_bookings_tab:create was NOT
-- recognised — their booking insert passed only INCIDENTALLY if they happened to
-- also hold ops_marine_insurance/others:create. This widens the OR-set to every
-- Bookings record surface (per-door Projects + Contracts bookings tabs) so the
-- doctrine grant is the real authoriser. Mirrors src/utils/bookings/bookingCapability.ts.
-- ============================================================================

create or replace function public.current_user_can_act_on_booking(p_action text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    -- direct Operations booking service modules
    public.current_user_has_module_permission('ops_forwarding', p_action)
    or public.current_user_has_module_permission('ops_brokerage', p_action)
    or public.current_user_has_module_permission('ops_trucking', p_action)
    or public.current_user_has_module_permission('ops_marine_insurance', p_action)
    or public.current_user_has_module_permission('ops_others', p_action)
    -- Projects → Bookings tab (per door)
    or public.current_user_has_module_permission('ops_projects_bookings_tab', p_action)
    or public.current_user_has_module_permission('pricing_projects_bookings_tab', p_action)
    or public.current_user_has_module_permission('bd_projects_bookings_tab', p_action)
    or public.current_user_has_module_permission('acct_projects_bookings_tab', p_action)
    -- Contracts → Bookings tab (per door)
    or public.current_user_has_module_permission('pricing_contracts_bookings_tab', p_action)
    or public.current_user_has_module_permission('bd_contracts_bookings_tab', p_action)
    or public.current_user_has_module_permission('acct_contracts_bookings_tab', p_action);
$function$;
