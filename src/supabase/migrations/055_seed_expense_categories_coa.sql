-- Migration 055: Seed detailed expense categories from Chart of Accounts PDF
-- Two sections: Variable Expenses (6700–6809) and Fixed Expenses (6810–6890).
-- Parent accounts = category headers; children = selectable line items.
-- ON CONFLICT DO NOTHING makes this idempotent.

INSERT INTO accounts (id, code, name, type, sub_type, category, normal_balance, is_active, is_system, sort_order, balance, starting_amount, parent_id)
VALUES

-- ── VARIABLE EXPENSES ──────────────────────────────────────────────────────

-- Advertising/Marketing
('coa-6700','6700','Advertising/Marketing',                                          'expense','Variable Expenses','Income Statement','debit',true,false,6700,0,0,NULL),
('coa-6701','6701','Advertising/Marketing - Sponsorship',                            'expense','Variable Expenses','Income Statement','debit',true,false,6701,0,0,'coa-6700'),
('coa-6702','6702','Advertising/Marketing - Marketing Kits',                         'expense','Variable Expenses','Income Statement','debit',true,false,6702,0,0,'coa-6700'),
('coa-6703','6703','Advertising/Marketing - Foods',                                  'expense','Variable Expenses','Income Statement','debit',true,false,6703,0,0,'coa-6700'),
('coa-6704','6704','Advertising/Marketing - Airfare',                                'expense','Variable Expenses','Income Statement','debit',true,false,6704,0,0,'coa-6700'),
('coa-6705','6705','Advertising/Marketing - Land Fare',                              'expense','Variable Expenses','Income Statement','debit',true,false,6705,0,0,'coa-6700'),
('coa-6706','6706','Advertising/Marketing - Others',                                 'expense','Variable Expenses','Income Statement','debit',true,false,6706,0,0,'coa-6700'),

-- Travels & Entertainment
('coa-6710','6710','Travels & Entertainment',                                        'expense','Variable Expenses','Income Statement','debit',true,false,6710,0,0,NULL),
('coa-6711','6711','Travels & Entertainment - Airfare',                              'expense','Variable Expenses','Income Statement','debit',true,false,6711,0,0,'coa-6710'),
('coa-6712','6712','Travels & Entertainment - Land Fare',                            'expense','Variable Expenses','Income Statement','debit',true,false,6712,0,0,'coa-6710'),
('coa-6713','6713','Travels & Entertainment - Accommodation',                        'expense','Variable Expenses','Income Statement','debit',true,false,6713,0,0,'coa-6710'),
('coa-6714','6714','Travels & Entertainment - Foods',                                'expense','Variable Expenses','Income Statement','debit',true,false,6714,0,0,'coa-6710'),
('coa-6715','6715','Travels & Entertainment - Gifts/Token',                          'expense','Variable Expenses','Income Statement','debit',true,false,6715,0,0,'coa-6710'),
('coa-6716','6716','Travels & Entertainment - Others',                               'expense','Variable Expenses','Income Statement','debit',true,false,6716,0,0,'coa-6710'),

-- Training & Development
('coa-6720','6720','Training & Development',                                         'expense','Variable Expenses','Income Statement','debit',true,false,6720,0,0,NULL),
('coa-6721','6721','Training & Development - Professional Fee',                      'expense','Variable Expenses','Income Statement','debit',true,false,6721,0,0,'coa-6720'),
('coa-6722','6722','Training & Development - Venue',                                 'expense','Variable Expenses','Income Statement','debit',true,false,6722,0,0,'coa-6720'),
('coa-6723','6723','Training & Development - Foods',                                 'expense','Variable Expenses','Income Statement','debit',true,false,6723,0,0,'coa-6720'),
('coa-6724','6724','Training & Development - Land Fare',                             'expense','Variable Expenses','Income Statement','debit',true,false,6724,0,0,'coa-6720'),
('coa-6725','6725','Training & Development - Airfare',                               'expense','Variable Expenses','Income Statement','debit',true,false,6725,0,0,'coa-6720'),
('coa-6726','6726','Training & Development - Others',                                'expense','Variable Expenses','Income Statement','debit',true,false,6726,0,0,'coa-6720'),

