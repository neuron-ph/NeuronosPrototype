-- ============================================================
-- Neuron OS — Dev Database Setup Script
-- Generated from migrations 001–026
-- Apply this entire file in the Supabase SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- MIGRATION 001: Full Schema
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- NEURON OS — Full Relational Schema Migration
-- ============================================================================
-- Target: Supabase project ubspbukgcxmzegnomlgi (fresh database)
-- Replaces: kv_store_c142e950 (47 KV prefixes -> 35 normalized tables)
-- Generated: 2026-03-13
-- ============================================================================

-- ============================================================================
-- PHASE 1: FOUNDATION — Extensions, Helpers, Core Identity
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Helper: auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper macro: attach the trigger to a table
-- Usage: SELECT add_updated_at_trigger('table_name');
CREATE OR REPLACE FUNCTION add_updated_at_trigger(tbl TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format(
    'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
    tbl, tbl
  );
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------
-- 1. users
-- KV prefix: user:
-- --------------------------------------------------------------------------
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT,
  role          TEXT,                -- 'Admin','Manager','Operations','Accounting','BD','HR','Executive'
  department    TEXT,                -- 'Executive','Operations','Accounting','Business Development','HR','IT'
  avatar        TEXT,                -- URL or initials
  phone         TEXT,
  permissions   TEXT[] DEFAULT '{}', -- array of permission strings
  status        TEXT DEFAULT 'Active',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('users');

-- --------------------------------------------------------------------------
-- 2. settings
-- KV prefix: settings:* (e.g. settings:transaction-view)
-- --------------------------------------------------------------------------
CREATE TABLE settings (
  key           TEXT PRIMARY KEY,    -- e.g. 'transaction-view'
  value         JSONB NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 3. counters
-- KV keys: trucking_booking_counter, brokerage_booking_counter, etc.
-- --------------------------------------------------------------------------
CREATE TABLE counters (
  key           TEXT PRIMARY KEY,    -- e.g. 'trucking_booking_counter'
  value         INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT now()
);


-- ============================================================================
-- PHASE 2: CRM
-- ============================================================================

-- --------------------------------------------------------------------------
-- 4. customers
-- KV prefix: customer:
-- --------------------------------------------------------------------------
CREATE TABLE customers (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  industry          TEXT,            -- 'Garments','Automobile','Energy','Food & Beverage', etc.
  client_type       TEXT,            -- 'Local','International'
  status            TEXT DEFAULT 'Active',  -- 'Prospect','Active','Inactive'
  registered_address TEXT,
  phone             TEXT,
  email             TEXT,
  website           TEXT,
  credit_terms      TEXT,
  payment_terms     TEXT,
  lead_source       TEXT,
  owner_id          TEXT REFERENCES users(id) ON DELETE SET NULL,
  notes             TEXT,
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('customers');

-- --------------------------------------------------------------------------
-- 5. contacts
-- KV prefix: contact:
-- --------------------------------------------------------------------------
CREATE TABLE contacts (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  title         TEXT,                -- job title
  email         TEXT,
  phone         TEXT,
  customer_id   TEXT REFERENCES customers(id) ON DELETE SET NULL,
  is_primary    BOOLEAN DEFAULT false,
  lifecycle_stage TEXT,              -- 'Lead','Customer','MQL','SQL'
  lead_status   TEXT,
  owner_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  notes         TEXT,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('contacts');

-- --------------------------------------------------------------------------
-- 6. consignees
-- KV prefix: consignee:
-- --------------------------------------------------------------------------
CREATE TABLE consignees (
  id              TEXT PRIMARY KEY,
  customer_id     TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  address         TEXT,
  tin             TEXT,              -- Tax ID Number
  contact_person  TEXT,
  email           TEXT,
  phone           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('consignees');

-- --------------------------------------------------------------------------
-- 7. client_handler_preferences
-- KV prefix: client-handler-preference:
-- --------------------------------------------------------------------------
CREATE TABLE client_handler_preferences (
  id                        TEXT PRIMARY KEY,
  customer_id               TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_type              TEXT NOT NULL,   -- 'Forwarding','Brokerage','Trucking','Marine Insurance','Others'
  preferred_manager_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  preferred_manager_name    TEXT,
  preferred_supervisor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  preferred_supervisor_name TEXT,
  preferred_handler_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  preferred_handler_name    TEXT,
  priority                  INTEGER DEFAULT 0,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('client_handler_preferences');

-- --------------------------------------------------------------------------
-- 8. tasks
-- KV prefix: task:
-- --------------------------------------------------------------------------
CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  type          TEXT,                -- 'To-do','Call','Email','Meeting','SMS','Viber','WeChat','WhatsApp','LinkedIn'
  due_date      TIMESTAMPTZ,
  priority      TEXT DEFAULT 'Medium', -- 'Low','Medium','High'
  status        TEXT DEFAULT 'Ongoing', -- 'Ongoing','Pending','Completed','Cancelled'
  cancel_reason TEXT,                -- 'Reschedule','Others'
  remarks       TEXT,
  contact_id    TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  customer_id   TEXT REFERENCES customers(id) ON DELETE SET NULL,
  owner_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_to   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('tasks');

-- --------------------------------------------------------------------------
-- 9. crm_activities
-- KV prefix: activity:  (CRM activities — NOT the system audit log)
-- --------------------------------------------------------------------------
CREATE TABLE crm_activities (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,       -- 'Call Logged','Email Logged','Meeting Logged','Note','System Update', etc.
  description   TEXT,
  date          TIMESTAMPTZ,
  contact_id    TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  customer_id   TEXT REFERENCES customers(id) ON DELETE SET NULL,
  task_id       TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  attachments   JSONB DEFAULT '[]',  -- [{name, size, type, url}]
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('crm_activities');

-- --------------------------------------------------------------------------
-- 10. budget_requests
-- KV prefix: budget_request:
-- --------------------------------------------------------------------------
CREATE TABLE budget_requests (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT,
  amount          NUMERIC(15,2) DEFAULT 0,
  currency        TEXT DEFAULT 'PHP',
  status          TEXT DEFAULT 'Pending',  -- 'Pending','Approved','Rejected','Disbursed'
  category        TEXT,
  requested_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  customer_id     TEXT REFERENCES customers(id) ON DELETE SET NULL,
  project_id      TEXT,              -- FK added after projects table exists
  notes           TEXT,
  attachments     JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('budget_requests');


-- ============================================================================
-- PHASE 3: PRICING & VENDORS
-- ============================================================================

-- --------------------------------------------------------------------------
-- 11. service_providers  (MERGED: vendor: + partner:)
-- KV prefixes: vendor:, partner:, vendor_line_items:{id}, vendor_charge_categories:{id}
-- --------------------------------------------------------------------------
CREATE TABLE service_providers (
  id                TEXT PRIMARY KEY,
  provider_type     TEXT NOT NULL,    -- 'overseas_agent','local_agent','subcontractor','shipping_line','forwarder','trucker','broker'
  company_name      TEXT NOT NULL,
  country           TEXT,
  territory         TEXT,
  wca_number        TEXT,
  contact_person    TEXT,
  contact_email     TEXT,
  contact_phone     TEXT,
  address           TEXT,
  emails            TEXT[] DEFAULT '{}',  -- partner: stores multiple emails
  services          TEXT[] DEFAULT '{}',  -- ['Forwarding','Brokerage','Trucking','Marine Insurance']
  charge_categories JSONB DEFAULT '[]',   -- saved rate card categories (merges vendor_charge_categories:{id} + partner.charge_categories)
  line_items        JSONB DEFAULT '[]',   -- saved rate line items (merges vendor_line_items:{id})
  total_shipments   INTEGER DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('service_providers');

-- --------------------------------------------------------------------------
-- 12. catalog_categories
-- KV prefix: catalog_category:
-- --------------------------------------------------------------------------
CREATE TABLE catalog_categories (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  sort_order    INTEGER DEFAULT 0,
  is_default    BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('catalog_categories');

-- --------------------------------------------------------------------------
-- 13. catalog_items
-- KV prefix: catalog_item:
-- --------------------------------------------------------------------------
CREATE TABLE catalog_items (
  id              TEXT PRIMARY KEY,
  category_id     TEXT REFERENCES catalog_categories(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  default_price   NUMERIC(15,2) DEFAULT 0,
  currency        TEXT DEFAULT 'PHP',
  unit_type       TEXT,              -- 'per_cbm','per_container','per_shipment','per_kg','flat_fee','per_bl','per_set'
  tax_code        TEXT,              -- 'VAT','NVAT','ZR'
  is_active       BOOLEAN DEFAULT true,
  service_types   TEXT[] DEFAULT '{}', -- which service types this item applies to
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('catalog_items');


-- ============================================================================
-- PHASE 4: QUOTATIONS & CONTRACTS
-- ============================================================================

-- --------------------------------------------------------------------------
-- 14. quotations  (includes contracts: quotation_type = 'contract')
-- KV prefix: quotation:
-- --------------------------------------------------------------------------
CREATE TABLE quotations (
  id                  TEXT PRIMARY KEY,
  quotation_number    TEXT,
  quotation_type      TEXT NOT NULL DEFAULT 'standard', -- 'standard','contract'

  -- Customer / contact references
  customer_id         TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name       TEXT,            -- denormalized for fast display
  contact_id          TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  contact_name        TEXT,
  consignee_id        TEXT REFERENCES consignees(id) ON DELETE SET NULL,

  -- Quotation content
  services            TEXT[] DEFAULT '{}',  -- ['Forwarding','Brokerage']
  services_metadata   JSONB DEFAULT '[]',   -- detailed service specs per service type
  pricing             JSONB DEFAULT '{}',   -- full pricing breakdown (categories, line items, totals)
  vendors             JSONB DEFAULT '[]',   -- vendor selections for this quotation

  -- Workflow
  status              TEXT DEFAULT 'Draft', -- 'Draft','Sent','Accepted','Rejected','Cancelled','Converted'
  validity_date       TIMESTAMPTZ,
  created_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by_name     TEXT,
  assigned_to         TEXT REFERENCES users(id) ON DELETE SET NULL,

  -- Contract-specific fields (NULL for standard quotations)
  contract_status     TEXT,            -- 'Active','Expiring','Expired','Renewed','Terminated'
  contract_start_date TIMESTAMPTZ,
  contract_end_date   TIMESTAMPTZ,
  renewal_terms       TEXT,
  auto_renew          BOOLEAN DEFAULT false,
  contract_notes      TEXT,
  parent_contract_id  TEXT REFERENCES quotations(id) ON DELETE SET NULL,  -- for renewals

  -- Financial summary (denormalized)
  total_selling       NUMERIC(15,2) DEFAULT 0,
  total_buying        NUMERIC(15,2) DEFAULT 0,
  currency            TEXT DEFAULT 'PHP',

  -- Metadata
  notes               TEXT,
  internal_notes      TEXT,
  tags                TEXT[] DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('quotations');

-- --------------------------------------------------------------------------
-- 15. contract_bookings  (join table: contract <-> booking)
-- Tracks which bookings are linked to a contract
-- --------------------------------------------------------------------------
CREATE TABLE contract_bookings (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  contract_id     TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  booking_id      TEXT NOT NULL,      -- FK added after bookings table exists
  service_type    TEXT,
  linked_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contract_id, booking_id)
);

-- --------------------------------------------------------------------------
-- 16. contract_activity
-- KV prefix: contract_activity:{contractId}:{timestamp}
-- --------------------------------------------------------------------------
CREATE TABLE contract_activity (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  contract_id     TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,      -- 'created','renewed','terminated','status_change','booking_linked', etc.
  description     TEXT,
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_name       TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 17. contract_attachments
-- KV prefix: contract_attachment:{contractId}:{attachmentId}
-- --------------------------------------------------------------------------
CREATE TABLE contract_attachments (
  id              TEXT PRIMARY KEY,
  contract_id     TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  file_name       TEXT NOT NULL,
  file_type       TEXT,
  file_size       INTEGER,
  file_url        TEXT,              -- storage URL or base64
  uploaded_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  uploaded_by_name TEXT,
  description     TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);


-- ============================================================================
-- PHASE 5: PROJECTS & BOOKINGS
-- ============================================================================

-- --------------------------------------------------------------------------
-- 18. projects
-- KV prefix: project:
-- --------------------------------------------------------------------------
CREATE TABLE projects (
  id                TEXT PRIMARY KEY,
  project_number    TEXT UNIQUE,      -- human-readable: PRJ-2026-001
  quotation_id      TEXT REFERENCES quotations(id) ON DELETE SET NULL,
  customer_id       TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name     TEXT,             -- denormalized
  consignee_id      TEXT REFERENCES consignees(id) ON DELETE SET NULL,

  -- Project details
  status            TEXT DEFAULT 'Active', -- 'Active','Completed','On Hold','Cancelled'
  services          TEXT[] DEFAULT '{}',
  service_type      TEXT,             -- primary service type

  -- Team assignment
  manager_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  manager_name      TEXT,
  supervisor_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  supervisor_name   TEXT,
  handler_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  handler_name      TEXT,
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by_name   TEXT,

  -- Metadata
  notes             TEXT,
  tags              TEXT[] DEFAULT '{}',
  metadata          JSONB DEFAULT '{}',  -- flexible extra fields
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('projects');

-- Now add the FK on budget_requests
ALTER TABLE budget_requests
  ADD CONSTRAINT fk_budget_requests_project
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

-- --------------------------------------------------------------------------
-- 19. bookings  (UNIFIED: booking: + forwarding_booking: + trucking_booking:
--                + brokerage_booking: + marine_insurance_booking: + others_booking:)
-- --------------------------------------------------------------------------
CREATE TABLE bookings (
  id                TEXT PRIMARY KEY,
  booking_number    TEXT,             -- human-readable: FWD-001, TRK-001, BRK-001, etc.
  service_type      TEXT NOT NULL,    -- 'Forwarding','Brokerage','Trucking','Marine Insurance','Others'

  -- Parent references
  project_id        TEXT REFERENCES projects(id) ON DELETE SET NULL,
  contract_id       TEXT REFERENCES quotations(id) ON DELETE SET NULL,
  customer_id       TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name     TEXT,             -- denormalized
  consignee_id      TEXT REFERENCES consignees(id) ON DELETE SET NULL,

  -- Booking status & workflow
  status            TEXT DEFAULT 'Draft',  -- 'Draft','Created','Confirmed','In Transit','Delivered','Completed','Cancelled'

  -- Team assignment
  manager_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  manager_name      TEXT,
  supervisor_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  supervisor_name   TEXT,
  handler_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  handler_name      TEXT,
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,

  -- Shipment quantities (for rate calculation)
  containers        INTEGER DEFAULT 1,
  bls               INTEGER DEFAULT 1,
  sets              INTEGER DEFAULT 1,
  shipments         INTEGER DEFAULT 1,

  -- Service-specific details stored as JSONB
  -- Forwarding: {movement_type, mode, origin, destination, carrier, vessel, voyage, etd, eta, ...}
  -- Brokerage: {entry_type, entry_number, customs_office, ...}
  -- Trucking: {pickup_address, delivery_address, truck_type, plate_number, driver, ...}
  -- Marine Insurance: {policy_number, insured_value, premium, coverage_type, ...}
  -- Others: {description, ...}
  details           JSONB DEFAULT '{}',

  -- Financial summary (denormalized for list views)
  total_revenue     NUMERIC(15,2) DEFAULT 0,
  total_cost        NUMERIC(15,2) DEFAULT 0,

  -- Applied rates (from contract rate engine)
  applied_rates     JSONB DEFAULT '[]',

  -- Metadata
  notes             TEXT,
  tags              TEXT[] DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('bookings');

-- Now add the FK on contract_bookings
ALTER TABLE contract_bookings
  ADD CONSTRAINT fk_contract_bookings_booking
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;

-- --------------------------------------------------------------------------
-- 20. project_bookings  (join table: project <-> booking with metadata)
-- Derived from project.linkedBookings[] array in KV
-- --------------------------------------------------------------------------
CREATE TABLE project_bookings (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  booking_id      TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_type    TEXT,
  linked_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, booking_id)
);

-- --------------------------------------------------------------------------
-- 21. project_attachments
-- KV prefix: project_attachment:{projectId}:{attachmentId}
-- --------------------------------------------------------------------------
CREATE TABLE project_attachments (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name         TEXT NOT NULL,
  file_type         TEXT,
  file_size         INTEGER,
  file_url          TEXT,
  uploaded_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  uploaded_by_name  TEXT,
  description       TEXT,
  category          TEXT,            -- 'document','image','spreadsheet','other'
  created_at        TIMESTAMPTZ DEFAULT now()
);


-- ============================================================================
-- PHASE 6: FINANCIAL — Billing & Collections
-- ============================================================================

-- --------------------------------------------------------------------------
-- 22. evouchers
-- KV prefix: evoucher:
-- --------------------------------------------------------------------------
CREATE TABLE evouchers (
  id                  TEXT PRIMARY KEY,
  evoucher_number     TEXT,

  -- Type & source
  transaction_type    TEXT,           -- 'expense','budget_request','cash_advance','collection','billing','adjustment','reimbursement'
  source_module       TEXT,           -- 'bd','operations','accounting','pricing','hr','executive'
  voucher_type        TEXT,           -- 'AR','AP' (Accounts Receivable / Payable)

  -- References
  booking_id          TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  project_id          TEXT REFERENCES projects(id) ON DELETE SET NULL,
  project_number      TEXT,
  contract_id         TEXT REFERENCES quotations(id) ON DELETE SET NULL,
  customer_id         TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name       TEXT,

  -- Vendor / payee
  vendor_name         TEXT,
  vendor_id           TEXT REFERENCES service_providers(id) ON DELETE SET NULL,

  -- Financial
  amount              NUMERIC(15,2) DEFAULT 0,
  currency            TEXT DEFAULT 'PHP',
  payment_method      TEXT,           -- 'Cash','Check','Bank Transfer','Online'
  credit_terms        TEXT,
  description         TEXT,
  purpose             TEXT,

  -- Workflow
  status              TEXT DEFAULT 'draft', -- 'draft','pending','posted','rejected','cancelled','Submitted','Approved','Disbursed', etc.
  submitted_at        TIMESTAMPTZ,
  approved_at         TIMESTAMPTZ,
  posted_at           TIMESTAMPTZ,

  -- Approvers chain (JSONB array)
  approvers           JSONB DEFAULT '[]',   -- [{user_id, user_name, role, status, timestamp, remarks}]

  -- Accounting linkage
  journal_entry_id    TEXT,           -- FK added after journal_entries table
  draft_transaction_id TEXT,          -- FK added after transactions table
  gl_category         TEXT,
  gl_sub_category     TEXT,

  -- Liquidation (for cash advances)
  liquidation         JSONB,          -- {amount, date, receipts, status, ...}

  -- Metadata
  attachments         JSONB DEFAULT '[]',
  notes               TEXT,
  created_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by_name     TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('evouchers');

-- --------------------------------------------------------------------------
-- 23. evoucher_history
-- KV prefix: evoucher_history:{evoucherId}:{historyId}
-- --------------------------------------------------------------------------
CREATE TABLE evoucher_history (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  evoucher_id     TEXT NOT NULL REFERENCES evouchers(id) ON DELETE CASCADE,
  action          TEXT NOT NULL,     -- 'created','submitted','approved','rejected','posted','cancelled'
  status          TEXT,
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_name       TEXT,
  user_role       TEXT,
  remarks         TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 24. invoices
-- KV prefix: billing: (records that HAVE billing_item_ids — parent invoice docs)
-- --------------------------------------------------------------------------
CREATE TABLE invoices (
  id                TEXT PRIMARY KEY,
  invoice_number    TEXT UNIQUE,      -- INV-2026-001
  invoice_date      TIMESTAMPTZ DEFAULT now(),

  -- References
  booking_id        TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  booking_ids       TEXT[] DEFAULT '{}',  -- multiple bookings per invoice
  project_id        TEXT REFERENCES projects(id) ON DELETE SET NULL,
  project_number    TEXT,
  customer_id       TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name     TEXT,
  service_types     TEXT[] DEFAULT '{}',

  -- Financial
  subtotal          NUMERIC(15,2) DEFAULT 0,
  tax_amount        NUMERIC(15,2) DEFAULT 0,
  total_amount      NUMERIC(15,2) DEFAULT 0,
  currency          TEXT DEFAULT 'PHP',

  -- Status
  status            TEXT DEFAULT 'draft', -- 'draft','sent','posted','paid','void'
  posted            BOOLEAN DEFAULT false,
  posted_at         TIMESTAMPTZ,

  -- Accounting linkage
  journal_entry_id  TEXT,
  evoucher_id       TEXT REFERENCES evouchers(id) ON DELETE SET NULL,

  -- Line item references (for migration tracking)
  billing_item_ids  TEXT[] DEFAULT '{}',

  -- Metadata
  notes             TEXT,
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('invoices');

-- --------------------------------------------------------------------------
-- 25. billing_line_items
-- KV prefixes: billing: (records WITHOUT billing_item_ids) + billing_item:
-- --------------------------------------------------------------------------
CREATE TABLE billing_line_items (
  id                TEXT PRIMARY KEY,
  invoice_id        TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  invoice_number    TEXT,

  -- Parent references
  booking_id        TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  project_id        TEXT REFERENCES projects(id) ON DELETE SET NULL,
  evoucher_id       TEXT REFERENCES evouchers(id) ON DELETE SET NULL,

  -- Charge details
  description       TEXT,
  charge_type       TEXT,            -- 'revenue','cost','expense'
  category          TEXT,            -- 'Origin Charges','Freight','Destination Charges','Government'
  service_type      TEXT,            -- 'Forwarding','Brokerage','Trucking','Marine Insurance','Others'
  customer_name     TEXT,
  project_number    TEXT,

  -- Financial
  amount            NUMERIC(15,2) DEFAULT 0,
  quantity          NUMERIC(15,4) DEFAULT 1,
  unit_price        NUMERIC(15,4) DEFAULT 0,
  currency          TEXT DEFAULT 'PHP',
  unit_type         TEXT,            -- 'per_cbm','per_container','per_shipment','per_bl','per_set','flat_fee'

  -- Tax
  is_taxed          BOOLEAN DEFAULT false,
  tax_code          TEXT,
  tax_amount        NUMERIC(15,2) DEFAULT 0,

  -- Status
  status            TEXT DEFAULT 'active',

  -- Catalog linkage
  catalog_item_id   TEXT REFERENCES catalog_items(id) ON DELETE SET NULL,

  -- Metadata
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('billing_line_items');

-- --------------------------------------------------------------------------
-- 26. collections
-- KV prefix: collection:
-- --------------------------------------------------------------------------
CREATE TABLE collections (
  id                  TEXT PRIMARY KEY,
  collection_number   TEXT,

  -- References
  booking_id          TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  booking_ids         TEXT[] DEFAULT '{}',
  project_id          TEXT REFERENCES projects(id) ON DELETE SET NULL,
  project_number      TEXT,
  customer_id         TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name       TEXT,
  invoice_id          TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  evoucher_id         TEXT REFERENCES evouchers(id) ON DELETE SET NULL,
  service_types       TEXT[] DEFAULT '{}',

  -- Financial
  amount              NUMERIC(15,2) DEFAULT 0,
  currency            TEXT DEFAULT 'PHP',
  payment_method      TEXT,
  reference_number    TEXT,           -- check number, bank ref, etc.
  collection_date     TIMESTAMPTZ,

  -- Status
  status              TEXT DEFAULT 'pending', -- 'pending','posted','void'
  posted              BOOLEAN DEFAULT false,
  posted_at           TIMESTAMPTZ,

  -- Accounting linkage
  journal_entry_id    TEXT,

  -- Metadata
  notes               TEXT,
  created_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('collections');

-- --------------------------------------------------------------------------
-- 27. expenses
-- KV prefix: expense:
-- --------------------------------------------------------------------------
CREATE TABLE expenses (
  id                TEXT PRIMARY KEY,

  -- References
  booking_id        TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  project_id        TEXT REFERENCES projects(id) ON DELETE SET NULL,
  project_number    TEXT,
  evoucher_id       TEXT REFERENCES evouchers(id) ON DELETE SET NULL,
  customer_name     TEXT,

  -- Expense details
  description       TEXT,
  category          TEXT,            -- 'Brokerage','Trucking','Documentation','Handling','Government','Other'
  charge_type       TEXT,            -- 'cost','expense'
  service_type      TEXT,

  -- Financial
  amount            NUMERIC(15,2) DEFAULT 0,
  quantity          NUMERIC(15,4) DEFAULT 1,
  unit_price        NUMERIC(15,4) DEFAULT 0,
  currency          TEXT DEFAULT 'PHP',
  unit_type         TEXT,

  -- Tax
  is_taxed          BOOLEAN DEFAULT false,
  tax_code          TEXT,

  -- Status
  status            TEXT DEFAULT 'active',

  -- Catalog linkage
  catalog_item_id   TEXT REFERENCES catalog_items(id) ON DELETE SET NULL,

  -- Metadata
  vendor_name       TEXT,
  receipt_number    TEXT,
  notes             TEXT,
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('expenses');


-- ============================================================================
-- PHASE 7: ACCOUNTING & GL
-- ============================================================================

-- --------------------------------------------------------------------------
-- 28. accounts  (MERGED: account: + accounting:account:)
-- Chart of Accounts
-- --------------------------------------------------------------------------
CREATE TABLE accounts (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,  -- '1000','1100','2000', etc.
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,      -- 'Asset','Liability','Equity','Revenue','Expense'
  sub_type        TEXT,               -- 'Current Asset','Fixed Asset','Long-term Liability', etc.
  category        TEXT,               -- GL category
  sub_category    TEXT,               -- GL sub-category
  description     TEXT,
  parent_id       TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  balance         NUMERIC(15,2) DEFAULT 0,
  normal_balance  TEXT DEFAULT 'debit', -- 'debit','credit'
  is_active       BOOLEAN DEFAULT true,
  is_system       BOOLEAN DEFAULT false, -- system-generated, cannot delete
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('accounts');

-- --------------------------------------------------------------------------
-- 29. journal_entries
-- KV prefix: journal_entry:
-- --------------------------------------------------------------------------
CREATE TABLE journal_entries (
  id                TEXT PRIMARY KEY,
  entry_number      TEXT,
  entry_date        TIMESTAMPTZ DEFAULT now(),

  -- Source references
  evoucher_id       TEXT REFERENCES evouchers(id) ON DELETE SET NULL,
  invoice_id        TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  collection_id     TEXT REFERENCES collections(id) ON DELETE SET NULL,
  booking_id        TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  project_number    TEXT,
  customer_name     TEXT,

  -- Entry details
  description       TEXT,
  reference         TEXT,

  -- Lines stored as JSONB (each line: {account_id, account_code, account_name, debit, credit, description})
  lines             JSONB DEFAULT '[]',

  -- Totals
  total_debit       NUMERIC(15,2) DEFAULT 0,
  total_credit      NUMERIC(15,2) DEFAULT 0,

  -- Status
  status            TEXT DEFAULT 'posted', -- 'draft','posted','void'

  -- Metadata
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('journal_entries');

-- Now add the FK on evouchers
ALTER TABLE evouchers
  ADD CONSTRAINT fk_evouchers_journal_entry
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL;

-- --------------------------------------------------------------------------
-- 30. transactions
-- KV prefix: accounting:txn:
-- --------------------------------------------------------------------------
CREATE TABLE transactions (
  id              TEXT PRIMARY KEY,
  date            TIMESTAMPTZ DEFAULT now(),

  -- Account references
  debit_account_id  TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  credit_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,

  -- Details
  description     TEXT,
  reference       TEXT,
  amount          NUMERIC(15,2) DEFAULT 0,
  type            TEXT,              -- transaction type
  category        TEXT,

  -- Source
  journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
  evoucher_id     TEXT REFERENCES evouchers(id) ON DELETE SET NULL,

  -- Status
  status          TEXT DEFAULT 'completed',
  is_reconciled   BOOLEAN DEFAULT false,

  -- Metadata
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('transactions');

-- Now add the FK on evouchers for draft_transaction_id
ALTER TABLE evouchers
  ADD CONSTRAINT fk_evouchers_draft_transaction
  FOREIGN KEY (draft_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;

-- FK on invoices for journal_entry_id
ALTER TABLE invoices
  ADD CONSTRAINT fk_invoices_journal_entry
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL;

-- FK on collections for journal_entry_id
ALTER TABLE collections
  ADD CONSTRAINT fk_collections_journal_entry
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL;


-- ============================================================================
-- PHASE 8: SUPPORT & SYSTEM
-- ============================================================================

-- --------------------------------------------------------------------------
-- 31. ticket_types
-- KV prefix: ticket_type:
-- --------------------------------------------------------------------------
CREATE TABLE ticket_types (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  prefix          TEXT,              -- 'TKT','BUG','REQ', etc.
  color           TEXT,
  icon            TEXT,
  is_active       BOOLEAN DEFAULT true,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('ticket_types');

-- --------------------------------------------------------------------------
-- 32. tickets
-- KV prefix: ticket:
-- --------------------------------------------------------------------------
CREATE TABLE tickets (
  id              TEXT PRIMARY KEY,
  ticket_number   TEXT,              -- TKT-2026-001
  ticket_type     TEXT REFERENCES ticket_types(id) ON DELETE SET NULL,

  -- Content
  title           TEXT NOT NULL,
  description     TEXT,
  priority        TEXT DEFAULT 'Medium', -- 'Low','Medium','High','Urgent'
  status          TEXT DEFAULT 'Open',   -- 'Open','In Progress','Resolved','Closed','Reopened'

  -- Assignment
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  assigned_to     TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_name TEXT,
  department      TEXT,

  -- Entity linkage (ticket can reference any entity)
  entity_type     TEXT,              -- 'booking','project','quotation','customer', etc.
  entity_id       TEXT,

  -- Resolution
  resolution      TEXT,
  resolved_at     TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,

  -- Metadata
  tags            TEXT[] DEFAULT '{}',
  attachments     JSONB DEFAULT '[]',
  comment_count   INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('tickets');

-- --------------------------------------------------------------------------
-- 33. comments  (POLYMORPHIC: ticket_comment: + inquiry_comment: + booking_comment:)
-- --------------------------------------------------------------------------
CREATE TABLE comments (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  entity_type     TEXT NOT NULL,      -- 'ticket','quotation','booking'
  entity_id       TEXT NOT NULL,      -- ID of the parent entity

  -- Content
  content         TEXT,
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_name       TEXT,
  user_department TEXT,
  user_avatar     TEXT,

  -- Attachments
  attachments     JSONB DEFAULT '[]',

  -- Metadata
  is_internal     BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('comments');

-- --------------------------------------------------------------------------
-- 34. activity_log  (MERGED: activity_log: + ticket_activity: + quotation_activity: + booking_activity:)
-- System audit trail — NOT CRM activities
-- --------------------------------------------------------------------------
CREATE TABLE activity_log (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  entity_type     TEXT NOT NULL,      -- 'ticket','quotation','booking','project','evoucher','customer', etc.
  entity_id       TEXT NOT NULL,
  entity_name     TEXT,              -- human-readable name/number for display

  -- Action
  action_type     TEXT NOT NULL,      -- 'created','updated','status_change','assigned','commented','deleted', etc.
  old_value       TEXT,
  new_value       TEXT,

  -- Actor
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_name       TEXT,
  user_department TEXT,

  -- Extra context
  metadata        JSONB DEFAULT '{}',

  -- Timestamp (using created_at, no updated_at since audit logs are immutable)
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 35. saved_reports
-- KV prefix: saved_report:{userId}:{reportId}
-- --------------------------------------------------------------------------
CREATE TABLE saved_reports (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  report_type     TEXT,              -- template identifier
  config          JSONB DEFAULT '{}', -- filters, date ranges, groupings, etc.
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
SELECT add_updated_at_trigger('saved_reports');


-- ============================================================================
-- PHASE 9: INDEXES
-- ============================================================================

-- === customers ===
CREATE INDEX idx_customers_name ON customers(name);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_owner ON customers(owner_id);

-- === contacts ===
CREATE INDEX idx_contacts_customer ON contacts(customer_id);
CREATE INDEX idx_contacts_name ON contacts(name);

-- === consignees ===
CREATE INDEX idx_consignees_customer ON consignees(customer_id);

-- === client_handler_preferences ===
CREATE INDEX idx_chp_customer_service ON client_handler_preferences(customer_id, service_type);

-- === tasks ===
CREATE INDEX idx_tasks_customer ON tasks(customer_id);
CREATE INDEX idx_tasks_contact ON tasks(contact_id);
CREATE INDEX idx_tasks_owner ON tasks(owner_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due ON tasks(due_date);

-- === crm_activities ===
CREATE INDEX idx_crm_activities_customer ON crm_activities(customer_id);
CREATE INDEX idx_crm_activities_contact ON crm_activities(contact_id);
CREATE INDEX idx_crm_activities_user ON crm_activities(user_id);
CREATE INDEX idx_crm_activities_date ON crm_activities(date DESC);

-- === budget_requests ===
CREATE INDEX idx_budget_requests_customer ON budget_requests(customer_id);
CREATE INDEX idx_budget_requests_status ON budget_requests(status);

-- === service_providers ===
CREATE INDEX idx_sp_type ON service_providers(provider_type);
CREATE INDEX idx_sp_country ON service_providers(country);
CREATE INDEX idx_sp_company_name ON service_providers(company_name);

-- === catalog_items ===
CREATE INDEX idx_catalog_items_category ON catalog_items(category_id);
CREATE INDEX idx_catalog_items_active ON catalog_items(is_active) WHERE is_active = true;

-- === quotations ===
CREATE INDEX idx_quotations_customer ON quotations(customer_id);
CREATE INDEX idx_quotations_customer_name ON quotations(customer_name);
CREATE INDEX idx_quotations_status ON quotations(status);
CREATE INDEX idx_quotations_type ON quotations(quotation_type);
CREATE INDEX idx_quotations_created ON quotations(created_at DESC);
CREATE INDEX idx_quotations_assigned ON quotations(assigned_to);
-- Partial index: active contracts only (high-value query)
CREATE INDEX idx_quotations_active_contracts
  ON quotations(customer_name, contract_status)
  WHERE quotation_type = 'contract' AND contract_status IN ('Active','Expiring');

-- === contract_bookings ===
CREATE INDEX idx_cb_contract ON contract_bookings(contract_id);
CREATE INDEX idx_cb_booking ON contract_bookings(booking_id);

-- === contract_activity ===
CREATE INDEX idx_ca_contract ON contract_activity(contract_id);
CREATE INDEX idx_ca_created ON contract_activity(created_at DESC);

-- === contract_attachments ===
CREATE INDEX idx_catt_contract ON contract_attachments(contract_id);

-- === projects ===
CREATE INDEX idx_projects_quotation ON projects(quotation_id);
CREATE INDEX idx_projects_customer ON projects(customer_id);
CREATE INDEX idx_projects_customer_name ON projects(customer_name);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_number ON projects(project_number);
CREATE INDEX idx_projects_created ON projects(created_at DESC);
CREATE INDEX idx_projects_handler ON projects(handler_id);

-- === bookings ===
CREATE INDEX idx_bookings_service_type ON bookings(service_type);
CREATE INDEX idx_bookings_project ON bookings(project_id);
CREATE INDEX idx_bookings_contract ON bookings(contract_id);
CREATE INDEX idx_bookings_customer ON bookings(customer_id);
CREATE INDEX idx_bookings_customer_name ON bookings(customer_name);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_created ON bookings(created_at DESC);
CREATE INDEX idx_bookings_handler ON bookings(handler_id);

-- === project_bookings ===
CREATE INDEX idx_pb_project ON project_bookings(project_id);
CREATE INDEX idx_pb_booking ON project_bookings(booking_id);

-- === project_attachments ===
CREATE INDEX idx_patt_project ON project_attachments(project_id);

-- === evouchers ===
CREATE INDEX idx_ev_booking ON evouchers(booking_id);
CREATE INDEX idx_ev_project ON evouchers(project_id);
CREATE INDEX idx_ev_contract ON evouchers(contract_id);
CREATE INDEX idx_ev_customer ON evouchers(customer_id);
CREATE INDEX idx_ev_status ON evouchers(status);
CREATE INDEX idx_ev_type ON evouchers(transaction_type);
CREATE INDEX idx_ev_created ON evouchers(created_at DESC);
CREATE INDEX idx_ev_vendor ON evouchers(vendor_name);

-- === evoucher_history ===
CREATE INDEX idx_evh_evoucher ON evoucher_history(evoucher_id);
CREATE INDEX idx_evh_created ON evoucher_history(created_at DESC);

-- === invoices ===
CREATE INDEX idx_inv_booking ON invoices(booking_id);
CREATE INDEX idx_inv_project ON invoices(project_id);
CREATE INDEX idx_inv_customer ON invoices(customer_id);
CREATE INDEX idx_inv_customer_name ON invoices(customer_name);
CREATE INDEX idx_inv_status ON invoices(status);
CREATE INDEX idx_inv_number ON invoices(invoice_number);
CREATE INDEX idx_inv_evoucher ON invoices(evoucher_id);
CREATE INDEX idx_inv_created ON invoices(created_at DESC);

-- === billing_line_items ===
CREATE INDEX idx_bli_invoice ON billing_line_items(invoice_id);
CREATE INDEX idx_bli_booking ON billing_line_items(booking_id);
CREATE INDEX idx_bli_project ON billing_line_items(project_id);
CREATE INDEX idx_bli_evoucher ON billing_line_items(evoucher_id);
CREATE INDEX idx_bli_service ON billing_line_items(service_type);
CREATE INDEX idx_bli_created ON billing_line_items(created_at DESC);

-- === collections ===
CREATE INDEX idx_col_booking ON collections(booking_id);
CREATE INDEX idx_col_project ON collections(project_id);
CREATE INDEX idx_col_customer ON collections(customer_id);
CREATE INDEX idx_col_invoice ON collections(invoice_id);
CREATE INDEX idx_col_evoucher ON collections(evoucher_id);
CREATE INDEX idx_col_status ON collections(status);
CREATE INDEX idx_col_created ON collections(created_at DESC);

-- === expenses ===
CREATE INDEX idx_exp_booking ON expenses(booking_id);
CREATE INDEX idx_exp_project ON expenses(project_id);
CREATE INDEX idx_exp_evoucher ON expenses(evoucher_id);
CREATE INDEX idx_exp_service ON expenses(service_type);
CREATE INDEX idx_exp_status ON expenses(status);
CREATE INDEX idx_exp_created ON expenses(created_at DESC);

-- === accounts ===
CREATE INDEX idx_acc_type ON accounts(type);
CREATE INDEX idx_acc_parent ON accounts(parent_id);
CREATE INDEX idx_acc_code ON accounts(code);
CREATE INDEX idx_acc_active ON accounts(is_active) WHERE is_active = true;

-- === journal_entries ===
CREATE INDEX idx_je_evoucher ON journal_entries(evoucher_id);
CREATE INDEX idx_je_invoice ON journal_entries(invoice_id);
CREATE INDEX idx_je_collection ON journal_entries(collection_id);
CREATE INDEX idx_je_booking ON journal_entries(booking_id);
CREATE INDEX idx_je_date ON journal_entries(entry_date DESC);
CREATE INDEX idx_je_status ON journal_entries(status);

-- === transactions ===
CREATE INDEX idx_txn_debit ON transactions(debit_account_id);
CREATE INDEX idx_txn_credit ON transactions(credit_account_id);
CREATE INDEX idx_txn_je ON transactions(journal_entry_id);
CREATE INDEX idx_txn_evoucher ON transactions(evoucher_id);
CREATE INDEX idx_txn_date ON transactions(date DESC);

-- === tickets ===
CREATE INDEX idx_tkt_type ON tickets(ticket_type);
CREATE INDEX idx_tkt_status ON tickets(status);
CREATE INDEX idx_tkt_priority ON tickets(priority);
CREATE INDEX idx_tkt_assigned ON tickets(assigned_to);
CREATE INDEX idx_tkt_created_by ON tickets(created_by);
CREATE INDEX idx_tkt_entity ON tickets(entity_type, entity_id);
CREATE INDEX idx_tkt_created ON tickets(created_at DESC);

-- === comments (polymorphic) ===
CREATE INDEX idx_comments_entity ON comments(entity_type, entity_id);
CREATE INDEX idx_comments_user ON comments(user_id);
CREATE INDEX idx_comments_created ON comments(created_at DESC);

-- === activity_log (audit trail) ===
CREATE INDEX idx_al_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_al_user ON activity_log(user_id);
CREATE INDEX idx_al_action ON activity_log(action_type);
CREATE INDEX idx_al_created ON activity_log(created_at DESC);
-- Composite for entity-scoped timeline queries
CREATE INDEX idx_al_entity_timeline ON activity_log(entity_type, entity_id, created_at DESC);

-- === saved_reports ===
CREATE INDEX idx_sr_user ON saved_reports(user_id);


-- ============================================================================
-- PHASE 9b: ROW LEVEL SECURITY
-- ============================================================================
-- Enable RLS on all tables. For now, use permissive policies since the app
-- uses the service-role key during development. These will be tightened
-- when auth is implemented.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_handler_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE evouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE evoucher_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;

-- Permissive policies: allow all operations via service role
-- (These will be replaced with proper user-scoped policies when auth is added)

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'users','settings','counters','customers','contacts','consignees',
      'client_handler_preferences','tasks','crm_activities','budget_requests',
      'service_providers','catalog_categories','catalog_items',
      'quotations','contract_bookings','contract_activity','contract_attachments',
      'projects','bookings','project_bookings','project_attachments',
      'evouchers','evoucher_history','invoices','billing_line_items',
      'collections','expenses','accounts','journal_entries','transactions',
      'ticket_types','tickets','comments','activity_log','saved_reports'
    ])
  LOOP
    EXECUTE format(
      'CREATE POLICY "Allow all for service role" ON %I FOR ALL USING (true) WITH CHECK (true)',
      tbl
    );
  END LOOP;
END $$;


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- 35 tables created across 8 logical tiers:
--
--   Tier 1 — Core Identity:    users, settings, counters
--   Tier 2 — CRM:              customers, contacts, consignees,
--                               client_handler_preferences, tasks,
--                               crm_activities, budget_requests
--   Tier 3 — Pricing/Vendors:  service_providers, catalog_categories, catalog_items
--   Tier 4 — Quotations:       quotations, contract_bookings,
--                               contract_activity, contract_attachments
--   Tier 5 — Projects/Ops:     projects, bookings, project_bookings,
--                               project_attachments
--   Tier 6 — Financial:        evouchers, evoucher_history, invoices,
--                               billing_line_items, collections, expenses
--   Tier 7 — Accounting/GL:    accounts, journal_entries, transactions
--   Tier 8 — Support/System:   ticket_types, tickets, comments,
--                               activity_log, saved_reports
--
-- Key deduplication wins:
--   - 6 booking prefixes → 1 unified bookings table
--   - 2 account prefixes → 1 accounts table
--   - 4 activity prefixes → 1 activity_log table
--   - 2 vendor/partner stores → 1 service_providers table
--   - billing:/billing_item: mixed store → invoices + billing_line_items
--   - 3 comment prefixes → 1 polymorphic comments table
-- ============================================================================


-- ────────────────────────────────────────────────────────────
-- SEED DATA: Catalog Categories (required before migration 007)
-- ────────────────────────────────────────────────────────────
INSERT INTO catalog_categories (id, name, description, sort_order, is_default) VALUES
  ('cat-001', 'Origin Charges',      'Charges incurred at origin port/country',         1, true),
  ('cat-002', 'Freight',             'Ocean/air/land freight charges',                  2, true),
  ('cat-003', 'Destination Charges', 'Charges incurred at destination port/country',    3, true),
  ('cat-004', 'Government Fees',     'Customs duties, taxes, and government charges',   4, true)
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- MIGRATION 002: Schema Adjustments
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- Schema Adjustments — Columns discovered during rewiring
-- ============================================================================
-- These columns exist in KV data but were missed in the initial schema.
-- Run this AFTER 001_full_schema.sql has been applied.
-- ============================================================================

-- === users: additional fields from seed data ===
ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS service_type TEXT;       -- 'Forwarding','Brokerage','Trucking','Marine Insurance','Others'
ALTER TABLE users ADD COLUMN IF NOT EXISTS operations_role TEXT;    -- 'Manager','Supervisor','Handler'

-- Index for operations team lookups (e.g., GET /users?service_type=Trucking&operations_role=Handler)
CREATE INDEX IF NOT EXISTS idx_users_ops_team ON users(service_type, operations_role) WHERE service_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;

-- === customers: additional fields from seed data ===
ALTER TABLE customers ADD COLUMN IF NOT EXISTS status_detail TEXT;  -- 'New','Open','In Progress', etc. (lead_status)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT; -- 'Lead','Customer','MQL','SQL'

-- === quotations: overflow JSONB for flexible KV-like storage ===
-- The KV store quotation records contain many fields (movement, incoterm, carrier,
-- charge_categories, buying_price, selling_price, financial_summary, etc.)
-- Rather than adding 20+ columns, store overflow in a JSONB details column.
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS quote_number TEXT;       -- frontend uses this alias
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS quotation_name TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS contact_person_id TEXT;  -- alias for contact_id
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS project_id TEXT;
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS quotation_date TIMESTAMPTZ;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMPTZ;

-- === projects: overflow JSONB for flexible KV-like storage ===
ALTER TABLE projects ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';

-- === bookings: overflow JSONB + extra filter columns ===
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS movement_type TEXT;    -- 'Import','Export','Domestic'
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS mode TEXT;             -- 'Sea','Air','Land'

-- === evouchers: overflow JSONB + extra filter columns ===
ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';
ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS service_type TEXT;    -- for filtering by service
ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS ledger_entry_id TEXT; -- links to journal entry used as ledger posting
ALTER TABLE evouchers ADD COLUMN IF NOT EXISTS reference_number TEXT; -- external reference (check #, bank ref, etc.)

-- === expenses: additional field ===
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS booking_number TEXT;  -- denormalized for display
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS service_tag TEXT;     -- 'Forwarding','Brokerage', etc.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_billable BOOLEAN DEFAULT false;  -- used by billing reconciliation

-- === billing_line_items: additional fields ===
ALTER TABLE billing_line_items ADD COLUMN IF NOT EXISTS booking_number TEXT;
ALTER TABLE billing_line_items ADD COLUMN IF NOT EXISTS vendor_id TEXT;
ALTER TABLE billing_line_items ADD COLUMN IF NOT EXISTS vendor_name TEXT;

-- === collections: additional field ===
ALTER TABLE collections ADD COLUMN IF NOT EXISTS customer_id_alt TEXT; -- some records store customer differently

-- === invoices: additional fields ===
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_terms TEXT;

-- === tickets: KV uses subject/from_department/to_department etc. ===
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS subject TEXT;        -- KV uses 'subject', schema uses 'title'; keep both
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS from_department TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS to_department TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS linked_entity_type TEXT;  -- maps to entity_type
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS linked_entity_id TEXT;    -- maps to entity_id
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS linked_entity_name TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS linked_entity_status TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS default_due_hours INTEGER;  -- from ticket_type

-- Index for ticket queries
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_tickets_to_dept ON tickets(to_department);
CREATE INDEX IF NOT EXISTS idx_tickets_from_dept ON tickets(from_department);

-- === ticket_types: additional fields for default_due_hours ===
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS default_due_hours INTEGER;

-- === counters: generic counter table for sequential ID generation ===
-- Also used as a general KV store for vendor_line_items, charge_categories, etc.
-- Change value from INTEGER to JSONB so it can hold both numeric counters and JSON objects.
CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  value JSONB DEFAULT '0'
);
-- If table already exists from 001_full_schema.sql with INTEGER value column, alter it:
-- Must drop the old INTEGER default first, then convert, then set the new JSONB default.
ALTER TABLE counters ALTER COLUMN value DROP DEFAULT;
ALTER TABLE counters ALTER COLUMN value TYPE JSONB USING to_jsonb(value);
ALTER TABLE counters ALTER COLUMN value SET DEFAULT '0';

-- === comments: add entity indexes ===
CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id);

-- === activity_log: single table for all system activities ===
-- Note: 001_full_schema.sql already creates this table with `created_at` column.
-- This CREATE TABLE IF NOT EXISTS is a safety net only.
CREATE TABLE IF NOT EXISTS activity_log (
  id              TEXT PRIMARY KEY,
  entity_type     TEXT NOT NULL,       -- 'ticket','quotation','booking'
  entity_id       TEXT NOT NULL,
  entity_name     TEXT,
  action_type     TEXT NOT NULL,
  user_id         TEXT,
  user_name       TEXT,
  user_department TEXT,
  old_value       TEXT,
  new_value       TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);


-- ────────────────────────────────────────────────────────────
-- MIGRATION 003: Supabase Auth
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- 003: Supabase Auth Integration
-- ============================================================================
-- Bridges the existing users (TEXT PK) table to Supabase Auth (auth.users UUID).
-- After running this migration:
--   1. Create auth accounts for each seed user via the Supabase dashboard or
--      the POST /auth/migrate-users endpoint (added in the server code).
--   2. Deploy the updated server code that uses supabase.auth.* for login.
--   3. Update the frontend to store and send the JWT.
--
-- This migration is safe to run while the old login flow is still active —
-- it only adds columns, replaces permissive policies, and creates helper
-- functions. Nothing breaks until you flip the server code.
-- ============================================================================

-- ============================================================================
-- STEP 1: Link users table to auth.users
-- ============================================================================

-- Add auth_id column that maps to Supabase Auth's UUID
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE;

-- Index for fast lookup during JWT → profile resolution
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id) WHERE auth_id IS NOT NULL;

-- Make password nullable (will be removed once migration is confirmed)
-- Supabase Auth stores hashed passwords in auth.users, so this column becomes dead
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
-- (password was already nullable from 001 — this is a safety net)


-- ============================================================================
-- STEP 2: Helper function — resolve auth.uid() → users.id
-- ============================================================================
-- All RLS policies use this to bridge the UUID world (auth) to the TEXT world
-- (our existing FKs). Cached per-transaction via a config var for performance.

CREATE OR REPLACE FUNCTION public.get_my_profile_id()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile_id TEXT;
BEGIN
  -- Try transaction-local cache first
  BEGIN
    _profile_id := current_setting('app.current_profile_id', true);
    IF _profile_id IS NOT NULL AND _profile_id != '' THEN
      RETURN _profile_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- setting doesn't exist yet, continue
  END;

  -- Look up from users table
  SELECT id INTO _profile_id
  FROM public.users
  WHERE auth_id = auth.uid();

  -- Cache for remainder of transaction
  IF _profile_id IS NOT NULL THEN
    PERFORM set_config('app.current_profile_id', _profile_id, true);
  END IF;

  RETURN _profile_id;
END;
$$;

-- Helper: check if current user has a specific role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE auth_id = auth.uid();
$$;

-- Helper: check if current user's department
CREATE OR REPLACE FUNCTION public.get_my_department()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT department FROM public.users WHERE auth_id = auth.uid();
$$;


-- ============================================================================
-- STEP 3: Auto-create profile on auth.users INSERT (new sign-ups)
-- ============================================================================
-- When a new user is created via Supabase Auth (dashboard invite, signUp(), etc.)
-- this trigger auto-creates a corresponding row in public.users.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, auth_id, email, name, status, is_active, created_at)
  VALUES (
    'user-' || substr(NEW.id::text, 1, 8),   -- generate a TEXT id from the UUID prefix
    NEW.id,                                     -- auth_id = auth.users.id
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),  -- use name from metadata or email
    'Active',
    true,
    now()
  )
  ON CONFLICT (auth_id) DO NOTHING;  -- idempotent

  RETURN NEW;
END;
$$;

-- Attach to auth.users (fires on INSERT only)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();


-- ============================================================================
-- STEP 4: Replace permissive RLS policies with auth-scoped policies
-- ============================================================================
-- Phase 1 policy: "authenticated employees can do everything"
-- This matches the current SME model where every logged-in user is a coworker.
-- Phase 2 (future) will add department/role-based restrictions.
--
-- We also add a service_role bypass policy so the server's admin client
-- (used for seeding, migrations, background jobs) continues to work.

-- First, drop all existing "Allow all for service role" policies
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'users','settings','counters','customers','contacts','consignees',
      'client_handler_preferences','tasks','crm_activities','budget_requests',
      'service_providers','catalog_categories','catalog_items',
      'quotations','contract_bookings','contract_activity','contract_attachments',
      'projects','bookings','project_bookings','project_attachments',
      'evouchers','evoucher_history','invoices','billing_line_items',
      'collections','expenses','accounts','journal_entries','transactions',
      'ticket_types','tickets','comments','activity_log','saved_reports'
    ])
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "Allow all for service role" ON %I',
      tbl
    );
  END LOOP;
END $$;

-- --------------------------------------------------------------------------
-- 4a. Generic "authenticated can read/write" policies for most tables
-- --------------------------------------------------------------------------
-- These cover all 35 tables. The pattern:
--   SELECT  → any authenticated user
--   INSERT  → any authenticated user
--   UPDATE  → any authenticated user
--   DELETE  → any authenticated user
--
-- This is intentionally permissive for Phase 1. Role-based restrictions
-- (e.g., only Accounting can delete evouchers) will be layered in Phase 2.

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'settings','counters','customers','contacts','consignees',
      'client_handler_preferences','tasks','crm_activities','budget_requests',
      'service_providers','catalog_categories','catalog_items',
      'quotations','contract_bookings','contract_activity','contract_attachments',
      'projects','bookings','project_bookings','project_attachments',
      'evouchers','evoucher_history','invoices','billing_line_items',
      'collections','expenses','accounts','journal_entries','transactions',
      'ticket_types','tickets','comments','activity_log','saved_reports'
    ])
  LOOP
    -- Authenticated users: full access
    EXECUTE format(
      'CREATE POLICY "Authenticated full access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      tbl
    );
  END LOOP;
END $$;

-- --------------------------------------------------------------------------
-- 4b. Users table: slightly more restrictive
-- --------------------------------------------------------------------------
-- Everyone can read all user profiles (needed for assignment dropdowns, etc.)
-- Users can only update their own profile (admins/managers get a separate policy)
-- Only admins can delete user accounts
-- Insert is allowed (for seeding/admin creation flows)

CREATE POLICY "Anyone authenticated can read users"
  ON users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

CREATE POLICY "Admins can update any user"
  ON users FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('Admin', 'admin', 'manager', 'Manager', 'director'))
  WITH CHECK (public.get_my_role() IN ('Admin', 'admin', 'manager', 'Manager', 'director'));

CREATE POLICY "Admins can insert users"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('Admin', 'admin', 'manager', 'Manager', 'director'));

CREATE POLICY "Admins can delete users"
  ON users FOR DELETE
  TO authenticated
  USING (public.get_my_role() IN ('Admin', 'admin', 'manager', 'Manager', 'director'));

-- Service role (server admin) always has full access via bypass — no policy needed,
-- but we add one explicitly for clarity during development
CREATE POLICY "Service role full access to users"
  ON users FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================================
-- STEP 5: Grant anon/authenticated access to helper functions
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_my_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_department() TO authenticated;


-- ============================================================================
-- STEP 6: Create a migration helper — bulk-link existing users to auth accounts
-- ============================================================================
-- Call this function AFTER creating auth accounts for each seed user.
-- It matches by email and sets users.auth_id = auth.users.id.
--
-- Usage (from SQL editor):
--   SELECT public.link_existing_users_to_auth();

CREATE OR REPLACE FUNCTION public.link_existing_users_to_auth()
RETURNS TABLE(user_id TEXT, email TEXT, auth_id UUID, linked BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user RECORD;
  _auth_id UUID;
BEGIN
  FOR _user IN SELECT u.id, u.email FROM public.users u WHERE u.auth_id IS NULL AND u.email IS NOT NULL
  LOOP
    SELECT au.id INTO _auth_id
    FROM auth.users au
    WHERE au.email = _user.email
    LIMIT 1;

    IF _auth_id IS NOT NULL THEN
      UPDATE public.users SET auth_id = _auth_id WHERE id = _user.id;
      user_id := _user.id;
      email := _user.email;
      auth_id := _auth_id;
      linked := true;
      RETURN NEXT;
    ELSE
      user_id := _user.id;
      email := _user.email;
      auth_id := NULL;
      linked := false;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_existing_users_to_auth() TO service_role;


-- ============================================================================
-- MIGRATION COMPLETE — 003_supabase_auth
-- ============================================================================
-- What this migration did:
--   1. Added users.auth_id (UUID) linking to auth.users
--   2. Created get_my_profile_id() / get_my_role() / get_my_department() helpers
--   3. Created trigger to auto-create profile on new auth sign-ups
--   4. Replaced permissive "USING (true)" policies with auth-scoped policies
--   5. Created link_existing_users_to_auth() migration helper
--
-- Next steps (in order):
--   a. Run 002 + 003 in SQL Editor
--   b. Create Supabase Auth accounts for each seed user (dashboard or API)
--   c. Run: SELECT public.link_existing_users_to_auth();
--   d. Deploy updated server code with JWT middleware + auth endpoints
--   e. Update frontend to use supabase.auth.signInWithPassword()
--   f. Verify E2E, then DROP COLUMN password from users table
-- ============================================================================


-- ────────────────────────────────────────────────────────────
-- MIGRATION 004: Role Constraints
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- 004: Role & Department Constraints — Enforce Canonical Taxonomy
-- ============================================================================
-- Phase 5 of the User Roles Fix Blueprint.
-- Adds CHECK constraints to the users table so that department, role,
-- service_type, and operations_role can only hold canonical values.
-- Also drops the dead `permissions` column and fixes the RLS policies
-- from 003 that still reference non-canonical role strings.
--
-- PREREQUISITES:
--   - Migrations 001, 002, 003 have been applied.
--   - Phase 1 (frontend taxonomy fix) is complete, so all new writes
--     already use canonical values.
--   - You have run the validation query (Step 0) and fixed any bad rows.
--
-- HOW TO USE:
--   1. Run Step 0 in the Supabase SQL Editor to check for bad data.
--   2. If Step 0 returns rows, fix them with Step 0b UPDATE statements.
--   3. Run Steps 1-4 in sequence.
--   4. (Optional, after Phase 3 server-side is confirmed) Run Step 5.
-- ============================================================================


-- ============================================================================
-- STEP 0: Validate existing data (run this FIRST, review output)
-- ============================================================================
-- Copy-paste this SELECT into the SQL Editor and check the results.
-- If it returns 0 rows, you're safe to proceed.
-- If it returns rows, fix them with Step 0b before applying constraints.

-- SELECT id, email, name, department, role, service_type, operations_role
-- FROM users
-- WHERE department NOT IN ('Business Development','Pricing','Operations','Accounting','Executive','HR')
--    OR role NOT IN ('rep','manager','director')
--    OR (service_type IS NOT NULL AND service_type NOT IN ('Forwarding','Brokerage','Trucking','Marine Insurance','Others'))
--    OR (operations_role IS NOT NULL AND operations_role NOT IN ('Manager','Supervisor','Handler'));


-- ============================================================================
-- STEP 0b: Fix any bad data found by Step 0 (uncomment & adjust as needed)
-- ============================================================================
-- Map legacy department values to canonical ones:

UPDATE users SET department = 'Business Development' WHERE department IN ('BD', 'Sales', 'Business Dev');
UPDATE users SET department = 'Pricing'              WHERE department IN ('PD', 'Pricing Department');
UPDATE users SET department = 'Accounting'           WHERE department IN ('Finance', 'Treasury');
UPDATE users SET department = 'Executive'            WHERE department IN ('Admin', 'Management', 'IT');
UPDATE users SET department = 'Operations'           WHERE department IN ('Ops', 'Logistics');

-- Map legacy role values to canonical ones:
UPDATE users SET role = 'director' WHERE role IN ('Admin', 'admin', 'President', 'Director', 'Executive');
UPDATE users SET role = 'manager'  WHERE role IN ('Manager', 'Supervisor', 'Lead', 'Finance Manager');
UPDATE users SET role = 'rep'      WHERE role IN ('Employee', 'Staff', 'Rep', 'Accountant', 'Agent', 'Handler', 'Officer');

-- Null out operations fields for non-Operations users:
UPDATE users SET service_type = NULL, operations_role = NULL
WHERE department != 'Operations' AND (service_type IS NOT NULL OR operations_role IS NOT NULL);

-- Set defaults for any remaining NULLs (adjust department/role as appropriate):
UPDATE users SET department = 'Business Development' WHERE department IS NULL;
UPDATE users SET role = 'rep' WHERE role IS NULL;


-- ============================================================================
-- STEP 1: Add CHECK constraints
-- ============================================================================
-- Using CHECK constraints (not ENUMs) so future values can be added with
-- a simple ALTER TABLE ... DROP/ADD CONSTRAINT, no type migration needed.

ALTER TABLE users ADD CONSTRAINT users_department_check
  CHECK (department IN (
    'Business Development',
    'Pricing',
    'Operations',
    'Accounting',
    'Executive',
    'HR'
  ));

ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'rep',
    'manager',
    'director'
  ));

ALTER TABLE users ADD CONSTRAINT users_service_type_check
  CHECK (
    service_type IS NULL
    OR service_type IN (
      'Forwarding',
      'Brokerage',
      'Trucking',
      'Marine Insurance',
      'Others'
    )
  );

ALTER TABLE users ADD CONSTRAINT users_operations_role_check
  CHECK (
    operations_role IS NULL
    OR operations_role IN (
      'Manager',
      'Supervisor',
      'Handler'
    )
  );

-- Operations users should have both fields set; non-Operations should have neither.
-- This is a soft convention, not enforced here, because onboarding flows may
-- set department before service_type. Uncomment if you want strict enforcement:
--
-- ALTER TABLE users ADD CONSTRAINT users_ops_fields_consistency
--   CHECK (
--     (department = 'Operations' AND service_type IS NOT NULL AND operations_role IS NOT NULL)
--     OR (department != 'Operations' AND service_type IS NULL AND operations_role IS NULL)
--   );


-- ============================================================================
-- STEP 2: Drop the dead `permissions` column
-- ============================================================================
-- The permissions TEXT[] column (added in 001) is always '{}' — never read or
-- written by any frontend or server code. The real permission system uses
-- department + role checks in permissions.ts and RouteGuard.tsx.

ALTER TABLE users DROP COLUMN IF EXISTS permissions;


-- ============================================================================
-- STEP 3: Update column comments (documentation for Supabase dashboard)
-- ============================================================================

COMMENT ON COLUMN users.department IS 'Canonical: Business Development | Pricing | Operations | Accounting | Executive | HR';
COMMENT ON COLUMN users.role IS 'Canonical: rep | manager | director';
COMMENT ON COLUMN users.service_type IS 'Operations only: Forwarding | Brokerage | Trucking | Marine Insurance | Others';
COMMENT ON COLUMN users.operations_role IS 'Operations only: Manager | Supervisor | Handler';


-- ============================================================================
-- STEP 4: Fix RLS policies — replace legacy role strings with canonical values
-- ============================================================================
-- Migration 003 created policies that check for 'Admin', 'admin', 'Manager'
-- in get_my_role(). Now that we have CHECK constraints, those values can
-- never appear. Replace with canonical 'manager' and 'director'.

-- Drop the old policies
DROP POLICY IF EXISTS "Admins can update any user" ON users;
DROP POLICY IF EXISTS "Admins can insert users" ON users;
DROP POLICY IF EXISTS "Admins can delete users" ON users;

-- Recreate with canonical role values only
CREATE POLICY "Managers and directors can update any user"
  ON users FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('manager', 'director'))
  WITH CHECK (public.get_my_role() IN ('manager', 'director'));

CREATE POLICY "Managers and directors can insert users"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() IN ('manager', 'director'));

CREATE POLICY "Directors can delete users"
  ON users FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'director');


-- ============================================================================
-- STEP 5: Drop password column (DO NOT RUN YET)
-- ============================================================================
-- Only run this AFTER all of the following are confirmed:
--   [ ] Phase 3 server-side JWT middleware is deployed
--   [ ] POST /auth/login endpoint is removed from the server
--   [ ] All users have auth_id linked (SELECT count(*) FROM users WHERE auth_id IS NULL returns 0)
--   [ ] E2E login tested end-to-end with Supabase Auth
--
-- ALTER TABLE users DROP COLUMN IF EXISTS password;


-- ============================================================================
-- MIGRATION COMPLETE — 004_role_constraints
-- ============================================================================
-- What this migration did:
--   1. Fixed any legacy department/role values to canonical names
--   2. Added CHECK constraints on department, role, service_type, operations_role
--   3. Dropped unused permissions TEXT[] column
--   4. Fixed RLS policies to use canonical role values
--
-- What's deferred:
--   - password column drop (Step 5) — waiting on Phase 3 server confirmation
--   - Operations field consistency constraint — optional strict enforcement
--
-- Next steps:
--   a. Verify constraints: INSERT a test user with role='Employee' — should fail
--   b. Proceed with Phase 3 frontend (apiFetch wrapper, isAuthenticated fix)
--   c. After Phase 3 server is live, come back and run Step 5
-- ============================================================================


-- ────────────────────────────────────────────────────────────
-- MIGRATION 005: RLS Policies
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- 005: Scoped RLS Policies (Phase 2 — Department/Role-Based Access)
-- ============================================================================
-- Replaces the permissive "Authenticated full access" policies from 003 with
-- department- and role-scoped policies per Neuron OS access matrix.
--
-- Prerequisites:
--   - 003_supabase_auth.sql has been run (helper functions exist)
--   - 004_role_constraints.sql has been run (role/dept constraints exist)
--
-- Helper functions used (from 003):
--   get_my_profile_id() → TEXT  (users.id for current auth user)
--   get_my_role()       → TEXT  ('rep','manager','director')
--   get_my_department() → TEXT  ('Business Development','Pricing','Operations','Accounting','Executive','HR')
-- ============================================================================


-- ============================================================================
-- STEP 1: Drop existing permissive "Authenticated full access" policies
-- ============================================================================
-- These were Phase 1 "everyone can do everything" policies from 003.

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'customers','contacts','consignees',
      'client_handler_preferences','tasks','crm_activities','budget_requests',
      'quotations','contract_bookings','contract_activity','contract_attachments',
      'evouchers','evoucher_history','invoices','billing_line_items',
      'collections','expenses',
      'ticket_types','tickets','comments','activity_log'
    ])
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "Authenticated full access" ON %I', tbl
    );
  END LOOP;
END $$;

-- Note: We keep the permissive policies on these utility/low-risk tables:
--   settings, counters, service_providers, catalog_categories, catalog_items,
--   projects, bookings, project_bookings, project_attachments,
--   accounts, journal_entries, transactions, saved_reports
-- They can be tightened later if needed.


-- ============================================================================
-- STEP 2: customers — BD CRUD; Pricing/Ops/Accounting SELECT; HR no access
-- ============================================================================

-- SELECT: Everyone except HR can read customers
CREATE POLICY "customers_select"
  ON customers FOR SELECT
  TO authenticated
  USING (get_my_department() != 'HR');

-- INSERT: Only BD can create customers
CREATE POLICY "customers_insert"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (get_my_department() IN ('Business Development', 'Executive'));

-- UPDATE: BD can update; managers/directors from other depts can update
CREATE POLICY "customers_update"
  ON customers FOR UPDATE
  TO authenticated
  USING (
    get_my_department() IN ('Business Development', 'Executive')
    OR get_my_role() IN ('manager', 'director')
  )
  WITH CHECK (
    get_my_department() IN ('Business Development', 'Executive')
    OR get_my_role() IN ('manager', 'director')
  );

-- DELETE: Only BD managers/directors or Executive can delete
CREATE POLICY "customers_delete"
  ON customers FOR DELETE
  TO authenticated
  USING (
    (get_my_department() IN ('Business Development', 'Executive') AND get_my_role() IN ('manager', 'director'))
    OR get_my_department() = 'Executive'
  );


-- ============================================================================
-- STEP 3: contacts — Same pattern as customers
-- ============================================================================

CREATE POLICY "contacts_select"
  ON contacts FOR SELECT
  TO authenticated
  USING (get_my_department() != 'HR');

CREATE POLICY "contacts_insert"
  ON contacts FOR INSERT
  TO authenticated
  WITH CHECK (get_my_department() IN ('Business Development', 'Executive'));

CREATE POLICY "contacts_update"
  ON contacts FOR UPDATE
  TO authenticated
  USING (
    get_my_department() IN ('Business Development', 'Executive')
    OR get_my_role() IN ('manager', 'director')
  )
  WITH CHECK (
    get_my_department() IN ('Business Development', 'Executive')
    OR get_my_role() IN ('manager', 'director')
  );

CREATE POLICY "contacts_delete"
  ON contacts FOR DELETE
  TO authenticated
  USING (
    (get_my_department() IN ('Business Development', 'Executive') AND get_my_role() IN ('manager', 'director'))
    OR get_my_department() = 'Executive'
  );


-- ============================================================================
-- STEP 4: consignees — Follows customers pattern (FK cascade)
-- ============================================================================

CREATE POLICY "consignees_select"
  ON consignees FOR SELECT
  TO authenticated
  USING (get_my_department() != 'HR');

CREATE POLICY "consignees_insert"
  ON consignees FOR INSERT
  TO authenticated
  WITH CHECK (get_my_department() IN ('Business Development', 'Operations', 'Executive'));

CREATE POLICY "consignees_update"
  ON consignees FOR UPDATE
  TO authenticated
  USING (get_my_department() IN ('Business Development', 'Operations', 'Executive'))
  WITH CHECK (get_my_department() IN ('Business Development', 'Operations', 'Executive'));

CREATE POLICY "consignees_delete"
  ON consignees FOR DELETE
  TO authenticated
  USING (
    get_my_department() IN ('Business Development', 'Executive')
    AND get_my_role() IN ('manager', 'director')
  );


-- ============================================================================
-- STEP 5: client_handler_preferences — BD/Ops manage, others read
-- ============================================================================

CREATE POLICY "client_handler_prefs_select"
  ON client_handler_preferences FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "client_handler_prefs_insert"
  ON client_handler_preferences FOR INSERT
  TO authenticated
  WITH CHECK (get_my_department() IN ('Business Development', 'Operations', 'Executive'));

CREATE POLICY "client_handler_prefs_update"
  ON client_handler_preferences FOR UPDATE
  TO authenticated
  USING (get_my_department() IN ('Business Development', 'Operations', 'Executive'))
  WITH CHECK (get_my_department() IN ('Business Development', 'Operations', 'Executive'));

CREATE POLICY "client_handler_prefs_delete"
  ON client_handler_preferences FOR DELETE
  TO authenticated
  USING (get_my_department() IN ('Business Development', 'Operations', 'Executive'));


-- ============================================================================
-- STEP 6: quotations — BD creates; Pricing prices; others SELECT
-- ============================================================================

CREATE POLICY "quotations_select"
  ON quotations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "quotations_insert"
  ON quotations FOR INSERT
  TO authenticated
  WITH CHECK (get_my_department() IN ('Business Development', 'Pricing', 'Executive'));

CREATE POLICY "quotations_update"
  ON quotations FOR UPDATE
  TO authenticated
  USING (get_my_department() IN ('Business Development', 'Pricing', 'Executive'))
  WITH CHECK (get_my_department() IN ('Business Development', 'Pricing', 'Executive'));

CREATE POLICY "quotations_delete"
  ON quotations FOR DELETE
  TO authenticated
  USING (
    get_my_role() = 'director'
    OR get_my_department() = 'Executive'
  );


-- ============================================================================
-- STEP 7: contract_bookings, contract_activity, contract_attachments
-- ============================================================================

-- contract_bookings: BD/Pricing/Ops manage
CREATE POLICY "contract_bookings_select"
  ON contract_bookings FOR SELECT TO authenticated USING (true);

CREATE POLICY "contract_bookings_insert"
  ON contract_bookings FOR INSERT TO authenticated
  WITH CHECK (get_my_department() IN ('Business Development', 'Pricing', 'Operations', 'Executive'));

CREATE POLICY "contract_bookings_update"
  ON contract_bookings FOR UPDATE TO authenticated
  USING (get_my_department() IN ('Business Development', 'Pricing', 'Operations', 'Executive'))
  WITH CHECK (get_my_department() IN ('Business Development', 'Pricing', 'Operations', 'Executive'));

CREATE POLICY "contract_bookings_delete"
  ON contract_bookings FOR DELETE TO authenticated
  USING (get_my_role() = 'director' OR get_my_department() = 'Executive');

-- contract_activity: same access
CREATE POLICY "contract_activity_select"
  ON contract_activity FOR SELECT TO authenticated USING (true);

CREATE POLICY "contract_activity_insert"
  ON contract_activity FOR INSERT TO authenticated
  WITH CHECK (get_my_department() IN ('Business Development', 'Pricing', 'Operations', 'Executive'));

CREATE POLICY "contract_activity_update"
  ON contract_activity FOR UPDATE TO authenticated
  USING (get_my_department() IN ('Business Development', 'Pricing', 'Operations', 'Executive'))
  WITH CHECK (get_my_department() IN ('Business Development', 'Pricing', 'Operations', 'Executive'));

CREATE POLICY "contract_activity_delete"
  ON contract_activity FOR DELETE TO authenticated
  USING (get_my_role() = 'director' OR get_my_department() = 'Executive');

-- contract_attachments: same
CREATE POLICY "contract_attachments_select"
  ON contract_attachments FOR SELECT TO authenticated USING (true);

CREATE POLICY "contract_attachments_insert"
  ON contract_attachments FOR INSERT TO authenticated
  WITH CHECK (get_my_department() IN ('Business Development', 'Pricing', 'Operations', 'Executive'));

CREATE POLICY "contract_attachments_update"
  ON contract_attachments FOR UPDATE TO authenticated
  USING (get_my_department() IN ('Business Development', 'Pricing', 'Operations', 'Executive'))
  WITH CHECK (get_my_department() IN ('Business Development', 'Pricing', 'Operations', 'Executive'));

CREATE POLICY "contract_attachments_delete"
  ON contract_attachments FOR DELETE TO authenticated
  USING (get_my_role() = 'director' OR get_my_department() = 'Executive');


-- ============================================================================
-- STEP 8: evouchers — Accounting CRUD; others SELECT
-- ============================================================================

CREATE POLICY "evouchers_select"
  ON evouchers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "evouchers_insert"
  ON evouchers FOR INSERT
  TO authenticated
  WITH CHECK (get_my_department() IN ('Accounting', 'Executive'));

CREATE POLICY "evouchers_update"
  ON evouchers FOR UPDATE
  TO authenticated
  USING (get_my_department() IN ('Accounting', 'Executive'))
  WITH CHECK (get_my_department() IN ('Accounting', 'Executive'));

CREATE POLICY "evouchers_delete"
  ON evouchers FOR DELETE
  TO authenticated
  USING (
    get_my_department() IN ('Accounting', 'Executive')
    AND get_my_role() IN ('manager', 'director')
  );

-- evoucher_history: read-only for everyone, Accounting inserts
CREATE POLICY "evoucher_history_select"
  ON evoucher_history FOR SELECT TO authenticated USING (true);

CREATE POLICY "evoucher_history_insert"
  ON evoucher_history FOR INSERT TO authenticated
  WITH CHECK (get_my_department() IN ('Accounting', 'Executive'));

CREATE POLICY "evoucher_history_update"
  ON evoucher_history FOR UPDATE TO authenticated
  USING (get_my_department() IN ('Accounting', 'Executive'))
  WITH CHECK (get_my_department() IN ('Accounting', 'Executive'));

CREATE POLICY "evoucher_history_delete"
  ON evoucher_history FOR DELETE TO authenticated
  USING (get_my_role() = 'director');


-- ============================================================================
-- STEP 9: invoices / billing_line_items — Accounting CRUD; others SELECT
-- ============================================================================

CREATE POLICY "invoices_select"
  ON invoices FOR SELECT TO authenticated USING (true);

CREATE POLICY "invoices_insert"
  ON invoices FOR INSERT TO authenticated
  WITH CHECK (get_my_department() IN ('Accounting', 'Executive'));

CREATE POLICY "invoices_update"
  ON invoices FOR UPDATE TO authenticated
  USING (get_my_department() IN ('Accounting', 'Executive'))
  WITH CHECK (get_my_department() IN ('Accounting', 'Executive'));

CREATE POLICY "invoices_delete"
  ON invoices FOR DELETE TO authenticated
  USING (
    get_my_department() IN ('Accounting', 'Executive')
    AND get_my_role() IN ('manager', 'director')
  );

CREATE POLICY "billing_line_items_select"
  ON billing_line_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "billing_line_items_insert"
  ON billing_line_items FOR INSERT TO authenticated
  WITH CHECK (get_my_department() IN ('Accounting', 'Executive'));

CREATE POLICY "billing_line_items_update"
  ON billing_line_items FOR UPDATE TO authenticated
  USING (get_my_department() IN ('Accounting', 'Executive'))
  WITH CHECK (get_my_department() IN ('Accounting', 'Executive'));

CREATE POLICY "billing_line_items_delete"
  ON billing_line_items FOR DELETE TO authenticated
  USING (
    get_my_department() IN ('Accounting', 'Executive')
    AND get_my_role() IN ('manager', 'director')
  );


-- ============================================================================
-- STEP 10: collections / expenses — Accounting CRUD; others SELECT
-- ============================================================================

CREATE POLICY "collections_select"
  ON collections FOR SELECT TO authenticated USING (true);

CREATE POLICY "collections_insert"
  ON collections FOR INSERT TO authenticated
  WITH CHECK (get_my_department() IN ('Accounting', 'Executive'));

CREATE POLICY "collections_update"
  ON collections FOR UPDATE TO authenticated
  USING (get_my_department() IN ('Accounting', 'Executive'))
  WITH CHECK (get_my_department() IN ('Accounting', 'Executive'));

CREATE POLICY "collections_delete"
  ON collections FOR DELETE TO authenticated
  USING (
    get_my_department() IN ('Accounting', 'Executive')
    AND get_my_role() IN ('manager', 'director')
  );

CREATE POLICY "expenses_select"
  ON expenses FOR SELECT TO authenticated USING (true);

CREATE POLICY "expenses_insert"
  ON expenses FOR INSERT TO authenticated
  WITH CHECK (get_my_department() IN ('Accounting', 'Executive'));

CREATE POLICY "expenses_update"
  ON expenses FOR UPDATE TO authenticated
  USING (get_my_department() IN ('Accounting', 'Executive'))
  WITH CHECK (get_my_department() IN ('Accounting', 'Executive'));

CREATE POLICY "expenses_delete"
  ON expenses FOR DELETE TO authenticated
  USING (
    get_my_department() IN ('Accounting', 'Executive')
    AND get_my_role() IN ('manager', 'director')
  );


-- ============================================================================
-- STEP 11: tasks — Everyone reads/writes own; managers see dept; directors all
-- ============================================================================

CREATE POLICY "tasks_select"
  ON tasks FOR SELECT TO authenticated USING (true);

CREATE POLICY "tasks_insert"
  ON tasks FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "tasks_update"
  ON tasks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "tasks_delete"
  ON tasks FOR DELETE TO authenticated
  USING (get_my_role() IN ('manager', 'director'));


-- ============================================================================
-- STEP 12: crm_activities — BD CRUD; others SELECT
-- ============================================================================

CREATE POLICY "crm_activities_select"
  ON crm_activities FOR SELECT TO authenticated USING (true);

CREATE POLICY "crm_activities_insert"
  ON crm_activities FOR INSERT TO authenticated
  WITH CHECK (get_my_department() IN ('Business Development', 'Executive'));

CREATE POLICY "crm_activities_update"
  ON crm_activities FOR UPDATE TO authenticated
  USING (get_my_department() IN ('Business Development', 'Executive'))
  WITH CHECK (get_my_department() IN ('Business Development', 'Executive'));

CREATE POLICY "crm_activities_delete"
  ON crm_activities FOR DELETE TO authenticated
  USING (get_my_department() IN ('Business Development', 'Executive'));


-- ============================================================================
-- STEP 13: budget_requests — All depts can create; managers/directors approve
-- ============================================================================

CREATE POLICY "budget_requests_select"
  ON budget_requests FOR SELECT TO authenticated USING (true);

CREATE POLICY "budget_requests_insert"
  ON budget_requests FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "budget_requests_update"
  ON budget_requests FOR UPDATE TO authenticated
  USING (
    get_my_role() IN ('manager', 'director')
    OR get_my_department() = 'Executive'
  )
  WITH CHECK (
    get_my_role() IN ('manager', 'director')
    OR get_my_department() = 'Executive'
  );

CREATE POLICY "budget_requests_delete"
  ON budget_requests FOR DELETE TO authenticated
  USING (get_my_role() = 'director' OR get_my_department() = 'Executive');


-- ============================================================================
-- STEP 14: tickets — directors see all; managers see dept; reps see own
-- ============================================================================

CREATE POLICY "tickets_select"
  ON tickets FOR SELECT
  TO authenticated
  USING (
    get_my_role() = 'director'
    OR get_my_department() = 'Executive'
    -- Managers see tickets assigned to their department
    OR (get_my_role() = 'manager' AND (
      department = get_my_department()
      OR created_by = get_my_profile_id()
    ))
    -- Reps see only their own tickets
    OR created_by = get_my_profile_id()
    OR assigned_to = get_my_profile_id()
  );

CREATE POLICY "tickets_insert"
  ON tickets FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "tickets_update"
  ON tickets FOR UPDATE
  TO authenticated
  USING (
    get_my_role() IN ('manager', 'director')
    OR get_my_department() = 'Executive'
    OR created_by = get_my_profile_id()
    OR assigned_to = get_my_profile_id()
  )
  WITH CHECK (
    get_my_role() IN ('manager', 'director')
    OR get_my_department() = 'Executive'
    OR created_by = get_my_profile_id()
    OR assigned_to = get_my_profile_id()
  );

CREATE POLICY "tickets_delete"
  ON tickets FOR DELETE
  TO authenticated
  USING (get_my_role() = 'director' OR get_my_department() = 'Executive');


-- ============================================================================
-- STEP 15: comments — Everyone can read/create; only author or manager+ can delete
-- ============================================================================

CREATE POLICY "comments_select"
  ON comments FOR SELECT TO authenticated USING (true);

CREATE POLICY "comments_insert"
  ON comments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "comments_update"
  ON comments FOR UPDATE TO authenticated
  USING (
    user_id = get_my_profile_id()
    OR get_my_role() IN ('manager', 'director')
  )
  WITH CHECK (
    user_id = get_my_profile_id()
    OR get_my_role() IN ('manager', 'director')
  );

CREATE POLICY "comments_delete"
  ON comments FOR DELETE TO authenticated
  USING (
    user_id = get_my_profile_id()
    OR get_my_role() IN ('manager', 'director')
  );


-- ============================================================================
-- STEP 16: activity_log — directors see all; managers see dept; reps see own
-- ============================================================================

CREATE POLICY "activity_log_select"
  ON activity_log FOR SELECT
  TO authenticated
  USING (
    get_my_role() = 'director'
    OR get_my_department() = 'Executive'
    OR (get_my_role() = 'manager' AND user_department = get_my_department())
    OR user_id = get_my_profile_id()
  );

-- Insert: any authenticated user (system writes activity logs)
CREATE POLICY "activity_log_insert"
  ON activity_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Update: only directors (corrections)
CREATE POLICY "activity_log_update"
  ON activity_log FOR UPDATE
  TO authenticated
  USING (get_my_role() = 'director' OR get_my_department() = 'Executive')
  WITH CHECK (get_my_role() = 'director' OR get_my_department() = 'Executive');

-- Delete: only directors
CREATE POLICY "activity_log_delete"
  ON activity_log FOR DELETE
  TO authenticated
  USING (get_my_role() = 'director' OR get_my_department() = 'Executive');


-- ============================================================================
-- STEP 17: ticket_types — Read-only for all; directors manage
-- ============================================================================

CREATE POLICY "ticket_types_select"
  ON ticket_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "ticket_types_insert"
  ON ticket_types FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'director' OR get_my_department() = 'Executive');

CREATE POLICY "ticket_types_update"
  ON ticket_types FOR UPDATE TO authenticated
  USING (get_my_role() = 'director' OR get_my_department() = 'Executive')
  WITH CHECK (get_my_role() = 'director' OR get_my_department() = 'Executive');

CREATE POLICY "ticket_types_delete"
  ON ticket_types FOR DELETE TO authenticated
  USING (get_my_role() = 'director' OR get_my_department() = 'Executive');


-- ============================================================================
-- STEP 18: Service-role bypass for all scoped tables
-- ============================================================================
-- The service_role key (used by admin/migration scripts) should bypass all RLS.
-- Supabase automatically grants service_role bypass when RLS is enabled,
-- but we add explicit policies for clarity.

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'customers','contacts','consignees',
      'client_handler_preferences','tasks','crm_activities','budget_requests',
      'quotations','contract_bookings','contract_activity','contract_attachments',
      'evouchers','evoucher_history','invoices','billing_line_items',
      'collections','expenses',
      'ticket_types','tickets','comments','activity_log'
    ])
  LOOP
    EXECUTE format(
      'CREATE POLICY "Service role full access on %I" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      tbl, tbl
    );
  END LOOP;
END $$;


-- ============================================================================
-- MIGRATION COMPLETE — 005_rls_policies
-- ============================================================================
-- What this migration did:
--   1. Dropped Phase 1 permissive "Authenticated full access" policies
--   2. Created department-scoped SELECT/INSERT/UPDATE/DELETE policies for:
--      - customers, contacts, consignees, client_handler_preferences
--      - quotations, contract_bookings, contract_activity, contract_attachments
--      - evouchers, evoucher_history, invoices, billing_line_items
--      - collections, expenses
--      - tasks, crm_activities, budget_requests
--      - tickets, comments, activity_log, ticket_types
--   3. Added service_role bypass policies for admin operations
--
-- Verification queries (run as different roles):
--   SELECT * FROM customers;           -- HR should get 0 rows
--   INSERT INTO evouchers (...);        -- Non-Accounting should fail
--   DELETE FROM customers WHERE ...;    -- Non-BD-director should fail
--   SELECT * FROM activity_log;         -- Reps see only own entries
-- ============================================================================


-- ────────────────────────────────────────────────────────────
-- MIGRATION 006: V2 Financial Columns
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- Migration 006 — V2 Financial Architecture: Missing Columns
-- ============================================================================
-- Adds the columns that the V2 financial code writes to but that were absent
-- from the original schema migrations. Apply in the Supabase SQL Editor AFTER
-- migrations 001–005.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- invoices: V2 line-derived lineage columns
-- ---------------------------------------------------------------------------
-- project_refs and contract_refs are derived from the billing lines packaged
-- into the invoice — written by InvoiceBuilder.tsx at invoice creation time.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS project_refs   TEXT[]  DEFAULT '{}';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS contract_refs  TEXT[]  DEFAULT '{}';

-- metadata holds reversal workflow state, e.g.:
--   { "reversal_of_invoice_id": "inv-2026-001" }
-- Written by invoiceReversal.ts when creating reversal drafts.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS metadata  JSONB DEFAULT '{}';

-- ---------------------------------------------------------------------------
-- collections: V2 multi-invoice application column
-- ---------------------------------------------------------------------------
-- linked_billings is a JSONB array of invoice application entries, used when
-- one collection payment settles more than one invoice:
--   [{ "id": "inv-...", "invoice_number": "INV-...", "amount": 50000 }, ...]
-- Written by CollectionCreatorPanel.tsx and useEVoucherSubmit.ts.
ALTER TABLE collections ADD COLUMN IF NOT EXISTS linked_billings  JSONB DEFAULT '[]';

-- ---------------------------------------------------------------------------
-- billing_line_items: fix status default to match V2 vocabulary
-- ---------------------------------------------------------------------------
-- V2 billing status values: 'unbilled' | 'invoiced' | 'voided' | 'billed'
-- The original schema defaulted to 'active', which the V2 code does not
-- recognize in its billing state calculations.
ALTER TABLE billing_line_items ALTER COLUMN status SET DEFAULT 'unbilled';

-- Back-fill any existing rows that still carry the old 'active' default
-- so the V2 hooks don't silently exclude them from unbilled totals.
UPDATE billing_line_items SET status = 'unbilled' WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- Indexes for new columns (optional performance helpers)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_invoices_project_refs   ON invoices USING GIN (project_refs);
CREATE INDEX IF NOT EXISTS idx_invoices_contract_refs  ON invoices USING GIN (contract_refs);
CREATE INDEX IF NOT EXISTS idx_collections_linked      ON collections USING GIN (linked_billings);


-- ────────────────────────────────────────────────────────────
-- MIGRATION 006b: Feedback Table
-- ────────────────────────────────────────────────────────────
-- Migration 006: Beta feedback table
-- Apply in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS feedback (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     text REFERENCES users(id) ON DELETE SET NULL,
  user_name   text,
  user_email  text,
  type        text NOT NULL CHECK (type IN ('bug', 'feedback', 'feature')),
  title       text NOT NULL,
  description text NOT NULL,
  created_at  timestamptz DEFAULT now()
);


-- ────────────────────────────────────────────────────────────
-- MIGRATION 007: Catalog Charge Type Code
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- Migration 007 — Add stable charge_type_code to catalog_items
-- ============================================================================
-- Adds a stable, immutable code field so the rate engine can match catalog
-- items by code rather than by display name. Renaming an item's name field
-- never breaks billing or contract rate calculations.
-- ============================================================================

ALTER TABLE catalog_items
  ADD COLUMN IF NOT EXISTS charge_type_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_items_charge_type_code
  ON catalog_items (charge_type_code)
  WHERE charge_type_code IS NOT NULL;

-- Backfill: BOC Processing Fee maps cleanly to the legacy processing_fee preset
UPDATE catalog_items SET charge_type_code = 'processing_fee' WHERE id = 'ci-012';

-- Insert registry presets that don't have a DB equivalent yet
INSERT INTO catalog_items (id, name, category_id, currency, unit_type, tax_code, is_active, service_types, sort_order, charge_type_code)
VALUES
  ('ci-101', 'Documentation Fee', 'cat-004', 'PHP', 'per_entry',     'VAT',  true, ARRAY['Brokerage'], 20, 'documentation_fee'),
  ('ci-102', 'Handling Fee',      'cat-004', 'PHP', 'per_entry',     'VAT',  true, ARRAY['Brokerage'], 21, 'handling_fee'),
  ('ci-103', 'Brokerage Fee',     'cat-004', 'PHP', 'per_entry',     'VAT',  true, ARRAY['Brokerage'], 22, 'brokerage_fee'),
  ('ci-104', 'Stamps and Notary', 'cat-004', 'PHP', 'per_bl',        'VAT',  true, ARRAY['Brokerage'], 23, 'stamps_and_notary'),
  ('ci-105', 'Examination Fee',   'cat-004', 'PHP', 'per_container', 'VAT',  true, ARRAY['Brokerage'], 24, 'examination_fee'),
  ('ci-106', 'DEA Examination',   'cat-004', 'PHP', 'per_shipment',  'NVAT', true, ARRAY['Brokerage'], 25, 'dea_examination'),
  ('ci-107', 'BAI Processing',    'cat-004', 'PHP', 'per_shipment',  'NVAT', true, ARRAY['Brokerage'], 26, 'bai_processing'),
  ('ci-108', '20ft / 40ft',       'cat-003', 'PHP', 'per_container', 'VAT',  true, ARRAY['Trucking'],  27, '20ft_40ft'),
  ('ci-109', 'Back to Back',      'cat-003', 'PHP', 'per_container', 'VAT',  true, ARRAY['Trucking'],  28, 'back_to_back'),
  ('ci-110', '4-Wheeler',         'cat-003', 'PHP', 'per_container', 'VAT',  true, ARRAY['Trucking'],  29, '4wheeler'),
  ('ci-111', '6-Wheeler',         'cat-003', 'PHP', 'per_container', 'VAT',  true, ARRAY['Trucking'],  30, '6wheeler')
ON CONFLICT (id) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- MIGRATION 008: Billing Catalog Snapshot
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- Migration 008 — Add catalog_snapshot to billing_line_items
-- ============================================================================
-- Stores a point-in-time snapshot of the catalog item's metadata at the moment
-- a billing line is created. This means renaming or recategorizing a catalog
-- item never changes historical billing records.
--
-- Shape written at creation time:
-- {
--   "name": "Processing Fee",
--   "unit_type": "per_entry",
--   "tax_code": "VAT",
--   "category_name": "Government Fees",
--   "default_price": 1500.00,
--   "currency": "PHP"
-- }
-- ============================================================================

ALTER TABLE billing_line_items
  ADD COLUMN IF NOT EXISTS catalog_snapshot JSONB DEFAULT '{}';


-- ────────────────────────────────────────────────────────────
-- MIGRATION 009: Catalog Type Backfill
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- Migration 009 — Catalog type architecture: schema + data backfill
-- ============================================================================
-- Fixes five gaps found by live DB audit (2026-03-20):
--
--   1. ADD catalog_items.type column (was missing entirely)
--   2. ADD evouchers.catalog_item_id column (expenses had no catalog link)
--   3. Backfill charge_type_code on old items missing it (ci-001 → ci-019)
--   4. Backfill catalog_items.type on all existing items
--   5. Insert expense-type catalog items (vendor cost side)
--   6. Link seeded billing_line_items to catalog by best-match description
--   7. Backfill catalog_snapshot on now-linked billing lines
--
-- Safe to run multiple times (idempotent via IF NOT EXISTS / WHERE guards).
-- ============================================================================


-- ============================================================================
-- FIX 1 — Add type column to catalog_items
-- ============================================================================

ALTER TABLE catalog_items
  ADD COLUMN IF NOT EXISTS type TEXT
  CHECK (type IN ('charge', 'expense', 'both'))
  DEFAULT 'charge';


-- ============================================================================
-- FIX 2 — Add catalog_item_id to evouchers (expense ↔ catalog link)
-- ============================================================================

ALTER TABLE evouchers
  ADD COLUMN IF NOT EXISTS catalog_item_id TEXT REFERENCES catalog_items(id);


-- ============================================================================
-- FIX 3 — Backfill charge_type_code on old items that are missing it
-- ============================================================================

UPDATE catalog_items SET charge_type_code = 'origin_documentation_fee'    WHERE id = 'ci-001' AND charge_type_code IS NULL;
UPDATE catalog_items SET charge_type_code = 'origin_container_seal'        WHERE id = 'ci-002' AND charge_type_code IS NULL;
UPDATE catalog_items SET charge_type_code = 'export_customs_clearance'     WHERE id = 'ci-003' AND charge_type_code IS NULL;
UPDATE catalog_items SET charge_type_code = 'ocean_freight_fcl_20ft'       WHERE id = 'ci-004' AND charge_type_code IS NULL;
UPDATE catalog_items SET charge_type_code = 'ocean_freight_fcl_40ft'       WHERE id = 'ci-005' AND charge_type_code IS NULL;
UPDATE catalog_items SET charge_type_code = 'baf'                          WHERE id = 'ci-006' AND charge_type_code IS NULL;
UPDATE catalog_items SET charge_type_code = 'destination_documentation_fee' WHERE id = 'ci-007' AND charge_type_code IS NULL;
UPDATE catalog_items SET charge_type_code = 'customs_examination_fee'      WHERE id = 'ci-008' AND charge_type_code IS NULL;
UPDATE catalog_items SET charge_type_code = 'port_handling_cy'             WHERE id = 'ci-009' AND charge_type_code IS NULL;
UPDATE catalog_items SET charge_type_code = 'formal_entry_processing'      WHERE id = 'ci-010' AND charge_type_code IS NULL;
UPDATE catalog_items SET charge_type_code = 'import_duties_taxes'          WHERE id = 'ci-011' AND charge_type_code IS NULL;
UPDATE catalog_items SET charge_type_code = 'peza_boi_facilitation'        WHERE id = 'ci-013' AND charge_type_code IS NULL;
UPDATE catalog_items SET charge_type_code = 'trucking_port_to_warehouse'   WHERE id = 'ci-014' AND charge_type_code IS NULL;
UPDATE catalog_items SET charge_type_code = 'trucking_provincial_surcharge' WHERE id = 'ci-015' AND charge_type_code IS NULL;
UPDATE catalog_items SET charge_type_code = 'trucking_loading_labor'       WHERE id = 'ci-016' AND charge_type_code IS NULL;
UPDATE catalog_items SET charge_type_code = 'marine_insurance_all_risk'    WHERE id = 'ci-017' AND charge_type_code IS NULL;
UPDATE catalog_items SET charge_type_code = 'marine_insurance_war_risk'    WHERE id = 'ci-018' AND charge_type_code IS NULL;
UPDATE catalog_items SET charge_type_code = 'warehousing_per_day'          WHERE id = 'ci-019' AND charge_type_code IS NULL;
UPDATE catalog_items SET charge_type_code = 'miscellaneous_expenses'       WHERE id = 'ci-020' AND charge_type_code IS NULL;


-- ============================================================================
-- FIX 4 — Backfill type on all existing charge items
-- ============================================================================

-- Standard charges: billed to clients (revenue side)
UPDATE catalog_items
SET type = 'charge'
WHERE id IN (
  'ci-001',  -- Origin Documentation Fee
  'ci-002',  -- Origin Container Seal
  'ci-003',  -- Export Customs Clearance
  'ci-004',  -- Ocean Freight FCL 20ft
  'ci-005',  -- Ocean Freight FCL 40ft
  'ci-006',  -- BAF
  'ci-007',  -- Destination Documentation Fee
  'ci-008',  -- Customs Examination Fee
  'ci-009',  -- Port Handling CY
  'ci-010',  -- Formal Entry Processing
  'ci-012',  -- BOC Processing Fee
  'ci-013',  -- PEZA/BOI Facilitation
  'ci-014',  -- Trucking Port to Warehouse
  'ci-015',  -- Trucking Provincial Surcharge
  'ci-016',  -- Trucking Loading Labor
  'ci-017',  -- Marine Insurance Premium All Risk
  'ci-018',  -- Marine Insurance War Risk
  'ci-019',  -- Warehousing per day
  -- Migration 007 registry presets
  'ci-101',  -- Documentation Fee (Brokerage)
  'ci-102',  -- Handling Fee
  'ci-103',  -- Brokerage Fee
  'ci-104',  -- Stamps and Notary
  'ci-105',  -- Examination Fee
  'ci-106',  -- DEA Examination
  'ci-107',  -- BAI Processing
  'ci-108',  -- 20ft / 40ft (Trucking)
  'ci-109',  -- Back to Back
  'ci-110',  -- 4-Wheeler
  'ci-111'   -- 6-Wheeler
)
AND (type IS NULL OR type = 'charge');

-- Import Duties & Taxes: disbursed as expense, recharged to client → 'both'
UPDATE catalog_items SET type = 'both'  WHERE id = 'ci-011' AND (type IS NULL OR type = 'charge');

-- Miscellaneous Expenses: can be either side → 'both'
UPDATE catalog_items SET type = 'both'  WHERE id = 'ci-020' AND (type IS NULL OR type = 'charge');


-- ============================================================================
-- FIX 5 — Insert expense-type catalog items (vendor cost side)
-- ============================================================================

INSERT INTO catalog_items (
  id, name, type, category_id, description,
  currency, unit_type, tax_code, is_active, service_types, sort_order,
  charge_type_code
)
VALUES
  (
    'ci-201', 'Shipping Line Charges', 'expense', 'cat-001',
    'Freight charges paid to the shipping line / carrier on behalf of the booking',
    'PHP', 'per_container', 'ZR', true, ARRAY['Forwarding'], 50,
    'shipping_line_charges'
  ),
  (
    'ci-202', 'Origin Agent Fee', 'expense', 'cat-002',
    'Fees paid to the origin agent or overseas partner for handling at port of loading',
    'PHP', 'per_shipment', 'ZR', true, ARRAY['Forwarding'], 51,
    'origin_agent_fee'
  ),
  (
    'ci-203', 'Customs Agent Disbursement', 'expense', 'cat-004',
    'Out-of-pocket duties, taxes, and fees paid by the broker to BOC on behalf of client',
    'PHP', 'per_shipment', 'NVAT', true, ARRAY['Brokerage'], 52,
    'customs_agent_disbursement'
  ),
  (
    'ci-204', 'Truck Hire Cost', 'expense', 'cat-003',
    'Third-party trucking cost paid to the sub-contractor hauler',
    'PHP', 'per_container', 'VAT', true, ARRAY['Trucking'], 53,
    'truck_hire_cost'
  ),
  (
    'ci-205', 'Insurance Premium (Outward)', 'expense', 'cat-001',
    'Premium paid to the insurer for marine coverage',
    'PHP', 'flat_fee', 'VAT', true, ARRAY['Marine Insurance'], 54,
    'insurance_premium_outward'
  ),
  (
    'ci-206', 'Port Agency Fee', 'expense', 'cat-002',
    'Fees charged by the port agent at origin or destination',
    'PHP', 'per_shipment', 'ZR', true, ARRAY['Forwarding', 'Brokerage'], 55,
    'port_agency_fee'
  ),
  (
    'ci-207', 'Arrastre & Wharfage (Cost)', 'expense', 'cat-003',
    'PPA arrastre and wharfage charges paid directly by the company',
    'PHP', 'per_container', 'NVAT', true, ARRAY['Brokerage', 'Forwarding'], 56,
    'arrastre_wharfage_cost'
  )
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- FIX 6 — Link seeded billing_line_items to catalog by best-match description
-- ============================================================================
-- All 15 seeded rows have catalog_item_id = NULL because they predate the
-- catalog architecture. Best-effort match by description keyword below.
-- Only updates rows that are currently unlinked (idempotent).
-- ============================================================================

-- "Ocean Freight — FCL *" → ci-004 (FCL 20ft) as representative charge
UPDATE billing_line_items SET catalog_item_id = 'ci-004'
WHERE catalog_item_id IS NULL AND description ILIKE '%ocean freight%fcl%';

-- "Documentation & B/L Fee" → ci-101 Documentation Fee (Brokerage)
UPDATE billing_line_items SET catalog_item_id = 'ci-101'
WHERE catalog_item_id IS NULL AND description ILIKE '%documentation%';

-- "Port Charges — MICP" → ci-009 Port Handling CY
UPDATE billing_line_items SET catalog_item_id = 'ci-009'
WHERE catalog_item_id IS NULL AND description ILIKE '%port charges%';

-- "Origin Charges — *" → ci-001 Origin Documentation Fee
UPDATE billing_line_items SET catalog_item_id = 'ci-001'
WHERE catalog_item_id IS NULL AND description ILIKE '%origin charges%';

-- "Customs Brokerage Professional Fee" → ci-103 Brokerage Fee
UPDATE billing_line_items SET catalog_item_id = 'ci-103'
WHERE catalog_item_id IS NULL AND description ILIKE '%brokerage%fee%' OR description ILIKE '%professional fee%';

-- "Trucking — Port of Manila to *" → ci-014 Trucking Port to Warehouse
UPDATE billing_line_items SET catalog_item_id = 'ci-014'
WHERE catalog_item_id IS NULL AND description ILIKE '%trucking%port%';

-- "Marine Cargo Insurance Premium — All Risk" → ci-017
UPDATE billing_line_items SET catalog_item_id = 'ci-017'
WHERE catalog_item_id IS NULL AND description ILIKE '%marine%insurance%';

-- "Warehousing — Storage & Handling" → ci-019
UPDATE billing_line_items SET catalog_item_id = 'ci-019'
WHERE catalog_item_id IS NULL AND description ILIKE '%warehousing%';

-- "Cargo Consolidation & Repacking" → ci-020 Miscellaneous Expenses (closest match)
UPDATE billing_line_items SET catalog_item_id = 'ci-020'
WHERE catalog_item_id IS NULL AND description ILIKE '%consolidation%';


-- ============================================================================
-- FIX 7 — Backfill catalog_snapshot on now-linked billing line items
-- ============================================================================

UPDATE billing_line_items bli
SET catalog_snapshot = jsonb_build_object(
  'name',          ci.name,
  'charge_type_code', ci.charge_type_code,
  'type',          ci.type,
  'unit_type',     ci.unit_type,
  'tax_code',      ci.tax_code,
  'category_name', COALESCE(cc.name, ''),
  'default_price', COALESCE(ci.default_price, 0),
  'currency',      COALESCE(ci.currency, 'PHP')
)
FROM catalog_items ci
LEFT JOIN catalog_categories cc ON cc.id = ci.category_id
WHERE bli.catalog_item_id = ci.id
  AND (
    bli.catalog_snapshot IS NULL
    OR bli.catalog_snapshot = '{}'::jsonb
  );


-- ============================================================================
-- VERIFY — confirm all fixes applied
-- ============================================================================

-- 1. Type distribution (should show charge, both, expense)
SELECT COALESCE(type, 'NULL') AS type, COUNT(*) AS count
FROM catalog_items GROUP BY type ORDER BY type;

-- 2. Any items still missing charge_type_code?
SELECT id, name FROM catalog_items WHERE charge_type_code IS NULL ORDER BY id;

-- 3. billing_line_items linkage summary
SELECT
  COUNT(*)                                                         AS total_lines,
  COUNT(catalog_item_id)                                           AS linked,
  COUNT(*) - COUNT(catalog_item_id)                                AS unlinked,
  COUNT(*) FILTER (WHERE catalog_snapshot != '{}'::jsonb
                    AND catalog_snapshot IS NOT NULL)              AS with_snapshot
FROM billing_line_items;

-- 4. Expense items inserted
SELECT id, name, type, charge_type_code FROM catalog_items WHERE type IN ('expense','both') ORDER BY id;


-- ────────────────────────────────────────────────────────────
-- MIGRATION 010: Inbox Messaging
-- ────────────────────────────────────────────────────────────
-- 010_inbox_messaging.sql
-- Replaces old tickets/ticket_types with the full Inbox Messaging schema.
-- Old tables had only seed data (4 rows) — safe to drop.

-- ─── Drop old tables ────────────────────────────────────────────────────────
DROP TABLE IF EXISTS ticket_types CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;

-- ─── 1. tickets — thread container (metadata only) ──────────────────────────
CREATE TABLE tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject         text NOT NULL,
  type            text NOT NULL CHECK (type IN ('fyi', 'action_required', 'urgent')),
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'open', 'pending', 'resolved', 'archived')),
  created_by      text REFERENCES users(id) NOT NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  last_message_at timestamptz DEFAULT now(),
  resolved_at     timestamptz,
  resolved_by     text REFERENCES users(id)
);

-- ─── 2. ticket_participants — who is in the thread ──────────────────────────
CREATE TABLE ticket_participants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id        uuid REFERENCES tickets(id) ON DELETE CASCADE NOT NULL,
  participant_type text NOT NULL CHECK (participant_type IN ('user', 'department')),
  user_id          text REFERENCES users(id),
  department       text,
  role             text NOT NULL CHECK (role IN ('sender', 'to', 'cc')),
  added_by         text REFERENCES users(id) NOT NULL,
  added_at         timestamptz DEFAULT now(),
  CONSTRAINT chk_participant_target CHECK (
    (participant_type = 'user'       AND user_id IS NOT NULL AND department IS NULL) OR
    (participant_type = 'department' AND department IS NOT NULL AND user_id IS NULL)
  )
);

-- ─── 3. ticket_assignments — dept ticket assigned to specific rep ────────────
CREATE TABLE ticket_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     uuid REFERENCES tickets(id) ON DELETE CASCADE NOT NULL,
  department    text NOT NULL,
  assigned_to   text REFERENCES users(id) NOT NULL,
  assigned_by   text REFERENCES users(id) NOT NULL,
  assigned_at   timestamptz DEFAULT now(),
  note          text
);

-- ─── 4. ticket_messages — all messages + system events in one table ──────────
CREATE TABLE ticket_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id        uuid REFERENCES tickets(id) ON DELETE CASCADE NOT NULL,
  sender_id        text REFERENCES users(id) NOT NULL,
  body             text,
  is_system        boolean NOT NULL DEFAULT false,
  system_event     text,
  system_metadata  jsonb,
  is_retracted     boolean NOT NULL DEFAULT false,
  retracted_at     timestamptz,
  retracted_by     text REFERENCES users(id),
  created_at       timestamptz DEFAULT now()
);

-- ─── 5. ticket_attachments — file uploads AND entity links per message ───────
CREATE TABLE ticket_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       uuid REFERENCES tickets(id) ON DELETE CASCADE NOT NULL,
  message_id      uuid REFERENCES ticket_messages(id) ON DELETE CASCADE NOT NULL,
  attachment_type text NOT NULL CHECK (attachment_type IN ('file', 'entity')),
  -- file fields
  file_path       text,
  file_name       text,
  file_size       integer,
  file_mime_type  text,
  -- entity link fields
  entity_type     text,
  entity_id       text,
  entity_label    text,
  uploaded_by     text REFERENCES users(id) NOT NULL,
  created_at      timestamptz DEFAULT now()
);

