import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, X, Plus, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { generateCartela, BINGO_COLS } from "@/utils/bingo";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { useGameSession } from "@/hooks/useGameSession";
import { useCartelaReservations } from "@/hooks/useCartelaReservations";
import { supabase } from "@/services/supabase";

const BINGO_LABELS = BINGO_COLS.map((c) => c.label) as ["B","I","N","G","O"];
const TOTAL      = 600;
const GRID_COLS  = 8;

export default function Play() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const stakeStr = searchParams.get("stake") ?? "10";
  const stake    = Number(stakeStr);

  const { session: authSession, user } = useAuth();
  const { data: wallet }      = useWallet(user?.id);
  const { data: gameSession } = useGameSession(stake);
  const { data: reservations, isFetched: reservationsFetched } = useCartelaReservations(gameSession?.id);

  // ── Active slot (which card holder the next tap goes to) ────────────────
  const [activeSlot, setActiveSlot] = useState<1 | 2>(1);
  const [reserving, setReserving] = useState(false);
  const [apiError, setApiError]   = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showError = useCallback((msg: string) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setApiError(msg);
    errorTimerRef.current = setTimeout(() => setApiError(null), 2000);
  }, []);

  // ── Server-derived timer ─────────────────────────────────────────────────
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!gameSession?.timer_ends_at) return;
    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(gameSession.timer_ends_at).getTime() - Date.now()) / 1000));
      setTimeLeft(diff);
    };
    update();
    const t = setInterval(update, 500);
    return () => clearInterval(t);
  }, [gameSession?.timer_ends_at]);

  // ── Navigate to game when session goes active ────────────────────────────
  const navigated = useRef(false);

  const goToGame = useCallback((session: typeof gameSession, reservations: typeof myReservations) => {
    if (!session || navigated.current) return;
    navigated.current = true;
    const c1 = reservations.find((r) => r.slot === 1)?.cartela_number;
    const c2 = reservations.find((r) => r.slot === 2)?.cartela_number;
    const params = new URLSearchParams({ session: session.id, stake: stakeStr });
    if (c1) params.set("c1", String(c1));
    if (c2) params.set("c2", String(c2));
    navigate(`/game?${params.toString()}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stakeStr, navigate]);

  // Navigate when realtime/poll delivers active status.
  // Wait for reservationsFetched so we never navigate with a stale empty list
  // (covers both: race between confirmed-update and active-update, and app reopen).
  useEffect(() => {
    if (gameSession?.status === "active" && reservationsFetched) goToGame(gameSession, myReservations);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameSession?.status, gameSession?.id, reservationsFetched]);

  // Belt-and-suspenders: on visibility restore, navigate immediately if already active
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && gameSession?.status === "active" && reservationsFetched) {
        goToGame(gameSession, myReservations);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameSession?.status, gameSession?.id, reservationsFetched]);

  // ── Client-side trigger: start game when timer counts DOWN to 0 ─────────
  // timerWasPositive tracks whether this timer was ever > 0 during this visit.
  // Without this guard, loading a page with an already-expired session sets
  // timeLeft null→0 in one render and immediately triggers start-game, sending
  // the user to the game before they see any countdown.
  const timerWasPositive = useRef(false);
  useEffect(() => {
    if ((timeLeft ?? 0) > 0) timerWasPositive.current = true;
  }, [timeLeft]);

  useEffect(() => {
    if (timeLeft !== 0 || !gameSession?.id || !authSession || navigated.current) return;
    if (!timerWasPositive.current) return; // timer was already expired on arrival — let cron handle it
    supabase.functions.invoke("start-game", { body: { session_id: gameSession.id } }).catch(() => {});
  }, [timeLeft, gameSession?.id, authSession]);

  // ── Release reservations on leave / unmount ───────────────────────────────
  const sessionIdRef = useRef<string | undefined>(undefined);
  useEffect(() => { sessionIdRef.current = gameSession?.id; }, [gameSession?.id]);
  useEffect(() => {
    return () => {
      if (!sessionIdRef.current || !authSession) return;
      supabase.functions.invoke("release-user-reservations", {
        body: { session_id: sessionIdRef.current },
      }).catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived state ────────────────────────────────────────────────────────
  const myUserId      = user?.id;
  const myReservations = useMemo(
    () => reservations?.filter((r) => r.user_id === myUserId) ?? [],
    [reservations, myUserId],
  );
  const takenByOthers = useMemo(
    () => new Set(reservations?.filter((r) => r.user_id !== myUserId).map((r) => r.cartela_number)),
    [reservations, myUserId],
  );
  const cartellas: [number | null, number | null] = [
    myReservations.find((r) => r.slot === 1)?.cartela_number ?? null,
    myReservations.find((r) => r.slot === 2)?.cartela_number ?? null,
  ];
  const filledCount = cartellas.filter((c) => c !== null).length;

  // ── Reserve cartela ──────────────────────────────────────────────────────
  const handleTap = useCallback(async (n: number) => {
    if (!gameSession?.id || !authSession || reserving || takenByOthers.has(n)) return;
    if (gameSession.status !== "waiting") return;
    setReserving(true);
    setApiError(null);
    try {
      const { error } = await supabase.functions.invoke("reserve-cartela", {
        body: { session_id: gameSession.id, cartela_number: n, slot: activeSlot },
      });
      if (error) {
        let msg = "Could not reserve cartela";
        try {
          const body = await (error as { context?: Response }).context?.json?.();
          if (body?.error) msg = body.error;
        } catch { /* ignore */ }
        const isInsufficientBalance = /insufficient/i.test(msg) || (error as { status?: number }).status === 402;
        showError(isInsufficientBalance ? "Insufficient balance" : msg);
      }
    } finally {
      setReserving(false);
    }
  }, [gameSession, authSession, activeSlot, reserving, takenByOthers]);

  // ── Release one slot ─────────────────────────────────────────────────────
  const handleRemove = useCallback(async (slot: 1 | 2) => {
    if (!gameSession?.id || !authSession) return;
    await supabase.functions.invoke("release-user-reservations", {
      body: { session_id: gameSession.id, slot },
    });
  }, [gameSession?.id, authSession]);

  // ── Leave: release all then go home ──────────────────────────────────────
  const handleLeave = useCallback(async () => {
    if (gameSession?.id && authSession) {
      await supabase.functions.invoke("release-user-reservations", {
        body: { session_id: gameSession.id },
      }).catch(() => {});
    }
    navigated.current = true;
    navigate("/");
  }, [gameSession?.id, authSession, navigate]);

  // ── Prize pool / player count ─────────────────────────────────────────────
  const playerCount   = gameSession?.participant_count ?? 0;
  const totalCartellas = reservations?.length ?? 0;
  const projectedPool = Math.round(totalCartellas * stake * 0.8);

  // ── Timer display ─────────────────────────────────────────────────────────
  // Sentinel value: timer_ends_at = now + 1 year → timeLeft ≈ 31 million seconds.
  // Anything > 120s means "countdown not started yet" (waiting for 2 players).
  // Active countdown: timeLeft ≤ 60s and > 0.
  const SENTINEL = 120; // seconds threshold
  const countdownLive    = timeLeft !== null && timeLeft > 0 && timeLeft <= SENTINEL;
  const countdownPending = timeLeft === null || timeLeft > SENTINEL;
  const timerExpired     = timeLeft === 0 && gameSession?.status === "waiting";

  const displayTime = countdownLive ? timeLeft! : 0;
  const mm = String(Math.floor(displayTime / 60)).padStart(2, "0");
  const ss = String(displayTime % 60).padStart(2, "0");

  const timerLabel = timerExpired     ? "Starting…"
    : countdownPending                ? `${playerCount}/2`
    : displayTime <= 9                ? `0:${String(displayTime).padStart(2, "0")}`
    : `${mm}:${ss}`;

  const timerColor = timerExpired    ? "#f5a623"
    : countdownPending               ? "#4a90d9"
    : displayTime <= 10              ? "#ff4842"
    : displayTime <= 20              ? "#f5a623"
    : "#00c853";

  return (
    <div style={s.page}>
      {/* ── Header ── */}
      <header style={s.header}>
        <button style={s.backBtn} onClick={handleLeave}>
          <ArrowLeft size={18} />
          <span>Back</span>
        </button>

        <div style={s.headerMid}>
          <span style={s.pageTitle}>Cartela Selection</span>
          <span style={s.stakeChip}>{stake} ETB</span>
        </div>

        <div style={{ ...s.timerBox, borderColor: timerColor + "55", background: timerColor + "18" }}>
          <Clock size={12} color={timerColor} />
          <span style={{ ...s.timerText, color: timerColor }}>{timerLabel}</span>
        </div>
      </header>

      {/* ── Info strip ── */}
      <div style={s.strip}>
        <WalletPill label="Main"   value={`${(wallet?.main_balance ?? 0).toLocaleString()} ETB`} />
        <div style={s.stripDiv} />
        <WalletPill label="Play"   value={`${(wallet?.play_balance ?? 0).toLocaleString()} ETB`} />
        <div style={s.stripDiv} />
        <WalletPill label="Players" value={String(playerCount)} accent="#4a90d9" />
        <div style={s.stripDiv} />
        <WalletPill label="Derash" value={`${projectedPool.toLocaleString()} ETB`} accent="var(--accent-orange)" />
      </div>

      {/* ── Error toast ── */}
      {apiError && (
        <div style={s.errorToast}>
          <AlertCircle size={14} />
          <span>{apiError}</span>
        </div>
      )}

      {/* ── Number grid card ── */}
      <div style={s.gridCard}>
        <div style={s.gridCardHead}>
          <span style={s.gridCardTitle}>Pick Your Cartela</span>
          <span style={s.gridCardSub}>
            {filledCount}/2 selected ·{" "}
            {countdownPending && !timerExpired
              ? `need ${Math.max(0, 2 - playerCount)} more player${2 - playerCount === 1 ? "" : "s"} to start`
              : "tap to assign to active holder"}
          </span>
        </div>

        <div style={s.gridScroll}>
          <div style={s.grid}>
            {Array.from({ length: TOTAL }, (_, i) => i + 1).map((n) => {
              const isMyCard    = cartellas.includes(n);
              const isTaken     = takenByOthers.has(n);
              return (
                <button
                  key={n}
                  onClick={() => handleTap(n)}
                  disabled={isTaken}
                  style={{
                    ...s.cell,
                    ...(isMyCard  ? s.cellSel   : {}),
                    ...(isTaken   ? s.cellTaken : {}),
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
          <span style={s.mySectionCount}>{filledCount} / 2</span>
        </div>

        <div style={s.slots}>
          {([1, 2] as const).map((slot) => {
            const id       = cartellas[slot - 1];
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
                label={slot === 1 ? "Tap a number above" : "Click to activate, then pick"}
                isActive={isActive}
                onClick={() => setActiveSlot(slot)}
              />
            );
          })}
        </div>

        {filledCount > 0 && (
          <button style={s.confirmBtn}>
            <CheckCircle2 size={16} />
            <span>Waiting for game to start…</span>
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

function MiniCard({ id, card, isActive, onClick, onRemove }: {
  id: number; card: (number | null)[][]; isActive: boolean; onClick: () => void; onRemove: () => void;
}) {
  return (
    <div style={{ ...s.miniCard, ...(isActive ? s.miniCardActive : {}) }} onClick={onClick}>
      <div style={s.miniCardHead}>
        <div style={s.miniCardLeft}>
          {isActive && <span style={s.activeTag}>Active</span>}
          <span style={{ ...s.miniCardId, color: isActive ? "var(--accent-orange)" : "#00c853" }}>#{id}</span>
        </div>
        <button style={s.miniRemove} onClick={(e) => { e.stopPropagation(); onRemove(); }}>
          <X size={11} />
        </button>
      </div>
      <div style={s.miniColRow}>{BINGO_LABELS.map((c) => <span key={c} style={s.miniColLabel}>{c}</span>)}</div>
      <div style={s.miniGrid}>
        {card.map((row, ri) =>
          row.map((num, ci) => (
            <div key={`${ri}-${ci}`} style={{ ...s.miniCell, ...(num === null ? s.miniCellFree : {}) }}>
              {num === null ? "★" : num}
            </div>
          )),
        )}
      </div>
    </div>
  );
}

function EmptySlot({ label, isActive, onClick }: { label: string; isActive: boolean; onClick: () => void }) {
  return (
    <div style={{ ...s.emptySlot, ...(isActive ? s.emptySlotActive : {}) }} onClick={onClick}>
      {isActive && <span style={s.activeTag}>Active</span>}
      <div style={{ ...s.emptyIcon, ...(isActive ? s.emptyIconActive : {}) }}>
        <Plus size={18} color={isActive ? "var(--accent-orange)" : "rgba(255,255,255,0.25)"} />
      </div>
      <span style={{ ...s.emptyLabel, ...(isActive ? { color: "rgba(245,166,35,0.7)" } : {}) }}>{label}</span>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: { display: "flex", flexDirection: "column", minHeight: "100vh", background: "linear-gradient(160deg,#1a1040 0%,#0d0b1e 60%)" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(20,14,50,0.95)", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(255,255,255,0.07)", position: "sticky", top: 0, zIndex: 10, gap: "8px" },
  backBtn:   { display: "flex", alignItems: "center", gap: "4px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", padding: "6px 10px", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer", flexShrink: 0 },
  headerMid: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" },
  pageTitle: { fontSize: "14px", fontWeight: 700, color: "#fff" },
  stakeChip: { fontSize: "10px", fontWeight: 600, color: "var(--accent-orange)", background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.3)", borderRadius: "6px", padding: "1px 7px" },
  timerBox:  { display: "flex", alignItems: "center", gap: "4px", borderRadius: "10px", border: "1px solid", padding: "5px 10px", flexShrink: 0 },
  timerText: { fontSize: "13px", fontWeight: 800, fontVariantNumeric: "tabular-nums", letterSpacing: "0.5px" },
  strip:     { display: "flex", alignItems: "center", padding: "7px 16px", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  stripDiv:  { width: "1px", height: "24px", background: "rgba(255,255,255,0.1)", margin: "0 10px" },
  walletPill:{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 },
  walletLabel:{ fontSize: "9px", color: "rgba(255,255,255,0.38)", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.5px" },
  walletValue:{ fontSize: "11px", fontWeight: 700 },
  errorToast:{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(255,72,66,0.15)", border: "1px solid rgba(255,72,66,0.3)", borderRadius: "10px", margin: "8px 12px 0", padding: "8px 12px", color: "#ff4842", fontSize: "12px", fontWeight: 600 },
  gridCard:  { margin: "10px 12px 0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "16px", display: "flex", flexDirection: "column", height: "calc(62vh - 110px)", overflow: "hidden" },
  gridCardHead:{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 },
  gridCardTitle:{ fontSize: "13px", fontWeight: 700, color: "#fff" },
  gridCardSub:  { fontSize: "10px", color: "rgba(255,255,255,0.35)", fontWeight: 500 },
  gridScroll:{ flex: 1, overflowY: "auto" as const, padding: "8px" },
  grid: { display: "grid", gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`, gap: "4px" },
  cell: { aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "7px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.65)", fontSize: "11px", fontWeight: 500, cursor: "pointer", padding: 0, transition: "all 0.12s" },
  cellSel:   { background: "rgba(0,200,83,0.22)", border: "1px solid rgba(0,200,83,0.55)", color: "#00c853", fontWeight: 700 },
  cellTaken: { background: "rgba(255,72,66,0.08)", border: "1px solid rgba(255,72,66,0.2)", color: "rgba(255,72,66,0.4)", cursor: "not-allowed" },
  mySection: { padding: "10px 12px", flex: 1 },
  mySectionHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" },
  mySectionTitle:{ fontSize: "13px", fontWeight: 700, color: "#fff" },
  mySectionCount:{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.07)", borderRadius: "8px", padding: "2px 8px" },
  slots:  { display: "flex", gap: "10px" },
  activeTag:{ fontSize: "8px", fontWeight: 700, color: "var(--accent-orange)", background: "rgba(245,166,35,0.15)", border: "1px solid rgba(245,166,35,0.35)", borderRadius: "5px", padding: "1px 5px", textTransform: "uppercase" as const, letterSpacing: "0.4px" },
  miniCard:      { flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(0,200,83,0.35)", borderRadius: "14px", padding: "8px", cursor: "pointer" },
  miniCardActive:{ border: "1.5px solid rgba(245,166,35,0.65)", boxShadow: "0 0 16px rgba(245,166,35,0.2)", background: "rgba(245,166,35,0.06)" },
  miniCardHead:  { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "5px" },
  miniCardLeft:  { display: "flex", alignItems: "center", gap: "5px" },
  miniCardId:    { fontSize: "11px", fontWeight: 700 },
  miniRemove:    { background: "rgba(255,72,66,0.15)", border: "1px solid rgba(255,72,66,0.3)", borderRadius: "6px", padding: "3px", cursor: "pointer", color: "#ff4842", display: "flex", lineHeight: 1 },
  miniColRow:    { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "2px", marginBottom: "2px" },
  miniColLabel:  { textAlign: "center" as const, fontSize: "8px", fontWeight: 800, color: "var(--accent-orange)" },
  miniGrid:      { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "2px" },
  miniCell:      { aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", background: "rgba(255,255,255,0.07)", fontSize: "8px", fontWeight: 600, color: "rgba(255,255,255,0.8)" },
  miniCellFree:  { background: "linear-gradient(135deg,#f5a623,#e8860a)", color: "#fff", fontSize: "9px" },
  emptySlot:     { flex: 1, background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.12)", borderRadius: "14px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px", padding: "14px 8px", minHeight: "90px", cursor: "pointer" },
  emptySlotActive:{ border: "1.5px dashed rgba(245,166,35,0.55)", background: "rgba(245,166,35,0.05)" },
  emptyIcon:     { width: "32px", height: "32px", borderRadius: "10px", background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" },
  emptyIconActive:{ background: "rgba(245,166,35,0.12)" },
  emptyLabel:    { fontSize: "10px", color: "rgba(255,255,255,0.25)", fontWeight: 500, textAlign: "center" as const },
  confirmBtn:    { marginTop: "10px", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "13px", borderRadius: "14px", background: "linear-gradient(90deg,#3a1c6e,#4a90d9)", border: "none", color: "#fff", fontSize: "14px", fontWeight: 700, cursor: "default" },
  inProgressWrap:{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" },
  inProgressBox: { display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "20px", padding: "36px 28px", textAlign: "center" as const, maxWidth: "300px" },
  inProgressEmoji:{ fontSize: "44px", lineHeight: 1 },
  inProgressTitle:{ fontSize: "17px", fontWeight: 800, color: "#fff" },
  inProgressSub:  { fontSize: "13px", color: "rgba(255,255,255,0.45)", fontWeight: 500, lineHeight: 1.6, whiteSpace: "pre-line" as const },
};
