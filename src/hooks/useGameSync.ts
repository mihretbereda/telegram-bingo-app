import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/services/supabase";
import type { GameBall, GameResult } from "@/types/database";

/**
 * Manages two Supabase Realtime channels for the active game:
 *
 * 1. session-balls-{id}  — Broadcast channel.
 *    game-runner broadcasts each ball directly via the Supabase Broadcast REST
 *    API after calling it. One server fan-out reaches all players simultaneously
 *    with no per-subscriber Postgres WAL overhead. This is the primary live
 *    delivery path for ball calls.
 *
 * 2. game-sync-{id}  — Postgres changes channel.
 *    Tracks session status, game results, and participant changes. game_balls is
 *    intentionally excluded — live delivery is handled by the Broadcast channel
 *    above. The useGameBalls 5-second poll remains the fallback: if a player
 *    misses a broadcast (reconnect, background), the poll catches them up from
 *    the database automatically.
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

    // ── 1. Broadcast channel — live ball delivery ─────────────────────────────
    const ballChannel = supabase
      .channel(`session-balls-${sessionId}`, {
        config: { broadcast: { ack: false } },
      })
      .on("broadcast", { event: "ball" }, ({ payload }) => {
        const ball = payload as Pick<GameBall, "ball_number" | "sequence_index" | "game_session_id">;
        console.log("📡 BROADCAST ball:", ball.ball_number);
        window.dispatchEvent(new CustomEvent("ball-broadcast", { detail: ball.ball_number }));
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
      .subscribe((status) => {
        console.log(`📡 ball broadcast channel: ${status} | session: ${sessionId}`);
      });

    // ── 2. Postgres changes — session state, results, participants ────────────
    const pgChannel = supabase
      .channel(`game-sync-${sessionId}`)

      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "game_sessions",
          filter: `id=eq.${sessionId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["game-session-id", sessionId] }),
      )

      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "game_results",
          filter: `game_session_id=eq.${sessionId}`,
        },
        (payload) =>
          queryClient.setQueryData(["game-result", sessionId], payload.new as GameResult),
      )

      .on(
        "postgres_changes",
        {
          event:  "*",
          schema: "public",
          table:  "game_participants",
          filter: `game_session_id=eq.${sessionId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["participants", sessionId] }),
      )

      // On reconnect, invalidate everything so the poll catches up any balls
      // missed while the WebSocket was down.
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
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
      supabase.removeChannel(ballChannel);
      supabase.removeChannel(pgChannel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [queryClient, sessionId]);
}
