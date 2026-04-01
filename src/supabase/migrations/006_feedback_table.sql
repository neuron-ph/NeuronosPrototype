-- Migration 006: Beta feedback table
-- Apply in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS feedback (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  user_name   text,
  user_email  text,
  type        text NOT NULL CHECK (type IN ('bug', 'feedback', 'feature')),
  title       text NOT NULL,
  description text NOT NULL,
  created_at  timestamptz DEFAULT now()
);
