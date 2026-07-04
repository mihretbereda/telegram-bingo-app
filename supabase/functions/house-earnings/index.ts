import { createClient } from "jsr:@supabase/supabase-js@2";
import { CORS, json } from "../_shared/cors.ts";

const ADMIN_TELEGRAM_ID = 676350518;
const HOUSE_RAKE        = 0.20;

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

  const [{ data: adminProf }, { data: ghosts }] = await Promise.all([
    supabase.from("profiles").select("id").eq("telegram_id", ADMIN_TELEGRAM_ID).single(),
    supabase.from("ghost_players").select("id"),
  ]);
  const adminId  = adminProf?.id ?? null;
  const ghostIds = new Set((ghosts ?? []).map((g: { id: string }) => g.id));

  let sessionsQ = supabase
    .from("game_sessions")
    .select("id, stake_amount, prize_pool, started_at, ended_at")
    .eq("status", "finished")
    .order("ended_at", { ascending: false })
    .limit(100);
  if (cutoff) sessionsQ = sessionsQ.gte("ended_at", cutoff);

  const { data: sessions } = await sessionsQ;
  if (!sessions?.length) {
    return json({
      games: [],
      summary: { totalProfit: 0, totalGames: 0, adminWinMixed: 0, adminWinPure: 0, realWin: 0, noWinner: 0 },
      period,
    });
  }

  const sessionIds = sessions.map((s: { id: string }) => s.id);

  const [{ data: allParts }, { data: allResults }] = await Promise.all([
    supabase
      .from("game_participants")
      .select("game_session_id, user_id, cartela_1, cartela_2")
      .in("game_session_id", sessionIds)
      .eq("is_watcher", false),
    supabase
      .from("game_results")
      .select("game_session_id, winner_id, prize_amount")
      .in("game_session_id", sessionIds),
  ]);

  type Part = { game_session_id: string; user_id: string; cartela_1: number | null; cartela_2: number | null };
  type Res  = { game_session_id: string; winner_id: string; prize_amount: number };

  const partsBySession = new Map<string, Part[]>();
  for (const p of (allParts ?? []) as Part[]) {
    if (!partsBySession.has(p.game_session_id)) partsBySession.set(p.game_session_id, []);
    partsBySession.get(p.game_session_id)!.push(p);
  }
  const resultBySession = new Map<string, Res>();
  for (const r of (allResults ?? []) as Res[]) resultBySession.set(r.game_session_id, r);

  const games = [];
  let totalProfit = 0, adminWinMixed = 0, adminWinPure = 0, realWin = 0, noWinner = 0;

  for (const session of sessions as { id: string; stake_amount: number; prize_pool: number; started_at: string; ended_at: string }[]) {
    const parts  = partsBySession.get(session.id) ?? [];
    const result = resultBySession.get(session.id) ?? null;

    const realParts  = parts.filter(p => p.user_id !== adminId && !ghostIds.has(p.user_id));
    const ghostCount = parts.filter(p => ghostIds.has(p.user_id)).length;
    const hasAdmin   = parts.some(p => p.user_id === adminId);

    const realPlayerStakes = realParts.reduce((sum, p) => {
      const slots = (p.cartela_1 != null ? 1 : 0) + (p.cartela_2 != null ? 1 : 0);
      return sum + slots * session.stake_amount;
    }, 0);

    const winnerIsHouse = result && (result.winner_id === adminId || ghostIds.has(result.winner_id));

    let profit = 0;
    let profitType: string;

    if (!result) {
      profit = 0; profitType = "no_winner"; noWinner++;
    } else if (winnerIsHouse) {
      if (realParts.length > 0) {
        profit = realPlayerStakes; profitType = "admin_win_mixed"; adminWinMixed++;
      } else {
        profit = 0; profitType = "admin_win_pure"; adminWinPure++;
      }
    } else {
      profit = session.prize_pool * HOUSE_RAKE; profitType = "real_win"; realWin++;
    }

    totalProfit += profit;

    games.push({
      id:                 session.id,
      stake_amount:       session.stake_amount,
      prize_pool:         session.prize_pool,
      started_at:         session.started_at,
      ended_at:           session.ended_at,
      total_players:      parts.length,
      real_players:       realParts.length,
      ghost_players:      ghostCount,
      has_admin:          hasAdmin,
      profit,
      profit_type:        profitType,
      real_player_stakes: realPlayerStakes,
    });
  }

  return json({
    games,
    summary: { totalProfit, totalGames: games.length, adminWinMixed, adminWinPure, realWin, noWinner },
    period,
  });
});
