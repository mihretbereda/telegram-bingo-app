import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/services/supabase";
import type { GameParticipant } from "@/types/database";

// Real-time delivery and reconnection recovery are handled by useGameSync.
// Participants are stable once the game starts, so a 10 s poll is sufficient.
export function useGameParticipants(sessionId: string | undefined) {
  return useQuery<GameParticipant[]>({
    queryKey: ["participants", sessionId],
    enabled: !!sessionId,
    staleTime: 0,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_participants")
        .select("*")
        .eq("game_session_id", sessionId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}
