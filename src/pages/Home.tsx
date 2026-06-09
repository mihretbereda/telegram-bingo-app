import { useTelegram } from "@/hooks/useTelegram";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { LoadingSpinner, ErrorMessage } from "@/components/ui";

export default function Home() {
  const { isReady } = useTelegram();
  const { isLoading: authLoading, error, user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile(user?.id);

  if (!isReady || authLoading || profileLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "4rem" }}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage error={error} />;
  }

  return (
    <main style={{ padding: "1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
        Welcome{profile?.first_name ? `, ${profile.first_name}` : ""}!
      </h1>
      <p style={{ marginTop: "0.5rem", opacity: 0.6 }}>
        Your Telegram Bingo app is ready to build.
      </p>
    </main>
  );
}
