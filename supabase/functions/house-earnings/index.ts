import { createClient } from "jsr:@supabase/supabase-js@2";
import { CORS, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url    = new URL(req.url);
  const period = url.searchParams.get("period") ?? "all";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let cutoff: string | null = null;
  const now = new Date();
  if (period === "24h") { const d = new Date(now); d.setHours(d.getHours() - 24); cutoff = d.toISOString(); }
  if (period === "7d")  { const d = new Date(now); d.setDate(d.getDate() - 7);    cutoff = d.toISOString(); }
  if (period === "30d") { const d = new Date(now); d.setDate(d.getDate() - 30);   cutoff = d.toISOString(); }

  let stakesQ = supabase.from("transactions").select("amount").eq("type", "stake");
  let prizesQ = supabase.from("transactions").select("amount").eq("type", "prize");
  let depositsQ = supabase.from("transactions").select("amount").eq("type", "deposit");
  let withdrawalsQ = supabase.from("transactions").select("amount").eq("type", "withdrawal");

  if (cutoff) {
    stakesQ      = stakesQ.gte("created_at", cutoff);
    prizesQ      = prizesQ.gte("created_at", cutoff);
    depositsQ    = depositsQ.gte("created_at", cutoff);
    withdrawalsQ = withdrawalsQ.gte("created_at", cutoff);
  }

  const [
    { data: stakes },
    { data: prizes },
    { data: deposits },
    { data: withdrawals },
  ] = await Promise.all([stakesQ, prizesQ, depositsQ, withdrawalsQ]);

  const totalStaked      = (stakes      ?? []).reduce((s, t) => s + t.amount, 0);
  const totalPrizes      = (prizes      ?? []).reduce((s, t) => s + t.amount, 0);
  const totalDeposits    = (deposits    ?? []).reduce((s, t) => s + t.amount, 0);
  const totalWithdrawals = (withdrawals ?? []).reduce((s, t) => s + t.amount, 0);
  const houseProfit      = totalStaked - totalPrizes;
  const margin           = totalStaked > 0 ? ((houseProfit / totalStaked) * 100).toFixed(1) : "0.0";

  return json({ totalStaked, totalPrizes, houseProfit, margin, totalDeposits, totalWithdrawals, period });
});
