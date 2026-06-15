import { useEffect, useRef, useState } from "react";
import { supabase } from "@/services/supabase";

export function useAdminConfig() {
  const [riggedMode, setRiggedMode] = useState(false);
  const [ghostEnabled, setGhostEnabled] = useState(false);
  const [ghostCount, setGhostCount] = useState(2);
  const [loading, setLoading] = useState(false);
  const ghostCountRef = useRef(2);

  useEffect(() => {
    supabase
      .from("admin_config")
      .select("rigged_mode, ghost_enabled, ghost_count")
      .eq("id", 1)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setRiggedMode(data.rigged_mode);
        setGhostEnabled(data.ghost_enabled);
        setGhostCount(data.ghost_count);
        ghostCountRef.current = data.ghost_count;
      });
  }, []);

  const invoke = async (patch: Record<string, unknown>) => {
    setLoading(true);
    await supabase.functions.invoke("admin-toggle", { body: patch });
    setLoading(false);
  };

  const toggleRigged = async (value: boolean) => {
    setRiggedMode(value);
    await invoke({ rigged_mode: value });
  };

  const toggleGhost = async (value: boolean) => {
    setGhostEnabled(value);
    await invoke({ ghost_enabled: value });
  };

  // Debounced — called with a number, saves after 800ms idle
  const ghostCountTimer = useRef<ReturnType<typeof setTimeout>>();
  const updateGhostCount = (count: number) => {
    const clamped = Math.max(0, Math.min(8, count));
    setGhostCount(clamped);
    ghostCountRef.current = clamped;
    clearTimeout(ghostCountTimer.current);
    ghostCountTimer.current = setTimeout(() => {
      invoke({ ghost_count: clamped });
    }, 800);
  };

  return { riggedMode, toggleRigged, ghostEnabled, toggleGhost, ghostCount, updateGhostCount, loading };
}
