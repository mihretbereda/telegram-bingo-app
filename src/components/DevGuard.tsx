import { useEffect, useState } from "react";
import WebApp from "@twa-dev/sdk";
import { supabase } from "@/services/supabase";
import { signInWithTelegram } from "@/services/auth";
import type { TelegramUser } from "@/types/telegram";

const ADMIN_TELEGRAM_ID = 676350518;

export default function DevGuard({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "allowed" | "blocked">("loading");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const tgUser = WebApp.initDataUnsafe?.user as TelegramUser | undefined;
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      if (data.session) {
        const tid = data.session.user.user_metadata?.telegram_id;
        if (!cancelled) setStatus(tid === ADMIN_TELEGRAM_ID ? "allowed" : "blocked");
        return;
      }

      // No session yet — trigger Telegram auth then let onAuthStateChange handle it
      const initData = WebApp.initData;
      if (!initData) {
        if (!cancelled) setStatus("blocked");
        return;
      }
      try {
        await signInWithTelegram(initData);
      } catch {
        if (!cancelled) setStatus("blocked");
      }
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (!session) { setStatus("blocked"); return; }
      const tid = session.user.user_metadata?.telegram_id;
      setStatus(tid === ADMIN_TELEGRAM_ID ? "allowed" : "blocked");
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (status === "loading") {
    return (
      <div style={s.page}>
        <div style={s.spinner} />
      </div>
    );
  }

  if (status === "blocked") {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.emoji}>🎱</div>
          <div style={s.title}>Nova Bingo</div>
          <div style={s.sub}>Coming Soon</div>
          <div style={s.body}>We're putting the finishing touches on something exciting. Check back soon!</div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(160deg,#0f0c24 0%,#080614 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "24px",
  },
  spinner: {
    width: "28px", height: "28px", borderRadius: "50%",
    border: "3px solid rgba(255,255,255,0.1)",
    borderTop: "3px solid #f5a623",
    animation: "spin 0.8s linear infinite",
  },
  card: {
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: "12px", maxWidth: "280px", textAlign: "center",
  },
  emoji: { fontSize: "52px" },
  title: { fontSize: "26px", fontWeight: 900, color: "#fff", letterSpacing: "1px" },
  sub: {
    fontSize: "13px", fontWeight: 700, color: "#f5a623",
    textTransform: "uppercase" as const, letterSpacing: "2px",
  },
  body: { fontSize: "13px", color: "rgba(255,255,255,0.4)", lineHeight: 1.7 },
};
