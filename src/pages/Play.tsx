import { useState, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, RefreshCw, X, Sparkles } from "lucide-react";

const BINGO_COLS = ["B", "I", "N", "G", "O"] as const;
const GRID_COLS = 8;
const TOTAL_NUMBERS = 600;

// ── Bingo card generation ──────────────────────────────────────────────────
function pickUnique(min: number, max: number, count: number): number[] {
  const pool = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

function generateCard(): (number | null)[][] {
  // Scale standard B-I-N-G-O ranges to 600 numbers
  const colRanges: [number, number][] = [
    [1, 120], [121, 240], [241, 360], [361, 480], [481, 600],
  ];
  const columns = colRanges.map(([min, max]) => pickUnique(min, max, 5));

  return Array.from({ length: 5 }, (_, row) =>
    columns.map((col, colIdx) =>
      row === 2 && colIdx === 2 ? null : col[row],
    ),
  );
}

// ── Component ──────────────────────────────────────────────────────────────
export default function Play() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const stake = searchParams.get("stake") ?? "10";

  const [called, setCalled]       = useState<Set<number>>(new Set());
  const [lastTapped, setLastTapped] = useState<number | null>(null);
  const [cardVisible, setCardVisible] = useState(false);

  const card     = useMemo(() => generateCard(), []);
  const cardNums = useMemo(
    () => new Set(card.flat().filter((n): n is number => n !== null)),
    [card],
  );

  const handleTap = useCallback((n: number) => {
    setCalled((prev) => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });
    setLastTapped(n);
    setCardVisible(true);
  }, []);

  const handleReset = () => {
    setCalled(new Set());
    setLastTapped(null);
    setCardVisible(false);
  };

  return (
    <div style={s.page}>
      {/* ── Header ── */}
      <header style={s.header}>
        <button style={s.iconBtn} onClick={() => navigate("/")}>
          <ArrowLeft size={20} />
          <span style={s.iconBtnLabel}>Back</span>
        </button>

        <div style={s.headerCenter}>
          <Sparkles size={14} color="var(--accent-orange)" />
          <span style={s.headerTitle}>Game Room</span>
        </div>

        <button style={s.iconBtn} onClick={handleReset}>
          <RefreshCw size={16} />
          <span style={s.iconBtnLabel}>Reset</span>
        </button>
      </header>

      {/* ── Info strip ── */}
      <div style={s.strip}>
        <Pill label="Main"  value="0 ETB"          />
        <div style={s.stripDivider} />
        <Pill label="Play"  value="0 ETB"          />
        <div style={s.stripDivider} />
        <Pill label="Stake" value={`${stake} ETB`} accent="var(--accent-orange)" />
        <div style={s.stripDivider} />
        <div style={s.timerPill}>
          <span style={s.timerDot} />
          <span style={s.timerText}>LIVE</span>
        </div>
      </div>

      {/* ── Called count badge ── */}
      {called.size > 0 && (
        <div style={s.calledBadge}>
          <span>{called.size} number{called.size !== 1 ? "s" : ""} called</span>
        </div>
      )}

      {/* ── Number grid ── */}
      <div style={s.gridWrap}>
        <div style={s.grid}>
          {Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1).map((n) => {
            const isCalled  = called.has(n);
            const isOnCard  = cardNums.has(n);
            const isLast    = n === lastTapped;
            return (
              <button
                key={n}
                onClick={() => handleTap(n)}
                style={{
                  ...s.cell,
                  ...(isCalled && isOnCard ? s.cellMatch  : {}),
                  ...(isCalled && !isOnCard ? s.cellCalled : {}),
                  ...(isLast ? s.cellLast : {}),
                }}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Bingo card bottom sheet ── */}
      <div
        style={{
          ...s.sheet,
          transform: cardVisible ? "translateY(0)" : "translateY(110%)",
        }}
      >
        {/* Handle + close */}
        <div style={s.sheetTop}>
          <div style={s.handle} />
          <button style={s.closeBtn} onClick={() => setCardVisible(false)}>
            <X size={18} />
          </button>
        </div>

        {/* Last called callout */}
        {lastTapped && (
          <div style={s.callout}>
            <span style={s.calloutLabel}>Last called</span>
            <span style={s.calloutNum}>{lastTapped}</span>
            {cardNums.has(lastTapped) ? (
              <span style={s.calloutHit}>✓ On your card!</span>
            ) : (
              <span style={s.calloutMiss}>Not on your card</span>
            )}
          </div>
        )}

        {/* BINGO header */}
        <div style={s.cardHeader}>
          {BINGO_COLS.map((c) => (
            <div key={c} style={s.colLabel}>{c}</div>
          ))}
        </div>

        {/* 5×5 grid */}
        <div style={s.cardGrid}>
          {card.map((row, ri) =>
            row.map((num, ci) => {
              const isFree = num === null;
              const isHit  = !isFree && called.has(num);
              const isNew  = num === lastTapped;
              return (
                <div
                  key={`${ri}-${ci}`}
                  style={{
                    ...s.cardCell,
                    ...(isFree ? s.cardFree : {}),
                    ...(isHit && !isFree ? s.cardHit  : {}),
                    ...(isNew ? s.cardNew : {}),
                  }}
                >
                  {isFree ? "★" : num}
                </div>
              );
            }),
          )}
        </div>
      </div>

      {/* Backdrop when sheet is open */}
      {cardVisible && (
        <div style={s.backdrop} onClick={() => setCardVisible(false)} />
      )}
    </div>
  );
}

function Pill({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={s.pill}>
      <span style={s.pillLabel}>{label}</span>
      <span style={{ ...s.pillValue, color: accent ?? "#fff" }}>{value}</span>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(160deg,#1a1040 0%,#0d0b1e 60%)",
    display: "flex",
    flexDirection: "column",
  },

  /* Header */
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    background: "rgba(26,16,64,0.9)",
    backdropFilter: "blur(12px)",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  iconBtn: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "10px",
    padding: "7px 12px",
    color: "#fff",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 600,
  },
  iconBtnLabel: { fontSize: "13px" },
  headerCenter: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  headerTitle: {
    fontSize: "16px",
    fontWeight: 700,
    color: "#fff",
  },

  /* Info strip */
  strip: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px",
    background: "rgba(255,255,255,0.04)",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  stripDivider: {
    width: "1px",
    height: "28px",
    background: "rgba(255,255,255,0.1)",
  },
  pill: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1px",
  },
  pillLabel: { fontSize: "10px", color: "rgba(255,255,255,0.4)", fontWeight: 500, textTransform: "uppercase" as const },
  pillValue: { fontSize: "13px", fontWeight: 700 },
  timerPill: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    background: "rgba(0,200,83,0.15)",
    borderRadius: "10px",
    padding: "4px 10px",
    border: "1px solid rgba(0,200,83,0.3)",
  },
  timerDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "#00c853",
    boxShadow: "0 0 6px #00c853",
    animation: "pulse 1.5s infinite",
  },
  timerText: { fontSize: "11px", fontWeight: 700, color: "#00c853", letterSpacing: "0.5px" },

  /* Called badge */
  calledBadge: {
    margin: "8px 16px 0",
    padding: "7px 14px",
    background: "rgba(245,166,35,0.1)",
    border: "1px solid rgba(245,166,35,0.25)",
    borderRadius: "10px",
    color: "var(--accent-orange)",
    fontSize: "12px",
    fontWeight: 600,
    textAlign: "center",
  },

  /* Number grid */
  gridWrap: {
    flex: 1,
    overflowY: "auto",
    padding: "10px 8px 24px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
    gap: "5px",
  },
  cell: {
    aspectRatio: "1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "8px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.7)",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s",
    padding: 0,
  },
  cellCalled: {
    background: "rgba(245,166,35,0.2)",
    border: "1px solid rgba(245,166,35,0.5)",
    color: "var(--accent-orange)",
    fontWeight: 700,
    boxShadow: "0 0 8px rgba(245,166,35,0.25)",
  },
  cellMatch: {
    background: "rgba(0,200,83,0.25)",
    border: "1px solid rgba(0,200,83,0.6)",
    color: "#00c853",
    fontWeight: 700,
    boxShadow: "0 0 10px rgba(0,200,83,0.3)",
  },
  cellLast: {
    boxShadow: "0 0 14px rgba(245,166,35,0.6)",
    transform: "scale(1.12)",
  },

  /* Bottom sheet */
  sheet: {
    position: "fixed",
    bottom: "var(--nav-height)",
    left: 0,
    right: 0,
    background: "linear-gradient(180deg,#1e1650 0%,#130f35 100%)",
    borderRadius: "24px 24px 0 0",
    border: "1px solid rgba(255,255,255,0.1)",
    borderBottom: "none",
    boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
    zIndex: 50,
    transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)",
    padding: "0 16px 20px",
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    zIndex: 49,
  },
  sheetTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 0 6px",
    position: "relative",
  },
  handle: {
    width: "40px",
    height: "4px",
    background: "rgba(255,255,255,0.2)",
    borderRadius: "2px",
  },
  closeBtn: {
    position: "absolute",
    right: 0,
    top: "8px",
    background: "rgba(255,255,255,0.1)",
    border: "none",
    borderRadius: "8px",
    padding: "6px",
    color: "rgba(255,255,255,0.6)",
    cursor: "pointer",
    display: "flex",
  },

  /* Callout */
  callout: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    background: "rgba(255,255,255,0.05)",
    borderRadius: "12px",
    padding: "10px 14px",
    marginBottom: "12px",
  },
  calloutLabel: { fontSize: "11px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: "0.5px" },
  calloutNum: { fontSize: "22px", fontWeight: 800, color: "var(--accent-orange)", marginLeft: "auto" },
  calloutHit:  { fontSize: "12px", fontWeight: 600, color: "#00c853" },
  calloutMiss: { fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.4)" },

  /* Card header */
  cardHeader: {
    display: "grid",
    gridTemplateColumns: "repeat(5,1fr)",
    gap: "6px",
    marginBottom: "6px",
  },
  colLabel: {
    textAlign: "center",
    fontSize: "16px",
    fontWeight: 800,
    color: "var(--accent-orange)",
    padding: "4px 0",
  },

  /* 5×5 grid */
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5,1fr)",
    gap: "6px",
  },
  cardCell: {
    aspectRatio: "1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.1)",
    fontSize: "14px",
    fontWeight: 600,
    color: "#fff",
  },
  cardFree: {
    background: "linear-gradient(135deg,#f5a623,#e8860a)",
    border: "none",
    fontSize: "16px",
    color: "#fff",
  },
  cardHit: {
    background: "rgba(0,200,83,0.25)",
    border: "1px solid rgba(0,200,83,0.6)",
    color: "#00c853",
    fontWeight: 700,
    boxShadow: "0 0 10px rgba(0,200,83,0.3)",
  },
  cardNew: {
    boxShadow: "0 0 14px rgba(245,166,35,0.5)",
    border: "1px solid var(--accent-orange)",
    color: "var(--accent-orange)",
  },
};
