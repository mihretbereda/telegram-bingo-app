import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, json } from "../_shared/cors.ts";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
        if ((count ?? 0) < (cfg.ghost_max ?? 100)) { sessionId = s.id; break; }
      }

      if (!sessionId) return json({ ok: true, reason: "all sessions already have ghosts" });
    }

    const { data: session } = await admin
      .from("game_sessions")
      .select("id, status, timer_ends_at, next_ghost_at, ghost_fill_started_at, ghost_target, last_watcher_at")
      .eq("id", sessionId)
      .single();

    if (!session || session.status !== "waiting") {
      return json({ ok: false, reason: "session not waiting" });
    }

    // Heartbeat — always update last_watcher_at so the cron can tell someone is watching.
    // We capture gap info here but defer the actual timer shift until after we know
    // whether all ghosts are done (if they are, the game should start — not be postponed).
    const prevLastWatcher = (session as Record<string, unknown>).last_watcher_at as string | null;
    const nowMs = Date.now();
    await admin
      .from("game_sessions")
      .update({ last_watcher_at: new Date(nowMs).toISOString() } as Record<string, unknown>)
      .eq("id", sessionId);

    const timerEndsAtMs = new Date(session.timer_ends_at).getTime();
    const countdownLive = timerEndsAtMs - nowMs <= 120_000;
    const gapMs = prevLastWatcher ? nowMs - new Date(prevLastWatcher).getTime() : 0;
    const hasGap = countdownLive && gapMs > 5_000;

    // Auto-reserve a cartela for admin if they don't have one yet
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

    // First call — initialise schedule and pick a random target
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

    // Server-side rate limit
    if (session.next_ghost_at && new Date(session.next_ghost_at).getTime() > Date.now()) {
      return json({ ok: true, reason: "rate_limited", next_at: session.next_ghost_at });
    }

    const countdownRunning = timerEndsAtMs - Date.now() <= 120_000;

    // Pause/resume: shift fill clock before countdown starts
    if (!countdownRunning && session.next_ghost_at && session.ghost_fill_started_at) {
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
      // All ghosts done — do NOT shift the timer here.
      // The game should start now, not be postponed.
      if (!countdownRunning) {
        const { data: allRes } = await admin
          .from("cartela_reservations")
          .select("user_id")
          .eq("game_session_id", sessionId)
          .eq("status", "reserved");
        const distinctTotal = new Set((allRes ?? []).map((r) => r.user_id)).size;
        if (distinctTotal >= 2) {
          await admin
            .from("game_sessions")
            .update({ timer_ends_at: new Date(Date.now() + 60_000).toISOString() })
            .eq("id", sessionId)
            .eq("status", "waiting");
        }
      }
      return json({ ok: true, all_done: true, total: alreadyInSet.size, target });
    }

    // Ghosts still need adding — now safe to shift the timer if there was a watcher gap
    let effectiveTimerEnd = timerEndsAtMs;
    if (hasGap) {
      effectiveTimerEnd = timerEndsAtMs + gapMs;
      await admin
        .from("game_sessions")
        .update({ timer_ends_at: new Date(effectiveTimerEnd).toISOString() })
        .eq("id", sessionId)
        .eq("status", "waiting");
      session.timer_ends_at = new Date(effectiveTimerEnd).toISOString();
    }

    // Pick one ghost and one cartela
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

    // Count ALL distinct users after this add
    const { data: allReserved } = await admin
      .from("cartela_reservations")
      .select("user_id")
      .eq("game_session_id", sessionId)
      .eq("status", "reserved");
    const distinctTotal = new Set((allReserved ?? []).map((r) => r.user_id)).size;

    // Start countdown when 2+ distinct players are in
    const nowCountdownRunning = effectiveTimerEnd - Date.now() <= 120_000;

    if (distinctTotal >= 2 && !nowCountdownRunning) {
      effectiveTimerEnd = Date.now() + 60_000;
      await admin
        .from("game_sessions")
        .update({
          timer_ends_at: new Date(effectiveTimerEnd).toISOString(),
          ghost_fill_started_at: new Date().toISOString(),
        })
        .eq("id", sessionId)
        .eq("status", "waiting");
    }

    let nextCallInMs = 2_000;
    if (!allDone) {
      const ghostsRemaining = target - totalNow;
      const timeRemainingMs = (distinctTotal >= 2 || nowCountdownRunning)
        ? Math.max(500, effectiveTimerEnd - Date.now())
        : 60_000;
      const avgMs = timeRemainingMs / ghostsRemaining;
      const minMs = Math.max(300, avgMs * 0.5);
      const maxMs = avgMs * 0.9;
      nextCallInMs = Math.round(minMs + Math.random() * (maxMs - minMs));

      await admin
        .from("game_sessions")
        .update({ next_ghost_at: new Date(Date.now() + nextCallInMs).toISOString() })
        .eq("id", sessionId);
    }

    return json({ ok: true, all_done: allDone, total: totalNow, target, next_call_in_ms: nextCallInMs });
  } catch (err) {
    return json({ ok: false, reason: `exception: ${err instanceof Error ? err.message : String(err)}` });
  }
});
