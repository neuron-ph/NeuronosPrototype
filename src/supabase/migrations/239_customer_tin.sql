-- 239_customer_tin.sql  (NEU-084)
--
-- Customers gain a TIN (Tax Identification Number) column so the invoice can
-- auto-fill the Customer TIN from the client's profile instead of manual entry.
-- The invoice builder already reads `customers.tin` (InvoiceBuilder.tsx) — this
-- column is what that read was missing. TIN is also surfaced (view + edit) in
-- the customer profile UI.
--
-- Data backfill (matching Ma'am MC's CLIENT DATA.xlsx registered names to the
-- existing customer records) is applied separately as a data script, not here —
-- schema only in this migration.

alter table public.customers add column if not exists tin text;

comment on column public.customers.tin is 'BIR Tax Identification Number (e.g. 000-000-000-00000). Auto-fills the invoice Customer TIN.';
