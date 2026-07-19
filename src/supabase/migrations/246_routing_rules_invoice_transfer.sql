-- Migration 246: seed routing rules for NEU-103 (invoice approval) and NEU-095
-- (fund transfer). Config data, not schema — idempotent so it's safe to re-run
-- and carries the rules to prod (they were inserted directly on dev during dev).
--
-- Both use the dept+role "custom rule" pattern (same as the Sir Jayson forwarding
-- rule): the resolver materializes pending_approver_department/role and the
-- workflow routes to whoever holds that dept+role.

-- NEU-103: every invoice routes to the Operations manager (Ma'am Ella) for approval.
INSERT INTO public.routing_rules (id, domain, label, trigger, authority, priority, active)
SELECT gen_random_uuid(), 'invoice', 'Invoice approval → Operations manager (Ma''am Ella)',
       '{}'::jsonb, '{"department":"Operations","role":"manager"}'::jsonb, 10, true
WHERE NOT EXISTS (SELECT 1 FROM public.routing_rules WHERE domain = 'invoice');

-- NEU-095: a Transfer of Funds routes to the Executive manager (Mark Javier) to process.
INSERT INTO public.routing_rules (id, domain, label, trigger, authority, priority, active)
SELECT gen_random_uuid(), 'evoucher', 'Transfer of Funds → Executive manager (Mark Javier)',
       '{"transaction_type":"fund_transfer"}'::jsonb, '{"department":"Executive","role":"manager"}'::jsonb, 5, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.routing_rules
  WHERE domain = 'evoucher' AND trigger ->> 'transaction_type' = 'fund_transfer'
);
