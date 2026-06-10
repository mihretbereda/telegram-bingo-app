-- ─── Fix: per-ball Realtime delivery using pg_net ────────────────────────────
--
-- Problem: pg_cron wraps CALL inside its own SPI transaction context, which
-- makes PostgreSQL reject any explicit COMMIT inside the procedure ("invalid
-- transaction termination").  We cannot commit per ball inside the cron job.
--
-- Solution:
--   1. Enable pg_net (available but not yet installed on this project).
--   2. Create call_one_ball() — a small function that inserts ONE ball for
--      every active session and updates call_index, all inside a single
--      transaction.  When called via the PostgREST REST API that transaction
--      is committed immediately by PostgREST after the function returns.
--      Realtime picks up the WAL record and fires within milliseconds.
--   3. Rewrite call_next_balls() as a plain FUNCTION (no COMMIT needed).
--      It loops 14 times, firing one async net.http_post per iteration to
--      call_one_ball() through PostgREST, then sleeps 4 s.  The HTTP request
--      runs in a completely separate connection+transaction; our long-running
--      function never touches game_balls directly.
--   4. Restore the cron job to SELECT (not CALL).
--
-- Result: clients receive one Realtime INSERT event every ~4 seconds instead
-- of 14 at once at the end of each cron minute.

-- ── 1. Enable pg_net ──────────────────────────────────────────────────────────
create extension if not exists pg_net;

-- ── 2. call_one_ball — called via PostgREST, each call = its own committed tx ─
create or replace function public.call_one_ball()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  session_rec record;
begin
  for session_rec in
    select id,
           call_index,
           ball_sequence,
           stake_amount
    from   public.game_sessions
    where  status     = 'active'
      and  call_index < 75
    for update skip locked          -- skip rows locked by concurrent calls
  loop
    -- Optimistic guard: only advance if call_index hasn't moved since we read it
    update public.game_sessions
    set    call_index = call_index + 1
    where  id         = session_rec.id
      and  call_index = session_rec.call_index;

    if not found then
      continue;                     -- concurrent caller already advanced it
    end if;

    -- Insert the ball (same tx → commits when PostgREST returns → Realtime fires)
    insert into public.game_balls (game_session_id, ball_number, sequence_index)
    values (
      session_rec.id,
      session_rec.ball_sequence[session_rec.call_index + 1],   -- PG arrays are 1-indexed
      session_rec.call_index                                    -- 0-based sequence
    )
    on conflict (game_session_id, sequence_index) do nothing;

    -- Auto-finish when all 75 balls have been called and there is no winner
    if session_rec.call_index + 1 >= 75 then
      update public.game_sessions
      set    status   = 'finished',
             ended_at = now()
      where  id     = session_rec.id
        and  status = 'active'
        and  not exists (
               select 1 from public.game_results
               where  game_session_id = session_rec.id
             );

      if found then
        -- Create next waiting session with sentinel timer
        insert into public.game_sessions (stake_amount, timer_ends_at)
        values (session_rec.stake_amount, now() + interval '1 year');
      end if;
    end if;
  end loop;

  return '{"ok":true}'::json;
end;
$$;

-- Allow the anon role to call this function via PostgREST (anon key is public)
grant execute on function public.call_one_ball() to anon;

-- ── 3. call_next_balls — async orchestrator (no direct DB writes) ─────────────
--
-- Drop the broken procedure first (procedure and function share the same
-- namespace in PG; you must drop the procedure before creating a function
-- with the same name).
drop procedure if exists public.call_next_balls();

create or replace function public.call_next_balls()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i int;
begin
  -- Skip entirely when there is nothing to do
  if not exists (
    select 1 from public.game_sessions
    where status = 'active' and call_index < 75
  ) then
    return;
  end if;

  for i in 1..14 loop
    -- Fire an async HTTP POST to call_one_ball() via PostgREST.
    -- pg_net returns immediately (non-blocking); the HTTP request runs in a
    -- separate connection with its own auto-committed transaction.
    -- pg_sleep(4) then provides the 4-second gap before the next ball.
    perform net.http_post(
      url     := 'https://axhpexgbhallhmyiwqns.supabase.co/rest/v1/rpc/call_one_ball',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4aHBleGdiaGFsbGhteWl3cW5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMTE4OTcsImV4cCI6MjA5NjU4Nzg5N30.4UHJ9LAVzpRTAvnTAI7fAw5SAzd_F9OZP0GbLjCVtCU'
      ),
      body    := '{}'::jsonb
    );

    if i < 14 then
      perform pg_sleep(4);
    end if;
  end loop;
end;
$$;

-- ── 4. Restore cron job (SELECT for functions, CALL only for procedures) ───────
select cron.unschedule('call-next-balls');
select cron.schedule(
  'call-next-balls',
  '* * * * *',
  $$select public.call_next_balls()$$
);