-- ─── 6. ticket_read_receipts — unread state per user per thread ─────────────
CREATE TABLE ticket_read_receipts (
  ticket_id            uuid REFERENCES tickets(id) ON DELETE CASCADE NOT NULL,
  user_id              text REFERENCES users(id) NOT NULL,
  last_read_at         timestamptz DEFAULT now(),
  last_read_message_id uuid REFERENCES ticket_messages(id),
  PRIMARY KEY (ticket_id, user_id)
);

-- ─── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX idx_tickets_created_by        ON tickets(created_by);
CREATE INDEX idx_tickets_last_message_at   ON tickets(last_message_at DESC);
CREATE INDEX idx_tickets_status            ON tickets(status);
CREATE INDEX idx_tp_ticket_id              ON ticket_participants(ticket_id);
CREATE INDEX idx_tp_user_id               ON ticket_participants(user_id);
CREATE INDEX idx_tp_department            ON ticket_participants(department);
CREATE INDEX idx_tm_ticket_id             ON ticket_messages(ticket_id);
CREATE INDEX idx_tm_created_at            ON ticket_messages(created_at);
CREATE INDEX idx_ta_message_id            ON ticket_attachments(message_id);
CREATE INDEX idx_trr_user_id              ON ticket_read_receipts(user_id);

