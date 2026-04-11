-- 028: Quotation PDF fields + Company Settings table
-- Adds columns needed for the PDF view controls (signatories, payment terms, etc.)
-- Creates company_settings table for dynamic company info on documents

-- ============================================================
-- 1. Add PDF-related columns to quotations table
-- ============================================================

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS payment_terms TEXT,
  ADD COLUMN IF NOT EXISTS custom_notes TEXT,
  ADD COLUMN IF NOT EXISTS prepared_by TEXT,
  ADD COLUMN IF NOT EXISTS prepared_by_title TEXT DEFAULT 'Sales Representative',
  ADD COLUMN IF NOT EXISTS approved_by TEXT DEFAULT 'Management',
  ADD COLUMN IF NOT EXISTS approved_by_title TEXT DEFAULT 'Authorized Signatory',
  ADD COLUMN IF NOT EXISTS addressed_to_name TEXT,
  ADD COLUMN IF NOT EXISTS addressed_to_title TEXT;

-- ============================================================
-- 2. Company Settings table (single-row config)
-- ============================================================

CREATE TABLE IF NOT EXISTS company_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  company_name TEXT NOT NULL DEFAULT 'Neuron Logistics Inc.',
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  country TEXT,
  phone_numbers TEXT[] DEFAULT '{}',
  email TEXT,
  bank_name TEXT,
  bank_account_name TEXT,
  bank_account_number TEXT,
  logo_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the default row with placeholder values
INSERT INTO company_settings (
  id, company_name, address_line1, address_line2, city, country,
  phone_numbers, email,
  bank_name, bank_account_name, bank_account_number
) VALUES (
  'default',
  'Neuron Logistics Inc.',
  'Unit 301, Great Wall Bldg., 136 Yakal St.',
  'San Antonio Village',
  'Makati City',
  'Philippines',
  ARRAY['+63 (2) 5310 4083', '+63 (2) 7004 7583', '+63 935 981 6652'],
  'inquiries@neuron-os.com',
  'BDO Unibank',
  'Neuron Logistics Inc.',
  '0012-3456-7890'
) ON CONFLICT (id) DO NOTHING;

-- Allow all authenticated users to read company_settings
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_settings_read" ON company_settings
  FOR SELECT TO authenticated USING (true);
