import { useState } from "react";
import { Trophy, TrendingDown, Dices, CalendarDays } from "lucide-react";

type Filter = "all" | "won" | "lost";

// Placeholder — replace with real data once game tables exist
const MOCK_GAMES: {
  id: string;
  date: string;
  stake: number;
  result: "won" | "lost";
  earnings: number;
}[] = [];

export default function History() {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = MOCK_GAMES.filter(
    (g) => filter === "all" || g.result === filter,
  );

  const totalGames = MOCK_GAMES.length;
  const totalWon   = MOCK_GAMES.filter((g) => g.result === "won").length;
  const totalLost  = MOCK_GAMES.filter((g) => g.result === "lost").length;

  return (
    <div style={styles.page}>
      {/* ── Banner ── */}
      <div style={styles.banner}>
        <h1 style={styles.bannerTitle}>Game History</h1>

        <div style={styles.summaryRow}>
          <div style={styles.summaryCard}>
            <span style={styles.summaryValue}>{totalGames}</span>
            <span style={styles.summaryLabel}>Total</span>
          </div>
          <div style={{ ...styles.summaryCard, borderColor: "rgba(0,200,83,0.35)" }}>
            <span style={{ ...styles.summaryValue, color: "#00c853" }}>{totalWon}</span>
            <span style={styles.summaryLabel}>Won</span>
          </div>
          <div style={{ ...styles.summaryCard, borderColor: "rgba(255,72,66,0.35)" }}>
            <span style={{ ...styles.summaryValue, color: "#ff4842" }}>{totalLost}</span>
            <span style={styles.summaryLabel}>Lost</span>
          </div>
        </div>
      </div>

      {/* ── Filter pills ── */}
      <div style={styles.filters}>
        {(["all", "won", "lost"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              ...styles.pill,
              ...(filter === f ? styles.pillActive : styles.pillInactive),
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* ── List ── */}
      <div style={styles.list}>
        {filtered.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          filtered.map((game) => (
            <div key={game.id} style={styles.gameCard}>
              <div
                style={{
                  ...styles.resultBadge,
                  background:
                    game.result === "won"
                      ? "rgba(0,200,83,0.15)"
                      : "rgba(255,72,66,0.15)",
                }}
              >
                {game.result === "won" ? (
                  <Trophy size={18} color="#00c853" />
                ) : (
                  <TrendingDown size={18} color="#ff4842" />
                )}
              </div>
              <div style={styles.gameInfo}>
                <span style={styles.gameTitle}>
                  {game.result === "won" ? "Victory" : "Defeat"} · {game.stake} ETB
                </span>
                <span style={styles.gameDate}>
                  <CalendarDays size={11} style={{ marginRight: 4 }} />
                  {game.date}
                </span>
              </div>
              <span
                style={{
                  ...styles.gameEarnings,
                  color: game.result === "won" ? "#00c853" : "#ff4842",
                }}
              >
                {game.result === "won" ? "+" : "-"}{game.earnings} ETB
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  const messages: Record<Filter, string> = {
    all:  "No games played yet",
    won:  "No wins yet — keep playing!",
    lost: "No losses — you're on fire!",
  };

  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyIcon}>
        <Dices size={40} color="rgba(245,166,35,0.6)" strokeWidth={1.5} />
      </div>
      <p style={styles.emptyText}>{messages[filter]}</p>
      <p style={styles.emptyHint}>Your completed games will show up here.</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(160deg, #1a1040 0%, #0d0b1e 60%)",
  },

  /* Banner */
  banner: {
    background: "linear-gradient(135deg, #3a1c6e 0%, #1a1040 100%)",
    padding: "28px 20px 24px",
  },
  bannerTitle: {
    fontSize: "26px",
    fontWeight: 800,
    color: "#fff",
    marginBottom: "18px",
  },
  summaryRow: {
    display: "flex",
    gap: "12px",
  },
  summaryCard: {
    flex: 1,
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "14px",
    padding: "14px 12px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
    backdropFilter: "blur(8px)",
  },
  summaryValue: {
    fontSize: "24px",
    fontWeight: 800,
    color: "#fff",
  },
  summaryLabel: {
    fontSize: "11px",
    color: "rgba(255,255,255,0.5)",
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },

  /* Filters */
  filters: {
    display: "flex",
    gap: "8px",
    padding: "18px 20px 8px",
  },
  pill: {
    padding: "7px 20px",
    borderRadius: "20px",
    fontSize: "13px",
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  pillActive: {
    background: "var(--accent-orange)",
    color: "#fff",
  },
  pillInactive: {
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.5)",
  },

  /* List */
  list: {
    padding: "8px 20px 24px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  gameCard: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "14px",
    padding: "14px 16px",
    backdropFilter: "blur(6px)",
  },
  resultBadge: {
    width: "42px",
    height: "42px",
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  gameInfo: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  gameTitle: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#fff",
  },
  gameDate: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.4)",
    display: "flex",
    alignItems: "center",
  },
  gameEarnings: {
    fontSize: "15px",
    fontWeight: 700,
  },

  /* Empty */
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    paddingTop: "60px",
    gap: "12px",
  },
  emptyIcon: {
    width: "80px",
    height: "80px",
    borderRadius: "24px",
    background: "rgba(245,166,35,0.08)",
    border: "1px solid rgba(245,166,35,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "8px",
  },
  emptyText: {
    fontSize: "16px",
    fontWeight: 600,
    color: "#fff",
  },
  emptyHint: {
    fontSize: "13px",
    color: "rgba(255,255,255,0.4)",
  },
};