-- ─── RPC: get_inbox_threads ─────────────────────────────────────────────────
-- Returns all threads the calling user should see in their Inbox tab.
-- Covers: direct participant, dept-addressed (managers only), assigned.
CREATE OR REPLACE FUNCTION get_inbox_threads(
  p_user_id text,
  p_dept    text,
  p_role    text
)
RETURNS TABLE (
  id              uuid,
  subject         text,
  type            text,
  status          text,
  created_by      text,
  created_at      timestamptz,
  updated_at      timestamptz,
  last_message_at timestamptz,
  resolved_at     timestamptz,
  resolved_by     text
)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT
    t.id, t.subject, t.type, t.status, t.created_by,
    t.created_at, t.updated_at, t.last_message_at,
    t.resolved_at, t.resolved_by
  FROM tickets t
  WHERE t.status != 'draft'
    AND (
      EXISTS (
        SELECT 1 FROM ticket_participants tp
        WHERE tp.ticket_id = t.id
          AND tp.participant_type = 'user'
          AND tp.user_id = p_user_id
          AND tp.role IN ('to', 'cc')
      )
      OR EXISTS (
        SELECT 1 FROM ticket_assignments ta
        WHERE ta.ticket_id = t.id AND ta.assigned_to = p_user_id
      )
      OR (
        p_role IN ('manager', 'director')
        AND EXISTS (
          SELECT 1 FROM ticket_participants tp
          WHERE tp.ticket_id = t.id
            AND tp.participant_type = 'department'
            AND tp.department = p_dept
        )
      )
    )
  ORDER BY t.last_message_at DESC;
