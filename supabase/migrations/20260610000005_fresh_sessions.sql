-- ─── Reset stale sessions and create fresh waiting sessions ──────────────────
-- Finish any active sessions that have no participants.
update public.game_sessions
set status = 'finished', ended_at = now()
where status = 'active'
  and not exists (
    select 1 from public.game_participants
    where game_session_id = game_sessions.id
  );

-- Expire any waiting sessions whose timer already passed so they don't linger
-- as phantom waiting sessions that immediately get started by cron.
-- We'll replace them with fresh ones below.
update public.game_sessions
set status = 'finished', ended_at = now()
where status = 'waiting'
  and timer_ends_at < now();

-- Insert fresh waiting sessions (90-second window) for each stake level that
-- has no open session right now.
insert into public.game_sessions (stake_amount, timer_ends_at)
select s.stake, now() + interval '90 seconds'
from (values (10::numeric), (20::numeric)) as s(stake)
where not exists (
  select 1 from public.game_sessions
  where stake_amount = s.stake and status in ('waiting', 'active')
);
