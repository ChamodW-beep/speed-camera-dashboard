import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { api, url } from "../api.js";

/** Plays back the saved, annotated pictures of a finished run like a video. */
export default function Replay({ runId, fallback }) {
  const [meta, setMeta] = useState(null);
  const [missing, setMissing] = useState(false);
  const [frame, setFrame] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [rate, setRate] = useState(1);
  const frameRef = useRef(1);

  useEffect(() => {
    let alive = true;
    api
      .replay(runId)
      .then((m) => {
        if (!alive) return;
        if (m.frames > 0) setMeta(m);
        else setMissing(true);
      })
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [runId]);

  useEffect(() => {
    if (!meta || !playing) return undefined;
    const timer = setInterval(() => {
      const next = frameRef.current + 1;
      if (next > meta.frames) {
        setPlaying(false);
        return;
      }
      frameRef.current = next;
      setFrame(next);
    }, 1000 / (meta.fps * rate));
    return () => clearInterval(timer);
  }, [meta, playing, rate]);

  const seek = (n) => {
    frameRef.current = n;
    setFrame(n);
  };

  if (missing) return fallback;
  if (!meta) return <div className="flex aspect-video items-center justify-center text-white/70">Loading recording…</div>;

  const atEnd = frame >= meta.frames;
  const toggle = () => {
    if (atEnd) seek(1);
    setPlaying((p) => (atEnd ? true : !p));
  };
  const Icon = atEnd ? RotateCcw : playing ? Pause : Play;

  return (
    <div>
      <img
        src={url("/api/runs/" + runId + "/replay/" + frame)}
        alt="Replay of the measured video with each vehicle's number and speed"
        className="mx-auto block max-h-[70vh] w-full object-contain"
      />
      <div className="flex items-center gap-3 bg-asphalt-2 px-4 py-2.5 text-white">
        <button type="button" onClick={toggle} aria-label={atEnd ? "Replay" : playing ? "Pause" : "Play"} className="rounded p-1.5 hover:bg-white/10">
          <Icon size={20} />
        </button>
        <input
          type="range"
          min="1"
          max={meta.frames}
          value={frame}
          onChange={(e) => {
            setPlaying(false);
            seek(Number(e.target.value));
          }}
          aria-label="Position in the recording"
          className="flex-1 accent-[#f2b705]"
        />
        <select
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          aria-label="Playback speed"
          className="rounded bg-white/10 px-2 py-1 text-sm text-white"
        >
          <option className="text-black" value="0.5">0.5×</option>
          <option className="text-black" value="1">1×</option>
          <option className="text-black" value="2">2×</option>
        </select>
      </div>
    </div>
  );
}
