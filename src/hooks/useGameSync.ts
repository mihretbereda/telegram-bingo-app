import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/services/supabase";
import type { GameBall, GameResult } from "@/types/database";

/**
 * Manages a single Supabase Realtime channel for the entire active game.
 * Call this once in Game.tsx; it handles all four tables in one channel so
 * there is only one WebSocket subscription per session.
 *
 * Guarantees:
 * - Ball inserts are optimistically prepended immediately (sub-second).
 * - Session, result, and participant changes trigger query invalidation.
 * - On any reconnection (SUBSCRIBED fires a second time), all four queries
 *   are invalidated and re-fetched so missed events are recovered.
 * - Returning from background (visibilitychange) triggers the same full
 *   re-fetch.
 * - On unmount the channel is torn down cleanly.
 */
export function useGameSync(sessionId: string | undefined) {
  const queryClient   = useQueryClient();
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!sessionId) return;

    const invalidateAll = () => {
      queryClient.invalidateQueries({ queryKey: ["game-balls",      sessionId] });
      queryClient.invalidateQueries({ queryKey: ["game-session-id", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["game-result",     sessionId] });
      queryClient.invalidateQueries({ queryKey: ["participants",    sessionId] });
    };

    const channel = supabase
      .channel(`game-sync-${sessionId}`)

      // ── Balls: optimistic append so the board updates in < 100 ms ──────────
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "game_balls",
          filter: `game_session_id=eq.${sessionId}`,
        },
        (payload) => {
          const ball = payload.new as GameBall;
          queryClient.setQueryData<GameBall[]>(
            ["game-balls", sessionId],
            (old) => {
              if (!old) return [ball];
              // Guard against duplicate delivery
              return old.some((b) => b.id === ball.id) ? old : [...old, ball];
            },
          );
        },
      )

      // ── Session: invalidate on any update (status, prize_pool, etc.) ───────
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_sessions",
          filter: `id=eq.${sessionId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["game-session-id", sessionId] }),
      )

      // ── Result: set immediately so the win/game-over modal shows in < 100ms ─
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "game_results",
          filter: `game_session_id=eq.${sessionId}`,
        },
        (payload) =>
          queryClient.setQueryData(["game-result", sessionId], payload.new as GameResult),
      )

      // ── Participants: invalidate on any change (player count, auto_mode) ───
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_participants",
          filter: `game_session_id=eq.${sessionId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["participants", sessionId] }),
      )

      // ── Reconnection recovery ─────────────────────────────────────────────
      // SUBSCRIBED fires once on first connect (skip — initial useQuery fetches
      // already cover this) and again after every reconnection. On reconnect,
      // invalidate all four queries to catch any events that were missed while
      // the WebSocket was down.
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (subscribedRef.current) {
            invalidateAll();
          }
          subscribedRef.current = true;
        }
      });

    // ── Visibility restore ────────────────────────────────────────────────────
    // Covers OS-level backgrounding (mobile) where the WebSocket may still be
    // "connected" but no events were delivered while the app was suspended.
    const onVisible = () => {
      if (document.visibilityState === "visible") invalidateAll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      subscribedRef.current = false;
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [queryClient, sessionId]);
}
