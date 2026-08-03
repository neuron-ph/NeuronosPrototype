-- 272 — no SECURITY DEFINER function answers an anonymous caller (finding H3)
--
-- Fixing H2 turned up the systemic version of it: `=X/postgres` in `proacl` is
-- PUBLIC EXECUTE, it is the DEFAULT for every function created in this schema,
-- and every role — including `anon` — is a member of PUBLIC. So the twelve
-- unchecked definer writers logged as H3 were never merely "reachable by any
-- signed-in user". They were reachable by anyone with the publishable key that
-- ships in the JS bundle.
--
-- A SECURITY DEFINER function runs as its owner with RLS switched off, so the
-- function's own check is the only thing between a caller and the table. Half of
-- these have no check at all. Until each one is given the `approve_invoice`
-- treatment, the grant is the control.
--
-- THIS SWEEP PRESERVES ACCESS, IT DOES NOT WIDEN OR NARROW IT for anyone who is
-- signed in. For each definer function it asks `has_function_privilege` FIRST —
-- which accounts for access held via PUBLIC — and re-grants explicitly to the
-- roles that already had it, before revoking PUBLIC and anon. Consequences:
--
--   * a function `authenticated` could already call, it can still call;
--   * `clone_exec_sql` / `clone_query` (service_role only, no PUBLIC grant) are
--     untouched — the loop never grants a role something it didn't have;
--   * `anon` loses everything, which is the point.
--
-- Trigger functions are included and unaffected in practice: nothing calls them
-- by name, they fire as part of the statement that owns them.
--
-- Dev only. The identical sweep is proposed for prod once the spine and the
-- adversary have run green against it here.

do $$
declare
  fn record;
  auth_had boolean;
  svc_had  boolean;
  n_revoked int := 0;
begin
  for fn in
    select p.oid,
           format('%I.%I(%s)', n.nspname, p.proname,
                  pg_get_function_identity_arguments(p.oid)) as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    -- Ask before changing anything: has_function_privilege resolves grants held
    -- through PUBLIC, which is exactly the access we are about to remove.
    auth_had := has_function_privilege('authenticated', fn.oid, 'EXECUTE');
    svc_had  := has_function_privilege('service_role',  fn.oid, 'EXECUTE');

    if auth_had then
      execute format('grant execute on function %s to authenticated', fn.sig);
    end if;
    if svc_had then
      execute format('grant execute on function %s to service_role', fn.sig);
    end if;

    execute format('revoke execute on function %s from public, anon', fn.sig);
    n_revoked := n_revoked + 1;
  end loop;

  raise notice 'definer sweep: % functions', n_revoked;
end;
$$;
