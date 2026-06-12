import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useStats } from "@/hooks/useStats";
import { useWallet } from "@/hooks/useWallet";
import { useGameSession } from "@/hooks/useGameSession";
import { LoadingSpinner, ErrorMessage } from "@/components/ui";
import type { GameSession } from "@/types/database";

// ── Keyframes ─────────────────────────────────────────────────────────────────
const KEYFRAMES = `
  @keyframes floatBall {
    0%, 100% { transform: translateY(0px) rotate(0deg); }
    33%       { transform: translateY(-8px) rotate(5deg); }
    66%       { transform: translateY(-4px) rotate(-3deg); }
  }
  @keyframes pulseGlow {
    0%, 100% { opacity: 0.5; }
    50%       { opacity: 1; }
  }
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
  .float-1 { animation: floatBall 3.2s ease-in-out infinite; }
  .float-2 { animation: floatBall 4.1s ease-in-out 0.5s infinite; }
  .float-3 { animation: floatBall 3.7s ease-in-out 1.1s infinite; }
  .float-4 { animation: floatBall 4.5s ease-in-out 0.3s infinite; }
  .float-5 { animation: floatBall 3.9s ease-in-out 0.8s infinite; }
  .live-dot { animation: livePulse 1.5s ease-in-out infinite; }
  .prize-shimmer {
    background: linear-gradient(90deg, #f5a623 0%, #fff8e1 40%, #f5a623 60%, #e8860a 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: shimmer 2.4s linear infinite;
  }
`;

