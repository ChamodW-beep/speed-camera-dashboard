import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";

const Ctx = createContext(null);

const FALLBACK = { speed_limit: 80, quality: "balanced", model: "yolov8s.pt", confidence: 0.25, units: "kmh" };

export function SettingsProvider({ children }) {
  const [values, setValues] = useState(FALLBACK);
  const [options, setOptions] = useState({ quality: [], model: [], units: [] });

  const refresh = useCallback(async () => {
    try {
      const res = await api.settings();
      setValues(res.values);
      setOptions(res.options);
    } catch (err) {
      /* the layout shows the offline banner */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(async (patch) => {
    const res = await api.saveSettings(patch);
    setValues(res.values);
    return res.values;
  }, []);

  const value = useMemo(() => ({ values, options, save, refresh }), [values, options, save, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings() {
  return useContext(Ctx);
}
