-- ─── Combined balance payments ────────────────────────────────────────────────
-- 1. Stake deduction: play_balance first, main_balance for remainder.
-- 2. Prize credit: goes to main_balance (not play_balance).
-- Both changes are atomic — wallet is locked with FOR UPDATE before any read.

-- ── start_game_session ────────────────────────────────────────────────────────
create or replace function public.start_game_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  session_rec  record;
  ball_seq     int[];
  p_rec        record;
  card_count   int;
  stake_total  numeric;
  wallet_play  numeric;
  wallet_main  numeric;
  from_play    numeric;
  from_main    numeric;
begin
  select * into session_rec from public.game_sessions
  where id = p_session_id and status = 'waiting'
  for update;

  if not found then return false; end if;

  if session_rec.timer_ends_at > now() + interval '10 seconds' then
    return false;
  end if;

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

    -- Lock wallet and read both balances atomically
    select play_balance, main_balance
    into wallet_play, wallet_main
    from public.wallets
    where user_id = p_rec.user_id
    for update;

    if found and (wallet_play + wallet_main) >= stake_total then
      -- Use play_balance first, main_balance for the remainder
      from_play := least(wallet_play, stake_total);
      from_main := stake_total - from_play;

      update public.wallets
      set play_balance = play_balance - from_play,
          main_balance = main_balance - from_main
      where user_id = p_rec.user_id;

      insert into public.transactions (user_id, type, amount, reference_id)
      values (p_rec.user_id, 'stake', stake_total, p_session_id);

      update public.game_participants set stake_deducted = true
      where game_session_id = p_session_id and user_id = p_rec.user_id;
    else
      -- Combined balance insufficient — demote to watcher
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

  perform net.http_post(
    url                  := 'https://axhpexgbhallhmyiwqns.supabase.co/functions/v1/game-runner',
    headers              := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4aHBleGdiaGFsbGhteWl3cW5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMTE4OTcsImV4cCI6MjA5NjU4Nzg5N30.4UHJ9LAVzpRTAvnTAI7fAw5SAzd_F9OZP0GbLjCVtCU'
    ),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 60000
  );

  return true;
end;
$$;

-- ── process_winner ────────────────────────────────────────────────────────────
create or replace function public.process_winner(
  p_session_id   uuid,
  p_user_id      uuid,
  p_cartela_id   int,
  p_pattern      text,
  p_prize        numeric,
  p_balls_called int
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_stake numeric;
begin
  if not exists (
    select 1 from public.game_sessions
    where id = p_session_id and status = 'active'
  ) then
    return false;
  end if;

  insert into public.game_results
    (game_session_id, winner_id, cartela_id, pattern, prize_amount, balls_called_count)
  values
    (p_session_id, p_user_id, p_cartela_id, p_pattern, p_prize, p_balls_called);

  select stake_amount into v_stake
  from public.game_sessions where id = p_session_id;

  update public.game_sessions
  set status = 'finished', ended_at = now()
  where id = p_session_id;

  -- Prize goes to main_balance
  update public.wallets
  set main_balance = main_balance + p_prize
  where user_id = p_user_id;

  insert into public.transactions (user_id, type, amount, reference_id)
  values (p_user_id, 'prize', p_prize, p_session_id);

  insert into public.game_sessions (stake_amount, timer_ends_at)
  values (v_stake, now() + interval '1 year');

  return true;
end;
$$;
