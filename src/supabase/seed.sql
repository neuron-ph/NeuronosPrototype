-- ============================================================================
-- Neuron OS — Master Seed Script
-- ============================================================================
-- Run this in the Supabase SQL Editor AFTER:
--   1. Migrations 001–005 have been applied
--   2. create-auth-users.mjs has been run (so users rows exist with auth_id)
--
-- Inserts data in strict FK dependency order:
--   Tier 1  — Customers, Contacts, Consignees
--   Tier 2  — Service Providers + Catalog
--   Tier 3  — Quotations + Contracts
--   Tier 4  — Projects
--   Tier 5  — Bookings
--   Tier 6  — EVouchers (16 rows)
--   Tier 7  — Budget Requests
--   Tier 8  — CRM Tasks + Activities
--   Tier 9  — Chart of Accounts
--   Tier 10 — Ticket Types + Tickets
-- ============================================================================

-- Quick sanity check: ensure user profiles exist before seeding
DO $$
DECLARE
  user_count INT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM users WHERE email LIKE '%@neuron.ph';
  IF user_count < 11 THEN
    RAISE EXCEPTION 'Only % Neuron users found. Run create-auth-users.mjs first.', user_count;
  END IF;
  RAISE NOTICE 'Found % Neuron users. Proceeding with seed...', user_count;
END $$;


-- ============================================================================
-- TIER 1A — Customers
-- ============================================================================

INSERT INTO customers (id, name, industry, client_type, status, registered_address, phone, email,
  website, credit_terms, payment_terms, lead_source, owner_id, notes, created_by)
