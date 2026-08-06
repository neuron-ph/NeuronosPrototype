-- 276 — the cascade table stops answering strangers (finding U1)
--
-- `public.access_cascade_edges` holds the 609 rules that decide which grants
-- imply which other grants. It had RLS disabled, zero policies, and handed
-- `anon` the full set: SELECT, INSERT, UPDATE, DELETE, TRUNCATE. No login, no
-- session, no account — the publishable key that ships in the bundle was enough.
-- Every other table in this surface has RLS on. This one was missed, and it has
-- presumably been open since 198 shipped, because nothing anyone did in the
-- product would ever have touched it.
--
-- Why an editable lookup table is an escalation. Migration 198 puts a
-- BEFORE INSERT OR UPDATE trigger on both `permission_overrides` and
-- `access_profiles`:
--
--     new.module_grants := public.materialize_grant_cascade(new.module_grants);
--
-- and that function reads this table — for every edge whose parent_key is
-- present in the blob and whose child_key is absent, it copies the parent's
-- value onto the child. So the attack is: insert one edge from a grant everybody
-- already holds to a grant you want, then wait. The next time an administrator
-- applies a profile or edits anyone's access — an ordinary, legitimate action —
-- the cascade materializes the planted grant. The audit trail shows an admin
-- doing their job.
--
-- The blunter vector is TRUNCATE: emptying the table grants nothing, but it
-- silently removes every cascade rule, so every subsequent profile application
-- produces grants missing all their children. Users lose tabs one by one and
-- nobody connects it to a lookup table nobody knew was writable.
--
-- ORDER MATTERS, and the register's original one-line fix was wrong.
--
-- The register said "reads happen inside a SECURITY DEFINER function, so nothing
-- legitimate needs direct access." They don't. `materialize_grant_cascade` is
-- SECURITY INVOKER, so the trigger reads this table as the calling administrator
-- — the `authenticated` role. Revoking from `authenticated` without fixing that
-- first turns every access edit into `permission denied for table
-- access_cascade_edges`. Access administration stops working.
--
-- So: function first, then the revoke, then RLS.
--
-- Nothing in src/ reads this table. The only readers are three service-role
-- scripts (copyEdgesToProd.mjs, genGrantCascadeMigration.ts, probeProd.mjs), and
-- the service role bypasses both the grants and RLS.

-- 1. The trigger's reader stops borrowing the caller's privileges.
--
--    Note this function is declared IMMUTABLE while reading a table, which is a
--    lie to the planner and pre-dates this migration. Left as-is deliberately:
--    correcting it to STABLE is a behaviour change (it would stop the planner
--    constant-folding cascade results) and belongs in its own commit, not in a
--    breach fix.
alter function public.materialize_grant_cascade(jsonb)
  security definer
  set search_path = public, pg_temp;

-- 2. Making the function SECURITY DEFINER hands its privileges to everyone who
--    can execute it — and EXECUTE was granted to PUBLIC and anon, because 272's
--    definer sweep skipped this function when it was still INVOKER. Left alone,
--    step 1 would trade a writable table for a readable one: an anon caller
--    could feed it one parent_key at a time and read the cascade back out of the
--    return value. Only the trigger needs it, and the trigger runs as the
--    calling administrator.
revoke execute on function public.materialize_grant_cascade(jsonb) from public, anon;

-- 3. No client role touches the table directly. Reads now happen only through
--    the definer function above.
revoke all on public.access_cascade_edges from anon, authenticated;

-- 4. Belt and braces. Zero policies, so nothing gets through even if a grant is
--    ever handed back by accident.
alter table public.access_cascade_edges enable row level security;

comment on table public.access_cascade_edges is
  'Grant cascade rules (parent_key implies child_key). NOT client-readable: RLS '
  'on with no policies, and all privileges revoked from anon and authenticated. '
  'Read only via materialize_grant_cascade(), which is SECURITY DEFINER. See '
  'migration 276 / finding U1.';
