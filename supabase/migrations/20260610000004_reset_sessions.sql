-- ─── Reset stuck sessions and enforce sequential flow ────────────────────────
-- Finish any active sessions that have no participants (they can never get a
-- winner and will block the waiting room indefinitely).
update public.game_sessions
set status = 'finished', ended_at = now()
where status = 'active'
  and not exists (
    select 1 from public.game_participants
    where game_session_id = game_sessions.id
  );

-- Create a fresh waiting session for each stake level that has no open session.
insert into public.game_sessions (stake_amount, timer_ends_at)
select s.stake, now() + interval '60 seconds'
from (values (10::numeric), (20::numeric)) as s(stake)
where not exists (
  select 1 from public.game_sessions
  where stake_amount = s.stake and status in ('waiting', 'active')
);

-- ─── Auto-finish sessions where all 75 balls are called with no winner ────────
-- Replaces call_next_balls so stuck sessions never block the queue again.
create or replace function public.call_next_balls()
returns void language plpgsql security definer set search_path = public as $$
declare
  session_rec record;
  next_ball   int;
  i           int;
begin
  for i in 1..14 loop
    for session_rec in
      select id, ball_sequence, call_index
      from public.game_sessions
      where status = 'active' and call_index < 75
    loop
      next_ball := session_rec.ball_sequence[session_rec.call_index + 1];

      insert into public.game_balls (game_session_id, ball_number, sequence_index)
      values (session_rec.id, next_ball, session_rec.call_index)
      on conflict (game_session_id, sequence_index) do nothing;

      update public.game_sessions
      set call_index = call_index + 1
      where id = session_rec.id and call_index = session_rec.call_index;
    end loop;

    if i < 14 then
      perform pg_sleep(4);
    end if;
  end loop;

  -- Auto-finish any active session where all 75 balls have been called but
  -- no winner was recorded. This prevents the game from stalling forever.
  for session_rec in
    select id, stake_amount
    from public.game_sessions
    where status = 'active'
      and call_index >= 75
      and not exists (
        select 1 from public.game_results where game_session_id = game_sessions.id
      )
  loop
    update public.game_sessions
    set status = 'finished', ended_at = now()
    where id = session_rec.id;

    -- Sequential flow: create the next waiting session immediately.
    insert into public.game_sessions (stake_amount, timer_ends_at)
    values (session_rec.stake_amount, now() + interval '60 seconds');
  end loop;
end;
$$;