VALUES
  ('cust-001', 'Reyes Global Trading',
    'Garments/Textile', 'Local', 'Active',
    '123 Agno St., Tondo, Manila 1012',
    '+63 2 8888 1111', 'info@reyesglobal.com.ph',
    'https://reyesglobal.com.ph', 'Net 30', 'Net 30',
    'Referral',
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph'),
    'Key account — forwarding + brokerage',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph')),

  ('cust-002', 'Metro Retail Group',
    'Food & Beverage', 'Local', 'Active',
    '88 EDSA, Mandaluyong City 1550',
    '+63 2 8777 2222', 'logistics@metroretail.ph',
    'https://metroretail.ph', 'Net 45', 'Net 45',
    'Trade Show',
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph'),
    'Active account — regular FCL shipments',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph')),

  ('cust-003', 'Pacific Distribution Co.',
    'Electronics', 'Local', 'Prospect',
    '45 Batangas Road, Calamba, Laguna 4027',
    '+63 49 555 3333', 'ops@pacificdist.ph',
    NULL, 'Net 60', 'Net 60',
    'Cold Outreach',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'),
    'Prospect — evaluating marine insurance quotes',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'))

ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- TIER 1B — Contacts
-- ============================================================================

INSERT INTO contacts (id, name, title, email, phone, customer_id, is_primary,
  lifecycle_stage, lead_status, owner_id, notes, created_by)
VALUES
  -- Reyes Global Trading
  ('con-001', 'Jose Reyes Jr.', 'President & CEO',
    'jose@reyesglobal.com.ph', '+63 917 100 0001',
    'cust-001', true, 'Customer', 'Customer',
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph'),
    'Primary decision maker',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph')),

  ('con-002', 'Carmela Santos', 'Logistics Manager',
    'carmela@reyesglobal.com.ph', '+63 917 100 0002',
    'cust-001', false, 'Customer', 'Customer',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'),
    'Day-to-day operations contact',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph')),

  -- Metro Retail Group
  ('con-003', 'Alicia Tan', 'VP Supply Chain',
    'alicia.tan@metroretail.ph', '+63 917 200 0001',
    'cust-002', true, 'Customer', 'Customer',
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph'),
    'Main approver for all freight POs',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph')),

  ('con-004', 'Ramon Dela Cruz', 'Import Officer',
    'ramon.dc@metroretail.ph', '+63 917 200 0002',
    'cust-002', false, 'Customer', 'Customer',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'),
    'Handles day-to-day bookings',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph')),

  -- Pacific Distribution Co.
  ('con-005', 'Victor Lim', 'General Manager',
    'victor@pacificdist.ph', '+63 917 300 0001',
    'cust-003', true, 'SQL', 'Qualified',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'),
    'Interested in marine insurance and forwarding bundle',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph')),

  ('con-006', 'Sarah Buenaventura', 'Finance Officer',
    'sarah@pacificdist.ph', '+63 917 300 0002',
    'cust-003', false, 'MQL', 'Contacted',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'),
    'Evaluating payment terms',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'))

ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- TIER 1C — Consignees
-- ============================================================================

INSERT INTO consignees (id, customer_id, name, address, tin, contact_person, email, phone)
VALUES
  ('csg-001', 'cust-001', 'Reyes Global — Cavite Warehouse',
    'Lot 12 Blk 3, CEPZA Industrial Estate, Rosario, Cavite 4106',
    '123-456-789-000', 'Roldan Pascual', 'warehouse@reyesglobal.com.ph', '+63 46 435 1111'),

  ('csg-002', 'cust-001', 'Reyes Global — Divisoria Showroom',
    '456 Ilaya St., Divisoria, Manila 1012',
    '123-456-789-001', 'Nenita Cruz', 'divisoria@reyesglobal.com.ph', '+63 2 8244 2222'),

  ('csg-003', 'cust-002', 'Metro Retail — Caloocan DC',
    '88 Gov. Pascual Ave., Malabon 1470',
    '987-654-321-000', 'Danilo Flores', 'caloocan-dc@metroretail.ph', '+63 2 8288 3333'),

  ('csg-004', 'cust-002', 'Metro Retail — Cebu Hub',
    'Mandaue Commerce Park, Mandaue City, Cebu 6014',
    '987-654-321-001', 'Luisa Estrada', 'cebu@metroretail.ph', '+63 32 505 4444'),

  ('csg-005', 'cust-003', 'Pacific Dist — Laguna Main Warehouse',
    '100 Brgy. Parian, Calamba, Laguna 4027',
    '456-123-789-000', 'Edwin Vargas', 'laguna@pacificdist.ph', '+63 49 545 5555'),

  ('csg-006', 'cust-003', 'Pacific Dist — Cavite Branch',
    'Phase 2, Gen. Trias, Cavite 4107',
    '456-123-789-001', 'Marita Domingo', 'cavite@pacificdist.ph', '+63 46 889 6666')

ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- TIER 2A — Service Providers
-- ============================================================================

INSERT INTO service_providers (id, provider_type, company_name, country, territory,
  contact_person, contact_email, contact_phone, address, services, notes)
VALUES
  ('sp-001', 'overseas_agent', 'Globe Forwarding Ltd.',
    'Hong Kong', 'East Asia',
    'Patrick Wong', 'pwong@globeforwarding.hk', '+852 2345 6789',
    '18/F Tower B, Exchange Square, Central, Hong Kong',
    ARRAY['Forwarding'], 'Primary HK agent for FCL/LCL'),

  ('sp-002', 'broker', 'PH Customs Brokers Inc.',
    'Philippines', 'Nationwide',
    'Atty. Renato Garces', 'renato@phcustoms.com.ph', '+63 2 8521 0001',
    '3F Camarin Bldg., 1 Port Area, Manila 1018',
    ARRAY['Brokerage'], 'Accredited customs broker MICP + NAIA + POM'),

  ('sp-003', 'trucker', 'FastHaul Trucking Corp.',
    'Philippines', 'NCR + CALABARZON',
    'Edgar Castillo', 'edgar@fasthaul.ph', '+63 917 900 0001',
    '22 Industrial Rd., Valenzuela City 1440',
    ARRAY['Trucking'], '10-wheeler and trailer fleet available'),

  ('sp-004', 'local_agent', 'MarineShield Insurance Agency',
    'Philippines', 'Nationwide',
    'Connie Bautista', 'connie@marineshield.ph', '+63 2 8818 0002',
    '5F Fil-Am Life Bldg., Taft Ave., Manila 1004',
    ARRAY['Marine Insurance'], 'Accredited agent for Pioneer and UCPB General')

ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- TIER 2B — Catalog Categories + Items
-- ============================================================================

INSERT INTO catalog_categories (id, name, description, sort_order, is_default)
VALUES
  ('cat-001', 'Origin Charges',      'Charges incurred at origin port/country',     1, true),
  ('cat-002', 'Freight',             'Ocean/air/land freight charges',               2, true),
  ('cat-003', 'Destination Charges', 'Charges incurred at destination port/country', 3, true),
  ('cat-004', 'Government Fees',     'Customs duties, taxes, and government charges', 4, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO catalog_items (id, category_id, name, description, default_price, currency,
  unit_type, tax_code, is_active, service_types, sort_order)
VALUES
  -- Origin Charges (Forwarding)
  ('ci-001', 'cat-001', 'Origin Documentation Fee',
    'Bill of lading preparation and handling',
    3500, 'PHP', 'per_bl', 'VAT', true, ARRAY['Forwarding'], 1),
  ('ci-002', 'cat-001', 'Origin Container Seal',
    'Container seal and inspection',
    500, 'PHP', 'per_container', 'VAT', true, ARRAY['Forwarding'], 2),
  ('ci-003', 'cat-001', 'Export Customs Clearance',
    'Export customs declaration and processing',
    5000, 'PHP', 'per_shipment', 'VAT', true, ARRAY['Forwarding'], 3),

  -- Freight (Forwarding)
  ('ci-004', 'cat-002', 'Ocean Freight — FCL 20ft',
    'Full container load 20ft ocean freight',
    45000, 'PHP', 'per_container', 'ZR', true, ARRAY['Forwarding'], 4),
  ('ci-005', 'cat-002', 'Ocean Freight — FCL 40ft',
    'Full container load 40ft ocean freight',
    75000, 'PHP', 'per_container', 'ZR', true, ARRAY['Forwarding'], 5),
  ('ci-006', 'cat-002', 'BAF (Bunker Adjustment Factor)',
    'Fuel surcharge — market rate',
    8000, 'PHP', 'per_container', 'ZR', true, ARRAY['Forwarding'], 6),

  -- Destination Charges (Forwarding)
  ('ci-007', 'cat-003', 'Destination Documentation Fee',
    'Import document handling',
    3500, 'PHP', 'per_bl', 'VAT', true, ARRAY['Forwarding'], 7),
  ('ci-008', 'cat-003', 'Customs Examination Fee',
    'Port examination and inspection surcharge',
    4500, 'PHP', 'per_container', 'VAT', true, ARRAY['Forwarding'], 8),
  ('ci-009', 'cat-003', 'Port Handling — CY',
    'Container yard handling at destination',
    6500, 'PHP', 'per_container', 'VAT', true, ARRAY['Forwarding'], 9),

  -- Brokerage
  ('ci-010', 'cat-004', 'Formal Entry Processing',
    'Customs brokerage — formal entry',
    8500, 'PHP', 'per_shipment', 'VAT', true, ARRAY['Brokerage'], 10),
  ('ci-011', 'cat-004', 'Import Duties & Taxes',
    'Advance payment of customs duties (variable)',
    0, 'PHP', 'flat_fee', 'NVAT', true, ARRAY['Brokerage'], 11),
  ('ci-012', 'cat-004', 'BOC Processing Fee',
    'Bureau of Customs official processing fee',
    1000, 'PHP', 'per_shipment', 'NVAT', true, ARRAY['Brokerage'], 12),
  ('ci-013', 'cat-004', 'PEZA/BOI Facilitation',
    'Special zone facilitation for PEZA-registered entities',
    5000, 'PHP', 'per_shipment', 'ZR', true, ARRAY['Brokerage'], 13),

  -- Trucking
  ('ci-014', 'cat-003', 'Trucking — Port to Warehouse',
    'Door delivery from port container yard',
    9500, 'PHP', 'per_container', 'VAT', true, ARRAY['Trucking'], 14),
  ('ci-015', 'cat-003', 'Trucking — Provincial Surcharge',
    'Extra charge for deliveries outside Metro Manila',
    3500, 'PHP', 'per_container', 'VAT', true, ARRAY['Trucking'], 15),
  ('ci-016', 'cat-001', 'Trucking — Loading Labor',
    'Labor for container stripping/loading',
    2500, 'PHP', 'per_container', 'VAT', true, ARRAY['Trucking'], 16),

  -- Marine Insurance
  ('ci-017', 'cat-002', 'Marine Insurance Premium — All Risk',
    'Insurance premium at 0.5% of insured value',
    0, 'PHP', 'flat_fee', 'VAT', true, ARRAY['Marine Insurance'], 17),
  ('ci-018', 'cat-002', 'Marine Insurance — War Risk',
    'Additional war risk coverage 0.025%',
    0, 'PHP', 'flat_fee', 'VAT', true, ARRAY['Marine Insurance'], 18),

  -- Others / shared
  ('ci-019', 'cat-003', 'Warehousing (per day)',
    'Temporary storage at bonded warehouse',
    1500, 'PHP', 'flat_fee', 'VAT', true,
    ARRAY['Forwarding','Brokerage','Others'], 19),
  ('ci-020', 'cat-001', 'Miscellaneous Expenses',
    'Sundry charges (stamps, notarial, messenger)',
    500, 'PHP', 'flat_fee', 'VAT', true,
    ARRAY['Forwarding','Brokerage','Trucking','Marine Insurance','Others'], 20)

ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- TIER 3 — Quotations + Contracts
-- ============================================================================

INSERT INTO quotations (id, quotation_number, quotation_type, customer_id, customer_name,
  contact_id, contact_name, services, status, validity_date,
  created_by, created_by_name, assigned_to, total_selling, total_buying, currency, notes)
VALUES
  -- QT-2026-001: Standard Draft
  ('qt-2026-001', 'QT-2026-001', 'standard',
    'cust-003', 'Pacific Distribution Co.', 'con-005', 'Victor Lim',
    ARRAY['Forwarding','Marine Insurance'],
    'Draft', '2026-04-30 00:00:00+08',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'), 'Ben Santos',
    (SELECT id FROM users WHERE email = 'pricing.rep@neuron.ph'),
    95000, 72000, 'PHP', 'Initial quote — FCL 20ft + marine insurance bundle'),

  -- QT-2026-002: Standard Sent
  ('qt-2026-002', 'QT-2026-002', 'standard',
    'cust-002', 'Metro Retail Group', 'con-003', 'Alicia Tan',
    ARRAY['Forwarding'],
    'Sent', '2026-04-15 00:00:00+08',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'), 'Ben Santos',
    (SELECT id FROM users WHERE email = 'pricing.manager@neuron.ph'),
    120000, 91000, 'PHP', 'FCL 40ft Shanghai—Manila'),

  -- QT-2026-003: Standard Converted
  ('qt-2026-003', 'QT-2026-003', 'standard',
    'cust-002', 'Metro Retail Group', 'con-004', 'Ramon Dela Cruz',
    ARRAY['Brokerage'],
    'Converted', '2026-03-31 00:00:00+08',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'), 'Ben Santos',
    (SELECT id FROM users WHERE email = 'pricing.rep@neuron.ph'),
    18500, 12000, 'PHP', 'Formal entry — converted to project PRJ-2026-002'),

  -- QT-2026-004: Contract Active
  ('qt-2026-004', 'QT-2026-004', 'contract',
    'cust-001', 'Reyes Global Trading', 'con-001', 'Jose Reyes Jr.',
    ARRAY['Forwarding','Brokerage'],
    'Accepted', '2026-12-31 00:00:00+08',
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph'), 'Diana Reyes',
    (SELECT id FROM users WHERE email = 'pricing.manager@neuron.ph'),
    850000, 640000, 'PHP', 'Annual contract — Forwarding + Brokerage bundle'),

  -- QT-2026-005: Contract Expiring
  ('qt-2026-005', 'QT-2026-005', 'contract',
    'cust-002', 'Metro Retail Group', 'con-003', 'Alicia Tan',
    ARRAY['Trucking'],
    'Accepted', '2026-03-31 00:00:00+08',
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph'), 'Diana Reyes',
    (SELECT id FROM users WHERE email = 'pricing.rep@neuron.ph'),
    240000, 185000, 'PHP', 'Trucking contract — 3-month initial term, expiring soon')

ON CONFLICT (id) DO NOTHING;

-- Set contract-specific fields
UPDATE quotations SET
  contract_status     = 'Active',
  contract_start_date = '2026-01-01 00:00:00+08',
  contract_end_date   = '2026-12-31 00:00:00+08',
  renewal_terms       = 'Annual — 30 days notice required',
  auto_renew          = false
WHERE id = 'qt-2026-004';

UPDATE quotations SET
  contract_status     = 'Expiring',
  contract_start_date = '2026-01-01 00:00:00+08',
  contract_end_date   = '2026-03-31 00:00:00+08',
  renewal_terms       = 'Quarterly renewal',
  auto_renew          = false
WHERE id = 'qt-2026-005';


-- ============================================================================
-- TIER 4 — Projects
-- ============================================================================

INSERT INTO projects (id, project_number, quotation_id, customer_id, customer_name,
  consignee_id, status, services, service_type,
  manager_id, manager_name, supervisor_id, supervisor_name, handler_id, handler_name,
  created_by, created_by_name, notes, tags)
VALUES
  ('prj-2026-001', 'PRJ-2026-001', 'qt-2026-004',
    'cust-001', 'Reyes Global Trading', 'csg-001',
    'Active', ARRAY['Forwarding','Brokerage'], 'Forwarding',
    (SELECT id FROM users WHERE email = 'ops.manager@neuron.ph'),   'Robert Tan',
    (SELECT id FROM users WHERE email = 'ops.supervisor@neuron.ph'), 'Jenny Lim',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),    'Mike Villanueva',
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph'),     'Diana Reyes',
    'Annual contract project — Forwarding + Brokerage for Reyes Global',
    ARRAY['contract','priority']),

  ('prj-2026-002', 'PRJ-2026-002', 'qt-2026-003',
    'cust-002', 'Metro Retail Group', 'csg-003',
    'Active', ARRAY['Brokerage'], 'Brokerage',
    (SELECT id FROM users WHERE email = 'ops.manager@neuron.ph'),   'Robert Tan',
    (SELECT id FROM users WHERE email = 'ops.supervisor@neuron.ph'), 'Jenny Lim',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),    'Mike Villanueva',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'),         'Ben Santos',
    'Brokerage project from converted quotation QT-2026-003',
    ARRAY['brokerage']),

  ('prj-2026-003', 'PRJ-2026-003', NULL,
    'cust-003', 'Pacific Distribution Co.', 'csg-005',
    'Completed', ARRAY['Marine Insurance'], 'Marine Insurance',
    (SELECT id FROM users WHERE email = 'ops.manager@neuron.ph'),   'Robert Tan',
    (SELECT id FROM users WHERE email = 'ops.supervisor@neuron.ph'), 'Jenny Lim',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),    'Mike Villanueva',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'),         'Ben Santos',
    'Completed marine insurance project for Pacific Distribution',
    ARRAY['completed','marine-insurance'])

ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- TIER 5 — Bookings (12 across 5 service types)
-- ============================================================================

-- Forwarding (3)
INSERT INTO bookings (id, booking_number, service_type, project_id, contract_id,
  customer_id, customer_name, consignee_id, status,
  manager_id, manager_name, supervisor_id, supervisor_name, handler_id, handler_name,
  created_by, containers, bls, sets, shipments, details, total_revenue, total_cost, notes)
VALUES
  ('bk-fwd-001', 'FWD-2026-001', 'Forwarding', 'prj-2026-001', 'qt-2026-004',
    'cust-001', 'Reyes Global Trading', 'csg-001', 'In Transit',
    (SELECT id FROM users WHERE email = 'ops.manager@neuron.ph'),   'Robert Tan',
    (SELECT id FROM users WHERE email = 'ops.supervisor@neuron.ph'), 'Jenny Lim',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),    'Mike Villanueva',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),
    1, 1, 1, 1,
    '{"movement_type":"Import","mode":"FCL","origin":"Shanghai","destination":"Manila",
      "carrier":"Evergreen","vessel":"EVER GOLDEN","voyage":"0241E",
      "etd":"2026-03-01","eta":"2026-03-18",
      "commodity":"Garments","weight_kg":12500,"volume_cbm":28}'::jsonb,
    98500, 74200, 'FCL 20ft — Shanghai to Manila, Cavite consignee'),

  ('bk-fwd-002', 'FWD-2026-002', 'Forwarding', 'prj-2026-001', 'qt-2026-004',
    'cust-001', 'Reyes Global Trading', 'csg-002', 'In Transit',
    (SELECT id FROM users WHERE email = 'ops.manager@neuron.ph'),   'Robert Tan',
    (SELECT id FROM users WHERE email = 'ops.supervisor@neuron.ph'), 'Jenny Lim',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),    'Mike Villanueva',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),
    2, 1, 1, 1,
    '{"movement_type":"Import","mode":"FCL","origin":"Guangzhou","destination":"Manila",
      "carrier":"PIL","vessel":"KOTA RATU","voyage":"0185W",
      "etd":"2026-03-05","eta":"2026-03-22",
      "commodity":"Textile","weight_kg":24000,"volume_cbm":55}'::jsonb,
    185000, 139500, 'FCL 2×40ft — Guangzhou to Manila, Divisoria consignee'),

  ('bk-fwd-003', 'FWD-2026-003', 'Forwarding', 'prj-2026-002', NULL,
    'cust-002', 'Metro Retail Group', 'csg-004', 'Completed',
    (SELECT id FROM users WHERE email = 'ops.manager@neuron.ph'),   'Robert Tan',
    (SELECT id FROM users WHERE email = 'ops.supervisor@neuron.ph'), 'Jenny Lim',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),    'Mike Villanueva',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),
    1, 1, 1, 1,
    '{"movement_type":"Import","mode":"FCL","origin":"Busan","destination":"Cebu",
      "carrier":"KMTC","vessel":"KMTC CEBU","voyage":"1120S",
      "etd":"2026-02-10","eta":"2026-02-18",
      "commodity":"Food Products","weight_kg":18000,"volume_cbm":32}'::jsonb,
    110000, 83000, 'FCL 40ft — Busan to Cebu hub (completed)')

