import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { initData } = await req.json() as { initData: string };

    if (!initData) {
      return json({ error: "initData is required" }, 400);
    }

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN secret is not set");

    // ── 1. Verify Telegram HMAC ───────────────────────────────────────────────
    const isValid = await verifyInitData(initData, botToken);
    if (!isValid) {
      return json({ error: "Invalid initData signature" }, 401);
    }

    // ── 2. Parse the verified user object ─────────────────────────────────────
    const params = new URLSearchParams(initData);
    const userJson = params.get("user");
    if (!userJson) return json({ error: "No user in initData" }, 400);

    const tgUser = JSON.parse(userJson) as {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
    };

    // ── 3. Upsert the Supabase auth user ─────────────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const email = `tg_${tgUser.id}@telegram.local`;
    const userMeta = {
      telegram_id: tgUser.id,
      first_name: tgUser.first_name,
      last_name: tgUser.last_name ?? null,
      username: tgUser.username ?? null,
      photo_url: tgUser.photo_url ?? null,
    };

    // createUser is idempotent — silently continues if user already exists
    await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: userMeta,
    });

    // ── 4. Generate a magic-link token and exchange it for a session ──────────
    // generateLink always returns the user object regardless of whether
    // the user was just created or already existed
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError) throw linkError;

    const userId = linkData.user.id;

    const actionLink = linkData.properties.action_link;
    const token = new URL(actionLink).searchParams.get("token");
    if (!token) throw new Error("Could not extract token from magic link");

    const verifyRes = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/auth/v1/verify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
        },
        body: JSON.stringify({ token, type: "magiclink" }),
      },
    );

    const session = await verifyRes.json() as {
      access_token: string;
      refresh_token: string;
      error?: string;
    };

    if (session.error) throw new Error(session.error);

    // ── 5. Sync latest Telegram metadata to the profile row ───────────────────
    await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        telegram_id: tgUser.id,
        first_name: tgUser.first_name,
        last_name: tgUser.last_name ?? null,
        username: tgUser.username ?? null,
        photo_url: tgUser.photo_url ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "telegram_id" },
    );

    return json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  } catch (err) {
    console.error("telegram-auth error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return json({ error: message }, 500);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function verifyInitData(initData: string, botToken: string): Promise<boolean> {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash) return false;

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const enc = new TextEncoder();

  // secret_key = HMAC-SHA256("WebAppData", bot_token)
  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const secretBytes = await crypto.subtle.sign("HMAC", baseKey, enc.encode(botToken));

  // computed_hash = HMAC-SHA256(secret_key, data_check_string)
  const checkKey = await crypto.subtle.importKey(
    "raw", secretBytes,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const hashBytes = await crypto.subtle.sign("HMAC", checkKey, enc.encode(dataCheckString));

  const computed = Array.from(new Uint8Array(hashBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computed === receivedHash;
}
