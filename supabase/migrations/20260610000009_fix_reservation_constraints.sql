-- ─── Fix unique constraints on cartela_reservations ──────────────────────────
-- The original constraints are table-level UNIQUE (not partial), so a row
-- with status='released' still blocks new 'reserved' rows for the same
-- (session, cartela) or (session, user, slot) combination.
-- Result: after a user releases a cartela and tries to pick another, the
-- INSERT fails with 23505 even though there is no active conflict.
--
-- Fix: drop the non-partial constraints and replace with partial unique
-- indexes that only cover status='reserved' rows.

-- 1. Drop old non-partial constraints
alter table public.cartela_reservations
  drop constraint if exists cartela_reservations_game_session_id_cartela_number_key;

alter table public.cartela_reservations
  drop constraint if exists cartela_reservations_game_session_id_user_id_slot_key;

-- 2. Add partial indexes (enforce uniqueness only among active reservations)
create unique index if not exists cartela_reservations_active_cartela_unique
  on public.cartela_reservations (game_session_id, cartela_number)
  where status = 'reserved';

create unique index if not exists cartela_reservations_active_slot_unique
  on public.cartela_reservations (game_session_id, user_id, slot)
  where status = 'reserved';

-- 3. Clean up stale released rows to prevent table bloat and confusion
delete from public.cartela_reservations where status = 'released';
