import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useStats } from "@/hooks/useStats";
import { useWallet } from "@/hooks/useWallet";
import { useGameSession } from "@/hooks/useGameSession";
import { useAdminConfig } from "@/hooks/useAdminConfig";
import { LoadingSpinner, ErrorMessage } from "@/components/ui";
import { supabase } from "@/services/supabase";
import type { GameSession } from "@/types/database";

const ADMIN_TELEGRAM_ID = 676350518;
// ── Keyframes ─────────────────────────────────────────────────────────────────
const KEYFRAMES = `
  @keyframes shimmer {
    0%   { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  @keyframes livePulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(0,200,83,0.4); }
    50%       { box-shadow: 0 0 0 6px rgba(0,200,83,0); }
  }
  @keyframes countUp {
    from { transform: translateY(100%); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
  @keyframes btnPulse {
    0%, 100% { transform: scale(1);    box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
    50%       { transform: scale(1.03); box-shadow: 0 6px 24px rgba(0,0,0,0.45); }
  }
  .play-btn { animation: btnPulse 2s ease-in-out infinite; }
  .stat-roll { animation: countUp 0.45s cubic-bezier(0.22,1,0.36,1); }
  .prize-shimmer {
    background: linear-gradient(90deg, #f5a623 0%, #fff8e1 40%, #f5a623 60%, #e8860a 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: shimmer 2.4s linear infinite;
  }
`;

