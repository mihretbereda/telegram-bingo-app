/**
 * game-runner — called by start_game_session via net.http_post once per game start.
 *
 * Subscribes to a Supabase Realtime broadcast channel for each active session,
 * then pushes each called ball directly via channel.send(). This is the correct
 * server-to-client broadcast pattern — the REST /api/broadcast endpoint only
 * queues messages (202) and does not fan-out to channel subscribers.
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

  // Fetch active sessions upfront so we can subscribe to their channels
  // before the initial delay burns off.
  const { data: initialSessions } = await admin
    .from("game_sessions")
    .select("id, call_index, ball_sequence")
    .eq("status", "active")
    .lt("call_index", 75);

  if (!initialSessions || initialSessions.length === 0) {
    return new Response(JSON.stringify({ ok: true, reason: "no active sessions" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Subscribe to a broadcast channel for each session.
  // channel.send() requires SUBSCRIBED status before it can deliver messages.
  type BroadcastChannel = ReturnType<typeof admin.channel>;
  const channelMap = new Map<string, BroadcastChannel>();

  await Promise.all(initialSessions.map((session) =>
    new Promise<void>((resolve) => {
      const timeoutId = setTimeout(() => {
        console.log("[game-runner] channel subscription timeout:", session.id);
        resolve();
      }, 5_000);

      const ch = admin.channel(`session-balls-${session.id}`, {
        config: { broadcast: { ack: false } },
      });

      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeoutId);
          channelMap.set(session.id, ch);
          console.log("[game-runner] channel subscribed:", session.id);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timeoutId);
          console.log("[game-runner] channel error:", status, session.id);
          resolve();
        }
      });
    })
  ));

  // Wait before the first ball so clients have time to reach the game page.
  await new Promise<void>((resolve) => setTimeout(resolve, INITIAL_DELAY_MS));

  while (true) {
    if (Date.now() - startTime >= MAX_RUNTIME_MS) break;

    const { data: active } = await admin
      .from("game_sessions")
      .select("id, call_index, ball_sequence")
      .eq("status", "active")
      .lt("call_index", 75);

    if (!active || active.length === 0) break;

    // Advance one ball for every active session.
    await admin.rpc("call_one_ball");

    // Broadcast each ball via the SDK channel — guaranteed fan-out to subscribers.
    for (const session of active) {
      if (!session.ball_sequence) continue;
      const ballNumber = session.ball_sequence[session.call_index];
      if (ballNumber == null) continue;

      const ch = channelMap.get(session.id);
      if (!ch) {
        console.log("[game-runner] no channel for session:", session.id);
        continue;
      }

      const sendStatus = await ch.send({
        type:    "broadcast",
        event:   "ball",
        payload: {
          ball_number:     ballNumber,
          sequence_index:  session.call_index,
          game_session_id: session.id,
        },
      });

      console.log(
        "[game-runner] sent ball", ballNumber,
        "seq", session.call_index,
        "session", session.id,
        "status", sendStatus,
      );
    }

    const remaining = MAX_RUNTIME_MS - (Date.now() - startTime);
    if (remaining < CALL_INTERVAL_MS + 500) break;
    await new Promise<void>((resolve) => setTimeout(resolve, CALL_INTERVAL_MS));
  }

  // Clean up channels.
  for (const ch of channelMap.values()) {
    await admin.removeChannel(ch);
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
