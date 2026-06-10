// One-time bootstrap function — creates waiting sessions if none exist for a stake level.
// Call with POST, no body. Protected by INIT_SECRET env var.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const secret = req.headers.get("x-init-secret");
  if (secret !== Deno.env.get("INIT_SECRET")) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const results: Record<number, string> = {};

    for (const stake of [10, 20]) {
      const { data: existing } = await admin
        .from("game_sessions")
        .select("id")
        .eq("stake_amount", stake)
        .in("status", ["waiting", "active"])
        .limit(1);

      if (existing && existing.length > 0) {
        results[stake] = `already exists: ${existing[0].id}`;
        continue;
      }

      const { data, error } = await admin
        .from("game_sessions")
        .insert({ stake_amount: stake, timer_ends_at: new Date(Date.now() + 60_000).toISOString() })
        .select("id")
        .single();

      if (error) throw error;
      results[stake] = `created: ${data.id}`;
    }

    return json({ success: true, results });
  } catch (err) {
    console.error("init-sessions error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
