-- 197 — Fix: hand-created tickets fail with "new row violates row-level
-- security policy for table tickets".
--
-- Regression introduced by 163_phase4b: the tickets SELECT policy was repointed
-- at the SECURITY DEFINER helper current_user_can_view_ticket(id), which resolves
-- visibility by re-SELECTing created_by from the tickets table. The app creates
-- tickets via supabase .insert().select() (= INSERT ... RETURNING). During the
-- RETURNING, Postgres evaluates the SELECT policy against the brand-new row, but
-- the helper's internal lookup cannot see the not-yet-visible row (returns null
-- -> false), so the whole insert is rejected. Plain INSERT (no RETURNING)
-- succeeds; INSERT...RETURNING fails — i.e. every manual "Send" in the inbox.
-- Auto-created workflow tickets use the service role (bypass RLS) and were
-- unaffected, which masked the break.
--
-- Fix: let a creator read their OWN row via a column-direct check on the new
-- row's created_by (available at RETURNING time, no self-query) BEFORE falling
-- back to the helper. Visibility for everyone else is unchanged (the helper
-- branch is preserved verbatim). This restores INSERT...RETURNING for creators
-- without widening who can see existing tickets.

alter policy tickets_select on public.tickets
  using (
    created_by = get_my_profile_id()
    or public.current_user_can_view_ticket(id)
  );
