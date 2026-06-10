import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, json } from "../_shared/cors.ts";

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
    const { session_id, cartela_number, slot } = await req.json() as {
      session_id: string;
      cartela_number: number;
      slot: 1 | 2;
    };

    if (!session_id || !cartela_number || !slot) {
      return json({ error: "session_id, cartela_number, and slot are required" }, 400);
    }

    // Verify session is in waiting status
    const { data: session } = await admin
      .from("game_sessions")
      .select("id, stake_amount, timer_ends_at, status")
      .eq("id", session_id)
      .single();

    // Only check status — reservations are valid the entire time the session is
    // waiting, even after timer_ends_at, because there is up to a 60-second gap
    // between timer expiry and the cron job actually starting the game.
    if (!session || session.status !== "waiting") {
      return json({ error: "Session is not accepting reservations" }, 409);
    }

    // Count existing reservations for this user in this session
    const { data: existing } = await admin
      .from("cartela_reservations")
      .select("id, slot")
      .eq("game_session_id", session_id)
      .eq("user_id", user.id)
      .eq("status", "reserved");

    const otherSlot = existing?.find((r) => r.slot !== slot);
    const totalCards = (otherSlot ? 1 : 0) + 1;

    // Check wallet balance for total cards
    const { data: wallet } = await admin
      .from("wallets")
      .select("play_balance")
      .eq("user_id", user.id)
      .single();

    const required = totalCards * session.stake_amount;
    if (!wallet || wallet.play_balance < required) {
      return json({ error: "Insufficient play balance", required, balance: wallet?.play_balance ?? 0 }, 402);
    }

    // Release any existing reservation in this slot
    await admin
      .from("cartela_reservations")
      .update({ status: "released" })
      .eq("game_session_id", session_id)
      .eq("user_id", user.id)
      .eq("slot", slot)
      .eq("status", "reserved");

    // Attempt to reserve the new cartela (unique constraint prevents races)
    const expiresAt = new Date(Date.now() + 70_000).toISOString();
    const { error: insertError } = await admin
      .from("cartela_reservations")
      .insert({
        game_session_id: session_id,
        user_id: user.id,
        cartela_number,
        slot,
        expires_at: expiresAt,
      });

    if (insertError) {
      if (insertError.code === "23505") {
        return json({ error: "Cartela already reserved by another player" }, 409);
      }
      throw insertError;
    }

    return json({ success: true, cartela_number, slot });
  } catch (err) {
    console.error("reserve-cartela error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
