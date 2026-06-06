-- NEU-019 WG-04 (D4): dedicated company_settings knob.
-- "Save as company default" on the PDF screens overwrites org-wide letterhead
-- and bank details; it previously required no permission at all. The new
-- company_settings:edit key gates it. Seeding: mirror exec_profiling:edit
-- holders (the org-config knob — AutoCaps precedent), so the people who can
-- already change workspace-wide settings keep the button; everyone else loses
-- an affordance they should never have had.

-- Profiles: every profile granting exec_profiling:edit also grants company_settings:edit
update access_profiles
set module_grants = module_grants || '{"company_settings:edit": true}'::jsonb,
    updated_at = now()
where (module_grants ->> 'exec_profiling:edit')::boolean is true
  and coalesce((module_grants ->> 'company_settings:edit')::boolean, false) is not true;

-- Overrides: per-user grants that carry exec_profiling:edit explicitly
update permission_overrides
set module_grants = module_grants || '{"company_settings:edit": true}'::jsonb,
    updated_at = now()
where (module_grants ->> 'exec_profiling:edit')::boolean is true
  and coalesce((module_grants ->> 'company_settings:edit')::boolean, false) is not true;
