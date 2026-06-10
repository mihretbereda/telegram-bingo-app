import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/services/supabase";
import type { CartelaReservation } from "@/types/database";

export function useCartelaReservations(sessionId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`reservations-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cartela_reservations",
          filter: `game_session_id=eq.${sessionId}`,
        },
        () => { queryClient.invalidateQueries({ queryKey: ["reservations", sessionId] }); },
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: ["reservations", sessionId] });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [queryClient, sessionId]);

  return useQuery<CartelaReservation[]>({
    queryKey: ["reservations", sessionId],
    enabled: !!sessionId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cartela_reservations")
        .select("*")
        .eq("game_session_id", sessionId!)
        .in("status", ["reserved", "confirmed"]);
      if (error) throw error;
      return data ?? [];
    },
  });
}
