import { Outlet } from "react-router-dom";
import { useTelegram } from "@/hooks/useTelegram";

export function AppLayout() {
  const { colorScheme } = useTelegram();

  return (
    <div
      data-theme={colorScheme}
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--tg-theme-bg-color, #1c1c1e)",
        color: "var(--tg-theme-text-color, #ffffff)",
      }}
    >
      <Outlet />
    </div>
  );
}
