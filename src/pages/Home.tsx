import { useTelegram } from "@/hooks/useTelegram";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/ui";

export default function Home() {
  const { user: tgUser, isReady } = useTelegram();
  const { isLoading } = useAuth();

  if (!isReady || isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "4rem" }}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <main style={{ padding: "1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
        Welcome{tgUser ? `, ${tgUser.first_name}` : ""}!
      </h1>
      <p style={{ marginTop: "0.5rem", opacity: 0.6 }}>
        Your Telegram Bingo app is ready to build.
      </p>
    </main>
  );
}
