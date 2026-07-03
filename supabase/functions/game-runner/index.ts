/**
 * game-runner — one instance per game start, runs for up to 55 seconds.
 *
 * Subscribes to a single shared broadcast channel `session-{id}` per active
 * session. All players in a session subscribe to the same channel, so Supabase
 * Realtime sees 2 connections total (one per stake level) regardless of how
 * many players are watching — not 2N.
 *
 * Events broadcast:
 *   ball   — { ball_number, sequence_index, game_session_id }
 *   status — { game_session_id, status: "finished" }  (no-winner end only)
 *
 * Winner result is broadcast by claim-bingo immediately when the claim lands.
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

  // Auto-start any waiting sessions whose countdown has expired
  const { data: expiredSessions } = await admin
    .from("game_sessions")
    .select("id")
    .eq("status", "waiting")
    .lt("timer_ends_at", new Date().toISOString());

  for (const s of expiredSessions ?? []) {
    await admin.rpc("start_game_session", { p_session_id: s.id }).catch(() => {});
  }

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

  type BroadcastChannel = ReturnType<typeof admin.channel>;
  const channelMap = new Map<string, BroadcastChannel>();

  await Promise.all(initialSessions.map((session) =>
    new Promise<void>((resolve) => {
      const timeoutId = setTimeout(() => {
        console.log("[game-runner] channel subscription timeout:", session.id);
        resolve();
      }, 5_000);

      const ch = admin.channel(`session-${session.id}`, {
        config: { broadcast: { ack: false } },
      });

      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeoutId);
          channelMap.set(session.id, ch);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timeoutId);
          resolve();
        }
      });
    })
  ));

  await new Promise<void>((resolve) => setTimeout(resolve, INITIAL_DELAY_MS));

  let prevActiveIds = new Set(initialSessions.map((s) => s.id));

  while (true) {
    if (Date.now() - startTime >= MAX_RUNTIME_MS) break;

    const { data: active } = await admin
      .from("game_sessions")
      .select("id, call_index, ball_sequence")
      .eq("status", "active")
      .lt("call_index", 75);

    const currentActiveIds = new Set((active ?? []).map((s) => s.id));

    // Detect sessions that just left the active set.
    // If there's no game_result, all 75 balls were called with no winner —
    // broadcast status:finished so clients show the no-winner overlay.
    // If a result exists, claim-bingo already broadcast it — nothing to do.
    for (const sessionId of prevActiveIds) {
      if (!currentActiveIds.has(sessionId)) {
        const ch = channelMap.get(sessionId);
        if (!ch) continue;
        const { data: result } = await admin
          .from("game_results")
          .select("id")
          .eq("game_session_id", sessionId)
          .maybeSingle();
        if (!result) {
          await ch.send({
            type:    "broadcast",
            event:   "status",
            payload: { game_session_id: sessionId, status: "finished" },
          });
        }
      }
    }
    prevActiveIds = currentActiveIds;

    if (!active || active.length === 0) break;

    await admin.rpc("call_one_ball");

    for (const session of active) {
      if (!session.ball_sequence) continue;
      const ballNumber = session.ball_sequence[session.call_index];
      if (ballNumber == null) continue;

      const ch = channelMap.get(session.id);
      if (!ch) continue;

      await ch.send({
        type:    "broadcast",
        event:   "ball",
        payload: {
          ball_number:     ballNumber,
          sequence_index:  session.call_index,
          game_session_id: session.id,
        },
      });
    }

    const remaining = MAX_RUNTIME_MS - (Date.now() - startTime);
    if (remaining < CALL_INTERVAL_MS + 500) break;
    await new Promise<void>((resolve) => setTimeout(resolve, CALL_INTERVAL_MS));
  }

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

  // Recreate waiting sessions for any stake level that has no waiting/active session
  for (const stake of [10, 20]) {
    const { data: existing } = await admin
      .from("game_sessions")
      .select("id")
      .eq("stake_amount", stake)
      .in("status", ["waiting", "active"])
      .limit(1);

    if (!existing || existing.length === 0) {
      const { data: newSession } = await admin
        .from("game_sessions")
        .insert({ stake_amount: stake, timer_ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
        .select("id")
        .single();

      if (newSession) {
        fetch(`${SUPABASE_URL}/functions/v1/ghost-join`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ session_id: newSession.id }),
        }).catch(() => {});
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