-- Talent Acquisition & Recruitment
('coa-6730','6730','Talent Acquisition & Recruitment',                               'expense','Variable Expenses','Income Statement','debit',true,false,6730,0,0,NULL),
('coa-6731','6731','Talent Acquisition & Recruitment - Job Adds',                    'expense','Variable Expenses','Income Statement','debit',true,false,6731,0,0,'coa-6730'),
('coa-6732','6732','Talent Acquisition & Recruitment - Others',                      'expense','Variable Expenses','Income Statement','debit',true,false,6732,0,0,'coa-6730'),

-- Employee Engagement & Relations
('coa-6740','6740','Employee Engagement & Relations',                                'expense','Variable Expenses','Income Statement','debit',true,false,6740,0,0,NULL),
('coa-6741','6741','Employee Engagement & Relations - Bonuses',                      'expense','Variable Expenses','Income Statement','debit',true,false,6741,0,0,'coa-6740'),
('coa-6742','6742','Employee Engagement & Relations - Incentives/Rewards',           'expense','Variable Expenses','Income Statement','debit',true,false,6742,0,0,'coa-6740'),
('coa-6743','6743','Employee Engagement & Relations - Plaques/Medals/Certificate',   'expense','Variable Expenses','Income Statement','debit',true,false,6743,0,0,'coa-6740'),
('coa-6744','6744','Employee Engagement & Relations - Foods',                        'expense','Variable Expenses','Income Statement','debit',true,false,6744,0,0,'coa-6740'),
('coa-6745','6745','Employee Engagement & Relations - Others',                       'expense','Variable Expenses','Income Statement','debit',true,false,6745,0,0,'coa-6740'),

-- Health & Safety
('coa-6750','6750','Health & Safety',                                                'expense','Variable Expenses','Income Statement','debit',true,false,6750,0,0,NULL),
('coa-6751','6751','Health & Safety - Medicines',                                    'expense','Variable Expenses','Income Statement','debit',true,false,6751,0,0,'coa-6750'),
('coa-6752','6752','Health & Safety - Trainings & Seminars',                         'expense','Variable Expenses','Income Statement','debit',true,false,6752,0,0,'coa-6750'),
('coa-6753','6753','Health & Safety - Others',                                       'expense','Variable Expenses','Income Statement','debit',true,false,6753,0,0,'coa-6750'),

-- Corporate Social Responsibility
('coa-6760','6760','Corporate Social Responsibility',                                'expense','Variable Expenses','Income Statement','debit',true,false,6760,0,0,NULL),
('coa-6761','6761','Corporate Social Responsibility - Cash/Goods Donation',          'expense','Variable Expenses','Income Statement','debit',true,false,6761,0,0,'coa-6760'),
('coa-6762','6762','Corporate Social Responsibility - Foods',                        'expense','Variable Expenses','Income Statement','debit',true,false,6762,0,0,'coa-6760'),
('coa-6763','6763','Corporate Social Responsibility - Sponsorship',                  'expense','Variable Expenses','Income Statement','debit',true,false,6763,0,0,'coa-6760'),
('coa-6764','6764','Corporate Social Responsibility - Land Fare',                    'expense','Variable Expenses','Income Statement','debit',true,false,6764,0,0,'coa-6760'),
('coa-6765','6765','Corporate Social Responsibility - Others',                       'expense','Variable Expenses','Income Statement','debit',true,false,6765,0,0,'coa-6760'),

