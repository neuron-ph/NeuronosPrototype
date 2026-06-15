-- Record Visibility V2 — Phase 2 (functions only; NOT attached to any policy).
-- Spec/contract: docs/PLAN_RECORD_VISIBILITY_V2_2026-06.md (§4, §5, §5b, §6).
--
-- Installs the engine; behavior-neutral until Phase 3 alters policies.
--   users_reachable_ids(type, users[])     — participation closure for a SET of users
--   current_user_reachable_ids(type)        — closure for the auth user (= users_reachable_ids[me])
--   current_user_can_view_record_v2(...)     — the four-rung ladder (§2/§6)
--
-- Closure rules (Inv. 1 + Inv. 5):
--   • DIRECT participation rows are included even if restricted (the personal door).
--   • LINK-reached rows (1-hop, enumerated §5) are included ONLY if confidential=false
--     (a linked record never opens a restricted record — closes the backdoor).
--
-- Dial vocabulary in V2:
--   'everything'  -> ALL RECORDS (absolute; sees restricted)
--   'org_wide'    -> all NON-restricted + my closure         (Phase 6 assigns this value)
--   'department'  -> LEGACY; treated as 'org_wide' in V2 (the dial is being retired)
--   'team' / 'own' as named.
--
-- NOTE: bookings keep their proven 188 path in Phase 3 (augmented with a confidential
-- check), so the v2 view function is intended for contacts/customers/quotations/
-- contracts/projects. A bookings arm is included in the closure for completeness/testing.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. users_reachable_ids(p_type, p_users) — the engine.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.users_reachable_ids(p_type text, p_users text[])
returns text[]
language plpgsql stable security definer set search_path to 'public' as $$
declare result text[] := array[]::text[];
begin
  if p_users is null or array_length(p_users, 1) is null then
    return result;
  end if;

  if p_type = 'customers' then
    select array_agg(distinct id) into result from (
      -- direct (incl. restricted)
      select c.id from public.customers c
        where c.created_by = any(p_users) or c.owner_id = any(p_users)
      union
      -- 1-hop link targets, non-restricted only (Inv. 5)
      select c.id from public.customers c
        where c.confidential = false and c.id in (
          select b.customer_id from public.bookings b
            where b.customer_id is not null
              and (b.created_by = any(p_users) or b.manager_id = any(p_users)
                   or b.supervisor_id = any(p_users) or b.handler_id = any(p_users)
                   or exists (select 1 from public.booking_assignments ba
                              where ba.booking_id = b.id and ba.user_id = any(p_users)))
          union
          select pr.customer_id from public.projects pr
            where pr.customer_id is not null
              and (pr.created_by = any(p_users) or pr.manager_id = any(p_users)
                   or pr.supervisor_id = any(p_users) or pr.handler_id = any(p_users))
          union
          select q.customer_id from public.quotations q
            where q.customer_id is not null
              and (q.created_by = any(p_users) or q.prepared_by = any(p_users)
                   or q.assigned_to = any(p_users))
        )
    ) s;

  elsif p_type = 'contacts' then
    select array_agg(distinct id) into result from (
      select ct.id from public.contacts ct
        where ct.created_by = any(p_users) or ct.owner_id = any(p_users)
      union
      select ct.id from public.contacts ct
        where ct.confidential = false and (
          ct.id in (select q.contact_id from public.quotations q
                      where q.contact_id is not null
                        and (q.created_by = any(p_users) or q.prepared_by = any(p_users)
                             or q.assigned_to = any(p_users)))
          or ct.customer_id in (select c.id from public.customers c
                                  where c.created_by = any(p_users) or c.owner_id = any(p_users))
        )
    ) s;

  elsif p_type in ('quotations', 'contracts') then
    select array_agg(distinct id) into result from (
      select q.id from public.quotations q
        where q.created_by = any(p_users) or q.prepared_by = any(p_users)
           or q.assigned_to = any(p_users)
      union
      select q.id from public.quotations q
        where q.confidential = false and q.id in (
          select b.contract_id from public.bookings b
            where b.contract_id is not null
              and (b.created_by = any(p_users) or b.manager_id = any(p_users)
                   or b.supervisor_id = any(p_users) or b.handler_id = any(p_users)
                   or exists (select 1 from public.booking_assignments ba
                              where ba.booking_id = b.id and ba.user_id = any(p_users)))
          union
          select pr.quotation_id from public.projects pr
            where pr.quotation_id is not null
              and (pr.created_by = any(p_users) or pr.manager_id = any(p_users)
                   or pr.supervisor_id = any(p_users) or pr.handler_id = any(p_users))
        )
    ) s;

  elsif p_type = 'projects' then
    select array_agg(distinct id) into result from (
      select pr.id from public.projects pr
        where pr.created_by = any(p_users) or pr.manager_id = any(p_users)
           or pr.supervisor_id = any(p_users) or pr.handler_id = any(p_users)
      union
      select pr.id from public.projects pr
        where pr.confidential = false and pr.id in (
          select b.project_id from public.bookings b
            where b.project_id is not null
              and (b.created_by = any(p_users) or b.manager_id = any(p_users)
                   or b.supervisor_id = any(p_users) or b.handler_id = any(p_users)
                   or exists (select 1 from public.booking_assignments ba
                              where ba.booking_id = b.id and ba.user_id = any(p_users)))
        )
    ) s;

  elsif p_type like 'bookings%' then
    -- bookings are a link SOURCE, not a target (§5) → direct participation only.
    select array_agg(distinct id) into result from (
      select b.id from public.bookings b
        where b.created_by = any(p_users) or b.manager_id = any(p_users)
           or b.supervisor_id = any(p_users) or b.handler_id = any(p_users)
           or exists (select 1 from public.booking_assignments ba
                      where ba.booking_id = b.id and ba.user_id = any(p_users))
    ) s;
  end if;

  return coalesce(result, array[]::text[]);
