-- 090_quotation_number_autofill.sql
-- Guarantee every quotation row has a human-readable quotation_number.
-- Frontend may pass one in; if NULL/empty, this trigger fills it before insert.
-- Format: {QUO|CQ}{YYMMDD}{4-digit sequence-ish suffix from id or random}.

CREATE OR REPLACE FUNCTION public.set_quotation_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  prefix text;
  suffix text;
BEGIN
  IF NEW.quotation_number IS NOT NULL AND NEW.quotation_number <> '' THEN
    RETURN NEW;
  END IF;

  prefix := CASE WHEN NEW.quotation_type = 'contract' THEN 'CQ' ELSE 'QUO' END;

  -- Prefer last 4 digits of the row id (text like 'QUO-1776898041392').
  -- Fall back to a random 4-digit pad if id has no digits.
  suffix := RIGHT(REGEXP_REPLACE(COALESCE(NEW.id, ''), '\D', '', 'g'), 4);
  IF suffix IS NULL OR suffix = '' THEN
    suffix := LPAD(floor(random() * 10000)::text, 4, '0');
  END IF;

  NEW.quotation_number :=
    prefix
    || to_char(COALESCE(NEW.created_at, now()), 'YYMMDD')
    || suffix;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_quotation_number ON public.quotations;
CREATE TRIGGER trg_set_quotation_number
BEFORE INSERT ON public.quotations
FOR EACH ROW
EXECUTE FUNCTION public.set_quotation_number();
