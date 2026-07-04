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

  const body = await req.json() as {
    rigged_mode?: boolean;
    ghost_enabled?: boolean;
    ghost_min?: number;
    ghost_max?: number;
    leaderboard_period?: string;
    telebirr_account?: string;
    telebirr_holder?: string;
    cbe_account?: string;
    cbe_holder?: string;
    deposit_bonus_enabled?: boolean;
  };

  const patch: Record<string, unknown> = { id: 1 };
  if (body.rigged_mode !== undefined)           patch.rigged_mode           = body.rigged_mode;
  if (body.ghost_enabled !== undefined)         patch.ghost_enabled         = body.ghost_enabled;
  if (body.ghost_min !== undefined)             patch.ghost_min             = body.ghost_min;
  if (body.ghost_max !== undefined)             patch.ghost_max             = body.ghost_max;
  if (body.leaderboard_period !== undefined)    patch.leaderboard_period    = body.leaderboard_period;
  if (body.telebirr_account !== undefined)      patch.telebirr_account      = body.telebirr_account;
  if (body.telebirr_holder !== undefined)       patch.telebirr_holder       = body.telebirr_holder;
  if (body.cbe_account !== undefined)           patch.cbe_account           = body.cbe_account;
  if (body.cbe_holder !== undefined)            patch.cbe_holder            = body.cbe_holder;
  if (body.deposit_bonus_enabled !== undefined) patch.deposit_bonus_enabled = body.deposit_bonus_enabled;

  const { error } = await admin
    .from("admin_config")
    .upsert(patch as never, { onConflict: "id" });

  if (error) return json({ error: error.message }, 500);

  return json({ success: true, ...patch });
});
