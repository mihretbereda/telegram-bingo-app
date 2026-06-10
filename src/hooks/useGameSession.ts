import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/services/supabase";
import type { GameSession } from "@/types/database";

// Returns the active waiting/active session for a given stake amount
export function useGameSession(stake: number | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!stake) return;

    const channel = supabase
      .channel(`game-session-${stake}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_sessions" },
        () => { queryClient.invalidateQueries({ queryKey: ["game-session", stake] }); },
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: ["game-session", stake] });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [queryClient, stake]);

  return useQuery<GameSession | null>({
    queryKey: ["game-session", stake],
    enabled: !!stake,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 5000, // Poll every 5s as backup to realtime
    queryFn: async () => {
      // Check active first — a new waiting session is created the moment a game
      // starts, so both coexist briefly. We must prefer active over waiting.
      for (const status of ["active", "waiting"] as const) {
        const { data, error } = await supabase
          .from("game_sessions")
          .select("id, stake_amount, status, timer_ends_at, call_index, prize_pool, participant_count, started_at, ended_at, created_at")
          .eq("stake_amount", stake!)
          .eq("status", status)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (data) return data as unknown as GameSession;
      }
      return null;
    },
  });
}

// Returns any session by ID (for the game page)
export function useGameSessionById(sessionId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`game-session-id-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_sessions", filter: `id=eq.${sessionId}` },
        () => { queryClient.invalidateQueries({ queryKey: ["game-session-id", sessionId] }); },
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: ["game-session-id", sessionId] });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [queryClient, sessionId]);

  return useQuery<GameSession | null>({
    queryKey: ["game-session-id", sessionId],
    enabled: !!sessionId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_sessions")
        .select("id, stake_amount, status, timer_ends_at, call_index, prize_pool, participant_count, started_at, ended_at, created_at")
        .eq("id", sessionId!)
        .single();
      if (error) {
        if (error.code === "PGRST116") return null;
        throw error;
      }
      return data as unknown as GameSession;
    },
  });
}
