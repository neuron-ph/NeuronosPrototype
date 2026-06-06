-- NEU-012 Phase 2 correction, Slice 2 (cont.) — fix 3 mis-assigned "clean" users.
--
-- Carolina C. Infante (Accounting), Janice D. De Villa (Accounting), Mariella R.
-- Soriano (Operations) carried permission_overrides.applied_profile_id pointing at
-- the "BD MANAGER" profile (target_department = Business Development) — the known
-- mis-assignment landmine. They are NOT BD; their shared "base" grants BD modules
-- their actual access never had. Re-pointing (mig 154) therefore leaked BD grants
-- to them (caught by the effective-set diff BEFORE any commit: +142 grants / 3 users).
--
-- General rule this surfaced: only re-point a user onto a shared profile when that
-- profile is a SUBSET of their actual access (A ⊆ S). 28 of 31 satisfy it; these 3
-- do not. So they get the SAME treatment as the 29 shadow users (Marcus, 2026-06-05):
-- an interim personal base holding their exact effective access, empty override,
-- applied_profile_id = NULL. Converging them onto a correct Accounting/Ops shared
-- profile is Phase-2 work.
--
-- DEV reconciliation only: source is public._rbac_pre_correction (the pre-correction
-- effective-set capture). Guarded to no-op where that capture is absent. The prod
-- path performs the Phase-2 data migration via the snapshot/assignment tool (which
-- will bake in the subset rule), not by replaying this file.

do $$
declare
  r record;
  v_profile_id uuid;
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = '_rbac_pre_correction'
  ) then
    raise notice 'NEU-012 156: _rbac_pre_correction capture absent — skipping (no-op).';
    return;
  end if;

  for r in
    select p.user_id, u.name, po.scope, po.departments,
           (select jsonb_object_agg(key, true)
              from jsonb_each(p.eff) e(key, val)
              where val::text = 'true') as true_grants
    from public._rbac_pre_correction p
    join public.users u on u.id = p.user_id
    join public.permission_overrides po on po.user_id = u.id
    where u.id in ('user-170e623f', 'user-b203e835', 'user-daab1458')
  loop
    insert into public.access_profiles
      (name, description, module_grants, is_active, is_baseline,
       target_department, target_role, target_service,
       visibility_scope, visibility_departments)
    values
      ('NEU-012 interim base — ' || r.name,
       'NEU-012 verbatim snapshot (Phase 2)',
       coalesce(r.true_grants, '{}'::jsonb), true, false,
       null, null, null, r.scope, r.departments)
    returning id into v_profile_id;

    update public.users
      set access_profile_id = v_profile_id
      where id = r.user_id;

    -- empty the (now-leaked) override delta; keep scope/departments intact.
    update public.permission_overrides
      set module_grants = '{}'::jsonb,
          applied_profile_id = null,
          updated_at = now()
      where user_id = r.user_id;
  end loop;
end $$;
