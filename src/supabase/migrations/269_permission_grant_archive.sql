-- ─────────────────────────────────────────────────────────────────────────────
-- 269 — Archive table for pruned permission grants
--
-- Access profiles are templates; applying one MATERIALIZES an absolute grant
-- blob into permission_overrides.module_grants. That means every key ever
-- written survives forever, including keys for doors that have since been
-- deleted — 14 of them are residue from the accounting removal (migrations
-- 250-252), and another 19 predate ACCESS_SCHEMA existing at all.
--
-- Before pruning those blobs we snapshot exactly what was removed, per user, so
-- the operation is reversible. scripts/prune-dead-grants.mjs writes here.
--
-- Nothing reads this table. It exists to make the prune undoable.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.permission_grant_archive (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  archived_at   timestamptz not null default now(),
  reason        text not null,
  -- The keys removed from this user's module_grants, as {"moduleId:action": true}
  removed_keys  jsonb not null,
  -- Full pre-prune blob, so a restore never depends on recomputing anything
  grants_before jsonb not null
);

create index if not exists permission_grant_archive_user_idx
  on public.permission_grant_archive (user_id);
create index if not exists permission_grant_archive_at_idx
  on public.permission_grant_archive (archived_at desc);

comment on table public.permission_grant_archive is
  'Snapshots of permission_overrides.module_grants keys removed by the dead-grant prune. Restore source, not read by the app.';

-- Service-role only. This holds a full historical picture of who could do what;
-- it should never be reachable from the client.
alter table public.permission_grant_archive enable row level security;
