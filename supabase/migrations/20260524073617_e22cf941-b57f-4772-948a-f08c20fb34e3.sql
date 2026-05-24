ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'administrator';
ALTER TABLE public.daily_logs ADD COLUMN IF NOT EXISTS recommendations text;