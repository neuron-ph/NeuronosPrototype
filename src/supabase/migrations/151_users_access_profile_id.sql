-- NEU-012 Contract #4+#5 (Phase 2), Slice 2 — assignment home.
--
-- Path A: a user is assigned exactly one Access Profile, stored on the user.
-- This is the future single source of truth (replaces permission_overrides.
-- applied_profile_id). Nullable for now; the snapshot tool (RBAC_SNAPSHOT=apply)
-- populates it. The resolver does NOT read it yet (Slice 3 flips enforcement),
-- so adding the column changes no behavior.

alter table public.users
  add column if not exists access_profile_id uuid references public.access_profiles(id) on delete set null;
