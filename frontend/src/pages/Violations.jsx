import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, ShieldCheck } from "lucide-react";
import { api } from "../api.js";
import { usePoll } from "../hooks.js";
import { fmtDate } from "../format.js";
import { useSettings } from "../settings.jsx";
import { buttonClass, EmptyState, inputClass, PageIntro, Panel, Spinner } from "../components/ui.jsx";
import { VehicleModal, VehicleTile } from "../components/Vehicles.jsx";

export default function Violations() {
  const { values } = useSettings();
  const units = values.units;
  const [params, setParams] = useSearchParams();
  const runId = params.get("run") || "";
  const [order, setOrder] = useState("speed");
  const [openId, setOpenId] = useState(null);

  const { data: runs } = usePoll(() => api.runs({ limit: 100 }), 0, []);
  const { data, loading, error } = usePoll(
    () => api.vehicles({ run_id: runId, violations_only: true, order, limit: 200 }),
    5000,
    [runId, order],
  );

  const setRun = (value) => {
    const next = new URLSearchParams(params);
    if (value) next.set("run", value);
    else next.delete("run");
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageIntro>
        Every vehicle whose top speed went over the limit, with a picture. A vehicle's top speed is its 95th percentile reading, so a single
        bad frame can't create a violation.
      </PageIntro>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="run-filter" className="mb-1 block text-[14px] text-ink-2">
            Run
          </label>
          <select id="run-filter" className={inputClass + " !w-auto min-w-[220px]"} value={runId} onChange={(e) => setRun(e.target.value)}>
            <option value="">All runs</option>
            {(runs || []).map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} · {r.video_name} · {fmtDate(r.started_at)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="order" className="mb-1 block text-[14px] text-ink-2">
            Sort by
          </label>
          <select id="order" className={inputClass + " !w-auto"} value={order} onChange={(e) => setOrder(e.target.value)}>
            <option value="speed">Fastest first</option>
            <option value="recent">Most recent</option>
          </select>
        </div>
        <a
          className={buttonClass("secondary") + " ml-auto"}
          href={api.exportUrl({ run_id: runId })}
          download
        >
          <Download size={17} aria-hidden="true" />
          Download CSV
        </a>
      </div>

      {loading && !data ? <Spinner /> : null}
      {error && !data ? <p className="text-alert">{error}</p> : null}
      {data && data.items.length === 0 ? (
        <Panel>
          <EmptyState icon={ShieldCheck} title="No violations" text="Nothing has gone over the limit in the selected run." />
        </Panel>
      ) : null}
      {data && data.items.length > 0 ? (
        <>
          <p className="text-[15px] text-ink-2">
            <span className="num text-[18px] text-ink">{data.total}</span> {data.total === 1 ? "vehicle" : "vehicles"} over the limit
          </p>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {data.items.map((v) => (
              <VehicleTile key={v.id} v={v} units={units} onOpen={setOpenId} />
            ))}
          </div>
        </>
      ) : null}

      <VehicleModal id={openId} units={units} onClose={() => setOpenId(null)} />
    </>
  );
}
