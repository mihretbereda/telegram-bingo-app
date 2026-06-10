-- ─── Sentinel timer for every newly-created waiting session ──────────────────
-- process_winner and call_next_balls (auto-finish) were both still creating
-- new waiting sessions with timer_ends_at = now() + 60s, bypassing the
-- player-threshold countdown requirement. All new sessions must start with
-- the sentinel value (now + 1 year) so the countdown only begins once 2
-- distinct users have reserved a cartela.

-- ── process_winner ────────────────────────────────────────────────────────────
create or replace function public.process_winner(
  p_session_id  uuid,
  p_user_id     uuid,
  p_cartela_id  int,
  p_pattern     text,
  p_prize       numeric,
  p_balls_called int
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_stake numeric;
begin
  -- Verify session is still active (prevents duplicate winner claims)
  if not exists (
    select 1 from public.game_sessions
    where id = p_session_id and status = 'active'
  ) then
    return false;
  end if;

  -- Record result and close session atomically
  insert into public.game_results
    (game_session_id, winner_id, cartela_id, pattern, prize_amount, balls_called_count)
  values
    (p_session_id, p_user_id, p_cartela_id, p_pattern, p_prize, p_balls_called);

  select stake_amount into v_stake
  from public.game_sessions where id = p_session_id;

  update public.game_sessions
  set status = 'finished', ended_at = now()
  where id = p_session_id;

  -- Credit prize to winner
  update public.wallets
  set play_balance = play_balance + p_prize
  where user_id = p_user_id;

  insert into public.transactions (user_id, type, amount, reference_id)
  values (p_user_id, 'prize', p_prize, p_session_id);

  -- Next waiting session starts with sentinel timer — countdown begins only
  -- when 2 distinct users reserve a cartela (enforced in reserve-cartela).
  insert into public.game_sessions (stake_amount, timer_ends_at)
  values (v_stake, now() + interval '1 year');

  return true;
end;
$$;

-- ── call_next_balls ───────────────────────────────────────────────────────────
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

    -- Sentinel timer: same rule as process_winner
    insert into public.game_sessions (stake_amount, timer_ends_at)
    values (session_rec.stake_amount, now() + interval '1 year');
  end loop;
end;
$$;

-- ── Reset any currently-waiting sessions that have a short timer ──────────────
-- Catches sessions created by the old code before this migration ran.
update public.game_sessions
set timer_ends_at = now() + interval '1 year'
where status = 'waiting'
  and timer_ends_at < now() + interval '120 seconds';
