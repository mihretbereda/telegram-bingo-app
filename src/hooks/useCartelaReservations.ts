import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/services/supabase";
import type { CartelaReservation } from "@/types/database";

const ACTIVE = new Set(["reserved", "confirmed"]);

export function useCartelaReservations(sessionId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!sessionId) return;

    const key = ["reservations", sessionId];

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
        (payload) => {
          queryClient.setQueryData<CartelaReservation[]>(key, (old) => {
            const rows = old ?? [];

            if (payload.eventType === "INSERT") {
              const row = payload.new as CartelaReservation;
              if (!ACTIVE.has(row.status)) return rows;
              // Replace a matching optimistic entry (same user+slot+cartela) instead of appending
              const optimisticIdx = rows.findIndex(
                (r) => r.id.startsWith("optimistic-") && r.user_id === row.user_id && r.slot === row.slot && r.cartela_number === row.cartela_number,
              );
              if (optimisticIdx !== -1) {
                const next = [...rows];
                next[optimisticIdx] = row;
                return next;
              }
              return rows.some((r) => r.id === row.id) ? rows : [...rows, row];
            }

            if (payload.eventType === "UPDATE") {
              const row = payload.new as CartelaReservation;
              if (!ACTIVE.has(row.status)) {
                // released — remove from cache
                return rows.filter((r) => r.id !== row.id);
              }
              // status change within active set — update in place
              return rows.map((r) => (r.id === row.id ? row : r));
            }

            if (payload.eventType === "DELETE") {
              const id = (payload.old as { id?: string }).id;
              return id ? rows.filter((r) => r.id !== id) : rows;
            }

            return rows;
          });
        },
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: key });
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
    refetchInterval: 5000,
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