end; $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. current_user_reachable_ids(p_type) — closure for the auth user.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.current_user_reachable_ids(p_type text)
returns text[]
language plpgsql stable security definer set search_path to 'public' as $$
declare me text;
begin
  select u.id into me from public.users u where u.auth_id = auth.uid() limit 1;
  if me is null then return array[]::text[]; end if;
  return public.users_reachable_ids(p_type, array[me]);
end; $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. current_user_can_view_record_v2(...) — the four-rung ladder (§2/§6).
--    Short-circuit ordered: the common org-wide path is one boolean read.
--    NOT attached to any policy in this migration.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.current_user_can_view_record_v2(
  p_type text, p_record_id text, p_created_by text, p_confidential boolean
) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare me text; v_dial text;
begin
  select u.id into me from public.users u where u.auth_id = auth.uid() limit 1;
  if me is null then return false; end if;

  v_dial := public.current_user_visibility_dial(p_type);

  -- 1. all records (absolute)
  if v_dial = 'everything' then return true; end if;

  -- 2. common path: non-restricted at org-wide breadth (legacy 'department' == org_wide)
  if (p_confidential is not true) and (v_dial in ('org_wide', 'department')) then
    return true;
  end if;

  -- 3. creator always sees own (D.1: confidential does NOT hide from creator)
  if me = p_created_by then return true; end if;

  -- 4. personal closure — assigned + 1-hop links; the ONLY restricted door besides
  --    all-records (Inv. 1). Restricted records reached only via direct participation.
  if p_record_id = any(public.current_user_reachable_ids(p_type)) then return true; end if;

  -- 5. team: NON-restricted only (Inv. 1 — restricted never inherited via team breadth)
  if v_dial = 'team' and (p_confidential is not true) then
    if p_record_id = any(public.users_reachable_ids(p_type, public.current_user_team_ids())) then
      return true;
    end if;
  end if;

  return false;
end; $$;
