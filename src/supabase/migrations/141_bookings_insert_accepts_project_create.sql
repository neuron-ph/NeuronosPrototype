-- 141_bookings_insert_accepts_project_create.sql
-- NEU-012 Phase 1: bind the project Create-Booking button and the bookings INSERT
-- policy to ONE grant.
--
-- A booking is created from two surfaces: (a) a service module (Operations
-- creates its own service's booking — gated by ops_<service>:create, rolled up
-- as the ops_bookings umbrella), and (b) a PROJECT (Pricing/BD create whatever
-- booking the project needs — gated by ops_projects_bookings_tab:create). The
-- bookings INSERT policy only accepted route (a). The project Create button is
-- being repointed to ops_projects_bookings_tab:create, so the INSERT must accept
-- that SAME grant — otherwise button and DB read two different truths.
--
-- After this, the button's grant (ops_projects_bookings_tab:create) is a literal
-- disjunct of the INSERT check, so button-yes always implies save-yes.

drop policy if exists bookings_insert on public.bookings;
create policy bookings_insert
  on public.bookings for insert to authenticated
  with check (
    current_user_has_module_permission('ops_bookings', 'create')
    or current_user_has_module_permission('ops_projects_bookings_tab', 'create')
  );
