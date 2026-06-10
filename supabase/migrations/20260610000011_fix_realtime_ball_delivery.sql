-- ─── Fix: per-ball Realtime delivery ─────────────────────────────────────────
-- Root cause: call_next_balls was a FUNCTION, so all 14 ball inserts ran inside
-- a single long-lived transaction (56 s with pg_sleep). Supabase Realtime uses
-- WAL logical replication, which only fires events AFTER a transaction commits.
-- Result: clients received all 14 balls at once when the transaction finally
-- closed, not one every 4 seconds.
--
-- Fix: rewrite as a PROCEDURE so it can issue an explicit COMMIT after each
-- ball. Each commit triggers one Realtime INSERT event immediately, giving
-- clients real-time per-ball delivery.
--
-- NOTE: cursor-based FOR loops break across COMMITs (the portal is closed on
-- commit). The CTE approach (UPDATE … RETURNING → INSERT) processes all active
-- sessions in a single statement per iteration, avoiding that problem.

-- 1. Drop the old function so the procedure name is unambiguous
drop function if exists public.call_next_balls();

-- 2. Create the procedure with per-ball commits
create or replace procedure public.call_next_balls()
language plpgsql security definer set search_path = public as $$
declare
  i int;
begin
  for i in 1..14 loop

    -- Advance every active session by one ball atomically.
    -- CTE avoids a cursor loop that would break after the first COMMIT.
    with to_call as (
      select id,
             call_index,
             ball_sequence[call_index + 1] as next_ball
      from   public.game_sessions
      where  status = 'active' and call_index < 75
    ),
    bumped as (
      update public.game_sessions gs
      set    call_index = gs.call_index + 1
      from   to_call tc
      where  gs.id          = tc.id
        and  gs.call_index  = tc.call_index   -- optimistic concurrency guard
      returning gs.id,
                tc.call_index  as seq_idx,
                tc.next_ball   as ball_num
    )
    insert into public.game_balls (game_session_id, ball_number, sequence_index)
    select id, ball_num, seq_idx from bumped
    on conflict (game_session_id, sequence_index) do nothing;

    -- Auto-finish any session that just reached 75 balls with no winner,
    -- then create the next waiting session with a sentinel timer.
    with finished as (
      update public.game_sessions
      set    status   = 'finished',
             ended_at = now()
      where  status = 'active'
        and  call_index >= 75
        and  not exists (
               select 1 from public.game_results
               where  game_session_id = game_sessions.id
             )
      returning id, stake_amount
    )
    insert into public.game_sessions (stake_amount, timer_ends_at)
    select stake_amount, now() + interval '1 year'
    from   finished;

    -- *** Commit here so Realtime fires for this ball right now ***
    commit;

    if i < 14 then
      perform pg_sleep(4);
    end if;

  end loop;
end;
$$;

-- 3. Update the cron job — procedures need CALL, not SELECT
select cron.unschedule('call-next-balls');
select cron.schedule(
  'call-next-balls',
  '* * * * *',
  $$CALL public.call_next_balls()$$
);
