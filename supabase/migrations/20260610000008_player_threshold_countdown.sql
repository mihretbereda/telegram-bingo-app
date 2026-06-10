-- ─── Countdown only starts when 2 distinct users have reserved ───────────────
-- Sessions are created with a sentinel timer (1 year from now) meaning
-- "not started". When the 2nd distinct user reserves a cartela, the edge
-- function sets timer_ends_at = now + 60s. If the count drops below 2
-- (release or expiry), the timer resets back to the sentinel.

-- ── Helper: recompute timer for a single waiting session ─────────────────────
create or replace function public.sync_session_timer(p_session_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  user_count int;
begin
  select count(distinct user_id) into user_count
  from public.cartela_reservations
  where game_session_id = p_session_id and status = 'reserved';

  if user_count < 2 then
    -- Stop countdown — not enough players
    update public.game_sessions
    set timer_ends_at = now() + interval '1 year'
    where id = p_session_id and status = 'waiting';
  end if;
end;
$$;

-- ── release_expired_reservations: reset timer when count drops ────────────────
create or replace function public.release_expired_reservations()
returns void language plpgsql security definer set search_path = public as $$
declare
  affected_session uuid;
begin
  -- Collect affected session IDs before releasing
  for affected_session in
    select distinct game_session_id
    from public.cartela_reservations
    where status = 'reserved' and expires_at < now()
  loop
    update public.cartela_reservations
    set status = 'released'
    where game_session_id = affected_session
      and status = 'reserved'
      and expires_at < now();

    -- Recheck player count and stop timer if needed
    perform public.sync_session_timer(affected_session);
  end loop;
end;
$$;

-- ── check_and_start_games: require 2 distinct users ───────────────────────────
create or replace function public.check_and_start_games()
returns void language plpgsql security definer set search_path = public as $$
declare
  session_rec  record;
  user_count   int;
begin
  for session_rec in
    select id from public.game_sessions
    where status = 'waiting' and timer_ends_at <= now()
  loop
    select count(distinct user_id) into user_count
    from public.cartela_reservations
    where game_session_id = session_rec.id and status = 'reserved';

    if user_count >= 2 then
      perform public.start_game_session(session_rec.id);
    else
      -- Timer expired but not enough players — reset to sentinel
      update public.game_sessions
      set timer_ends_at = now() + interval '1 year'
      where id = session_rec.id;
    end if;
  end loop;
end;
$$;

-- ── Reset all current waiting sessions to sentinel timer ─────────────────────
-- Finish empty active sessions first
update public.game_sessions
set status = 'finished', ended_at = now()
where status = 'active'
  and not exists (
    select 1 from public.game_participants
    where game_session_id = game_sessions.id
  );

-- Reset waiting sessions that have expired timers or < 2 reserved users
update public.game_sessions
set timer_ends_at = now() + interval '1 year'
where status = 'waiting';

-- Create fresh waiting sessions (sentinel timer) if none exist
insert into public.game_sessions (stake_amount, timer_ends_at)
select s.stake, now() + interval '1 year'
from (values (10::numeric), (20::numeric)) as s(stake)
where not exists (
  select 1 from public.game_sessions
  where stake_amount = s.stake and status in ('waiting', 'active')
);
