import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Activity, BarChart3, Square, Trash2, TriangleAlert } from "lucide-react";
import { api, url } from "../api.js";
import { usePoll } from "../hooks.js";
import { fmtSpeed, statusLabel, titleCase, unitLabel } from "../format.js";
import { useSettings } from "../settings.jsx";
import { Badge, Button, buttonClass, EmptyState, Notice, Panel, ProgressBar, SpeedSign, Spinner } from "../components/ui.jsx";
import { ClassIcon } from "../components/Vehicles.jsx";
import Replay from "../components/Replay.jsx";

function Redirector() {
  const { data, loading } = usePoll(() => api.runs({ limit: 20 }), 0, []);
  if (loading && !data) return <Spinner />;
  if (!data || data.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={Activity}
          title="Nothing is being measured"
          text="Start a measurement from the Videos page. You'll watch it here as it happens."
          action={
            <Link to="/videos" className={buttonClass("primary")}>
              Go to videos
            </Link>
          }
        />
      </Panel>
    );
  }
  const active = data.find((r) => r.status === "running") || data[0];
  return <Navigate to={"/monitor/" + active.id} replace />;
}

function RunView({ runId }) {
  const navigate = useNavigate();
  const { values } = useSettings();
  const units = values.units;
  const { data: run, error, reload } = usePoll(() => api.run(runId), 1000, [runId]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  if (error && !run) return <Notice tone="error">{error}</Notice>;
  if (!run) return <Spinner />;

  const running = run.status === "running";
  const live = run.live;
  const inView = (live && live.vehicles_in_view) || [];
  const progress = running && live ? live.progress : run.progress || 0;
  const limit = Math.round(Number(fmtSpeed(run.speed_limit, units)));

  const stop = async () => {
    setBusy(true);
    try {
      await api.stopRun(runId);
      reload();
    } catch (err) {
      setProblem(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this run and every vehicle it measured? This can't be undone.")) return;
    try {
      await api.deleteRun(runId);
      navigate("/monitor");
    } catch (err) {
      setProblem(err.message);
    }
  };

  const source = running ? url("/api/runs/" + runId + "/stream") : url("/api/runs/" + runId + "/frame?v=" + (run.frames_done || 0));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[14px] text-ink-3">Run #{run.id}</p>
            <h2 className="text-[26px] leading-tight">{run.video_name}</h2>
          </div>
          <Badge tone={run.status === "completed" ? "good" : running ? "warn" : run.status === "failed" ? "bad" : "neutral"}>
            {statusLabel(run.status)}
          </Badge>
        </div>

        {problem ? (
          <Notice tone="error" onClose={() => setProblem(null)}>
            {problem}
          </Notice>
        ) : null}
        {run.status === "failed" ? <Notice tone="error">The run stopped with an error: {run.error || "unknown error"}</Notice> : null}

        <div className="overflow-hidden rounded-xl bg-asphalt">
          {running ? (
            <img
              src={source}
              alt="The video with each vehicle's number and speed drawn on it"
              className="mx-auto block max-h-[70vh] w-full object-contain"
            />
          ) : (
            <Replay
              runId={runId}
              fallback={
                <img src={source} alt="Last picture of the run" className="mx-auto block max-h-[70vh] w-full object-contain" />
              }
            />
          )}
        </div>

        <div className="rounded-xl border border-line bg-panel p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-[15px] text-ink-2">
            <span>
              {running
                ? live && live.stage !== "running"
                  ? titleCase(live.stage) + "…"
                  : "Measuring"
                : statusLabel(run.status)}
            </span>
            <span className="num text-[16px] text-ink">
              {Math.round(progress * 100)}%{running && live && live.processing_fps ? " · " + live.processing_fps + " frames per second" : ""}
            </span>
          </div>
          <ProgressBar value={progress} tone="marking" />
          <div className="mt-4 flex flex-wrap gap-2">
            {running ? (
              <Button variant="danger" icon={Square} onClick={stop} disabled={busy}>
                Stop
              </Button>
            ) : null}
            <Link to={"/violations?run=" + run.id} className={buttonClass("secondary")}>
              <TriangleAlert size={17} aria-hidden="true" />
              Violations
            </Link>
            <Link to={"/analytics?run=" + run.id} className={buttonClass("secondary")}>
              <BarChart3 size={17} aria-hidden="true" />
              Analytics
            </Link>
            {!running ? (
              <Button variant="quiet" icon={Trash2} onClick={remove} className="ml-auto">
                Delete run
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <Panel>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[15px] text-ink-2">Speed limit</p>
              <p className="num text-[15px] text-ink-3">{unitLabel(units)}</p>
            </div>
            <SpeedSign value={limit} size={84} />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line-2 pt-4">
            <div>
              <p className="num text-[38px] font-semibold leading-none">{running && live ? live.vehicles_total : run.vehicles}</p>
              <p className="mt-1 text-[14px] text-ink-2">Vehicles seen</p>
            </div>
            <div>
              <p className={"num text-[38px] font-semibold leading-none " + ((running && live ? live.violations : run.violations) > 0 ? "text-alert" : "")}>
                {running && live ? live.violations : run.violations}
              </p>
              <p className="mt-1 text-[14px] text-ink-2">Over the limit</p>
            </div>
          </div>
        </Panel>

        <Panel title="In view now" bodyClass="p-0">
          {!running ? (
            <EmptyState title="Run finished" text="Open Violations or Analytics to see the results." />
          ) : inView.length === 0 ? (
            <EmptyState title="Road is clear" text="Vehicles appear here the moment they enter the picture." />
          ) : (
            <ul className="divide-y divide-line-2">
              {inView.map((v) => (
                <li key={v.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="text-ink-3">
                    <ClassIcon cls={v.cls} />
                  </span>
                  <span className="num w-12 text-[16px] text-ink-2">#{v.id}</span>
                  <span className={"num flex-1 text-[22px] font-semibold " + (v.alert ? "text-alert" : "text-ink")}>
                    {v.speed === null ? "…" : fmtSpeed(v.speed, units) + " " + unitLabel(units)}
                  </span>
                  {v.alert ? <Badge tone="bad">Over</Badge> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

export default function Monitor() {
  const { runId } = useParams();
  if (!runId) return <Redirector />;
  return <RunView key={runId} runId={Number(runId)} />;
}
