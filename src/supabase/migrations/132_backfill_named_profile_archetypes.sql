-- ============================================================================
-- 132: Backfill named access profiles with archetype identity + baseline ticks
-- ============================================================================
-- The hand-made (non-baseline) access profiles predate the baseline-seed system.
-- Most have target_department/role/service = null ("Any") and ad-hoc ticks. This
-- tags each named profile with its proper archetype identity and copies the
-- matching baseline's visibility_scope + module_grants into it, making the named
-- profiles true instances of their archetype.
--
-- A profile's module_grants are read at runtime by PermissionProvider via the
-- applied_profile_id join, so this updates assigned users' ticks live. It does
-- NOT touch permission_overrides.scope (per decision: profiles only — visibility
-- is per-user snapshotted and left as-is).
--
-- Name-based + idempotent. Only touches is_baseline = false rows, so the baseline
-- seeds are never modified. The baseline module_grants include explicit `false`
-- deny-keys (e.g. Invoices/Collections off) which are required to defeat the
-- editor's parent→child cascade.
--
-- BD OFFICER → BD Staff (overrides its prior "Team Leader" tag; "Officer" = Staff).
--
-- Prerequisites:
--   128_access_profiles_target_service.sql — target_service column
--   129_access_profiles_is_baseline.sql     — is_baseline flag
--   130_access_profile_seeds.sql            — the 25 baseline rows
-- ============================================================================

with mapping(target_name, dept, role, service) as (values
  ('BD MANAGER',                               'Business Development', 'manager',    null),
  ('BD OFFICER',                               'Business Development', 'staff',      null),
  ('CUSTOMS DECLARANT',                        'Operations',          'staff',      'Brokerage'),
  ('IMPORT DOCUMENTATION OFFICER (BROKERAGE)', 'Operations',          'staff',      'Brokerage'),
  ('IMPORT DOCUMENTATION OFFICER (FORWARDING)','Operations',          'staff',      'Forwarding'),
  ('IMPORT SUPERVISOR (BROKERAGE)',            'Operations',          'supervisor', 'Brokerage'),
  ('LOGISTICS OFFICER',                        'Operations',          'staff',      'Trucking'),
  ('PRICING MANAGER',                          'Pricing',             'manager',    null),
  ('PRICING OFFICER',                          'Pricing',             'staff',      null)
)
update public.access_profiles t
set target_department = m.dept,
    target_role       = m.role,
    target_service    = m.service,
    visibility_scope  = b.visibility_scope,
    module_grants     = b.module_grants,
    updated_at        = now()
from mapping m
join public.access_profiles b
  on b.is_baseline = true
  and coalesce(b.target_department, '') = coalesce(m.dept, '')
  and coalesce(b.target_role, '')       = coalesce(m.role, '')
  and coalesce(b.target_service, '')    = coalesce(m.service, '')
where t.is_baseline = false
  and t.name = m.target_name;