$$;

-- ─── RPC: get_unread_count ───────────────────────────────────────────────────
-- Returns total unread thread count for a user (for sidebar badge).
CREATE OR REPLACE FUNCTION get_unread_count(p_user_id text, p_dept text, p_role text)
RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::integer
  FROM (
    SELECT DISTINCT t.id
    FROM tickets t
    WHERE t.status != 'draft'
      AND (
        EXISTS (
          SELECT 1 FROM ticket_participants tp
          WHERE tp.ticket_id = t.id AND tp.participant_type = 'user'
            AND tp.user_id = p_user_id AND tp.role IN ('to', 'cc')
        )
        OR EXISTS (
          SELECT 1 FROM ticket_assignments ta
          WHERE ta.ticket_id = t.id AND ta.assigned_to = p_user_id
        )
        OR (
          p_role IN ('manager', 'director')
          AND EXISTS (
            SELECT 1 FROM ticket_participants tp
            WHERE tp.ticket_id = t.id AND tp.participant_type = 'department'
              AND tp.department = p_dept
          )
        )
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM ticket_read_receipts rr
          WHERE rr.ticket_id = t.id AND rr.user_id = p_user_id
        )
        OR EXISTS (
          SELECT 1 FROM ticket_read_receipts rr
          WHERE rr.ticket_id = t.id AND rr.user_id = p_user_id
            AND t.last_message_at > rr.last_read_at
        )
      )
  ) unread;
