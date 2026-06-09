import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase";
import { signInWithTelegram } from "@/services/auth";
import WebApp from "@twa-dev/sdk";

interface UseAuthReturn {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

export function useAuth(): UseAuthReturn {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // 1. Check for an existing persisted session first
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      if (data.session) {
        setSession(data.session);
        setIsLoading(false);
        return;
      }

      // 2. No session — try to sign in via Telegram initData
      const initData = WebApp.initData;
      if (!initData) {
        // Running in plain browser (dev), not inside Telegram — skip auth
        setIsLoading(false);
        return;
      }

      try {
        await signInWithTelegram(initData);
        // onAuthStateChange below will update session state
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Auth failed");
          setIsLoading(false);
        }
      }
    }

    init();

    // Keep session state in sync with Supabase auth events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!cancelled) {
          setSession(newSession);
          setIsLoading(false);
        }
      },
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    user: session?.user ?? null,
    isLoading,
    isAuthenticated: !!session,
    error,
  };
}
