-- Record Visibility V2 — Phase 1 (additive schema, behavior-neutral).
-- Spec/contract: docs/PLAN_RECORD_VISIBILITY_V2_2026-06.md (§7.3, §8 Phase 1).
--
-- Adds the single `confidential` boolean (the ONLY source of "restricted";
-- §2 of the spec) to the in-scope shared record types, plus the indexes the
-- Phase 2 reach-set function will lean on. NOTHING changes behavior here:
-- no policy is touched, and confidential defaults to false everywhere, so the
-- model is dormant until Phase 3 flips the policies. Idempotent (IF NOT EXISTS).
--
-- Already-present indexes (verified Phase 0, not recreated): bookings.handler_id,
-- contract_id, project_id, customer_id; projects.handler_id, quotation_id,
-- customer_id; quotations.assigned_to, customer_id; customers.owner_id;
-- contacts.customer_id; booking_assignments.user_id/booking_id.

-- 1. confidential flag (default false → nothing hidden on launch).
alter table public.bookings   add column if not exists confidential boolean not null default false;
alter table public.projects   add column if not exists confidential boolean not null default false;
alter table public.quotations add column if not exists confidential boolean not null default false;
alter table public.customers  add column if not exists confidential boolean not null default false;
alter table public.contacts   add column if not exists confidential boolean not null default false;

-- 2. Partial indexes over restricted rows only (tiny; restricted is the minority).
create index if not exists idx_bookings_confidential   on public.bookings   (id) where confidential = true;
create index if not exists idx_projects_confidential   on public.projects   (id) where confidential = true;
create index if not exists idx_quotations_confidential on public.quotations (id) where confidential = true;
create index if not exists idx_customers_confidential  on public.customers  (id) where confidential = true;
create index if not exists idx_contacts_confidential   on public.contacts   (id) where confidential = true;

-- 3. Missing direct-participant indexes (§5b) for the reach-set function.
create index if not exists idx_bookings_created_by   on public.bookings   (created_by);
create index if not exists idx_bookings_manager      on public.bookings   (manager_id);
create index if not exists idx_bookings_supervisor   on public.bookings   (supervisor_id);
create index if not exists idx_projects_created_by   on public.projects   (created_by);
create index if not exists idx_projects_manager      on public.projects   (manager_id);
create index if not exists idx_projects_supervisor   on public.projects   (supervisor_id);
create index if not exists idx_quotations_created_by on public.quotations (created_by);
create index if not exists idx_quotations_prepared_by on public.quotations (prepared_by);
create index if not exists idx_customers_created_by  on public.customers  (created_by);
create index if not exists idx_contacts_created_by   on public.contacts   (created_by);

-- 4. Missing enumerated link-path index (§5): quotation → contact.
create index if not exists idx_quotations_contact on public.quotations (contact_id);
