import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { X, Zap, ZapOff, ChevronRight } from "lucide-react";
import { generateCartela, getBallLetter, getBallColor, BINGO_COLS } from "@/utils/bingo";

const KEYFRAMES = `
  @keyframes ballPop {
    0%   { transform: scale(0.3) rotate(-12deg); opacity: 0; }
    65%  { transform: scale(1.14) rotate(3deg);  opacity: 1; }
    100% { transform: scale(1)    rotate(0deg);  opacity: 1; }
  }
  @keyframes ringPulse {
    0%, 100% { opacity: 0.5; transform: scale(1); }
    50%       { opacity: 1;   transform: scale(1.06); }
  }
  .ball-pop  { animation: ballPop  0.45s cubic-bezier(0.175,0.885,0.32,1.275) both; }
  .ring-pulse { animation: ringPulse 2s ease-in-out infinite; }
`;

// ── Component ──────────────────────────────────────────────────────────────
export default function Game() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const stake   = searchParams.get("stake") ?? "10";
  const c1Param = searchParams.get("c1");
  const c2Param = searchParams.get("c2");
  const c1 = c1Param ? Number(c1Param) : null;
  const c2 = c2Param ? Number(c2Param) : null;

  // Random game metadata (replace with real data once backend exists)
  const [gameId] = useState(() => Math.random().toString(36).slice(2, 10).toUpperCase());
  const [players] = useState(() => Math.floor(Math.random() * 300) + 80);
  const pot = players * Number(stake);

  // Shuffled 1-75 determines call order
  const [shuffled] = useState<number[]>(() => {
    const arr = Array.from({ length: 75 }, (_, i) => i + 1);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  });

  const [callIndex, setCallIndex] = useState(0);
  const [autoMode, setAutoMode] = useState(false);

  const called      = useMemo(() => new Set(shuffled.slice(0, callIndex)), [shuffled, callIndex]);
  const currentBall = callIndex > 0 ? shuffled[callIndex - 1] : null;
  // Last 5 calls, most-recent first (index 0 = current ball)
  const recentBalls = useMemo(
    () => shuffled.slice(Math.max(0, callIndex - 5), callIndex).reverse(),
    [shuffled, callIndex],
  );

  // Auto-call every 4 seconds
  useEffect(() => {
    if (!autoMode || callIndex >= 75) return;
    const t = setInterval(() => setCallIndex((p) => Math.min(p + 1, 75)), 4000);
    return () => clearInterval(t);
  }, [autoMode, callIndex]);

  const callNext = useCallback(() => {
    if (callIndex < 75 && !autoMode) setCallIndex((p) => p + 1);
  }, [callIndex, autoMode]);

  const card1 = useMemo(() => (c1 !== null ? generateCartela(c1) : null), [c1]);
  const card2 = useMemo(() => (c2 !== null ? generateCartela(c2) : null), [c2]);

  const curColor  = currentBall ? getBallColor(currentBall)  : "#888";
  const curLetter = currentBall ? getBallLetter(currentBall) : null;

  return (
    <div style={s.page}>
      <style>{KEYFRAMES}</style>

      {/* ── Header ── */}
      <header style={s.header}>
        <button style={s.leaveBtn} onClick={() => navigate("/")}>
          <X size={16} />
          <span>Leave</span>
        </button>
        <div style={s.headerCenter}>
          <span style={s.gameIdChip}>#{gameId}</span>
          <span style={s.stakeTag}>{stake} ETB</span>
        </div>
        <span style={s.calledTag}>{callIndex}/75</span>
      </header>

      {/* ── Info bar ── */}
      <div style={s.infoBar}>
        <InfoChip label="Players" value={players.toString()} />
        <div style={s.infoDivider} />
        <InfoChip label="Pot" value={`${pot.toLocaleString()} ETB`} accent="#f5a623" />
        <div style={s.infoDivider} />
        <InfoChip label="Called" value={`${callIndex} / 75`} accent="#00c853" />
      </div>

      {/* ── Main split ── */}
      <div style={s.mainRow}>

        {/* Left: Master BINGO board */}
        <div style={s.boardPanel}>
          <div style={s.boardGrid}>
            {/* Column headers */}
            {BINGO_COLS.map(({ label, color }) => (
              <div key={label} style={{ ...s.colHeader, color }}>{label}</div>
            ))}

            {/* 15 rows × 5 columns */}
            {Array.from({ length: 15 }, (_, row) =>
              BINGO_COLS.map(({ min, color }) => {
                const n        = min + row;
                const isCalled = called.has(n);
                const isCur    = n === currentBall;
                return (
                  <div
                    key={n}
                    style={{
                      ...s.boardCell,
                      ...(isCalled && !isCur ? {
                        background: color + "28",
                        border: `1px solid ${color}70`,
                        color,
                        fontWeight: 700,
                      } : {}),
                      ...(isCur ? {
                        background: color,
                        border: `1px solid ${color}`,
                        color: "#fff",
                        fontWeight: 800,
                        boxShadow: `0 0 10px ${color}99`,
                        transform: "scale(1.08)",
                        zIndex: 1,
                      } : {}),
                    }}
                  >
                    {n}
                  </div>
                );
              }),
            )}
          </div>
        </div>

        {/* Right: Call display + Cartellas */}
        <div style={s.rightPanel}>

          {/* Recent calls row */}
          <div style={s.recentRow}>
            {recentBalls.map((n, i) => (
              <span
                key={n}
                style={{
                  ...s.recentChip,
                  opacity: 1 - i * 0.18,
                  background: getBallColor(n) + "25",
                  border: `1px solid ${getBallColor(n)}55`,
                  color: getBallColor(n),
                  fontSize: i === 0 ? "11px" : "10px",
                  fontWeight: i === 0 ? 700 : 500,
                }}
              >
                {getBallLetter(n)}-{n}
              </span>
            ))}
            {recentBalls.length === 0 && (
              <span style={s.recentEmpty}>No calls yet</span>
            )}
          </div>

          {/* Current ball */}
          <div style={s.ballWrap}>
            {currentBall !== null ? (
              <div
                key={currentBall}
                className="ball-pop"
                style={{
                  ...s.ball,
                  borderColor: curColor + "aa",
                  boxShadow: `0 0 28px ${curColor}55, 0 0 60px ${curColor}22, inset 0 0 16px ${curColor}11`,
                }}
              >
                <span style={{ ...s.ballLetter, color: curColor }}>{curLetter}</span>
                <span style={s.ballNumber}>{currentBall}</span>
              </div>
            ) : (
              <div style={s.ballPlaceholder}>
                <span style={s.ballPlaceholderText}>Ready</span>
              </div>
            )}
          </div>

          {/* Player cartellas */}
          {card1 !== null && c1 !== null && (
            <CartelaCard id={c1} card={card1} called={called} />
          )}
          {card2 !== null && c2 !== null && (
            <div style={{ marginTop: "8px" }}>
              <CartelaCard id={c2} card={card2} called={called} />
            </div>
          )}
          {card1 === null && card2 === null && (
            <div style={s.watchOnly}>
              <span style={s.watchTitle}>Watching Only</span>
              <span style={s.watchSub}>No cartela was selected</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom action bar ── */}
      <div style={s.bottomBar}>
        <button style={s.leaveBarBtn} onClick={() => navigate("/")}>
          <X size={14} />
          <span>Leave</span>
        </button>

        <button
          style={{ ...s.autoBtn, ...(autoMode ? s.autoBtnOn : {}) }}
          onClick={() => setAutoMode((v) => !v)}
        >
          {autoMode ? <Zap size={14} /> : <ZapOff size={14} />}
          <span>{autoMode ? "Auto ON" : "Auto"}</span>
        </button>

        <button
          style={{
            ...s.nextBtn,
            ...(callIndex >= 75 || autoMode ? s.nextBtnOff : {}),
          }}
          onClick={callNext}
          disabled={callIndex >= 75 || autoMode}
        >
          <span>Next</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────
function InfoChip({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={s.infoChip}>
      <span style={s.infoLabel}>{label}</span>
      <span style={{ ...s.infoValue, color: accent ?? "#fff" }}>{value}</span>
    </div>
  );
}

function CartelaCard({
  id, card, called,
}: {
  id: number;
  card: (number | null)[][];
  called: Set<number>;
}) {
  const hits = card.flat().filter((n): n is number => n !== null && called.has(n)).length;

  return (
    <div style={cc.wrap}>
      <div style={cc.head}>
        <span style={cc.title}>Cartela #{id}</span>
        {hits > 0 && (
          <span style={cc.hitBadge}>{hits} matched</span>
        )}
      </div>
      <div style={cc.colRow}>
        {BINGO_COLS.map(({ label, color }) => (
          <span key={label} style={{ ...cc.colLabel, color }}>{label}</span>
        ))}
      </div>
      <div style={cc.grid}>
        {card.map((row, ri) =>
          row.map((num, ci) => {
            const isFree = num === null;
            const isHit  = !isFree && called.has(num);
            const col    = BINGO_COLS[ci];
            return (
              <div
                key={`${ri}-${ci}`}
                style={{
                  ...cc.cell,
                  ...(isFree ? cc.cellFree : {}),
                  ...(isHit ? {
                    background: col.color + "35",
                    border: `1px solid ${col.color}88`,
                    color: col.color,
                    fontWeight: 800,
                    boxShadow: `0 0 6px ${col.color}50`,
                  } : {}),
                }}
              >
                {isFree ? "★" : num}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: {
    height: "100vh",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    background: "linear-gradient(160deg,#120e2e 0%,#0d0b1e 100%)",
  },

  /* Header */
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    background: "rgba(16,11,44,0.98)",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    flexShrink: 0,
    height: "48px",
  },
  leaveBtn: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    background: "rgba(255,72,66,0.12)",
    border: "1px solid rgba(255,72,66,0.3)",
    borderRadius: "10px",
    padding: "5px 10px",
    color: "#ff4842",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
  },
  headerCenter: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2px",
    flex: 1,
  },
  gameIdChip: {
    fontSize: "13px",
    fontWeight: 800,
    color: "#fff",
    letterSpacing: "0.5px",
  },
  stakeTag: {
    fontSize: "10px",
    fontWeight: 600,
    color: "var(--accent-orange)",
    background: "rgba(245,166,35,0.12)",
    borderRadius: "5px",
    padding: "1px 6px",
  },
  calledTag: {
    fontSize: "12px",
    fontWeight: 700,
    color: "rgba(255,255,255,0.5)",
    background: "rgba(255,255,255,0.07)",
    borderRadius: "8px",
    padding: "4px 8px",
    flexShrink: 0,
  },

  /* Info bar */
  infoBar: {
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    flexShrink: 0,
    height: "36px",
    background: "rgba(255,255,255,0.03)",
  },
  infoChip: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    flex: 1,
  },
  infoLabel: {
    fontSize: "8px",
    color: "rgba(255,255,255,0.35)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    fontWeight: 500,
  },
  infoValue: {
    fontSize: "11px",
    fontWeight: 700,
  },
  infoDivider: {
    width: "1px",
    height: "20px",
    background: "rgba(255,255,255,0.1)",
    margin: "0 8px",
  },

  /* Main split row */
  mainRow: {
    flex: 1,
    display: "flex",
    flexDirection: "row",
    overflow: "hidden",
    minHeight: 0,
  },

  /* Left: BINGO master board */
  boardPanel: {
    flex: "0 0 42%",
    overflowY: "auto" as const,
    padding: "6px",
    borderRight: "1px solid rgba(255,255,255,0.07)",
  },
  boardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: "2px",
  },
  colHeader: {
    textAlign: "center" as const,
    fontSize: "13px",
    fontWeight: 800,
    padding: "5px 0",
    letterSpacing: "0.5px",
  },
  boardCell: {
    aspectRatio: "1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "5px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.07)",
    fontSize: "10px",
    fontWeight: 500,
    color: "rgba(255,255,255,0.5)",
    transition: "all 0.2s",
    position: "relative" as const,
  },

  /* Right panel */
  rightPanel: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "6px 8px 8px 6px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },

  /* Recent calls */
  recentRow: {
    display: "flex",
    gap: "4px",
    flexWrap: "wrap" as const,
    flexShrink: 0,
  },
  recentChip: {
    borderRadius: "6px",
    padding: "2px 6px",
    fontWeight: 600,
    fontSize: "10px",
    letterSpacing: "0.3px",
  },
  recentEmpty: {
    fontSize: "10px",
    color: "rgba(255,255,255,0.25)",
    fontStyle: "italic" as const,
  },

  /* Current ball */
  ballWrap: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "4px 0 6px",
    flexShrink: 0,
  },
  ball: {
    width: "88px",
    height: "88px",
    borderRadius: "50%",
    border: "2.5px solid",
    background: "rgba(255,255,255,0.05)",
    backdropFilter: "blur(10px)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0px",
  },
  ballLetter: {
    fontSize: "16px",
    fontWeight: 800,
    lineHeight: 1,
    letterSpacing: "1px",
  },
  ballNumber: {
    fontSize: "28px",
    fontWeight: 900,
    color: "#fff",
    lineHeight: 1.1,
  },
  ballPlaceholder: {
    width: "88px",
    height: "88px",
    borderRadius: "50%",
    border: "2px dashed rgba(255,255,255,0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  ballPlaceholderText: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.25)",
    fontWeight: 500,
  },

  /* Watching only */
  watchOnly: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    padding: "16px 8px",
    background: "rgba(255,255,255,0.03)",
    borderRadius: "12px",
    border: "1px dashed rgba(255,255,255,0.1)",
  },
  watchTitle: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#fff",
  },
  watchSub: {
    fontSize: "11px",
    color: "rgba(255,255,255,0.3)",
    textAlign: "center" as const,
  },

  /* Bottom action bar */
  bottomBar: {
    display: "flex",
    gap: "8px",
    padding: "8px 12px",
    background: "rgba(16,11,44,0.98)",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    flexShrink: 0,
    height: "56px",
    alignItems: "center",
  },
  leaveBarBtn: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "10px 14px",
    borderRadius: "12px",
    background: "rgba(255,72,66,0.12)",
    border: "1px solid rgba(255,72,66,0.3)",
    color: "#ff4842",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
  },
  autoBtn: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "5px",
    padding: "10px",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.6)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  autoBtnOn: {
    background: "rgba(245,166,35,0.18)",
    border: "1px solid rgba(245,166,35,0.5)",
    color: "var(--accent-orange)",
    boxShadow: "0 0 14px rgba(245,166,35,0.2)",
  },
  nextBtn: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "5px",
    padding: "10px",
    borderRadius: "12px",
    background: "linear-gradient(90deg,#3a1c6e,#4a90d9)",
    border: "none",
    color: "#fff",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(74,144,217,0.3)",
  },
  nextBtnOff: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "rgba(255,255,255,0.25)",
    cursor: "not-allowed",
    boxShadow: "none",
  },
};

