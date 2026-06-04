-- NEU-012 Contract #3 (eliminate inbox_entity_picker umbrella), STRICT — the last umbrella.
--
-- inbox_entity_picker has ZERO enforcement consumers: no DB policy references it,
-- the resolver has no umbrella branch, and no app code reads can('inbox_entity_picker').
-- It was only ever client-derived and silently STORED (1 profile + 23 overrides
-- carry inert inbox_entity_picker:<action> keys) — invisible stored grants, exactly
-- what strict forbids. Stop deriving (code: RETIRED_UMBRELLA_DERIVATIONS) and strip
-- the stored keys here. Module node + tabs remain (hidden host).

update public.access_profiles
set module_grants = module_grants
  - 'inbox_entity_picker:view' - 'inbox_entity_picker:create' - 'inbox_entity_picker:edit'
  - 'inbox_entity_picker:approve' - 'inbox_entity_picker:delete' - 'inbox_entity_picker:export'
where module_grants ?| array[
  'inbox_entity_picker:view','inbox_entity_picker:create','inbox_entity_picker:edit',
  'inbox_entity_picker:approve','inbox_entity_picker:delete','inbox_entity_picker:export'];

update public.permission_overrides
set module_grants = module_grants
  - 'inbox_entity_picker:view' - 'inbox_entity_picker:create' - 'inbox_entity_picker:edit'
  - 'inbox_entity_picker:approve' - 'inbox_entity_picker:delete' - 'inbox_entity_picker:export'
where module_grants ?| array[
  'inbox_entity_picker:view','inbox_entity_picker:create','inbox_entity_picker:edit',
  'inbox_entity_picker:approve','inbox_entity_picker:delete','inbox_entity_picker:export'];
