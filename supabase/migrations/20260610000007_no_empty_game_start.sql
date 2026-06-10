-- ─── Never start a game that has no reservations ─────────────────────────────
-- The old check_and_start_games started sessions as soon as timer_ends_at passed,
-- even when nobody had reserved a cartela. Those empty active sessions blocked
-- the waiting room for up to 5 minutes (75 balls × 4 s). Now: if the timer
-- expires but there are no reservations, simply reset the timer for another
-- 60 seconds. The game only starts when at least one player has reserved.

create or replace function public.check_and_start_games()
returns void language plpgsql security definer set search_path = public as $$
declare
  session_rec record;
  has_reservations boolean;
begin
  for session_rec in
    select id from public.game_sessions
    where status = 'waiting' and timer_ends_at <= now()
  loop
    select exists (
      select 1 from public.cartela_reservations
      where game_session_id = session_rec.id and status = 'reserved'
    ) into has_reservations;

    if has_reservations then
      perform public.start_game_session(session_rec.id);
    else
      -- No players — roll the timer forward instead of starting an empty game
      update public.game_sessions
      set timer_ends_at = now() + interval '60 seconds'
      where id = session_rec.id;
    end if;
  end loop;
end;
$$;

-- ─── Clean up current empty active sessions and reset waiting rooms ───────────
update public.game_sessions
set status = 'finished', ended_at = now()
where status = 'active'
  and not exists (
    select 1 from public.game_participants
    where game_session_id = game_sessions.id
  );

-- Retire expired waiting sessions (they'll be replaced with fresh ones below)
update public.game_sessions
set status = 'finished', ended_at = now()
where status = 'waiting'
  and timer_ends_at < now();

-- Fresh waiting sessions — the new check_and_start_games will keep rolling
-- their timers forward as long as nobody reserves, so these never expire.
insert into public.game_sessions (stake_amount, timer_ends_at)
select s.stake, now() + interval '60 seconds'
from (values (10::numeric), (20::numeric)) as s(stake)
where not exists (
  select 1 from public.game_sessions
  where stake_amount = s.stake and status in ('waiting', 'active')
);
