import { Play } from "lucide-react";
import { useEffect, useState } from "react";
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
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 4000);
    return () => clearInterval(id);
  }, []);

  const STATS = [
    { value: stats ? stats.activePlayers.toLocaleString() : "—",  label: "Active Players"  },
    { value: stats ? stats.gamesPlayed.toLocaleString()  : "—",  label: "Games Played"    },
    { value: stats ? stats.winnersToday.toLocaleString() : "—",  label: "Winners Today"   },
  ];

  if (authLoading || profileLoading) {
    return (
      <div style={styles.centered}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) return <ErrorMessage error={error} />;

  return (
    <div style={styles.page}>
      {/* ── Header ── */}
      <header style={styles.header}>
        <div className="logo-bounce" style={styles.logoRow}>
          <div style={styles.logoCircle}>
            <span style={styles.logoLetter}>N</span>
          </div>
          <span className="logo-shimmer-text" style={styles.appName}>Nova Bingo</span>
        </div>
      </header>

      {/* ── Hero ── */}
      <section style={styles.hero}>
        <h1 style={styles.heroTitle}>
          Welcome{" "}
          <span style={styles.heroName}>{profile?.first_name ?? ""}</span>
        </h1>
        <h2 style={styles.heroSub}>
          to <span style={styles.heroAccent}>Nova Bingo!</span>
        </h2>
      </section>

      {/* ── Stake card ── */}
      <section style={styles.stakeCard}>
        <div style={styles.stakeHeader}>
          <Play size={14} fill="var(--accent-orange)" color="var(--accent-orange)" />
          <span style={styles.stakeTitle}>Choose Your Stake</span>
        </div>

        <button
          className="btn-shake"
          style={{ ...styles.stakeBtn, background: "linear-gradient(90deg, #00b140, #00c853)" }}
          onClick={() => navigate("/play?stake=10")}
        >
          <Play size={16} fill="white" color="white" />
          <span>Play 10 ETB</span>
        </button>

        <button
          className="btn-shake"
          style={{ ...styles.stakeBtn, background: "linear-gradient(90deg, #1565c0, #4a90d9)" }}
          onClick={() => navigate("/play?stake=20")}
        >
          <Play size={16} fill="white" color="white" />
          <span>Play 20 ETB</span>
        </button>
      </section>

      {/* ── Stats ── */}
      <section style={styles.statsSection}>
        {STATS.map(({ value, label }, i) => (
          <div key={label} style={{ ...styles.statItem, ...(i < STATS.length - 1 ? styles.statItemBorder : {}) }}>
            <div style={styles.statValueClip}>
              <span key={tick} className="stat-roll" style={styles.statValue}>{value}</span>
            </div>
            <span style={styles.statLabel}>{label}</span>
          </div>
        ))}
      </section>

      {/* ── Bot tag ── */}
      <p style={styles.botTag}>@novabingo_bot</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(160deg, #1a1040 0%, #0d0b1e 60%)",
    display: "flex",
    flexDirection: "column",
    paddingBottom: "1rem",
  },
  centered: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
  },

  /* Header */
  header: {
    display: "flex",
    alignItems: "center",
    padding: "16px 20px",
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  logoCircle: {
    width: "36px",
    height: "36px",
    borderRadius: "10px",
    background: "linear-gradient(135deg, #f5a623, #e8860a)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  logoLetter: {
    fontSize: "18px",
    fontWeight: 800,
    color: "#fff",
  },
  appName: {
    fontSize: "17px",
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  /* Hero */
  hero: {
    textAlign: "center",
    padding: "24px 20px 8px",
  },
  heroTitle: {
    fontSize: "28px",
    fontWeight: 800,
    lineHeight: 1.2,
    marginBottom: "4px",
  },
  heroName: {
    color: "var(--accent-orange)",
  },
  heroSub: {
    fontSize: "28px",
    fontWeight: 800,
  },
  heroAccent: {
    color: "var(--accent-orange)",
  },

  /* Stake card */
  stakeCard: {
    margin: "24px 20px",
    border: "1px solid var(--border-card)",
    borderRadius: "var(--radius-xl)",
    padding: "20px",
    background: "rgba(255,255,255,0.03)",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  stakeHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    fontSize: "14px",
    fontWeight: 600,
  },
  stakeTitle: {
    color: "var(--text-primary)",
    fontSize: "15px",
    fontWeight: 600,
  },
  stakeBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    width: "100%",
    padding: "15px",
    borderRadius: "var(--radius-lg)",
    color: "#fff",
    fontSize: "16px",
    fontWeight: 700,
    letterSpacing: "0.3px",
    border: "none",
    cursor: "pointer",
  },

  /* Stats */
  statsSection: {
    margin: "8px 20px",
    borderRadius: "var(--radius-xl)",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.07)",
    backdropFilter: "blur(12px)",
    padding: "0",
    display: "flex",
    flexDirection: "row",
  },
  statItem: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px 8px",
  },
  statItemBorder: {
    borderRight: "1px solid rgba(255,255,255,0.07)",
  },
  statValueClip: {
    overflow: "hidden",
    lineHeight: 1,
    marginBottom: "2px",
  },
  statValue: {
    fontSize: "22px",
    fontWeight: 800,
    color: "var(--accent-orange)",
    letterSpacing: "-0.5px",
  },
  statLabel: {
    display: "block",
    fontSize: "11px",
    color: "rgba(255,255,255,0.35)",
    marginTop: "4px",
    letterSpacing: "0.03em",
    textTransform: "uppercase" as const,
  },

  /* Bot tag */
  botTag: {
    textAlign: "center",
    fontSize: "12px",
    color: "var(--text-secondary)",
    marginTop: "20px",
  },
};
