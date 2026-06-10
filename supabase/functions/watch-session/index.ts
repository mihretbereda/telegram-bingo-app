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

    // Insert as watcher — on conflict do nothing (already a participant)
    await admin
      .from("game_participants")
      .insert({ game_session_id: session_id, user_id: user.id, is_watcher: true })
      .onConflict("game_session_id,user_id")
      // @ts-ignore — Supabase JS ignoreMergeConflict
      .ignore();

    return json({ success: true });
  } catch (err) {
    console.error("watch-session error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
