-- 058_profiling_core.sql
-- Profiling module Phase 1: trade parties, locations, countries, service_provider tags, seeds

-- 1. booking_profile_tags on service_providers
ALTER TABLE service_providers
  ADD COLUMN IF NOT EXISTS booking_profile_tags text[] NOT NULL DEFAULT '{}';

-- 2. trade_parties
CREATE TABLE IF NOT EXISTS trade_parties (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name           text NOT NULL,
  role_scope     text NOT NULL CHECK (role_scope IN ('consignee', 'shipper', 'both')),
  customer_id    text REFERENCES customers(id) ON DELETE SET NULL,
  address        text,
  tin            text,
  contact_person text,
  contact_number text,
  aliases        text[] NOT NULL DEFAULT '{}',
  is_active      boolean NOT NULL DEFAULT true,
  created_by     text REFERENCES users(id) ON DELETE SET NULL,
  updated_by     text REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trade_parties_name_idx ON trade_parties USING gin(to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS trade_parties_role_scope_idx ON trade_parties(role_scope);
CREATE INDEX IF NOT EXISTS trade_parties_is_active_idx ON trade_parties(is_active);
CREATE INDEX IF NOT EXISTS trade_parties_customer_id_idx ON trade_parties(customer_id);

-- 3. profile_locations
CREATE TABLE IF NOT EXISTS profile_locations (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  kind            text NOT NULL CHECK (kind IN ('port', 'warehouse')),
  name            text NOT NULL,
  code            text,
  country_id      text,
  transport_modes text[] NOT NULL DEFAULT '{}',
  aliases         text[] NOT NULL DEFAULT '{}',
  is_active       boolean NOT NULL DEFAULT true,
  created_by      text REFERENCES users(id) ON DELETE SET NULL,
  updated_by      text REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_locations_kind_idx ON profile_locations(kind);
CREATE INDEX IF NOT EXISTS profile_locations_name_idx ON profile_locations USING gin(to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS profile_locations_is_active_idx ON profile_locations(is_active);

-- 4. profile_countries
CREATE TABLE IF NOT EXISTS profile_countries (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  iso_code   text NOT NULL UNIQUE,
  name       text NOT NULL,
  aliases    text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 999,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_countries_iso_code_idx ON profile_countries(iso_code);
CREATE INDEX IF NOT EXISTS profile_countries_name_idx ON profile_countries USING gin(to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS profile_countries_sort_order_idx ON profile_countries(sort_order);

-- 5. Backfill consignees -> trade_parties
INSERT INTO trade_parties (id, name, role_scope, customer_id, address, tin, contact_person, created_at, updated_at)
SELECT id, name, 'consignee', customer_id, address, tin, contact_person, created_at, updated_at
FROM consignees
ON CONFLICT (id) DO NOTHING;

-- 6. Seed countries (sort_order 1-20 = top PH freight trading partners)
INSERT INTO profile_countries (iso_code, name, sort_order) VALUES
  ('PH','Philippines',1),('CN','China',2),('US','United States',3),('JP','Japan',4),
  ('KR','South Korea',5),('SG','Singapore',6),('DE','Germany',7),('GB','United Kingdom',8),
  ('AU','Australia',9),('MY','Malaysia',10),('TH','Thailand',11),('VN','Vietnam',12),
  ('ID','Indonesia',13),('TW','Taiwan',14),('HK','Hong Kong',15),('NL','Netherlands',16),
  ('BE','Belgium',17),('FR','France',18),('IT','Italy',19),('CA','Canada',20),
  ('AF','Afghanistan',999),('AL','Albania',999),('DZ','Algeria',999),('AO','Angola',999),
  ('AR','Argentina',999),('AT','Austria',999),('AZ','Azerbaijan',999),('BH','Bahrain',999),
  ('BD','Bangladesh',999),('BY','Belarus',999),('BZ','Belize',999),('BJ','Benin',999),
  ('BO','Bolivia',999),('BA','Bosnia and Herzegovina',999),('BW','Botswana',999),
  ('BR','Brazil',999),('BN','Brunei',999),('BG','Bulgaria',999),('BF','Burkina Faso',999),
  ('BI','Burundi',999),('KH','Cambodia',999),('CM','Cameroon',999),('CV','Cape Verde',999),
  ('CF','Central African Republic',999),('TD','Chad',999),('CL','Chile',999),
  ('CO','Colombia',999),('CG','Republic of Congo',999),('CD','DR Congo',999),
  ('CR','Costa Rica',999),('CI','Ivory Coast',999),('HR','Croatia',999),('CU','Cuba',999),
  ('CY','Cyprus',999),('CZ','Czech Republic',999),('DK','Denmark',999),('DJ','Djibouti',999),
  ('DO','Dominican Republic',999),('EC','Ecuador',999),('EG','Egypt',999),
  ('SV','El Salvador',999),('GQ','Equatorial Guinea',999),('ER','Eritrea',999),
  ('EE','Estonia',999),('ET','Ethiopia',999),('FI','Finland',999),('GA','Gabon',999),
  ('GM','Gambia',999),('GE','Georgia',999),('GH','Ghana',999),('GR','Greece',999),
  ('GT','Guatemala',999),('GN','Guinea',999),('GW','Guinea-Bissau',999),('GY','Guyana',999),
  ('HT','Haiti',999),('HN','Honduras',999),('HU','Hungary',999),('IS','Iceland',999),
  ('IN','India',999),('IR','Iran',999),('IQ','Iraq',999),('IE','Ireland',999),
  ('IL','Israel',999),('JM','Jamaica',999),('JO','Jordan',999),('KZ','Kazakhstan',999),
  ('KE','Kenya',999),('KW','Kuwait',999),('KG','Kyrgyzstan',999),('LA','Laos',999),
  ('LV','Latvia',999),('LB','Lebanon',999),('LR','Liberia',999),('LY','Libya',999),
  ('LT','Lithuania',999),('LU','Luxembourg',999),('MO','Macau',999),('MG','Madagascar',999),
  ('MW','Malawi',999),('MV','Maldives',999),('ML','Mali',999),('MT','Malta',999),
  ('MR','Mauritania',999),('MU','Mauritius',999),('MX','Mexico',999),('MD','Moldova',999),
  ('MN','Mongolia',999),('MA','Morocco',999),('MZ','Mozambique',999),('MM','Myanmar',999),
  ('NA','Namibia',999),('NP','Nepal',999),('NZ','New Zealand',999),('NI','Nicaragua',999),
  ('NE','Niger',999),('NG','Nigeria',999),('MK','North Macedonia',999),('NO','Norway',999),
  ('OM','Oman',999),('PK','Pakistan',999),('PA','Panama',999),('PG','Papua New Guinea',999),
  ('PY','Paraguay',999),('PE','Peru',999),('PL','Poland',999),('PT','Portugal',999),
  ('QA','Qatar',999),('RO','Romania',999),('RU','Russia',999),('RW','Rwanda',999),
  ('SA','Saudi Arabia',999),('SN','Senegal',999),('RS','Serbia',999),('SL','Sierra Leone',999),
  ('SK','Slovakia',999),('SI','Slovenia',999),('SO','Somalia',999),('ZA','South Africa',999),
  ('SS','South Sudan',999),('ES','Spain',999),('LK','Sri Lanka',999),('SD','Sudan',999),
  ('SR','Suriname',999),('SE','Sweden',999),('CH','Switzerland',999),('SY','Syria',999),
  ('TJ','Tajikistan',999),('TZ','Tanzania',999),('TL','Timor-Leste',999),('TG','Togo',999),
  ('TT','Trinidad and Tobago',999),('TN','Tunisia',999),('TR','Turkey',999),
  ('TM','Turkmenistan',999),('UG','Uganda',999),('UA','Ukraine',999),
  ('AE','United Arab Emirates',999),('UY','Uruguay',999),('UZ','Uzbekistan',999),
  ('VE','Venezuela',999),('YE','Yemen',999),('ZM','Zambia',999),('ZW','Zimbabwe',999)
ON CONFLICT (iso_code) DO NOTHING;

-- 7. Seed ports and airports
INSERT INTO profile_locations (kind, name, code, transport_modes) VALUES
  ('port','Manila International Container Terminal','PHMNL',ARRAY['sea']),
  ('port','Manila South Harbor','PHMNL',ARRAY['sea']),
  ('port','Batangas Port','PHBAT',ARRAY['sea']),
  ('port','Cebu Port','PHCEB',ARRAY['sea']),
  ('port','Davao Port','PHDVO',ARRAY['sea']),
  ('port','Subic Bay Port','PHSFS',ARRAY['sea']),
  ('port','Cagayan de Oro Port','PHCGY',ARRAY['sea']),
  ('port','Iloilo Port','PHILO',ARRAY['sea']),
  ('port','Zamboanga Port','PHZAM',ARRAY['sea']),
  ('port','General Santos Port','PHGEN',ARRAY['sea']),
  ('port','Tacloban Port','PHTAC',ARRAY['sea']),
  ('port','Navotas Fish Port','PHNAV',ARRAY['sea']),
  ('port','Ninoy Aquino International Airport','IATA:MNL',ARRAY['air']),
  ('port','Mactan-Cebu International Airport','IATA:CEB',ARRAY['air']),
  ('port','Francisco Bangoy International Airport (Davao)','IATA:DVO',ARRAY['air']),
  ('port','Clark International Airport','IATA:CRK',ARRAY['air']),
  ('port','Port of Singapore','SGSIN',ARRAY['sea']),
  ('port','Port of Shanghai','CNSHA',ARRAY['sea']),
  ('port','Port of Shenzhen (Yantian)','CNSZX',ARRAY['sea']),
  ('port','Port of Guangzhou (Nansha)','CNGZH',ARRAY['sea']),
  ('port','Port of Tianjin','CNTXG',ARRAY['sea']),
  ('port','Port of Qingdao','CNTAO',ARRAY['sea']),
  ('port','Port of Ningbo','CNNBO',ARRAY['sea']),
  ('port','Port of Xiamen','CNXMN',ARRAY['sea']),
  ('port','Port of Hong Kong','HKHKG',ARRAY['sea']),
  ('port','Port of Busan','KRPUS',ARRAY['sea']),
  ('port','Port of Tokyo','JPTYO',ARRAY['sea']),
  ('port','Port of Yokohama','JPYOK',ARRAY['sea']),
  ('port','Port of Nagoya','JPNGO',ARRAY['sea']),
  ('port','Port of Osaka','JPOSA',ARRAY['sea']),
  ('port','Port of Kobe','JPUKB',ARRAY['sea']),
  ('port','Port Klang','MYPKG',ARRAY['sea']),
  ('port','Port of Tanjung Pelepas','MYTPP',ARRAY['sea']),
  ('port','Port of Jakarta (Tanjung Priok)','IDJKT',ARRAY['sea']),
  ('port','Port of Ho Chi Minh City (Cat Lai)','VNSGN',ARRAY['sea']),
  ('port','Port of Kaohsiung','TWKHH',ARRAY['sea']),
  ('port','Port of Laem Chabang','THLCH',ARRAY['sea']),
  ('port','Port of Dubai (Jebel Ali)','AEJEA',ARRAY['sea']),
  ('port','Port of Abu Dhabi (Khalifa)','AEAUH',ARRAY['sea']),
  ('port','Port of Rotterdam','NLRTM',ARRAY['sea']),
  ('port','Port of Antwerp','BEANR',ARRAY['sea']),
  ('port','Port of Hamburg','DEHAM',ARRAY['sea']),
  ('port','Port of Felixstowe','GBFXT',ARRAY['sea']),
  ('port','Port of Barcelona','ESBCN',ARRAY['sea']),
  ('port','Port of Los Angeles','USLAX',ARRAY['sea']),
  ('port','Port of Long Beach','USLGB',ARRAY['sea']),
  ('port','Port of New York / New Jersey','USNYC',ARRAY['sea']),
  ('port','Port of Seattle','USSEA',ARRAY['sea']),
  ('port','Port of Vancouver','CAVAN',ARRAY['sea']),
  ('port','Singapore Changi Airport','IATA:SIN',ARRAY['air']),
  ('port','Hong Kong International Airport','IATA:HKG',ARRAY['air']),
  ('port','Shanghai Pudong International Airport','IATA:PVG',ARRAY['air']),
  ('port','Incheon International Airport','IATA:ICN',ARRAY['air']),
  ('port','Narita International Airport','IATA:NRT',ARRAY['air']),
  ('port','Dubai International Airport','IATA:DXB',ARRAY['air']),
  ('port','Los Angeles International Airport','IATA:LAX',ARRAY['air']),
  ('port','JFK International Airport','IATA:JFK',ARRAY['air'])
ON CONFLICT DO NOTHING;
