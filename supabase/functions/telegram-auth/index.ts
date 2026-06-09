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

    // ── 3. Derive a deterministic password from the bot token + Telegram ID ───
    // This is the key security property: only our Edge Function (which holds
    // the bot token) can derive the right password for a given Telegram user.
    const password = await hmacHex(botToken, `tg_pwd_${tgUser.id}`);
    const email = `tg_${tgUser.id}@telegram.local`;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ── 4. Create or update user with the deterministic password ─────────────
    const userMeta = {
      telegram_id: tgUser.id,
      first_name: tgUser.first_name,
      last_name: tgUser.last_name ?? null,
      username: tgUser.username ?? null,
      photo_url: tgUser.photo_url ?? null,
    };

    const { data: createData } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: userMeta,
    });

    if (!createData?.user) {
      // User already exists — look up their ID via generateLink (does not consume a token,
      // just returns the user object) and force-set the deterministic password on them.
      const { data: linkData, error: linkError } =
        await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
      if (linkError) throw linkError;

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        linkData.user.id,
        { password, user_metadata: userMeta },
      );
      if (updateError) throw updateError;
    }

    // ── 5. Sign in with the deterministic password to get a real session ──────
    const { data: signInData, error: signInError } =
      await supabaseAdmin.auth.signInWithPassword({ email, password });

    if (signInError) throw signInError;
    if (!signInData.session) throw new Error("No session returned from signInWithPassword");

    // ── 6. Keep profile row in sync with latest Telegram data ─────────────────
    await supabaseAdmin.from("profiles").upsert(
      {
        id: signInData.user.id,
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
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
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

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const secretBytes = await crypto.subtle.sign("HMAC", baseKey, enc.encode(botToken));

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
