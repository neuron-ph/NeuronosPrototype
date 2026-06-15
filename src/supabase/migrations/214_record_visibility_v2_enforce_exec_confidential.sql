-- Record Visibility V2 — Phase 5b: enforce that ONLY executives change `confidential`.
-- Spec/contract: docs/PLAN_RECORD_VISIBILITY_V2_2026-06.md (Phase 5 — "non-execs cannot").
--
-- The UI hides the toggle from non-execs, but RLS UPDATE policies gate on the
-- module EDIT grant, not on the confidential column — so a non-exec with edit
-- rights could flip it via the API. This BEFORE-UPDATE guard makes the rule real
-- at the data layer. Service-role / migration writes (auth.uid() IS NULL) are
-- allowed so backfills and tooling still work; only an AUTHENTICATED non-exec is blocked.

create or replace function public.enforce_exec_confidentiality()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if (old.confidential is distinct from new.confidential)
     and auth.uid() is not null
     and not public.is_executive() then
    raise exception 'Only executives can change record confidentiality';
  end if;
  return new;
end; $$;

drop trigger if exists trg_conf_enforce on public.contacts;
create trigger trg_conf_enforce before update on public.contacts
  for each row execute function public.enforce_exec_confidentiality();
drop trigger if exists trg_conf_enforce on public.customers;
create trigger trg_conf_enforce before update on public.customers
  for each row execute function public.enforce_exec_confidentiality();
drop trigger if exists trg_conf_enforce on public.quotations;
create trigger trg_conf_enforce before update on public.quotations
  for each row execute function public.enforce_exec_confidentiality();
drop trigger if exists trg_conf_enforce on public.projects;
create trigger trg_conf_enforce before update on public.projects
  for each row execute function public.enforce_exec_confidentiality();
drop trigger if exists trg_conf_enforce on public.bookings;
create trigger trg_conf_enforce before update on public.bookings
  for each row execute function public.enforce_exec_confidentiality();