$$;


-- ────────────────────────────────────────────────────────────
-- MIGRATION 011: Workflow Columns
-- ────────────────────────────────────────────────────────────
-- 011_workflow_columns.sql
-- Reconciles tickets + ticket_participants schema with the inbox messaging UI.
-- All statements are defensive (IF NOT EXISTS / IF EXISTS).

-- ─── 1. tickets — add missing workflow columns ────────────────────────────────

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS linked_record_type text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS linked_record_id text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolution_action text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS auto_created boolean DEFAULT false;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal'
  CHECK (priority IN ('normal', 'urgent'));

-- Return workflow columns
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS return_reason text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS returned_at timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS returned_by text REFERENCES users(id);

-- Approval workflow columns
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS approval_result text
  CHECK (approval_result IN ('approved', 'rejected'));
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS approval_decided_at timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS approval_decided_by text REFERENCES users(id);

-- Status enum expansion: add statuses used by inbox UI
-- Drop old constraint, re-add with full set
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
  CHECK (status IN ('draft', 'open', 'acknowledged', 'in_progress', 'pending', 'done', 'resolved', 'returned', 'archived'));

-- Type enum expansion
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_type_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_type_check
  CHECK (type IN ('fyi', 'request', 'approval', 'action_required', 'urgent'));