// ── Game Card ─────────────────────────────────────────────────────────────────
function GameCard({ stake, onPlay }: {
  stake: number;
  session?: GameSession | null;
  onPlay: () => void;
}) {
  const is10 = stake === 10;

  const gradient = is10
    ? "linear-gradient(145deg, #1e1065 0%, #312e81 40%, #4338ca 100%)"
    : "linear-gradient(145deg, #7c2d12 0%, #9a3412 40%, #c2410c 100%)";

  const btnGradient = is10
    ? "linear-gradient(90deg, #4f46e5, #7c3aed)"
    : "linear-gradient(90deg, #ea580c, #f59e0b)";

  return (
    <div style={{ ...c.card, background: gradient }} onClick={onPlay}>
      <div style={c.gridLines} />
      <div style={c.cardInner}>
        <button className="play-btn" style={{ ...c.playBtn, background: btnGradient }}
          onClick={(e) => { e.stopPropagation(); onPlay(); }}
        >
          ▶ PLAY {stake}
        </button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Home() {
  const navigate = useNavigate();
  const { isLoading: authLoading, error, user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile(user?.id);
  const { data: wallet }  = useWallet(user?.id);
  const { data: stats }   = useStats();
  const { data: session10 } = useGameSession(10);
  const { data: session20 } = useGameSession(20);

  const activePlayers = useCountUp(stats?.activePlayers);
  const gamesPlayed   = useCountUp(stats?.gamesPlayed);
  const winnersToday  = useCountUp(stats?.winnersToday);

  const isAdmin = profile?.telegram_id === ADMIN_TELEGRAM_ID;
  const {
    riggedMode, toggleRigged,
    ghostEnabled, toggleGhost,
    ghostCount, updateGhostCount,
    loading: toggleLoading,
  } = useAdminConfig();

  const [dauOpen, setDauOpen] = useState(false);
  const [dauRows, setDauRows] = useState<{ day: string; count: number }[]>([]);

  useEffect(() => {
    if (!isAdmin || !dauOpen) return;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 13);
    supabase
      .from("daily_opens")
      .select("day")
      .gte("day", cutoff.toISOString().slice(0, 10))
      .then(({ data }) => {
        if (!data) return;
        const counts: Record<string, number> = {};
        for (const { day } of data) counts[day] = (counts[day] ?? 0) + 1;
        setDauRows(
          Object.entries(counts)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .slice(0, 14)
            .map(([day, count]) => ({ day, count }))
        );
      });
  }, [isAdmin, dauOpen]);

  const balance = (wallet?.play_balance ?? 0) + (wallet?.main_balance ?? 0);

  if (authLoading || profileLoading) {
    return <div style={s.centered}><LoadingSpinner size="lg" /></div>;
  }
  if (error) return <ErrorMessage error={error} />;

  return (
    <div style={s.page}>
      <style>{KEYFRAMES}</style>

      {/* ── Header ── */}
      <header style={s.header}>
        <div style={s.logoRow}>
          <div style={s.logoCircle}>
            <span style={s.logoLetter}>N</span>
          </div>
          <div>
            <div style={s.appName}>Nova Bingo</div>
            <div style={s.greeting}>
              {profile?.first_name ? `Hey, ${profile.first_name} 👋` : "Welcome back 👋"}
            </div>
          </div>
        </div>
        <div style={s.balanceChip}>
          <span style={s.balanceIcon}>🪙</span>
          <span style={s.balanceAmt}>{Math.round(balance).toLocaleString()}</span>
          <span style={s.balanceCurr}>ETB</span>
        </div>
      </header>

      {/* ── Welcome ── */}
      <div style={s.welcome}>
        <div>Welcome{profile?.first_name ? ` ${profile.first_name}` : ""}!</div>
        <div style={s.welcomeSub}>to Nova Bingo!</div>
      </div>

      {/* ── Section label ── */}
      <div style={s.sectionLabel}>
        <span style={s.sectionDot} />
        <span>Choose Your Game</span>
      </div>

      {/* ── Game Cards ── */}
      <div style={s.cardsGrid}>
        <GameCard stake={10} session={session10} onPlay={() => navigate("/play?stake=10")} />
        <GameCard stake={20} session={session20} onPlay={() => navigate("/play?stake=20")} />
      </div>

      {/* ── Stats ── */}
      <div style={s.statsSection}>
        {[
          { value: stats ? activePlayers.toLocaleString() : "—", target: stats?.activePlayers, label: "Active Players", icon: "🎮" },
          { value: stats ? gamesPlayed.toLocaleString()   : "—", target: stats?.gamesPlayed,   label: "Games Played",   icon: "🏆" },
          { value: stats ? winnersToday.toLocaleString()  : "—", target: stats?.winnersToday,  label: "Winners Today",  icon: "🎉" },
        ].map(({ value, target, label, icon }, i, arr) => (
          <div key={label} style={{ ...s.statItem, ...(i < arr.length - 1 ? s.statBorder : {}) }}>
            <span style={s.statIcon}>{icon}</span>
            <div style={s.statValueClip}>
              <span key={target} className="stat-roll" style={s.statValue}>{value}</span>
            </div>
            <span style={s.statLabel}>{label}</span>
          </div>
        ))}
      </div>

      <p style={s.botTag}>@NovaBingoBot</p>

      {isAdmin && (
        <>
          <div style={s.adminRow}>
            {/* Rigged mode */}
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: riggedMode ? "#00c853" : "rgba(255,255,255,0.15)" }} />
            <button style={s.adminBtn} onClick={() => toggleRigged(!riggedMode)} disabled={toggleLoading}>
              {riggedMode ? "ON" : "OFF"}
            </button>

            <span style={s.adminDivider} />

            {/* Ghost players */}
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: ghostEnabled ? "#2979ff" : "rgba(255,255,255,0.15)" }} />
            <button style={s.adminBtn} onClick={() => toggleGhost(!ghostEnabled)} disabled={toggleLoading}>
              G:{ghostEnabled ? "ON" : "OFF"}
            </button>
            <button style={s.adminCountBtn} onClick={() => updateGhostCount(ghostCount - 1)} disabled={toggleLoading}>−</button>
            <span style={s.adminCount}>{ghostCount}</span>
            <button style={s.adminCountBtn} onClick={() => updateGhostCount(ghostCount + 1)} disabled={toggleLoading}>+</button>

            <span style={s.adminDivider} />

            {/* DAU toggle */}
            <button style={s.adminBtn} onClick={() => setDauOpen(o => !o)}>
              DAU {dauOpen ? "▲" : "▼"}
            </button>
          </div>

          {dauOpen && (
            <div style={s.dauPanel}>
              <div style={s.dauTitle}>Daily Active Users (last 14 days)</div>
              {dauRows.length === 0 ? (
                <div style={s.dauEmpty}>No data yet</div>
              ) : (
                dauRows.map(({ day, count }) => (
                  <div key={day} style={s.dauRow}>
                    <span style={s.dauDay}>{day}</span>
                    <div style={s.dauBarWrap}>
                      <div style={{ ...s.dauBar, width: `${Math.round((count / dauRows[0].count) * 100)}%` }} />
                    </div>
                    <span style={s.dauCount}>{count}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Count-up hook ─────────────────────────────────────────────────────────────
function useCountUp(target: number | undefined, duration = 1500) {
  const [value, setValue] = useState(target ?? 0);
  const rafRef = useRef<number>(0);
  const fromRef = useRef(target ?? 0);

  useEffect(() => {
    if (target === undefined) return;
    const from = fromRef.current;
    if (from === target) return;
    cancelAnimationFrame(rafRef.current);
    let t0: number | null = null;
    const step = (ts: number) => {
      if (!t0) t0 = ts;
      const p = Math.min((ts - t0) / duration, 1);
      setValue(Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return value;
}

// ── Card styles ───────────────────────────────────────────────────────────────
const c: Record<string, React.CSSProperties> = {
  card: {
    borderRadius: "18px",
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    cursor: "pointer",
    flex: 1,
    position: "relative",
    height: "130px",
  },
  cardInner: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 16px",
  },
  gridLines: {
    position: "absolute",
    inset: 0,
    backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
    backgroundSize: "24px 24px",
  },
  playBtn: {
    width: "100%",
    padding: "13px",
    borderRadius: "12px",
    border: "none",
    color: "#fff",
    fontSize: "15px",
    fontWeight: 800,
    letterSpacing: "1.5px",
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
  },
};

// ── Page styles ───────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(160deg, #0f0c24 0%, #080614 100%)",
    display: "flex",
    flexDirection: "column",
    paddingBottom: "80px",
  },
  centered: {
    display: "flex", justifyContent: "center", alignItems: "center", height: "100vh",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 18px 12px",
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  logoCircle: {
    width: "40px",
    height: "40px",
    borderRadius: "12px",
    background: "linear-gradient(135deg, #f5a623, #e8860a)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 12px rgba(245,166,35,0.4)",
  },
  logoLetter: {
    fontSize: "20px",
    fontWeight: 900,
    color: "#fff",
  },
  appName: {
    fontSize: "15px",
    fontWeight: 800,
    color: "#fff",
    lineHeight: 1.2,
  },
  greeting: {
    fontSize: "11px",
    color: "rgba(255,255,255,0.45)",
    fontWeight: 400,
    lineHeight: 1.3,
  },
  balanceChip: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    background: "rgba(245,166,35,0.12)",
    border: "1px solid rgba(245,166,35,0.35)",
    borderRadius: "20px",
    padding: "6px 12px",
  },
  balanceIcon: { fontSize: "13px" },
  balanceAmt: {
    fontSize: "13px",
    fontWeight: 800,
    color: "#f5a623",
  },
  balanceCurr: {
    fontSize: "10px",
    color: "rgba(245,166,35,0.7)",
    fontWeight: 600,
  },
  welcome: {
    textAlign: "center" as const,
    fontSize: "26px",
    fontWeight: 800,
    color: "#fff",
    padding: "40px 18px 14px",
    lineHeight: 1.35,
  },
  welcomeSub: {
    fontSize: "22px",
    fontWeight: 700,
    color: "#f5a623",
  },
  sectionLabel: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "4px 18px 10px",
    fontSize: "12px",
    fontWeight: 700,
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
  },
  sectionDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "#f5a623",
  },
  cardsGrid: {
    display: "flex",
    gap: "12px",
    padding: "0 14px",
  },
  statsSection: {
    margin: "20px 14px 0",
    borderRadius: "16px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.07)",
    display: "flex",
  },
  statItem: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "16px 8px",
    gap: "3px",
  },
  statBorder: {
    borderRight: "1px solid rgba(255,255,255,0.07)",
  },
  statIcon: { fontSize: "16px" },
  statValueClip: { overflow: "hidden", lineHeight: 1 },
  statValue: {
    fontSize: "18px",
    fontWeight: 800,
    color: "#f5a623",
    letterSpacing: "-0.5px",
  },
  statLabel: {
    fontSize: "9px",
    color: "rgba(255,255,255,0.3)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    fontWeight: 500,
  },
  botTag: {
    textAlign: "center",
    fontSize: "11px",
    color: "rgba(255,255,255,0.2)",
    marginTop: "16px",
  },
  adminRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    marginTop: "8px",
  },
  adminBtn: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.12)",
    fontSize: "10px",
    fontWeight: 600,
    cursor: "pointer",
    letterSpacing: "0.5px",
    padding: 0,
  },
  adminDivider: {
    width: "1px",
    height: "10px",
    background: "rgba(255,255,255,0.08)",
    margin: "0 2px",
  },
  adminCountBtn: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.12)",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
    padding: "0 2px",
    lineHeight: 1,
  },
  adminCount: {
    fontSize: "10px",
    color: "rgba(255,255,255,0.12)",
    fontWeight: 600,
    minWidth: "10px",
    textAlign: "center" as const,
  },
  dauPanel: {
    margin: "8px 14px 0",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.07)",
    padding: "12px 14px",
  },
  dauTitle: {
    fontSize: "10px",
    fontWeight: 700,
    color: "rgba(255,255,255,0.3)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.8px",
    marginBottom: "10px",
  },
  dauEmpty: {
    fontSize: "11px",
    color: "rgba(255,255,255,0.2)",
    textAlign: "center" as const,
    padding: "8px 0",
  },
  dauRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "6px",
  },
  dauDay: {
    fontSize: "10px",
    color: "rgba(255,255,255,0.4)",
    fontVariantNumeric: "tabular-nums" as const,
    minWidth: "76px",
  },
  dauBarWrap: {
    flex: 1,
    height: "6px",
    borderRadius: "3px",
    background: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  dauBar: {
    height: "100%",
    borderRadius: "3px",
    background: "linear-gradient(90deg, #4f46e5, #7c3aed)",
    transition: "width 0.4s ease",
  },
  dauCount: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#f5a623",
    minWidth: "24px",
    textAlign: "right" as const,
  },
};
