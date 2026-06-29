import { useEffect, useRef, useState } from "react";
import { supabase } from "@/services/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { LoadingSpinner } from "@/components/ui";

const ADMIN_TELEGRAM_ID = 676350518;

type Period = "24h" | "7d" | "30d" | "all";

interface Entry {
  user_id: string;
  games_played: number;
  first_name: string;
  username: string | null;
  overridden: boolean;
}

const PERIOD_LABELS: Record<Period, string> = {
  "24h": "24h", "7d": "7 Days", "30d": "30 Days", "all": "All Time",
};

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
  @keyframes lbSlideUp {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }
  .lb-row     { animation: lbFadeUp 0.45s cubic-bezier(0.22,1,0.36,1) both; }
  .lb-podium  { animation: lbPodiumRise 0.6s cubic-bezier(0.22,1,0.36,1) both; }
  .lb-live    { animation: lbLivePulse 1.4s ease-in-out infinite; }
  .lb-gold    { animation: lbGlow 2s ease-in-out infinite; }
  .lb-modal   { animation: lbSlideUp 0.35s cubic-bezier(0.22,1,0.36,1); }
  .lb-shimmer {
    background: linear-gradient(90deg, #f5a623 0%, #fff8e1 40%, #f5a623 60%, #e8860a 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: lbShimmer 2.4s linear infinite;
  }
`;

function getCutoff(period: Period): string | null {
  if (period === "all") return null;
  const d = new Date();
  if (period === "24h") d.setHours(d.getHours() - 24);
  if (period === "7d")  d.setDate(d.getDate() - 7);
  if (period === "30d") d.setDate(d.getDate() - 30);
  return d.toISOString();
}

async function fetchLeaderboard(period: Period): Promise<Entry[]> {
  let query = supabase.from("game_participants").select("user_id, created_at");
  const cutoff = getCutoff(period);
  if (cutoff) query = query.gte("created_at", cutoff);

  const { data: participants } = await query;
  if (!participants?.length) return [];

  const agg: Record<string, number> = {};
  for (const p of participants) {
    agg[p.user_id] = (agg[p.user_id] ?? 0) + 1;
  }

  const { data: overrides } = await supabase
    .from("leaderboard_overrides")
    .select("user_id, games_played");

  const overrideMap: Record<string, number> = {};
  for (const o of overrides ?? []) overrideMap[o.user_id] = o.games_played;

  const allUserIds = Array.from(new Set([...Object.keys(agg), ...Object.keys(overrideMap)]));

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, first_name, username")
    .in("id", allUserIds)
    .or("username.neq.Customer_support_NovaBingo,username.is.null");

  if (!profiles) return [];

  return profiles
    .map((p) => ({
      user_id: p.id,
      games_played: overrideMap[p.id] ?? agg[p.id] ?? 0,
      first_name: p.first_name,
      username: p.username,
      overridden: p.id in overrideMap,
    }))
    .sort((a, b) => b.games_played - a.games_played)
    .slice(0, 20);
}

export default function Leaderboard() {
  const { user }    = useAuth();
  const { data: profile } = useProfile(user?.id);
  const isAdmin     = profile?.telegram_id === ADMIN_TELEGRAM_ID;

  const [entries, setEntries]       = useState<Entry[]>([]);
  const [loading, setLoading]       = useState(true);
  const [updated, setUpdated]       = useState(false);
  const [period, setPeriod]         = useState<Period>("all");
  const [adminOpen, setAdminOpen]   = useState(false);
  const [editEntry, setEditEntry]   = useState<Entry | null>(null);
  const [editValue, setEditValue]   = useState("");
  const [saving, setSaving]         = useState(false);
  const updatedTimer = useRef<ReturnType<typeof setTimeout>>();

  const myRank    = user ? entries.findIndex(e => e.user_id === user.id) : -1;
  const myEntry   = myRank >= 0 ? entries[myRank] : null;
  const myRankNum = myRank + 1;

  const load = async () => {
    const data = await fetchLeaderboard(period);
    setEntries(data);
    setLoading(false);
    setUpdated(true);
    clearTimeout(updatedTimer.current);
    updatedTimer.current = setTimeout(() => setUpdated(false), 1500);
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [period]);

  useEffect(() => {
    const ch = supabase
      .channel("lb-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "game_participants" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [period]);

  const saveOverride = async () => {
    if (!editEntry) return;
    const val = parseInt(editValue);
    if (isNaN(val) || val < 0) return;
    setSaving(true);
    await supabase.from("leaderboard_overrides").upsert(
      { user_id: editEntry.user_id, games_played: val },
      { onConflict: "user_id" }
    );
    setSaving(false);
    setEditEntry(null);
    load();
  };

  const removeOverride = async () => {
    if (!editEntry) return;
    setSaving(true);
    await supabase.from("leaderboard_overrides").delete().eq("user_id", editEntry.user_id);
    setSaving(false);
    setEditEntry(null);
    load();
  };

  const showPodium  = entries.length >= 3;
  const top3        = entries.slice(0, 3);
  const listEntries = showPodium ? entries.slice(3) : entries;
  const listOffset  = showPodium ? 4 : 1;

  const podiumOrder   = [top3[1], top3[0], top3[2]];
  const podiumHeights = [60, 90, 45];
  const podiumColors  = ["#9ca3af", "#f5a623", "#cd7c3e"];
  const podiumGlows   = ["rgba(156,163,175,0.25)", "rgba(245,166,35,0.35)", "rgba(205,124,62,0.25)"];
  const medals        = ["🥈", "🥇", "🥉"];
  const realRanks     = [2, 1, 3];

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
        <div style={s.headerRight}>
          <div style={{ ...s.liveBadge, background: updated ? "rgba(0,200,83,0.2)" : "rgba(255,255,255,0.07)", borderColor: updated ? "rgba(0,200,83,0.5)" : "rgba(255,255,255,0.12)", transition: "all 0.4s ease" }}>
            <span className="lb-live" style={{ ...s.liveDot, background: updated ? "#00c853" : "#f5a623" }} />
            <span style={s.liveText}>{updated ? "UPDATED" : "LIVE"}</span>
          </div>
          {isAdmin && (
            <button style={s.cogBtn} onClick={() => setAdminOpen(o => !o)}>⚙️</button>
          )}
        </div>
      </div>

      {/* ── Admin Panel ── */}
      {isAdmin && adminOpen && (
        <div style={s.adminPanel}>
          <div style={s.adminLabel}>Period</div>
          <div style={s.periodRow}>
            {(["24h", "7d", "30d", "all"] as Period[]).map(p => (
              <button
                key={p}
                style={{ ...s.periodBtn, ...(period === p ? s.periodBtnActive : {}) }}
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <div style={s.adminHint}>Tap any player row to override their game count</div>
        </div>
      )}

      <p style={s.subtitle}>
        {period === "all" ? "All time · " : `Last ${PERIOD_LABELS[period]} · `}
        Updated in real-time
      </p>

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
                  onClick={() => { if (isAdmin) { setEditEntry(entry); setEditValue(String(entry.games_played)); } }}
                >
                  <div
                    className={realRanks[i] === 1 ? "lb-gold" : ""}
                    style={{ ...s.podiumAvatar, width: realRanks[i] === 1 ? "58px" : "46px", height: realRanks[i] === 1 ? "58px" : "46px", border: `2.5px solid ${podiumColors[i]}`, background: podiumGlows[i], fontSize: realRanks[i] === 1 ? "22px" : "17px" }}
                  >
                    {entry.first_name[0].toUpperCase()}
                  </div>
                  <span style={s.podiumMedal}>{medals[i]}</span>
                  <span style={{ ...s.podiumName, color: realRanks[i] === 1 ? "#f5a623" : "#fff" }}>
                    {entry.first_name}
                  </span>
                  <span style={{ ...s.podiumEtb, color: podiumColors[i] }}>
                    {entry.games_played} games{entry.overridden ? " ✎" : ""}
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
                  onClick={() => { if (isAdmin) { setEditEntry(entry); setEditValue(String(entry.games_played)); } }}
                >
                  <span style={s.rank}>#{i + listOffset}</span>
                  <div style={s.avatar}>{entry.first_name[0].toUpperCase()}</div>
                  <div style={s.info}>
                    <span style={s.name}>{entry.first_name}</span>
                    {entry.username && <span style={s.handle}>@{entry.username}</span>}
                  </div>
                  <div style={s.right}>
                    <span style={s.etb}>{entry.games_played} {entry.games_played === 1 ? "game" : "games"}</span>
                    {entry.overridden && isAdmin && <span style={s.overrideBadge}>rigged</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Override Modal (admin only) ── */}
      {editEntry && (
        <div style={s.overlay} onClick={() => setEditEntry(null)}>
          <div className="lb-modal" style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHandle} />
            <div style={s.modalTitle}>Edit Player</div>
            <div style={s.modalName}>{editEntry.first_name}{editEntry.username ? ` @${editEntry.username}` : ""}</div>
            <div style={s.modalLabel}>Games Played</div>
            <input
              style={s.modalInput}
              type="number"
              min="0"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              autoFocus
            />
            <div style={s.modalBtns}>
              {editEntry.overridden && (
                <button style={s.modalBtnRemove} onClick={removeOverride} disabled={saving}>
                  {saving ? "..." : "Remove Override"}
                </button>
              )}
              <button style={s.modalBtnSave} onClick={saveOverride} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "linear-gradient(160deg, #0f0c24 0%, #080614 100%)", paddingBottom: "90px" },
  centered: { display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 18px 6px" },
  headerInner: { display: "flex", alignItems: "center", gap: "10px" },
  headerRight: { display: "flex", alignItems: "center", gap: "8px" },
  trophy: { fontSize: "26px" },
  title: { fontSize: "22px", fontWeight: 900, letterSpacing: "-0.5px" },
  liveBadge: { display: "flex", alignItems: "center", gap: "5px", padding: "4px 10px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)" },
  liveDot: { width: "7px", height: "7px", borderRadius: "50%", display: "inline-block" },
  liveText: { fontSize: "10px", fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: "0.8px" },
  cogBtn: { background: "none", border: "none", fontSize: "18px", cursor: "pointer", padding: "2px 4px", opacity: 0.5 },
  adminPanel: { margin: "0 14px 4px", borderRadius: "14px", background: "rgba(79,70,229,0.1)", border: "1px solid rgba(79,70,229,0.25)", padding: "12px 14px" },
  adminLabel: { fontSize: "10px", fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, letterSpacing: "0.8px", marginBottom: "8px" },
  periodRow: { display: "flex", gap: "6px" },
  periodBtn: { flex: 1, padding: "7px 4px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", fontSize: "11px", fontWeight: 600, cursor: "pointer" },
  periodBtnActive: { background: "rgba(79,70,229,0.4)", border: "1px solid rgba(79,70,229,0.6)", color: "#fff" },
  adminHint: { fontSize: "10px", color: "rgba(255,255,255,0.25)", marginTop: "8px", fontStyle: "italic" as const },
  subtitle: { fontSize: "12px", color: "rgba(255,255,255,0.3)", textAlign: "center", margin: "6px 0 14px" },
  podiumWrap: { display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "8px", padding: "0 16px 4px" },
  podiumCol: { display: "flex", flexDirection: "column" as const, alignItems: "center", flex: 1, gap: "4px", cursor: "pointer" },
  podiumAvatar: { borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#fff" },
  podiumMedal: { fontSize: "18px", marginTop: "2px" },
  podiumName: { fontSize: "12px", fontWeight: 700, color: "#fff", textAlign: "center" as const, maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  podiumEtb: { fontSize: "11px", fontWeight: 700, textAlign: "center" as const },
  podiumBase: { width: "100%", borderRadius: "8px 8px 0 0", border: "1px solid", borderBottom: "none" },
  list: { margin: "12px 14px 0", borderRadius: "16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" },
  row: { display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer" },
  rank: { fontSize: "11px", fontWeight: 700, color: "rgba(255,255,255,0.25)", minWidth: "26px" },
  avatar: { width: "36px", height: "36px", borderRadius: "50%", background: "linear-gradient(135deg, #4f46e5, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", fontWeight: 800, color: "#fff", flexShrink: 0 },
  info: { flex: 1, display: "flex", flexDirection: "column" as const, gap: "2px", minWidth: 0 },
  name: { fontSize: "13px", fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  handle: { fontSize: "11px", color: "rgba(255,255,255,0.3)" },
  right: { display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: "2px" },
  etb: { fontSize: "13px", fontWeight: 800, color: "#f5a623" },
  overrideBadge: { fontSize: "9px", color: "#a78bfa", fontWeight: 600, letterSpacing: "0.5px" },
  rowMe: { background: "rgba(79,70,229,0.12)", borderLeft: "3px solid #4f46e5" },
  empty: { display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", padding: "60px 20px", gap: "8px" },
  emptyIcon: { fontSize: "48px" },
  emptyText: { fontSize: "18px", fontWeight: 700, color: "#fff" },
  emptySub: { fontSize: "13px", color: "rgba(255,255,255,0.35)" },
  myCard: { margin: "0 14px 16px", borderRadius: "14px", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", transition: "all 0.3s ease" },
  myCardActive: { background: "rgba(79,70,229,0.15)", border: "1px solid rgba(79,70,229,0.4)", boxShadow: "0 4px 20px rgba(79,70,229,0.2)" },
  myLeft: { display: "flex", flexDirection: "column" as const, gap: "2px" },
  myLabel: { fontSize: "10px", fontWeight: 600, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, letterSpacing: "0.8px" },
  myRankNum: { fontSize: "26px", fontWeight: 900, color: "#fff", letterSpacing: "-1px" },
  myRankUnranked: { fontSize: "26px", fontWeight: 900, color: "rgba(255,255,255,0.2)" },
  myRight: { display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: "2px" },
  myEtb: { fontSize: "16px", fontWeight: 800, color: "#f5a623" },
  myUnrankedText: { fontSize: "12px", color: "rgba(255,255,255,0.25)", fontStyle: "italic" as const },
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "flex-end" },
  modal: { width: "100%", background: "linear-gradient(160deg, #1a1635, #120f26)", borderRadius: "24px 24px 0 0", padding: "12px 20px 36px", border: "1px solid rgba(255,255,255,0.1)" },
  modalHandle: { width: "36px", height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.15)", margin: "0 auto 20px" },
  modalTitle: { fontSize: "18px", fontWeight: 800, color: "#fff", marginBottom: "4px" },
  modalName: { fontSize: "13px", color: "rgba(255,255,255,0.4)", marginBottom: "20px" },
  modalLabel: { fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, letterSpacing: "0.8px", marginBottom: "8px" },
  modalInput: { width: "100%", padding: "14px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.07)", color: "#fff", fontSize: "20px", fontWeight: 700, outline: "none", boxSizing: "border-box" as const, marginBottom: "16px" },
  modalBtns: { display: "flex", gap: "10px" },
  modalBtnSave: { flex: 1, padding: "14px", borderRadius: "12px", border: "none", background: "linear-gradient(90deg, #4f46e5, #7c3aed)", color: "#fff", fontSize: "14px", fontWeight: 700, cursor: "pointer" },
  modalBtnRemove: { flex: 1, padding: "14px", borderRadius: "12px", border: "1px solid rgba(255,72,66,0.4)", background: "rgba(255,72,66,0.1)", color: "#ff4842", fontSize: "14px", fontWeight: 700, cursor: "pointer" },
};
