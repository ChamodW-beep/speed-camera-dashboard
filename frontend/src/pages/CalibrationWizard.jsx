import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, Play, RotateCcw, Undo2 } from "lucide-react";
import { api, url } from "../api.js";
import { usePoll } from "../hooks.js";
import { Button, buttonClass, Field, inputClass, Notice, Panel, Spinner } from "../components/ui.jsx";

const clamp = (n) => Math.min(1, Math.max(0, n));

// far-left, far-right, near-right, near-left (the same rule the backend uses)
function orderPoints(points) {
  const byY = [...points].sort((a, b) => a[1] - b[1]);
  const far = byY.slice(0, 2).sort((a, b) => a[0] - b[0]);
  const near = byY.slice(2).sort((a, b) => a[0] - b[0]);
  return [far[0], far[1], near[1], near[0]];
}

function StepTitle({ n, done, children }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={
          "num flex h-7 w-7 items-center justify-center rounded-full text-[16px] font-semibold " +
          (done ? "bg-sign text-white" : "bg-asphalt text-white")
        }
      >
        {done ? <Check size={15} aria-hidden="true" /> : n}
      </span>
      <h3 className="text-[20px]">{children}</h3>
    </div>
  );
}

export default function CalibrationWizard() {
  const { videoId } = useParams();
  const id = Number(videoId);
  const navigate = useNavigate();
  const { data: video, error: loadError, reload } = usePoll(() => api.video(id), 0, [id]);

  const [points, setPoints] = useState([]);
  const [width, setWidth] = useState("");
  const [length, setLength] = useState("");
  const [dirty, setDirty] = useState(false);
  const [sliderPos, setSliderPos] = useState(0);
  const [framePos, setFramePos] = useState(0);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState(null);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const [lanes, setLanes] = useState("2");
  const [laneWidth, setLaneWidth] = useState("3.65");
  const [cycles, setCycles] = useState("");
  const [cycleLength, setCycleLength] = useState("");
  const prefilled = useRef(false);
  const imgRef = useRef(null);

  useEffect(() => {
    if (video && !prefilled.current) {
      prefilled.current = true;
      if (video.calibration) {
        setPoints(video.calibration.points);
        setWidth(String(video.calibration.width_m));
        setLength(String(video.calibration.length_m));
      }
    }
  }, [video]);

  useEffect(() => {
    const el = imgRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [video]);

  const edit = (next) => {
    setPoints(next);
    setDirty(true);
    setError(null);
  };

  const pointFromEvent = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [clamp((event.clientX - rect.left) / rect.width), clamp((event.clientY - rect.top) / rect.height)];
  };

  const onStageDown = (event) => {
    if (drag !== null || points.length >= 4) return;
    edit([...points, pointFromEvent(event)]);
  };

  const onStageMove = (event) => {
    if (drag === null) return;
    const next = points.slice();
    next[drag] = pointFromEvent(event);
    edit(next);
  };

  const widthNum = Number(width);
  const lengthNum = Number(length);
  const ready = points.length === 4 && widthNum > 0 && lengthNum > 0;
  const shown = points.length === 4 ? orderPoints(points) : points;
  const toPx = (p) => [p[0] * box.w, p[1] * box.h];
  const hint = [
    "Click the first corner of a rectangle on the road.",
    "Click the second corner.",
    "Click the third corner.",
    "Click the fourth corner.",
    "All four corners are marked. Drag any point to fine-tune it.",
  ][points.length];

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.saveCalibration(id, points, widthNum, lengthNum);
      setDirty(false);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const run = await api.startRun(id);
      navigate("/monitor/" + run.id);
    } catch (err) {
      setError(err.message);
      setStarting(false);
    }
  };

  if (loadError) {
    return (
      <Notice tone="error">
        {loadError} <Link to="/calibration" className="underline">Back to calibration</Link>
      </Notice>
    );
  }
  if (!video) return <Spinner />;

  const saved = video.calibrated && !dirty;
  const lanesTotal = Math.round(Number(lanes) * Number(laneWidth) * 100) / 100;
  const cyclesTotal = Math.round(Number(cycles) * Number(cycleLength) * 100) / 100;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-4">
        <div>
          <p className="text-[14px] text-ink-3">Calibrating</p>
          <h2 className="text-[26px] leading-tight">{video.name}</h2>
        </div>

        <Notice tone="info">{hint}</Notice>

        <div className="rounded-xl border border-line bg-panel p-3">
          <div className="relative inline-block max-w-full select-none overflow-hidden rounded-lg bg-asphalt align-top">
            <img
              ref={imgRef}
              src={url("/api/videos/" + id + "/frame?pos=" + framePos)}
              alt="A frame from the video. Click it to mark corners on the road."
              className="block h-auto max-h-[68vh] w-auto max-w-full"
              draggable={false}
              onLoad={(event) => setBox({ w: event.currentTarget.clientWidth, h: event.currentTarget.clientHeight })}
            />
            {box.w > 0 ? (
              <svg
                className="absolute left-0 top-0 cursor-crosshair touch-none"
                width={box.w}
                height={box.h}
                onPointerDown={onStageDown}
                onPointerMove={onStageMove}
                onPointerUp={() => setDrag(null)}
                onPointerCancel={() => setDrag(null)}
              >
                {shown.length >= 2 ? (
                  <polygon
                    points={shown.map((p) => toPx(p).join(",")).join(" ")}
                    fill={shown.length === 4 ? "rgba(242,183,5,0.22)" : "none"}
                    stroke="#f2b705"
                    strokeWidth="2.5"
                    strokeDasharray={shown.length === 4 ? "0" : "6 5"}
                    strokeLinejoin="round"
                  />
                ) : null}
                {points.map((p, i) => {
                  const [x, y] = toPx(p);
                  return (
                    <g key={i}>
                      <circle
                        cx={x}
                        cy={y}
                        r="11"
                        fill="#f2b705"
                        stroke="#1c2328"
                        strokeWidth="2.5"
                        className="cursor-grab"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          event.currentTarget.setPointerCapture(event.pointerId);
                          setDrag(i);
                        }}
                      />
                      <text
                        x={x}
                        y={y + 0.5}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="13"
                        fontWeight="700"
                        fill="#1c2328"
                        pointerEvents="none"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {i + 1}
                      </text>
                    </g>
                  );
                })}
              </svg>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex min-w-[240px] flex-1 items-center gap-3">
              <label htmlFor="frame-pos" className="whitespace-nowrap text-[14px] text-ink-2">
                Pick a clear frame
              </label>
              <input
                id="frame-pos"
                type="range"
                min="0"
                max="0.95"
                step="0.01"
                value={sliderPos}
                onChange={(event) => setSliderPos(Number(event.target.value))}
                onPointerUp={() => setFramePos(sliderPos)}
                onKeyUp={() => setFramePos(sliderPos)}
                onBlur={() => setFramePos(sliderPos)}
                className="w-full accent-[#1c2328]"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" icon={Undo2} disabled={points.length === 0} onClick={() => edit(points.slice(0, -1))}>
                Undo
              </Button>
              <Button size="sm" icon={RotateCcw} disabled={points.length === 0} onClick={() => edit([])}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <Panel>
          <StepTitle n={1} done={points.length === 4}>
            Mark four corners
          </StepTitle>
          <p className="mt-2 text-[15px] text-ink-2">
            <span className="num text-[17px] text-ink">{points.length} of 4</span> marked. Pick a straight, flat stretch and mark the
            corners of a rectangle on the road surface, such as the road edges and the ends of lane markings. The further apart, the
            better. The order doesn't matter.
          </p>
        </Panel>

        <Panel>
          <StepTitle n={2} done={ready}>
            Enter its real size
          </StepTitle>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Field label="Width (m)" htmlFor="cal-width" hint="Across the road, edge to edge.">
              <input id="cal-width" type="number" min="1" step="0.01" inputMode="decimal" className={inputClass} value={width} onChange={(e) => { setWidth(e.target.value); setDirty(true); }} placeholder="7.3" />
            </Field>
            <Field label="Length (m)" htmlFor="cal-length" hint="Along the road, far line to near line.">
              <input id="cal-length" type="number" min="2" step="0.01" inputMode="decimal" className={inputClass} value={length} onChange={(e) => { setLength(e.target.value); setDirty(true); }} placeholder="17" />
            </Field>
          </div>

          <details className="mt-4 rounded-lg bg-paper px-4 py-3 text-[14px] text-ink-2">
            <summary className="cursor-pointer font-medium text-ink">Don't know the exact size?</summary>
            <div className="mt-3 space-y-4">
              <div>
                <p className="mb-1.5">Width from lanes</p>
                <div className="flex flex-wrap items-center gap-2">
                  <select aria-label="Number of lanes" className={inputClass + " !w-auto"} value={lanes} onChange={(e) => setLanes(e.target.value)}>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>{n} {n === 1 ? "lane" : "lanes"}</option>
                    ))}
                  </select>
                  <span>×</span>
                  <input aria-label="Lane width in metres" type="number" step="0.05" className={inputClass + " !w-20"} value={laneWidth} onChange={(e) => setLaneWidth(e.target.value)} />
                  <span>m</span>
                  <Button size="sm" disabled={!(lanesTotal > 0)} onClick={() => { setWidth(String(lanesTotal)); setDirty(true); }}>
                    Use {lanesTotal || 0} m
                  </Button>
                </div>
                <p className="mt-1 text-ink-3">Motorway lanes are usually 3.5 to 3.75 m wide.</p>
              </div>
              <div>
                <p className="mb-1.5">Length from lane dashes</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input aria-label="Number of dash and gap cycles" type="number" min="1" step="1" className={inputClass + " !w-20"} value={cycles} onChange={(e) => setCycles(e.target.value)} placeholder="3" />
                  <span>dash+gap ×</span>
                  <input aria-label="Length of one dash and gap in metres" type="number" min="1" step="0.1" className={inputClass + " !w-20"} value={cycleLength} onChange={(e) => setCycleLength(e.target.value)} placeholder="12" />
                  <span>m</span>
                  <Button size="sm" disabled={!(cyclesTotal > 0)} onClick={() => { setLength(String(cyclesTotal)); setDirty(true); }}>
                    Use {cyclesTotal || 0} m
                  </Button>
                </div>
                <p className="mt-1 text-ink-3">
                  Count the dash-and-gap cycles between your far and near lines. One cycle's length is set by your road authority, or measure one on a quiet road.
                </p>
              </div>
            </div>
          </details>
        </Panel>

        <Panel>
          <StepTitle n={3} done={saved}>
            Save and check
          </StepTitle>
          {error ? (
            <div className="mt-3">
              <Notice tone="error" onClose={() => setError(null)}>
                {error}
              </Notice>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={save} disabled={!ready || saving || !dirty}>
              {saving ? "Saving" : saved ? "Saved" : "Save calibration"}
            </Button>
          </div>
          {!ready && !saved ? (
            <p className="mt-2 text-[14px] text-ink-3">Mark four corners and enter both sizes to save.</p>
          ) : null}

          {saved ? (
            <div className="mt-5 space-y-3">
              <p className="text-[15px] text-ink-2">
                In the middle of the road, one pixel is worth about{" "}
                <span className="num text-[20px] font-semibold text-ink">{video.calibration.meters_per_pixel}</span> metres.
              </p>
              <img
                src={url("/api/videos/" + id + "/birdseye?v=" + (video.calibration.updated_at || ""))}
                alt="The road seen from directly above, built from your calibration"
                className="w-full rounded-lg bg-asphalt"
              />
              <p className="text-[13px] text-ink-3">
                The road seen from above. Lane lines should look straight and parallel. If they bend or fan out, adjust the corners or the sizes and save again.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="marking" icon={Play} onClick={start} disabled={starting}>
                  {starting ? "Starting" : "Measure speeds"}
                </Button>
                <Link to="/videos" className={buttonClass("secondary")}>
                  Back to videos
                </Link>
              </div>
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
