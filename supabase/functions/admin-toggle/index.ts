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

  if (user.user_metadata?.telegram_id !== ADMIN_TELEGRAM_ID) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { rigged_mode } = await req.json() as { rigged_mode: boolean };

  const { error } = await admin
    .from("admin_config")
    .upsert({ id: 1, rigged_mode }, { onConflict: "id" });

  if (error) return json({ error: error.message }, 500);

  return json({ success: true, rigged_mode });
});