-- Trade Show & Conference Fees
('coa-6770','6770','Trade Show & Conference Fees',                                   'expense','Variable Expenses','Income Statement','debit',true,false,6770,0,0,NULL),
('coa-6771','6771','Trade Show & Conference Fees - Registration',                    'expense','Variable Expenses','Income Statement','debit',true,false,6771,0,0,'coa-6770'),
('coa-6772','6772','Trade Show & Conference Fees - Land Fare',                       'expense','Variable Expenses','Income Statement','debit',true,false,6772,0,0,'coa-6770'),
('coa-6773','6773','Trade Show & Conference Fees - Air Fare',                        'expense','Variable Expenses','Income Statement','debit',true,false,6773,0,0,'coa-6770'),
('coa-6774','6774','Trade Show & Conference Fees - Accommodation',                   'expense','Variable Expenses','Income Statement','debit',true,false,6774,0,0,'coa-6770'),
('coa-6775','6775','Trade Show & Conference Fees - Foods',                           'expense','Variable Expenses','Income Statement','debit',true,false,6775,0,0,'coa-6770'),
('coa-6776','6776','Trade Show & Conference Fees - Others',                          'expense','Variable Expenses','Income Statement','debit',true,false,6776,0,0,'coa-6770'),

-- Trucking Maintenance & Repairs
('coa-6780','6780','Trucking Maintenance & Repairs',                                 'expense','Variable Expenses','Income Statement','debit',true,false,6780,0,0,NULL),
('coa-6781','6781','Trucking Maintenance & Repairs - PMS',                           'expense','Variable Expenses','Income Statement','debit',true,false,6781,0,0,'coa-6780'),
('coa-6782','6782','Trucking Maintenance & Repairs - Parts & Equipment',             'expense','Variable Expenses','Income Statement','debit',true,false,6782,0,0,'coa-6780'),
('coa-6783','6783','Trucking Maintenance & Repairs - Vulcanizing',                   'expense','Variable Expenses','Income Statement','debit',true,false,6783,0,0,'coa-6780'),
('coa-6784','6784','Trucking Maintenance & Repairs - Minor Repairs',                 'expense','Variable Expenses','Income Statement','debit',true,false,6784,0,0,'coa-6780'),
('coa-6785','6785','Trucking Maintenance & Repairs - Others',                        'expense','Variable Expenses','Income Statement','debit',true,false,6785,0,0,'coa-6780'),

-- Office Maintenance
('coa-6790','6790','Office Maintenance',                                             'expense','Variable Expenses','Income Statement','debit',true,false,6790,0,0,NULL),
('coa-6791','6791','Office Maintenance - Cleaning Materials & Supplies',             'expense','Variable Expenses','Income Statement','debit',true,false,6791,0,0,'coa-6790'),
('coa-6792','6792','Office Maintenance - Repairs',                                   'expense','Variable Expenses','Income Statement','debit',true,false,6792,0,0,'coa-6790'),
('coa-6793','6793','Office Maintenance - Others',                                    'expense','Variable Expenses','Income Statement','debit',true,false,6793,0,0,'coa-6790'),

-- Employee Allowances
('coa-6800','6800','Employee Allowances',                                            'expense','Variable Expenses','Income Statement','debit',true,false,6800,0,0,NULL),
('coa-6801','6801','Employee Allowances - Meal Allowance',                           'expense','Variable Expenses','Income Statement','debit',true,false,6801,0,0,'coa-6800'),
('coa-6802','6802','Employee Allowances - Gas & Parking Allowance',                  'expense','Variable Expenses','Income Statement','debit',true,false,6802,0,0,'coa-6800'),
('coa-6803','6803','Employee Allowances - Motor Maintenance Allowance',              'expense','Variable Expenses','Income Statement','debit',true,false,6803,0,0,'coa-6800'),

-- ── FIXED EXPENSES ─────────────────────────────────────────────────────────

