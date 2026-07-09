-- 234_evoucher_liquidation_verify_treasury_only.sql
-- NEU-051 (slice 1): Treasury replaces Accounting as the liquidation verifier.
--
-- Decision (Marcus, 7/09): "Treasury is the accounting team that verifies."
-- The liquidation verify/close transition (pending_verification -> posted) now
-- requires the Treasury capability acct_evouchers:disburse (from NEU-042),
-- matching the repointed UI gates in EVoucherWorkflowPanel (canVerifyAndPost /
-- canCloseLiquidation). Enforced at the DB so it holds outside the UI, mirroring
-- the disbursement lockdown in migration 232.
--
-- The evouchers_update write policy already admits disburse-capability holders
-- (migration 232 added the disburse OR-term), so no policy change is needed —
-- only this transition guard.

create or replace function public.enforce_evoucher_liquidation_verify_permission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() guard: exempt trusted service-role / SQL-console writes (migrations,
  -- backfills) which run without an end-user JWT and would otherwise resolve the
  -- permission check to false.
  if auth.uid() is not null
     and old.status = 'pending_verification'
     and new.status = 'posted'
     and not public.current_user_has_module_permission('acct_evouchers', 'disburse')
  then
    raise exception 'Only Treasury (acct_evouchers:disburse) may verify and post a liquidation'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists evoucher_enforce_liquidation_verify on public.evouchers;
create trigger evoucher_enforce_liquidation_verify
  before update on public.evouchers
  for each row
  execute function public.enforce_evoucher_liquidation_verify_permission();
