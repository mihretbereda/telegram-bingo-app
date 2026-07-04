import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, json } from "../_shared/cors.ts";

const ADMIN_TELEGRAM_ID = 676350518;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await anon.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const { session_id, slot } = await req.json() as { session_id: string; slot?: 1 | 2 };
    if (!session_id) return json({ error: "session_id required" }, 400);

    // If ghost mode is on and the caller is admin, keep their auto-reserved cartela
    const { data: cfg } = await admin
      .from("admin_config")
      .select("ghost_enabled")
      .eq("id", 1)
      .single();

    if (cfg?.ghost_enabled) {
      const { data: profile } = await admin
        .from("profiles")
        .select("telegram_id")
        .eq("id", user.id)
        .single();
      if (profile?.telegram_id === ADMIN_TELEGRAM_ID) {
        return json({ success: true, skipped: "admin cartela preserved" });
      }
    }

    let query = admin
      .from("cartela_reservations")
      .update({ status: "released" })
      .eq("game_session_id", session_id)
      .eq("user_id", user.id)
      .eq("status", "reserved");

    if (slot !== undefined) query = (query as ReturnType<typeof query.eq>).eq("slot", slot);

    const { error } = await query;
    if (error) throw error;

    // Count distinct users still holding active reservations
    const { data: remaining } = await admin
      .from("cartela_reservations")
      .select("user_id")
      .eq("game_session_id", session_id)
      .eq("status", "reserved");

    const distinctUsers = new Set(remaining?.map((r) => r.user_id) ?? []).size;

    if (distinctUsers < 2) {
      // Not enough players — stop the countdown (reset to sentinel)
      await admin
        .from("game_sessions")
        .update({ timer_ends_at: new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString() })
        .eq("id", session_id)
        .eq("status", "waiting");
    }

    return json({ success: true, players: distinctUsers });
  } catch (err) {
    console.error("release-user-reservations error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
