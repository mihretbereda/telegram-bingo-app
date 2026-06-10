-- ─── Fix: call first ball immediately when a game starts ─────────────────────
--
-- Problem: game-runner is only triggered by the pg_cron job that fires once
-- per minute. If a game starts at T=0:01, the first ball is not called until
-- T=1:00 — up to 59 s gap after the game page loads.
--
-- Fix: add a net.http_post to game-runner at the end of start_game_session.
-- start_game_session is a short function (< 100 ms), so its transaction commits
-- quickly and pg_net sends the HTTP request within milliseconds.
-- The pg_cron job continues as a safety-net (handles subsequent minutes and
-- covers the rare case where the immediate invocation fails).

create or replace function public.start_game_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
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

  -- Trigger game-runner immediately so the first ball is called within ~2 s.
  -- This function commits in < 100 ms, so pg_net dispatches the request right
  -- after commit — no waiting for the next cron minute.
  -- The pg_cron call_next_balls job runs every minute as a safety-net.
  perform net.http_post(
    url                  := 'https://axhpexgbhallhmyiwqns.supabase.co/functions/v1/game-runner',
    headers              := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4aHBleGdiaGFsbGhteWl3cW5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMTE4OTcsImV4cCI6MjA5NjU4Nzg5N30.4UHJ9LAVzpRTAvnTAI7fAw5SAzd_F9OZP0GbLjCVtCU'
    ),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 60000
  );

  -- NOTE: next waiting session is created by process_winner, not here.
  return true;
end;
$$;
