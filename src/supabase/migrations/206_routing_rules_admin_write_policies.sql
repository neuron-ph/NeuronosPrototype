-- 206_routing_rules_admin_write_policies.sql
-- Admin CRUD for routing_rules, surfaced as Admin -> Profiling -> Routing Rules.
--
-- Reads stay PUBLIC (the EV routing resolver runs as the submitting user, who is
-- not an admin — see migration 205's routing_rules_read). Only writes are gated,
-- on the exec_profiling grant, mirroring the operational_services / service_-
-- assignment_roles config tables (migration 165 pattern).

DROP POLICY IF EXISTS routing_rules_insert ON public.routing_rules;
CREATE POLICY routing_rules_insert ON public.routing_rules
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_module_permission('exec_profiling', 'create'));

DROP POLICY IF EXISTS routing_rules_update ON public.routing_rules;
CREATE POLICY routing_rules_update ON public.routing_rules
  FOR UPDATE TO authenticated
  USING (public.current_user_has_module_permission('exec_profiling', 'edit'))
  WITH CHECK (public.current_user_has_module_permission('exec_profiling', 'edit'));

DROP POLICY IF EXISTS routing_rules_delete ON public.routing_rules;
CREATE POLICY routing_rules_delete ON public.routing_rules
  FOR DELETE TO authenticated
  USING (public.current_user_has_module_permission('exec_profiling', 'delete'));
