import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { X, Zap, ZapOff, Volume2, Volume1, VolumeX, Trophy } from "lucide-react";
import { useSoundEnabled } from "@/hooks/useSoundEnabled";
import { generateCartela, getBallLetter, getBallColor, BINGO_COLS } from "@/utils/bingo";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useGameSessionById } from "@/hooks/useGameSession";
import { useGameBalls } from "@/hooks/useGameBalls";
import { useGameResult } from "@/hooks/useGameResult";
import { useGameParticipants } from "@/hooks/useGameParticipants";
import { useGameSync } from "@/hooks/useGameSync";
import { supabase } from "@/services/supabase";
import type { GameBall } from "@/types/database";

// ── Audio ──────────────────────────────────────────────────────────────────
function ballToAudioUrl(n: number): string {
  if (n <= 15) return `/mp3/b-${n}.mp3`;
  if (n <= 30) return `/mp3/i-${n}.mp3`;
  if (n <= 45) return `/mp3/n-${n}.mp3`;
  if (n <= 60) return `/mp3/g-${n}.mp3`;
  return `/mp3/o-${n}.mp3`;
}

// ── Keyframes ──────────────────────────────────────────────────────────────
const KEYFRAMES = `
  @keyframes ballPop {
    0%   { transform: scale(0.3) rotate(-12deg); opacity: 0; }
    65%  { transform: scale(1.14) rotate(3deg);  opacity: 1; }
    100% { transform: scale(1)    rotate(0deg);  opacity: 1; }
  }
  .ball-pop { animation: ballPop 0.45s cubic-bezier(0.175,0.885,0.32,1.275) both; }

  @keyframes ringExpand {
    0%   { transform: scale(0.5); opacity: 0.9; }
    100% { transform: scale(2.6); opacity: 0;   }
  }
  .ring-a { animation: ringExpand 1.6s ease-out infinite; }
  .ring-b { animation: ringExpand 1.6s ease-out 0.4s infinite; }
  .ring-c { animation: ringExpand 1.6s ease-out 0.8s infinite; }

  @keyframes confettiFall {
    0%   { transform: translateY(-10px) rotate(0deg);   opacity: 1; }
    85%  { opacity: 0.9; }
    100% { transform: translateY(105vh) rotate(720deg); opacity: 0; }
  }

  @keyframes winSlideIn {
    0%   { transform: scale(0.75) translateY(30px); opacity: 0; }
    100% { transform: scale(1)    translateY(0);    opacity: 1; }
  }
  .win-card { animation: winSlideIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275) both; }

  @keyframes prizeShimmer {
    0%, 100% { text-shadow: 0 0 12px #f5a62388; }
    50%       { text-shadow: 0 0 36px #f5a623cc, 0 0 70px #f5a62344; }
  }
  .prize-shimmer { animation: prizeShimmer 1.6s ease-in-out infinite; }

  @keyframes bingoPulse {
    0%, 100% { box-shadow: 0 4px 18px rgba(255,72,66,0.45); transform: scale(1); }
    50%       { box-shadow: 0 4px 34px rgba(255,72,66,0.75); transform: scale(1.03); }
  }
  .bingo-has-win { animation: bingoPulse 0.9s ease-in-out infinite; }

  @keyframes overlayIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .overlay-in { animation: overlayIn 0.3s ease both; }

  @keyframes ballBounce {
    0%, 100% { transform: translateY(0)    scale(1);    }
    40%      { transform: translateY(-14px) scale(1.04); }
    70%      { transform: translateY(-6px)  scale(1.02); }
    85%      { transform: translateY(-10px) scale(1.03); }
    93%      { transform: translateY(-3px)  scale(1.01); }
  }
  .ball-bounce { animation: ballPop 0.45s cubic-bezier(0.175,0.885,0.32,1.275) both,
                             ballBounce 1s ease-in-out 0.45s infinite; }
`;

// ── Bingo detection ────────────────────────────────────────────────────────
type Pattern = [number, number][];

function getWinPattern(card: (number | null)[][], called: Set<number>): { pattern: Pattern; name: string } | null {
  const m = card.map((row) => row.map((n) => n === null || called.has(n)));
  for (let r = 0; r < 5; r++) {
    if (m[r].every(Boolean)) return { pattern: [[r,0],[r,1],[r,2],[r,3],[r,4]], name: `row_${r}` };
  }
  for (let c = 0; c < 5; c++) {
    if (m.every((row) => row[c])) return { pattern: [[0,c],[1,c],[2,c],[3,c],[4,c]], name: `col_${c}` };
  }
  if (m.every((row, i) => row[i]))     return { pattern: [[0,0],[1,1],[2,2],[3,3],[4,4]], name: "diag_main" };
  if (m.every((row, i) => row[4 - i])) return { pattern: [[0,4],[1,3],[2,2],[3,1],[4,0]], name: "diag_anti" };
  return null;
}

function isInPattern(pattern: Pattern, r: number, c: number) {
  return pattern.some(([pr, pc]) => pr === r && pc === c);
}

function patternFromName(name: string): Pattern | null {
  const rm = name.match(/^row_(\d)$/);
  if (rm) { const r = +rm[1]; return [[r,0],[r,1],[r,2],[r,3],[r,4]]; }
  const cm = name.match(/^col_(\d)$/);
  if (cm) { const c = +cm[1]; return [[0,c],[1,c],[2,c],[3,c],[4,c]]; }
  if (name === "diag_main") return [[0,0],[1,1],[2,2],[3,3],[4,4]];
  if (name === "diag_anti") return [[0,4],[1,3],[2,2],[3,1],[4,0]];
  return null;
}

