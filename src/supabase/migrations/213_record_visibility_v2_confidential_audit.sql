-- Record Visibility V2 — Phase 5a: confidentiality audit + booking org_wide safety.
-- Spec/contract: docs/PLAN_RECORD_VISIBILITY_V2_2026-06.md (§8 Phase 5, audit guardrail).

-- ── Audit table: every flip of `confidential`, who/when/direction. Exec-read only. ──
create table if not exists public.record_confidentiality_audit (
  id uuid primary key default gen_random_uuid(),
  record_type text not null,
  record_id   text not null,
  changed_by  text,                       -- users.id resolved from auth.uid()
  old_value   boolean,
  new_value   boolean,
  changed_at  timestamptz not null default now()
);

alter table public.record_confidentiality_audit enable row level security;

-- Only executives can read the audit trail. No client write path (trigger only).
drop policy if exists rca_select_exec on public.record_confidentiality_audit;
create policy rca_select_exec on public.record_confidentiality_audit
  for select using (public.is_executive());

create index if not exists idx_rca_record on public.record_confidentiality_audit (record_type, record_id);

-- ── Trigger: log on confidential change (SECURITY DEFINER bypasses the no-write RLS). ──
create or replace function public.log_confidentiality_change()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_uid text;
begin
  if tg_op = 'UPDATE' and (old.confidential is distinct from new.confidential) then
    select u.id into v_uid from public.users u where u.auth_id = auth.uid() limit 1;
    insert into public.record_confidentiality_audit(record_type, record_id, changed_by, old_value, new_value)
    values (tg_argv[0], new.id, v_uid, old.confidential, new.confidential);
  end if;
  return new;
end; $$;

drop trigger if exists trg_conf_audit on public.contacts;
create trigger trg_conf_audit after update on public.contacts
  for each row execute function public.log_confidentiality_change('contacts');
drop trigger if exists trg_conf_audit on public.customers;
create trigger trg_conf_audit after update on public.customers
  for each row execute function public.log_confidentiality_change('customers');
drop trigger if exists trg_conf_audit on public.quotations;
create trigger trg_conf_audit after update on public.quotations
  for each row execute function public.log_confidentiality_change('quotations');
drop trigger if exists trg_conf_audit on public.projects;
create trigger trg_conf_audit after update on public.projects
  for each row execute function public.log_confidentiality_change('projects');
drop trigger if exists trg_conf_audit on public.bookings;
create trigger trg_conf_audit after update on public.bookings
  for each row execute function public.log_confidentiality_change('bookings');

-- ── Booking org_wide safety: if a booking dial is ever set to 'org_wide', treat it
--    as "all non-restricted" (confidential already gated above) instead of falling
--    through to false. Keeps the 7-arg function consistent with the v2 ladder. ──
create or replace function public.current_user_can_view_booking(
  p_record_type text, p_created_by text, p_manager_id text,
  p_supervisor_id text, p_handler_id text, p_booking_id text, p_confidential boolean
) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare v_user_id text; v_dial text; v_ids text[];
begin
  select u.id into v_user_id from public.users u where u.auth_id = auth.uid() limit 1;
  if v_user_id is null then return false; end if;
  if v_user_id in (p_created_by, p_manager_id, p_supervisor_id, p_handler_id) then return true; end if;
  if p_booking_id is not null and exists (
    select 1 from public.booking_assignments ba where ba.booking_id = p_booking_id and ba.user_id = v_user_id
  ) then return true; end if;
  if public.is_executive() then return true; end if;
  if p_confidential is true then return false; end if;
  v_dial := public.current_user_visibility_dial(p_record_type);
  if v_dial in ('everything', 'org_wide') then return true; end if;   -- all non-restricted
  if v_dial = 'own' then return false; end if;
  if v_dial = 'team' then v_ids := public.current_user_team_ids();
  elsif v_dial = 'department' then v_ids := public.current_user_department_user_ids();
  else return false;
  end if;
  if p_created_by = any(v_ids) or p_manager_id = any(v_ids)
     or p_supervisor_id = any(v_ids) or p_handler_id = any(v_ids) then return true; end if;
  if p_booking_id is not null and exists (
    select 1 from public.booking_assignments ba where ba.booking_id = p_booking_id and ba.user_id = any(v_ids)
  ) then return true; end if;
  return false;
end; $$;
