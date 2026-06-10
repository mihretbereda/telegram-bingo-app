import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/services/supabase";
import type { GameBall } from "@/types/database";

export function useGameBalls(sessionId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`balls-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "game_balls",
          filter: `game_session_id=eq.${sessionId}`,
        },
        (payload) => {
          // Optimistically append the new ball to the cached list
          queryClient.setQueryData<GameBall[]>(["game-balls", sessionId], (old) => {
            if (!old) return [payload.new as GameBall];
            const exists = old.some((b) => b.id === (payload.new as GameBall).id);
            return exists ? old : [...old, payload.new as GameBall];
          });
        },
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: ["game-balls", sessionId] });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [queryClient, sessionId]);

  return useQuery<GameBall[]>({
    queryKey: ["game-balls", sessionId],
    enabled: !!sessionId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_balls")
        .select("*")
        .eq("game_session_id", sessionId!)
        .order("sequence_index", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
