-- ─── Set a sane waiting-room timer and reset stuck sessions ──────────────────

-- Finish stale active sessions that have no participants.
update public.game_sessions
set status = 'finished', ended_at = now()
where status = 'active'
  and not exists (
    select 1 from public.game_participants
    where game_session_id = game_sessions.id
  );

-- Retire any waiting sessions whose timer already passed — they'll just confuse
-- the client with an immediately-expired countdown.
update public.game_sessions
set status = 'finished', ended_at = now()
where status = 'waiting'
  and timer_ends_at < now();

-- Fresh waiting sessions with a 5-minute window so the countdown is visible.
insert into public.game_sessions (stake_amount, timer_ends_at)
select s.stake, now() + interval '5 minutes'
from (values (10::numeric), (20::numeric)) as s(stake)
where not exists (
  select 1 from public.game_sessions
  where stake_amount = s.stake and status in ('waiting', 'active')
);

-- ─── Update process_winner to use a 60-second waiting room for the next session
create or replace function public.process_winner(
  p_session_id      uuid,
  p_user_id         uuid,
  p_cartela_id      int,
  p_pattern         text,
  p_prize           numeric,
  p_balls_called    int
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_stake numeric;
begin
  insert into public.game_results
    (game_session_id, winner_id, cartela_id, pattern, prize_amount, balls_called_count)
  values
    (p_session_id, p_user_id, p_cartela_id, p_pattern, p_prize, p_balls_called)
  on conflict (game_session_id) do nothing;

  if not found then return false; end if;

  update public.game_sessions
  set status = 'finished', ended_at = now()
  where id = p_session_id
  returning stake_amount into v_stake;

  update public.wallets
  set play_balance = play_balance + p_prize
  where user_id = p_user_id;

  insert into public.transactions (user_id, type, amount, reference_id)
  values (p_user_id, 'prize', p_prize, p_session_id);

  -- 60-second waiting room before the next game
  insert into public.game_sessions (stake_amount, timer_ends_at)
  values (v_stake, now() + interval '60 seconds');

  return true;
end;
$$;

-- ─── Update call_next_balls auto-finish to also use 60-second waiting room ───
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

  -- Auto-finish sessions where all 75 balls called with no winner
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

    insert into public.game_sessions (stake_amount, timer_ends_at)
    values (session_rec.stake_amount, now() + interval '60 seconds');
  end loop;
end;
$$;
