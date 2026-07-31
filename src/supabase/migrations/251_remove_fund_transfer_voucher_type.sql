-- Migration 251: remove the fund_transfer e-voucher type.
--
-- Phase 3 of docs/ACCOUNTING_REMOVAL_PLAN.md.
--
-- A bank-to-bank transfer is the only voucher type that is neither
-- booking-linked nor a direct/office expense: it moves money sideways and
-- changes no booking's position. buildTransferEntry resolved its From/To
-- against the `accounts` table, so the type only ever made sense while a
-- General Journal existed. It leaves with the thing that created it.
--
-- Drops the NEU-095 routing rule (Transfer of Funds -> Executive manager,
-- migration 246) and the transfer vouchers themselves. Marcus confirmed the
-- rows are disposable.
--
-- Idempotent and re-runnable.

DELETE FROM public.routing_rules
WHERE domain = 'evoucher'
  AND trigger->>'transaction_type' = 'fund_transfer';

DELETE FROM public.evoucher_history
WHERE evoucher_id IN (SELECT id FROM public.evouchers WHERE transaction_type = 'fund_transfer');

DELETE FROM public.evoucher_line_items
WHERE evoucher_id IN (SELECT id FROM public.evouchers WHERE transaction_type = 'fund_transfer');

DELETE FROM public.evouchers WHERE transaction_type = 'fund_transfer';
