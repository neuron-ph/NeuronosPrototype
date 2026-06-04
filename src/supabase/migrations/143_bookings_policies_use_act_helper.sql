-- NEU-012 Contract #1 (eliminate ops_bookings umbrella), Step 1 — STRICT.
--
-- Replace every `ops_bookings:<action>` reference in the bookings policies with
-- the real-grant helper current_user_can_act_on_booking(<action>). The umbrella
-- derivation in current_user_effective_module_grant stays alive (removed only at
-- Step 5, after a fresh grep proves zero references).
--
-- Deltas from the prior live policies (intentional, documented):
--   * SELECT keeps `acct_bookings:view` as an explicit disjunct so Accounting
--     does not lose booking visibility (it is a real, separate visible grant).
--   * UPDATE/DELETE now also accept `ops_projects_bookings_tab:<action>` (it was
--     previously only on INSERT). The helper is uniform across verbs so the UI
--     gate (project read-only view edit/delete buttons) and the DB rule read the
--     SAME real grants. This only widens to holders of that visible, configurable
--     grant — no one loses access.
-- Record-visibility scope (current_user_can_view_booking) is preserved verbatim.

drop policy if exists bookings_insert on public.bookings;
create policy bookings_insert on public.bookings
  as permissive for insert to authenticated
  with check ( public.current_user_can_act_on_booking('create') );

drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings
  as permissive for select to authenticated
  using (
    ( public.current_user_can_act_on_booking('view')
      or public.current_user_has_module_permission('acct_bookings', 'view') )
    and public.current_user_can_view_booking(created_by, manager_id, supervisor_id, handler_id)
  );

drop policy if exists bookings_update on public.bookings;
create policy bookings_update on public.bookings
  as permissive for update to authenticated
  using (
    public.current_user_can_act_on_booking('edit')
    and public.current_user_can_view_booking(created_by, manager_id, supervisor_id, handler_id)
  )
  with check ( public.current_user_can_act_on_booking('edit') );

drop policy if exists bookings_delete on public.bookings;
create policy bookings_delete on public.bookings
  as permissive for delete to authenticated
  using (
    public.current_user_can_act_on_booking('delete')
    and public.current_user_can_view_booking(created_by, manager_id, supervisor_id, handler_id)
  );
