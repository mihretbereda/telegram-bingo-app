-- ─── Fix: per-ball timing via Edge Function ──────────────────────────────────
--
-- Problem: the previous approach queued 14 net.http_post calls inside a single
-- long-running transaction (52 s with pg_sleep). pg_net requests are held in
-- net.http_request_queue until the transaction commits, so all 14 fired
-- simultaneously at the end of each minute — same batch behaviour as before.
--
-- Root cause: net.http_post (like any INSERT) is only visible to the pg_net
-- background worker AFTER the enclosing transaction commits. A 52-second
-- function = 52-second transaction = all 14 balls fire at once on commit.
--
-- Fix:
--   • call_next_balls fires exactly ONE net.http_post and returns immediately.
--     Short function → transaction commits in < 10 ms → pg_net sends the
--     request to the game-runner Edge Function almost instantly.
--   • game-runner Edge Function runs a loop: call call_one_ball() via the
--     PostgREST RPC, sleep 4 s, repeat — entirely inside an Edge Function
--     where Deno's setTimeout is a real timer, not blocked by a DB transaction.
--   • Each admin.rpc('call_one_ball') call in the Edge Function is a separate
--     HTTP request → separate PostgREST transaction → commits immediately →
--     Realtime fires one INSERT event per ball. ✓

create or replace function public.call_next_balls()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Skip when no active game needs balls
  if not exists (
    select 1 from public.game_sessions
    where status = 'active' and call_index < 75
  ) then
    return;
  end if;

  -- Fire ONE async request to the game-runner Edge Function, then return.
  -- This function commits in < 10 ms; pg_net sends the HTTP request
  -- immediately after commit.  The Edge Function handles the 4-second loop.
  perform net.http_post(
    url                   := 'https://axhpexgbhallhmyiwqns.supabase.co/functions/v1/game-runner',
    headers               := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4aHBleGdiaGFsbGhteWl3cW5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMTE4OTcsImV4cCI6MjA5NjU4Nzg5N30.4UHJ9LAVzpRTAvnTAI7fAw5SAzd_F9OZP0GbLjCVtCU'
    ),
    body                  := '{}'::jsonb,
    timeout_milliseconds  := 60000    -- Edge Function runs up to 55 s; raise pg_net timeout to match
  );
end;
$$;