ON CONFLICT (id) DO NOTHING;

-- Brokerage (3)
INSERT INTO bookings (id, booking_number, service_type, project_id, contract_id,
  customer_id, customer_name, consignee_id, status,
  manager_id, manager_name, supervisor_id, supervisor_name, handler_id, handler_name,
  created_by, containers, bls, sets, shipments, details, total_revenue, total_cost, notes)
VALUES
  ('bk-brk-001', 'BRK-2026-001', 'Brokerage', 'prj-2026-001', 'qt-2026-004',
    'cust-001', 'Reyes Global Trading', 'csg-001', 'Confirmed',
    (SELECT id FROM users WHERE email = 'ops.manager@neuron.ph'),   'Robert Tan',
    (SELECT id FROM users WHERE email = 'ops.supervisor@neuron.ph'), 'Jenny Lim',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),    'Mike Villanueva',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),
    1, 1, 1, 1,
    '{"entry_type":"Formal Entry","entry_number":"FE-2026-0041","customs_office":"MICP",
      "import_permit":"IP-RG-001","declared_value":480000,
      "customs_duty":38400,"vat":57600}'::jsonb,
    22500, 14800, 'Brokerage for FWD-2026-001'),

  ('bk-brk-002', 'BRK-2026-002', 'Brokerage', 'prj-2026-001', 'qt-2026-004',
    'cust-001', 'Reyes Global Trading', 'csg-002', 'In Transit',
    (SELECT id FROM users WHERE email = 'ops.manager@neuron.ph'),   'Robert Tan',
    (SELECT id FROM users WHERE email = 'ops.supervisor@neuron.ph'), 'Jenny Lim',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),    'Mike Villanueva',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),
    2, 1, 1, 1,
    '{"entry_type":"Formal Entry","entry_number":"FE-2026-0042","customs_office":"MICP",
      "declared_value":920000,"customs_duty":73600,"vat":110400}'::jsonb,
    42000, 27500, 'Brokerage for FWD-2026-002'),

  ('bk-brk-003', 'BRK-2026-003', 'Brokerage', 'prj-2026-002', NULL,
    'cust-002', 'Metro Retail Group', 'csg-003', 'Completed',
    (SELECT id FROM users WHERE email = 'ops.manager@neuron.ph'),   'Robert Tan',
    (SELECT id FROM users WHERE email = 'ops.supervisor@neuron.ph'), 'Jenny Lim',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),    'Mike Villanueva',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),
    1, 1, 1, 1,
    '{"entry_type":"Formal Entry","entry_number":"FE-2026-0035","customs_office":"NAIA",
      "declared_value":350000,"customs_duty":28000,"vat":42000}'::jsonb,
    18500, 12000, 'Brokerage for completed Metro Retail shipment')

ON CONFLICT (id) DO NOTHING;

-- Trucking (2)
INSERT INTO bookings (id, booking_number, service_type, project_id, contract_id,
  customer_id, customer_name, consignee_id, status,
  manager_id, manager_name, supervisor_id, supervisor_name, handler_id, handler_name,
  created_by, containers, bls, sets, shipments, details, total_revenue, total_cost, notes)
VALUES
  ('bk-trk-001', 'TRK-2026-001', 'Trucking', 'prj-2026-001', 'qt-2026-005',
    'cust-001', 'Reyes Global Trading', 'csg-001', 'In Transit',
    (SELECT id FROM users WHERE email = 'ops.manager@neuron.ph'),   'Robert Tan',
    (SELECT id FROM users WHERE email = 'ops.supervisor@neuron.ph'), 'Jenny Lim',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),    'Mike Villanueva',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),
    1, 0, 0, 1,
    '{"pickup_address":"MICP Container Yard, Port of Manila, Pier 3",
      "delivery_address":"Reyes Global Cavite Warehouse, CEPZA Industrial Estate",
      "truck_type":"10-Wheeler","plate_number":"NCR-1234","driver":"Eduardo Salazar",
      "departure_time":"2026-03-17 08:00","estimated_arrival":"2026-03-17 14:00"}'::jsonb,
    11500, 8200, 'Trucking for BRK-2026-001 container delivery'),

  ('bk-trk-002', 'TRK-2026-002', 'Trucking', 'prj-2026-002', 'qt-2026-005',
    'cust-002', 'Metro Retail Group', 'csg-003', 'Delivered',
    (SELECT id FROM users WHERE email = 'ops.manager@neuron.ph'),   'Robert Tan',
    (SELECT id FROM users WHERE email = 'ops.supervisor@neuron.ph'), 'Jenny Lim',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),    'Mike Villanueva',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),
    1, 0, 0, 1,
    '{"pickup_address":"NAIA Container Yard, Parañaque",
      "delivery_address":"Metro Retail Caloocan DC, Gov. Pascual Ave., Malabon",
      "truck_type":"10-Wheeler","plate_number":"NCR-5678","driver":"Romulo Villones",
      "departure_time":"2026-02-18 10:00","estimated_arrival":"2026-02-18 14:30"}'::jsonb,
    9500, 6800, 'Trucking for completed Metro Retail air cargo delivery')

ON CONFLICT (id) DO NOTHING;

-- Marine Insurance (2)
INSERT INTO bookings (id, booking_number, service_type, project_id, contract_id,
  customer_id, customer_name, consignee_id, status,
  manager_id, manager_name, supervisor_id, supervisor_name, handler_id, handler_name,
  created_by, containers, bls, sets, shipments, details, total_revenue, total_cost, notes)
VALUES
  ('bk-mip-001', 'MIP-2026-001', 'Marine Insurance', 'prj-2026-001', NULL,
    'cust-001', 'Reyes Global Trading', 'csg-001', 'Confirmed',
    (SELECT id FROM users WHERE email = 'ops.manager@neuron.ph'),   'Robert Tan',
    (SELECT id FROM users WHERE email = 'ops.supervisor@neuron.ph'), 'Jenny Lim',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),    'Mike Villanueva',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),
    0, 0, 0, 1,
    '{"policy_number":"MIP-2026-001","insurer":"Pioneer Insurance",
      "insured_value":480000,"premium":2880,"coverage_type":"All Risk",
      "coverage_start":"2026-03-01","coverage_end":"2026-04-30","commodity":"Garments"}'::jsonb,
    3200, 2880, 'Marine insurance cover for FWD-2026-001 cargo'),

  ('bk-mip-002', 'MIP-2026-002', 'Marine Insurance', 'prj-2026-003', NULL,
    'cust-003', 'Pacific Distribution Co.', 'csg-005', 'Completed',
    (SELECT id FROM users WHERE email = 'ops.manager@neuron.ph'),   'Robert Tan',
    (SELECT id FROM users WHERE email = 'ops.supervisor@neuron.ph'), 'Jenny Lim',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),    'Mike Villanueva',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),
    0, 0, 0, 1,
    '{"policy_number":"MIP-2026-002","insurer":"UCPB General",
      "insured_value":620000,"premium":3720,"coverage_type":"All Risk",
      "coverage_start":"2026-02-01","coverage_end":"2026-03-15","commodity":"Electronics"}'::jsonb,
    4200, 3720, 'Completed marine insurance — Pacific Distribution electronics shipment')

ON CONFLICT (id) DO NOTHING;

-- Others (2)
INSERT INTO bookings (id, booking_number, service_type, project_id, contract_id,
  customer_id, customer_name, consignee_id, status,
  manager_id, manager_name, supervisor_id, supervisor_name, handler_id, handler_name,
  created_by, containers, bls, sets, shipments, details, total_revenue, total_cost, notes)
VALUES
  ('bk-oth-001', 'OTH-2026-001', 'Others', 'prj-2026-002', NULL,
    'cust-002', 'Metro Retail Group', 'csg-003', 'Draft',
    (SELECT id FROM users WHERE email = 'ops.manager@neuron.ph'),   'Robert Tan',
    (SELECT id FROM users WHERE email = 'ops.supervisor@neuron.ph'), 'Jenny Lim',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),    'Mike Villanueva',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),
    0, 0, 0, 1,
    '{"description":"Bonded warehouse storage — holding for customs clearance",
      "warehouse":"DP World Calamba ICT","storage_period_days":14}'::jsonb,
    21000, 14500, 'Temporary warehousing while awaiting brokerage clearance'),

  ('bk-oth-002', 'OTH-2026-002', 'Others', 'prj-2026-001', NULL,
    'cust-001', 'Reyes Global Trading', 'csg-002', 'In Transit',
    (SELECT id FROM users WHERE email = 'ops.manager@neuron.ph'),   'Robert Tan',
    (SELECT id FROM users WHERE email = 'ops.supervisor@neuron.ph'), 'Jenny Lim',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),    'Mike Villanueva',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'),
    0, 0, 0, 1,
    '{"description":"Cargo consolidation and repacking at Cavite warehouse",
      "service":"Repacking","units":500}'::jsonb,
    8500, 5500, 'Value-added repacking service at Cavite warehouse')

