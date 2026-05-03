-- Customer & Contact attachments — same shape as project_attachments / contract_attachments

CREATE TABLE IF NOT EXISTS customer_attachments (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  file_url TEXT NOT NULL,
  uploaded_by TEXT,
  uploaded_by_name TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_attachments_customer_id_idx ON customer_attachments(customer_id);
CREATE INDEX IF NOT EXISTS customer_attachments_created_at_idx ON customer_attachments(created_at);

ALTER TABLE customer_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_attachments_all" ON customer_attachments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS contact_attachments (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  file_url TEXT NOT NULL,
  uploaded_by TEXT,
  uploaded_by_name TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_attachments_contact_id_idx ON contact_attachments(contact_id);
CREATE INDEX IF NOT EXISTS contact_attachments_created_at_idx ON contact_attachments(created_at);

ALTER TABLE contact_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contact_attachments_all" ON contact_attachments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- Ensure storage bucket exists for attachments (matches CommentsTab + EntityAttachmentsTab)
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated read/write on attachments bucket
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='attachments_authenticated_all') THEN
    CREATE POLICY "attachments_authenticated_all" ON storage.objects
      FOR ALL TO authenticated
      USING (bucket_id = 'attachments')
      WITH CHECK (bucket_id = 'attachments');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='attachments_public_read') THEN
    CREATE POLICY "attachments_public_read" ON storage.objects
      FOR SELECT TO anon
      USING (bucket_id = 'attachments');
  END IF;
END $$;
