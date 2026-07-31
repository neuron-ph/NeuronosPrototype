-- Migration 267: Performance moves from HR to Executive.
--
-- Reading the whole company's performance is an executive capability, not an HR
-- one. The sidebar placement also mattered practically: HR's own entry carries a
-- dev-only flag (!import.meta.env.PROD), so a module sitting beside it was one
-- careless line away from disappearing in production.
--
-- moduleId renamed hr_performance -> exec_performance to match its siblings
-- (exec_activity_log, exec_users, exec_profiling). The id is referenced in three
-- places: the TS access schema, these permission checks, and the stored grant
-- keys on permission_overrides. All three move together or access breaks.
--
-- The grant rename is a KEY MIGRATION, not a backfill. Nobody gains access who
-- did not already have it; the same people keep exactly what they had under the
-- new name. Granting new access still belongs in the Access Configuration matrix.

-- 1. Carry existing grants across, then drop the old keys.
UPDATE permission_overrides
SET module_grants = (module_grants
      - 'hr_performance:view' - 'hr_performance:edit')
      || jsonb_strip_nulls(jsonb_build_object(
           'exec_performance:view', module_grants -> 'hr_performance:view',
           'exec_performance:edit', module_grants -> 'hr_performance:edit')),
    updated_at = now()
WHERE module_grants ?| ARRAY['hr_performance:view','hr_performance:edit'];

-- Access profiles carry the same key shape when one has been saved as a template.
UPDATE access_profiles
SET module_grants = (module_grants
      - 'hr_performance:view' - 'hr_performance:edit')
      || jsonb_strip_nulls(jsonb_build_object(
           'exec_performance:view', module_grants -> 'hr_performance:view',
           'exec_performance:edit', module_grants -> 'hr_performance:edit'))
WHERE module_grants ?| ARRAY['hr_performance:view','hr_performance:edit'];

-- 2. Point the permission checks at the new id.
CREATE OR REPLACE FUNCTION kpi_can_read_others()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $fn$
  SELECT auth.uid() IS NULL
      OR current_user_has_module_permission('exec_performance', 'view');
$fn$;

CREATE OR REPLACE FUNCTION kpi_can_evaluate()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $fn$
  SELECT auth.uid() IS NULL
      OR current_user_has_module_permission('exec_performance', 'edit');
$fn$;
