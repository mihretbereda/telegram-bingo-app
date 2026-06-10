-- ─── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists pg_cron;

-- ─── Enums ───────────────────────────────────────────────────────────────────
create type transaction_type as enum (
  'deposit', 'withdrawal', 'main_to_play', 'play_to_main',
  'stake', 'prize', 'referral_bonus'
);

create type game_status as enum ('waiting', 'active', 'finished');

create type reservation_status as enum ('reserved', 'confirmed', 'released');

-- ─── Extend profiles ─────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists referral_code text unique,
  add column if not exists referred_by uuid references public.profiles(id) on delete set null;

-- Generate referral codes for any existing profiles that don't have one
update public.profiles
set referral_code = upper(substring(md5(id::text) from 1 for 8))
where referral_code is null;

-- Auto-generate referral code on new profile creation
create or replace function public.handle_referral_code()
returns trigger language plpgsql as $$
begin
  if new.referral_code is null then
    new.referral_code := upper(substring(md5(new.id::text) from 1 for 8));
  end if;
  return new;
end;
$$;

create trigger profiles_referral_code
  before insert on public.profiles
  for each row execute function public.handle_referral_code();

-- ─── Wallets ─────────────────────────────────────────────────────────────────
create table public.wallets (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null unique references public.profiles(id) on delete cascade,
  main_balance numeric(12,2) not null default 0 check (main_balance >= 0),
  play_balance numeric(12,2) not null default 0 check (play_balance >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger wallets_updated_at
  before update on public.wallets
  for each row execute function public.handle_updated_at();

alter table public.wallets enable row level security;
create policy "users view own wallet"
  on public.wallets for select using (auth.uid() = user_id);

-- Auto-create wallet for every new profile
create or replace function public.handle_new_profile_wallet()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.wallets (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_profile_created_wallet
  after insert on public.profiles
  for each row execute function public.handle_new_profile_wallet();

-- Backfill wallets for existing profiles
insert into public.wallets (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

-- ─── Transactions ─────────────────────────────────────────────────────────────
create table public.transactions (
  id           uuid             primary key default gen_random_uuid(),
  user_id      uuid             not null references public.profiles(id) on delete cascade,
  type         transaction_type not null,
  amount       numeric(12,2)   not null check (amount > 0),
  reference_id uuid,
  created_at   timestamptz     not null default now()
);

create index transactions_user_id_idx on public.transactions (user_id, created_at desc);

alter table public.transactions enable row level security;
create policy "users view own transactions"
  on public.transactions for select using (auth.uid() = user_id);

-- ─── Referrals ────────────────────────────────────────────────────────────────
create table public.referrals (
  id           uuid        primary key default gen_random_uuid(),
  referrer_id  uuid        not null references public.profiles(id) on delete cascade,
  referee_id   uuid        not null unique references public.profiles(id) on delete cascade,
  bonus_amount numeric(12,2) not null default 5.00,
  created_at   timestamptz not null default now()
);

alter table public.referrals enable row level security;
create policy "referrers view own referrals"
  on public.referrals for select using (auth.uid() = referrer_id);

-- ─── Game Sessions ────────────────────────────────────────────────────────────
create table public.game_sessions (
  id                uuid        primary key default gen_random_uuid(),
  stake_amount      numeric(12,2) not null,
  status            game_status not null default 'waiting',
  timer_ends_at     timestamptz not null,
  ball_sequence     int[],      -- populated at game start, hidden from client queries
  call_index        int         not null default 0,
  prize_pool        numeric(12,2) not null default 0,
  participant_count int         not null default 0,
  started_at        timestamptz,
  ended_at          timestamptz,
  created_at        timestamptz not null default now()
);

alter table public.game_sessions enable row level security;
-- Public read, but client never selects ball_sequence column
create policy "anyone reads game_sessions"
  on public.game_sessions for select using (true);

-- ─── Cartela Reservations ─────────────────────────────────────────────────────
create table public.cartela_reservations (
  id              uuid               primary key default gen_random_uuid(),
  game_session_id uuid               not null references public.game_sessions(id) on delete cascade,
  user_id         uuid               not null references public.profiles(id) on delete cascade,
  cartela_number  int                not null check (cartela_number between 1 and 600),
  slot            int                not null check (slot in (1, 2)),
  status          reservation_status not null default 'reserved',
  reserved_at     timestamptz        not null default now(),
  expires_at      timestamptz        not null default now() + interval '70 seconds',
  unique (game_session_id, cartela_number),
  unique (game_session_id, user_id, slot)
);

create index cartela_reservations_session_idx on public.cartela_reservations (game_session_id, status);

alter table public.cartela_reservations enable row level security;
create policy "anyone reads reservations"
  on public.cartela_reservations for select using (true);

-- Update participant_count on game_sessions whenever reservations change
create or replace function public.sync_participant_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_session_id uuid;
begin
  target_session_id := coalesce(new.game_session_id, old.game_session_id);
  update public.game_sessions
  set participant_count = (
    select count(distinct user_id)
    from public.cartela_reservations
    where game_session_id = target_session_id
      and status = 'reserved'
  )
  where id = target_session_id and status = 'waiting';
  return coalesce(new, old);
end;
$$;

create trigger on_reservation_change
  after insert or update or delete on public.cartela_reservations
  for each row execute function public.sync_participant_count();

-- ─── Game Participants ────────────────────────────────────────────────────────
create table public.game_participants (
  id              uuid    primary key default gen_random_uuid(),
  game_session_id uuid    not null references public.game_sessions(id) on delete cascade,
  user_id         uuid    not null references public.profiles(id) on delete cascade,
  cartela_1       int,
  cartela_2       int,
  is_watcher      boolean not null default false,
  stake_deducted  boolean not null default false,
  auto_mode       boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (game_session_id, user_id)
);

create index participants_session_idx on public.game_participants (game_session_id);
create index participants_user_idx    on public.game_participants (user_id);

alter table public.game_participants enable row level security;
create policy "anyone reads participants"
  on public.game_participants for select using (true);
create policy "users update own auto_mode"
  on public.game_participants for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Game Balls ───────────────────────────────────────────────────────────────
create table public.game_balls (
  id              uuid        primary key default gen_random_uuid(),
  game_session_id uuid        not null references public.game_sessions(id) on delete cascade,
  ball_number     int         not null check (ball_number between 1 and 75),
  sequence_index  int         not null,
  called_at       timestamptz not null default now(),
  unique (game_session_id, sequence_index)
);

create index game_balls_session_idx on public.game_balls (game_session_id, sequence_index);

alter table public.game_balls enable row level security;
create policy "anyone reads game_balls"
  on public.game_balls for select using (true);

-- ─── Game Results ─────────────────────────────────────────────────────────────
create table public.game_results (
  id                uuid        primary key default gen_random_uuid(),
  game_session_id   uuid        not null unique references public.game_sessions(id) on delete cascade,
  winner_id         uuid        not null references public.profiles(id),
  cartela_id        int         not null,
  pattern           text        not null, -- e.g. 'row_2', 'col_0', 'diag_main'
  prize_amount      numeric(12,2) not null,
  balls_called_count int        not null,
  won_at            timestamptz not null default now()
);

alter table public.game_results enable row level security;
create policy "anyone reads game_results"
  on public.game_results for select using (true);

-- ─── Realtime publications ────────────────────────────────────────────────────
alter publication supabase_realtime add table public.game_sessions;
alter publication supabase_realtime add table public.cartela_reservations;
alter publication supabase_realtime add table public.game_participants;
alter publication supabase_realtime add table public.game_balls;
alter publication supabase_realtime add table public.game_results;
alter publication supabase_realtime add table public.wallets;
alter publication supabase_realtime add table public.transactions;

-- ─── start_game_session ───────────────────────────────────────────────────────
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
  -- Lock the session to prevent double starts
  select * into session_rec from public.game_sessions
  where id = p_session_id and status = 'waiting'
  for update;

  if not found then return false; end if;

  -- Allow up to 10 seconds of tolerance for timer drift
  if session_rec.timer_ends_at > now() + interval '10 seconds' then
    return false;
  end if;

  -- Generate shuffled 1-75 ball sequence
  select array_agg(n order by random()) into ball_seq
  from generate_series(1, 75) as n;

  -- Transition session to active
  update public.game_sessions set
    status       = 'active',
    ball_sequence = ball_seq,
    started_at   = now(),
    call_index   = 0
  where id = p_session_id;

  -- Convert each user's reservations into a participant row
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

    -- Mark reservations confirmed
    update public.cartela_reservations set status = 'confirmed'
    where game_session_id = p_session_id and user_id = p_rec.user_id and status = 'reserved';

    -- Count cards and deduct stake
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
      -- Insufficient funds — demote to watcher
      update public.game_participants set is_watcher = true
      where game_session_id = p_session_id and user_id = p_rec.user_id;
    end if;
  end loop;

  -- Compute final prize pool (80% of total stakes collected)
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

  -- Immediately spin up the next waiting session for the same stake level
  insert into public.game_sessions (stake_amount, timer_ends_at)
  values (session_rec.stake_amount, now() + interval '60 seconds');

  return true;
end;
$$;

-- ─── process_winner ───────────────────────────────────────────────────────────
create or replace function public.process_winner(
  p_session_id      uuid,
  p_user_id         uuid,
  p_cartela_id      int,
  p_pattern         text,
  p_prize           numeric,
  p_balls_called    int
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  -- Unique constraint on game_session_id ensures only one winner per game
  insert into public.game_results
    (game_session_id, winner_id, cartela_id, pattern, prize_amount, balls_called_count)
  values
    (p_session_id, p_user_id, p_cartela_id, p_pattern, p_prize, p_balls_called)
  on conflict (game_session_id) do nothing;

  if not found then return false; end if; -- Someone else already won

  -- Close the session
  update public.game_sessions
  set status = 'finished', ended_at = now()
  where id = p_session_id;

  -- Credit prize to winner
  update public.wallets
  set play_balance = play_balance + p_prize
  where user_id = p_user_id;

  insert into public.transactions (user_id, type, amount, reference_id)
  values (p_user_id, 'prize', p_prize, p_session_id);

  return true;
end;
$$;

-- ─── release_expired_reservations ────────────────────────────────────────────
create or replace function public.release_expired_reservations()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.cartela_reservations
  set status = 'released'
  where status = 'reserved' and expires_at < now();
end;
$$;

-- ─── call_next_balls (pg_cron target) ────────────────────────────────────────
-- Runs every minute; loops 14 times with 4s sleep → calls ~14 balls per session per minute.
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
      next_ball := session_rec.ball_sequence[session_rec.call_index + 1]; -- 1-indexed PG arrays

      insert into public.game_balls (game_session_id, ball_number, sequence_index)
      values (session_rec.id, next_ball, session_rec.call_index)
      on conflict (game_session_id, sequence_index) do nothing;

      -- Conditional update prevents double-advancing if two cron jobs overlap
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

-- ─── check_and_start_games (pg_cron fallback) ────────────────────────────────
create or replace function public.check_and_start_games()
returns void language plpgsql security definer set search_path = public as $$
declare
  session_rec record;
begin
  for session_rec in
    select id from public.game_sessions
    where status = 'waiting' and timer_ends_at <= now()
  loop
    perform public.start_game_session(session_rec.id);
  end loop;
end;
$$;

-- ─── pg_cron schedules ────────────────────────────────────────────────────────
select cron.schedule('release-expired-reservations', '* * * * *',
  'select public.release_expired_reservations()');

select cron.schedule('call-next-balls', '* * * * *',
  'select public.call_next_balls()');

select cron.schedule('check-and-start-games', '* * * * *',
  'select public.check_and_start_games()');

-- ─── Bootstrap: create the first waiting sessions ────────────────────────────
insert into public.game_sessions (stake_amount, timer_ends_at)
values
  (10,  now() + interval '60 seconds'),
  (20,  now() + interval '60 seconds');
