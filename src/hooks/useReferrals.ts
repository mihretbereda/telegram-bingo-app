import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/services/supabase";
import WebApp from "@twa-dev/sdk";

export interface ReferralStats {
  totalInvited: number;
  totalEarnings: number;
}

const BACKEND_URL = "https://nova-bingo-bot-production.up.railway.app";

export function useReferrals(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`referrals-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "transactions", filter: `user_id=eq.${userId}` },
        () => { queryClient.invalidateQueries({ queryKey: ["referrals", userId] }); },
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: ["referrals", userId] });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [queryClient, userId]);

  return useQuery<ReferralStats>({
    queryKey: ["referrals", userId],
    enabled: !!userId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const telegramId = WebApp.initDataUnsafe?.user?.id;
      if (!telegramId) return { totalInvited: 0, totalEarnings: 0 };

      const res = await fetch(`${BACKEND_URL}/users/${telegramId}/referral-stats`);
      if (!res.ok) return { totalInvited: 0, totalEarnings: 0 };
      return res.json();
    },
  });
}
