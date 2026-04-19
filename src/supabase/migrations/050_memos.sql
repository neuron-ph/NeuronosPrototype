DROP TABLE IF EXISTS release_notes;
DROP TABLE IF EXISTS user_release_reads;

CREATE TABLE memos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text        NOT NULL,
  body         text        NOT NULL DEFAULT '',
  is_published boolean     NOT NULL DEFAULT false,
  created_by   text        REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
