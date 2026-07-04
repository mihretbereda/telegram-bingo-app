-- Store editable deposit payment method info in admin_config
-- so the admin can update account numbers/holders without code changes.

ALTER TABLE public.admin_config
  ADD COLUMN IF NOT EXISTS telebirr_account TEXT NOT NULL DEFAULT '0947483990',
  ADD COLUMN IF NOT EXISTS telebirr_holder  TEXT NOT NULL DEFAULT 'Aschalew Demse Bereda',
  ADD COLUMN IF NOT EXISTS cbe_account      TEXT NOT NULL DEFAULT '1000738072808',
  ADD COLUMN IF NOT EXISTS cbe_holder       TEXT NOT NULL DEFAULT 'Mihret Demisie';
