-- ─── Restore ball system to 1-75 and fix session lifecycle ──────────────────
-- Migration 20260610000001 changed balls to 1-24 and was reverted in code
-- but not in the DB. This migration undoes those DB changes and also fixes
-- the session lifecycle so the next waiting session is created when a game
-- FINISHES (not when it starts), giving a clean sequential flow.

-- 1. Restore game_balls constraint to 1-75
alter table public.game_balls
  drop constraint if exists game_balls_ball_number_check;

alter table public.game_balls
  add constraint game_balls_ball_number_check
  check (ball_number between 1 and 75);

-- 2. Restore start_game_session to use 1-75 balls.
--    The next waiting session is NO LONGER created here — it is created in
--    process_winner when the game finishes, giving the clean flow:
--    Waiting → Active → Finished → Waiting (next)
create or replace function public.start_game_session(p_session_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  session_rec    record;
  ball_seq       int[];
  p_rec          record;
  card_count     int;
  stake_total    numeric;
  wallet_bal     numeric;
begin
  select * into session_rec from public.game_sessions
  where id = p_session_id and status = 'waiting'
  for update;

  if not found then return false; end if;

  if session_rec.timer_ends_at > now() + interval '10 seconds' then
    return false;
  end if;

  -- Generate shuffled 1-75 ball sequence
  select array_agg(n order by random()) into ball_seq
  from generate_series(1, 75) as n;

  update public.game_sessions set
    status        = 'active',
    ball_sequence = ball_seq,
    started_at    = now(),
    call_index    = 0
  where id = p_session_id;

  for p_rec in
    select
      user_id,
      max(case when slot = 1 then cartela_number end) as c1,
      max(case when slot = 2 then cartela_number end) as c2
    from public.cartela_reservations
    where game_session_id = p_session_id and status = 'reserved'
    group by user_id
  loop
    insert into public.game_participants (game_session_id, user_id, cartela_1, cartela_2)
    values (p_session_id, p_rec.user_id, p_rec.c1, p_rec.c2)
    on conflict (game_session_id, user_id) do nothing;

    update public.cartela_reservations set status = 'confirmed'
    where game_session_id = p_session_id and user_id = p_rec.user_id and status = 'reserved';

    card_count  := (case when p_rec.c1 is not null then 1 else 0 end)
                 + (case when p_rec.c2 is not null then 1 else 0 end);
    stake_total := card_count * session_rec.stake_amount;

    select play_balance into wallet_bal from public.wallets
    where user_id = p_rec.user_id for update;

    if found and wallet_bal >= stake_total then
      update public.wallets
      set play_balance = play_balance - stake_total
      where user_id = p_rec.user_id;

      insert into public.transactions (user_id, type, amount, reference_id)
      values (p_rec.user_id, 'stake', stake_total, p_session_id);

      update public.game_participants set stake_deducted = true
      where game_session_id = p_session_id and user_id = p_rec.user_id;
    else
      update public.game_participants set is_watcher = true
      where game_session_id = p_session_id and user_id = p_rec.user_id;
    end if;
  end loop;

  update public.game_sessions set
    prize_pool = coalesce((
      select sum(amount) * 0.8
      from public.transactions
      where reference_id = p_session_id and type = 'stake'
    ), 0),
    participant_count = (
      select count(*) from public.game_participants
      where game_session_id = p_session_id and not is_watcher
    )
  where id = p_session_id;

  -- NOTE: next waiting session is created by process_winner, not here.
  return true;
end;
$$;

-- 3. Restore call_next_balls to cap at 75
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
end;
$$;

-- 4. Update process_winner to create the next waiting session on finish.
--    This is the correct place: Finished → Waiting (next).
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

  -- Close the session
  update public.game_sessions
  set status = 'finished', ended_at = now()
  where id = p_session_id
  returning stake_amount into v_stake;

  -- Credit prize to winner
  update public.wallets
  set play_balance = play_balance + p_prize
  where user_id = p_user_id;

  insert into public.transactions (user_id, type, amount, reference_id)
  values (p_user_id, 'prize', p_prize, p_session_id);

  -- Create the next waiting session now that this one has finished
  insert into public.game_sessions (stake_amount, timer_ends_at)
  values (v_stake, now() + interval '60 seconds');

  return true;
end;
$$;

-- 5. Bootstrap: create waiting sessions if none exist for each stake level
insert into public.game_sessions (stake_amount, timer_ends_at)
select s.stake, now() + interval '60 seconds'
from (values (10::numeric), (20::numeric)) as s(stake)
where not exists (
  select 1 from public.game_sessions
  where stake_amount = s.stake and status = 'waiting'
);
