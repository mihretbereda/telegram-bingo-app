/**
 * game-runner — called by start_game_session via net.http_post once per game start.
 *
 * For every active session it:
 *   1. Calls call_one_ball() via RPC (inserts into game_balls, advances call_index).
 *   2. Immediately broadcasts the called ball to all players in that session via
 *      Supabase Broadcast REST API — one HTTP call fans out to all subscribers
 *      with no per-subscriber Postgres WAL overhead.
 *   3. Sleeps CALL_INTERVAL_MS then repeats until ~55 s elapsed.
 *
 * The useGameBalls 5-second poll on the client remains the fallback for any ball
 * a player misses due to reconnection — the database is always the source of truth.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_RUNTIME_MS   = 55_000;
const INITIAL_DELAY_MS = 6_000;
const CALL_INTERVAL_MS = 5_000;

Deno.serve(async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const startTime = Date.now();

  await new Promise<void>((resolve) => setTimeout(resolve, INITIAL_DELAY_MS));

  while (true) {
    if (Date.now() - startTime >= MAX_RUNTIME_MS) break;

    // Fetch all active sessions with their current call_index so we know
    // exactly which sequence_index was just written after call_one_ball fires.
    const { data: active } = await admin
      .from("game_sessions")
      .select("id, call_index")
      .eq("status", "active")
      .lt("call_index", 75);

    if (!active || active.length === 0) break;

    // Advance one ball for every active session in a single DB transaction.
    await admin.rpc("call_one_ball");

    // For each session, read the ball that was just inserted and broadcast it
    // to all players in that session. All messages go out in one HTTP call.
    const messages: { topic: string; event: string; payload: unknown }[] = [];

    for (const session of active) {
      const { data: ball } = await admin
        .from("game_balls")
        .select("id, ball_number, sequence_index, called_at, game_session_id")
        .eq("game_session_id", session.id)
        .eq("sequence_index", session.call_index)
        .maybeSingle();

      if (ball) {
        messages.push({
          topic:   `realtime:session-balls-${session.id}`,
          event:   "ball",
          payload: ball,
        });
      }
    }

    if (messages.length > 0) {
      const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey":        SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ messages }),
      });
      console.log("[game-runner] broadcast status:", res.status, "balls:", messages.map((m) => (m.payload as Record<string, unknown>).ball_number));
    }

    const remaining = MAX_RUNTIME_MS - (Date.now() - startTime);
    if (remaining < CALL_INTERVAL_MS + 500) break;
    await new Promise<void>((resolve) => setTimeout(resolve, CALL_INTERVAL_MS));
  }

  // Final sweep: close sessions where all 75 balls were called but nobody won.
  const { data: exhausted } = await admin
    .from("game_sessions")
    .select("id")
    .eq("status", "active")
    .eq("call_index", 75);

  for (const session of exhausted ?? []) {
    const { data: existingResult } = await admin
      .from("game_results")
      .select("id")
      .eq("game_session_id", session.id)
      .maybeSingle();

    if (!existingResult) {
      await admin
        .from("game_sessions")
        .update({ status: "finished", ended_at: new Date().toISOString() })
        .eq("id", session.id)
        .eq("status", "active");
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