// Cartela card styles
const cc: Record<string, React.CSSProperties> = {
  wrap: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "12px",
    padding: "8px",
    flexShrink: 0,
  },
  head: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "5px",
  },
  title: {
    fontSize: "11px",
    fontWeight: 700,
    color: "rgba(255,255,255,0.7)",
  },
  hitBadge: {
    fontSize: "9px",
    fontWeight: 700,
    color: "#00c853",
    background: "rgba(0,200,83,0.15)",
    border: "1px solid rgba(0,200,83,0.35)",
    borderRadius: "6px",
    padding: "1px 6px",
  },
  colRow: {
    display: "grid",
    gridTemplateColumns: "repeat(5,1fr)",
    gap: "2px",
    marginBottom: "3px",
  },
  colLabel: {
    textAlign: "center" as const,
    fontSize: "9px",
    fontWeight: 800,
    letterSpacing: "0.5px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(5,1fr)",
    gap: "2px",
  },
  cell: {
    aspectRatio: "1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "5px",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.08)",
    fontSize: "10px",
    fontWeight: 600,
    color: "rgba(255,255,255,0.75)",
    transition: "all 0.2s",
  },
  cellFree: {
    background: "linear-gradient(135deg,#f5a623,#e8860a)",
    border: "none",
    color: "#fff",
    fontSize: "11px",
  },
};
