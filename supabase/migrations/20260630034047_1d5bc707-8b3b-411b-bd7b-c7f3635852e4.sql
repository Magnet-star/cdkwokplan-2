
-- 1) Revoke EXECUTE from anon/public on SECURITY DEFINER helpers; keep authenticated where appropriate.
REVOKE EXECUTE ON FUNCTION public.get_accounts_recipients() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_super_admin_recipients() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_clergy_phone(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_storage_db_usage() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_finance_approver_password(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_finance_approver_password(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assign_finance_request_serial() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_user_sessions() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_accounts_recipients() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_super_admin_recipients() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clergy_phone(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_storage_db_usage() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_finance_approver_password(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_finance_approver_password(text) TO authenticated;

-- 2) driver_logs: prevent HOD from approving their own log.
DROP POLICY IF EXISTS "HOD approves logs for their dept" ON public.driver_logs;
CREATE POLICY "HOD approves logs for their dept"
ON public.driver_logs
FOR UPDATE
USING (
  has_role(auth.uid(), 'hod'::app_role)
  AND department_id = get_user_department(auth.uid())
  AND user_id <> auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'hod'::app_role)
  AND department_id = get_user_department(auth.uid())
  AND user_id <> auth.uid()
);

-- 3) finance_requests: trigger blocks requester from changing approval/disbursement fields.
CREATE OR REPLACE FUNCTION public.guard_finance_requests_requester_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  -- Privileged roles bypass the guard
  IF has_role(uid, 'super_admin'::app_role)
     OR has_role(uid, 'administrator'::app_role)
     OR has_role(uid, 'finance_admin'::app_role)
     OR has_role(uid, 'vicar_general'::app_role)
     OR has_role(uid, 'procurator'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Only applies to the requester editing their own row
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

DROP TRIGGER IF EXISTS trg_guard_finance_requests_requester_update ON public.finance_requests;
CREATE TRIGGER trg_guard_finance_requests_requester_update
BEFORE UPDATE ON public.finance_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_finance_requests_requester_update();

-- 4) workplan-pdfs storage: allow uploader to read their own files (folder = auth.uid()).
DROP POLICY IF EXISTS "Users can read own workplan pdfs" ON storage.objects;
CREATE POLICY "Users can read own workplan pdfs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'workplan-pdfs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
