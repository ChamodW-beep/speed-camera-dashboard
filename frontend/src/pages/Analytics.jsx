import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BarChart3, Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api.js";
import { usePoll } from "../hooks.js";
import { directionLabel, fmtDate, titleCase } from "../format.js";
import { useSettings } from "../settings.jsx";
import { buttonClass, EmptyState, inputClass, Panel, Spinner, Stat } from "../components/ui.jsx";
import { VehicleModal, VehicleTile } from "../components/Vehicles.jsx";

const axis = { fontSize: 12, fill: "#7d8a93" };

function Breakdown({ title, rows, label }) {
  const total = rows.reduce((sum, r) => sum + r.count, 0) || 1;
  return (
    <Panel title={title}>
      {rows.length === 0 ? (
        <p className="text-[15px] text-ink-3">No data yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.name}>
              <div className="mb-1 flex justify-between text-[15px]">
                <span className="text-ink">{label(r.name)}</span>
                <span className="num text-ink-2">
                  {r.count} · {Math.round((100 * r.count) / total)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-line-2">
                <div className="h-full rounded-full bg-asphalt" style={{ width: (100 * r.count) / total + "%" }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function Analytics() {
  const { values } = useSettings();
  const units = values.units;
  const [params, setParams] = useSearchParams();
  const runId = params.get("run") || "";
  const [openId, setOpenId] = useState(null);

  const { data: runs } = usePoll(() => api.runs({ limit: 100 }), 0, []);
  const { data, loading } = usePoll(() => api.analytics({ run_id: runId }), 5000, [runId, units, values.speed_limit]);
  const { data: top } = usePoll(() => api.vehicles({ run_id: runId, order: "speed", limit: 10 }), 5000, [runId]);

  const setRun = (value) => {
    const next = new URLSearchParams(params);
    if (value) next.set("run", value);
    else next.delete("run");
    setParams(next, { replace: true });
  };

  if (loading && !data) return <Spinner />;
  const k = data ? data.kpis : null;
  const empty = !k || k.vehicles === 0;
  const unit = data ? data.unit : "km/h";

  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="an-run" className="mb-1 block text-[14px] text-ink-2">
            Run
          </label>
          <select id="an-run" className={inputClass + " !w-auto min-w-[220px]"} value={runId} onChange={(e) => setRun(e.target.value)}>
            <option value="">All runs</option>
            {(runs || []).map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} · {r.video_name} · {fmtDate(r.started_at)}
              </option>
            ))}
          </select>
        </div>
        <a className={buttonClass("secondary") + " ml-auto"} href={api.exportUrl({ run_id: runId })} download>
          <Download size={17} aria-hidden="true" />
          Download CSV
        </a>
      </div>

      {empty ? (
        <Panel>
          <EmptyState icon={BarChart3} title="No measurements yet" text="Charts appear once a run has measured some vehicles." />
        </Panel>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="Vehicles" value={k.vehicles} />
            <Stat label="Average speed" value={k.avg_speed} unit={unit} />
            <Stat label="85th percentile" value={k.v85} unit={unit} note="85% drive at or below this" />
            <Stat label="Top speed" value={k.top_speed} unit={unit} />
            <Stat label="Over the limit" value={k.violations} tone={k.violations > 0 ? "bad" : "default"} note={k.violation_rate + "% of vehicles"} />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title="How fast vehicles go">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.histogram} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid stroke="#e5e9eb" vertical={false} />
                    <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "#d3d9dc" }} />
                    <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(value) => [value, "Vehicles"]} labelFormatter={(l) => l + " " + unit} />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {data.histogram.map((b) => (
                        <Cell key={b.label} fill={b.over ? "#d32f2f" : "#14202a"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-[13px] text-ink-3">Red bars are speeds at or above the limit of {data.limit} {unit}.</p>
            </Panel>

            <Panel title="Speed over time">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.timeline} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                    <CartesianGrid stroke="#e5e9eb" vertical={false} />
                    <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: "#d3d9dc" }} />
                    <YAxis tick={axis} tickLine={false} axisLine={false} domain={[0, "auto"]} />
                    <Tooltip formatter={(value, name) => (name === "avg" ? [value + " " + unit, "Average speed"] : [value, "Vehicles"])} />
                    <ReferenceLine y={data.limit} stroke="#d32f2f" strokeDasharray="5 4" />
                    <Line type="monotone" dataKey="avg" stroke="#14202a" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-[13px] text-ink-3">Average speed of vehicles first seen in each time slice of the video.</p>
            </Panel>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Breakdown title="Vehicle types" rows={data.classes} label={titleCase} />
            <Breakdown title="Direction of travel" rows={data.directions} label={directionLabel} />
          </div>

          {top && top.items.length > 0 ? (
            <Panel title="Ten fastest vehicles">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {top.items.map((v) => (
                  <VehicleTile key={v.id} v={v} units={units} onOpen={setOpenId} />
                ))}
              </div>
            </Panel>
          ) : null}
        </>
      )}

      <VehicleModal id={openId} units={units} onClose={() => setOpenId(null)} />
    </>
  );
}
