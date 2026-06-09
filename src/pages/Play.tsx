import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, X, Plus, Clock, CheckCircle2 } from "lucide-react";
import { generateCartela, BINGO_COLS } from "@/utils/bingo";

const BINGO_LABELS = BINGO_COLS.map((c) => c.label) as ["B","I","N","G","O"];
const TOTAL = 600;
const GRID_COLS = 8;
const INIT_TIME = 60;

// ── Component ──────────────────────────────────────────────────────────────
export default function Play() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const stake = searchParams.get("stake") ?? "10";

  const [timeLeft, setTimeLeft] = useState(INIT_TIME);
  // cartellas[0] = Card Holder 1, cartellas[1] = Card Holder 2
  const [cartellas, setCartellas] = useState<[number | null, number | null]>([null, null]);
  // activeSlot: which card holder receives the next tap (0 = Holder 1, 1 = Holder 2)
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);

  // Countdown
  useEffect(() => {
    const t = setInterval(() => setTimeLeft((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  // Navigate to game when timer reaches 0
  const navigated = useRef(false);
  useEffect(() => {
    if (timeLeft === 0 && !navigated.current) {
      navigated.current = true;
      const params = new URLSearchParams({ stake });
      if (cartellas[0] !== null) params.set("c1", String(cartellas[0]));
      if (cartellas[1] !== null) params.set("c2", String(cartellas[1]));
      navigate(`/game?${params.toString()}`);
    }
  }, [timeLeft, cartellas, stake, navigate]);

  // Immediately assign tapped number to the active card holder (replaces any existing)
  const handleTap = useCallback((n: number) => {
    setCartellas((prev) => {
      const next: [number | null, number | null] = [prev[0], prev[1]];
      next[activeSlot] = n;
      return next;
    });
  }, [activeSlot]);

  const handleRemove = useCallback((slot: 0 | 1) => {
    setCartellas((prev) => {
      const next: [number | null, number | null] = [prev[0], prev[1]];
      next[slot] = null;
      return next;
    });
  }, []);

  const filledCount = cartellas.filter((c) => c !== null).length;

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");
  const timerColor = timeLeft <= 10 ? "#ff4842" : timeLeft <= 20 ? "#f5a623" : "#00c853";

  return (
    <div style={s.page}>
      {/* ── Header ── */}
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate("/")}>
          <ArrowLeft size={18} />
          <span>Back</span>
        </button>

        <div style={s.headerMid}>
          <span style={s.pageTitle}>Cartela Selection</span>
          <span style={s.stakeChip}>{stake} ETB</span>
        </div>

        <div style={{ ...s.timerBox, borderColor: timerColor + "55", background: timerColor + "18" }}>
          <Clock size={12} color={timerColor} />
          <span style={{ ...s.timerText, color: timerColor }}>{mm}:{ss}</span>
        </div>
      </header>

      {/* ── Wallet info strip ── */}
      <div style={s.strip}>
        <WalletPill label="Main"  value="0 ETB"          />
        <div style={s.stripDiv} />
        <WalletPill label="Play"  value="0 ETB"          />
        <div style={s.stripDiv} />
        <WalletPill label="Stake" value={`${stake} ETB`} accent="var(--accent-orange)" />
      </div>

      {/* ── Number grid card (60-65% page height) ── */}
      <div style={s.gridCard}>
        <div style={s.gridCardHead}>
          <span style={s.gridCardTitle}>Pick Your Cartela</span>
          <span style={s.gridCardSub}>
            {filledCount}/2 selected · tap to assign to active holder
          </span>
        </div>

        <div style={s.gridScroll}>
          <div style={s.grid}>
            {Array.from({ length: TOTAL }, (_, i) => i + 1).map((n) => {
              const isSel = cartellas.includes(n);
              return (
                <button
                  key={n}
                  onClick={() => handleTap(n)}
                  style={{ ...s.cell, ...(isSel ? s.cellSel : {}) }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── My Cartellas ── */}
      <div style={s.mySection}>
        <div style={s.mySectionHead}>
          <span style={s.mySectionTitle}>My Cartellas</span>
          <span style={s.mySectionCount}>{filledCount} / 2</span>
        </div>

        <div style={s.slots}>
          {([0, 1] as const).map((slot) => {
            const id = cartellas[slot];
            const isActive = activeSlot === slot;
            return id !== null ? (
              <MiniCard
                key={slot}
                id={id}
                card={generateCartela(id)}
                isActive={isActive}
                onClick={() => setActiveSlot(slot)}
                onRemove={() => handleRemove(slot)}
              />
            ) : (
              <EmptySlot
                key={slot}
                label={slot === 0 ? "Tap a number above" : "Click to activate, then pick"}
                isActive={isActive}
                onClick={() => setActiveSlot(slot)}
              />
            );
          })}
        </div>

        {filledCount > 0 && (
          <button style={s.confirmBtn}>
            <CheckCircle2 size={16} />
            <span>Confirm &amp; Play</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────
function WalletPill({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={s.walletPill}>
      <span style={s.walletLabel}>{label}</span>
      <span style={{ ...s.walletValue, color: accent ?? "#fff" }}>{value}</span>
    </div>
  );
}

function MiniCard({
  id, card, isActive, onClick, onRemove,
}: {
  id: number;
  card: (number | null)[][];
  isActive: boolean;
  onClick: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        ...s.miniCard,
        ...(isActive ? s.miniCardActive : {}),
      }}
      onClick={onClick}
    >
      <div style={s.miniCardHead}>
        <div style={s.miniCardLeft}>
          {isActive && <span style={s.activeTag}>Active</span>}
          <span style={{ ...s.miniCardId, color: isActive ? "var(--accent-orange)" : "#00c853" }}>
            #{id}
          </span>
        </div>
        <button
          style={s.miniRemove}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          <X size={11} />
        </button>
      </div>
      <div style={s.miniColRow}>
        {BINGO_LABELS.map((c) => <span key={c} style={s.miniColLabel}>{c}</span>)}
      </div>
      <div style={s.miniGrid}>
        {card.map((row, ri) =>
          row.map((num, ci) => {
            const isFree = num === null;
            return (
              <div
                key={`${ri}-${ci}`}
                style={{ ...s.miniCell, ...(isFree ? s.miniCellFree : {}) }}
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

function EmptySlot({
  label, isActive, onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <div
      style={{ ...s.emptySlot, ...(isActive ? s.emptySlotActive : {}) }}
      onClick={onClick}
    >
      {isActive && <span style={s.activeTag}>Active</span>}
      <div style={{ ...s.emptyIcon, ...(isActive ? s.emptyIconActive : {}) }}>
        <Plus size={18} color={isActive ? "var(--accent-orange)" : "rgba(255,255,255,0.25)"} />
      </div>
      <span style={{ ...s.emptyLabel, ...(isActive ? { color: "rgba(245,166,35,0.7)" } : {}) }}>
        {label}
      </span>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    background: "linear-gradient(160deg,#1a1040 0%,#0d0b1e 60%)",
  },

  /* Header */
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    background: "rgba(20,14,50,0.95)",
    backdropFilter: "blur(10px)",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    position: "sticky",
    top: 0,
    zIndex: 10,
    gap: "8px",
  },
  backBtn: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "10px",
    padding: "6px 10px",
    color: "#fff",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    flexShrink: 0,
  },
  headerMid: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2px",
  },
  pageTitle: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#fff",
  },
  stakeChip: {
    fontSize: "10px",
    fontWeight: 600,
    color: "var(--accent-orange)",
    background: "rgba(245,166,35,0.12)",
    border: "1px solid rgba(245,166,35,0.3)",
    borderRadius: "6px",
    padding: "1px 7px",
  },
  timerBox: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    borderRadius: "10px",
    border: "1px solid",
    padding: "5px 10px",
    flexShrink: 0,
  },
  timerText: {
    fontSize: "13px",
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "0.5px",
  },

  /* Info strip */
  strip: {
    display: "flex",
    alignItems: "center",
    padding: "7px 16px",
    background: "rgba(255,255,255,0.03)",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    gap: "0",
  },
  stripDiv: {
    width: "1px",
    height: "24px",
    background: "rgba(255,255,255,0.1)",
    margin: "0 10px",
  },
  walletPill: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    flex: 1,
  },
  walletLabel: {
    fontSize: "9px",
    color: "rgba(255,255,255,0.38)",
    fontWeight: 500,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  walletValue: {
    fontSize: "12px",
    fontWeight: 700,
  },

  /* Grid card */
  gridCard: {
    margin: "10px 12px 0",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: "16px",
    display: "flex",
    flexDirection: "column",
    height: "calc(62vh - 110px)",
    overflow: "hidden",
  },
  gridCardHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px 8px",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    flexShrink: 0,
  },
  gridCardTitle: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#fff",
  },
  gridCardSub: {
    fontSize: "10px",
    color: "rgba(255,255,255,0.35)",
    fontWeight: 500,
  },
  gridScroll: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "8px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
    gap: "4px",
  },
  cell: {
    aspectRatio: "1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "7px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.07)",
    color: "rgba(255,255,255,0.65)",
    fontSize: "11px",
    fontWeight: 500,
    cursor: "pointer",
    padding: 0,
    transition: "all 0.12s",
  },
  cellSel: {
    background: "rgba(0,200,83,0.22)",
    border: "1px solid rgba(0,200,83,0.55)",
    color: "#00c853",
    fontWeight: 700,
    boxShadow: "0 0 6px rgba(0,200,83,0.25)",
  },

  /* My Cartellas */
  mySection: {
    padding: "10px 12px",
    flex: 1,
  },
  mySectionHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "8px",
  },
  mySectionTitle: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#fff",
  },
  mySectionCount: {
    fontSize: "11px",
    fontWeight: 600,
    color: "rgba(255,255,255,0.35)",
    background: "rgba(255,255,255,0.07)",
    borderRadius: "8px",
    padding: "2px 8px",
  },
  slots: {
    display: "flex",
    gap: "10px",
  },

  /* Active label tag */
  activeTag: {
    fontSize: "8px",
    fontWeight: 700,
    color: "var(--accent-orange)",
    background: "rgba(245,166,35,0.15)",
    border: "1px solid rgba(245,166,35,0.35)",
    borderRadius: "5px",
    padding: "1px 5px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.4px",
  },

  /* Mini cartela card */
  miniCard: {
    flex: 1,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(0,200,83,0.35)",
    borderRadius: "14px",
    padding: "8px",
    boxShadow: "0 0 12px rgba(0,200,83,0.1)",
    cursor: "pointer",
  },
  miniCardActive: {
    border: "1.5px solid rgba(245,166,35,0.65)",
    boxShadow: "0 0 16px rgba(245,166,35,0.2)",
    background: "rgba(245,166,35,0.06)",
  },
  miniCardHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "5px",
  },
  miniCardLeft: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
  },
  miniCardId: {
    fontSize: "11px",
    fontWeight: 700,
  },
  miniRemove: {
    background: "rgba(255,72,66,0.15)",
    border: "1px solid rgba(255,72,66,0.3)",
    borderRadius: "6px",
    padding: "3px",
    cursor: "pointer",
    color: "#ff4842",
    display: "flex",
    lineHeight: 1,
  },
  miniColRow: {
    display: "grid",
    gridTemplateColumns: "repeat(5,1fr)",
    gap: "2px",
    marginBottom: "2px",
  },
  miniColLabel: {
    textAlign: "center" as const,
    fontSize: "8px",
    fontWeight: 800,
    color: "var(--accent-orange)",
  },
  miniGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5,1fr)",
    gap: "2px",
  },
  miniCell: {
    aspectRatio: "1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "4px",
    background: "rgba(255,255,255,0.07)",
    fontSize: "8px",
    fontWeight: 600,
    color: "rgba(255,255,255,0.8)",
  },
  miniCellFree: {
    background: "linear-gradient(135deg,#f5a623,#e8860a)",
    color: "#fff",
    fontSize: "9px",
  },

  /* Empty slot */
  emptySlot: {
    flex: 1,
    background: "rgba(255,255,255,0.03)",
    border: "1px dashed rgba(255,255,255,0.12)",
    borderRadius: "14px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    padding: "14px 8px",
    minHeight: "90px",
    cursor: "pointer",
  },
  emptySlotActive: {
    border: "1.5px dashed rgba(245,166,35,0.55)",
    background: "rgba(245,166,35,0.05)",
    boxShadow: "0 0 14px rgba(245,166,35,0.12)",
  },
  emptyIcon: {
    width: "32px",
    height: "32px",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.05)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconActive: {
    background: "rgba(245,166,35,0.12)",
  },
  emptyLabel: {
    fontSize: "10px",
    color: "rgba(255,255,255,0.25)",
    fontWeight: 500,
    textAlign: "center" as const,
  },

  /* Confirm button */
  confirmBtn: {
    marginTop: "10px",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "13px",
    borderRadius: "14px",
    background: "linear-gradient(90deg,#00b140,#00c853)",
    border: "none",
    color: "#fff",
    fontSize: "15px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(0,200,83,0.35)",
  },
};
