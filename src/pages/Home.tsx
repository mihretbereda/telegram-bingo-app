import { Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useStats } from "@/hooks/useStats";
import { LoadingSpinner, ErrorMessage } from "@/components/ui";

export default function Home() {
  const navigate = useNavigate();
  const { isLoading: authLoading, error, user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile(user?.id);
  const { data: stats } = useStats();

  if (authLoading || profileLoading) {
    return (
      <div style={s.centered}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) return <ErrorMessage error={error} />;

  return (
    <div style={s.page}>
      {/* ambient glow blob */}
      <div style={s.glow} />

      {/* ── Wordmark ── */}
      <header style={s.header}>
        <span className="logo-shimmer-text" style={s.wordmark}>Nova Bingo</span>
      </header>

      {/* ── Hero ── */}
      <section style={s.hero}>
        <p style={s.greeting}>Welcome back,</p>
        <h1 style={s.name}>{profile?.first_name ?? "Player"}</h1>
      </section>

      {/* ── Buttons ── */}
      <section style={s.buttons}>
        <button
          className="btn-shake"
          style={{ ...s.btn, ...s.btnGreen }}
          onClick={() => navigate("/play?stake=10")}
        >
          <Play size={17} fill="white" color="white" />
          <span>Play 10 ETB</span>
        </button>

        <button
          className="btn-shake"
          style={{ ...s.btn, ...s.btnBlue }}
          onClick={() => navigate("/play?stake=20")}
        >
          <Play size={17} fill="white" color="white" />
          <span>Play 20 ETB</span>
        </button>
      </section>

      {/* ── Stats row ── */}
      <div style={s.statsRow}>
        <StatPill value={stats?.activePlayers} label="Players" />
        <div style={s.statDivider} />
        <StatPill value={stats?.gamesPlayed} label="Games" />
        <div style={s.statDivider} />
        <StatPill value={stats?.winnersToday} label="Winners today" />
      </div>
    </div>
  );
}

function StatPill({ value, label }: { value: number | undefined; label: string }) {
  return (
    <div style={{ textAlign: "center" as const }}>
      <span style={{ display: "block", fontSize: "18px", fontWeight: 800, color: "#fff" }}>
        {value !== undefined ? value.toLocaleString() : "—"}
      </span>
      <span style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.35)", marginTop: "2px" }}>
        {label}
      </span>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0d0b1e",
    display: "flex",
    flexDirection: "column",
    padding: "0 24px 32px",
    position: "relative",
    overflow: "hidden",
  },
  centered: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
  },
  glow: {
    position: "absolute",
    top: "-80px",
    left: "50%",
    transform: "translateX(-50%)",
    width: "320px",
    height: "320px",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(245,166,35,0.12) 0%, transparent 70%)",
    pointerEvents: "none",
  },

  /* Wordmark */
  header: {
    paddingTop: "52px",
    paddingBottom: "8px",
    position: "relative",
  },
  wordmark: {
    fontSize: "15px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
  },

  /* Hero */
  hero: {
    paddingTop: "32px",
    paddingBottom: "48px",
  },
  greeting: {
    fontSize: "15px",
    fontWeight: 400,
    color: "rgba(255,255,255,0.4)",
    marginBottom: "6px",
    letterSpacing: "0.02em",
  },
  name: {
    fontSize: "38px",
    fontWeight: 900,
    color: "#fff",
    lineHeight: 1.1,
    letterSpacing: "-0.5px",
  },

  /* Buttons */
  buttons: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    marginBottom: "40px",
    position: "relative",
  },
  btn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    width: "100%",
    padding: "17px",
    borderRadius: "100px",
    color: "#fff",
    fontSize: "16px",
    fontWeight: 700,
    letterSpacing: "0.2px",
    border: "none",
    cursor: "pointer",
  },
  btnGreen: {
    background: "linear-gradient(90deg, #00b140, #00c853)",
    boxShadow: "0 8px 24px rgba(0,200,83,0.25)",
  },
  btnBlue: {
    background: "linear-gradient(90deg, #1565c0, #4a90d9)",
    boxShadow: "0 8px 24px rgba(74,144,217,0.25)",
  },

  /* Stats */
  statsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "20px",
    padding: "20px 0",
    borderTop: "1px solid rgba(255,255,255,0.06)",
  },
  statDivider: {
    width: "1px",
    height: "28px",
    background: "rgba(255,255,255,0.1)",
  },
};
