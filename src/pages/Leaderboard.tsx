import { useEffect, useRef, useState } from "react";
import { supabase } from "@/services/supabase";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/ui";

interface Entry {
  user_id: string;
  games_played: number;
  first_name: string;
  username: string | null;
}

const KEYFRAMES = `
  @keyframes lbFadeUp {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes lbLivePulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.4; transform: scale(0.85); }
  }
  @keyframes lbGlow {
    0%, 100% { box-shadow: 0 0 12px rgba(245,166,35,0.4); }
    50%       { box-shadow: 0 0 28px rgba(245,166,35,0.8); }
  }
  @keyframes lbShimmer {
    0%   { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  @keyframes lbPodiumRise {
    from { opacity: 0; transform: translateY(40px) scale(0.92); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .lb-row     { animation: lbFadeUp 0.45s cubic-bezier(0.22,1,0.36,1) both; }
  .lb-podium  { animation: lbPodiumRise 0.6s cubic-bezier(0.22,1,0.36,1) both; }
  .lb-live    { animation: lbLivePulse 1.4s ease-in-out infinite; }
  .lb-gold    { animation: lbGlow 2s ease-in-out infinite; }
  .lb-shimmer {
    background: linear-gradient(90deg, #f5a623 0%, #fff8e1 40%, #f5a623 60%, #e8860a 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: lbShimmer 2.4s linear infinite;
  }
`;

