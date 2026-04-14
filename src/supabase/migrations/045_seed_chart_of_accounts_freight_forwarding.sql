-- Migration 045: Seed the full freight-forwarding Chart of Accounts (coa-* IDs)
-- These replace the generic placeholder accounts (acct-*) that were in the original schema.
-- Old accounts are preserved via ON CONFLICT DO NOTHING — they won't be touched.
-- balance and starting_amount are seeded as 0 for production; the dev instance uses
-- test starting balances which are NOT copied here.

INSERT INTO accounts (id, code, name, type, sub_type, category, normal_balance, is_active, is_system, sort_order, balance, starting_amount)
VALUES
  -- ── Assets: Current ────────────────────────────────────────────────────────
  ('coa-1000','1000','Cash on Hand',                               'asset','Current Assets','Assets','debit',  true, false, 100,  0, 0),
  ('coa-1010','1010','Cash in Bank - BDO',                         'asset','Current Assets','Assets','debit',  true, false, 110,  0, 0),
  ('coa-1020','1020','Cash in Bank - BPI',                         'asset','Current Assets','Assets','debit',  true, false, 120,  0, 0),
  ('coa-1030','1030','Petty Cash Fund',                            'asset','Current Assets','Assets','debit',  true, false, 130,  0, 0),
  ('coa-1100','1100','Accounts Receivable - Trade',                'asset','Current Assets','Assets','debit',  true, false, 200,  0, 0),
  ('coa-1110','1110','Allowance for Doubtful Accounts',            'asset','Current Assets','Assets','credit', true, false, 210,  0, 0),
  ('coa-1120','1120','Advances to Clients',                        'asset','Current Assets','Assets','debit',  true, false, 220,  0, 0),
  ('coa-1130','1130','Advances to Suppliers',                      'asset','Current Assets','Assets','debit',  true, false, 230,  0, 0),
  ('sys-adv-recv-001','1150','Employee Cash Advances Receivable',  'asset','Current Assets','Assets','debit',  true, true,  115,  0, 0),
  ('coa-1160','1160','Input VAT',                                  'asset','Current Assets','Assets','debit',  true, false, 260,  0, 0),
  ('coa-1170','1170','Prepaid Expenses',                           'asset','Current Assets','Assets','debit',  true, false, 270,  0, 0),
  ('coa-1180','1180','Other Current Assets',                       'asset','Current Assets','Assets','debit',  true, false, 280,  0, 0),
  -- ── Assets: Non-Current ────────────────────────────────────────────────────
  ('coa-1500','1500','Office Equipment',                                          'asset','Non-Current Assets','Assets','debit',  true, false, 500,  0, 0),
  ('coa-1510','1510','Accumulated Depreciation - Office Equipment',               'asset','Non-Current Assets','Assets','credit', true, false, 510,  0, 0),
  ('coa-1520','1520','Furniture & Fixtures',                                      'asset','Non-Current Assets','Assets','debit',  true, false, 520,  0, 0),
  ('coa-1530','1530','Accumulated Depreciation - Furniture & Fixtures',           'asset','Non-Current Assets','Assets','credit', true, false, 530,  0, 0),
  ('coa-1540','1540','Transportation Equipment',                                  'asset','Non-Current Assets','Assets','debit',  true, false, 540,  0, 0),
  ('coa-1550','1550','Accumulated Depreciation - Transportation Equipment',       'asset','Non-Current Assets','Assets','credit', true, false, 550,  0, 0),
  ('coa-1600','1600','Security Deposits',                                         'asset','Non-Current Assets','Assets','debit',  true, false, 600,  0, 0),
  ('coa-1610','1610','Other Non-Current Assets',                                  'asset','Non-Current Assets','Assets','debit',  true, false, 610,  0, 0),
  -- ── Liabilities: Current ───────────────────────────────────────────────────
  ('coa-2000','2000','Accounts Payable - Trade',             'liability','Current Liabilities','Liabilities','credit', true, false, 1000, 0, 0),
  ('coa-2010','2010','Accounts Payable - Shipping Lines',    'liability','Current Liabilities','Liabilities','credit', true, false, 1010, 0, 0),
  ('coa-2020','2020','Accounts Payable - Truckers',          'liability','Current Liabilities','Liabilities','credit', true, false, 1020, 0, 0),
  ('coa-2030','2030','Accounts Payable - Customs Brokers',   'liability','Current Liabilities','Liabilities','credit', true, false, 1030, 0, 0),
  ('coa-2040','2040','Accrued Expenses',                     'liability','Current Liabilities','Liabilities','credit', true, false, 1040, 0, 0),
  ('coa-2050','2050','Withholding Tax Payable',              'liability','Current Liabilities','Liabilities','credit', true, false, 1050, 0, 0),
  ('coa-2060','2060','Output VAT Payable',                   'liability','Current Liabilities','Liabilities','credit', true, false, 1060, 0, 0),
  ('coa-2070','2070','SSS Contributions Payable',            'liability','Current Liabilities','Liabilities','credit', true, false, 1070, 0, 0),
  ('coa-2080','2080','PhilHealth Contributions Payable',     'liability','Current Liabilities','Liabilities','credit', true, false, 1080, 0, 0),
  ('coa-2090','2090','Pag-IBIG Contributions Payable',       'liability','Current Liabilities','Liabilities','credit', true, false, 1090, 0, 0),
  ('coa-2100','2100','Income Tax Payable',                   'liability','Current Liabilities','Liabilities','credit', true, false, 1100, 0, 0),
  ('coa-2110','2110','Customer Advances & Deposits',         'liability','Current Liabilities','Liabilities','credit', true, false, 1110, 0, 0),
  ('coa-2120','2120','Other Current Liabilities',            'liability','Current Liabilities','Liabilities','credit', true, false, 1120, 0, 0),
  -- ── Liabilities: Non-Current ───────────────────────────────────────────────
  ('coa-2500','2500','Loans Payable - Long Term',      'liability','Non-Current Liabilities','Liabilities','credit', true, false, 1500, 0, 0),
  ('coa-2510','2510','Other Non-Current Liabilities',  'liability','Non-Current Liabilities','Liabilities','credit', true, false, 1510, 0, 0),
  -- ── Equity ─────────────────────────────────────────────────────────────────
  ('coa-3000','3000','Owner''s Capital',        'equity','Equity','Equity','credit', true, false, 2000, 0, 0),
  ('coa-3100','3100','Retained Earnings',       'equity','Equity','Equity','credit', true, false, 2010, 0, 0),
  ('coa-3200','3200','Current Year Earnings',   'equity','Equity','Equity','credit', true, true,  2020, 0, 0),
  ('coa-3300','3300','Owner''s Drawings',       'equity','Equity','Equity','debit',  true, false, 2030, 0, 0),
  -- ── Revenue: Service ───────────────────────────────────────────────────────
  ('coa-4000','4000','Freight Forwarding Revenue', 'revenue','Service Revenue','Income Statement','credit', true, false, 3000, 0, 0),
  ('coa-4010','4010','Brokerage Revenue',           'revenue','Service Revenue','Income Statement','credit', true, false, 3010, 0, 0),
  ('coa-4020','4020','Trucking Revenue',             'revenue','Service Revenue','Income Statement','credit', true, false, 3020, 0, 0),
  ('coa-4030','4030','Marine Insurance Revenue',    'revenue','Service Revenue','Income Statement','credit', true, false, 3030, 0, 0),
  ('coa-4040','4040','Other Service Revenue',       'revenue','Service Revenue','Income Statement','credit', true, false, 3040, 0, 0),
  ('coa-4050','4050','Documentation Fees',          'revenue','Service Revenue','Income Statement','credit', true, false, 3050, 0, 0),
  ('coa-4060','4060','Port Handling Fees',          'revenue','Service Revenue','Income Statement','credit', true, false, 3060, 0, 0),
  ('coa-4070','4070','Warehousing Revenue',         'revenue','Service Revenue','Income Statement','credit', true, false, 3070, 0, 0),
  -- ── Revenue: Other Income ──────────────────────────────────────────────────
  ('coa-4500','4500','Interest Income',         'revenue','Other Income','Income Statement','credit', true, false, 3500, 0, 0),
  ('coa-4510','4510','Foreign Exchange Gain',   'revenue','Other Income','Income Statement','credit', true, false, 3510, 0, 0),
  ('coa-4520','4520','Miscellaneous Income',    'revenue','Other Income','Income Statement','credit', true, false, 3520, 0, 0),
  -- ── Expense: Cost of Services ──────────────────────────────────────────────
  ('coa-5000','5000','Ocean Freight Costs',               'expense','Cost of Services','Income Statement','debit', true, false, 4000, 0, 0),
  ('coa-5010','5010','Air Freight Costs',                 'expense','Cost of Services','Income Statement','debit', true, false, 4010, 0, 0),
  ('coa-5020','5020','Trucking Costs - Third Party',      'expense','Cost of Services','Income Statement','debit', true, false, 4020, 0, 0),
  ('coa-5030','5030','Customs Duties & Taxes Disbursed',  'expense','Cost of Services','Income Statement','debit', true, false, 4030, 0, 0),
  ('coa-5040','5040','Port Handling Charges',             'expense','Cost of Services','Income Statement','debit', true, false, 4040, 0, 0),
  ('coa-5050','5050','Documentation Charges',             'expense','Cost of Services','Income Statement','debit', true, false, 4050, 0, 0),
  ('coa-5060','5060','Warehousing Costs',                 'expense','Cost of Services','Income Statement','debit', true, false, 4060, 0, 0),
  ('coa-5070','5070','Marine Insurance Premium - Cost',   'expense','Cost of Services','Income Statement','debit', true, false, 4070, 0, 0),
  ('coa-5080','5080','Other Direct Costs',                'expense','Cost of Services','Income Statement','debit', true, false, 4080, 0, 0),
  -- ── Expense: Selling ───────────────────────────────────────────────────────
  ('coa-6000','6000','Salaries - Sales & Business Development', 'expense','Selling Expenses','Income Statement','debit', true, false, 5000, 0, 0),
  ('coa-6010','6010','Commission Expense',                       'expense','Selling Expenses','Income Statement','debit', true, false, 5010, 0, 0),
  ('coa-6020','6020','Representation & Entertainment',           'expense','Selling Expenses','Income Statement','debit', true, false, 5020, 0, 0),
  ('coa-6030','6030','Advertising & Promotions',                 'expense','Selling Expenses','Income Statement','debit', true, false, 5030, 0, 0),
  ('coa-6040','6040','Travel & Transportation - Sales',          'expense','Selling Expenses','Income Statement','debit', true, false, 5040, 0, 0),
  -- ── Expense: General & Administrative ──────────────────────────────────────
  ('coa-6500','6500','Salaries - General & Administrative',    'expense','General & Administrative','Income Statement','debit', true, false, 5500, 0, 0),
  ('coa-6510','6510','Salaries - Operations',                  'expense','General & Administrative','Income Statement','debit', true, false, 5510, 0, 0),
  ('coa-6520','6520','SSS Contribution - Employer Share',      'expense','General & Administrative','Income Statement','debit', true, false, 5520, 0, 0),
  ('coa-6530','6530','PhilHealth Contribution - Employer Share','expense','General & Administrative','Income Statement','debit', true, false, 5530, 0, 0),
  ('coa-6540','6540','Pag-IBIG Contribution - Employer Share', 'expense','General & Administrative','Income Statement','debit', true, false, 5540, 0, 0),
  ('coa-6550','6550','13th Month Pay Expense',                 'expense','General & Administrative','Income Statement','debit', true, false, 5550, 0, 0),
  ('coa-6560','6560','Office Rent',                            'expense','General & Administrative','Income Statement','debit', true, false, 5560, 0, 0),
  ('coa-6570','6570','Utilities Expense',                      'expense','General & Administrative','Income Statement','debit', true, false, 5570, 0, 0),
  ('coa-6580','6580','Office Supplies Expense',                'expense','General & Administrative','Income Statement','debit', true, false, 5580, 0, 0),
  ('coa-6590','6590','Repairs & Maintenance',                  'expense','General & Administrative','Income Statement','debit', true, false, 5590, 0, 0),
  ('coa-6600','6600','Depreciation Expense',                   'expense','General & Administrative','Income Statement','debit', true, false, 5600, 0, 0),
  ('coa-6610','6610','Communications Expense',                 'expense','General & Administrative','Income Statement','debit', true, false, 5610, 0, 0),
  ('coa-6620','6620','Professional Fees',                      'expense','General & Administrative','Income Statement','debit', true, false, 5620, 0, 0),
  ('coa-6630','6630','Bank Charges',                           'expense','General & Administrative','Income Statement','debit', true, false, 5630, 0, 0),
  ('coa-6640','6640','Business Permits & Licenses',            'expense','General & Administrative','Income Statement','debit', true, false, 5640, 0, 0),
  ('coa-6650','6650','Insurance Expense',                      'expense','General & Administrative','Income Statement','debit', true, false, 5650, 0, 0),
  ('coa-6660','6660','Miscellaneous Expense',                  'expense','General & Administrative','Income Statement','debit', true, false, 5660, 0, 0),
  -- ── Expense: Other ─────────────────────────────────────────────────────────
  ('coa-7000','7000','Interest Expense',          'expense','Other Expenses','Income Statement','debit', true, false, 6000, 0, 0),
  ('coa-7010','7010','Foreign Exchange Loss',     'expense','Other Expenses','Income Statement','debit', true, false, 6010, 0, 0),
  ('coa-7020','7020','Loss on Disposal of Assets','expense','Other Expenses','Income Statement','debit', true, false, 6020, 0, 0),
  -- ── Income Tax ─────────────────────────────────────────────────────────────
  ('coa-8000','8000','Income Tax Expense', 'expense','Income Tax','Income Statement','debit', true, false, 7000, 0, 0)
ON CONFLICT (id) DO NOTHING;