-- Compensation & Benefits
('coa-6810','6810','Compensation & Benefits',                                        'expense','Fixed Expenses','Income Statement','debit',true,false,6810,0,0,NULL),
('coa-6811','6811','Compensation & Benefits - Salaries & Wages',                     'expense','Fixed Expenses','Income Statement','debit',true,false,6811,0,0,'coa-6810'),
('coa-6812','6812','Compensation & Benefits - SSS',                                  'expense','Fixed Expenses','Income Statement','debit',true,false,6812,0,0,'coa-6810'),
('coa-6813','6813','Compensation & Benefits - Pag-Ibig',                             'expense','Fixed Expenses','Income Statement','debit',true,false,6813,0,0,'coa-6810'),
('coa-6814','6814','Compensation & Benefits - Philhealth',                           'expense','Fixed Expenses','Income Statement','debit',true,false,6814,0,0,'coa-6810'),
('coa-6815','6815','Compensation & Benefits - HMO',                                  'expense','Fixed Expenses','Income Statement','debit',true,false,6815,0,0,'coa-6810'),
('coa-6816','6816','Compensation & Benefits - 13th Month Pay',                       'expense','Fixed Expenses','Income Statement','debit',true,false,6816,0,0,'coa-6810'),
('coa-6817','6817','Compensation & Benefits - 14th Month Pay',                       'expense','Fixed Expenses','Income Statement','debit',true,false,6817,0,0,'coa-6810'),
('coa-6818','6818','Compensation & Benefits - Others',                               'expense','Fixed Expenses','Income Statement','debit',true,false,6818,0,0,'coa-6810'),

-- Rent/Lease
('coa-6820','6820','Rent/Lease',                                                     'expense','Fixed Expenses','Income Statement','debit',true,false,6820,0,0,NULL),
('coa-6821','6821','Rent/Lease - Office Rental',                                     'expense','Fixed Expenses','Income Statement','debit',true,false,6821,0,0,'coa-6820'),
('coa-6822','6822','Rent/Lease - Garage Rental',                                     'expense','Fixed Expenses','Income Statement','debit',true,false,6822,0,0,'coa-6820'),
('coa-6823','6823','Rent/Lease - Others',                                            'expense','Fixed Expenses','Income Statement','debit',true,false,6823,0,0,'coa-6820'),

-- Utilities
('coa-6830','6830','Utilities',                                                      'expense','Fixed Expenses','Income Statement','debit',true,false,6830,0,0,NULL),
('coa-6831','6831','Utilities - Internet',                                           'expense','Fixed Expenses','Income Statement','debit',true,false,6831,0,0,'coa-6830'),
('coa-6832','6832','Utilities - Electricity',                                        'expense','Fixed Expenses','Income Statement','debit',true,false,6832,0,0,'coa-6830'),
('coa-6833','6833','Utilities - Water',                                              'expense','Fixed Expenses','Income Statement','debit',true,false,6833,0,0,'coa-6830'),
('coa-6834','6834','Utilities - Parking',                                            'expense','Fixed Expenses','Income Statement','debit',true,false,6834,0,0,'coa-6830'),
('coa-6835','6835','Utilities - Others',                                             'expense','Fixed Expenses','Income Statement','debit',true,false,6835,0,0,'coa-6830'),

-- Insurance
('coa-6840','6840','Insurance',                                                      'expense','Fixed Expenses','Income Statement','debit',true,false,6840,0,0,NULL),
('coa-6841','6841','Insurance - Fire Insurance',                                     'expense','Fixed Expenses','Income Statement','debit',true,false,6841,0,0,'coa-6840'),
('coa-6842','6842','Insurance - Marine Insurance',                                   'expense','Fixed Expenses','Income Statement','debit',true,false,6842,0,0,'coa-6840'),
('coa-6843','6843','Insurance - Vehicle Insurance',                                  'expense','Fixed Expenses','Income Statement','debit',true,false,6843,0,0,'coa-6840'),
('coa-6844','6844','Insurance - Others',                                             'expense','Fixed Expenses','Income Statement','debit',true,false,6844,0,0,'coa-6840'),

