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
      const [invitesRes, earningsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("referred_by", userId!),
        supabase
          .from("transactions")
          .select("amount")
          .eq("user_id", userId!)
          .eq("type", "referral_bonus"),
      ]);

      return {
        totalInvited:  invitesRes.count ?? 0,
        totalEarnings: earningsRes.data?.reduce((sum, r) => sum + r.amount, 0) ?? 0,
      };
    },
  });
}
