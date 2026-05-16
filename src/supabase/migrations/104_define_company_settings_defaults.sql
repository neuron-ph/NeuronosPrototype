-- 104: Define default company settings used by printable documents.
-- Keeps existing non-empty production values, but fills blank contact fields so
-- document footers have concrete data instead of disappearing.

INSERT INTO company_settings (
  id,
  company_name,
  address_line1,
  address_line2,
  city,
  country,
  phone_numbers,
  email,
  bank_name,
  bank_account_name,
  bank_account_number
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
)
ON CONFLICT (id) DO UPDATE SET
  company_name = CASE
    WHEN company_settings.company_name IS NULL OR btrim(company_settings.company_name) = ''
      THEN EXCLUDED.company_name
    ELSE company_settings.company_name
  END,
  address_line1 = CASE
    WHEN company_settings.address_line1 IS NULL OR btrim(company_settings.address_line1) = ''
      THEN EXCLUDED.address_line1
    ELSE company_settings.address_line1
  END,
  address_line2 = CASE
    WHEN company_settings.address_line2 IS NULL OR btrim(company_settings.address_line2) = ''
      THEN EXCLUDED.address_line2
    ELSE company_settings.address_line2
  END,
  city = CASE
    WHEN company_settings.city IS NULL OR btrim(company_settings.city) = ''
      THEN EXCLUDED.city
    ELSE company_settings.city
  END,
  country = CASE
    WHEN company_settings.country IS NULL OR btrim(company_settings.country) = ''
      THEN EXCLUDED.country
    ELSE company_settings.country
  END,
  phone_numbers = CASE
    WHEN company_settings.phone_numbers IS NULL OR cardinality(company_settings.phone_numbers) = 0
      THEN EXCLUDED.phone_numbers
    ELSE company_settings.phone_numbers
  END,
  email = CASE
    WHEN company_settings.email IS NULL OR btrim(company_settings.email) = ''
      THEN EXCLUDED.email
    ELSE company_settings.email
  END,
  bank_name = CASE
    WHEN company_settings.bank_name IS NULL OR btrim(company_settings.bank_name) = ''
      THEN EXCLUDED.bank_name
    ELSE company_settings.bank_name
  END,
  bank_account_name = CASE
    WHEN company_settings.bank_account_name IS NULL OR btrim(company_settings.bank_account_name) = ''
      THEN EXCLUDED.bank_account_name
    ELSE company_settings.bank_account_name
  END,
  bank_account_number = CASE
    WHEN company_settings.bank_account_number IS NULL OR btrim(company_settings.bank_account_number) = ''
      THEN EXCLUDED.bank_account_number
    ELSE company_settings.bank_account_number
  END,
  updated_at = NOW();
