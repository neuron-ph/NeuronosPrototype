-- 091_evoucher_journal_human_numbers.sql
-- Replace EV-${Date.now()} and JE-{TYPE}-${Date.now()} pseudo-numbers with
-- clean per-year sequential format: EV-YYYY-NNNN and JE-YYYY-NNNN.
-- counters.value is jsonb, so casts are required.

CREATE OR REPLACE FUNCTION public.next_counter(p_key text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_value integer;
BEGIN
  INSERT INTO public.counters (key, value, updated_at)
  VALUES (p_key, to_jsonb(1), now())
  ON CONFLICT (key) DO UPDATE
    SET value = to_jsonb(((public.counters.value)::text)::int + 1),
        updated_at = now()
  RETURNING (value::text)::int INTO v_value;
  RETURN v_value;
END;
$$;

-- ── Backfill evoucher_number ─────────────────────────────────────────────
WITH numbered AS (
  SELECT id,
         EXTRACT(YEAR FROM created_at)::int AS yr,
         ROW_NUMBER() OVER (
           PARTITION BY EXTRACT(YEAR FROM created_at)
           ORDER BY created_at, id
         ) AS rn
  FROM public.evouchers
)
UPDATE public.evouchers e
SET evoucher_number = 'EV-' || n.yr || '-' || LPAD(n.rn::text, 4, '0')
FROM numbered n
WHERE e.id = n.id;

INSERT INTO public.counters (key, value, updated_at)
SELECT 'evoucher_counter_' || EXTRACT(YEAR FROM now())::int,
       to_jsonb(COALESCE(MAX(rn), 0)),
       now()
FROM (
  SELECT ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
  FROM public.evouchers
  WHERE EXTRACT(YEAR FROM created_at)::int = EXTRACT(YEAR FROM now())::int
) s
ON CONFLICT (key) DO UPDATE
  SET value = to_jsonb(GREATEST(((public.counters.value)::text)::int, ((EXCLUDED.value)::text)::int)),
      updated_at = now();

-- ── Backfill journal_entries.entry_number ────────────────────────────────
WITH numbered AS (
  SELECT id,
         EXTRACT(YEAR FROM COALESCE(entry_date, created_at, now()))::int AS yr,
         ROW_NUMBER() OVER (
           PARTITION BY EXTRACT(YEAR FROM COALESCE(entry_date, created_at, now()))
           ORDER BY COALESCE(entry_date, created_at), id
         ) AS rn
  FROM public.journal_entries
)
UPDATE public.journal_entries je
SET entry_number = 'JE-' || n.yr || '-' || LPAD(n.rn::text, 4, '0')
FROM numbered n
WHERE je.id = n.id;

INSERT INTO public.counters (key, value, updated_at)
SELECT 'journal_entry_counter_' || EXTRACT(YEAR FROM now())::int,
       to_jsonb(COALESCE(MAX(rn), 0)),
       now()
FROM (
  SELECT ROW_NUMBER() OVER (ORDER BY COALESCE(entry_date, created_at), id) AS rn
  FROM public.journal_entries
  WHERE EXTRACT(YEAR FROM COALESCE(entry_date, created_at, now()))::int = EXTRACT(YEAR FROM now())::int
) s
ON CONFLICT (key) DO UPDATE
  SET value = to_jsonb(GREATEST(((public.counters.value)::text)::int, ((EXCLUDED.value)::text)::int)),
      updated_at = now();

-- ── Trigger: evoucher_number autofill ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_evoucher_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_year int;
  v_seq  int;
  v_is_pseudo boolean;
BEGIN
  v_is_pseudo := NEW.evoucher_number ~ '^EV-([A-Z]+-)?[0-9]{10,}$';

  IF NEW.evoucher_number IS NULL OR NEW.evoucher_number = '' OR v_is_pseudo THEN
    v_year := EXTRACT(YEAR FROM COALESCE(NEW.created_at, now()))::int;
    v_seq  := public.next_counter('evoucher_counter_' || v_year);
    NEW.evoucher_number := 'EV-' || v_year || '-' || LPAD(v_seq::text, 4, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_evoucher_number ON public.evouchers;
CREATE TRIGGER trg_set_evoucher_number
BEFORE INSERT ON public.evouchers
FOR EACH ROW
EXECUTE FUNCTION public.set_evoucher_number();

-- ── Trigger: journal_entries.entry_number autofill ───────────────────────
CREATE OR REPLACE FUNCTION public.set_journal_entry_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_year int;
  v_seq  int;
  v_is_pseudo boolean;
BEGIN
  v_is_pseudo := NEW.entry_number ~ '^JE-[A-Z]+-[0-9]{10,}$' OR NEW.entry_number ~ '^JE-[0-9]{10,}$';

  IF NEW.entry_number IS NULL OR NEW.entry_number = '' OR v_is_pseudo THEN
    v_year := EXTRACT(YEAR FROM COALESCE(NEW.entry_date, NEW.created_at, now()))::int;
    v_seq  := public.next_counter('journal_entry_counter_' || v_year);
    NEW.entry_number := 'JE-' || v_year || '-' || LPAD(v_seq::text, 4, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_journal_entry_number ON public.journal_entries;
CREATE TRIGGER trg_set_journal_entry_number
BEFORE INSERT ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.set_journal_entry_number();