-- ─── 2. ticket_participants — rename columns to match app code ────────────────
-- App code uses participant_user_id / participant_dept everywhere.
-- Migration 010 created user_id / department.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_participants' AND column_name = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_participants' AND column_name = 'participant_user_id'
  ) THEN
    ALTER TABLE ticket_participants RENAME COLUMN user_id TO participant_user_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_participants' AND column_name = 'department'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ticket_participants' AND column_name = 'participant_dept'
  ) THEN
    ALTER TABLE ticket_participants RENAME COLUMN department TO participant_dept;
  END IF;
END $$;

-- Update the participant constraint to use new column names
ALTER TABLE ticket_participants DROP CONSTRAINT IF EXISTS chk_participant_target;
ALTER TABLE ticket_participants ADD CONSTRAINT chk_participant_target CHECK (
  (participant_type = 'user'       AND participant_user_id IS NOT NULL AND participant_dept IS NULL) OR
  (participant_type = 'department' AND participant_dept IS NOT NULL AND participant_user_id IS NULL)
);

-- ─── 3. ticket_assignments — rename department if needed ──────────────────────
-- ticket_assignments.department stays as-is (no mismatch in app code)

-- ─── 4. Update RPCs to use renamed columns ────────────────────────────────────

DROP FUNCTION IF EXISTS get_inbox_threads(text,text,text);
DROP FUNCTION IF EXISTS get_unread_count(text,text,text);

