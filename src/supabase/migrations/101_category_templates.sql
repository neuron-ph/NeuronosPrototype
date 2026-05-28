-- Category Line Item Templates
-- Company-wide reusable templates: a saved set of line items for a single category.
-- Templates store catalog references only (no prices/quantities).

CREATE TABLE category_templates (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  description         TEXT,
  category_name       TEXT NOT NULL,
  catalog_category_id TEXT,
  items               JSONB NOT NULL DEFAULT '[]',
  created_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by_name     TEXT,
  updated_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

SELECT add_updated_at_trigger('category_templates');

CREATE INDEX idx_category_templates_created ON category_templates(created_at DESC);
CREATE INDEX idx_category_templates_name ON category_templates(name);
CREATE INDEX idx_category_templates_category ON category_templates(category_name);

ALTER TABLE category_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "category_templates_select"
  ON category_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "category_templates_insert"
  ON category_templates FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "category_templates_update"
  ON category_templates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "category_templates_delete"
  ON category_templates FOR DELETE TO authenticated USING (true);
