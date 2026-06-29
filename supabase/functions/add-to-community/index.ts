import { createClient } from "jsr:@supabase/supabase-js@2";
import { CORS, json } from "../_shared/cors.ts";

const BOT_TOKEN  = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const GROUP_ID   = "-1002532132671";
const CHANNEL_ID = "-1004325602260";

async function getInviteLink(chatId: string): Promise<string | null> {
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/exportChatInviteLink`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId }),
    }
  );
  const data = await res.json();
  return data.ok ? data.result : null;
}

async function sendInvite(telegramId: number, groupLink: string, channelLink: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramId,
          text:
            `🎉 *Join the Nova Bingo Community!*\n\n` +
            `Stay updated with game announcements, results, and chat with other players.\n\n` +
            `👥 *Group:* ${groupLink}\n` +
            `📢 *Channel:* ${channelLink}`,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }),
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Get invite links first
  const [groupLink, channelLink] = await Promise.all([
    getInviteLink(GROUP_ID),
    getInviteLink(CHANNEL_ID),
  ]);

  if (!groupLink || !channelLink) {
    return json({ error: "Failed to get invite links — is the bot admin in both chats?" }, 500);
  }

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("telegram_id");

  if (error || !profiles) return json({ error: "Failed to fetch profiles" }, 500);

  const userIds = profiles.map(p => p.telegram_id).filter(Boolean);

  let sent = 0, failed = 0;

  for (const uid of userIds) {
    const ok = await sendInvite(uid, groupLink, channelLink);
    if (ok) sent++; else failed++;
    await new Promise(r => setTimeout(r, 50));
  }

  return json({ total: userIds.length, sent, failed });
});
