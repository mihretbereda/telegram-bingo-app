import { useEffect, useRef, useState } from "react";
import { supabase } from "@/services/supabase";

export function useAdminConfig() {
  const [riggedMode, setRiggedMode] = useState(false);
  const [ghostEnabled, setGhostEnabled] = useState(false);
  const [ghostMin, setGhostMin] = useState(10);
  const [ghostMax, setGhostMax] = useState(50);
  const [loading, setLoading] = useState(false);
  const ghostMinRef = useRef(10);
  const ghostMaxRef = useRef(50);

  useEffect(() => {
    supabase
      .from("admin_config")
      .select("rigged_mode, ghost_enabled, ghost_min, ghost_max")
      .eq("id", 1)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setRiggedMode(data.rigged_mode);
        setGhostEnabled(data.ghost_enabled);
        setGhostMin(data.ghost_min ?? 10);
        setGhostMax(data.ghost_max ?? 50);
        ghostMinRef.current = data.ghost_min ?? 10;
        ghostMaxRef.current = data.ghost_max ?? 50;
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

  const minTimer = useRef<ReturnType<typeof setTimeout>>();
  const updateGhostMin = (value: number) => {
    const clamped = Math.max(1, Math.min(value, ghostMaxRef.current));
    setGhostMin(clamped);
    ghostMinRef.current = clamped;
    clearTimeout(minTimer.current);
    minTimer.current = setTimeout(() => invoke({ ghost_min: clamped }), 800);
  };

  const maxTimer = useRef<ReturnType<typeof setTimeout>>();
  const updateGhostMax = (value: number) => {
    const clamped = Math.max(ghostMinRef.current, Math.min(100, value));
    setGhostMax(clamped);
    ghostMaxRef.current = clamped;
    clearTimeout(maxTimer.current);
    maxTimer.current = setTimeout(() => invoke({ ghost_max: clamped }), 800);
  };

  return {
    riggedMode, toggleRigged,
    ghostEnabled, toggleGhost,
    ghostMin, updateGhostMin,
    ghostMax, updateGhostMax,
    loading,
  };
}
