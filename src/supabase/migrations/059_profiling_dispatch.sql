-- 059_profiling_dispatch.sql
-- Profiling module Phase 3: dispatch_people and vehicles tables

CREATE TABLE IF NOT EXISTS dispatch_people (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name           text NOT NULL,
  type           text NOT NULL CHECK (type IN ('driver', 'helper')),
  phone          text,
  license_number text,
  is_active      boolean NOT NULL DEFAULT true,
  created_by     text REFERENCES users(id) ON DELETE SET NULL,
  updated_by     text REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dispatch_people_type_idx ON dispatch_people(type);
CREATE INDEX IF NOT EXISTS dispatch_people_is_active_idx ON dispatch_people(is_active);
CREATE INDEX IF NOT EXISTS dispatch_people_name_idx ON dispatch_people USING gin(to_tsvector('simple', name));

CREATE TABLE IF NOT EXISTS vehicles (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  plate_number text NOT NULL,
  vehicle_type text,
  capacity     text,
  is_active    boolean NOT NULL DEFAULT true,
  created_by   text REFERENCES users(id) ON DELETE SET NULL,
  updated_by   text REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicles_is_active_idx ON vehicles(is_active);
CREATE INDEX IF NOT EXISTS vehicles_plate_number_idx ON vehicles(plate_number);
