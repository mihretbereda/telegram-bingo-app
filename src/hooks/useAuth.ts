import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import WebApp from "@twa-dev/sdk";
import { supabase } from "@/services/supabase";
import { signInWithTelegram, syncProfile } from "@/services/auth";
import type { TelegramUser } from "@/types/telegram";

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
      const tgUser = WebApp.initDataUnsafe?.user as TelegramUser | undefined;
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      if (data.session) {
        const sessionTelegramId = data.session.user.user_metadata?.telegram_id;
        // If the cached session belongs to a different Telegram account, clear it
        // so the correct account authenticates fresh (handles multi-account devices).
        if (tgUser && sessionTelegramId && sessionTelegramId !== tgUser.id) {
          await supabase.auth.signOut();
          // Fall through to re-authenticate as the current Telegram user
        } else {
          setSession(data.session);
          setIsLoading(false);
          if (tgUser) syncProfile(tgUser);
          return;
        }
      }

      // No session — authenticate via Telegram initData
      const initData = WebApp.initData;
      if (!initData) {
        setIsLoading(false);
        return;
      }

      try {
        await signInWithTelegram(initData);
        // onAuthStateChange below picks up the new session
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Auth failed");
          setIsLoading(false);
        }
      }
    }

    init();

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
