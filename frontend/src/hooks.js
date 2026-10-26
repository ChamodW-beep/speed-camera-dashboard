import { useCallback, useEffect, useRef, useState } from "react";
import { uploadVideo } from "./api.js";

/**
 * Calls `fn` now and then every `ms` milliseconds (leave ms at 0 to load once).
 * Returns { data, error, loading, reload }.
 */
export function usePoll(fn, ms, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    let timer = null;
    const load = async () => {
      try {
        const data = await fnRef.current();
        if (alive) setState({ data, error: null, loading: false });
      } catch (err) {
        if (alive) setState((prev) => ({ data: prev.data, error: err.message, loading: false }));
      }
      if (alive && ms) timer = setTimeout(load, ms);
    };
    load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, tick, ...deps]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, reload };
}

export function useUploader(onDone) {
  const [state, setState] = useState({ busy: false, progress: 0, error: null, name: "" });
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const upload = useCallback(async (file) => {
    if (!file) return;
    setState({ busy: true, progress: 0, error: null, name: file.name });
    try {
      const video = await uploadVideo(file, (p) => setState((s) => ({ ...s, progress: p })));
      setState({ busy: false, progress: 1, error: null, name: "" });
      if (doneRef.current) doneRef.current(video);
    } catch (err) {
      setState({ busy: false, progress: 0, error: err.message, name: "" });
    }
  }, []);

  const dismiss = useCallback(() => setState((s) => ({ ...s, error: null })), []);
  return { ...state, upload, dismiss };
}
