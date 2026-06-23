
-- Add cancelled status
ALTER TYPE public.finance_request_status ADD VALUE IF NOT EXISTS 'cancelled';

-- Allow requester to update their own request while pending (for edit & cancel)
CREATE POLICY "Requester can update own pending"
ON public.finance_requests
FOR UPDATE
USING (requester_id = auth.uid() AND status IN ('pending','adjustment_requested'))
WITH CHECK (requester_id = auth.uid());
