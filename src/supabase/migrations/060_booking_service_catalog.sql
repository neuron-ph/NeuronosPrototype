-- 060_booking_service_catalog.sql
-- Profiling module Phase 4: booking service and sub-service catalog tables
-- Separate from accounting/pricing catalog_items — booking-specific service labels only

CREATE TABLE IF NOT EXISTS booking_service_catalog (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  service_type text NOT NULL,
  name         text NOT NULL,
  sort_order   integer NOT NULL DEFAULT 999,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_type, name)
);

CREATE INDEX IF NOT EXISTS bsc_service_type_idx ON booking_service_catalog(service_type);
CREATE INDEX IF NOT EXISTS bsc_is_active_idx ON booking_service_catalog(is_active);

CREATE TABLE IF NOT EXISTS booking_subservice_catalog (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  service_type text NOT NULL,
  name         text NOT NULL,
  sort_order   integer NOT NULL DEFAULT 999,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_type, name)
);

CREATE INDEX IF NOT EXISTS bssc_service_type_idx ON booking_subservice_catalog(service_type);
CREATE INDEX IF NOT EXISTS bssc_is_active_idx ON booking_subservice_catalog(is_active);

-- Seeds (mirrored from static bookingFieldOptions.ts)
INSERT INTO booking_service_catalog (service_type, name, sort_order) VALUES
  ('Brokerage','Customs Brokerage',1),('Brokerage','Import Brokerage',2),
  ('Brokerage','Export Brokerage',3),('Brokerage','All-Inclusive Brokerage',4),
  ('Brokerage','Documentation',5),('Brokerage','Permit Processing',6),
  ('Forwarding','Freight Forwarding',1),('Forwarding','Import Forwarding',2),
  ('Forwarding','Export Forwarding',3),('Forwarding','FCL Forwarding',4),
  ('Forwarding','LCL Forwarding',5),('Forwarding','Air Freight Forwarding',6),
  ('Forwarding','Door-to-Door Forwarding',7),
  ('Trucking','Container Trucking',1),('Trucking','Loose Cargo Trucking',2),
  ('Trucking','Pull-out',3),('Trucking','Delivery',4),
  ('Trucking','Empty Return',5),('Trucking','Domestic Trucking',6),
  ('Marine Insurance','Marine Cargo Insurance',1),('Marine Insurance','Policy Issuance',2),
  ('Marine Insurance','Certificate Issuance',3),('Marine Insurance','Claims Assistance',4),
  ('Others','Other Services',1),('Others','Documentation',2),
  ('Others','Permit Processing',3),('Others','Warehousing',4),('Others','Special Handling',5)
ON CONFLICT (service_type, name) DO NOTHING;

INSERT INTO booking_subservice_catalog (service_type, name, sort_order) VALUES
  ('Brokerage','Customs Clearance',1),('Brokerage','Duties and Taxes Processing',2),
  ('Brokerage','Examination Coordination',3),('Brokerage','Permit Coordination',4),
  ('Brokerage','Delivery Coordination',5),('Brokerage','PEZA Processing',6),
  ('Forwarding','Origin Handling',1),('Forwarding','Destination Handling',2),
  ('Forwarding','Consolidation',3),('Forwarding','Pickup',4),
  ('Forwarding','Delivery',5),('Forwarding','Documentation',6)
ON CONFLICT (service_type, name) DO NOTHING;
