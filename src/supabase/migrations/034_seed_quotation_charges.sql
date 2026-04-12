-- Migration 034: Seed hardcoded quotation charges into catalog system
-- Replaces src/constants/quotation-charges.ts with database-driven catalog
-- NOTE: catalog_items table in live DB only has id, category_id, name, created_at, updated_at

-- 1. Create revenue-side categories
INSERT INTO catalog_categories (id, name, side, sort_order) VALUES
  ('cat-freight',      'Freight Charges',            'revenue', 10),
  ('cat-origin',       'Origin Local Charges',       'revenue', 20),
  ('cat-destination',  'Destination Local Charges',   'revenue', 30),
  ('cat-reimbursable', 'Reimbursable Charges',        'revenue', 40),
  ('cat-brokerage',    'Brokerage Charges',            'revenue', 50),
  ('cat-customs',      'Customs Duty & VAT',           'revenue', 60)
ON CONFLICT (id) DO NOTHING;

-- 2. Seed catalog items per category
INSERT INTO catalog_items (id, category_id, name) VALUES
  -- Freight Charges
  ('ci-freight-ocean',  'cat-freight', 'Ocean Freight'),
  ('ci-freight-air',    'cat-freight', 'Air Freight'),
  -- Origin Local Charges
  ('ci-origin-pickup',  'cat-origin', 'Pick up fee'),
  ('ci-origin-cfs',     'cat-origin', 'CFS'),
  ('ci-origin-cus',     'cat-origin', 'CUS'),
  ('ci-origin-docs',    'cat-origin', 'DOCS'),
  ('ci-origin-handling','cat-origin', 'Handling Fee'),
  ('ci-origin-fe',      'cat-origin', 'FE Fee'),
  ('ci-origin-thc',     'cat-origin', 'THC'),
  ('ci-origin-bl',      'cat-origin', 'BL Fee'),
  ('ci-origin-mbl',     'cat-origin', 'MBL Surrender Fee'),
  ('ci-origin-seal',    'cat-origin', 'Seal'),
  ('ci-origin-irf',     'cat-origin', 'IRF'),
  ('ci-origin-customs', 'cat-origin', 'Customs Clearance'),
  ('ci-origin-export',  'cat-origin', 'Export Customs Fee'),
  ('ci-origin-broker',  'cat-origin', 'Add Broker'),
  ('ci-origin-gate',    'cat-origin', 'Gate Permission Receipt'),
  ('ci-origin-special', 'cat-origin', 'Special Form A/I, C/O'),
  -- Destination Local Charges
  ('ci-dest-turnover',  'cat-destination', 'Turn Over Fee'),
  ('ci-dest-lcl',       'cat-destination', 'LCL Charges'),
  ('ci-dest-docfee',    'cat-destination', 'Documentation Fee'),
  ('ci-dest-thc',       'cat-destination', 'THC'),
  ('ci-dest-cic',       'cat-destination', 'CIC'),
  ('ci-dest-crs',       'cat-destination', 'CRS'),
  ('ci-dest-bl',        'cat-destination', 'BL Fee'),
  ('ci-dest-bbf',       'cat-destination', 'Breakbulk Fee (BBF)'),
  ('ci-dest-eec',       'cat-destination', 'Equipment Examination Charge (EEC)'),
  ('ci-dest-irf',       'cat-destination', 'Import Release Fee (IRF)'),
  ('ci-dest-ecc',       'cat-destination', 'Empty Control Charge (ECC)'),
  ('ci-dest-pss',       'cat-destination', 'Peak Season Surcharge (PSS)'),
  ('ci-dest-chc',       'cat-destination', 'Container Handling Charge (CHC)'),
  -- Reimbursable Charges
  ('ci-reimb-warehouse','cat-reimbursable', 'Warehouse Charges'),
  ('ci-reimb-arrastre', 'cat-reimbursable', 'Arrastre & Wharfage Due'),
  -- Brokerage Charges
  ('ci-brok-docfee',    'cat-brokerage', 'Documentation Fee'),
  ('ci-brok-processing','cat-brokerage', 'Processing Fee'),
  ('ci-brok-brokerage', 'cat-brokerage', 'Brokerage Fee'),
  ('ci-brok-handling',  'cat-brokerage', 'Handling'),
  -- Customs Duty & VAT
  ('ci-customs-duties', 'cat-customs', 'Duties & Taxes')
ON CONFLICT (id) DO NOTHING;
