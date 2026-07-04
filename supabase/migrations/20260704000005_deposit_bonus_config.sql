ALTER TABLE public.admin_config
  ADD COLUMN IF NOT EXISTS deposit_bonus_enabled BOOLEAN NOT NULL DEFAULT FALSE;
