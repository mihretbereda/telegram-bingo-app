import { createClient } from "jsr:@supabase/supabase-js@2";
import { CORS, json } from "../_shared/cors.ts";

const BOT_TOKEN    = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const GROUP_ID     = "-1002532132671";
const CHANNEL_ID   = "-1004325602260";

async function addMember(chatId: string, userId: number): Promise<boolean> {
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/addChatMember`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, user_id: userId }),
    }
  );
  const data = await res.json();
  return data.ok === true;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("telegram_id, first_name");

  if (error || !profiles) return json({ error: "Failed to fetch profiles" }, 500);

  const results = { total: profiles.length, group: 0, channel: 0, failed: 0 };

  for (const profile of profiles) {
    const tid = profile.telegram_id;

    const [groupOk, channelOk] = await Promise.all([
      addMember(GROUP_ID, tid),
      addMember(CHANNEL_ID, tid),
    ]);

    if (groupOk)   results.group++;
    if (channelOk) results.channel++;
    if (!groupOk && !channelOk) results.failed++;

    // 300ms delay between users to avoid Telegram rate limits
    await delay(300);
  }

  return json(results);
});
