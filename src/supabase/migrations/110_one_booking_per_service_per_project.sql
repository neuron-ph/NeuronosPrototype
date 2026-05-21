-- 110_one_booking_per_service_per_project.sql
-- Enforce the rule: a project may have AT MOST ONE booking per service type.
--
-- This supersedes the prior "multi-booking-per-type" allowance (split-shipment
-- workflow). Two Forwarding / Brokerage / etc. bookings under the same project
-- are no longer permitted. Split shipments must live in separate projects.
--
-- Scope: only constrains project-linked bookings. Contract-only bookings
-- (project_id IS NULL, contract_id IS NOT NULL) remain unrestricted — contracts
-- intentionally hold many bookings over time.

create unique index if not exists bookings_one_per_service_per_project
  on public.bookings (project_id, service_type)
  where project_id is not null;
