import { useTelegram } from "@/hooks/useTelegram";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSpinner } from "@/components/ui";
import { ErrorMessage } from "@/components/ui";

export default function Home() {
  const { isReady } = useTelegram();
  const { isLoading, error, user } = useAuth();

  if (!isReady || isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "4rem" }}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage error={error} />;
  }

  const firstName = user?.user_metadata?.first_name as string | undefined;

  return (
    <main style={{ padding: "1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
        Welcome{firstName ? `, ${firstName}` : ""}!
      </h1>
      <p style={{ marginTop: "0.5rem", opacity: 0.6 }}>
        Your Telegram Bingo app is ready to build.
      </p>
    </main>
  );
}
