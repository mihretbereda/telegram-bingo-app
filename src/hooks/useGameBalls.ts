import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/services/supabase";
import type { GameBall } from "@/types/database";

// Real-time delivery and reconnection recovery are handled by useGameSync.
// refetchInterval is a polling safety-net: balls are called every 4 s, so
// a 5 s poll ensures the board never falls more than one call behind even
// if the WebSocket is completely unavailable.
export function useGameBalls(sessionId: string | undefined) {
  return useQuery<GameBall[]>({
    queryKey: ["game-balls", sessionId],
    enabled: !!sessionId,
    staleTime: 0,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
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