async function fetchLeaderboard(): Promise<Entry[]> {
  const { data: participants } = await supabase
    .from("game_participants")
    .select("user_id");

  if (!participants?.length) return [];

  const agg: Record<string, number> = {};
  for (const p of participants) {
    agg[p.user_id] = (agg[p.user_id] ?? 0) + 1;
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, first_name, username")
    .in("id", Object.keys(agg));

  if (!profiles) return [];

  return profiles
    .map((p) => ({
      user_id: p.id,
      games_played: agg[p.id] ?? 0,
      first_name: p.first_name,
      username: p.username,
    }))
    .sort((a, b) => b.games_played - a.games_played)
    .slice(0, 20);
}

export default function Leaderboard() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState(false);
  const updatedTimer = useRef<ReturnType<typeof setTimeout>>();

  const myRank    = user ? entries.findIndex(e => e.user_id === user.id) : -1;
  const myEntry   = myRank >= 0 ? entries[myRank] : null;
  const myRankNum = myRank + 1;

  const load = async () => {
    const data = await fetchLeaderboard();
    setEntries(data);
    setLoading(false);
    setUpdated(true);
    clearTimeout(updatedTimer.current);
    updatedTimer.current = setTimeout(() => setUpdated(false), 1500);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("lb-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "game_participants" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const showPodium    = entries.length >= 3;
  const top3          = entries.slice(0, 3);
  const listEntries   = showPodium ? entries.slice(3) : entries;
  const listOffset    = showPodium ? 4 : 1;

  const podiumOrder   = [top3[1], top3[0], top3[2]];
  const podiumHeights = [60, 90, 45];
  const podiumColors  = ["#9ca3af", "#f5a623", "#cd7c3e"];
  const podiumGlows   = [
    "rgba(156,163,175,0.25)",
    "rgba(245,166,35,0.35)",
    "rgba(205,124,62,0.25)",
  ];
  const medals   = ["🥈", "🥇", "🥉"];
  const realRanks = [2, 1, 3];

  if (loading) return <div style={s.centered}><LoadingSpinner size="lg" /></div>;

  return (
    <div style={s.page}>
      <style>{KEYFRAMES}</style>

      {/* ── Header ── */}
      <div style={s.header}>
        <div style={s.headerInner}>
          <span style={s.trophy}>🏆</span>
          <span className="lb-shimmer" style={s.title}>Leaderboard</span>
        </div>
        <div style={{ ...s.liveBadge, background: updated ? "rgba(0,200,83,0.2)" : "rgba(255,255,255,0.07)", borderColor: updated ? "rgba(0,200,83,0.5)" : "rgba(255,255,255,0.12)", transition: "all 0.4s ease" }}>
          <span className="lb-live" style={{ ...s.liveDot, background: updated ? "#00c853" : "#f5a623" }} />
          <span style={s.liveText}>{updated ? "UPDATED" : "LIVE"}</span>
        </div>
      </div>

      <p style={s.subtitle}>Updated in real-time after every game</p>

      {/* ── Your Rank Card ── */}
      <div style={{ ...s.myCard, ...(myEntry ? s.myCardActive : {}) }}>
        <div style={s.myLeft}>
          <span style={s.myLabel}>Your Rank</span>
          <span style={myEntry ? s.myRankNum : s.myRankUnranked}>
            {myEntry ? `#${myRankNum}` : "—"}
          </span>
        </div>
        {myEntry ? (
          <div style={s.myRight}>
            <span style={s.myEtb}>{myEntry.games_played} {myEntry.games_played === 1 ? "game" : "games"}</span>
          </div>
        ) : (
          <span style={s.myUnrankedText}>Play a game to get ranked</span>
        )}
      </div>

      {entries.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyIcon}>🎯</div>
          <div style={s.emptyText}>No players yet</div>
          <div style={s.emptySub}>Be the first to play a game!</div>
        </div>
      ) : (
        <>
          {/* ── Podium ── */}
          {showPodium && (
            <div style={s.podiumWrap}>
              {podiumOrder.map((entry, i) => (
                <div
                  key={entry.user_id}
                  className="lb-podium"
                  style={{ ...s.podiumCol, animationDelay: `${i * 0.12}s` }}
                >
                  <div
                    className={realRanks[i] === 1 ? "lb-gold" : ""}
                    style={{
                      ...s.podiumAvatar,
                      width: realRanks[i] === 1 ? "58px" : "46px",
                      height: realRanks[i] === 1 ? "58px" : "46px",
                      border: `2.5px solid ${podiumColors[i]}`,
                      background: podiumGlows[i],
                      fontSize: realRanks[i] === 1 ? "22px" : "17px",
                    }}
                  >
                    {entry.first_name[0].toUpperCase()}
                  </div>
                  <span style={s.podiumMedal}>{medals[i]}</span>
                  <span style={{ ...s.podiumName, color: realRanks[i] === 1 ? "#f5a623" : "#fff" }}>
                    {entry.first_name}
                  </span>
                  <span style={{ ...s.podiumEtb, color: podiumColors[i] }}>
                    {entry.games_played} games
                  </span>
                  <div style={{ ...s.podiumBase, height: `${podiumHeights[i]}px`, background: `linear-gradient(180deg, ${podiumGlows[i]}, transparent)`, borderColor: podiumColors[i] }} />
                </div>
              ))}
            </div>
          )}

          {/* ── List ── */}
          {listEntries.length > 0 && (
            <div style={s.list}>
              {listEntries.map((entry, i) => (
                <div
                  key={entry.user_id}
                  className="lb-row"
                  style={{ ...s.row, animationDelay: `${0.3 + i * 0.06}s`, ...(entry.user_id === user?.id ? s.rowMe : {}) }}
                >
                  <span style={s.rank}>#{i + listOffset}</span>
                  <div style={s.avatar}>
                    {entry.first_name[0].toUpperCase()}
                  </div>
                  <div style={s.info}>
                    <span style={s.name}>{entry.first_name}</span>
                    {entry.username && <span style={s.handle}>@{entry.username}</span>}
                  </div>
                  <div style={s.right}>
                    <span style={s.etb}>{entry.games_played} {entry.games_played === 1 ? "game" : "games"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(160deg, #0f0c24 0%, #080614 100%)",
    paddingBottom: "90px",
  },
  centered: {
    display: "flex", justifyContent: "center", alignItems: "center", height: "100vh",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 18px 6px",
  },
  headerInner: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  trophy: {
    fontSize: "26px",
  },
  title: {
    fontSize: "22px",
    fontWeight: 900,
    letterSpacing: "-0.5px",
  },
  liveBadge: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    padding: "4px 10px",
    borderRadius: "20px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.07)",
  },
  liveDot: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    display: "inline-block",
  },
  liveText: {
    fontSize: "10px",
    fontWeight: 700,
    color: "rgba(255,255,255,0.7)",
    letterSpacing: "0.8px",
  },
  subtitle: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.3)",
    textAlign: "center",
    margin: "0 0 20px",
  },
  podiumWrap: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: "8px",
    padding: "0 16px 4px",
  },
  podiumCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    flex: 1,
    gap: "4px",
  },
  podiumAvatar: {
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    color: "#fff",
  },
  podiumMedal: {
    fontSize: "18px",
    marginTop: "2px",
  },
  podiumName: {
    fontSize: "12px",
    fontWeight: 700,
    color: "#fff",
    textAlign: "center",
    maxWidth: "80px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  podiumEtb: {
    fontSize: "11px",
    fontWeight: 700,
    textAlign: "center",
  },
  podiumWins: {
    fontSize: "10px",
    color: "rgba(255,255,255,0.35)",
    fontWeight: 600,
    marginBottom: "4px",
  },
  podiumBase: {
    width: "100%",
    borderRadius: "8px 8px 0 0",
    border: "1px solid",
    borderBottom: "none",
  },
  list: {
    margin: "12px 14px 0",
    borderRadius: "16px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
  },
  rank: {
    fontSize: "11px",
    fontWeight: 700,
    color: "rgba(255,255,255,0.25)",
    minWidth: "26px",
  },
  avatar: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "15px",
    fontWeight: 800,
    color: "#fff",
    flexShrink: 0,
  },
  info: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  },
  name: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#fff",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  handle: {
    fontSize: "11px",
    color: "rgba(255,255,255,0.3)",
  },
  right: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "2px",
  },
  etb: {
    fontSize: "13px",
    fontWeight: 800,
    color: "#f5a623",
  },
  wins: {
    fontSize: "10px",
    color: "rgba(255,255,255,0.3)",
    fontWeight: 500,
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "60px 20px",
    gap: "8px",
  },
  emptyIcon: { fontSize: "48px" },
  emptyText: { fontSize: "18px", fontWeight: 700, color: "#fff" },
  emptySub: { fontSize: "13px", color: "rgba(255,255,255,0.35)" },
  myCard: {
    margin: "0 14px 16px",
    borderRadius: "14px",
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    transition: "all 0.3s ease",
  },
  myCardActive: {
    background: "rgba(79,70,229,0.15)",
    border: "1px solid rgba(79,70,229,0.4)",
    boxShadow: "0 4px 20px rgba(79,70,229,0.2)",
  },
  myLeft: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "2px",
  },
  myLabel: {
    fontSize: "10px",
    fontWeight: 600,
    color: "rgba(255,255,255,0.35)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.8px",
  },
  myRankNum: {
    fontSize: "26px",
    fontWeight: 900,
    color: "#fff",
    letterSpacing: "-1px",
  },
  myRankUnranked: {
    fontSize: "26px",
    fontWeight: 900,
    color: "rgba(255,255,255,0.2)",
  },
  myRight: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "flex-end",
    gap: "2px",
  },
  myEtb: {
    fontSize: "16px",
    fontWeight: 800,
    color: "#f5a623",
  },
  myWins: {
    fontSize: "11px",
    color: "rgba(255,255,255,0.35)",
  },
  myUnrankedText: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.25)",
    fontStyle: "italic" as const,
  },
  rowMe: {
    background: "rgba(79,70,229,0.12)",
    borderLeft: "3px solid #4f46e5",
  },
};
