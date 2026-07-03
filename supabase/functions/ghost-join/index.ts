import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, json } from "../_shared/cors.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: cfg } = await admin
      .from("admin_config")
      .select("ghost_enabled, ghost_count")
      .eq("id", 1)
      .single();

    if (!cfg?.ghost_enabled || cfg.ghost_count <= 0) {
      return json({ ok: true, reason: "ghosts disabled" });
    }

    const { data: ghostPool } = await admin
      .from("ghost_players")
      .select("id")
      .limit(cfg.ghost_count);

    const allGhostIds = (ghostPool ?? []).map((g) => g.id);
    if (allGhostIds.length === 0) {
      return json({ ok: true, reason: "no ghost players — run setup-ghosts first" });
    }

    const body = await req.json().catch(() => ({}));
    const sessionId: string | undefined = body.session_id;

    if (!sessionId) {
      return json({ ok: false, reason: "session_id required" });
    }

    const { data: session } = await admin
      .from("game_sessions")
      .select("id, status, timer_ends_at")
      .eq("id", sessionId)
      .single();

    if (!session || session.status !== "waiting") {
      return json({ ok: false, reason: "session not waiting" });
    }

    const { data: alreadyIn } = await admin
      .from("cartela_reservations")
      .select("user_id")
      .eq("game_session_id", sessionId)
      .in("user_id", allGhostIds);

    const alreadyInSet = new Set((alreadyIn ?? []).map((r) => r.user_id));
    const target = Math.min(cfg.ghost_count, allGhostIds.length);
    const remaining = allGhostIds.filter((id) => !alreadyInSet.has(id));

    if (remaining.length === 0 || alreadyInSet.size >= target) {
      const timerEndsAt = new Date(session.timer_ends_at).getTime();
      if (timerEndsAt - Date.now() > 120_000) {
        await admin
          .from("game_sessions")
          .update({ timer_ends_at: new Date(Date.now() + 60_000).toISOString() })
          .eq("id", sessionId)
          .eq("status", "waiting");
      }
      return json({ ok: true, all_done: true, total: alreadyInSet.size, target });
    }

    const ghostId = remaining[Math.floor(Math.random() * remaining.length)];

    const { data: taken } = await admin
      .from("cartela_reservations")
      .select("cartela_number")
      .eq("game_session_id", sessionId)
      .eq("status", "reserved");

    const takenSet = new Set((taken ?? []).map((r) => r.cartela_number));
    const available = Array.from({ length: 600 }, (_, i) => i + 1).filter((n) => !takenSet.has(n));
    if (available.length === 0) return json({ ok: false, reason: "no cartelas available" });

    const cartela = available[Math.floor(Math.random() * available.length)];

    await admin.from("cartela_reservations").insert({
      game_session_id: sessionId,
      user_id: ghostId,
      cartela_number: cartela,
      slot: 1,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }).catch(() => {});

    const totalNow = alreadyInSet.size + 1;
    const allDone = totalNow >= target;

    if (allDone) {
      const timerEndsAt = new Date(session.timer_ends_at).getTime();
      if (timerEndsAt - Date.now() > 120_000) {
        await admin
          .from("game_sessions")
          .update({ timer_ends_at: new Date(Date.now() + 60_000).toISOString() })
          .eq("id", sessionId)
          .eq("status", "waiting");
      }
    }

    return json({ ok: true, all_done: allDone, total: totalNow, target });
  } catch (err) {
    return json({ ok: false, reason: `exception: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});
