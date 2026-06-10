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
    const { session_id, slot } = await req.json() as { session_id: string; slot?: 1 | 2 };
    if (!session_id) return json({ error: "session_id required" }, 400);

    let query = admin
      .from("cartela_reservations")
      .update({ status: "released" })
      .eq("game_session_id", session_id)
      .eq("user_id", user.id)
      .eq("status", "reserved");

    if (slot !== undefined) query = (query as ReturnType<typeof query.eq>).eq("slot", slot);

    const { error } = await query;

    if (error) throw error;

    return json({ success: true });
  } catch (err) {
    console.error("release-user-reservations error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
