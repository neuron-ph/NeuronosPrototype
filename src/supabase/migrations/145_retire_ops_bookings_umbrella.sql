-- NEU-012 Contract #1 (eliminate ops_bookings umbrella), Step 5 — STRICT.
--
-- The umbrella is now unused: a fresh grep + pg_policies sweep shows ZERO
-- enforcement references to 'ops_bookings' (all 4 bookings policies, the 2
-- cross-reads, the 4 app buttons, and the 2 routes read the real grants via
-- current_user_can_act_on_booking / canActOnBooking). So we remove the
-- derivation and the now-inert stored keys.
--
-- 1) Drop the `ops_bookings` derivation branch from the resolver. Keep the
--    `ops_projects` branch — that umbrella is Contract #2, retired later.
-- 2) Strip the inert stored `ops_bookings:<action>` umbrella keys from both
--    grant tables. These were invisible (the ops_bookings module is hidden, so
--    no UI row ever existed for them) — exactly the kind of stored-but-unseeable
--    grant strict forbids. The booking-detail TAB keys (ops_bookings_*_tab:*)
--    are real and are NOT touched.
--
-- The ops_bookings module node + its tabs remain in the schema (hidden host for
-- the real detail tabs). Only the umbrella action keys + derivation are gone.

create or replace function public.current_user_effective_module_grant(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user_id text;
  v_role text;
  v_department text;
  v_service text;
  v_override_grants jsonb := '{}'::jsonb;
  v_applied_profile_id uuid;
  v_profile_grants jsonb := '{}'::jsonb;
  v_role_profile_grants jsonb := '{}'::jsonb;
  v_module text;
  v_action text;
begin
  v_module := split_part(p_key, ':', 1);
  v_action := split_part(p_key, ':', 2);

  -- ops_projects umbrella derivation stays until Contract #2.
  if v_module = 'ops_projects' then
    return public.current_user_effective_module_grant('bd_projects:' || v_action)
        or public.current_user_effective_module_grant('pricing_projects:' || v_action);
  end if;

  select u.id, u.role, u.department, u.service_type
    into v_user_id, v_role, v_department, v_service
  from public.users u
  where u.auth_id = auth.uid()
  limit 1;

  if v_user_id is null then
    return false;
  end if;

  select coalesce(po.module_grants, '{}'::jsonb), po.applied_profile_id
    into v_override_grants, v_applied_profile_id
  from public.permission_overrides po
  where po.user_id = v_user_id
  limit 1;

  if v_override_grants ? p_key then
    return coalesce((v_override_grants ->> p_key)::boolean, false);
  end if;

  if v_applied_profile_id is not null then
    select coalesce(ap.module_grants, '{}'::jsonb)
      into v_profile_grants
    from public.access_profiles ap
    where ap.id = v_applied_profile_id
      and ap.is_active = true
    limit 1;

    if v_profile_grants ? p_key then
      return coalesce((v_profile_grants ->> p_key)::boolean, false);
    end if;
  end if;

  select coalesce(ap.module_grants, '{}'::jsonb)
    into v_role_profile_grants
  from public.access_profiles ap
  where ap.is_active = true
    and ap.is_baseline = true
    and ap.target_role = v_role
    and (ap.target_department = v_department or ap.target_department is null)
    and (ap.target_service = v_service or ap.target_service is null)
  order by
    case when ap.target_department = v_department then 0 else 1 end,
    case
      when ap.target_service is not distinct from v_service then 0
      when ap.target_service is null then 1
      else 2
    end,
    ap.updated_at desc
  limit 1;

  if v_role_profile_grants ? p_key then
    return coalesce((v_role_profile_grants ->> p_key)::boolean, false);
  end if;

  return false;
end;
$function$;

-- Strip the inert, invisible ops_bookings umbrella action keys.
update public.access_profiles
set module_grants = module_grants
  - 'ops_bookings:view' - 'ops_bookings:create' - 'ops_bookings:edit'
  - 'ops_bookings:approve' - 'ops_bookings:delete' - 'ops_bookings:export'
where module_grants ?| array[
  'ops_bookings:view','ops_bookings:create','ops_bookings:edit',
  'ops_bookings:approve','ops_bookings:delete','ops_bookings:export'];

update public.permission_overrides
set module_grants = module_grants
  - 'ops_bookings:view' - 'ops_bookings:create' - 'ops_bookings:edit'
  - 'ops_bookings:approve' - 'ops_bookings:delete' - 'ops_bookings:export'
where module_grants ?| array[
  'ops_bookings:view','ops_bookings:create','ops_bookings:edit',
  'ops_bookings:approve','ops_bookings:delete','ops_bookings:export'];
