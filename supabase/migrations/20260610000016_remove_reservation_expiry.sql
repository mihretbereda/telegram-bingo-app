-- Remove reservation expiry — reserving a cartella is equivalent to purchasing
-- it, so there is no reason to silently release it after 70 seconds.

select cron.unschedule('release-expired-reservations');

drop function if exists public.release_expired_reservations();

-- Keep the column but make it nullable so no code breaks; it is simply ignored.
alter table public.cartela_reservations
  alter column expires_at drop not null,
  alter column expires_at set default null;
