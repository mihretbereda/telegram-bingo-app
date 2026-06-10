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
    const { amount, direction } = await req.json() as {
      amount: number;
      direction: "main_to_play" | "play_to_main";
    };

    if (!amount || amount <= 0) return json({ error: "amount must be positive" }, 400);
    if (!direction) return json({ error: "direction required" }, 400);

    const { data: wallet } = await admin
      .from("wallets")
      .select("main_balance, play_balance")
      .eq("user_id", user.id)
      .single();

    if (!wallet) return json({ error: "Wallet not found" }, 404);

    if (direction === "main_to_play") {
      if (wallet.main_balance < amount) {
        return json({ error: "Insufficient main balance", balance: wallet.main_balance }, 402);
      }
      const { error } = await admin
        .from("wallets")
        .update({
          main_balance: wallet.main_balance - amount,
          play_balance: wallet.play_balance + amount,
        })
        .eq("user_id", user.id);
      if (error) throw error;
    } else {
      if (wallet.play_balance < amount) {
        return json({ error: "Insufficient play balance", balance: wallet.play_balance }, 402);
      }
      const { error } = await admin
        .from("wallets")
        .update({
          main_balance: wallet.main_balance + amount,
          play_balance: wallet.play_balance - amount,
        })
        .eq("user_id", user.id);
      if (error) throw error;
    }

    await admin.from("transactions").insert({
      user_id: user.id,
      type: direction,
      amount,
    });

    const { data: updated } = await admin
      .from("wallets")
      .select("main_balance, play_balance")
      .eq("user_id", user.id)
      .single();

    return json({ success: true, wallet: updated });
  } catch (err) {
    console.error("transfer-to-play error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
