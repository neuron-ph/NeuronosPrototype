-- NEU-012 Contract #2 (eliminate ops_projects umbrella), Slice B — STRICT.
--
-- ops_projects is now unused as enforcement: customers_select (Slice A, mig 148)
-- reads bd_projects/pricing_projects directly; no app code reads can('ops_projects')
-- (PROJECT_MODULE_IDS.ops.root is defined but never read). So remove the last
-- umbrella derivation branch from the resolver and strip the inert stored keys.
-- After this the resolver has NO umbrella derivation at all. The ops_projects
-- module node + its tabs remain (hidden host).

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
begin
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

update public.access_profiles
set module_grants = module_grants
  - 'ops_projects:view' - 'ops_projects:create' - 'ops_projects:edit'
  - 'ops_projects:approve' - 'ops_projects:delete' - 'ops_projects:export'
where module_grants ?| array[
  'ops_projects:view','ops_projects:create','ops_projects:edit',
  'ops_projects:approve','ops_projects:delete','ops_projects:export'];

update public.permission_overrides
set module_grants = module_grants
  - 'ops_projects:view' - 'ops_projects:create' - 'ops_projects:edit'
  - 'ops_projects:approve' - 'ops_projects:delete' - 'ops_projects:export'
where module_grants ?| array[
  'ops_projects:view','ops_projects:create','ops_projects:edit',
  'ops_projects:approve','ops_projects:delete','ops_projects:export'];
