-- 270 — the e-voucher status becomes a state machine, not a column
--
-- Closes findings G1 and G2 (docs/qa/findings.md), both proved by
-- tests/e2e/adversary.spec.ts probes A1, A2 and A4.
--
-- G1: `evouchers_update` has a branch for `created_by = me AND my_evouchers:edit`,
--     and that branch does not care WHICH column is written. `status` is a
--     column, so the person who raised a voucher could set it to `disbursed`
--     from the browser console — no approver, no Treasury.
--
-- G2: nothing knew the chain had an ORDER. Treasury could move a voucher sitting
--     at `pending_ceo` straight to `disbursed`, because the policies ask who you
--     are and never where the record is.
--
-- There WAS a guard for G1 — enforce_evoucher_disburse_permission — but it only
-- inspects updates whose OLD status is `pending_accounting`. It defends one
-- doorway, so any path that doesn't come through that doorway was never looked
-- at. A per-transition trigger can only ever cover the transitions someone
-- remembered; this replaces that shape with a table of every legal edge.
--
-- Three parts:
--   1. evoucher_transition(id, to_status, notes) — the only way to move a
--      voucher. Validates (from, to, actor) as a triple and raises on anything
--      the matrix doesn't allow. SECURITY DEFINER, modelled on approve_invoice.
--   2. guard_evoucher_status_change — a BEFORE UPDATE trigger that refuses any
--      status change not made through (1), identified by a transaction-local
--      flag the function sets.
--   3. Grants.
--
-- Service-role writes (auth.uid() is null) pass the guard untouched — the same
-- convention enforce_evoucher_disburse_permission already uses, so seeds,
-- clones and admin repairs still work.
--
-- The guard blocks the CHANGE, not the row: a client updating any other column
-- (details, notes, vendor, attachments) is unaffected.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The transition function
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.evoucher_transition(
  p_evoucher_id text,
  p_to_status   text,
  p_notes       text default null
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  ev            record;
  v_me          text;
  v_from        text;
  v_is_owner    boolean;
  v_is_advance  boolean;
  v_approver_dept text;
  v_ok          boolean := false;
begin
  select id, status, created_by, transaction_type, details, pending_approver_department
    into ev
  from public.evouchers
  where id = p_evoucher_id;

  if ev.id is null then
    raise exception 'E-Voucher not found' using errcode = 'no_data_found';
  end if;

  v_me   := get_my_profile_id();
  v_from := ev.status;

  if v_me is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  if v_from = p_to_status then
    return v_from; -- no-op; not an error, just nothing to do
  end if;

  v_is_owner   := ev.created_by = v_me;
  v_is_advance := ev.transaction_type in ('cash_advance', 'budget_request');
  -- The MATERIALIZED approver wins; the requestor's own department is only the
  -- fallback when no routing rule matched (finding E12).
  v_approver_dept := coalesce(ev.pending_approver_department,
                              ev.details ->> 'requestor_department');

  -- ── The matrix. Every legal edge, and who may walk it. ────────────────────
  --
  -- Submit: the owner hands their own draft to the first approver. Which of the
  -- three targets is correct is decided client-side by resolveSubmitTarget
  -- (Executive requestors and direct expenses skip steps); all three are legal
  -- from draft, and none of them is legal from anywhere else.
  if v_from = 'draft'
     and p_to_status in ('pending_manager', 'pending_ceo', 'pending_accounting')
     and v_is_owner
     and current_user_has_module_permission('my_evouchers', 'edit')
  then v_ok := true;

  -- Manager step. Gated on the grant AND on being the routed approver's
  -- department — the same pair evouchers_update already enforces.
  elsif v_from = 'pending_manager' and p_to_status = 'pending_ceo'
     and current_user_has_module_permission('my_evouchers', 'approve')
     and v_approver_dept = get_my_department()
  then v_ok := true;

  -- CEO / Executive step.
  elsif v_from = 'pending_ceo' and p_to_status = 'pending_accounting'
     and current_user_has_module_permission('acct_evouchers', 'approve')
  then v_ok := true;

  -- Treasury releases the cash. An advance parks in liquidation; everything else
  -- settles in one step and closes. This is the edge G2 was walking around.
  elsif v_from = 'pending_accounting'
     and ((v_is_advance and p_to_status = 'disbursed')
       or (not v_is_advance and p_to_status = 'posted'))
     and current_user_has_module_permission('acct_evouchers', 'disburse')
  then v_ok := true;

  -- Liquidation, by the person who actually received the cash (NEU-045: the
  -- tagged receiver, falling back to the requestor when none was named).
  elsif v_from in ('disbursed', 'pending_liquidation')
     and p_to_status in ('pending_liquidation', 'pending_verification')
     and v_is_advance
     and coalesce(ev.details ->> 'cash_receiver_id', ev.created_by) = v_me
  then v_ok := true;

  -- Treasury verifies the liquidation, or sends it back to the handler.
  elsif v_from = 'pending_verification'
     and p_to_status in ('posted', 'pending_liquidation')
     and current_user_has_module_permission('acct_evouchers', 'disburse')
  then v_ok := true;

  -- Reopen a closed voucher for correction (NEU-098's unlock).
  elsif v_from = 'posted' and p_to_status = 'pending_accounting'
     and current_user_has_module_permission('acct_evouchers', 'approve')
  then v_ok := true;

  -- Send back to the requestor for a full re-traverse. Each stage's own
  -- authority may bounce it, and nobody else may.
  elsif p_to_status = 'draft' and v_from in ('pending_manager', 'pending_ceo', 'pending_accounting')
     and (
          (v_from = 'pending_manager'
             and current_user_has_module_permission('my_evouchers', 'approve')
             and v_approver_dept = get_my_department())
       or (v_from = 'pending_ceo'
             and current_user_has_module_permission('acct_evouchers', 'approve'))
       or (v_from = 'pending_accounting'
             and (current_user_has_module_permission('acct_evouchers', 'approve')
               or current_user_has_module_permission('acct_evouchers', 'disburse')))
     )
  then v_ok := true;

  -- The requestor may cancel their own voucher at any point BEFORE cash moves.
  -- Once disbursed or posted it needs a reversal, not a cancel (NEU-096).
  elsif p_to_status = 'cancelled'
     and v_from in ('draft', 'rejected', 'pending_manager', 'pending_ceo', 'pending_accounting')
     and v_is_owner
  then v_ok := true;

  -- Legacy AR dispositions (credited / refunded) on retired billing-side
  -- vouchers. No rows in dev carry these; kept so the collections resolution
  -- path keeps working, behind an accounting edit grant.
  elsif p_to_status in ('credited', 'refunded')
     and current_user_has_module_permission('acct_evouchers', 'edit')
  then v_ok := true;
  end if;

  if not v_ok then
    raise exception
      'You may not move E-Voucher % from % to % (transition not permitted for your grants)',
      coalesce(ev.id, p_evoucher_id), v_from, p_to_status
      using errcode = 'check_violation';
  end if;

  -- Tell the guard trigger this particular change is sanctioned. Transaction-
  -- local (the `true` third argument), so it cannot leak into another statement.
  perform set_config('neuron.evoucher_transition', p_evoucher_id || '->' || p_to_status, true);

  update public.evouchers
     set status = p_to_status,
         notes = coalesce(p_notes, notes),
         updated_at = now()
   where id = p_evoucher_id;

  return p_to_status;
end;
$$;

comment on function public.evoucher_transition(text, text, text) is
  'The only sanctioned way to change evouchers.status. Validates (from, to, actor) '
  'as a triple. See migration 270 and findings G1/G2.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The guard — every other path to the column is closed
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.guard_evoucher_status_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is not null
     and new.status is distinct from old.status
     and coalesce(current_setting('neuron.evoucher_transition', true), '')
         <> old.id || '->' || new.status
  then
    raise exception
      'E-Voucher status may only be changed through evoucher_transition() (attempted % -> %)',
      old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists evoucher_guard_status on public.evouchers;
create trigger evoucher_guard_status
  before update on public.evouchers
  for each row execute function public.guard_evoucher_status_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Grants
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.evoucher_transition(text, text, text) from public;
grant execute on function public.evoucher_transition(text, text, text) to authenticated;
