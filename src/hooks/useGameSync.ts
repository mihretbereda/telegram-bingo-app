import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/services/supabase";
import type { GameBall, GameResult } from "@/types/database";

/**
 * Single shared broadcast channel `session-{id}` per game session.
 *
 * All players in a session subscribe to the same channel, so Supabase Realtime
 * sees 2 connections total (one per stake level) regardless of player count —
 * not 2 per player. This keeps the app within the free-tier connection limit
 * and scales to unlimited concurrent players.
 *
 * Events:
 *   ball   — new ball called (from game-runner)
 *   result — winner confirmed (from claim-bingo)
 *   status — session finished with no winner (from game-runner)
 *
 * Fallback: useGameBalls polls the DB every 30 s as a safety net for missed
 * events (reconnect, background). visibilitychange and WebSocket reconnect
 * both trigger an immediate full invalidation to catch up instantly.
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
      .channel(`session-${sessionId}`, {
        config: { broadcast: { ack: false } },
      })

      // Live ball delivery — update cache immediately, no DB round-trip.
      .on("broadcast", { event: "ball" }, ({ payload }) => {
        const ball = payload as Pick<GameBall, "ball_number" | "sequence_index" | "game_session_id">;
        queryClient.setQueryData<GameBall[]>(
          ["game-balls", sessionId],
          (old) => {
            if (!old) return [ball as GameBall];
            return old.some((b) => b.sequence_index === ball.sequence_index)
              ? old
              : [...old, ball as GameBall];
          },
        );
      })

      // Winner confirmed — set result in cache and refresh session status.
      .on("broadcast", { event: "result" }, ({ payload }) => {
        queryClient.setQueryData(["game-result", sessionId], payload as GameResult);
        queryClient.invalidateQueries({ queryKey: ["game-session-id", sessionId] });
      })

      // No-winner game end — refresh session so finished state is reflected.
      .on("broadcast", { event: "status" }, () => {
        queryClient.invalidateQueries({ queryKey: ["game-session-id", sessionId] });
      })

      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // On reconnect (already had a subscription), invalidate everything
          // so the 30 s poll catches up any balls missed while disconnected.
          if (subscribedRef.current) invalidateAll();
          subscribedRef.current = true;
        }
      });

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