ON CONFLICT (id) DO NOTHING;

-- Join tables: project_bookings
INSERT INTO project_bookings (project_id, booking_id, service_type)
VALUES
  ('prj-2026-001', 'bk-fwd-001', 'Forwarding'),
  ('prj-2026-001', 'bk-fwd-002', 'Forwarding'),
  ('prj-2026-001', 'bk-brk-001', 'Brokerage'),
  ('prj-2026-001', 'bk-brk-002', 'Brokerage'),
  ('prj-2026-001', 'bk-trk-001', 'Trucking'),
  ('prj-2026-001', 'bk-mip-001', 'Marine Insurance'),
  ('prj-2026-001', 'bk-oth-002', 'Others'),
  ('prj-2026-002', 'bk-fwd-003', 'Forwarding'),
  ('prj-2026-002', 'bk-brk-003', 'Brokerage'),
  ('prj-2026-002', 'bk-trk-002', 'Trucking'),
  ('prj-2026-002', 'bk-oth-001', 'Others'),
  ('prj-2026-003', 'bk-mip-002', 'Marine Insurance')
ON CONFLICT (project_id, booking_id) DO NOTHING;

-- Join tables: contract_bookings
INSERT INTO contract_bookings (contract_id, booking_id, service_type)
VALUES
  ('qt-2026-004', 'bk-fwd-001', 'Forwarding'),
  ('qt-2026-004', 'bk-fwd-002', 'Forwarding'),
  ('qt-2026-004', 'bk-brk-001', 'Brokerage'),
  ('qt-2026-004', 'bk-brk-002', 'Brokerage'),
  ('qt-2026-005', 'bk-trk-001', 'Trucking'),
  ('qt-2026-005', 'bk-trk-002', 'Trucking')
ON CONFLICT (contract_id, booking_id) DO NOTHING;


-- ============================================================================
-- TIER 6 — EVouchers (16 rows)
-- ============================================================================

INSERT INTO evouchers (id, evoucher_number, transaction_type, source_module, voucher_type,
  booking_id, project_id, project_number, customer_id, customer_name,
  vendor_name, vendor_id, amount, currency, payment_method,
  description, purpose, status, submitted_at, approved_at, posted_at,
  approvers, gl_category, gl_sub_category, created_by, created_by_name, notes)
