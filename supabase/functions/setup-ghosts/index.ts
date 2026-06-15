import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, json } from "../_shared/cors.ts";

const ADMIN_TELEGRAM_ID = 676350518;

const GHOST_PROFILES = [
  { first_name: "Abebe",  last_name: "Girma",    username: "abebe_g"  },
  { first_name: "Tigist", last_name: "Bekele",   username: "tigist_b" },
  { first_name: "Dawit",  last_name: "Haile",    username: "dawit_h"  },
  { first_name: "Meron",  last_name: "Tadesse",  username: "meron_t"  },
  { first_name: "Yonas",  last_name: "Alemu",    username: "yonas_a"  },
  { first_name: "Selam",  last_name: "Tesfaye",  username: "selam_t"  },
  { first_name: "Biruk",  last_name: "Mengistu", username: "biruk_m"  },
  { first_name: "Hana",   last_name: "Wolde",    username: "hana_w"   },
];

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
  if (!user || user.user_metadata?.telegram_id !== ADMIN_TELEGRAM_ID) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const created: string[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < GHOST_PROFILES.length; i++) {
    const p = GHOST_PROFILES[i];
    const email = `ghost_${i + 1}@nova-bingo.internal`;
    const telegramId = -(i + 1); // negative fake IDs never clash with real Telegram IDs

    // Idempotent: skip if already set up
    const { data: existing } = await admin
      .from("ghost_players")
      .select("id")
      .eq("username", p.username)
      .maybeSingle();

    if (existing) {
      skipped.push(p.username);
      continue;
    }

    // Create auth user
    const { data: userData, error: createError } = await admin.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: {
        telegram_id: telegramId,
        first_name: p.first_name,
        last_name: p.last_name,
        username: p.username,
      },
    });

    if (createError || !userData?.user) {
      console.error(`Failed to create ghost ${p.username}:`, createError);
      continue;
    }

    const userId = userData.user.id;

    // Profile row
    await admin.from("profiles").upsert({
      id: userId,
      telegram_id: telegramId,
      first_name: p.first_name,
      last_name: p.last_name,
      username: p.username,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

    // Fund wallet — play_balance is what gets staked
    await admin.from("wallets").upsert({
      user_id: userId,
      play_balance: 1_000_000,
      main_balance: 0,
    }, { onConflict: "user_id" });

    // Register in ghost_players pool
    await admin.from("ghost_players").insert({
      id: userId,
      name: `${p.first_name} ${p.last_name}`,
      username: p.username,
    });

    created.push(p.username);
  }

  return json({ success: true, created, skipped });
});
