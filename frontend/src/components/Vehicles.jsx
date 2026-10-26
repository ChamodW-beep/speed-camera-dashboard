import { Bike, Bus, Car, Truck } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, url } from "../api.js";
import { usePoll } from "../hooks.js";
import { directionLabel, fmtClock, fmtSpeed, titleCase, toUnit, unitLabel } from "../format.js";
import { Badge, Modal, Spinner } from "./ui.jsx";

export function ClassIcon({ cls, size = 20 }) {
  const Icon = { bus: Bus, truck: Truck, motorcycle: Bike }[cls] || Car;
  return <Icon size={size} aria-hidden="true" />;
}

export function VehicleTile({ v, units, onOpen }) {
  const over = v.over_by;
  return (
    <button
      type="button"
      onClick={() => onOpen(v.id)}
      className="group overflow-hidden rounded-xl border border-line bg-white text-left transition-colors hover:border-ink-3"
    >
      <div className="relative flex aspect-[4/3] items-center justify-center bg-asphalt text-ink-3">
        {v.snapshot_url ? (
          <img src={url(v.snapshot_url)} alt={titleCase(v.cls) + " number " + v.track_id} className="h-full w-full object-contain" />
        ) : (
          <ClassIcon cls={v.cls} size={36} />
        )}
        {v.violation ? (
          <span className="absolute left-2 top-2">
            <Badge tone="bad">Over the limit</Badge>
          </span>
        ) : null}
      </div>
      <div className="px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="num text-[34px] font-semibold leading-none text-ink">
            {fmtSpeed(v.top_speed, units)}
            <span className="ml-1 text-[15px] font-medium text-ink-3">{unitLabel(units)}</span>
          </p>
          {v.violation && over !== null ? (
            <span className="num text-[18px] font-semibold text-alert">+{fmtSpeed(over, units)}</span>
          ) : null}
        </div>
        <p className="mt-1.5 flex items-center gap-1.5 text-[14px] text-ink-2">
          <ClassIcon cls={v.cls} size={15} />
          {titleCase(v.cls)} at {fmtClock(v.first_t)}
        </p>
        <p className="truncate text-[13px] text-ink-3">{v.video_name}</p>
      </div>
    </button>
  );
}

function Detail({ label, children }) {
  return (
    <div>
      <p className="text-[13px] text-ink-3">{label}</p>
      <p className="text-[16px] text-ink">{children}</p>
    </div>
  );
}

export function VehicleModal({ id, units, onClose }) {
  const { data: v, error } = usePoll(() => (id ? api.vehicle(id) : Promise.resolve(null)), 0, [id]);
  const label = unitLabel(units);
  const readings = v
    ? v.readings.map((r) => ({ time: fmtClock(r.t), speed: Number(toUnit(r.speed, units).toFixed(1)) }))
    : [];
  return (
    <Modal open={Boolean(id)} onClose={onClose} title={v ? titleCase(v.cls) + " — " + fmtSpeed(v.top_speed, units) + " " + label : "Vehicle"} wide>
      {error ? <p className="text-alert">{error}</p> : null}
      {!v && !error ? <Spinner /> : null}
      {v ? (
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-[minmax(0,260px)_1fr]">
            <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-asphalt text-ink-3">
              {v.snapshot_url ? (
                <img src={url(v.snapshot_url)} alt="" className="h-full w-full object-contain" />
              ) : (
                <ClassIcon cls={v.cls} size={40} />
              )}
            </div>
            <div className="grid grid-cols-2 content-start gap-x-4 gap-y-3">
              <Detail label="Top speed">
                {fmtSpeed(v.top_speed, units, 1)} {label}
              </Detail>
              <Detail label="Average speed">
                {fmtSpeed(v.avg_speed, units, 1)} {label}
              </Detail>
              <Detail label="Speed limit">
                {fmtSpeed(v.speed_limit, units)} {label}
              </Detail>
              <Detail label="Result">{v.violation ? <Badge tone="bad">Over by {fmtSpeed(v.over_by, units, 1)}</Badge> : <Badge tone="good">Within the limit</Badge>}</Detail>
              <Detail label="Direction">{directionLabel(v.direction)}</Detail>
              <Detail label="In the video">
                {fmtClock(v.first_t)} to {fmtClock(v.last_t)}
              </Detail>
              <Detail label="Video">{v.video_name}</Detail>
              <Detail label="Run">#{v.run_id}</Detail>
            </div>
          </div>
          {readings.length > 1 ? (
            <div>
              <h3 className="mb-2 text-[18px]">Speed through the picture</h3>
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={readings} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                    <CartesianGrid stroke="#e5e9eb" vertical={false} />
                    <XAxis dataKey="time" tick={{ fontSize: 12, fill: "#7d8a93" }} tickLine={false} axisLine={{ stroke: "#d3d9dc" }} />
                    <YAxis tick={{ fontSize: 12, fill: "#7d8a93" }} tickLine={false} axisLine={false} domain={[0, "auto"]} />
                    <Tooltip formatter={(value) => [value + " " + label, "Speed"]} />
                    <ReferenceLine y={Number(toUnit(v.speed_limit, units).toFixed(1))} stroke="#d32f2f" strokeDasharray="5 4" />
                    <Line type="monotone" dataKey="speed" stroke="#14202a" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-[13px] text-ink-3">The dashed red line is the speed limit.</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
