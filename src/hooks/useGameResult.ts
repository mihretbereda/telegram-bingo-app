import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/services/supabase";
import type { GameResult } from "@/types/database";

// Real-time delivery is handled by useGameSync (optimistic set on INSERT).
// refetchInterval ensures the game-over modal appears within 4 s even if
// the WebSocket misses the result event.
export function useGameResult(sessionId: string | undefined) {
  return useQuery<GameResult | null>({
    queryKey: ["game-result", sessionId],
    enabled: !!sessionId,
    staleTime: 0,
    refetchInterval: 4_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_results")
        .select("*")
        .eq("game_session_id", sessionId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}
