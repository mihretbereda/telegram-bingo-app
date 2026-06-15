import { useEffect, useState } from "react";
import { supabase } from "@/services/supabase";

export function useAdminConfig() {
  const [riggedMode, setRiggedMode] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("admin_config")
      .select("rigged_mode")
      .eq("id", 1)
      .single()
      .then(({ data }) => {
        if (data) setRiggedMode(data.rigged_mode);
      });
  }, []);

  const toggle = async (value: boolean) => {
    setLoading(true);
    const { error } = await supabase.functions.invoke("admin-toggle", {
      body: { rigged_mode: value },
    });
    if (!error) setRiggedMode(value);
    setLoading(false);
  };

  return { riggedMode, toggle, loading };
}
