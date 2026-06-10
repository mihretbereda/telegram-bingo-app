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
    const { session_id, auto_mode } = await req.json() as { session_id: string; auto_mode: boolean };
    if (!session_id || typeof auto_mode !== "boolean") {
      return json({ error: "session_id and auto_mode required" }, 400);
    }

    const { error } = await admin
      .from("game_participants")
      .update({ auto_mode })
      .eq("game_session_id", session_id)
      .eq("user_id", user.id);

    if (error) throw error;

    return json({ success: true, auto_mode });
  } catch (err) {
    console.error("set-auto-mode error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