CREATE OR REPLACE FUNCTION get_inbox_threads(
  p_user_id text,
  p_dept    text,
  p_role    text
)
RETURNS TABLE (
  id              uuid,
  subject         text,
  type            text,
  status          text,
  priority        text,
  created_by      text,
  created_at      timestamptz,
  updated_at      timestamptz,
  last_message_at timestamptz,
  resolved_at     timestamptz,
  resolved_by     text,
  linked_record_type text,
  linked_record_id   text,
  auto_created    boolean
)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT
    t.id, t.subject, t.type, t.status, t.priority, t.created_by,
    t.created_at, t.updated_at, t.last_message_at,
    t.resolved_at, t.resolved_by,
    t.linked_record_type, t.linked_record_id, t.auto_created
  FROM tickets t
  WHERE t.status NOT IN ('draft', 'archived')
    AND (
      EXISTS (
        SELECT 1 FROM ticket_participants tp
        WHERE tp.ticket_id = t.id
          AND tp.participant_type = 'user'
          AND tp.participant_user_id = p_user_id
          AND tp.role IN ('to', 'cc')
      )
      OR EXISTS (
        SELECT 1 FROM ticket_assignments ta
        WHERE ta.ticket_id = t.id AND ta.assigned_to = p_user_id
      )
      OR (
        p_role IN ('manager', 'director')
        AND EXISTS (
          SELECT 1 FROM ticket_participants tp
          WHERE tp.ticket_id = t.id
            AND tp.participant_type = 'department'
            AND tp.participant_dept = p_dept
        )
      )
    )
  ORDER BY t.last_message_at DESC;
$$;

CREATE OR REPLACE FUNCTION get_unread_count(p_user_id text, p_dept text, p_role text)
RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::integer
  FROM (
    SELECT DISTINCT t.id
    FROM tickets t
    WHERE t.status NOT IN ('draft', 'archived')
      AND (
        EXISTS (
          SELECT 1 FROM ticket_participants tp
          WHERE tp.ticket_id = t.id AND tp.participant_type = 'user'
            AND tp.participant_user_id = p_user_id AND tp.role IN ('to', 'cc')
        )
        OR EXISTS (
          SELECT 1 FROM ticket_assignments ta
          WHERE ta.ticket_id = t.id AND ta.assigned_to = p_user_id
        )
        OR (
          p_role IN ('manager', 'director')
          AND EXISTS (
            SELECT 1 FROM ticket_participants tp
            WHERE tp.ticket_id = t.id AND tp.participant_type = 'department'
              AND tp.participant_dept = p_dept
          )
        )
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM ticket_read_receipts rr
          WHERE rr.ticket_id = t.id AND rr.user_id = p_user_id
        )
        OR EXISTS (
          SELECT 1 FROM ticket_read_receipts rr
          WHERE rr.ticket_id = t.id AND rr.user_id = p_user_id
            AND t.last_message_at > rr.last_read_at
        )
      )
  ) unread;
$$;

-- ─── 5. Indexes for new columns ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tickets_linked_record
  ON tickets(linked_record_type, linked_record_id)
  WHERE linked_record_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);

-- Rebuild participant indexes for renamed columns
DROP INDEX IF EXISTS idx_tp_user_id;
DROP INDEX IF EXISTS idx_tp_department;
CREATE INDEX IF NOT EXISTS idx_tp_participant_user_id ON ticket_participants(participant_user_id);
CREATE INDEX IF NOT EXISTS idx_tp_participant_dept ON ticket_participants(participant_dept);


-- ────────────────────────────────────────────────────────────
-- MIGRATION 012: Performance Indexes
-- ────────────────────────────────────────────────────────────
-- 012_performance_indexes.sql
-- Performance indexes for 30-concurrent-user scale on Supabase Free tier.
-- All IF NOT EXISTS — safe to re-run.

-- billing_line_items — already has idx_bli_booking, idx_bli_project from 001
-- Add project_number index (used by financial RPC joins)
CREATE INDEX IF NOT EXISTS idx_bli_project_number ON billing_line_items(project_number);

-- invoices — customer + status combo for filtered lookups
CREATE INDEX IF NOT EXISTS idx_invoices_customer_status ON invoices(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_booking_id ON invoices(booking_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project_number ON invoices(project_number);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);

-- collections — invoice linkage + date ordering
CREATE INDEX IF NOT EXISTS idx_collections_invoice_id ON collections(invoice_id);
CREATE INDEX IF NOT EXISTS idx_collections_created_at ON collections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collections_project_number ON collections(project_number);

-- evouchers — filtered by transaction_type + status in report hooks
CREATE INDEX IF NOT EXISTS idx_evouchers_project_number ON evouchers(project_number);
CREATE INDEX IF NOT EXISTS idx_evouchers_type_status ON evouchers(transaction_type, status);

-- tickets — status + date for inbox queries
CREATE INDEX IF NOT EXISTS idx_tickets_status_created ON tickets(status, created_at DESC);


-- ────────────────────────────────────────────────────────────
-- MIGRATION 013: Financial Summary RPC
-- ────────────────────────────────────────────────────────────
-- 013_financial_summary_rpc.sql
-- Server-side financial health summary using pre-aggregated CTEs.
-- Replaces the 5-table full scan in useFinancialHealthReport with a single RPC call.
--
-- IMPORTANT: Uses CTEs to aggregate each child table BEFORE joining,
-- avoiding the cartesian product bug that SUM(DISTINCT) across multiple
-- one-to-many joins produces.

CREATE OR REPLACE FUNCTION get_financial_health_summary(p_month text DEFAULT NULL)
RETURNS TABLE (
  project_number   text,
  project_date     timestamptz,
  customer_name    text,
  invoice_numbers  text[],
  billing_total    numeric,
  expenses_total   numeric,
  collected_amount numeric,
  gross_profit     numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH
    -- Pre-aggregate billing totals per project (exclude voided items)
    billing_agg AS (
      SELECT
        bli.project_number AS pn,
        COALESCE(SUM(bli.amount), 0) AS total
      FROM billing_line_items bli
      WHERE bli.project_number IS NOT NULL
        AND bli.status NOT IN ('voided', 'void', 'cancelled')
      GROUP BY bli.project_number
    ),

    -- Pre-aggregate expense totals per project (only approved/posted/paid evouchers)
    expense_agg AS (
      SELECT
        ev.project_number AS pn,
        COALESCE(SUM(ev.amount), 0) AS total
      FROM evouchers ev
      WHERE ev.project_number IS NOT NULL
        AND ev.transaction_type IN ('expense', 'budget_request')
        AND ev.status IN ('approved', 'posted', 'paid', 'partial')
      GROUP BY ev.project_number
    ),

    -- Pre-aggregate invoice numbers per project (exclude reversed/draft invoices)
    invoice_agg AS (
      SELECT
        i.project_number AS pn,
        array_agg(DISTINCT i.invoice_number) FILTER (WHERE i.invoice_number IS NOT NULL) AS numbers,
        array_agg(DISTINCT i.id) FILTER (WHERE i.id IS NOT NULL) AS ids
      FROM invoices i
      WHERE i.project_number IS NOT NULL
        AND i.status NOT IN ('reversed', 'reversal_draft', 'reversal_posted', 'draft')
      GROUP BY i.project_number
    ),

    -- Pre-aggregate collections per project (via invoice linkage, exclude non-applied)
    collection_agg AS (
      SELECT
        i.project_number AS pn,
        COALESCE(SUM(col.amount), 0) AS total
      FROM collections col
      INNER JOIN invoices i ON i.id = col.invoice_id
      WHERE i.project_number IS NOT NULL
        AND col.status NOT IN ('draft', 'cancelled', 'voided', 'void', 'credited', 'refunded')
      GROUP BY i.project_number
    )

  SELECT
    p.project_number,
    COALESCE(p.created_at, now()) AS project_date,
    COALESCE(c.name, p.customer_name, '—') AS customer_name,
    COALESCE(ia.numbers, ARRAY[]::text[]) AS invoice_numbers,
    COALESCE(ba.total, 0) AS billing_total,
    COALESCE(ea.total, 0) AS expenses_total,
    COALESCE(ca.total, 0) AS collected_amount,
    COALESCE(ba.total, 0) - COALESCE(ea.total, 0) AS gross_profit
  FROM projects p
  LEFT JOIN customers c ON c.id = p.customer_id
  LEFT JOIN billing_agg ba ON ba.pn = p.project_number
  LEFT JOIN expense_agg ea ON ea.pn = p.project_number
  LEFT JOIN invoice_agg ia ON ia.pn = p.project_number
  LEFT JOIN collection_agg ca ON ca.pn = p.project_number
  WHERE
    -- Optional month filter on project creation date
    (p_month IS NULL OR to_char(p.created_at, 'YYYY-MM') = p_month)
    -- Only include projects with financial activity
    AND (
      COALESCE(ba.total, 0) > 0
      OR COALESCE(ea.total, 0) > 0
      OR COALESCE(ca.total, 0) > 0
    )
  ORDER BY p.created_at DESC;
END $$;


-- ────────────────────────────────────────────────────────────
-- MIGRATION 015: Billing Source Columns
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- Migration 015 — billing_line_items: source tracking columns
-- ============================================================================
-- These four columns track the origin of each billing item and are required by
-- several core systems that have been writing/reading them against the DB:
--
--   useBillingMerge.ts          deduplicates virtual quotation items against
--                               real billing items via source_quotation_item_id.
--                               Without this column the dedup map is always
--                               empty → quotation lines and their real billing
--                               item counterparts appear as duplicates.
--
--   UnifiedExpensesTab.tsx      handleConvert inserts source_type = 'billable_expense'
--                               and source_id = evoucher.id when converting a
--                               billable expense to an unbilled billing item.
--
--   rateCardToBilling.ts        inserts source_type = 'contract_rate' and source_id
--                               when applying a contract rate card to a booking.
--
--   BudgetRequestDetailPanel.tsx inserts source_type = 'billable_expense' and
--                               source_id = budget_request.id.
--
--   AddChargeModal.tsx /        insert source_type = 'manual' for manual charges.
--   BillingCategorySection.tsx
--
--   BookingRateCardButton.tsx   filters items by source_type = 'rate_card'.
--
-- None of these columns existed in the DB prior to this migration, causing all
-- of the above INSERT paths to fail silently at the PostgREST layer.
-- ============================================================================

ALTER TABLE billing_line_items
  ADD COLUMN IF NOT EXISTS source_id                TEXT,
  ADD COLUMN IF NOT EXISTS source_type              TEXT,
  ADD COLUMN IF NOT EXISTS source_quotation_item_id TEXT,
  ADD COLUMN IF NOT EXISTS quotation_category       TEXT;

-- Reverse-lookup indexes:
--   "has this expense / quotation item already been converted to a billing item?"
-- Used by UnifiedExpensesTab.tsx to build the billedSourceIds Set and by
-- useBillingMerge.ts to build realItemIndices.
CREATE INDEX IF NOT EXISTS idx_bli_source_id
  ON billing_line_items (source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bli_source_type
  ON billing_line_items (source_type)
  WHERE source_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bli_source_qitem
  ON billing_line_items (source_quotation_item_id)
  WHERE source_quotation_item_id IS NOT NULL;


-- ────────────────────────────────────────────────────────────
-- MIGRATION 016: Tickets RLS
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- Migration 016 — tickets: enable Row Level Security
-- ============================================================================
-- Migration 010 (inbox_messaging) rebuilt the tickets table but did not enable
-- RLS. Migrations 004/005 applied RLS to all other user-facing tables.
-- This migration closes that gap.
--
-- Policy model:
--   - service_role: full bypass (for migrations and server-side operations)
--   - authenticated SELECT: all authenticated users can read tickets
--   - authenticated INSERT: all authenticated users can create tickets
--   - authenticated UPDATE: creator, or any manager/director, or any Executive
--   - authenticated DELETE: director or Executive only
-- ============================================================================

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- Service role bypass (required for migrations and admin operations)
CREATE POLICY "tickets_service_role"
  ON tickets FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- All authenticated users can read tickets
CREATE POLICY "tickets_select"
  ON tickets FOR SELECT
  TO authenticated
  USING (true);

-- All authenticated users can create tickets
CREATE POLICY "tickets_insert"
  ON tickets FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Creator, managers, directors, and Executive dept can update
CREATE POLICY "tickets_update"
  ON tickets FOR UPDATE
  TO authenticated
  USING (
    created_by = get_my_profile_id()
    OR get_my_role() IN ('manager', 'director')
    OR get_my_department() = 'Executive'
  )
  WITH CHECK (
    created_by = get_my_profile_id()
    OR get_my_role() IN ('manager', 'director')
    OR get_my_department() = 'Executive'
  );

-- Only directors and Executive dept can delete tickets
CREATE POLICY "tickets_delete"
  ON tickets FOR DELETE
  TO authenticated
  USING (
    get_my_role() = 'director'
    OR get_my_department() = 'Executive'
  );


-- ────────────────────────────────────────────────────────────
-- MIGRATION 017: Contacts Name Columns
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- Migration 017 — contacts: add first_name and last_name columns
-- ============================================================================
-- The contacts table was created with only a `name` TEXT NOT NULL column.
-- All UI code expects separate first_name / last_name columns for search and
-- display. This migration adds them and backfills from the existing name field.
-- ============================================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_name  TEXT;

-- Backfill: store the full existing name in first_name for legacy rows.
-- New inserts from the app will provide both first_name and last_name.
UPDATE contacts
SET first_name = name
WHERE first_name IS NULL AND name IS NOT NULL;


-- ────────────────────────────────────────────────────────────
-- MIGRATION 018: RBAC Teams and Roles
-- ────────────────────────────────────────────────────────────
-- Migration 018: RBAC Refactor — Teams, Permission Overrides, Role Updates
-- Implements 4-tier scoped RBAC: executive | manager | team_leader | staff

-- ─────────────────────────────────────────────
-- 1. teams table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  department text NOT NULL,
  leader_id  text REFERENCES users(id) ON DELETE SET NULL,  -- users.id is text
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 2. permission_overrides table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permission_overrides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text REFERENCES users(id) ON DELETE CASCADE,   -- users.id is text
  scope       text NOT NULL CHECK (scope IN ('department_wide', 'cross_department', 'full')),
  departments text[],   -- populated when scope = 'cross_department'
  granted_by  text REFERENCES users(id) ON DELETE SET NULL,  -- users.id is text
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (user_id)
);

-- ─────────────────────────────────────────────
-- 3. Add team_id to users
-- ─────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────
-- 4. Role value migration
--    rep      → staff
--    director → manager
--    Operations: operations_role takes precedence
-- ─────────────────────────────────────────────

-- Step 4a: migrate operations users from operations_role first (most specific)
UPDATE users
SET role = CASE operations_role
  WHEN 'Handler'    THEN 'staff'
  WHEN 'Supervisor' THEN 'team_leader'
  WHEN 'Manager'    THEN 'manager'
  ELSE role
END
WHERE department = 'Operations'
  AND operations_role IS NOT NULL;

-- Step 4b: migrate remaining rep → staff, director → manager
UPDATE users SET role = 'staff'   WHERE role = 'rep';
UPDATE users SET role = 'manager' WHERE role = 'director';

-- ─────────────────────────────────────────────
-- 5. Drop old role CHECK constraint and add new one
-- ─────────────────────────────────────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('staff', 'team_leader', 'manager'));

-- ─────────────────────────────────────────────
-- 6. Seed the 5 Operations service teams
-- ─────────────────────────────────────────────
INSERT INTO teams (name, department) VALUES
  ('Forwarding',       'Operations'),
  ('Brokerage',        'Operations'),
  ('Trucking',         'Operations'),
  ('Marine Insurance', 'Operations'),
  ('Others',           'Operations')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
-- 7. Assign Operations users to their service team
--    based on existing service_type column
-- ─────────────────────────────────────────────
UPDATE users u
SET team_id = t.id
FROM teams t
WHERE u.department = 'Operations'
  AND u.service_type IS NOT NULL
  AND t.name = u.service_type
  AND t.department = 'Operations';

-- ─────────────────────────────────────────────
-- 8. updated_at triggers for new tables
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teams_updated_at ON teams;
CREATE TRIGGER teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS permission_overrides_updated_at ON permission_overrides;
CREATE TRIGGER permission_overrides_updated_at
  BEFORE UPDATE ON permission_overrides
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ────────────────────────────────────────────────────────────
-- MIGRATION 019: RBAC RLS v2
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- 019: RBAC RLS v2 — 4-tier scoped policies
-- ============================================================================
-- Updates helper functions and RLS policies to match the new role model:
--   staff (0) | team_leader (1) | manager (2)
-- Executive department auto-bypasses all filters.
-- permission_overrides can elevate individual user scope.
--
-- Prerequisites:
--   003_supabase_auth.sql — get_my_profile_id(), get_my_role(), get_my_department()
--   018_rbac_teams_and_roles.sql — teams, permission_overrides, users.team_id
-- ============================================================================


-- ============================================================================
-- STEP 1: New helper functions
-- ============================================================================

-- Returns current user's team_id (NULL if not in a team)
CREATE OR REPLACE FUNCTION public.get_my_team_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id FROM public.users WHERE auth_id = auth.uid();
$$;

-- Returns TRUE if the current user is in the Executive department
CREATE OR REPLACE FUNCTION public.is_executive()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT department = 'Executive' FROM public.users WHERE auth_id = auth.uid();
$$;

-- Returns IDs of all users in the same team as the current user
-- (used for team_leader scope)
CREATE OR REPLACE FUNCTION public.get_my_team_member_ids()
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY(
    SELECT id FROM public.users
    WHERE team_id = (SELECT team_id FROM public.users WHERE auth_id = auth.uid())
      AND team_id IS NOT NULL
  );
$$;

-- Returns the override scope for the current user ('department_wide', 'cross_department', 'full')
-- Returns NULL if no override exists
CREATE OR REPLACE FUNCTION public.get_my_override_scope()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT scope FROM public.permission_overrides
  WHERE user_id = get_my_profile_id()
  LIMIT 1;
$$;

-- Core scope predicate: does the current user have access to a record owned by owner_id?
-- owner_id: the TEXT user id in the owner/created_by column of the record
CREATE OR REPLACE FUNCTION public.can_access_record(owner_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Executive sees everything
    is_executive()
    -- Full override sees everything
    OR get_my_override_scope() = 'full'
    -- Manager sees all records in their department (no row-level restriction)
    OR get_my_role() = 'manager'
    -- Team leader sees team members' records
    OR (get_my_role() = 'team_leader' AND owner_id = ANY(get_my_team_member_ids()))
    -- Staff sees own records
    OR owner_id = get_my_profile_id()
    -- Null owner_id is visible to everyone (e.g. unassigned records)
    OR owner_id IS NULL;
$$;


-- ============================================================================
-- STEP 2: Drop stale policies that reference old roles
-- ============================================================================

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        policyname LIKE 'customers_%'
        OR policyname LIKE 'contacts_%'
        OR policyname LIKE 'tasks_%'
        OR policyname LIKE 'quotations_%'
        OR policyname LIKE 'bookings_%'
        OR policyname LIKE 'evouchers_%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;


-- ============================================================================
-- STEP 3: customers
-- ============================================================================

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_select" ON customers FOR SELECT TO authenticated
  USING (
    get_my_department() != 'HR'
    AND can_access_record(owner_id)
  );

CREATE POLICY "customers_insert" ON customers FOR INSERT TO authenticated
  WITH CHECK (
    get_my_department() IN ('Business Development', 'Executive')
    OR is_executive()
  );

CREATE POLICY "customers_update" ON customers FOR UPDATE TO authenticated
  USING (
    can_access_record(owner_id)
    AND get_my_department() IN ('Business Development', 'Executive')
    OR get_my_role() IN ('manager', 'team_leader')
  )
  WITH CHECK (
    get_my_department() IN ('Business Development', 'Executive')
    OR get_my_role() = 'manager'
  );

CREATE POLICY "customers_delete" ON customers FOR DELETE TO authenticated
  USING (
    (get_my_department() = 'Business Development' AND get_my_role() = 'manager')
    OR is_executive()
  );


-- ============================================================================
-- STEP 4: contacts
-- ============================================================================

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts_select" ON contacts FOR SELECT TO authenticated
  USING (
    get_my_department() != 'HR'
    AND can_access_record(owner_id)
  );

CREATE POLICY "contacts_insert" ON contacts FOR INSERT TO authenticated
  WITH CHECK (
    get_my_department() IN ('Business Development', 'Executive')
    OR is_executive()
  );

CREATE POLICY "contacts_update" ON contacts FOR UPDATE TO authenticated
  USING (
    can_access_record(owner_id)
    AND (
      get_my_department() IN ('Business Development', 'Executive')
      OR get_my_role() IN ('manager', 'team_leader')
    )
  )
  WITH CHECK (
    get_my_department() IN ('Business Development', 'Executive')
    OR get_my_role() = 'manager'
  );

CREATE POLICY "contacts_delete" ON contacts FOR DELETE TO authenticated
  USING (
    (get_my_department() = 'Business Development' AND get_my_role() = 'manager')
    OR is_executive()
  );


-- ============================================================================
-- STEP 5: tasks
-- ============================================================================

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select" ON tasks FOR SELECT TO authenticated
  USING (can_access_record(owner_id));

CREATE POLICY "tasks_insert" ON tasks FOR INSERT TO authenticated
  WITH CHECK (
    get_my_department() IN ('Business Development', 'Executive')
    OR is_executive()
  );

CREATE POLICY "tasks_update" ON tasks FOR UPDATE TO authenticated
  USING (can_access_record(owner_id))
  WITH CHECK (can_access_record(owner_id));

CREATE POLICY "tasks_delete" ON tasks FOR DELETE TO authenticated
  USING (
    can_access_record(owner_id) AND get_my_role() IN ('manager', 'team_leader')
    OR owner_id = get_my_profile_id()
    OR is_executive()
  );


-- ============================================================================
-- STEP 6: quotations (spot quotations + contracts)
-- ============================================================================

ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotations_select" ON quotations FOR SELECT TO authenticated
  USING (
    get_my_department() IN ('Pricing', 'Business Development', 'Executive', 'Operations', 'Accounting')
    AND can_access_record(created_by)
  );

CREATE POLICY "quotations_insert" ON quotations FOR INSERT TO authenticated
  WITH CHECK (
    get_my_department() IN ('Pricing', 'Business Development', 'Executive')
    OR is_executive()
  );

CREATE POLICY "quotations_update" ON quotations FOR UPDATE TO authenticated
  USING (
    can_access_record(created_by)
    AND get_my_department() IN ('Pricing', 'Business Development', 'Executive')
  )
  WITH CHECK (
    get_my_department() IN ('Pricing', 'Business Development', 'Executive')
    OR is_executive()
  );

CREATE POLICY "quotations_delete" ON quotations FOR DELETE TO authenticated
  USING (
    (get_my_role() = 'manager' AND get_my_department() IN ('Pricing', 'Business Development'))
    OR is_executive()
  );


-- ============================================================================
-- STEP 7: bookings (operations)
-- ============================================================================

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bookings_select" ON bookings FOR SELECT TO authenticated
  USING (
    get_my_department() IN ('Operations', 'Accounting', 'Executive')
    AND can_access_record(created_by)
  );

CREATE POLICY "bookings_insert" ON bookings FOR INSERT TO authenticated
  WITH CHECK (
    get_my_department() IN ('Operations', 'Executive')
    OR is_executive()
  );

CREATE POLICY "bookings_update" ON bookings FOR UPDATE TO authenticated
  USING (
    can_access_record(created_by)
    AND get_my_department() IN ('Operations', 'Executive')
  )
  WITH CHECK (
    get_my_department() IN ('Operations', 'Executive')
    OR is_executive()
  );

CREATE POLICY "bookings_delete" ON bookings FOR DELETE TO authenticated
  USING (
    (get_my_role() = 'manager' AND get_my_department() = 'Operations')
    OR is_executive()
  );


-- ============================================================================
-- STEP 8: evouchers (accounting expense requests)
-- ============================================================================

ALTER TABLE evouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evouchers_select" ON evouchers FOR SELECT TO authenticated
  USING (can_access_record(created_by));

CREATE POLICY "evouchers_insert" ON evouchers FOR INSERT TO authenticated
  WITH CHECK (true);  -- any authenticated user can submit an expense

CREATE POLICY "evouchers_update" ON evouchers FOR UPDATE TO authenticated
  USING (
    can_access_record(created_by)
    OR get_my_department() IN ('Accounting', 'Executive')
  )
  WITH CHECK (
    can_access_record(created_by)
    OR get_my_department() IN ('Accounting', 'Executive')
  );

CREATE POLICY "evouchers_delete" ON evouchers FOR DELETE TO authenticated
  USING (
    (created_by = get_my_profile_id() AND get_my_role() IN ('manager', 'team_leader'))
    OR (get_my_role() = 'manager' AND get_my_department() = 'Accounting')
    OR is_executive()
  );


-- ============================================================================
-- STEP 9: teams + permission_overrides — Executive-only management
-- ============================================================================

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams_select" ON teams FOR SELECT TO authenticated
  USING (true);  -- everyone can see team structure

CREATE POLICY "teams_manage" ON teams FOR ALL TO authenticated
  USING (is_executive())
  WITH CHECK (is_executive());

ALTER TABLE permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "overrides_select" ON permission_overrides FOR SELECT TO authenticated
  USING (
    user_id = get_my_profile_id()  -- see your own override
    OR is_executive()               -- executive manages all overrides
  );

CREATE POLICY "overrides_manage" ON permission_overrides FOR ALL TO authenticated
  USING (is_executive())
  WITH CHECK (is_executive());


-- ────────────────────────────────────────────────────────────
-- MIGRATION 020: User Profile Columns
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- 020: User profile columns + avatars storage bucket
-- ============================================================================

-- Add avatar_url and phone to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;

-- Create avatars storage bucket (public read so avatar URLs work without auth)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — allow public read, auth-scoped write
-- Path pattern: {auth_uid}/avatar.{ext}  (folder = auth UUID, compared to auth.uid())

CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ────────────────────────────────────────────────────────────
-- MIGRATION 021: Catalog Taxonomy Cleanup
-- ────────────────────────────────────────────────────────────
-- ============================================================================
-- Migration 021 — Catalog taxonomy cleanup
-- ============================================================================
-- Simplifies catalog_items to a pure taxonomy: id, name, category_id.
-- Removes all price-list / classification fields that were never consistently
-- used and caused confusion about charge vs expense context.
--
-- Dropped columns:
--   type, default_price, currency, unit_type, tax_code, is_active,
--   service_types, sort_order, description, charge_type_code
--
-- Kept columns:
--   id, name, category_id, created_at, updated_at
--
-- Context (charge vs expense) is now determined by WHERE the line item lives:
--   selling_price section  → charge
--   buying_price section   → expense
--   billing_line_items     → charge
--   evouchers              → expense
-- ============================================================================

-- Drop the unique index on charge_type_code before dropping the column
DROP INDEX IF EXISTS idx_catalog_items_charge_type_code;

-- Drop all taxonomy/price-list columns
ALTER TABLE catalog_items
  DROP COLUMN IF EXISTS type,
  DROP COLUMN IF EXISTS default_price,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS unit_type,
  DROP COLUMN IF EXISTS tax_code,
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS service_types,
  DROP COLUMN IF EXISTS sort_order,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS charge_type_code;


-- ────────────────────────────────────────────────────────────
-- MIGRATION 022: Catalog Usage Counts RPC
-- ────────────────────────────────────────────────────────────
-- 022_catalog_usage_counts_rpc.sql
-- Aggregate usage counts for catalog items across billing_line_items.
-- Replaces full-table fetch + JS count in CatalogManagementPage.

create or replace function get_catalog_usage_counts()
returns table(catalog_item_id text, usage_count bigint)
language sql
stable
security definer
as $$
  select catalog_item_id, count(*) as usage_count
  from billing_line_items
  where catalog_item_id is not null
  group by catalog_item_id;
$$;


-- ────────────────────────────────────────────────────────────
-- MIGRATION 023: User Status and Permissions
-- ────────────────────────────────────────────────────────────
-- ─── 023: User status column + module-level permission grants ─────────────────
-- Apply in Supabase SQL Editor

-- 1. Add status column to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'
  CONSTRAINT users_status_check CHECK (status IN ('active', 'inactive', 'suspended'));

-- 2. Sync existing rows from is_active
UPDATE users SET status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END;

-- 3. Add module_grants JSONB to permission_overrides
-- Stores fine-grained module/action overrides:
--   { "bd_contacts:view": true, "acct_billings:delete": false, ... }
-- Key = "<module_id>:<action_id>", value = boolean (true=granted, false=explicitly denied)
ALTER TABLE permission_overrides
  ADD COLUMN IF NOT EXISTS module_grants jsonb DEFAULT '{}';


-- ────────────────────────────────────────────────────────────
-- MIGRATION 024: Calendar Module
-- ────────────────────────────────────────────────────────────
-- ==========================================================================
-- 024 — Calendar Module
-- Tables for user-created events (personal, team, department).
-- Business entity dates (booking ETD/ETA, quotation validity, etc.) are
-- auto-pulled at render time and never stored here.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. calendar_events
-- --------------------------------------------------------------------------
CREATE TABLE calendar_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  description     text,

  -- Timing
  start_at        timestamptz NOT NULL,
  end_at          timestamptz NOT NULL,
  is_all_day      boolean DEFAULT false,
  timezone        text DEFAULT 'Asia/Manila',

  -- Classification
  event_type      text NOT NULL CHECK (event_type IN ('personal', 'team', 'department')),
  department      text,  -- NULL for personal; department name for dept events

  -- Recurrence (RFC 5545 RRULE string, NULL = non-recurring)
  rrule           text,
  recurrence_id   uuid REFERENCES calendar_events(id) ON DELETE CASCADE,
  original_start  timestamptz,  -- marks which occurrence this exception replaces

  -- Ownership
  created_by      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Optional
  location        text,
  color_override  text,

  -- Timestamps
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
SELECT add_updated_at_trigger('calendar_events');

CREATE INDEX idx_cal_events_created_by  ON calendar_events(created_by);
CREATE INDEX idx_cal_events_date_range  ON calendar_events(start_at, end_at);
CREATE INDEX idx_cal_events_type        ON calendar_events(event_type);

-- --------------------------------------------------------------------------
-- 2. calendar_event_participants  (for team / department events)
-- --------------------------------------------------------------------------
CREATE TABLE calendar_event_participants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_id, user_id)
);

