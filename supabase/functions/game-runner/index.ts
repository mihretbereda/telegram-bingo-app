/**
 * game-runner — called by pg_cron once per minute via call_next_balls().
 *
 * Runs a ball-calling loop for all active game sessions:
 *   • Calls call_one_ball() via PostgREST RPC — each call is its own
 *     auto-committed transaction, so Supabase Realtime fires one INSERT
 *     event per ball, giving clients real-time per-ball delivery.
 *   • Sleeps 4 seconds between calls using Deno's setTimeout.
 *   • Stops when there are no more active sessions or when ~55 s have
 *     elapsed (to stay within the 60 s Edge Function timeout).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_RUNTIME_MS    = 55_000; // leave 5 s buffer before the 60 s timeout
const CALL_INTERVAL_MS  = 4_000;

Deno.serve(async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const startTime = Date.now();

  while (true) {
    // Stop if we are too close to the timeout
    const elapsed = Date.now() - startTime;
    if (elapsed >= MAX_RUNTIME_MS) break;

    // Check whether any active session still has balls to call
    const { data: active } = await admin
      .from("game_sessions")
      .select("id")
      .eq("status", "active")
      .lt("call_index", 75)
      .limit(1);

    if (!active || active.length === 0) break;

    // Call the next ball for every active session.
    // call_one_ball() runs entirely in one PostgREST transaction that commits
    // immediately → WAL record → Realtime INSERT event for each ball.
    await admin.rpc("call_one_ball");

    // Sleep only if there is enough time for another full iteration
    const remaining = MAX_RUNTIME_MS - (Date.now() - startTime);
    if (remaining < CALL_INTERVAL_MS + 500) break; // 500 ms safety margin
    await new Promise<void>((resolve) => setTimeout(resolve, CALL_INTERVAL_MS));
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
