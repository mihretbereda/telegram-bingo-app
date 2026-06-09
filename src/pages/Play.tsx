import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, X, Plus, Trash2, Clock, CheckCircle2 } from "lucide-react";

const BINGO_LABELS = ["B", "I", "N", "G", "O"] as const;
const TOTAL = 600;
const GRID_COLS = 8;
const MAX_PICKS = 2;
const INIT_TIME = 60;

// ── Deterministic cartela generation ──────────────────────────────────────
function xorshift(seed: number) {
  let s = (seed ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17; s >>>= 0;
    s ^= s << 5;  s >>>= 0;
    return s / 0x100000000;
  };
}

function generateCartela(id: number): (number | null)[][] {
  // B:1-120  I:121-240  N:241-360  G:361-480  O:481-600
  const ranges: [number, number][] = [
    [1, 120], [121, 240], [241, 360], [361, 480], [481, 600],
  ];
  const columns = ranges.map(([min, max], ci) => {
    const rng = xorshift(id * 601 + ci * 127);
    const pool = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 5);
  });
  return Array.from({ length: 5 }, (_, row) =>
    columns.map((col, ci) => (row === 2 && ci === 2 ? null : col[row])),
  );
}

// ── Component ──────────────────────────────────────────────────────────────
export default function Play() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const stake = searchParams.get("stake") ?? "10";

  const [timeLeft, setTimeLeft]   = useState(INIT_TIME);
  const [selected, setSelected]   = useState<number[]>([]);
  const [previewId, setPreviewId] = useState<number | null>(null);

  // Countdown
  useEffect(() => {
    const t = setInterval(() => setTimeLeft((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const previewCard = useMemo(
    () => (previewId !== null ? generateCartela(previewId) : null),
    [previewId],
  );

  const handleTap = useCallback((n: number) => setPreviewId(n), []);

  const isSelected = previewId !== null && selected.includes(previewId);
  const canAdd     = !isSelected && selected.length < MAX_PICKS;

  const handleSelectToggle = useCallback(() => {
    if (previewId === null) return;
    setSelected((prev) =>
      prev.includes(previewId)
        ? prev.filter((id) => id !== previewId)
        : prev.length < MAX_PICKS
          ? [...prev, previewId]
          : prev,
    );
    setPreviewId(null);
  }, [previewId]);

  const handleRemove = useCallback((id: number) => {
    setSelected((prev) => prev.filter((v) => v !== id));
  }, []);

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
        <WalletPill label="Main"  value="0 ETB"           />
        <div style={s.stripDiv} />
        <WalletPill label="Play"  value="0 ETB"           />
        <div style={s.stripDiv} />
        <WalletPill label="Stake" value={`${stake} ETB`}  accent="var(--accent-orange)" />
      </div>

      {/* ── Number grid card (60-65% page height) ── */}
      <div style={s.gridCard}>
        <div style={s.gridCardHead}>
          <span style={s.gridCardTitle}>Pick Your Cartela</span>
          <span style={s.gridCardSub}>{selected.length}/{MAX_PICKS} selected · tap to preview</span>
        </div>

        <div style={s.gridScroll}>
          <div style={s.grid}>
            {Array.from({ length: TOTAL }, (_, i) => i + 1).map((n) => {
              const isSel  = selected.includes(n);
              const isPrev = n === previewId;
              return (
                <button
                  key={n}
                  onClick={() => handleTap(n)}
                  style={{
                    ...s.cell,
                    ...(isSel  ? s.cellSel  : {}),
                    ...(isPrev && !isSel ? s.cellPrev : {}),
                  }}
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
          <span style={s.mySectionCount}>{selected.length} / {MAX_PICKS}</span>
        </div>

        <div style={s.slots}>
          {Array.from({ length: MAX_PICKS }, (_, i) => {
            const id = selected[i];
            return id !== undefined ? (
              <MiniCard
                key={id}
                id={id}
                card={generateCartela(id)}
                onRemove={() => handleRemove(id)}
              />
            ) : (
              <EmptySlot key={i} label={i === 0 ? "Tap a number above" : "Optional 2nd cartela"} />
            );
          })}
        </div>

        {selected.length > 0 && (
          <button style={s.confirmBtn}>
            <CheckCircle2 size={16} />
            <span>Confirm &amp; Play</span>
          </button>
        )}
      </div>

      {/* ── Preview bottom sheet ── */}
      {previewId !== null && previewCard && (
        <>
          <div style={s.backdrop} onClick={() => setPreviewId(null)} />

          <div style={s.sheet}>
            {/* Drag handle + close */}
            <div style={s.sheetHandle}>
              <div style={s.handle} />
              <button style={s.closeBtn} onClick={() => setPreviewId(null)}>
                <X size={16} />
              </button>
            </div>

            {/* Title row */}
            <div style={s.sheetTitleRow}>
              <span style={s.sheetTitle}>Cartela <span style={s.sheetNum}>#{previewId}</span></span>
              {isSelected && (
                <span style={s.selectedBadge}>✓ Selected</span>
              )}
            </div>

            {/* BINGO column labels */}
            <div style={s.cardCols}>
              {BINGO_LABELS.map((c) => (
                <div key={c} style={s.cardColLabel}>{c}</div>
              ))}
            </div>

            {/* 5×5 grid */}
            <div style={s.cardGrid}>
              {previewCard.map((row, ri) =>
                row.map((num, ci) => {
                  const isFree = num === null;
                  return (
                    <div
                      key={`${ri}-${ci}`}
                      style={{ ...s.cardCell, ...(isFree ? s.cardCellFree : {}) }}
                    >
                      {isFree ? "★" : num}
                    </div>
                  );
                }),
              )}
            </div>

            {/* Action button */}
            <button
              onClick={handleSelectToggle}
              disabled={!canAdd && !isSelected}
              style={{
                ...s.actionBtn,
                ...(isSelected  ? s.actionBtnRemove   : {}),
                ...(!canAdd && !isSelected ? s.actionBtnDisabled : {}),
              }}
            >
              {isSelected ? (
                <><Trash2 size={15} /><span>Remove Cartela</span></>
              ) : canAdd ? (
                <><Plus size={15} /><span>Select Cartela #{previewId}</span></>
              ) : (
                <span>Already have 2 cartellas</span>
              )}
            </button>
          </div>
        </>
      )}
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
  id, card, onRemove,
}: {
  id: number;
  card: (number | null)[][];
  onRemove: () => void;
}) {
  return (
    <div style={s.miniCard}>
      <div style={s.miniCardHead}>
        <span style={s.miniCardId}>#{id}</span>
        <button style={s.miniRemove} onClick={onRemove}>
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

function EmptySlot({ label }: { label: string }) {
  return (
    <div style={s.emptySlot}>
      <div style={s.emptyIcon}>
        <Plus size={18} color="rgba(255,255,255,0.25)" />
      </div>
      <span style={s.emptyLabel}>{label}</span>
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
    height: "calc(62vh - 110px)",  // ~60-65% of viewport, accounting for header/strip
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
  cellPrev: {
    background: "rgba(245,166,35,0.2)",
    border: "1px solid rgba(245,166,35,0.5)",
    color: "var(--accent-orange)",
    fontWeight: 700,
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

  /* Mini cartela card */
  miniCard: {
    flex: 1,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(0,200,83,0.35)",
    borderRadius: "14px",
    padding: "8px",
    boxShadow: "0 0 12px rgba(0,200,83,0.1)",
  },
  miniCardHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "5px",
  },
  miniCardId: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#00c853",
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

  /* Bottom sheet */
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    zIndex: 49,
  },
  sheet: {
    position: "fixed",
    bottom: "var(--nav-height)",
    left: 0,
    right: 0,
    background: "linear-gradient(180deg,#211858 0%,#130f35 100%)",
    borderRadius: "22px 22px 0 0",
    border: "1px solid rgba(255,255,255,0.1)",
    borderBottom: "none",
    boxShadow: "0 -6px 40px rgba(0,0,0,0.65)",
    zIndex: 50,
    padding: "0 16px 20px",
  },
  sheetHandle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 0 6px",
    position: "relative",
  },
  handle: {
    width: "36px",
    height: "4px",
    background: "rgba(255,255,255,0.18)",
    borderRadius: "2px",
  },
  closeBtn: {
    position: "absolute",
    right: 0,
    top: "8px",
    background: "rgba(255,255,255,0.08)",
    border: "none",
    borderRadius: "8px",
    padding: "6px",
    color: "rgba(255,255,255,0.5)",
    cursor: "pointer",
    display: "flex",
  },
  sheetTitleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "12px",
  },
  sheetTitle: {
    fontSize: "17px",
    fontWeight: 700,
    color: "#fff",
  },
  sheetNum: {
    color: "var(--accent-orange)",
  },
  selectedBadge: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#00c853",
    background: "rgba(0,200,83,0.15)",
    border: "1px solid rgba(0,200,83,0.35)",
    borderRadius: "8px",
    padding: "3px 10px",
  },

  /* Cartela preview */
  cardCols: {
    display: "grid",
    gridTemplateColumns: "repeat(5,1fr)",
    gap: "5px",
    marginBottom: "5px",
  },
  cardColLabel: {
    textAlign: "center" as const,
    fontSize: "15px",
    fontWeight: 800,
    color: "var(--accent-orange)",
    padding: "3px 0",
  },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5,1fr)",
    gap: "5px",
    marginBottom: "14px",
  },
  cardCell: {
    aspectRatio: "1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "9px",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.1)",
    fontSize: "13px",
    fontWeight: 600,
    color: "#fff",
  },
  cardCellFree: {
    background: "linear-gradient(135deg,#f5a623,#e8860a)",
    border: "none",
    fontSize: "15px",
  },

  /* Action button */
  actionBtn: {
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
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(0,200,83,0.3)",
  },
  actionBtnRemove: {
    background: "rgba(255,72,66,0.15)",
    border: "1px solid rgba(255,72,66,0.3)",
    color: "#ff4842",
    boxShadow: "none",
  },
  actionBtnDisabled: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "rgba(255,255,255,0.3)",
    cursor: "not-allowed",
    boxShadow: "none",
  },
};