CREATE INDEX idx_cal_part_user  ON calendar_event_participants(user_id);
CREATE INDEX idx_cal_part_event ON calendar_event_participants(event_id);

-- --------------------------------------------------------------------------
-- 3. calendar_event_reminders
-- --------------------------------------------------------------------------
CREATE TABLE calendar_event_reminders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  remind_before   interval NOT NULL DEFAULT '15 minutes',
  created_at      timestamptz DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 4. Add last_seen_at to users for team availability indicator
-- --------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- ==========================================================================
-- RLS Policies
-- ==========================================================================
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_reminders ENABLE ROW LEVEL SECURITY;

-- calendar_events: SELECT ---------------------------------------------------

-- Own events
CREATE POLICY "cal_select_own" ON calendar_events FOR SELECT TO authenticated
  USING (created_by = get_my_profile_id());

-- Events user participates in
CREATE POLICY "cal_select_participant" ON calendar_events FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT event_id FROM calendar_event_participants
      WHERE user_id = get_my_profile_id()
    )
  );

-- Manager / team leader can see team member events
CREATE POLICY "cal_select_team" ON calendar_events FOR SELECT TO authenticated
  USING (
    get_my_role() IN ('manager', 'team_leader')
    AND created_by = ANY(get_my_team_member_ids())
  );

-- Department-wide events visible to same department
CREATE POLICY "cal_select_dept" ON calendar_events FOR SELECT TO authenticated
  USING (
    event_type = 'department'
    AND department = get_my_department()
  );

-- Executive sees all
CREATE POLICY "cal_select_executive" ON calendar_events FOR SELECT TO authenticated
  USING (is_executive());

-- calendar_events: INSERT / UPDATE / DELETE ---------------------------------

CREATE POLICY "cal_insert" ON calendar_events FOR INSERT TO authenticated
  WITH CHECK (created_by = get_my_profile_id());

CREATE POLICY "cal_update" ON calendar_events FOR UPDATE TO authenticated
  USING (created_by = get_my_profile_id());

CREATE POLICY "cal_delete" ON calendar_events FOR DELETE TO authenticated
  USING (created_by = get_my_profile_id());

-- calendar_event_participants -----------------------------------------------

CREATE POLICY "cal_part_select" ON calendar_event_participants FOR SELECT TO authenticated
  USING (true);  -- visible to anyone who can see the event (RLS on parent handles it)

CREATE POLICY "cal_part_insert" ON calendar_event_participants FOR INSERT TO authenticated
  WITH CHECK (
    event_id IN (
      SELECT id FROM calendar_events WHERE created_by = get_my_profile_id()
    )
  );

CREATE POLICY "cal_part_delete" ON calendar_event_participants FOR DELETE TO authenticated
  USING (
    event_id IN (
      SELECT id FROM calendar_events WHERE created_by = get_my_profile_id()
    )
  );

-- calendar_event_reminders --------------------------------------------------

CREATE POLICY "cal_remind_select" ON calendar_event_reminders FOR SELECT TO authenticated
  USING (
    event_id IN (
      SELECT id FROM calendar_events WHERE created_by = get_my_profile_id()
    )
  );

CREATE POLICY "cal_remind_insert" ON calendar_event_reminders FOR INSERT TO authenticated
  WITH CHECK (
    event_id IN (
      SELECT id FROM calendar_events WHERE created_by = get_my_profile_id()
    )
  );

CREATE POLICY "cal_remind_delete" ON calendar_event_reminders FOR DELETE TO authenticated
  USING (
    event_id IN (
      SELECT id FROM calendar_events WHERE created_by = get_my_profile_id()
    )
  );


-- ────────────────────────────────────────────────────────────
-- MIGRATION 025: E-Voucher Architecture
-- ────────────────────────────────────────────────────────────
-- Migration 025: E-Voucher Architecture — Role Constraints, Operations Role Cleanup,
--               EV Approval Authority, Liquidation Submissions
-- Resolves:
--   • Migration 018 role constraint missing 'executive' value
--   • operations_role column redundant (Supervisor = team_leader in main role column)
--   • ev_approval_authority toggle needed for delegation model
--   • liquidation_submissions table for cash_advance / budget_request liquidation

-- ─────────────────────────────────────────────
-- 1. Add 'executive' to role CHECK constraint
-- ─────────────────────────────────────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('staff', 'team_leader', 'manager', 'executive'));

-- Assign 'executive' role to all users in the Executive department
UPDATE users
SET role = 'executive'
WHERE department = 'Executive'
  AND role != 'executive';

-- ─────────────────────────────────────────────
-- 2. Retire operations_role column
--    (Supervisor already migrated → team_leader in migration 018)
--    Drop safely — column is no longer used by the app.
-- ─────────────────────────────────────────────
ALTER TABLE users DROP COLUMN IF EXISTS operations_role;

-- ─────────────────────────────────────────────
-- 3. Add ev_approval_authority to users
--    When true for a team_leader, their team's EVs skip the CEO gate.
--    Configurable by Executives via User Management.
-- ─────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS ev_approval_authority boolean NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────
-- 4. liquidation_submissions table
--    One submission per handler session. Multiple submissions per EV are allowed
--    (incremental receipt filing). The advance stays open until is_final = true
--    and Accounting closes it.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS liquidation_submissions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evoucher_id       text NOT NULL REFERENCES evouchers(id) ON DELETE CASCADE,
  submitted_by      text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_by_name text NOT NULL,
  -- JSONB array of { id, description, amount, receipt_url? }
  line_items        jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_spend       numeric(15,2) NOT NULL DEFAULT 0,
  unused_return     numeric(15,2),              -- cash being returned (final submission only)
  is_final          boolean NOT NULL DEFAULT false,  -- marks the advance as ready for Accounting review
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'revision_requested')),
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  reviewed_by       text REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at       timestamptz,
  reviewer_remarks  text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Index: fast lookup of all submissions for a given EV
CREATE INDEX IF NOT EXISTS idx_liquidation_submissions_evoucher_id
  ON liquidation_submissions(evoucher_id);

-- updated_at trigger
CREATE OR REPLACE TRIGGER set_liquidation_submissions_updated_at
  BEFORE UPDATE ON liquidation_submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────
-- 5. RLS for liquidation_submissions
--    • Any authenticated user can read submissions on their own EVs
--    • Accounting can read all; Executives can read all
--    • Only the EV requestor can insert (submit)
--    • Accounting can update (approve / request revision)
-- ─────────────────────────────────────────────
ALTER TABLE liquidation_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "liquidation_submissions_select" ON liquidation_submissions
  FOR SELECT USING (
    auth.uid()::text IN (
      SELECT created_by FROM evouchers WHERE id = evoucher_id
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text
        AND (department = 'Accounting' OR department = 'Executive')
    )
  );

CREATE POLICY "liquidation_submissions_insert" ON liquidation_submissions
  FOR INSERT WITH CHECK (
    submitted_by = auth.uid()::text
  );

CREATE POLICY "liquidation_submissions_update" ON liquidation_submissions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text
        AND department = 'Accounting'
    )
  );


-- ────────────────────────────────────────────────────────────
-- MIGRATION 026: Todos
-- ────────────────────────────────────────────────────────────
-- 026_todos.sql
-- Personal to-do list for each user (Dashboard homebase feature)

CREATE TABLE IF NOT EXISTS todos (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text        TEXT        NOT NULL CHECK (char_length(trim(text)) > 0),
  done        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  done_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS todos_user_id_idx   ON todos(user_id);
CREATE INDEX IF NOT EXISTS todos_user_done_idx ON todos(user_id, done);

ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own todos"
  ON todos FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
