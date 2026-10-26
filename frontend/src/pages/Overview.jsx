import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Check, Film } from "lucide-react";
import { api } from "../api.js";
import { usePoll } from "../hooks.js";
import { fmtDate, fmtSpeed, statusLabel, unitLabel } from "../format.js";
import { useSettings } from "../settings.jsx";
import { Badge, buttonClass, EmptyState, Panel, SpeedSign, Spinner, Stat } from "../components/ui.jsx";
import { VehicleModal, VehicleTile } from "../components/Vehicles.jsx";

function Step({ done, title, text, to, cta }) {
  return (
    <li className="flex items-start gap-4 py-3.5">
      <span
        className={
          "num mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[17px] font-semibold " +
          (done ? "bg-sign text-white" : "border border-line text-ink-2")
        }
      >
        {done ? <Check size={17} aria-hidden="true" /> : null}
      </span>
      <div className="flex-1">
        <p className="text-[17px] font-medium text-ink">{title}</p>
        <p className="text-[15px] text-ink-2">{text}</p>
      </div>
      {to ? (
        <Link to={to} className={buttonClass(done ? "quiet" : "secondary", "sm")}>
          {cta}
        </Link>
      ) : null}
    </li>
  );
}

export default function Overview() {
  const { values } = useSettings();
  const units = values.units;
  const { data, loading, error } = usePoll(api.overview, 5000, []);
  const [openId, setOpenId] = useState(null);

  if (loading && !data) return <Spinner />;
  if (!data) return error ? null : <Spinner />;

  const hasResults = data.vehicles > 0;
  const limit = Math.round(Number(fmtSpeed(data.speed_limit, units)));
  const overBy = hasResults && data.top_speed > data.speed_limit ? data.top_speed - data.speed_limit : 0;

  return (
    <>
      <section className="overflow-hidden rounded-xl bg-asphalt text-white">
        <div className="flex flex-wrap items-center justify-between gap-8 px-7 py-7 md:px-9">
          <div>
            <p className="text-[16px] text-white/70">{hasResults ? "Fastest vehicle measured" : "No speeds measured yet"}</p>
            {hasResults ? (
              <>
                <p className="num mt-1 text-[88px] font-bold leading-[0.95] text-white">
                  {fmtSpeed(data.top_speed, units)}
                  <span className="ml-2 text-[28px] font-medium text-white/60">{unitLabel(units)}</span>
                </p>
                <p className="mt-3 text-[16px] text-white/75">
                  {overBy > 0
                    ? "That is " + fmtSpeed(overBy, units) + " " + unitLabel(units) + " over the limit."
                    : "Nothing has gone over the limit so far."}
                </p>
              </>
            ) : (
              <p className="mt-2 max-w-lg text-[22px] leading-snug text-white">
                Upload a video of a road, tell the app how big the road is, and it will measure every vehicle that drives past.
              </p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[15px] text-white/70">Current limit</p>
              <Link to="/settings" className="text-[14px] text-marking underline-offset-4 hover:underline">
                Change
              </Link>
            </div>
            <SpeedSign value={limit} size={104} />
          </div>
        </div>
        <div className="border-t-4 border-dashed border-marking/80" aria-hidden="true" />
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Vehicles measured" value={data.vehicles} note={data.runs + (data.runs === 1 ? " run" : " runs") + " in total"} />
        <Stat label="Average speed" value={fmtSpeed(data.avg_speed, units, 1)} unit={hasResults ? unitLabel(units) : ""} />
        <Stat label="Over the limit" value={data.violations} tone={data.violations > 0 ? "bad" : "default"} note={hasResults ? Math.round((100 * data.violations) / data.vehicles) + "% of vehicles" : null} />
        <Stat label="Videos calibrated" value={data.calibrated_videos + " of " + data.videos} note="Calibrated videos can be measured" />
      </div>

      {data.runs === 0 ? (
        <Panel title="Getting started">
          <ol className="divide-y divide-line-2">
            <Step done={data.videos > 0} title="Add a video" text="Fixed camera, steady footage. A bridge over a straight road is ideal." to="/videos" cta="Upload" />
            <Step done={data.calibrated_videos > 0} title="Calibrate it" text="Click four corners on the road and enter its real width and length." to="/calibration" cta="Calibrate" />
            <Step done={false} title="Measure speeds" text="Start a run and watch every vehicle get a speed." to="/videos" cta="Open videos" />
          </ol>
        </Panel>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel
          title="Recent violations"
          action={
            <Link to="/violations" className="text-[15px] text-ink-2 underline-offset-4 hover:text-ink hover:underline">
              See all
            </Link>
          }
        >
          {data.recent_violations.length === 0 ? (
            <EmptyState title="No violations" text={hasResults ? "Every vehicle measured so far stayed within the limit." : "Vehicles over the limit will appear here with a picture."} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.recent_violations.map((v) => (
                <VehicleTile key={v.id} v={v} units={units} onOpen={setOpenId} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Recent runs" bodyClass="p-0">
          {data.recent_runs.length === 0 ? (
            <EmptyState icon={Film} title="Nothing measured yet" text="Your runs will be listed here." />
          ) : (
            <ul className="divide-y divide-line-2">
              {data.recent_runs.map((run) => (
                <li key={run.id}>
                  <Link to={"/monitor/" + run.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-paper">
                    <Activity size={18} className="shrink-0 text-ink-3" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] text-ink">{run.video_name}</p>
                      <p className="text-[13px] text-ink-3">
                        {fmtDate(run.started_at)} · {run.vehicles} vehicles · {run.violations} over
                      </p>
                    </div>
                    <Badge tone={run.status === "completed" ? "good" : run.status === "running" ? "warn" : run.status === "failed" ? "bad" : "neutral"}>
                      {statusLabel(run.status)}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <VehicleModal id={openId} units={units} onClose={() => setOpenId(null)} />
    </>
  );
}
