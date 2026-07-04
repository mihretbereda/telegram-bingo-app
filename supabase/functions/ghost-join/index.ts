import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, json } from "../_shared/cors.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_TELEGRAM_ID = 676350518;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: cfg } = await admin
      .from("admin_config")
      .select("ghost_enabled, ghost_min, ghost_max")
      .eq("id", 1)
      .single();

    if (!cfg?.ghost_enabled || (cfg.ghost_max ?? 0) <= 0) {
      return json({ ok: true, reason: "ghosts disabled" });
    }

    const { data: ghostPool } = await admin
      .from("ghost_players")
      .select("id")
      .limit(cfg.ghost_max ?? 100);

    const allGhostIds = (ghostPool ?? []).map((g) => g.id);
    if (allGhostIds.length === 0) {
      return json({ ok: true, reason: "no ghost players — run setup-ghosts first" });
    }

    const body = await req.json().catch(() => ({}));
    let sessionId: string | undefined = body.session_id;

    // No session_id (pg_cron) — find a waiting session that still needs ghosts
    if (!sessionId) {
      const { data: sessions } = await admin
        .from("game_sessions")
        .select("id")
        .eq("status", "waiting");

      for (const s of sessions ?? []) {
        const { count } = await admin
          .from("cartela_reservations")
          .select("id", { count: "exact", head: true })
          .eq("game_session_id", s.id)
          .in("user_id", allGhostIds);
        if ((count ?? 0) < cfg.ghost_count) { sessionId = s.id; break; }
      }

      if (!sessionId) return json({ ok: true, reason: "all sessions already have ghosts" });
    }

    const { data: session } = await admin
      .from("game_sessions")
      .select("id, status, timer_ends_at, next_ghost_at, ghost_fill_started_at, ghost_target")
      .eq("id", sessionId)
      .single();

    if (!session || session.status !== "waiting") {
      return json({ ok: false, reason: "session not waiting" });
    }

    // Auto-reserve a cartela for admin if they don't have one yet in this session
    try {
      const { data: adminProf } = await admin
        .from("profiles")
        .select("id")
        .eq("telegram_id", ADMIN_TELEGRAM_ID)
        .single();
      if (adminProf) {
        const { count: adminHas } = await admin
          .from("cartela_reservations")
          .select("id", { count: "exact", head: true })
          .eq("game_session_id", sessionId)
          .eq("user_id", adminProf.id)
          .eq("status", "reserved");
        if ((adminHas ?? 0) === 0) {
          const { data: nowTaken } = await admin
            .from("cartela_reservations")
            .select("cartela_number")
            .eq("game_session_id", sessionId)
            .eq("status", "reserved");
          const nowTakenSet = new Set((nowTaken ?? []).map((r) => r.cartela_number));
          const freeNums = Array.from({ length: 600 }, (_, i) => i + 1).filter((n) => !nowTakenSet.has(n));
          if (freeNums.length > 0) {
            const pick = freeNums[Math.floor(Math.random() * freeNums.length)];
            await admin.from("cartela_reservations").insert({
              game_session_id: sessionId,
              user_id: adminProf.id,
              cartela_number: pick,
              slot: 1,
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            });
          }
        }
      }
    } catch (_) { /* best-effort */ }

    // First call for this session — initialise the schedule and pick a random target
    if (!session.ghost_fill_started_at) {
      const now = new Date().toISOString();
      const gMin = cfg.ghost_min ?? 1;
      const gMax = cfg.ghost_max ?? 100;
      const picked = gMin + Math.floor(Math.random() * (gMax - gMin + 1));
      const ghostTarget = Math.min(picked, allGhostIds.length);
      await admin
        .from("game_sessions")
        .update({ ghost_fill_started_at: now, next_ghost_at: now, ghost_target: ghostTarget })
        .eq("id", sessionId);
      session.ghost_fill_started_at = now;
      session.next_ghost_at = now;
      session.ghost_target = ghostTarget;
    }

    // Server-side rate limit — not yet time for the next ghost
    if (session.next_ghost_at && new Date(session.next_ghost_at).getTime() > Date.now()) {
      return json({ ok: true, reason: "rate_limited", next_at: session.next_ghost_at });
    }

    // Resume after pause — shift ghost_fill_started_at forward by however long nobody was watching
    // so the remaining 60s budget is preserved exactly where it left off
    if (session.next_ghost_at && session.ghost_fill_started_at) {
      const pausedMs = Date.now() - new Date(session.next_ghost_at).getTime();
      if (pausedMs > 0) {
        const shiftedStart = new Date(
          new Date(session.ghost_fill_started_at).getTime() + pausedMs
        ).toISOString();
        await admin
          .from("game_sessions")
          .update({ ghost_fill_started_at: shiftedStart })
          .eq("id", sessionId);
        session.ghost_fill_started_at = shiftedStart;
      }
    }

    const { data: alreadyIn } = await admin
      .from("cartela_reservations")
      .select("user_id")
      .eq("game_session_id", sessionId)
      .in("user_id", allGhostIds);

    const alreadyInSet = new Set((alreadyIn ?? []).map((r) => r.user_id));
    const target = session.ghost_target ?? Math.min(cfg.ghost_min ?? 1, allGhostIds.length);
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
    });

    const totalNow = alreadyInSet.size + 1;
    const allDone = totalNow >= target;

    if (!allDone) {
      // Schedule next ghost at a random time, guaranteeing all remaining fit within 60s
      const fillStart = new Date(session.ghost_fill_started_at).getTime();
      const elapsed = (Date.now() - fillStart) / 1000;
      const timeRemaining = Math.max(0, 60 - elapsed);
      const ghostsRemaining = target - totalNow;

      let nextIntervalMs: number;
      if (ghostsRemaining <= 0 || timeRemaining <= 0) {
        nextIntervalMs = 0;
      } else {
        const avg = (timeRemaining / ghostsRemaining) * 1000;
        const min = Math.max(300, avg * 0.5);
        const max = Math.min(avg * 1.5, (timeRemaining / ghostsRemaining) * 1000);
        nextIntervalMs = min + Math.random() * Math.max(0, max - min);
      }

      await admin
        .from("game_sessions")
        .update({ next_ghost_at: new Date(Date.now() + nextIntervalMs).toISOString() })
        .eq("id", sessionId);
    }

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
    return json({ ok: false, reason: `exception: ${err instanceof Error ? err.message : String(err)}` });
  }
});
