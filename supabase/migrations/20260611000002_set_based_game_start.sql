-- Rewrite start_game_session to use set-based SQL instead of a per-player loop.
-- Before: N players × 5 DB operations each = 5N round-trips (sequential).
-- After:  4 set-based statements regardless of player count.

create or replace function public.start_game_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  session_rec record;
  ball_seq    int[];
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

  -- ── 1. Create all participant rows in one insert ──────────────────────────
  insert into public.game_participants (game_session_id, user_id, cartela_1, cartela_2)
  select
    p_session_id,
    user_id,
    max(case when slot = 1 then cartela_number end),
    max(case when slot = 2 then cartela_number end)
  from public.cartela_reservations
  where game_session_id = p_session_id and status = 'reserved'
  group by user_id
  on conflict (game_session_id, user_id) do nothing;

  -- ── 2. Confirm all reservations in one update ─────────────────────────────
  update public.cartela_reservations
  set status = 'confirmed'
  where game_session_id = p_session_id and status = 'reserved';

  -- ── 3. Deduct wallets + log transactions + flag participants ──────────────
  -- All three happen in one CTE so the wallet UPDATE locks rows implicitly,
  -- eliminating the N sequential FOR UPDATE locks of the old loop.
  with stakes as (
    select
      user_id,
      count(*) * session_rec.stake_amount as stake_total
    from public.cartela_reservations
    where game_session_id = p_session_id and status = 'confirmed'
    group by user_id
  ),
  deductions as (
    update public.wallets w
    set
      play_balance = w.play_balance - least(w.play_balance, s.stake_total),
      main_balance = w.main_balance - greatest(0, s.stake_total - w.play_balance)
    from stakes s
    where w.user_id = s.user_id
      and (w.play_balance + w.main_balance) >= s.stake_total
    returning w.user_id, s.stake_total
  ),
  txns as (
    insert into public.transactions (user_id, type, amount, reference_id)
    select user_id, 'stake', stake_total, p_session_id
    from deductions
  )
  update public.game_participants gp
  set
    stake_deducted = (d.user_id is not null),
    is_watcher     = (d.user_id is null)
  from stakes s
  left join deductions d on d.user_id = s.user_id
  where gp.game_session_id = p_session_id
    and gp.user_id = s.user_id;

  -- ── 4. Set prize pool and participant count ───────────────────────────────
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
