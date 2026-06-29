import { createClient } from "jsr:@supabase/supabase-js@2";
import { CORS, json } from "../_shared/cors.ts";

const BOT_TOKEN  = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const GROUP_ID   = "-1002532132671";
const CHANNEL_ID = "-1004325602260";

async function addMember(chatId: string, userId: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/addChatMember`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, user_id: userId }),
        signal: controller.signal,
      }
    );
    clearTimeout(timer);
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

async function processBatch(userIds: number[]): Promise<{ group: number; channel: number }> {
  let group = 0, channel = 0;
  for (const uid of userIds) {
    const [g, c] = await Promise.all([
      addMember(GROUP_ID, uid),
      addMember(CHANNEL_ID, uid),
    ]);
    if (g) group++;
    if (c) channel++;
    await new Promise(r => setTimeout(r, 80));
  }
  return { group, channel };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("telegram_id");

  if (error || !profiles) return json({ error: "Failed to fetch profiles" }, 500);

  const userIds = profiles.map(p => p.telegram_id).filter(Boolean);

  // Process in batches of 20, run up to 3 batches in parallel
  const BATCH = 20;
  let group = 0, channel = 0;

  for (let i = 0; i < userIds.length; i += BATCH * 3) {
    const chunks = [
      userIds.slice(i,            i + BATCH),
      userIds.slice(i + BATCH,    i + BATCH * 2),
      userIds.slice(i + BATCH * 2, i + BATCH * 3),
    ].filter(c => c.length > 0);

    const results = await Promise.all(chunks.map(processBatch));
    for (const r of results) { group += r.group; channel += r.channel; }
  }

  return json({ total: userIds.length, group, channel });
});
