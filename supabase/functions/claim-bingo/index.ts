import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, json } from "../_shared/cors.ts";
import { generateCartela, getWinPattern, verifyPattern } from "../_shared/bingo.ts";

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
    const { session_id, cartela_id, pattern_name } = await req.json() as {
      session_id: string;
      cartela_id: number;
      pattern_name?: string;
    };
    if (!session_id || !cartela_id) {
      return json({ error: "session_id and cartela_id required" }, 400);
    }

    // Verify session is active and has no winner yet
    const { data: session } = await admin
      .from("game_sessions")
      .select("id, status, prize_pool, call_index")
      .eq("id", session_id)
      .single();

    if (!session || session.status !== "active") {
      return json({ error: "Game is not active" }, 409);
    }

    // Check no winner yet
    const { data: existingResult } = await admin
      .from("game_results")
      .select("id")
      .eq("game_session_id", session_id)
      .single();

    if (existingResult) {
      return json({ error: "Game already has a winner" }, 409);
    }

    // Verify the claimant is a non-watcher participant with this cartela
    const { data: participant } = await admin
      .from("game_participants")
      .select("cartela_1, cartela_2, is_watcher")
      .eq("game_session_id", session_id)
      .eq("user_id", user.id)
      .single();

    if (!participant || participant.is_watcher) {
      return json({ error: "Not an active participant" }, 403);
    }
    if (participant.cartela_1 !== cartela_id && participant.cartela_2 !== cartela_id) {
      return json({ error: "Cartela does not belong to this participant" }, 403);
    }

    // Fetch all called balls (authoritative server state)
    const { data: balls } = await admin
      .from("game_balls")
      .select("ball_number")
      .eq("game_session_id", session_id)
      .order("sequence_index", { ascending: true });

    const calledSet = new Set((balls ?? []).map((b) => b.ball_number));

    // Generate the cartela and determine the winning pattern.
    // Prefer the client's claimed pattern (matches what the winner saw) if it
    // verifies as valid server-side. Fall back to server re-detection only if
    // the claim is absent or invalid.
    const card = generateCartela(cartela_id);
    let patternName: string;
    if (pattern_name && verifyPattern(pattern_name, card, calledSet)) {
      patternName = pattern_name;
    } else {
      const result = getWinPattern(card, calledSet);
      if (!result) {
        return json({ error: "No winning pattern found — not a valid bingo" }, 422);
      }
      patternName = result.name;
    }

    // Atomically record winner, update session, credit prize
    const { data: won, error: rpcError } = await admin.rpc("process_winner", {
      p_session_id:   session_id,
      p_user_id:      user.id,
      p_cartela_id:   cartela_id,
      p_pattern:      patternName,
      p_prize:        session.prize_pool,
      p_balls_called: calledSet.size,
    });

    if (rpcError) throw rpcError;

    if (!won) {
      return json({ error: "Another player claimed bingo first" }, 409);
    }

    return json({
      success: true,
      pattern: patternName,
      prize: session.prize_pool,
      balls_called: calledSet.size,
    });
  } catch (err) {
    console.error("claim-bingo error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
