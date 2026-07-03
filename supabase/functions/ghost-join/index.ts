import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, json } from "../_shared/cors.ts";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Config check
  const { data: cfg } = await admin
    .from("admin_config")
    .select("ghost_enabled, ghost_count")
    .eq("id", 1)
    .single();

  if (!cfg?.ghost_enabled || cfg.ghost_count <= 0) {
    return json({ ok: true, reason: "ghosts disabled" });
  }

  // Optional specific session_id in body
  let targetSessionIds: string[] = [];
  try {
    const body = await req.json().catch(() => ({}));
    if (body.session_id) targetSessionIds = [body.session_id];
  } catch (_) { /* no body */ }

  // Ghost pool (shuffled)
  const { data: ghostPool } = await admin
    .from("ghost_players")
    .select("id")
    .limit(cfg.ghost_count);

  const allGhostIds = (ghostPool ?? []).map((g) => g.id);
  if (allGhostIds.length === 0) return json({ ok: true, reason: "no ghost players set up — run setup-ghosts first" });

  // Find which waiting sessions need ghosts
  if (targetSessionIds.length === 0) {
    const { data: sessions } = await admin
      .from("game_sessions")
      .select("id")
      .eq("status", "waiting");

    if (!sessions?.length) return json({ ok: true, reason: "no waiting sessions" });

    for (const session of sessions) {
      const { count } = await admin
        .from("cartela_reservations")
        .select("id", { count: "exact", head: true })
        .eq("game_session_id", session.id)
        .in("user_id", allGhostIds);

      if ((count ?? 0) === 0) targetSessionIds.push(session.id);
    }
  }

  if (targetSessionIds.length === 0) {
    return json({ ok: true, reason: "all waiting sessions already have ghost players" });
  }

  // Inject ghosts into each session in the background
  const injectIntoSession = async (sessionId: string) => {
    // Shuffle ghost IDs so each session gets a different random set
    const shuffled = [...allGhostIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Find available cartela numbers
    const { data: taken } = await admin
      .from("cartela_reservations")
      .select("cartela_number")
      .eq("game_session_id", sessionId)
      .eq("status", "reserved");

    const takenSet = new Set((taken ?? []).map((r) => r.cartela_number));
    const available = Array.from({ length: 600 }, (_, i) => i + 1).filter((n) => !takenSet.has(n));

    // Shuffle available cartellas
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }

    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    for (let i = 0; i < shuffled.length && i < available.length; i++) {
      // Random delay between each ghost: 1–3 seconds for natural feel
      if (i > 0) {
        const delay = 1000 + Math.floor(Math.random() * 2000);
        await new Promise<void>((r) => setTimeout(r, delay));
      }

      // Verify session is still waiting before each join
      const { data: session } = await admin
        .from("game_sessions")
        .select("id, status, timer_ends_at")
        .eq("id", sessionId)
        .single();

      if (!session || session.status !== "waiting") break;

      await admin.from("cartela_reservations").insert({
        game_session_id: sessionId,
        user_id: shuffled[i],
        cartela_number: available[i],
        slot: 1,
        expires_at,
      }).catch(() => {}); // ignore duplicate if ghost already reserved
    }

    // After all ghosts have joined, start the 60-second countdown
    const { data: sessionFinal } = await admin
      .from("game_sessions")
      .select("status, timer_ends_at")
      .eq("id", sessionId)
      .single();

    if (sessionFinal?.status === "waiting") {
      const timerEndsAt = new Date(sessionFinal.timer_ends_at).getTime();
      const countdownRunning = timerEndsAt - Date.now() <= 120_000;
      if (!countdownRunning) {
        await admin
          .from("game_sessions")
          .update({ timer_ends_at: new Date(Date.now() + 60_000).toISOString() })
          .eq("id", sessionId)
          .eq("status", "waiting");
      }
    }
  };

  // Run all session injections, keep function alive after response
  const work = Promise.all(targetSessionIds.map((id) => injectIntoSession(id)));
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(work);
  else work.catch(console.error);

  return json({ ok: true, sessions: targetSessionIds.length, ghosts: allGhostIds.length });
});