function readablePattern(name: string): string {
  if (/^row_/.test(name)) return "Full Row";
  if (/^col_/.test(name)) return "Full Column";
  if (name === "diag_main" || name === "diag_anti") return "Diagonal";
  return name;
}

// ── Component ──────────────────────────────────────────────────────────────
export default function Game() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const sessionId = searchParams.get("session") ?? undefined;
  const stake     = searchParams.get("stake")   ?? "10";
  const c1Param   = searchParams.get("c1");
  const c2Param   = searchParams.get("c2");
  const rawC1 = c1Param ? Number(c1Param) : null;
  const rawC2 = c2Param ? Number(c2Param) : null;

  const { user }          = useAuth();
  const { data: profile } = useProfile(user?.id);
  const playerName = profile?.first_name ?? "Player";

  // Single consolidated realtime channel: handles all four tables, reconnect
  // recovery, and visibility restore. The individual hooks poll as a safety-net.
  useGameSync(sessionId);

  const { data: gameSession }                         = useGameSessionById(sessionId);
  const { data: serverBalls = [], isFetched: ballsFetched } = useGameBalls(sessionId);
  const { data: gameResult, isSuccess: resultFetched } = useGameResult(sessionId);
  const { data: winnerProfile }                       = useProfile(gameResult?.winner_id);
  const { data: participants = [] }                   = useGameParticipants(sessionId);

  // ── Sequential ball display queue ─────────────────────────────────────────
  // Server balls arrive in two ways:
  //   1. Real-time single insert  → show immediately (sub-100 ms, no skip risk)
  //   2. Batch on reconnect/poll  → play one-by-one so no calls are ever skipped
  //
  // seenIdsRef   – tracks every ball already handed to displayBalls (or queued)
  // queueRef     – pending balls waiting to be revealed
  // timerRef     – handle for the current setTimeout in the replay loop
  // isFirstBatch – true until the initial DB snapshot has been displayed; that
  //                batch is always shown instantly (it's historical, not live)
  const [displayBalls, setDisplayBalls]  = useState<GameBall[]>([]);
  const queueRef     = useRef<GameBall[]>([]);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenIdsRef   = useRef(new Set<string>());
  const isFirstBatch = useRef(true);

  const scheduleNext = useCallback(() => {
    if (queueRef.current.length === 0) { timerRef.current = null; return; }
    timerRef.current = setTimeout(() => {
      const ball = queueRef.current.shift()!;
      setDisplayBalls((prev) =>
        prev.some((b) => b.id === ball.id) ? prev : [...prev, ball],
      );
      scheduleNext();
    }, 500);
  }, []);

  useEffect(() => {
    // Wait for the initial DB fetch so we have a complete baseline before
    // processing realtime events (avoids treating history as catch-up).
    if (!ballsFetched) return;

    const pending = serverBalls
      .filter((b) => !seenIdsRef.current.has(b.id))
      .sort((a, b) => a.sequence_index - b.sequence_index);

    if (pending.length === 0) return;
    pending.forEach((b) => seenIdsRef.current.add(b.id));

    if (isFirstBatch.current) {
      // Historical snapshot on first load: show all at once instantly.
      isFirstBatch.current = false;
      setDisplayBalls((prev) => {
        const ids = new Set(prev.map((b) => b.id));
        return [...prev, ...pending.filter((b) => !ids.has(b.id))];
      });
      return;
    }

    if (pending.length === 1) {
      // Real-time single delivery: reveal immediately for best latency.
      setDisplayBalls((prev) =>
        prev.some((b) => b.id === pending[0].id) ? prev : [...prev, pending[0]],
      );
      return;
    }

    // Multiple balls arrived at once (missed-event recovery after reconnect /
    // background / poll catch-up): replay them in sequence so no call is skipped.
    queueRef.current.push(...pending);
    if (!timerRef.current) scheduleNext();
  }, [serverBalls, ballsFetched, scheduleNext]);

  // Clean up any pending timer on unmount
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const myParticipant  = participants.find((p) => p.user_id === user?.id);
  const isActivePlayer = !!myParticipant && !myParticipant.is_watcher;

  // Prefer URL params; fall back to game_participants for app-reopen / missing params.
  const c1 = rawC1 ?? myParticipant?.cartela_1 ?? null;
  const c2 = rawC2 ?? myParticipant?.cartela_2 ?? null;

  // All display-state derives from displayBalls (what the user has actually seen)
  const called      = useMemo(() => new Set(displayBalls.map((b) => b.ball_number)), [displayBalls]);
  const currentBall = displayBalls.length > 0 ? displayBalls[displayBalls.length - 1].ball_number : null;
  const recentBalls = useMemo(() => [...displayBalls].reverse().slice(0, 5).map((b) => b.ball_number), [displayBalls]);

  const gameId      = sessionId?.slice(-8).toUpperCase() ?? "—";
  const prize       = gameSession?.prize_pool ?? 0;
  const playerCount = participants.filter((p) => !p.is_watcher).length;

  const [autoMode, setAutoMode]           = useState(true);
  const [speakerActive, setSpeakerActive] = useState(false);
  const [soundEnabled, setSoundEnabled]   = useSoundEnabled();
  const [showWinner, setShowWinner]       = useState(false);
  const [showGameOver, setShowGameOver]   = useState(false);
  const [showNoWinner, setShowNoWinner]   = useState(false);
  const [winTime, setWinTime]             = useState("");
  const [countdown, setCountdown]         = useState<number | null>(null);
  const [claiming, setClaiming]           = useState(false);
  const [notBingo, setNotBingo]           = useState(false);
  const notBingoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const claimAttempted = useRef(false);

  const [confetti] = useState(() =>
    Array.from({ length: 58 }, (_, i) => ({
      id: i, left: `${(i * 17.3) % 100}%`, delay: `${(i * 0.13) % 4}s`,
      dur: `${2.8 + (i % 7) * 0.4}s`,
      color: ["#f5a623","#00c853","#4a90d9","#ff4842","#7c4dff","#ff69b4","#fff"][i % 7],
      w: `${6 + (i % 5)}px`, h: `${3 + (i % 4)}px`, rot: `${(i * 37) % 360}deg`,
    })),
  );

  const card1 = useMemo(() => (c1 !== null ? generateCartela(c1) : null), [c1]);
  const card2 = useMemo(() => (c2 !== null ? generateCartela(c2) : null), [c2]);

  const win1 = useMemo(() => (card1 ? getWinPattern(card1, called) : null), [card1, called]);
  const win2 = useMemo(() => (card2 ? getWinPattern(card2, called) : null), [card2, called]);
  const hasBingo = win1 !== null || win2 !== null;

  // Speaker pulse on each new ball
  useEffect(() => {
    if (!currentBall) return;
    setSpeakerActive(true);
    const t = setTimeout(() => setSpeakerActive(false), 2200);
    return () => clearTimeout(t);
  }, [currentBall]);

  // Play ball audio on each new call
  const ballAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (!currentBall) return;
    if (ballAudioRef.current) { ballAudioRef.current.pause(); ballAudioRef.current = null; }
    if (!soundEnabled) return;
    const audio = new Audio(ballToAudioUrl(currentBall));
    audio.play().catch(() => {});
    ballAudioRef.current = audio;
  }, [currentBall, soundEnabled]);

  // Play Bingo.mp3 when winner overlay appears
  useEffect(() => {
    if (!showWinner && !showGameOver) return;
    if (!soundEnabled) return;
    const audio = new Audio("/mp3/Bingo.mp3");
    audio.play().catch(() => {});
  }, [showWinner, showGameOver, soundEnabled]);

  // Auto-mode: watch balls, auto-claim when win detected
  useEffect(() => {
    if (!autoMode || claimAttempted.current || !user?.id || !sessionId) return;
    if (gameResult) return;
    const result = win1 ?? win2;
    const cartelaId = win1 ? c1 : win2 ? c2 : null;
    if (!result || cartelaId === null) return;
    claimAttempted.current = true;
    performClaim(cartelaId, result.name);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayBalls, autoMode, win1, win2]);

  // Sync auto_mode to server
  useEffect(() => {
    if (!sessionId) return;
    supabase.functions.invoke("set-auto-mode", {
      body: { session_id: sessionId, auto_mode: autoMode },
    }).catch(() => {});
  }, [autoMode, sessionId]);

  // React to game result arriving
  useEffect(() => {
    if (!gameResult) return;
    const isWinner = gameResult.winner_id === user?.id;
    const ts = new Date(gameResult.won_at ?? Date.now());
    setWinTime(ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    if (isWinner) setShowWinner(true);
    else          setShowGameOver(true);
    setCountdown(7);
  }, [gameResult, user?.id]);

  // All 75 balls called with no winner — game-runner closes the session
  useEffect(() => {
    if (gameSession?.status !== "finished") return;
    if (!resultFetched) return; // wait for at least one successful fetch
    if (gameResult) return;     // there IS a winner, handled above
    setShowNoWinner(true);
    setCountdown(7);
  }, [gameSession?.status, resultFetched, gameResult]);

  // 15-second post-result countdown → navigate home
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) { navigate("/"); return; }
    const t = setTimeout(() => setCountdown((c) => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [countdown, navigate]);

  const performClaim = useCallback(async (cartelaId: number, patternName: string) => {
    if (!sessionId || claiming) return;
    setClaiming(true);
    try {
      const { error } = await supabase.functions.invoke("claim-bingo", {
        body: { session_id: sessionId, cartela_id: cartelaId, pattern_name: patternName },
      });
      if (error) claimAttempted.current = false; // allow retry
    } finally {
      setClaiming(false);
    }
  }, [sessionId, claiming]);

  const handleBingo = useCallback(() => {
    const result = win1 ?? win2;
    const cartelaId = win1 ? c1 : win2 ? c2 : c1 ?? c2;
    if (cartelaId === null || !result) {
      if (notBingoTimer.current) clearTimeout(notBingoTimer.current);
      setNotBingo(true);
      notBingoTimer.current = setTimeout(() => setNotBingo(false), 3000);
      return;
    }
    claimAttempted.current = true;
    performClaim(cartelaId, result.name);
  }, [win1, win2, c1, c2, performClaim]);

  const curColor  = currentBall ? getBallColor(currentBall)  : "#888";
  const curLetter = currentBall ? getBallLetter(currentBall) : null;

  const winningCard    = win1 ? card1 : card2;
  const winningId      = win1 ? c1    : c2;
  const winningPattern = (win1 ?? win2)?.pattern ?? null;

  // Spectator announcement data (used when another player wins)
  const winnerName         = winnerProfile?.first_name ?? "Someone";
  const winnerCard         = gameResult ? generateCartela(gameResult.cartela_id) : null;
  const winnerPatternVis   = gameResult ? patternFromName(gameResult.pattern) : null;
  const winnerPatternLabel = gameResult ? readablePattern(gameResult.pattern) : "—";

  return (
    <div style={s.page}>
      <style>{KEYFRAMES}</style>

      {/* ── Header ── */}
      <header style={s.header}>
        <button
          style={{ ...s.leaveBtn, ...(isActivePlayer ? s.leaveBtnDisabled : {}) }}
          onClick={isActivePlayer ? undefined : () => navigate("/")}
          disabled={isActivePlayer}
        >
          <X size={16} />
          <span>Leave</span>
        </button>
        <div style={s.headerCenter}>
          <span style={s.gameIdChip}>#{gameId}</span>
          <span style={s.stakeTag}>{stake} ETB</span>
        </div>
        <div style={s.speakerWrap} onClick={() => setSoundEnabled((v) => !v)}>
          {speakerActive && soundEnabled && (
            <>
              <div className="ring-a" style={s.ring} />
              <div className="ring-b" style={s.ring} />
              <div className="ring-c" style={s.ring} />
            </>
          )}
          {!soundEnabled
            ? <VolumeX size={22} color="rgba(255,255,255,0.3)" style={{ position: "relative", zIndex: 1 }} />
            : speakerActive
              ? <Volume2 size={22} color="#f5a623" style={{ position: "relative", zIndex: 1 }} />
              : <Volume1 size={22} color="rgba(255,255,255,0.3)" style={{ position: "relative", zIndex: 1 }} />
          }
        </div>
      </header>

      {/* ── Info bar ── */}
      <div style={s.infoBar}>
        <InfoChip label="Players" value={playerCount > 0 ? playerCount.toString() : "—"} />
        <div style={s.infoDivider} />
        <InfoChip label="Derash" value={prize > 0 ? `${Math.round(prize).toLocaleString()} ETB` : "—"} accent="#f5a623" />
        <div style={s.infoDivider} />
        <InfoChip label="Called" value={`${displayBalls.length} / 75`} accent="#00c853" />
      </div>

      {/* ── Main split ── */}
      <div style={s.mainRow}>
        {/* Left: Master BINGO board */}
        <div style={s.boardPanel}>
          <div style={s.boardGrid}>
            {BINGO_COLS.map(({ label, color }) => (
              <div key={label} style={{ ...s.colHeader, color }}>{label}</div>
            ))}
            {Array.from({ length: 15 }, (_, row) =>
              BINGO_COLS.map(({ min }) => {
                const n      = min + row;
                const isCur  = n === currentBall;
                const isHit  = called.has(n);
                return (
                  <div key={n} style={{
                    ...s.boardCell,
                    ...(isHit && !isCur ? { background: "rgba(56,189,248,0.45)", border: "1px solid rgba(56,189,248,0.85)", color: "#fff", fontWeight: 800 } : {}),
                    ...(isCur ? { background: "#ff4842", border: "1px solid #ff4842", color: "#fff", fontWeight: 800, boxShadow: "0 0 12px rgba(255,72,66,0.7)", transform: "scale(1.08)", zIndex: 1 } : {}),
                  }}>
                    {n}
                  </div>
                );
              }),
            )}
          </div>
        </div>

        {/* Right: Call display + Cartellas */}
        <div style={s.rightPanel}>
          <div style={s.recentRow}>
            {recentBalls.map((n, i) => (
              <span key={n} style={{ ...s.recentChip, opacity: 1 - i * 0.18, background: i === 0 ? "rgba(255,72,66,0.2)" : "rgba(255,255,255,0.08)", border: i === 0 ? "1px solid rgba(255,72,66,0.5)" : "1px solid rgba(255,255,255,0.15)", color: i === 0 ? "#ff4842" : "rgba(255,255,255,0.7)", fontSize: i === 0 ? "11px" : "10px", fontWeight: i === 0 ? 700 : 500 }}>
                {getBallLetter(n)}-{n}
              </span>
            ))}
            {recentBalls.length === 0 && <span style={s.recentEmpty}>No calls yet</span>}
          </div>

          <div style={s.ballWrap}>
            {currentBall !== null ? (
              <div key={currentBall} className="ball-bounce" style={{ ...s.ball, borderColor: curColor + "aa", boxShadow: `0 0 28px ${curColor}55, 0 0 60px ${curColor}22, inset 0 0 16px ${curColor}11` }}>
                <span style={{ ...s.ballLetter, color: curColor }}>{curLetter}</span>
                <span style={s.ballNumber}>{currentBall}</span>
              </div>
            ) : (
              <div style={s.ballPlaceholder}>
                <span style={s.ballPlaceholderText}>Ready</span>
              </div>
            )}
          </div>

          {card1 !== null && c1 !== null && (
            <CartelaCard id={c1} card={card1} called={called} currentBall={currentBall} winPattern={win1?.pattern ?? null} />
          )}
          {card2 !== null && c2 !== null && (
            <div style={{ marginTop: "8px" }}>
              <CartelaCard id={c2} card={card2} called={called} currentBall={currentBall} winPattern={win2?.pattern ?? null} />
            </div>
          )}
          {card1 === null && card2 === null && (
            <div className="watch-container" style={s.watchOnly}>
              <span className="watch-icon">👁️</span>
              <span style={s.watchTitle}>Watch Only</span>
              <span className="watch-msg" style={s.watchSub}>
                የዚህ ዙር ጨዋታ ተጀምሯል!{"\n"}እባክዎ ቀጣዩ ዙር እስኪጀምር ይጠብቁ!
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom action bar ── */}
      <div style={s.bottomBar}>
        <button
          style={{ ...s.leaveBarBtn, ...(isActivePlayer ? s.leaveBtnDisabled : {}) }}
          onClick={isActivePlayer ? undefined : () => navigate("/")}
          disabled={isActivePlayer}
        >
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

        {notBingo && (
          <div style={s.notBingoBanner}>Not Bingo. Please Keep playing</div>
        )}

        <button
          className={hasBingo ? "bingo-has-win" : ""}
          style={{ ...s.bingoBtn, ...(hasBingo ? s.bingoBtnLit : {}), ...(claiming ? { opacity: 0.7 } : {}) }}
          onClick={handleBingo}
          disabled={claiming}
        >
          <Trophy size={15} />
          <span>{claiming ? "Claiming…" : "BINGO!"}</span>
        </button>
      </div>

      {/* ── Game over overlay (someone else won) ── */}
      {showGameOver && !showWinner && (
        <GameOverAnnouncement
          winnerName={winnerName}
          cartelaId={gameResult?.cartela_id ?? null}
          winnerCard={winnerCard}
          winnerPattern={winnerPatternVis}
          patternLabel={winnerPatternLabel}
          prize={gameResult?.prize_amount ?? 0}
          ballsCalledCount={gameResult?.balls_called_count ?? displayBalls.length}
          called={called}
          countdown={countdown}
          onLeave={() => navigate("/")}
        />
      )}

      {/* ── No-winner overlay (all 75 balls called, nobody won) ── */}
      {showNoWinner && !showWinner && !showGameOver && (
        <NoWinnerAnnouncement
          ballsCalledCount={displayBalls.length}
          countdown={countdown}
          onLeave={() => navigate("/")}
        />
      )}

      {/* ── Winner popup ── */}
      {showWinner && (
        <WinnerModal
          playerName={playerName}
          winningId={winningId}
          winningCard={winningCard}
          winningPattern={winningPattern}
          prize={gameResult?.prize_amount ?? Math.round(prize)}
          callIndex={displayBalls.length}
          winTime={winTime}
          confetti={confetti}
          called={called}
          countdown={countdown}
          onClose={() => navigate("/")}
          onLeave={() => navigate("/")}
        />
      )}
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

function CartelaCard({ id, card, called, currentBall, winPattern }: {
  id: number; card: (number | null)[][]; called: Set<number>; currentBall: number | null; winPattern: Pattern | null;
}) {
  const hits = card.flat().filter((n): n is number => n !== null && called.has(n)).length;
  return (
    <div style={{ ...cc.wrap, ...(winPattern ? cc.wrapWin : {}) }}>
      <div style={cc.head}>
        <span style={cc.title}>Cartela #{id}</span>
        {winPattern ? <span style={cc.winBadge}>🏆 BINGO!</span> : hits > 0 ? <span style={cc.hitBadge}>{hits} matched</span> : null}
      </div>
      <div style={cc.colRow}>
        {BINGO_COLS.map(({ label, color }) => <span key={label} style={{ ...cc.colLabel, color }}>{label}</span>)}
      </div>
      <div style={cc.grid}>
        {card.map((row, ri) =>
          row.map((num, ci) => {
            const isFree   = num === null;
            const isHit    = !isFree && called.has(num);
            const isLatest = num === currentBall;
            const isWinCell = winPattern ? isInPattern(winPattern, ri, ci) : false;
            return (
              <div key={`${ri}-${ci}`} style={{
                ...cc.cell,
                ...(isFree ? cc.cellFree : {}),
                ...(isHit && !isLatest && !isFree ? { background: "rgba(56,189,248,0.45)", border: "1px solid rgba(56,189,248,0.85)", color: "#fff", fontWeight: 800 } : {}),
                ...(isLatest && isHit ? { background: "rgba(255,72,66,0.3)", border: "1px solid #ff4842", color: "#ff4842", fontWeight: 800, boxShadow: "0 0 8px rgba(255,72,66,0.55)" } : {}),
                ...(isWinCell && !isLatest ? { border: "1.5px solid #f5a623", boxShadow: "0 0 6px rgba(245,166,35,0.5)" } : {}),
              }}>
                {isFree ? "★" : num}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

function WinnerModal({ playerName, winningId, winningCard, winningPattern, prize, callIndex, winTime, confetti, called, countdown, onClose, onLeave }: {
  playerName: string; winningId: number | null; winningCard: (number | null)[][] | null; winningPattern: Pattern | null;
  prize: number; callIndex: number; winTime: string;
  confetti: { id: number; left: string; delay: string; dur: string; color: string; w: string; h: string; rot: string }[];
  called: Set<number>; countdown: number | null; onClose: () => void; onLeave: () => void;
}) {
  const patternName = winningPattern
    ? (() => {
        const [[r0, c0], , [r2, c2]] = winningPattern;
        if (r0 === r2) return "Full Row";
        if (c0 === c2) return "Full Column";
        return "Diagonal";
      })()
    : "—";

  return (
    <div className="overlay-in" style={wm.overlay} onClick={onClose}>
      <div style={wm.confettiWrap}>
        {confetti.map((p) => (
          <div key={p.id} style={{ position: "absolute", left: p.left, top: "-12px", width: p.w, height: p.h, background: p.color, borderRadius: "2px", transform: `rotate(${p.rot})`, animation: `confettiFall ${p.dur} ${p.delay} linear infinite`, opacity: 0.9 }} />
        ))}
      </div>

      <div className="win-card" style={wm.card} onClick={(e) => e.stopPropagation()}>
        <div style={wm.glowRing} />
        <div style={wm.head}>
          <div style={wm.trophyCircle}><Trophy size={32} color="#f5a623" /></div>
          <h2 style={wm.bingoText}>BINGO!</h2>
          <p style={wm.congrats}>Congratulations, {playerName}!</p>
        </div>
        <div style={wm.prizeBox}>
          <span style={wm.prizeLabel}>Prize Won</span>
          <span className="prize-shimmer" style={wm.prizeAmt}>{Math.round(prize).toLocaleString()} ETB</span>
        </div>
        <div style={wm.statsRow}>
          <StatCell label="Cartela" value={winningId !== null ? `#${winningId}` : "—"} />
          <StatCell label="Pattern" value={patternName} />
          <StatCell label="Called"  value={`${callIndex}/75`} />
          <StatCell label="Time"    value={winTime} />
        </div>

        {winningCard && winningId !== null && (
          <div style={wm.cardWrap}>
            <p style={wm.cardTitle}>Winning Cartela #{winningId}</p>
            <div style={wm.cardCols}>
              {BINGO_COLS.map(({ label, color }) => <div key={label} style={{ ...wm.cardColLabel, color }}>{label}</div>)}
            </div>
            <div style={wm.cardGrid}>
              {winningCard.map((row, ri) =>
                row.map((num, ci) => {
                  const isFree = num === null;
                  const isHit  = !isFree && called.has(num);
                  const isWin  = winningPattern ? isInPattern(winningPattern, ri, ci) : false;
                  return (
                    <div key={`${ri}-${ci}`} style={{
                      ...wm.cardCell,
                      ...(isFree ? wm.cardFree : {}),
                      ...(isHit && !isFree && !isWin ? { background: "rgba(56,189,248,0.45)", border: "1px solid rgba(56,189,248,0.85)", color: "#fff", fontWeight: 700 } : {}),
                      ...(isWin ? { background: "linear-gradient(135deg,#f5a623,#e8860a)", border: "none", color: "#fff", fontWeight: 800, boxShadow: "0 0 10px rgba(245,166,35,0.6)", transform: "scale(1.05)" } : {}),
                    }}>
                      {isFree ? "★" : num}
                    </div>
                  );
                }),
              )}
            </div>
          </div>
        )}

        {countdown !== null && (
          <p style={{ textAlign: "center" as const, color: "rgba(255,255,255,0.4)", fontSize: "12px", marginBottom: "8px" }}>
            Returning home in {countdown}s
          </p>
        )}

        <div style={wm.actions}>
          <button style={wm.claimBtn} onClick={onClose}>Claim Prize</button>
          <button style={wm.leaveBtn} onClick={onLeave}>New Game</button>
        </div>
      </div>
    </div>
  );
}

function NoWinnerAnnouncement({ ballsCalledCount, countdown, onLeave }: {
  ballsCalledCount: number; countdown: number | null; onLeave: () => void;
}) {
  return (
    <div className="overlay-in" style={wm.overlay}>
      <div className="win-card" style={wm.card} onClick={(e) => e.stopPropagation()}>
        <div style={{ textAlign: "center" as const, marginBottom: "16px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 900, color: "#ff4444", marginBottom: "6px" }}>Game Over</h2>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px", lineHeight: 1.5 }}>
            All 75 balls were called with no winner.
          </p>
        </div>
        <div style={wm.statsRow}>
          <StatCell label="Balls Called" value={`${ballsCalledCount}/75`} />
        </div>
        {countdown !== null && (
          <p style={{ textAlign: "center" as const, color: "rgba(255,255,255,0.4)", fontSize: "12px", margin: "12px 0 8px" }}>
            Returning home in {countdown}s
          </p>
        )}
        <button style={{ ...wm.claimBtn, width: "100%" }} onClick={onLeave}>Return Home</button>
      </div>
    </div>
  );
}

function GameOverAnnouncement({ winnerName, cartelaId, winnerCard, winnerPattern, patternLabel, prize, ballsCalledCount, called, countdown, onLeave }: {
  winnerName: string; cartelaId: number | null; winnerCard: (number | null)[][] | null;
  winnerPattern: Pattern | null; patternLabel: string; prize: number;
  ballsCalledCount: number; called: Set<number>; countdown: number | null; onLeave: () => void;
}) {
  return (
    <div className="overlay-in" style={wm.overlay}>
      <div className="win-card" style={wm.card} onClick={(e) => e.stopPropagation()}>
        <div style={{ textAlign: "center" as const, marginBottom: "10px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 900, color: "#ff4444", marginBottom: "4px" }}>Game Over</h2>
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "13px", lineHeight: 1.5 }}>
            <span style={{ color: "#f5a623", fontWeight: 800 }}>{winnerName}</span> won this round!
          </p>
        </div>

        <div style={wm.prizeBox}>
          <span style={wm.prizeLabel}>Prize Won</span>
          <span style={{ ...wm.prizeAmt, fontSize: "20px" }}>{Math.round(prize).toLocaleString()} ETB</span>
        </div>

        <div style={wm.statsRow}>
          <StatCell label="Cartela"  value={cartelaId !== null ? `#${cartelaId}` : "—"} />
          <StatCell label="Pattern"  value={patternLabel} />
          <StatCell label="Called"   value={`${ballsCalledCount}/75`} />
        </div>

        {winnerCard && cartelaId !== null && (
          <div style={wm.cardWrap}>
            <p style={wm.cardTitle}>Winning Cartela #{cartelaId}</p>
            <div style={wm.cardCols}>
              {BINGO_COLS.map(({ label, color }) => <div key={label} style={{ ...wm.cardColLabel, color }}>{label}</div>)}
            </div>
            <div style={wm.cardGrid}>
              {winnerCard.map((row, ri) =>
                row.map((num, ci) => {
                  const isFree = num === null;
                  const isHit  = !isFree && called.has(num);
                  const isWin  = winnerPattern ? isInPattern(winnerPattern, ri, ci) : false;
                  return (
                    <div key={`${ri}-${ci}`} style={{
                      ...wm.cardCell,
                      ...(isFree ? wm.cardFree : {}),
                      ...(isHit && !isFree && !isWin ? { background: "rgba(56,189,248,0.45)", border: "1px solid rgba(56,189,248,0.85)", color: "#fff", fontWeight: 700 } : {}),
                      ...(isWin ? { background: "linear-gradient(135deg,#f5a623,#e8860a)", border: "none", color: "#fff", fontWeight: 800, boxShadow: "0 0 10px rgba(245,166,35,0.6)", transform: "scale(1.05)" } : {}),
                    }}>
                      {isFree ? "★" : num}
                    </div>
                  );
                }),
              )}
            </div>
          </div>
        )}

        {countdown !== null && (
          <p style={{ textAlign: "center" as const, color: "rgba(255,255,255,0.4)", fontSize: "12px", marginBottom: "8px" }}>
            Returning home in {countdown}s
          </p>
        )}

        <button style={{ ...wm.claimBtn, width: "100%" }} onClick={onLeave}>Return Home</button>
      </div>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={wm.stat}>
      <span style={wm.statLabel}>{label}</span>
      <span style={wm.statValue}>{value}</span>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: { height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", background: "linear-gradient(160deg,#120e2e 0%,#0d0b1e 100%)" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(16,11,44,0.98)", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0, height: "48px" },
  leaveBtn: { display: "flex", alignItems: "center", gap: "4px", background: "rgba(255,72,66,0.12)", border: "1px solid rgba(255,72,66,0.3)", borderRadius: "10px", padding: "5px 10px", color: "#ff4842", fontSize: "12px", fontWeight: 700, cursor: "pointer", flexShrink: 0 },
  leaveBtnDisabled: { opacity: 0.3, cursor: "not-allowed", pointerEvents: "none" as const },
  headerCenter: { display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", flex: 1 },
  gameIdChip: { fontSize: "13px", fontWeight: 800, color: "#fff", letterSpacing: "0.5px" },
  stakeTag:   { fontSize: "10px", fontWeight: 600, color: "var(--accent-orange)", background: "rgba(245,166,35,0.12)", borderRadius: "5px", padding: "1px 6px" },
  speakerWrap:{ position: "relative", width: "40px", height: "40px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" },
  ring:       { position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid rgba(245,166,35,0.6)", pointerEvents: "none" as const },
  infoBar:    { display: "flex", alignItems: "center", padding: "0 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, height: "36px", background: "rgba(255,255,255,0.03)" },
  infoChip:   { display: "flex", flexDirection: "column", alignItems: "center", flex: 1 },
  infoLabel:  { fontSize: "8px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, letterSpacing: "0.5px", fontWeight: 500 },
  infoValue:  { fontSize: "11px", fontWeight: 700 },
  infoDivider:{ width: "1px", height: "20px", background: "rgba(255,255,255,0.1)", margin: "0 8px" },
  mainRow:    { flex: 1, display: "flex", flexDirection: "row", overflow: "hidden", minHeight: 0 },
  boardPanel: { flex: "0 0 42%", overflowY: "auto" as const, padding: "6px", borderRight: "1px solid rgba(255,255,255,0.07)" },
  boardGrid:  { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "2px" },
  colHeader:  { textAlign: "center" as const, fontSize: "13px", fontWeight: 800, padding: "5px 0", letterSpacing: "0.5px" },
  boardCell:  { aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "5px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", fontSize: "10px", fontWeight: 500, color: "rgba(255,255,255,0.5)", transition: "all 0.2s", position: "relative" as const },
  rightPanel: { flex: 1, overflowY: "auto" as const, padding: "6px 8px 8px 6px", display: "flex", flexDirection: "column", gap: "6px" },
  recentRow:  { display: "flex", gap: "4px", flexWrap: "wrap" as const, flexShrink: 0 },
  recentChip: { borderRadius: "6px", padding: "2px 7px", letterSpacing: "0.3px" },
  recentEmpty:{ fontSize: "10px", color: "rgba(255,255,255,0.25)", fontStyle: "italic" as const },
  ballWrap:   { display: "flex", justifyContent: "center", alignItems: "center", padding: "4px 0 6px", flexShrink: 0 },
  ball:       { width: "88px", height: "88px", borderRadius: "50%", border: "2.5px solid", background: "rgba(255,255,255,0.05)", backdropFilter: "blur(10px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  ballLetter: { fontSize: "16px", fontWeight: 800, lineHeight: 1, letterSpacing: "1px" },
  ballNumber: { fontSize: "28px", fontWeight: 900, color: "#fff", lineHeight: 1.1 },
  ballPlaceholder:    { width: "88px", height: "88px", borderRadius: "50%", border: "2px dashed rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" },
  ballPlaceholderText:{ fontSize: "12px", color: "rgba(255,255,255,0.25)", fontWeight: 500 },
  watchOnly:  { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px", padding: "24px 16px", background: "rgba(245,166,35,0.04)", borderRadius: "16px", border: "1px solid rgba(245,166,35,0.25)" },
  watchTitle: { fontSize: "14px", fontWeight: 800, color: "rgba(255,255,255,0.7)", letterSpacing: "0.05em", textTransform: "uppercase" as const },
  watchSub:   { fontSize: "13px", color: "rgba(255,255,255,0.75)", textAlign: "center" as const, lineHeight: 1.7, whiteSpace: "pre-line" as const },
  bottomBar:  { position: "relative" as const, display: "flex", gap: "8px", padding: "8px 12px", background: "rgba(16,11,44,0.98)", borderTop: "1px solid rgba(255,255,255,0.08)", flexShrink: 0, height: "56px", alignItems: "center" },
  leaveBarBtn:{ display: "flex", alignItems: "center", gap: "4px", padding: "10px 14px", borderRadius: "12px", background: "rgba(255,72,66,0.12)", border: "1px solid rgba(255,72,66,0.3)", color: "#ff4842", fontSize: "13px", fontWeight: 700, cursor: "pointer", flexShrink: 0 },
  autoBtn:    { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", padding: "10px", borderRadius: "12px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)", fontSize: "13px", fontWeight: 600, cursor: "pointer" },
  autoBtnOn:  { background: "rgba(245,166,35,0.18)", border: "1px solid rgba(245,166,35,0.5)", color: "var(--accent-orange)", boxShadow: "0 0 14px rgba(245,166,35,0.2)" },
  notBingoBanner: { position: "absolute" as const, top: "-42px", left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap" as const, background: "rgba(255,72,66,0.18)", border: "1px solid rgba(255,72,66,0.45)", borderRadius: "10px", padding: "7px 16px", color: "#ff4842", fontSize: "12px", fontWeight: 700 },
  bingoBtn:   { flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "10px", borderRadius: "12px", background: "linear-gradient(90deg,#c0392b,#ff4842)", border: "none", color: "#fff", fontSize: "15px", fontWeight: 800, cursor: "pointer", letterSpacing: "0.5px", boxShadow: "0 4px 18px rgba(255,72,66,0.45)" },
  bingoBtnLit:{ background: "linear-gradient(90deg,#e8260e,#ff6b5b)" },
};

const cc: Record<string, React.CSSProperties> = {
  wrap:    { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "8px", flexShrink: 0, transition: "border-color 0.3s" },
  wrapWin: { border: "1.5px solid rgba(245,166,35,0.7)", boxShadow: "0 0 18px rgba(245,166,35,0.2)", background: "rgba(245,166,35,0.05)" },
  head:    { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "5px" },
  title:   { fontSize: "11px", fontWeight: 700, color: "rgba(255,255,255,0.7)" },
  hitBadge:{ fontSize: "9px", fontWeight: 700, color: "#00c853", background: "rgba(0,200,83,0.15)", border: "1px solid rgba(0,200,83,0.35)", borderRadius: "6px", padding: "1px 6px" },
  winBadge:{ fontSize: "9px", fontWeight: 800, color: "#f5a623", background: "rgba(245,166,35,0.15)", border: "1px solid rgba(245,166,35,0.4)", borderRadius: "6px", padding: "1px 7px" },
  colRow:  { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "2px", marginBottom: "3px" },
  colLabel:{ textAlign: "center" as const, fontSize: "9px", fontWeight: 800, letterSpacing: "0.5px" },
  grid:    { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "2px" },
  cell:    { aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "5px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "10px", fontWeight: 600, color: "rgba(255,255,255,0.55)", transition: "all 0.2s" },
  cellFree:{ background: "linear-gradient(135deg,#f5a623,#e8860a)", border: "none", color: "#fff", fontSize: "11px" },
};

const wm: Record<string, React.CSSProperties> = {
  overlay:    { position: "fixed", inset: 0, background: "rgba(5,3,18,0.88)", backdropFilter: "blur(6px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", overflow: "hidden" },
  confettiWrap:{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" as const },
  card:       { position: "relative", width: "100%", maxWidth: "360px", maxHeight: "90vh", overflowY: "auto" as const, background: "linear-gradient(160deg,#1e1650 0%,#130f35 100%)", border: "1px solid rgba(245,166,35,0.35)", borderRadius: "24px", padding: "20px 18px 22px", boxShadow: "0 0 60px rgba(245,166,35,0.2), 0 24px 80px rgba(0,0,0,0.8)" },
  glowRing:   { position: "absolute", top: "0", left: "50%", transform: "translateX(-50%)", width: "160px", height: "160px", borderRadius: "50%", background: "radial-gradient(circle,rgba(245,166,35,0.15) 0%,transparent 70%)", pointerEvents: "none" as const },
  head:       { display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", marginBottom: "16px" },
  trophyCircle:{ width: "64px", height: "64px", borderRadius: "50%", background: "linear-gradient(135deg,rgba(245,166,35,0.2),rgba(245,166,35,0.05))", border: "2px solid rgba(245,166,35,0.5)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 24px rgba(245,166,35,0.35)" },
  bingoText:  { fontSize: "34px", fontWeight: 900, color: "#fff", letterSpacing: "2px", textShadow: "0 0 20px rgba(255,72,66,0.6)" },
  congrats:   { fontSize: "14px", color: "rgba(255,255,255,0.7)", fontWeight: 500, textAlign: "center" as const },
  prizeBox:   { display: "flex", flexDirection: "column", alignItems: "center", background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.25)", borderRadius: "16px", padding: "12px 20px", marginBottom: "14px" },
  prizeLabel: { fontSize: "10px", color: "rgba(245,166,35,0.7)", textTransform: "uppercase" as const, letterSpacing: "1px", fontWeight: 600 },
  prizeAmt:   { fontSize: "32px", fontWeight: 900, color: "#f5a623", letterSpacing: "0.5px" },
  statsRow:   { display: "flex", gap: "6px", marginBottom: "14px" },
  stat:       { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", background: "rgba(255,255,255,0.05)", borderRadius: "10px", padding: "8px 4px", gap: "3px" },
  statLabel:  { fontSize: "8px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, letterSpacing: "0.5px" },
  statValue:  { fontSize: "12px", fontWeight: 700, color: "#fff" },
  cardWrap:   { marginBottom: "16px" },
  cardTitle:  { fontSize: "11px", fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: "6px", textAlign: "center" as const },
  cardCols:   { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "3px", marginBottom: "3px" },
  cardColLabel:{ textAlign: "center" as const, fontSize: "11px", fontWeight: 800, padding: "2px 0" },
  cardGrid:   { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "3px" },
  cardCell:   { aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "7px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.4)", transition: "transform 0.15s" },
  cardFree:   { background: "rgba(245,166,35,0.15)", border: "1px solid rgba(245,166,35,0.4)", color: "#f5a623", fontSize: "13px" },
  actions:    { display: "flex", gap: "10px" },
  claimBtn:   { flex: 2, padding: "13px", borderRadius: "14px", background: "linear-gradient(90deg,#00b140,#00c853)", border: "none", color: "#fff", fontSize: "14px", fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,200,83,0.35)" },
  leaveBtn:   { flex: 1, padding: "13px", borderRadius: "14px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)", fontSize: "13px", fontWeight: 600, cursor: "pointer" },
};
