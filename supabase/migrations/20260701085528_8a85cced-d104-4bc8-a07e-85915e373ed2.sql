
CREATE TABLE public.sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL,
  request_id uuid,
  recipient_msisdn bigint NOT NULL,
  recipient_role text,
  message text NOT NULL,
  reference text,
  status text NOT NULL DEFAULT 'sent',
  error text
);
GRANT SELECT, INSERT ON public.sms_logs TO authenticated;
GRANT ALL ON public.sms_logs TO service_role;
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view sms logs"
  ON public.sms_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Service role can insert sms logs"
  ON public.sms_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR auth.uid() IS NOT NULL);
CREATE INDEX idx_sms_logs_created_at ON public.sms_logs (created_at DESC);
CREATE INDEX idx_sms_logs_request_id ON public.sms_logs (request_id);
