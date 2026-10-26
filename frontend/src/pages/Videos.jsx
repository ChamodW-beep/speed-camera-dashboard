import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Film, Pencil, Play, Ruler, Trash2 } from "lucide-react";
import { api, url } from "../api.js";
import { usePoll, useUploader } from "../hooks.js";
import { fmtClock, fmtDate } from "../format.js";
import UploadButton from "../components/UploadButton.jsx";
import { Badge, Button, buttonClass, EmptyState, Notice, Panel, ProgressBar, Spinner } from "../components/ui.jsx";

function VideoCard({ video, onChanged, onError }) {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);

  const measure = async () => {
    setStarting(true);
    try {
      const run = await api.startRun(video.id);
      navigate("/monitor/" + run.id);
    } catch (err) {
      onError(err.message);
      setStarting(false);
    }
  };

  const rename = async () => {
    const name = window.prompt("Rename this video", video.name);
    if (!name || name.trim() === video.name) return;
    try {
      await api.renameVideo(video.id, name.trim());
      onChanged();
    } catch (err) {
      onError(err.message);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete \"" + video.name + "\" and all of its results? This can't be undone.")) return;
    try {
      await api.deleteVideo(video.id);
      onChanged();
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-line bg-white">
      <div className="aspect-video bg-asphalt">
        <img src={url(video.thumb_url)} alt="" className="h-full w-full object-cover" loading="lazy" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[21px] leading-tight text-ink">{video.name}</h3>
            <button type="button" onClick={rename} aria-label={"Rename " + video.name} className="rounded p-1.5 text-ink-3 hover:bg-paper hover:text-ink">
              <Pencil size={15} />
            </button>
          </div>
          <p className="mt-1 text-[14px] text-ink-2">
            {video.width}×{video.height} · {Math.round(video.fps)} fps · {fmtClock(video.duration)}
          </p>
          <p className="text-[13px] text-ink-3">Added {fmtDate(video.created_at)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {video.calibrated ? <Badge tone="good">Calibrated</Badge> : <Badge tone="warn">Needs calibration</Badge>}
          <Badge>{video.runs} {video.runs === 1 ? "run" : "runs"}</Badge>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <Button variant="primary" icon={Play} onClick={measure} disabled={!video.calibrated || starting} title={video.calibrated ? "" : "Calibrate this video first"}>
            {starting ? "Starting" : "Measure speeds"}
          </Button>
          <Link to={"/calibration/" + video.id} className={buttonClass("secondary")}>
            <Ruler size={17} aria-hidden="true" />
            {video.calibrated ? "Recalibrate" : "Calibrate"}
          </Link>
          <button type="button" onClick={remove} aria-label={"Delete " + video.name} className="ml-auto rounded p-2 text-ink-3 hover:bg-alert-soft hover:text-alert">
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </article>
  );
}

export default function Videos() {
  const navigate = useNavigate();
  const { data: videos, loading, reload } = usePoll(api.videos, 0, []);
  const [message, setMessage] = useState(null);
  const [dragging, setDragging] = useState(false);
  const uploader = useUploader((video) => navigate("/calibration/" + video.id));

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) uploader.upload(file);
  };

  return (
    <>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={
          "flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-dashed px-6 py-6 transition-colors " +
          (dragging ? "border-ink bg-marking-soft" : "border-line bg-white")
        }
      >
        <div>
          <h2 className="text-[22px]">Add a video</h2>
          <p className="mt-0.5 max-w-xl text-[15px] text-ink-2">
            Drop a file here or choose one. Footage from a fixed camera works best: a bridge or a tripod, with the road in view and no shaking.
            MP4 is the safest format.
          </p>
        </div>
        <UploadButton uploader={uploader} variant="primary" label="Choose a video" />
        {uploader.busy ? (
          <div className="w-full">
            <p className="mb-1.5 text-[14px] text-ink-2">Uploading {uploader.name}</p>
            <ProgressBar value={uploader.progress} tone="marking" />
          </div>
        ) : null}
        {uploader.error ? (
          <div className="w-full">
            <Notice tone="error" onClose={uploader.dismiss}>
              {uploader.error}
            </Notice>
          </div>
        ) : null}
      </div>

      {message ? (
        <Notice tone="error" onClose={() => setMessage(null)}>
          {message}
        </Notice>
      ) : null}

      {loading && !videos ? <Spinner /> : null}
      {videos && videos.length === 0 ? (
        <Panel>
          <EmptyState icon={Film} title="No videos yet" text="Add your first video above. After the upload you'll be taken straight to calibration." />
        </Panel>
      ) : null}
      {videos && videos.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 2xl:grid-cols-3">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} onChanged={reload} onError={setMessage} />
          ))}
        </div>
      ) : null}
    </>
  );
}
