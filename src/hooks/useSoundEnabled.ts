import { useState, useEffect } from "react";

const KEY = "nova_sound_enabled";

export function useSoundEnabled() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY) !== "false"; } catch { return true; }
  });

  useEffect(() => {
    try { localStorage.setItem(KEY, enabled ? "true" : "false"); } catch { /* ignore */ }
  }, [enabled]);

  return [enabled, setEnabled] as const;
}
