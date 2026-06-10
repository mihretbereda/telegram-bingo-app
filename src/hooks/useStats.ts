import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/services/supabase";

export interface HomeStats {
  activePlayers: number;
  gamesPlayed: number;
  winnersToday: number;
}

export function useStats() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("stats-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "game_sessions" }, () => {
        queryClient.invalidateQueries({ queryKey: ["stats"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "game_results" }, () => {
        queryClient.invalidateQueries({ queryKey: ["stats"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "profiles" }, () => {
        queryClient.invalidateQueries({ queryKey: ["stats"] });
      })
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: ["stats"] });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [queryClient]);

  return useQuery<HomeStats>({
    queryKey: ["stats"],
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    queryFn: async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [participantsRes, sessionsRes, winnersRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("game_sessions")
          .select("id", { count: "exact", head: true })
          .eq("status", "finished"),
        supabase
          .from("game_results")
          .select("id", { count: "exact", head: true })
          .gte("won_at", yesterday),
      ]);

      return {
        activePlayers: participantsRes.count ?? 0,
        gamesPlayed: sessionsRes.count ?? 0,
        winnersToday: winnersRes.count ?? 0,
      };
    },
  });
}
