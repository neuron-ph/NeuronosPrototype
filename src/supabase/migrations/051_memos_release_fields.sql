ALTER TABLE memos
  ADD COLUMN IF NOT EXISTS memo_type text NOT NULL DEFAULT 'announcement',
  ADD COLUMN IF NOT EXISTS module     text,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;
