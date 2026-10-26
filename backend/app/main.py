"""HTTP API for the SpeedWatch dashboard."""
import importlib.util
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from . import config, db, runs, services
from .services import BadRequest, NotFound

config.ensure_dirs()


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()
    runs.recover_interrupted()
    yield


app = FastAPI(title="SpeedWatch API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/api/captures", StaticFiles(directory=str(config.CAPTURES)), name="captures")


@app.exception_handler(NotFound)
async def not_found_handler(request: Request, exc: NotFound):
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(BadRequest)
async def bad_request_handler(request: Request, exc: BadRequest):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


def jpeg(data: bytes) -> Response:
    return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


# ---------------------------------------------------------------- models
class CalibrationBody(BaseModel):
    points: List[List[float]]
    width_m: float
    length_m: float


class RunBody(BaseModel):
    video_id: int
    speed_limit: Optional[float] = None
    quality: Optional[str] = None


class RenameBody(BaseModel):
    name: str


class SettingsBody(BaseModel):
    speed_limit: Optional[float] = None
    quality: Optional[str] = None
    model: Optional[str] = None
    confidence: Optional[float] = None
    units: Optional[str] = None


class ResetBody(BaseModel):
    confirm: bool = False


# ---------------------------------------------------------------- health
@app.get("/api/health")
def health():
    detector_ready = importlib.util.find_spec("ultralytics") is not None
    return {"status": "ok", "detector": "ready" if detector_ready else "missing", "time": time.time()}


# ---------------------------------------------------------------- videos
@app.get("/api/videos")
def videos():
    return services.list_videos()


@app.post("/api/videos", status_code=201)
async def upload_video(file: UploadFile = File(...)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in config.ALLOWED_VIDEO_EXTENSIONS:
        raise BadRequest("Upload a video file (" + ", ".join(sorted(config.ALLOWED_VIDEO_EXTENSIONS)) + ").")
    dest = config.VIDEOS / ("%s%s" % (uuid.uuid4().hex, ext))
    size, limit = 0, config.MAX_UPLOAD_MB * 1024 * 1024
    with dest.open("wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > limit:
                out.close()
                dest.unlink(missing_ok=True)
                raise BadRequest("That file is too large (limit %d MB)." % config.MAX_UPLOAD_MB)
            out.write(chunk)
    return await run_in_threadpool(services.register_video, dest, file.filename or "video")


@app.get("/api/videos/{video_id}")
def video(video_id: int):
    return services.get_video(video_id)


@app.patch("/api/videos/{video_id}")
def rename_video(video_id: int, body: RenameBody):
    return services.rename_video(video_id, body.name)


@app.delete("/api/videos/{video_id}", status_code=204)
def delete_video(video_id: int):
    services.delete_video(video_id)
    return Response(status_code=204)


@app.get("/api/videos/{video_id}/thumb")
def video_thumb(video_id: int):
    return FileResponse(services.thumb_path(video_id), media_type="image/jpeg")


@app.get("/api/videos/{video_id}/frame")
def video_frame(video_id: int, pos: float = 0.0):
    return jpeg(services.frame_jpeg(video_id, pos))


@app.put("/api/videos/{video_id}/calibration")
def save_calibration(video_id: int, body: CalibrationBody):
    return services.save_calibration(video_id, body.points, body.width_m, body.length_m)


@app.delete("/api/videos/{video_id}/calibration")
def clear_calibration(video_id: int):
    return services.clear_calibration(video_id)


@app.get("/api/videos/{video_id}/birdseye")
def video_birdseye(video_id: int, v: Optional[str] = None):
    return jpeg(services.birdseye_jpeg(video_id))


# ------------------------------------------------------------------ runs
@app.get("/api/runs")
def list_runs(limit: int = 50, video_id: Optional[int] = None):
    return services.list_runs(limit=min(max(limit, 1), 200), video_id=video_id)


@app.post("/api/runs", status_code=201)
def start_run(body: RunBody):
    return services.start_run(body.video_id, body.speed_limit, body.quality)


@app.get("/api/runs/{run_id}")
def run(run_id: int):
    return services.get_run(run_id)


@app.post("/api/runs/{run_id}/stop")
def stop_run(run_id: int):
    return services.stop_run(run_id)


@app.delete("/api/runs/{run_id}", status_code=204)
def delete_run(run_id: int):
    services.delete_run(run_id)
    return Response(status_code=204)


@app.get("/api/runs/{run_id}/frame")
def run_frame(run_id: int):
    proc = runs.get(run_id)
    if proc is not None and proc.latest_jpeg:
        return jpeg(proc.latest_jpeg)
    path = config.CAPTURES / ("run%d_last.jpg" % run_id)
    if path.exists():
        return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "no-store"})
    raise NotFound("No picture is available for this run yet.")


def _mjpeg(proc):
    last = -1
    while True:
        if proc.frame_seq != last and proc.latest_jpeg:
            last = proc.frame_seq
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + proc.latest_jpeg + b"\r\n"
        elif not proc.is_alive():
            break
        time.sleep(0.04)


@app.get("/api/runs/{run_id}/stream")
def run_stream(run_id: int):
    proc = runs.get(run_id)
    if proc is None:
        raise NotFound("This run is not active. Start it again to watch it live.")
    return StreamingResponse(_mjpeg(proc), media_type="multipart/x-mixed-replace; boundary=frame")


@app.get("/api/runs/{run_id}/replay")
def run_replay(run_id: int):
    return services.replay_info(run_id)


@app.get("/api/runs/{run_id}/replay/{n}")
def run_replay_frame(run_id: int, n: int):
    return Response(content=services.replay_frame(run_id, n), media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=3600"})


# -------------------------------------------------------------- vehicles
@app.get("/api/vehicles")
def vehicles(run_id: Optional[int] = None, video_id: Optional[int] = None,
             violations_only: bool = False, order: str = "recent",
             limit: int = 100, offset: int = 0):
    return services.list_vehicles(run_id, video_id, violations_only, order,
                                  min(max(limit, 1), 500), max(offset, 0))


@app.get("/api/vehicles/{vehicle_id}")
def vehicle(vehicle_id: int):
    return services.vehicle_detail(vehicle_id)


# ------------------------------------------------------------- reporting
@app.get("/api/overview")
def overview():
    return services.overview()


@app.get("/api/analytics")
def analytics_report(run_id: Optional[int] = None, video_id: Optional[int] = None):
    return services.analytics_report(run_id, video_id)


@app.get("/api/export.csv")
def export_csv(run_id: Optional[int] = None, video_id: Optional[int] = None):
    text = services.export_csv(run_id, video_id)
    return Response(content=text, media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="speedwatch-vehicles.csv"'})


# -------------------------------------------------------------- settings
@app.get("/api/settings")
def get_settings():
    return {"values": db.get_settings(),
            "options": {"quality": list(db.QUALITY_OPTIONS), "model": list(db.MODEL_OPTIONS),
                        "units": list(db.UNIT_OPTIONS)}}


@app.put("/api/settings")
def put_settings(body: SettingsBody):
    dump = getattr(body, "model_dump", None) or body.dict
    return {"values": services.update_settings(dump(exclude_none=True))}


@app.post("/api/reset")
def reset(body: ResetBody):
    if not body.confirm:
        raise BadRequest("Confirm the reset to delete all videos and results.")
    services.reset_everything()
    return {"status": "reset"}
