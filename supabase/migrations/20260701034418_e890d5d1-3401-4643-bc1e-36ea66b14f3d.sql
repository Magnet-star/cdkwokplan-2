
-- 1) Move mpesa_phone into a companion table with tighter RLS so approver
--    roles no longer see raw payment numbers via SELECT * on finance_requests.

CREATE TABLE IF NOT EXISTS public.finance_request_mpesa (
  finance_request_id uuid PRIMARY KEY REFERENCES public.finance_requests(id) ON DELETE CASCADE,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_request_mpesa TO authenticated;
GRANT ALL ON public.finance_request_mpesa TO service_role;

ALTER TABLE public.finance_request_mpesa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Requester or accounts view mpesa" ON public.finance_request_mpesa;
CREATE POLICY "Requester or accounts view mpesa"
ON public.finance_request_mpesa FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.finance_requests fr
    WHERE fr.id = finance_request_id AND fr.requester_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'administrator'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

DROP POLICY IF EXISTS "Requester manage own mpesa" ON public.finance_request_mpesa;
CREATE POLICY "Requester manage own mpesa"
ON public.finance_request_mpesa FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.finance_requests fr
    WHERE fr.id = finance_request_id
      AND fr.requester_id = auth.uid()
      AND fr.status IN ('pending','adjustment_requested')
  )
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.finance_requests fr
    WHERE fr.id = finance_request_id
      AND fr.requester_id = auth.uid()
      AND fr.status IN ('pending','adjustment_requested')
  )
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE OR REPLACE TRIGGER trg_touch_finance_request_mpesa
BEFORE UPDATE ON public.finance_request_mpesa
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Backfill existing phone numbers, then drop the exposed column.
INSERT INTO public.finance_request_mpesa (finance_request_id, phone)
SELECT id, mpesa_phone FROM public.finance_requests WHERE mpesa_phone IS NOT NULL
ON CONFLICT (finance_request_id) DO NOTHING;

-- Update the requester-guard trigger to stop referencing the dropped column.
CREATE OR REPLACE FUNCTION public.guard_finance_requests_requester_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF has_role(uid, 'super_admin'::app_role)
     OR has_role(uid, 'administrator'::app_role)
     OR has_role(uid, 'finance_admin'::app_role)
     OR has_role(uid, 'vicar_general'::app_role)
     OR has_role(uid, 'procurator'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.requester_id IS DISTINCT FROM uid THEN
    RETURN NEW;
  END IF;

  IF NEW.status            IS DISTINCT FROM OLD.status
   OR NEW.finance_admin_decision   IS DISTINCT FROM OLD.finance_admin_decision
   OR NEW.finance_admin_signature  IS DISTINCT FROM OLD.finance_admin_signature
   OR NEW.finance_admin_decided_at IS DISTINCT FROM OLD.finance_admin_decided_at
   OR NEW.vicar_general_decision   IS DISTINCT FROM OLD.vicar_general_decision
   OR NEW.vicar_general_signature  IS DISTINCT FROM OLD.vicar_general_signature
   OR NEW.vicar_general_decided_at IS DISTINCT FROM OLD.vicar_general_decided_at
   OR NEW.procurator_decision      IS DISTINCT FROM OLD.procurator_decision
   OR NEW.procurator_signature     IS DISTINCT FROM OLD.procurator_signature
   OR NEW.procurator_decided_at    IS DISTINCT FROM OLD.procurator_decided_at
   OR NEW.accounts_disbursement_status IS DISTINCT FROM OLD.accounts_disbursement_status
   OR NEW.accounts_disbursement_at     IS DISTINCT FROM OLD.accounts_disbursement_at
   OR NEW.accounts_disbursement_by     IS DISTINCT FROM OLD.accounts_disbursement_by
   OR NEW.serial_number    IS DISTINCT FROM OLD.serial_number
   OR NEW.requester_id     IS DISTINCT FROM OLD.requester_id
   OR NEW.selected_super_admin_id  IS DISTINCT FROM OLD.selected_super_admin_id
   OR NEW.vicar_super_admin_id     IS DISTINCT FROM OLD.vicar_super_admin_id
   OR NEW.procurator_super_admin_id IS DISTINCT FROM OLD.procurator_super_admin_id
  THEN
    RAISE EXCEPTION 'Requesters cannot modify approval or disbursement fields';
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE public.finance_requests DROP COLUMN IF EXISTS mpesa_phone;

-- 2) Prevent drivers from writing to approval / attribution fields on their own
--    pending logs via UPDATE.

CREATE OR REPLACE FUNCTION public.guard_driver_logs_driver_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF has_role(uid, 'super_admin'::app_role)
     OR has_role(uid, 'administrator'::app_role)
     OR has_role(uid, 'hod'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM uid THEN
    RETURN NEW;
  END IF;

  IF NEW.status                   IS DISTINCT FROM OLD.status
   OR NEW.approved_by             IS DISTINCT FROM OLD.approved_by
   OR NEW.approved_at             IS DISTINCT FROM OLD.approved_at
   OR NEW.approver_notes          IS DISTINCT FROM OLD.approver_notes
   OR NEW.lost_km_attributed_to   IS DISTINCT FROM OLD.lost_km_attributed_to
   OR NEW.lost_km_attributed_by   IS DISTINCT FROM OLD.lost_km_attributed_by
   OR NEW.lost_km_attributed_at   IS DISTINCT FROM OLD.lost_km_attributed_at
   OR NEW.lost_km_confirmed_at    IS DISTINCT FROM OLD.lost_km_confirmed_at
   OR NEW.lost_km_confirmed_by    IS DISTINCT FROM OLD.lost_km_confirmed_by
   OR NEW.lost_km_trip_description IS DISTINCT FROM OLD.lost_km_trip_description
   OR NEW.lost_km_value           IS DISTINCT FROM OLD.lost_km_value
  THEN
    RAISE EXCEPTION 'Drivers cannot modify approval or attribution fields';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_driver_logs_driver_update() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_guard_driver_logs_driver_update ON public.driver_logs;
CREATE TRIGGER trg_guard_driver_logs_driver_update
BEFORE UPDATE ON public.driver_logs
FOR EACH ROW EXECUTE FUNCTION public.guard_driver_logs_driver_update();

-- 3) Administrator uploaded_reports insert must be scoped to their department.

DROP POLICY IF EXISTS "Administrators insert own uploaded reports" ON public.uploaded_reports;
CREATE POLICY "Administrators insert own uploaded reports"
ON public.uploaded_reports FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.has_role(auth.uid(), 'administrator'::app_role)
  AND department_id IS NOT NULL
  AND department_id = public.get_user_department(auth.uid())
);

-- 4) Revoke anon EXECUTE on the trigger-only guard function so it is no longer
--    a public SECURITY DEFINER entry point.

REVOKE EXECUTE ON FUNCTION public.guard_finance_requests_requester_update() FROM PUBLIC, anon;
