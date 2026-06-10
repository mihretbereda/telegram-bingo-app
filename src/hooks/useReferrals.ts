import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/services/supabase";

export interface ReferralStats {
  totalInvited: number;
  totalEarnings: number;
}

export function useReferrals(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`referrals-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "referrals", filter: `referrer_id=eq.${userId}` },
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
      const { data } = await supabase
        .from("referrals")
        .select("bonus_amount")
        .eq("referrer_id", userId!);
      return {
        totalInvited:  data?.length ?? 0,
        totalEarnings: data?.reduce((sum, r) => sum + r.bonus_amount, 0) ?? 0,
      };
    },
  });
}