-- Professional Fees
('coa-6850','6850','Professional Fees',                                              'expense','Fixed Expenses','Income Statement','debit',true,false,6850,0,0,NULL),
('coa-6851','6851','Professional Fees - Accountant Fee',                             'expense','Fixed Expenses','Income Statement','debit',true,false,6851,0,0,'coa-6850'),
('coa-6852','6852','Professional Fees - Legal Fee',                                  'expense','Fixed Expenses','Income Statement','debit',true,false,6852,0,0,'coa-6850'),
('coa-6853','6853','Professional Fees - Others',                                     'expense','Fixed Expenses','Income Statement','debit',true,false,6853,0,0,'coa-6850'),

-- Software/Technology Subscription
('coa-6860','6860','Software/Technology Subscription',                               'expense','Fixed Expenses','Income Statement','debit',true,false,6860,0,0,NULL),
('coa-6861','6861','Software/Technology Subscription - Quickbooks',                  'expense','Fixed Expenses','Income Statement','debit',true,false,6861,0,0,'coa-6860'),
('coa-6862','6862','Software/Technology Subscription - Google Workspace',            'expense','Fixed Expenses','Income Statement','debit',true,false,6862,0,0,'coa-6860'),
('coa-6863','6863','Software/Technology Subscription - Server Domain',               'expense','Fixed Expenses','Income Statement','debit',true,false,6863,0,0,'coa-6860'),
('coa-6864','6864','Software/Technology Subscription - Others',                      'expense','Fixed Expenses','Income Statement','debit',true,false,6864,0,0,'coa-6860'),

-- Permits & Licenses
('coa-6870','6870','Permits & Licenses',                                             'expense','Fixed Expenses','Income Statement','debit',true,false,6870,0,0,NULL),
('coa-6871','6871','Permits & Licenses - Business Permit',                           'expense','Fixed Expenses','Income Statement','debit',true,false,6871,0,0,'coa-6870'),
('coa-6872','6872','Permits & Licenses - Sanitary Permit',                           'expense','Fixed Expenses','Income Statement','debit',true,false,6872,0,0,'coa-6870'),
('coa-6873','6873','Permits & Licenses - Fire Certification w/ Fire Extinguisher',   'expense','Fixed Expenses','Income Statement','debit',true,false,6873,0,0,'coa-6870'),
('coa-6874','6874','Permits & Licenses - CAB Certification',                         'expense','Fixed Expenses','Income Statement','debit',true,false,6874,0,0,'coa-6870'),
('coa-6875','6875','Permits & Licenses - Others',                                    'expense','Fixed Expenses','Income Statement','debit',true,false,6875,0,0,'coa-6870'),

-- Office Improvements/Renovation
('coa-6880','6880','Office Improvements/Renovation',                                 'expense','Fixed Expenses','Income Statement','debit',true,false,6880,0,0,NULL),
('coa-6881','6881','Office Improvements/Renovation - Construction Materials',        'expense','Fixed Expenses','Income Statement','debit',true,false,6881,0,0,'coa-6880'),
('coa-6882','6882','Office Improvements/Renovation - Labor Fees',                    'expense','Fixed Expenses','Income Statement','debit',true,false,6882,0,0,'coa-6880'),
('coa-6883','6883','Office Improvements/Renovation - Appliances/Machines/Equipments','expense','Fixed Expenses','Income Statement','debit',true,false,6883,0,0,'coa-6880'),
('coa-6884','6884','Office Improvements/Renovation - Others',                        'expense','Fixed Expenses','Income Statement','debit',true,false,6884,0,0,'coa-6880'),

-- Other Fixed Expenses (catch-all)
('coa-6890','6890','Other Fixed Expenses',                                           'expense','Fixed Expenses','Income Statement','debit',true,false,6890,0,0,NULL)

ON CONFLICT DO NOTHING;
