import { useEffect, useState } from "react";
import { supabase } from "@/services/supabase";

const ADMIN_TELEGRAM_ID = 676350518;

export default function DevGuard({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "allowed" | "blocked">("loading");

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { setStatus("blocked"); return; }
      const { data } = await supabase
        .from("profiles")
        .select("telegram_id")
        .eq("id", session.user.id)
        .single();
      setStatus(data?.telegram_id === ADMIN_TELEGRAM_ID ? "allowed" : "blocked");
    });
  }, []);

  if (status === "loading") {
    return (
      <div style={s.page}>
        <div style={s.dot} />
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
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
  },
  dot: {
    width: "10px", height: "10px", borderRadius: "50%",
    background: "rgba(255,255,255,0.2)",
    animation: "pulse 1.2s ease-in-out infinite",
  },
  card: {
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: "12px", maxWidth: "280px", textAlign: "center",
  },
  emoji: { fontSize: "52px" },
  title: { fontSize: "26px", fontWeight: 900, color: "#fff", letterSpacing: "1px" },
  sub: {
    fontSize: "13px", fontWeight: 700, color: "#f5a623",
    textTransform: "uppercase", letterSpacing: "2px",
  },
  body: { fontSize: "13px", color: "rgba(255,255,255,0.4)", lineHeight: 1.7 },
};
