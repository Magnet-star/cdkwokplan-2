
ALTER TABLE public.finance_requests ADD COLUMN IF NOT EXISTS serial_number text;

CREATE OR REPLACE FUNCTION public.finance_request_prefix(_dept_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  cleaned text;
  tok text;
  letters text := '';
BEGIN
  IF _dept_name IS NULL OR length(trim(_dept_name)) = 0 THEN
    RETURN 'GEN';
  END IF;
  cleaned := regexp_replace(upper(_dept_name), '[^A-Z& ]', ' ', 'g');
  cleaned := replace(cleaned, '&', ' ');
  FOREACH tok IN ARRAY regexp_split_to_array(cleaned, '\s+') LOOP
    IF tok IS NULL OR length(tok) = 0 THEN CONTINUE; END IF;
    IF tok IN ('AND','OF','THE','FOR','DEPARTMENT','OFFICE','APOSTOLATE') THEN CONTINUE; END IF;
    letters := letters || substr(tok, 1, 1);
  END LOOP;
  IF length(letters) = 0 THEN
    letters := substr(regexp_replace(upper(_dept_name), '[^A-Z]', '', 'g'), 1, 2);
  END IF;
  IF length(letters) = 0 THEN letters := 'GEN'; END IF;
  RETURN letters;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_finance_request_serial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix text;
  next_num int;
BEGIN
  IF NEW.serial_number IS NOT NULL AND length(NEW.serial_number) > 0 THEN
    RETURN NEW;
  END IF;
  prefix := public.finance_request_prefix(NEW.department_name);
  PERFORM pg_advisory_xact_lock(hashtext('fin_serial:' || prefix));
  SELECT COALESCE(MAX(CAST(substring(serial_number FROM '[0-9]+$') AS int)), 0) + 1
    INTO next_num
    FROM public.finance_requests
   WHERE serial_number LIKE prefix || '%';
  NEW.serial_number := prefix || lpad(next_num::text, 3, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_requests_serial_trg ON public.finance_requests;
CREATE TRIGGER finance_requests_serial_trg
  BEFORE INSERT ON public.finance_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_finance_request_serial();

-- Backfill existing rows
DO $$
DECLARE
  r record;
  prefix text;
  counters jsonb := '{}'::jsonb;
  n int;
BEGIN
  FOR r IN
    SELECT id, department_name
      FROM public.finance_requests
     WHERE serial_number IS NULL
     ORDER BY submitted_at ASC, created_at ASC
  LOOP
    prefix := public.finance_request_prefix(r.department_name);
    n := COALESCE((counters->>prefix)::int, 0) + 1;
    counters := jsonb_set(counters, ARRAY[prefix], to_jsonb(n));
    UPDATE public.finance_requests
       SET serial_number = prefix || lpad(n::text, 3, '0')
     WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS finance_requests_serial_number_key
  ON public.finance_requests (serial_number);
