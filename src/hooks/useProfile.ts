import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/services/supabase";
import type { Profile } from "@/types/database";

export function useProfile(userId: string | undefined) {
  return useQuery<Profile | null>({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // row not found
        throw error;
      }
      return data;
    },
  });
}
