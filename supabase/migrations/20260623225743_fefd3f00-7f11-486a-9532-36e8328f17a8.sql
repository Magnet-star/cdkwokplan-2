
CREATE POLICY "Super admin can delete finance requests"
ON public.finance_requests
FOR DELETE
USING (public.has_role(auth.uid(), 'super_admin'));
