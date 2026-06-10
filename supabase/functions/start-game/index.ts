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
    const { session_id } = await req.json() as { session_id: string };
    if (!session_id) return json({ error: "session_id required" }, 400);

    const { data, error } = await admin.rpc("start_game_session", { p_session_id: session_id });

    if (error) throw error;
    if (!data) return json({ error: "Could not start game — timer not yet expired or already started" }, 409);

    // Fetch the newly active session to return its ID (so clients can navigate)
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
