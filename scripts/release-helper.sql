-- Temporary release tool for the dev->prod migration (run, then DROP).
-- Locked to service_role only — no broader than the admin key already in use.
-- Lets scripts/release-apply.mjs apply exact migration-file bytes (multi-statement
-- via SPI) without hand-transcription. DROP it the moment the release is done.

create or replace function public.release_exec_sql(p_sql text)
returns void language plpgsql security definer set search_path = public as $$
begin
  execute p_sql;
end;
$$;
revoke all on function public.release_exec_sql(text) from public;
revoke all on function public.release_exec_sql(text) from anon;
revoke all on function public.release_exec_sql(text) from authenticated;
grant execute on function public.release_exec_sql(text) to service_role;

-- ── POST-RELEASE CLEANUP (run after the release is verified) ───────────────
-- drop function if exists public.release_exec_sql(text);
