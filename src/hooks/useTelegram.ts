import { useEffect, useState } from "react";
import WebApp from "@twa-dev/sdk";
import type { TelegramUser, ThemeParams } from "@/types/telegram";

interface UseTelegramReturn {
  webApp: typeof WebApp;
  user: TelegramUser | null;
  initData: string;
  themeParams: ThemeParams;
  isReady: boolean;
  colorScheme: "light" | "dark";
}

export function useTelegram(): UseTelegramReturn {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    setIsReady(true);
  }, []);

  const user = (WebApp.initDataUnsafe?.user as TelegramUser | undefined) ?? null;
  const themeParams = WebApp.themeParams as ThemeParams;
  const colorScheme = WebApp.colorScheme ?? "dark";

  return {
    webApp: WebApp,
    user,
    initData: WebApp.initData,
    themeParams,
    isReady,
    colorScheme,
  };
}