// ── Bingo Ball ────────────────────────────────────────────────────────────────
function BingoBall({ n, size, color, className, style }: {
  n: number; size: number; color: string; className?: string; style?: React.CSSProperties;
}) {
  return (
    <div className={className} style={{
      width: size, height: size, borderRadius: "50%",
      background: `radial-gradient(circle at 35% 35%, ${color}ff, ${color}99)`,
      border: `${size * 0.06}px solid rgba(255,255,255,0.35)`,
      boxShadow: `0 ${size * 0.08}px ${size * 0.25}px rgba(0,0,0,0.45), inset 0 ${size * 0.06}px ${size * 0.12}px rgba(255,255,255,0.3)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      position: "absolute",
      ...style,
    }}>
      <div style={{
        width: size * 0.52, height: size * 0.52, borderRadius: "50%",
        background: "rgba(255,255,255,0.92)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: size * 0.28, fontWeight: 900, color: "#1a1040", lineHeight: 1 }}>{n}</span>
      </div>
    </div>
  );
}

// ── Game Card ─────────────────────────────────────────────────────────────────
function GameCard({ stake, session, onPlay }: {
  stake: number;
  session: GameSession | null | undefined;
  onPlay: () => void;
}) {
  const is10 = stake === 10;
  const isActive  = session?.status === "active";
  const isWaiting = session?.status === "waiting";
  const prize     = session?.prize_pool ?? 0;
  const players   = session?.participant_count ?? 0;

  const gradient = is10
    ? "linear-gradient(145deg, #1e1065 0%, #312e81 40%, #4338ca 100%)"
    : "linear-gradient(145deg, #7c2d12 0%, #9a3412 40%, #c2410c 100%)";

  const accentColor = is10 ? "#818cf8" : "#fb923c";
  const glowColor   = is10 ? "rgba(99,102,241,0.6)" : "rgba(251,146,60,0.6)";

  const balls = is10
    ? [
        { n: 7,  size: 52, color: "#6366f1", cls: "float-1", top: "12%", left: "8%"  },
        { n: 23, size: 44, color: "#8b5cf6", cls: "float-2", top: "8%",  right: "12%"},
        { n: 15, size: 38, color: "#a78bfa", cls: "float-3", top: "42%", left: "18%" },
        { n: 42, size: 48, color: "#4f46e5", cls: "float-4", top: "25%", right: "6%" },
        { n: 61, size: 34, color: "#7c3aed", cls: "float-5", top: "55%", right: "22%"},
      ]
    : [
        { n: 5,  size: 52, color: "#f97316", cls: "float-1", top: "12%", left: "8%"  },
        { n: 34, size: 44, color: "#ea580c", cls: "float-2", top: "8%",  right: "12%"},
        { n: 17, size: 38, color: "#fb923c", cls: "float-3", top: "42%", left: "18%" },
        { n: 58, size: 48, color: "#c2410c", cls: "float-4", top: "25%", right: "6%" },
        { n: 72, size: 34, color: "#f59e0b", cls: "float-5", top: "55%", right: "22%"},
      ];

  return (
    <div style={c.card} onClick={onPlay}>
      {/* Artwork area */}
      <div style={{ ...c.artwork, background: gradient, boxShadow: `inset 0 0 60px ${glowColor}` }}>
        {/* Decorative grid lines */}
        <div style={c.gridLines} />

        {/* Floating bingo balls */}
        {balls.map((b) => (
          <BingoBall key={b.n} n={b.n} size={b.size} color={b.color}
            className={b.cls}
            style={{ top: b.top, left: (b as { left?: string }).left, right: (b as { right?: string }).right }} />
        ))}

        {/* Center BINGO text */}
        <div style={c.bingoWordWrap}>
          {"BINGO".split("").map((ch, i) => (
            <span key={i} style={{ ...c.bingoLetter, color: accentColor,
              textShadow: `0 0 20px ${accentColor}, 0 0 40px ${glowColor}` }}>
              {ch}
            </span>
          ))}
        </div>

        {/* Status badge */}
        <div style={{ ...c.badge, ...(isActive ? c.badgeLive : isWaiting ? c.badgeWait : c.badgeOff) }}>
          {isActive && <span className="live-dot" style={c.liveDot} />}
          <span>{isActive ? "LIVE" : isWaiting ? "WAITING" : "—"}</span>
        </div>

        {/* Stake badge */}
        <div style={{ ...c.stakeBadge, background: is10 ? "rgba(99,102,241,0.9)" : "rgba(234,88,12,0.9)" }}>
          {stake} ETB
        </div>
      </div>

      {/* Info area */}
      <div style={c.info}>
        <div style={c.infoTop}>
          <span style={c.gameName}>{is10 ? "Classic Bingo" : "Gold Bingo"}</span>
          <span style={c.stakeLabel}>{stake} ETB / card</span>
        </div>

        <div style={c.statsRow}>
          <div style={c.statChip}>
            <span style={c.statChipVal}>{players > 0 ? players : "—"}</span>
            <span style={c.statChipLbl}>Players</span>
          </div>
          <div style={{ ...c.statChip, flex: 2 }}>
            <span className={prize > 0 ? "prize-shimmer" : ""} style={c.statChipVal}>
              {prize > 0 ? `${Math.round(prize).toLocaleString()} ETB` : "—"}
            </span>
            <span style={c.statChipLbl}>Prize Pool</span>
          </div>
        </div>

        <button style={{ ...c.playBtn, background: is10
          ? "linear-gradient(90deg, #4f46e5, #7c3aed)"
          : "linear-gradient(90deg, #ea580c, #f59e0b)" }}
          onClick={(e) => { e.stopPropagation(); onPlay(); }}
        >
          PLAY NOW
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

  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const cycle = async () => {
      await new Promise<void>((r) => setTimeout(r, 2200));
      while (!cancelled) {
        for (let i = 0; i < 3; i++) {
          if (cancelled) return;
          setTick((t) => t + 1);
          await new Promise<void>((r) => setTimeout(r, 620));
        }
        await new Promise<void>((r) => setTimeout(r, 8000));
      }
    };
    cycle();
    return () => { cancelled = true; };
  }, []);

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
          { value: stats ? activePlayers.toLocaleString() : "—", label: "Active Players", icon: "🎮" },
          { value: stats ? gamesPlayed.toLocaleString()   : "—", label: "Games Played",   icon: "🏆" },
          { value: stats ? winnersToday.toLocaleString()  : "—", label: "Winners Today",  icon: "🎉" },
        ].map(({ value, label, icon }, i, arr) => (
          <div key={label} style={{ ...s.statItem, ...(i < arr.length - 1 ? s.statBorder : {}) }}>
            <span style={s.statIcon}>{icon}</span>
            <div style={s.statValueClip}>
              <span key={tick} className="stat-roll" style={s.statValue}>{value}</span>
            </div>
            <span style={s.statLabel}>{label}</span>
          </div>
        ))}
      </div>

      <p style={s.botTag}>@novabingo_bot</p>
    </div>
  );
}

// ── Count-up hook ─────────────────────────────────────────────────────────────
function useCountUp(target: number | undefined, duration = 1500) {
  const [value, setValue] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (target === undefined || started.current) return;
    started.current = true;
    let raf: number;
    let t0: number | null = null;
    const step = (ts: number) => {
      if (!t0) t0 = ts;
      const p = Math.min((ts - t0) / duration, 1);
      setValue(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// ── Card styles ───────────────────────────────────────────────────────────────
const c: Record<string, React.CSSProperties> = {
  card: {
    borderRadius: "18px",
    overflow: "hidden",
    background: "#12102a",
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    cursor: "pointer",
    flex: 1,
  },
  artwork: {
    position: "relative",
    height: "160px",
    overflow: "hidden",
  },
  gridLines: {
    position: "absolute",
    inset: 0,
    backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
    backgroundSize: "24px 24px",
  },
  bingoWordWrap: {
    position: "absolute",
    bottom: "12px",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    gap: "2px",
  },
  bingoLetter: {
    fontSize: "22px",
    fontWeight: 900,
    letterSpacing: "3px",
    lineHeight: 1,
  },
  badge: {
    position: "absolute",
    top: "10px",
    left: "10px",
    display: "flex",
    alignItems: "center",
    gap: "5px",
    padding: "3px 9px",
    borderRadius: "20px",
    fontSize: "9px",
    fontWeight: 800,
    letterSpacing: "0.8px",
    textTransform: "uppercase" as const,
  },
  badgeLive: {
    background: "rgba(0,200,83,0.2)",
    border: "1px solid rgba(0,200,83,0.6)",
    color: "#00c853",
  },
  badgeWait: {
    background: "rgba(245,166,35,0.2)",
    border: "1px solid rgba(245,166,35,0.5)",
    color: "#f5a623",
  },
  badgeOff: {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "rgba(255,255,255,0.4)",
  },
  liveDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "#00c853",
    display: "inline-block",
  },
  stakeBadge: {
    position: "absolute",
    top: "10px",
    right: "10px",
    padding: "3px 9px",
    borderRadius: "20px",
    fontSize: "10px",
    fontWeight: 800,
    color: "#fff",
    letterSpacing: "0.3px",
  },
  info: {
    padding: "12px 14px 14px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  infoTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  gameName: {
    fontSize: "14px",
    fontWeight: 800,
    color: "#fff",
    letterSpacing: "0.2px",
  },
  stakeLabel: {
    fontSize: "10px",
    color: "rgba(255,255,255,0.4)",
    fontWeight: 500,
  },
  statsRow: {
    display: "flex",
    gap: "8px",
  },
  statChip: {
    flex: 1,
    background: "rgba(255,255,255,0.06)",
    borderRadius: "8px",
    padding: "6px 8px",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  statChipVal: {
    fontSize: "12px",
    fontWeight: 800,
    color: "#fff",
    lineHeight: 1,
  },
  statChipLbl: {
    fontSize: "8px",
    color: "rgba(255,255,255,0.35)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.4px",
    fontWeight: 500,
  },
  playBtn: {
    width: "100%",
    padding: "11px",
    borderRadius: "10px",
    border: "none",
    color: "#fff",
    fontSize: "13px",
    fontWeight: 800,
    letterSpacing: "1px",
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
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
  sectionLabel: {
    display: "flex",
    alignItems: "center",
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
};
