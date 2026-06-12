-- ============================================================================
-- 200: replace_booking_assignments_atomic — gate on capability, not department
-- ============================================================================
-- NEU-006 (the real booking blocker) / NEU-012 (identity-gate retirement).
--
-- The booking INSERT is gated by capability (current_user_can_act_on_booking),
-- which Pricing satisfies (ops_marine_insurance/others:create). But writing the
-- booking's assignments went through this RPC, which had a HARDCODED department
-- gate: get_my_department() IN ('Operations','Executive'). So every Pricing
-- booking that carried assignment defaults (any healthy customer) inserted, then
-- failed at the assignment write → the panel rolled the booking back and showed
-- "Failed to create booking." That is the persistent NEU-006 failure.
--
-- Fix: gate on the SAME booking action capability the insert/RLS uses, so anyone
-- who may create or edit a booking may write its assignments. Executive retained.
-- ============================================================================

create or replace function public.replace_booking_assignments_atomic(
  p_booking_id text,
  p_service_type text,
  p_assignments jsonb,
  p_assigned_by text default null::text,
  p_team_id uuid default null::uuid,
  p_team_name text default null::text,
  p_manager_id text default null::text,
  p_manager_name text default null::text,
  p_supervisor_id text default null::text,
  p_supervisor_name text default null::text,
  p_handler_id text default null::text,
  p_handler_name text default null::text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- NEU-006/NEU-012: capability gate (mirrors the booking insert/update RLS),
  -- not a hardcoded Operations/Executive department check.
  if not (
    public.current_user_can_act_on_booking('create')
    or public.current_user_can_act_on_booking('edit')
    or public.is_executive()
  ) then
    raise exception 'You do not have permission to assign this booking';
  end if;

  delete from public.booking_assignments
   where booking_id = p_booking_id;

  insert into public.booking_assignments (
    booking_id, service_type, role_key, role_label, user_id, user_name, source, assigned_by
  )
  select
    p_booking_id, p_service_type,
    row_data.role_key, row_data.role_label, row_data.user_id, row_data.user_name,
    coalesce(nullif(row_data.source, ''), 'manual'),
    p_assigned_by
  from jsonb_to_recordset(coalesce(p_assignments, '[]'::jsonb)) as row_data(
    role_key text, role_label text, user_id text, user_name text, source text
  )
  where coalesce(row_data.role_key, '') <> ''
    and coalesce(row_data.user_id, '') <> '';

  update public.bookings
     set team_id = p_team_id,
         team_name = p_team_name,
         manager_id = p_manager_id,
         manager_name = p_manager_name,
         supervisor_id = p_supervisor_id,
         supervisor_name = p_supervisor_name,
         handler_id = p_handler_id,
         handler_name = p_handler_name,
         updated_at = now()
   where id = p_booking_id;
end;
$function$;