VALUES

  -- 4 × billing (AR)
  ('ev-001', 'EV-2026-001', 'billing', 'accounting', 'AR',
    'bk-fwd-001', 'prj-2026-001', 'PRJ-2026-001', 'cust-001', 'Reyes Global Trading',
    NULL, NULL, 98500, 'PHP', 'Bank Transfer',
    'Billing — FWD-2026-001 (FCL 20ft Shanghai–Manila)',
    'Invoice for forwarding services', 'draft',
    NULL, NULL, NULL, '[]'::jsonb,
    'Revenue', 'Forwarding Income',
    (SELECT id FROM users WHERE email = 'acct.rep@neuron.ph'), 'Ana Mendoza',
    'Draft — pending review before issuance'),

  ('ev-002', 'EV-2026-002', 'billing', 'accounting', 'AR',
    'bk-fwd-002', 'prj-2026-001', 'PRJ-2026-001', 'cust-001', 'Reyes Global Trading',
    NULL, NULL, 185000, 'PHP', 'Bank Transfer',
    'Billing — FWD-2026-002 (FCL 2×40ft Guangzhou–Manila)',
    'Invoice for forwarding services', 'pending',
    '2026-03-12 09:00:00+08', NULL, NULL,
    jsonb_build_array(jsonb_build_object(
      'user_id', (SELECT id FROM users WHERE email = 'acct.manager@neuron.ph'),
      'user_name', 'Maria Cruz', 'role', 'manager',
      'status', 'pending', 'timestamp', '2026-03-12T09:00:00+08:00', 'remarks', ''
    )),
    'Revenue', 'Forwarding Income',
    (SELECT id FROM users WHERE email = 'acct.rep@neuron.ph'), 'Ana Mendoza',
    'Submitted — awaiting manager approval'),

  ('ev-003', 'EV-2026-003', 'billing', 'accounting', 'AR',
    'bk-brk-003', 'prj-2026-002', 'PRJ-2026-002', 'cust-002', 'Metro Retail Group',
    NULL, NULL, 18500, 'PHP', 'Check',
    'Billing — BRK-2026-003 (Brokerage — Metro Retail)',
    'Brokerage services invoice', 'posted',
    '2026-02-20 09:00:00+08', '2026-02-20 14:00:00+08', '2026-02-21 09:00:00+08',
    jsonb_build_array(jsonb_build_object(
      'user_id', (SELECT id FROM users WHERE email = 'acct.manager@neuron.ph'),
      'user_name', 'Maria Cruz', 'role', 'manager',
      'status', 'approved', 'timestamp', '2026-02-20T14:00:00+08:00', 'remarks', 'Approved — posted to ledger'
    )),
    'Revenue', 'Brokerage Income',
    (SELECT id FROM users WHERE email = 'acct.manager@neuron.ph'), 'Maria Cruz',
    'Posted to ledger Feb 21'),

  ('ev-004', 'EV-2026-004', 'billing', 'accounting', 'AR',
    'bk-fwd-003', 'prj-2026-002', 'PRJ-2026-002', 'cust-002', 'Metro Retail Group',
    NULL, NULL, 110000, 'PHP', 'Bank Transfer',
    'Billing — FWD-2026-003 (FCL 40ft Busan–Cebu)',
    'Forwarding invoice — completed shipment', 'posted',
    '2026-02-19 10:00:00+08', '2026-02-19 16:00:00+08', '2026-02-20 08:00:00+08',
    jsonb_build_array(jsonb_build_object(
      'user_id', (SELECT id FROM users WHERE email = 'acct.manager@neuron.ph'),
      'user_name', 'Maria Cruz', 'role', 'manager',
      'status', 'approved', 'timestamp', '2026-02-19T16:00:00+08:00', 'remarks', 'Approved'
    )),
    'Revenue', 'Forwarding Income',
    (SELECT id FROM users WHERE email = 'acct.manager@neuron.ph'), 'Maria Cruz',
    'Posted — completed Cebu forwarding'),

  -- 3 × collection (AR)
  ('ev-005', 'EV-2026-005', 'collection', 'accounting', 'AR',
    'bk-brk-003', 'prj-2026-002', 'PRJ-2026-002', 'cust-002', 'Metro Retail Group',
    NULL, NULL, 18500, 'PHP', 'Check',
    'Collection — BRK-2026-003',
    'Payment received — check no. CHK-MR-2026-0041', 'pending',
    '2026-03-01 10:00:00+08', NULL, NULL, '[]'::jsonb,
    'Asset', 'Accounts Receivable',
    (SELECT id FROM users WHERE email = 'acct.rep@neuron.ph'), 'Ana Mendoza',
    'Check received, pending clearance'),

  ('ev-006', 'EV-2026-006', 'collection', 'accounting', 'AR',
    'bk-fwd-003', 'prj-2026-002', 'PRJ-2026-002', 'cust-002', 'Metro Retail Group',
    NULL, NULL, 110000, 'PHP', 'Bank Transfer',
    'Collection — FWD-2026-003',
    'Bank transfer payment confirmed', 'posted',
    '2026-02-25 09:00:00+08', '2026-02-25 14:00:00+08', '2026-02-26 08:00:00+08',
    jsonb_build_array(jsonb_build_object(
      'user_id', (SELECT id FROM users WHERE email = 'acct.manager@neuron.ph'),
      'user_name', 'Maria Cruz', 'role', 'manager',
      'status', 'approved', 'timestamp', '2026-02-25T14:00:00+08:00', 'remarks', 'Posted'
    )),
    'Asset', 'Accounts Receivable',
    (SELECT id FROM users WHERE email = 'acct.manager@neuron.ph'), 'Maria Cruz',
    'Fully collected and posted'),

  ('ev-007', 'EV-2026-007', 'collection', 'accounting', 'AR',
    'bk-mip-002', 'prj-2026-003', 'PRJ-2026-003', 'cust-003', 'Pacific Distribution Co.',
    NULL, NULL, 4200, 'PHP', 'Cash',
    'Collection — MIP-2026-002',
    'Cash payment for marine insurance', 'posted',
    '2026-03-10 11:00:00+08', '2026-03-10 15:00:00+08', '2026-03-11 08:00:00+08',
    jsonb_build_array(jsonb_build_object(
      'user_id', (SELECT id FROM users WHERE email = 'acct.manager@neuron.ph'),
      'user_name', 'Maria Cruz', 'role', 'manager',
      'status', 'approved', 'timestamp', '2026-03-10T15:00:00+08:00', 'remarks', 'OK'
    )),
    'Asset', 'Accounts Receivable',
    (SELECT id FROM users WHERE email = 'acct.manager@neuron.ph'), 'Maria Cruz',
    'Cash collected, posted'),

  -- 4 × expense (AP)
  ('ev-008', 'EV-2026-008', 'expense', 'operations', 'AP',
    'bk-brk-001', 'prj-2026-001', 'PRJ-2026-001', 'cust-001', 'Reyes Global Trading',
    'Bureau of Customs', NULL, 38400, 'PHP', 'Bank Transfer',
    'Customs Duties Payment — FE-2026-0041',
    'Advance payment of import duties on behalf of client', 'draft',
    NULL, NULL, NULL, '[]'::jsonb,
    'Expense', 'Government Charges',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'), 'Mike Villanueva',
    'Pending confirmation of duty assessment'),

  ('ev-009', 'EV-2026-009', 'expense', 'operations', 'AP',
    'bk-fwd-001', 'prj-2026-001', 'PRJ-2026-001', 'cust-001', 'Reyes Global Trading',
    'FastHaul Trucking Corp.', 'sp-003', 8200, 'PHP', 'Cash',
    'Trucking — TRK-2026-001 (Port to Cavite)',
    'Vendor payment for trucking service', 'pending',
    '2026-03-17 16:00:00+08', NULL, NULL,
    jsonb_build_array(jsonb_build_object(
      'user_id', (SELECT id FROM users WHERE email = 'ops.supervisor@neuron.ph'),
      'user_name', 'Jenny Lim', 'role', 'manager',
      'status', 'pending', 'timestamp', '2026-03-17T16:00:00+08:00', 'remarks', ''
    )),
    'Expense', 'Subcontractor Costs',
    (SELECT id FROM users WHERE email = 'ops.supervisor@neuron.ph'), 'Jenny Lim',
    'Awaiting supervisor approval'),

  ('ev-010', 'EV-2026-010', 'expense', 'operations', 'AP',
    'bk-mip-001', 'prj-2026-001', 'PRJ-2026-001', 'cust-001', 'Reyes Global Trading',
    'Pioneer Insurance', 'sp-004', 2880, 'PHP', 'Bank Transfer',
    'Marine Insurance Premium — MIP-2026-001',
    'Premium payment to insurer', 'posted',
    '2026-03-02 09:00:00+08', '2026-03-02 14:00:00+08', '2026-03-03 08:00:00+08',
    jsonb_build_array(jsonb_build_object(
      'user_id', (SELECT id FROM users WHERE email = 'ops.manager@neuron.ph'),
      'user_name', 'Robert Tan', 'role', 'director',
      'status', 'approved', 'timestamp', '2026-03-02T14:00:00+08:00', 'remarks', 'Approved — routine'
    )),
    'Expense', 'Insurance Premiums',
    (SELECT id FROM users WHERE email = 'ops.supervisor@neuron.ph'), 'Jenny Lim',
    'Posted'),

  ('ev-011', 'EV-2026-011', 'expense', 'operations', 'AP',
    'bk-fwd-002', 'prj-2026-001', 'PRJ-2026-001', 'cust-001', 'Reyes Global Trading',
    'Globe Forwarding Ltd.', 'sp-001', 139500, 'PHP', 'Bank Transfer',
    'Agent Fee + Freight — FWD-2026-002 (via Globe HK)',
    'Overseas agent remittance', 'rejected',
    '2026-03-10 09:00:00+08', NULL, NULL,
    jsonb_build_array(jsonb_build_object(
      'user_id', (SELECT id FROM users WHERE email = 'ops.manager@neuron.ph'),
      'user_name', 'Robert Tan', 'role', 'director',
      'status', 'rejected', 'timestamp', '2026-03-11T10:00:00+08:00',
      'remarks', 'Missing supporting invoice from agent — resubmit'
    )),
    'Expense', 'Agent Fees',
    (SELECT id FROM users WHERE email = 'ops.supervisor@neuron.ph'), 'Jenny Lim',
    'Rejected — agent invoice missing, must resubmit'),

  -- 3 × budget_request
  ('ev-012', 'EV-2026-012', 'budget_request', 'bd', NULL,
    NULL, 'prj-2026-001', 'PRJ-2026-001', 'cust-001', 'Reyes Global Trading',
    NULL, NULL, 25000, 'PHP', NULL,
    'Client Entertainment Budget — Q1 2026',
    'Business development budget for Reyes Global account', 'pending',
    '2026-03-05 09:00:00+08', NULL, NULL, '[]'::jsonb,
    'Expense', 'Business Development',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'), 'Ben Santos',
    'Monthly client entertainment for key account'),

  ('ev-013', 'EV-2026-013', 'budget_request', 'bd', NULL,
    NULL, 'prj-2026-002', 'PRJ-2026-002', 'cust-002', 'Metro Retail Group',
    NULL, NULL, 15000, 'PHP', NULL,
    'Marketing Materials — Trade Fair 2026',
    'Budget for trade fair collaterals', 'posted',
    '2026-02-15 09:00:00+08', '2026-02-16 10:00:00+08', '2026-02-17 08:00:00+08',
    jsonb_build_array(jsonb_build_object(
      'user_id', (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph'),
      'user_name', 'Diana Reyes', 'role', 'manager',
      'status', 'approved', 'timestamp', '2026-02-16T10:00:00+08:00', 'remarks', 'Approved'
    )),
    'Expense', 'Marketing',
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph'), 'Diana Reyes',
    'Approved — materials procured'),

  ('ev-014', 'EV-2026-014', 'budget_request', 'bd', NULL,
    NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, 50000, 'PHP', NULL,
    'Office Supplies Replenishment',
    'Quarterly office supplies budget', 'rejected',
    '2026-03-01 09:00:00+08', NULL, NULL,
    jsonb_build_array(jsonb_build_object(
      'user_id', (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph'),
      'user_name', 'Diana Reyes', 'role', 'manager',
      'status', 'rejected', 'timestamp', '2026-03-02T09:00:00+08:00',
      'remarks', 'Exceeds quarter cap — submit a revised amount below 30K'
    )),
    'Expense', 'Office Supplies',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'), 'Ben Santos',
    'Rejected — amount over cap'),

  -- 2 × cash_advance
  ('ev-015', 'EV-2026-015', 'cash_advance', 'accounting', 'AP',
    'bk-brk-002', 'prj-2026-001', 'PRJ-2026-001', 'cust-001', 'Reyes Global Trading',
    NULL, NULL, 80000, 'PHP', 'Cash',
    'Cash Advance — Customs Duties FE-2026-0042',
    'Pre-payment for anticipated duties + taxes', 'pending',
    '2026-03-15 09:00:00+08', NULL, NULL, '[]'::jsonb,
    'Asset', 'Cash Advances',
    (SELECT id FROM users WHERE email = 'acct.rep@neuron.ph'), 'Ana Mendoza',
    'Pending — duty assessment still ongoing'),

  ('ev-016', 'EV-2026-016', 'cash_advance', 'accounting', 'AP',
    'bk-brk-001', 'prj-2026-001', 'PRJ-2026-001', 'cust-001', 'Reyes Global Trading',
    NULL, NULL, 40000, 'PHP', 'Bank Transfer',
    'Cash Advance — Port Charges FWD-2026-001',
    'Advance for port handling and examination fees', 'posted',
    '2026-03-16 10:00:00+08', '2026-03-16 14:00:00+08', '2026-03-16 16:00:00+08',
    jsonb_build_array(jsonb_build_object(
      'user_id', (SELECT id FROM users WHERE email = 'acct.manager@neuron.ph'),
      'user_name', 'Maria Cruz', 'role', 'manager',
      'status', 'approved', 'timestamp', '2026-03-16T14:00:00+08:00',
      'remarks', 'Approved — routine port advance'
    )),
    'Asset', 'Cash Advances',
    (SELECT id FROM users WHERE email = 'acct.manager@neuron.ph'), 'Maria Cruz',
    'Posted — liquidation due March 30')

ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- TIER 7 — Budget Requests (separate table)
-- ============================================================================

INSERT INTO budget_requests (id, title, description, amount, currency, status,
  category, requested_by, approved_by, customer_id, project_id, notes)
VALUES
  ('br-001', 'Q1 Client Entertainment — Reyes Global',
    'Dinners and site visits for Reyes Global key contacts during Q1 2026',
    25000, 'PHP', 'Pending', 'Client Entertainment',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'),
    NULL, 'cust-001', 'prj-2026-001',
    'Covers approx. 4 dinners + 1 golf outing'),

  ('br-002', 'Trade Fair Booth — LogisPh 2026',
    'Booth rental and collaterals for LogisPh Trade Fair, April 2026',
    85000, 'PHP', 'Approved', 'Marketing',
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph'),
    (SELECT id FROM users WHERE email = 'exec@neuron.ph'),
    NULL, NULL,
    'Approved by CEO — 2×3m booth, collaterals included'),

  ('br-003', 'Office Supplies Replenishment Q1',
    'Quarterly replenishment: printer cartridges, paper, stationery',
    50000, 'PHP', 'Rejected', 'Office Supplies',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'),
    NULL, NULL, NULL,
    'Rejected — amount over cap. Resubmit below PHP 30,000.'),

  ('br-004', 'Team Field Expenses — Port Visits March',
    'Transportation and allowances for port inspection visits',
    18000, 'PHP', 'Disbursed', 'Field Operations',
    (SELECT id FROM users WHERE email = 'ops.supervisor@neuron.ph'),
    (SELECT id FROM users WHERE email = 'ops.manager@neuron.ph'),
    NULL, 'prj-2026-001',
    'Disbursed — receipts submitted, liquidation pending')

ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- TIER 8A — Tasks
-- ============================================================================

INSERT INTO tasks (id, title, type, due_date, priority, status, remarks,
  contact_id, customer_id, owner_id, assigned_to)
VALUES
  -- BD Rep tasks (5)
  ('task-001', 'Follow up on QT-2026-001 draft quotation',
    'Call', '2026-03-18 10:00:00+08', 'High', 'Pending',
    'Victor needs revised pricing for marine insurance',
    'con-005', 'cust-003',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'),
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph')),

  ('task-002', 'Send updated rate sheet to Metro Retail',
    'Email', '2026-03-19 09:00:00+08', 'Medium', 'Pending',
    'Alicia requested new FCL rates for Q2',
    'con-003', 'cust-002',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'),
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph')),

  ('task-003', 'LinkedIn message to Pacific Distribution finance contact',
    'LinkedIn', '2026-03-20 14:00:00+08', 'Low', 'Ongoing',
    'Introduce marine insurance bundling angle',
    'con-006', 'cust-003',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'),
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph')),

  ('task-004', 'Schedule Q1 review meeting with Reyes Global',
    'Meeting', '2026-03-25 10:00:00+08', 'High', 'Pending',
    'Quarterly performance review + contract renewal discussion',
    'con-001', 'cust-001',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'),
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph')),

  ('task-005', 'Log call with Carmela Santos — BRK update',
    'Call', '2026-03-16 15:00:00+08', 'Medium', 'Completed',
    'Called — confirmed FE-2026-0041 status, no issues',
    'con-002', 'cust-001',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'),
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph')),

  -- BD Manager tasks (5)
  ('task-006', 'Negotiate contract renewal with Reyes Global CEO',
    'Meeting', '2026-03-28 10:00:00+08', 'High', 'Pending',
    'Contract expires Dec 31 — start renewal talks now',
    'con-001', 'cust-001',
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph'),
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph')),

  ('task-007', 'Review and approve QT-2026-001',
    'To-do', '2026-03-17 17:00:00+08', 'High', 'Ongoing',
    'Review pricing before sending to Pacific Distribution',
    'con-005', 'cust-003',
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph'),
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph')),

  ('task-008', 'Send LogisPh Trade Fair proposal to CEO',
    'Email', '2026-03-17 12:00:00+08', 'Medium', 'Completed',
    'Budget approved — coordinate with events team',
    NULL, NULL,
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph'),
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph')),

  ('task-009', 'Follow up QT-2026-002 — Metro Retail FCL quote',
    'Call', '2026-03-20 11:00:00+08', 'Medium', 'Pending',
    '2 weeks since sending — check if pricing is competitive',
    'con-003', 'cust-002',
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph'),
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph')),

  ('task-010', 'Viber update to Ramon Dela Cruz — BRK-003 completion',
    'Viber', '2026-03-16 16:00:00+08', 'Low', 'Completed',
    'Informed client of successful clearance and delivery',
    'con-004', 'cust-002',
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph'),
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'))

ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- TIER 8B — CRM Activities
-- ============================================================================

INSERT INTO crm_activities (id, type, description, date, contact_id, customer_id, task_id, user_id)
VALUES
  ('crma-001', 'Call Logged',
    'Quarterly check-in with Jose Reyes Jr. — discussed contract performance and renewal timeline.',
    '2026-03-10 14:00:00+08', 'con-001', 'cust-001', 'task-006',
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph')),

  ('crma-002', 'Meeting Logged',
    'On-site visit to Reyes Global Cavite warehouse. Reviewed logistics flow and identified pain points in customs clearance.',
    '2026-03-05 10:00:00+08', 'con-002', 'cust-001', NULL,
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph')),

  ('crma-003', 'Email Logged',
    'Sent Q1 performance report to Carmela Santos — on-time delivery rate 94%, zero rejected entries.',
    '2026-03-12 09:30:00+08', 'con-002', 'cust-001', NULL,
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph')),

  ('crma-004', 'Call Logged',
    'Called Alicia Tan to follow up on QT-2026-002. She needs revised pricing by March 25 for budget approval.',
    '2026-03-14 11:00:00+08', 'con-003', 'cust-002', 'task-009',
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph')),

  ('crma-005', 'Meeting Logged',
    'Business lunch with Ramon Dela Cruz and Alicia Tan. Presented Q2 forwarding rates — positive reception.',
    '2026-03-08 12:00:00+08', 'con-003', 'cust-002', NULL,
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph')),

  ('crma-006', 'Note',
    'Metro Retail expanding to Visayas — opportunity to pitch Cebu hub forwarding and trucking.',
    '2026-03-11 15:00:00+08', 'con-003', 'cust-002', NULL,
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph')),

  ('crma-007', 'Call Logged',
    'Initial discovery call with Victor Lim. He is evaluating marine insurance plus forwarding bundle. Very interested in cost-saving angle.',
    '2026-03-01 10:00:00+08', 'con-005', 'cust-003', 'task-001',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph')),

  ('crma-008', 'Email Logged',
    'Sent marine insurance brochure and forwarding rate card to Victor Lim and Sarah Buenaventura.',
    '2026-03-03 09:00:00+08', 'con-006', 'cust-003', NULL,
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph')),

  ('crma-009', 'System Update',
    'Status changed: Pacific Distribution Co. — Prospect to SQL.',
    '2026-03-07 16:00:00+08', 'con-005', 'cust-003', NULL,
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph')),

  ('crma-010', 'Note',
    'Sarah Buenaventura requested Net 60 payment terms. Check with accounting on credit policy before finalizing QT-2026-001.',
    '2026-03-09 14:30:00+08', 'con-006', 'cust-003', NULL,
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph')),

  ('crma-011', 'Call Logged',
    'Contract renewal discussion with Jose Reyes Jr. He confirmed intention to renew for another year — wants a 5% volume discount.',
    '2026-03-15 15:00:00+08', 'con-001', 'cust-001', 'task-006',
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph')),

  ('crma-012', 'System Update',
    'QT-2026-003 converted to Project PRJ-2026-002.',
    '2026-02-28 09:00:00+08', 'con-004', 'cust-002', NULL,
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph'))

ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- TIER 9 — Chart of Accounts
-- ============================================================================

INSERT INTO accounts (id, code, name, type, sub_type, category, sub_category,
  description, balance, normal_balance, is_active, is_system, sort_order)
VALUES
  -- Assets
  ('acct-1000', '1000', 'Cash and Cash Equivalents',
    'Asset', 'Current Asset', 'Cash', NULL,
    'Petty cash, bank accounts, and short-term instruments',
    2850000, 'debit', true, true, 10),
  ('acct-1100', '1100', 'Accounts Receivable',
    'Asset', 'Current Asset', 'Receivable', NULL,
    'Amounts owed by clients for services rendered',
    411000, 'debit', true, true, 20),
  ('acct-1200', '1200', 'Advances to Officers and Employees',
    'Asset', 'Current Asset', 'Advances', NULL,
    'Cash advances pending liquidation',
    120000, 'debit', true, false, 30),
  ('acct-1300', '1300', 'Prepaid Expenses',
    'Asset', 'Current Asset', 'Prepaid', NULL,
    'Insurance premiums and deposits paid in advance',
    45000, 'debit', true, false, 40),
  ('acct-1500', '1500', 'Property and Equipment (net)',
    'Asset', 'Non-Current Asset', 'Fixed Asset', NULL,
    'Computers, office furniture, leasehold improvements less accumulated depreciation',
    480000, 'debit', true, false, 50),

  -- Liabilities
  ('acct-2000', '2000', 'Accounts Payable',
    'Liability', 'Current Liability', 'Payable', NULL,
    'Amounts owed to shipping lines, agents, and subcontractors',
    285000, 'credit', true, true, 100),
  ('acct-2100', '2100', 'Tax Payable',
    'Liability', 'Current Liability', 'Tax', 'Output VAT',
    'Output VAT and withholding taxes payable to BIR',
    68400, 'credit', true, true, 110),
  ('acct-2200', '2200', 'Accrued Expenses',
    'Liability', 'Current Liability', 'Accrual', NULL,
    'Salaries, utilities, and other accrued obligations',
    125000, 'credit', true, false, 120),
  ('acct-2300', '2300', 'Advances from Clients',
    'Liability', 'Current Liability', 'Advance', NULL,
    'Payments received in advance before service delivery',
    0, 'credit', true, false, 130),
  ('acct-2900', '2900', 'Loans Payable',
    'Liability', 'Non-Current Liability', 'Loan', NULL,
    'Bank loans and long-term borrowings',
    0, 'credit', true, false, 140),

  -- Equity
  ('acct-3000', '3000', 'Owner''s Capital',
    'Equity', 'Capital', 'Capital', NULL,
    'Paid-in capital and initial investment',
    3000000, 'credit', true, true, 200),
  ('acct-3100', '3100', 'Retained Earnings',
    'Equity', 'Retained Earnings', 'Retained Earnings', NULL,
    'Accumulated profits / losses from prior periods',
    845000, 'credit', true, true, 210),
  ('acct-3200', '3200', 'Current Year Earnings',
    'Equity', 'Retained Earnings', 'Current Period', NULL,
    'Net income for the current financial year',
    0, 'credit', true, true, 220),

  -- Revenue
  ('acct-4000', '4000', 'Forwarding Income',
    'Revenue', 'Operating Revenue', 'Service Income', 'Forwarding',
    'Revenue from freight forwarding services',
    393500, 'credit', true, true, 300),
  ('acct-4100', '4100', 'Brokerage Income',
    'Revenue', 'Operating Revenue', 'Service Income', 'Brokerage',
    'Revenue from customs brokerage services',
    59000, 'credit', true, true, 310),
  ('acct-4200', '4200', 'Trucking Income',
    'Revenue', 'Operating Revenue', 'Service Income', 'Trucking',
    'Revenue from trucking and delivery services',
    21000, 'credit', true, true, 320),
  ('acct-4300', '4300', 'Marine Insurance Income',
    'Revenue', 'Operating Revenue', 'Service Income', 'Marine Insurance',
    'Revenue from marine insurance facilitation',
    7400, 'credit', true, true, 330),
  ('acct-4400', '4400', 'Other Services Income',
    'Revenue', 'Operating Revenue', 'Service Income', 'Others',
    'Revenue from warehousing, repacking, and miscellaneous services',
    29500, 'credit', true, false, 340),

  -- Cost of Services
  ('acct-5000', '5000', 'Agent Fees — Overseas',
    'Expense', 'Cost of Services', 'Direct Cost', 'Agent Fees',
    'Fees paid to overseas and local forwarding agents',
    213700, 'debit', true, true, 400),
  ('acct-5100', '5100', 'Ocean / Air Freight Cost',
    'Expense', 'Cost of Services', 'Direct Cost', 'Freight',
    'Freight charges paid to carriers',
    0, 'debit', true, true, 410),
  ('acct-5200', '5200', 'Port and Handling Charges',
    'Expense', 'Cost of Services', 'Direct Cost', 'Port Charges',
    'Port dues, wharfage, arrastre, container yard charges',
    0, 'debit', true, true, 420),
  ('acct-5300', '5300', 'Customs Duties and Taxes',
    'Expense', 'Cost of Services', 'Direct Cost', 'Government',
    'Import duties, VAT, excise taxes paid on behalf of clients',
    38400, 'debit', true, true, 430),
  ('acct-5400', '5400', 'Subcontractor Costs — Trucking',
    'Expense', 'Cost of Services', 'Direct Cost', 'Subcontractor',
    'Payments to truckers and delivery subcontractors',
    15000, 'debit', true, false, 440),
  ('acct-5500', '5500', 'Insurance Premiums Paid',
    'Expense', 'Cost of Services', 'Direct Cost', 'Insurance',
    'Marine and other insurance premiums paid on behalf of clients',
    6600, 'debit', true, false, 450),

  -- Operating Expenses
  ('acct-6000', '6000', 'Salaries and Wages',
    'Expense', 'Operating Expense', 'Personnel', NULL,
    'Regular payroll — all departments',
    850000, 'debit', true, true, 500),
  ('acct-6100', '6100', 'Office Rent',
    'Expense', 'Operating Expense', 'Occupancy', NULL,
    'Monthly office space rental',
    120000, 'debit', true, false, 510),
  ('acct-6200', '6200', 'Utilities',
    'Expense', 'Operating Expense', 'Occupancy', NULL,
    'Electricity, internet, water',
    35000, 'debit', true, false, 520),
  ('acct-6300', '6300', 'Marketing and Business Development',
    'Expense', 'Operating Expense', 'Marketing', NULL,
    'Trade fairs, collaterals, client entertainment',
    100000, 'debit', true, false, 530),
  ('acct-6400', '6400', 'Office Supplies and Expenses',
    'Expense', 'Operating Expense', 'Administrative', NULL,
    'Stationery, printer consumables, sundry office costs',
    18000, 'debit', true, false, 540),
  ('acct-6500', '6500', 'Depreciation Expense',
    'Expense', 'Operating Expense', 'Non-Cash', NULL,
    'Depreciation of property and equipment',
    48000, 'debit', true, false, 550),
  ('acct-6600', '6600', 'Miscellaneous Expenses',
    'Expense', 'Operating Expense', 'Administrative', NULL,
    'Sundry expenses not classified elsewhere',
    12000, 'debit', true, false, 560)

ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- TIER 10A — Ticket Types
-- ============================================================================

INSERT INTO ticket_types (id, name, description, default_due_hours)
VALUES
  ('Shipment Inquiry',      'Shipment Inquiry',     'Questions about booking status, ETAs, and shipment tracking',  4),
  ('Billing Issue',         'Billing Issue',        'Billing disputes, invoice corrections, and payment inquiries', 24),
  ('Documentation Request', 'Documentation Request','Requests for BOL, COR, invoices, delivery receipts',            8),
  ('Complaint',             'Complaint',            'Formal complaints about service quality, delays, or damages',  48)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- TIER 10B — Tickets
-- ============================================================================

INSERT INTO tickets (id, ticket_number, ticket_type, title, description, priority, status,
  created_by, created_by_name, assigned_to, assigned_to_name,
  department, from_department, to_department,
  entity_type, entity_id, tags)
VALUES
  ('tkt-001', 'TKT-2026-001', 'Shipment Inquiry',
    'ETA update for FWD-2026-001',
    'Client Reyes Global is requesting updated ETA for FWD-2026-001 (EVER GOLDEN vessel). Currently shown as March 18 but no port arrival notice yet.',
    'High', 'Open',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'), 'Ben Santos',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'), 'Mike Villanueva',
    'Operations', 'Business Development', 'Operations',
    'booking', 'bk-fwd-001', ARRAY['forwarding','eta','client-request']),

  ('tkt-002', 'TKT-2026-002', 'Billing Issue',
    'Invoice discrepancy — EV-2026-003 BRK-2026-003',
    'Metro Retail disputes the documentation fee of PHP 3,500 on EV-2026-003. Their PO only covers freight and handling. Need credit note or explanation.',
    'Medium', 'In Progress',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'), 'Ben Santos',
    (SELECT id FROM users WHERE email = 'acct.manager@neuron.ph'), 'Maria Cruz',
    'Accounting', 'Business Development', 'Accounting',
    'evoucher', 'ev-003', ARRAY['billing','dispute','metro-retail']),

  ('tkt-003', 'TKT-2026-003', 'Documentation Request',
    'Request for Delivery Receipt — TRK-2026-002',
    'Metro Retail Caloocan DC requesting signed delivery receipt for TRK-2026-002 for their internal records.',
    'Low', 'Resolved',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'), 'Ben Santos',
    (SELECT id FROM users WHERE email = 'ops.supervisor@neuron.ph'), 'Jenny Lim',
    'Operations', 'Business Development', 'Operations',
    'booking', 'bk-trk-002', ARRAY['documentation','trucking']),

  ('tkt-004', 'TKT-2026-004', 'Complaint',
    'Delayed clearance — BRK-2026-001 exceeding SLA',
    'Reyes Global complaining about BRK-2026-001 clearance taking more than 5 business days vs 3-day SLA in contract. Request formal explanation and remediation plan.',
    'Urgent', 'Open',
    (SELECT id FROM users WHERE email = 'bd.manager@neuron.ph'), 'Diana Reyes',
    (SELECT id FROM users WHERE email = 'ops.manager@neuron.ph'), 'Robert Tan',
    'Operations', 'Business Development', 'Operations',
    'booking', 'bk-brk-001', ARRAY['complaint','sla-breach','priority']),

  ('tkt-005', 'TKT-2026-005', 'Billing Issue',
    'Missing official receipt for MIP-2026-002',
    'Pacific Distribution requesting official receipt for marine insurance premium collection (EV-2026-007, PHP 4,200). Receipt not yet issued.',
    'Medium', 'In Progress',
    (SELECT id FROM users WHERE email = 'acct.rep@neuron.ph'), 'Ana Mendoza',
    (SELECT id FROM users WHERE email = 'acct.manager@neuron.ph'), 'Maria Cruz',
    'Accounting', 'Accounting', 'Accounting',
    'evoucher', 'ev-007', ARRAY['billing','receipt','marine-insurance']),

  ('tkt-006', 'TKT-2026-006', 'Documentation Request',
    'COO request — FWD-2026-003 (Cebu shipment)',
    'Metro Retail Cebu hub needs Certificate of Origin for the Busan–Cebu shipment (FWD-2026-003) for BIR documentation.',
    'Medium', 'Closed',
    (SELECT id FROM users WHERE email = 'bd.rep@neuron.ph'), 'Ben Santos',
    (SELECT id FROM users WHERE email = 'ops.handler@neuron.ph'), 'Mike Villanueva',
    'Operations', 'Business Development', 'Operations',
    'booking', 'bk-fwd-003', ARRAY['documentation','coo','cebu'])

ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- Counters — initialize booking/entity sequence counters
-- ============================================================================

INSERT INTO counters (key, value)
VALUES
  ('forwarding_booking_counter',       '3'::jsonb),
  ('brokerage_booking_counter',        '3'::jsonb),
  ('trucking_booking_counter',         '2'::jsonb),
  ('marine_insurance_booking_counter', '2'::jsonb),
  ('others_booking_counter',           '2'::jsonb),
  ('project_counter',                  '3'::jsonb),
  ('quotation_counter',                '5'::jsonb),
  ('evoucher_counter',                 '16'::jsonb),
  ('ticket_counter',                   '6'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;


-- ============================================================================
-- Tier 11: Billing Line Items
-- billing_line_items is the revenue atom read by the Billings tab.
-- All inserts use ON CONFLICT (id) DO NOTHING — safe to re-run.
-- ============================================================================

INSERT INTO billing_line_items
  (id, booking_id, project_id, project_number, customer_name,
   description, charge_type, category, service_type,
   amount, quantity, unit_price, currency, unit_type, status)
VALUES
  -- PRJ-2026-001 / Reyes Global Trading (INV-2026-001 bundles these)
  ('bli-001', 'bk-fwd-001', 'prj-2026-001', 'PRJ-2026-001', 'Reyes Global Trading',
   'Ocean Freight — FCL Shanghai to Manila', 'revenue', 'Freight', 'Forwarding',
   180000.00, 1, 180000.00, 'PHP', 'per_container', 'billed'),

  ('bli-002', 'bk-fwd-001', 'prj-2026-001', 'PRJ-2026-001', 'Reyes Global Trading',
   'Documentation & B/L Fee', 'revenue', 'Documentation', 'Forwarding',
   8500.00, 1, 8500.00, 'PHP', 'per_bl', 'billed'),

  ('bli-003', 'bk-fwd-001', 'prj-2026-001', 'PRJ-2026-001', 'Reyes Global Trading',
   'Port Charges — MICP', 'revenue', 'Destination Charges', 'Forwarding',
   12000.00, 1, 12000.00, 'PHP', 'per_container', 'unbilled'),

  ('bli-004', 'bk-brk-001', 'prj-2026-001', 'PRJ-2026-001', 'Reyes Global Trading',
   'Customs Brokerage Professional Fee', 'revenue', 'Government', 'Brokerage',
   45000.00, 1, 45000.00, 'PHP', 'per_shipment', 'billed'),

  ('bli-005', 'bk-trk-001', 'prj-2026-001', 'PRJ-2026-001', 'Reyes Global Trading',
   'Trucking — Port of Manila to Laguna Warehouse', 'revenue', 'Freight', 'Trucking',
   25000.00, 1, 25000.00, 'PHP', 'per_shipment', 'billed'),

  ('bli-006', 'bk-mip-001', 'prj-2026-001', 'PRJ-2026-001', 'Reyes Global Trading',
   'Marine Cargo Insurance Premium — All Risk', 'revenue', 'Insurance', 'Marine Insurance',
   15000.00, 1, 15000.00, 'PHP', 'per_shipment', 'billed'),

  -- PRJ-2026-002 / Metro Retail Group (INV-2026-002 bundles billed; rest unbilled)
  ('bli-007', 'bk-fwd-002', 'prj-2026-002', 'PRJ-2026-002', 'Metro Retail Group',
   'Ocean Freight — FCL Kaohsiung to Manila', 'revenue', 'Freight', 'Forwarding',
   195000.00, 1, 195000.00, 'PHP', 'per_container', 'billed'),

  ('bli-008', 'bk-fwd-002', 'prj-2026-002', 'PRJ-2026-002', 'Metro Retail Group',
   'Origin Charges — Taiwan', 'revenue', 'Origin Charges', 'Forwarding',
   15000.00, 1, 15000.00, 'PHP', 'per_shipment', 'unbilled'),

  ('bli-009', 'bk-brk-002', 'prj-2026-002', 'PRJ-2026-002', 'Metro Retail Group',
   'Customs Brokerage Professional Fee', 'revenue', 'Government', 'Brokerage',
   38000.00, 1, 38000.00, 'PHP', 'per_shipment', 'unbilled'),

  ('bli-010', 'bk-trk-002', 'prj-2026-002', 'PRJ-2026-002', 'Metro Retail Group',
   'Trucking — Port of Manila to Quezon City Warehouse', 'revenue', 'Freight', 'Trucking',
   22000.00, 1, 22000.00, 'PHP', 'per_shipment', 'unbilled'),

  -- PRJ-2026-003 / Pacific Distribution Co. (fully paid)
  ('bli-011', 'bk-fwd-003', 'prj-2026-003', 'PRJ-2026-003', 'Pacific Distribution Co.',
   'Ocean Freight — FCL Shenzhen to Manila', 'revenue', 'Freight', 'Forwarding',
   175000.00, 1, 175000.00, 'PHP', 'per_container', 'paid'),

  ('bli-012', 'bk-mip-002', 'prj-2026-003', 'PRJ-2026-003', 'Pacific Distribution Co.',
   'Marine Cargo Insurance Premium — All Risk', 'revenue', 'Insurance', 'Marine Insurance',
   12500.00, 1, 12500.00, 'PHP', 'per_shipment', 'paid')

ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- Tier 12: Invoices
-- ============================================================================

INSERT INTO invoices
  (id, invoice_number, invoice_date, due_date,
   booking_id, booking_ids, project_id, project_number,
   customer_id, customer_name, service_types,
   subtotal, total_amount, currency,
   status, posted, posted_at, billing_item_ids, notes)
VALUES
  -- INV-2026-001: Reyes Global Trading — partial payment outstanding
  ('inv-2026-001', 'INV-2026-001', '2026-03-01 09:00:00+08', '2026-03-11 09:00:00+08',
   'bk-fwd-001', ARRAY['bk-fwd-001','bk-brk-001','bk-trk-001','bk-mip-001'],
   'prj-2026-001', 'PRJ-2026-001',
   'cust-001', 'Reyes Global Trading',
   ARRAY['Forwarding','Brokerage','Trucking','Marine Insurance'],
   273500.00, 273500.00, 'PHP',
   'posted', true, '2026-03-01 10:00:00+08',
   ARRAY['bli-001','bli-002','bli-004','bli-005','bli-006'],
   'Invoice for FWD-2026-001, BRK-2026-001, TRK-2026-001, MIP-2026-001 — partial payment received'),

  -- INV-2026-002: Metro Retail Group — unpaid, not yet due
  ('inv-2026-002', 'INV-2026-002', '2026-03-10 09:00:00+08', '2026-04-09 09:00:00+08',
   'bk-fwd-002', ARRAY['bk-fwd-002'],
   'prj-2026-002', 'PRJ-2026-002',
   'cust-002', 'Metro Retail Group',
   ARRAY['Forwarding'],
   195000.00, 195000.00, 'PHP',
   'posted', true, '2026-03-10 10:00:00+08',
   ARRAY['bli-007'],
   'Invoice for FWD-2026-002 — Net 30'),

  -- INV-2026-003: Pacific Distribution — fully paid
  ('inv-2026-003', 'INV-2026-003', '2026-02-20 09:00:00+08', '2026-03-06 09:00:00+08',
   'bk-fwd-003', ARRAY['bk-fwd-003','bk-mip-002'],
   'prj-2026-003', 'PRJ-2026-003',
   'cust-003', 'Pacific Distribution Co.',
   ARRAY['Forwarding','Marine Insurance'],
   187500.00, 187500.00, 'PHP',
   'paid', true, '2026-02-20 10:00:00+08',
   ARRAY['bli-011','bli-012'],
   'Invoice for FWD-2026-003, MIP-2026-002 — fully settled')

ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- Tier 13: Collections
-- ============================================================================

INSERT INTO collections
  (id, collection_number,
   booking_id, booking_ids, project_id, project_number,
   customer_id, customer_name, invoice_id, service_types,
   amount, currency, payment_method, reference_number,
   collection_date, status, posted, posted_at, notes)
VALUES
  -- Partial payment on INV-2026-001 (Reyes Global — ₱150k of ₱273.5k)
  ('col-2026-001', 'OR-2026-001',
   'bk-fwd-001', ARRAY['bk-fwd-001','bk-brk-001','bk-trk-001','bk-mip-001'],
   'prj-2026-001', 'PRJ-2026-001',
   'cust-001', 'Reyes Global Trading', 'inv-2026-001',
   ARRAY['Forwarding','Brokerage','Trucking','Marine Insurance'],
   150000.00, 'PHP', 'Bank Transfer', 'BT-2026-03-10-001',
   '2026-03-10 14:00:00+08', 'posted', true, '2026-03-10 16:00:00+08',
   'Partial payment — balance ₱123,500 still outstanding'),

  -- Full payment on INV-2026-003 (Pacific Distribution)
  ('col-2026-002', 'OR-2026-002',
   'bk-fwd-003', ARRAY['bk-fwd-003','bk-mip-002'],
   'prj-2026-003', 'PRJ-2026-003',
   'cust-003', 'Pacific Distribution Co.', 'inv-2026-003',
   ARRAY['Forwarding','Marine Insurance'],
   187500.00, 'PHP', 'Check', 'CHK-2026-00451',
   '2026-03-05 10:00:00+08', 'posted', true, '2026-03-05 11:00:00+08',
   'Full settlement — invoice closed')

ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- Tier 14: Expenses
-- Essentials-mode expenses recorded directly (no E-Voucher approval step).
-- ============================================================================

INSERT INTO expenses
  (id, booking_id, project_id, project_number, customer_name,
   description, category, service_type,
   amount, quantity, unit_price, currency, status)
VALUES
  -- PRJ-2026-001 / FWD-001
  ('exp-001', 'bk-fwd-001', 'prj-2026-001', 'PRJ-2026-001', 'Reyes Global Trading',
   'Overseas Agent Freight Cost — Globe Forwarding HK', 'Freight', 'Forwarding',
   120000.00, 1, 120000.00, 'PHP', 'posted'),

  ('exp-002', 'bk-fwd-001', 'prj-2026-001', 'PRJ-2026-001', 'Reyes Global Trading',
   'MICP Port Handling & Arrastre', 'Handling', 'Forwarding',
   8200.00, 1, 8200.00, 'PHP', 'posted'),

  -- PRJ-2026-001 / BRK-001
  ('exp-003', 'bk-brk-001', 'prj-2026-001', 'PRJ-2026-001', 'Reyes Global Trading',
   'BOC Filing Fee & Stamps', 'Government', 'Brokerage',
   5500.00, 1, 5500.00, 'PHP', 'posted'),

  ('exp-004', 'bk-brk-001', 'prj-2026-001', 'PRJ-2026-001', 'Reyes Global Trading',
   'Arrastre & Wharfage Charges', 'Handling', 'Brokerage',
   12000.00, 1, 12000.00, 'PHP', 'posted'),

  -- PRJ-2026-001 / TRK-001
  ('exp-005', 'bk-trk-001', 'prj-2026-001', 'PRJ-2026-001', 'Reyes Global Trading',
   'Fuel & Toll — Manila to Laguna', 'Trucking', 'Trucking',
   3500.00, 1, 3500.00, 'PHP', 'posted'),

  -- PRJ-2026-002 / FWD-002
  ('exp-006', 'bk-fwd-002', 'prj-2026-002', 'PRJ-2026-002', 'Metro Retail Group',
   'Overseas Agent Freight Cost — Globe Forwarding TW', 'Freight', 'Forwarding',
   135000.00, 1, 135000.00, 'PHP', 'posted'),

  ('exp-007', 'bk-fwd-002', 'prj-2026-002', 'PRJ-2026-002', 'Metro Retail Group',
   'Port & Terminal Charges', 'Handling', 'Forwarding',
   9800.00, 1, 9800.00, 'PHP', 'posted'),

  -- PRJ-2026-002 / BRK-002
  ('exp-008', 'bk-brk-002', 'prj-2026-002', 'PRJ-2026-002', 'Metro Retail Group',
   'BOC Filing Fee & Stamps', 'Government', 'Brokerage',
   5000.00, 1, 5000.00, 'PHP', 'pending'),

  -- PRJ-2026-003 / FWD-003
  ('exp-009', 'bk-fwd-003', 'prj-2026-003', 'PRJ-2026-003', 'Pacific Distribution Co.',
   'Overseas Agent Freight Cost — Globe Forwarding SZ', 'Freight', 'Forwarding',
   118000.00, 1, 118000.00, 'PHP', 'posted'),

  ('exp-010', 'bk-fwd-003', 'prj-2026-003', 'PRJ-2026-003', 'Pacific Distribution Co.',
   'MICP Port Handling', 'Handling', 'Forwarding',
   7500.00, 1, 7500.00, 'PHP', 'posted')

ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- Final verification — row counts per table
-- ============================================================================

SELECT table_name, rows FROM (
  SELECT 'customers'        AS table_name, COUNT(*) AS rows FROM customers       UNION ALL
  SELECT 'contacts',                       COUNT(*)          FROM contacts        UNION ALL
  SELECT 'consignees',                     COUNT(*)          FROM consignees      UNION ALL
  SELECT 'service_providers',              COUNT(*)          FROM service_providers UNION ALL
  SELECT 'catalog_categories',             COUNT(*)          FROM catalog_categories UNION ALL
  SELECT 'catalog_items',                  COUNT(*)          FROM catalog_items   UNION ALL
  SELECT 'quotations',                     COUNT(*)          FROM quotations      UNION ALL
  SELECT 'projects',                       COUNT(*)          FROM projects        UNION ALL
  SELECT 'bookings',                       COUNT(*)          FROM bookings        UNION ALL
  SELECT 'project_bookings',               COUNT(*)          FROM project_bookings UNION ALL
  SELECT 'contract_bookings',              COUNT(*)          FROM contract_bookings UNION ALL
  SELECT 'evouchers',                      COUNT(*)          FROM evouchers       UNION ALL
  SELECT 'budget_requests',                COUNT(*)          FROM budget_requests UNION ALL
  SELECT 'tasks',                          COUNT(*)          FROM tasks           UNION ALL
  SELECT 'crm_activities',                 COUNT(*)          FROM crm_activities  UNION ALL
  SELECT 'accounts',                       COUNT(*)          FROM accounts        UNION ALL
  SELECT 'ticket_types',                   COUNT(*)          FROM ticket_types    UNION ALL
  SELECT 'tickets',                        COUNT(*)          FROM tickets        UNION ALL
  SELECT 'billing_line_items',             COUNT(*)          FROM billing_line_items UNION ALL
  SELECT 'invoices',                       COUNT(*)          FROM invoices       UNION ALL
  SELECT 'collections',                    COUNT(*)          FROM collections    UNION ALL
  SELECT 'expenses',                       COUNT(*)          FROM expenses
) t
ORDER BY table_name;
