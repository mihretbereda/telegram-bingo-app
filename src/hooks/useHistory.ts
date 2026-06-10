import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/services/supabase";

export interface GameHistoryEntry {
  id: string;
  session_id: string;
  stake_amount: number;
  status: "won" | "lost";
  prize_amount: number | null;
  balls_called: number | null;
  pattern: string | null;
  played_at: string;
}

export interface HistorySummary {
  totalPlayed: number;
  totalWon: number;
  totalLost: number;
  entries: GameHistoryEntry[];
}

export function useHistory(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`history-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "game_results" }, () => {
        queryClient.invalidateQueries({ queryKey: ["history", userId] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "game_participants" }, () => {
        queryClient.invalidateQueries({ queryKey: ["history", userId] });
      })
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: ["history", userId] });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [queryClient, userId]);

  return useQuery<HistorySummary>({
    queryKey: ["history", userId],
    enabled: !!userId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // Fetch all sessions the user participated in (non-watcher)
      const { data: parts } = await supabase
        .from("game_participants")
        .select("game_session_id, created_at")
        .eq("user_id", userId!)
        .eq("is_watcher", false)
        .eq("stake_deducted", true);

      if (!parts || parts.length === 0) {
        return { totalPlayed: 0, totalWon: 0, totalLost: 0, entries: [] };
      }

      const sessionIds = parts.map((p) => p.game_session_id);

      // Get session info + results in parallel
      const [sessionsRes, resultsRes] = await Promise.all([
        supabase
          .from("game_sessions")
          .select("id, stake_amount, status, ended_at")
          .in("id", sessionIds)
          .eq("status", "finished"),
        supabase
          .from("game_results")
          .select("game_session_id, winner_id, prize_amount, balls_called_count, pattern, won_at")
          .in("game_session_id", sessionIds),
      ]);

      const sessions = sessionsRes.data ?? [];
      const results  = resultsRes.data ?? [];
      const resultMap = new Map(results.map((r) => [r.game_session_id, r]));

      const entries: GameHistoryEntry[] = sessions.map((s) => {
        const result = resultMap.get(s.id);
        const won    = result?.winner_id === userId;
        return {
          id:           s.id,
          session_id:   s.id,
          stake_amount: s.stake_amount,
          status:       won ? "won" : "lost",
          prize_amount: won ? result?.prize_amount ?? null : null,
          balls_called: result?.balls_called_count ?? null,
          pattern:      result?.pattern ?? null,
          played_at:    s.ended_at ?? s.id,
        };
      });

      entries.sort((a, b) => b.played_at.localeCompare(a.played_at));

      return {
        totalPlayed: entries.length,
        totalWon:    entries.filter((e) => e.status === "won").length,
        totalLost:   entries.filter((e) => e.status === "lost").length,
        entries,
      };
    },
  });
}
