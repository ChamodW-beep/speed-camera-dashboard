"""The app's actions (upload, calibrate, run, report). main.py only maps these to HTTP."""
import csv
import io
import json
import shutil
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import numpy as np

from . import analytics, config, db, runs
from .geometry import (birdseye, metres_per_pixel, order_points, quad_centre,
                       road_homography, validate_quad)


class NotFound(Exception):
    pass


class BadRequest(Exception):
    pass


# ---------------------------------------------------------------- videos
def _video_row(video_id: int) -> dict:
    row = db.one("SELECT * FROM videos WHERE id = ?", (video_id,))
    if row is None:
        raise NotFound("That video does not exist.")
    return row


def get_video_row(video_id: int) -> dict:
    return _video_row(video_id)


def video_payload(row: dict) -> dict:
    calibration = None
    if row.get("cal_points"):
        pts = json.loads(row["cal_points"])
        w, h = int(row["width"] or 1000), int(row["height"] or 1000)
        M = road_homography(pts, w, h, row["cal_width"], row["cal_length"])
        cx, cy = quad_centre(pts, w, h)
        calibration = {
            "points": pts,
            "width_m": row["cal_width"],
            "length_m": row["cal_length"],
            "meters_per_pixel": round(metres_per_pixel(M, cx, cy), 5),
            "updated_at": row["cal_updated"],
        }
    stats = db.one("SELECT COUNT(*) AS runs, MAX(id) AS last_run FROM runs WHERE video_id = ?", (row["id"],))
    return {
        "id": row["id"], "name": row["name"], "fps": row["fps"], "width": row["width"],
        "height": row["height"], "frames": row["frames"], "duration": row["duration"],
        "created_at": row["created_at"], "calibrated": calibration is not None,
        "calibration": calibration, "runs": stats["runs"], "last_run": stats["last_run"],
        "thumb_url": "/api/videos/%d/thumb" % row["id"],
    }


def list_videos() -> List[dict]:
    return [video_payload(r) for r in db.query("SELECT * FROM videos ORDER BY id DESC")]


def get_video(video_id: int) -> dict:
    return video_payload(_video_row(video_id))


def _read_frame(path: Path, pos: float = 0.0):
    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened():
            return None
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total > 1 and pos > 0:
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(min(max(pos, 0.0), 0.98) * total))
        ok, frame = cap.read()
        return frame if ok else None
    finally:
        cap.release()


def _shrink(frame: np.ndarray, max_side: int) -> np.ndarray:
    h, w = frame.shape[:2]
    scale = min(1.0, max_side / float(max(h, w)))
    if scale < 1.0:
        frame = cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return frame


def register_video(path: Path, original_name: str) -> dict:
    """Check an uploaded file is a readable video and add it to the library."""
    cap = cv2.VideoCapture(str(path))
    try:
        opened = cap.isOpened()
        fps = cap.get(cv2.CAP_PROP_FPS) if opened else 0
        frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) if opened else 0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) if opened else 0
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) if opened else 0
        ok, first = cap.read() if opened else (False, None)
    finally:
        cap.release()
    if not opened or not ok or first is None:
        path.unlink(missing_ok=True)
        raise BadRequest("This video could not be read. Try an H.264 MP4 file "
                         "(iPhone .mov files in HEVC can be converted with QuickTime or HandBrake).")
    if not fps or fps < 1 or fps > 240:
        fps = 25.0
    name = Path(original_name).stem[:80] or "video"
    video_id = db.execute(
        "INSERT INTO videos(name, filename, fps, width, height, frames, duration, created_at) "
        "VALUES(?,?,?,?,?,?,?,?)",
        (name, path.name, fps, width, height, frames, frames / fps if frames else None, time.time()),
    )
    thumb = _read_frame(path, 0.1)
    thumb = first if thumb is None else thumb
    cv2.imwrite(str(config.THUMBS / ("%d.jpg" % video_id)), _shrink(thumb, 480),
                [cv2.IMWRITE_JPEG_QUALITY, 80])
    return get_video(video_id)


def frame_jpeg(video_id: int, pos: float = 0.0, max_side: int = 1280) -> bytes:
    row = _video_row(video_id)
    frame = _read_frame(config.VIDEOS / row["filename"], pos)
    if frame is None:
        raise NotFound("A picture could not be read from this video.")
    ok, buf = cv2.imencode(".jpg", _shrink(frame, max_side), [cv2.IMWRITE_JPEG_QUALITY, 88])
    return buf.tobytes()


def thumb_path(video_id: int) -> Path:
    _video_row(video_id)
    path = config.THUMBS / ("%d.jpg" % video_id)
    if not path.exists():
        raise NotFound("No thumbnail for this video.")
    return path


def delete_video(video_id: int) -> None:
    row = _video_row(video_id)
    for run in db.query("SELECT id FROM runs WHERE video_id = ?", (video_id,)):
        _remove_run_files(run["id"])
        runs.stop(run["id"])
    db.execute("DELETE FROM videos WHERE id = ?", (video_id,))
    (config.VIDEOS / row["filename"]).unlink(missing_ok=True)
    (config.THUMBS / ("%d.jpg" % video_id)).unlink(missing_ok=True)


def rename_video(video_id: int, name: str) -> dict:
    name = (name or "").strip()[:80]
    if not name:
        raise BadRequest("Give the video a name.")
    _video_row(video_id)
    db.execute("UPDATE videos SET name = ? WHERE id = ?", (name, video_id))
    return get_video(video_id)


# ----------------------------------------------------------- calibration
def save_calibration(video_id: int, points: Any, width_m: float, length_m: float) -> dict:
    _video_row(video_id)
    try:
        width_m, length_m = float(width_m), float(length_m)
    except (TypeError, ValueError):
        raise BadRequest("Enter the real width and length as numbers, in metres.")
    if not (1.0 <= width_m <= 60.0):
        raise BadRequest("The road width should be between 1 and 60 metres.")
    if not (2.0 <= length_m <= 500.0):
        raise BadRequest("The section length should be between 2 and 500 metres.")
    problem = validate_quad(points)
    if problem:
        raise BadRequest(problem)
    ordered = order_points(points).tolist()
    db.execute(
        "UPDATE videos SET cal_points=?, cal_width=?, cal_length=?, cal_updated=? WHERE id=?",
        (json.dumps(ordered), width_m, length_m, time.time(), video_id),
    )
    return get_video(video_id)


def clear_calibration(video_id: int) -> dict:
    _video_row(video_id)
    db.execute("UPDATE videos SET cal_points=NULL, cal_width=NULL, cal_length=NULL, cal_updated=NULL WHERE id=?",
               (video_id,))
    return get_video(video_id)


def birdseye_jpeg(video_id: int) -> bytes:
    row = _video_row(video_id)
    if not row["cal_points"]:
        raise BadRequest("Calibrate this video first.")
    frame = _shrink(_read_frame(config.VIDEOS / row["filename"], 0.0), 1280)
    h, w = frame.shape[:2]
    M = road_homography(json.loads(row["cal_points"]), w, h, row["cal_width"], row["cal_length"])
    top = birdseye(frame, M, row["cal_width"], row["cal_length"])
    ok, buf = cv2.imencode(".jpg", top, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return buf.tobytes()


# ------------------------------------------------------------------ runs
def _run_payload(row: dict) -> dict:
    video = db.one("SELECT name FROM videos WHERE id = ?", (row["video_id"],))
    proc = runs.get(row["id"])
    live = None
    if proc is not None and proc.is_alive():
        live = proc.live
    out = dict(row)
    out["video_name"] = video["name"] if video else "Deleted video"
    out["live"] = live
    out["last_frame_url"] = "/api/runs/%d/frame" % row["id"]
    return out


def get_run(run_id: int) -> dict:
    row = db.one("SELECT * FROM runs WHERE id = ?", (run_id,))
    if row is None:
        raise NotFound("That run does not exist.")
    return _run_payload(row)


def list_runs(limit: int = 50, video_id: Optional[int] = None) -> List[dict]:
    if video_id is None:
        rows = db.query("SELECT * FROM runs ORDER BY id DESC LIMIT ?", (limit,))
    else:
        rows = db.query("SELECT * FROM runs WHERE video_id = ? ORDER BY id DESC LIMIT ?", (video_id, limit))
    return [_run_payload(r) for r in rows]


def start_run(video_id: int, speed_limit: Optional[float] = None, quality: Optional[str] = None) -> dict:
    row = _video_row(video_id)
    if not row["cal_points"]:
        raise BadRequest("Calibrate this video before measuring speeds.")
    settings = db.get_settings()
    limit = float(speed_limit if speed_limit is not None else settings["speed_limit"])
    quality = quality or settings["quality"]
    if quality not in db.QUALITY_OPTIONS:
        raise BadRequest("Unknown quality setting.")
    try:
        run_id = runs.start(row, limit, quality, settings["model"], settings["confidence"], settings["units"])
    except runs.RunConflict as exc:
        raise BadRequest(str(exc))
    return get_run(run_id)


def stop_run(run_id: int) -> dict:
    get_run(run_id)
    runs.stop(run_id)
    return get_run(run_id)


def replay_info(run_id: int) -> dict:
    get_run(run_id)
    meta = config.CAPTURES / ("run%d_play" % run_id) / "meta.json"
    if not meta.exists():
        raise NotFound("There is no recording for this run yet.")
    import json as _json
    return _json.loads(meta.read_text())


def replay_frame(run_id: int, n: int) -> bytes:
    path = config.CAPTURES / ("run%d_play" % run_id) / ("%05d.jpg" % n)
    if not path.exists():
        raise NotFound("That frame does not exist.")
    return path.read_bytes()


def _remove_run_files(run_id: int) -> None:
    import shutil
    shutil.rmtree(config.CAPTURES / ("run%d_play" % run_id), ignore_errors=True)
    for path in config.CAPTURES.glob("run%d_*.jpg" % run_id):
        path.unlink(missing_ok=True)


def delete_run(run_id: int) -> None:
    get_run(run_id)
    if runs.get(run_id) is not None and runs.get(run_id).is_alive():
        raise BadRequest("Stop this run before deleting it.")
    _remove_run_files(run_id)
    db.execute("DELETE FROM runs WHERE id = ?", (run_id,))


# -------------------------------------------------------------- vehicles
def _vehicle_payload(row: dict) -> dict:
    out = dict(row)
    out["violation"] = bool(row["violation"])
    out["snapshot_url"] = "/api/captures/%s" % row["snapshot"] if row.get("snapshot") else None
    out["over_by"] = round(row["top_speed"] - row["speed_limit"], 1) if row.get("speed_limit") else None
    return out


def list_vehicles(run_id: Optional[int] = None, video_id: Optional[int] = None,
                  violations_only: bool = False, order: str = "recent",
                  limit: int = 100, offset: int = 0) -> dict:
    where, args = [], []  # type: List[str], list
    if run_id is not None:
        where.append("v.run_id = ?")
        args.append(run_id)
    if video_id is not None:
        where.append("r.video_id = ?")
        args.append(video_id)
    if violations_only:
        where.append("v.violation = 1")
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    order_sql = {"recent": "v.id DESC", "speed": "v.top_speed DESC"}.get(order, "v.id DESC")
    base = ("FROM vehicles v JOIN runs r ON r.id = v.run_id JOIN videos vi ON vi.id = r.video_id" + clause)
    total = db.one("SELECT COUNT(*) AS n " + base, tuple(args))["n"]
    rows = db.query(
        "SELECT v.*, r.speed_limit AS speed_limit, vi.name AS video_name " + base +
        " ORDER BY " + order_sql + " LIMIT ? OFFSET ?", tuple(args) + (limit, offset))
    return {"total": total, "items": [_vehicle_payload(r) for r in rows]}


def vehicle_detail(vehicle_id: int) -> dict:
    row = db.one(
        "SELECT v.*, r.speed_limit AS speed_limit, vi.name AS video_name FROM vehicles v "
        "JOIN runs r ON r.id = v.run_id JOIN videos vi ON vi.id = r.video_id WHERE v.id = ?", (vehicle_id,))
    if row is None:
        raise NotFound("That vehicle does not exist.")
    out = _vehicle_payload(row)
    out["readings"] = db.query("SELECT t, speed FROM readings WHERE vehicle_id = ? ORDER BY t", (vehicle_id,))
    return out


# ------------------------------------------------------------- reporting
def overview() -> dict:
    totals = db.one(
        "SELECT COUNT(*) AS vehicles, AVG(avg_speed) AS avg_speed, MAX(top_speed) AS top_speed, "
        "COALESCE(SUM(violation), 0) AS violations FROM vehicles")
    return {
        "videos": db.one("SELECT COUNT(*) AS n FROM videos")["n"],
        "calibrated_videos": db.one("SELECT COUNT(*) AS n FROM videos WHERE cal_points IS NOT NULL")["n"],
        "runs": db.one("SELECT COUNT(*) AS n FROM runs")["n"],
        "vehicles": totals["vehicles"],
        "avg_speed": None if totals["avg_speed"] is None else round(totals["avg_speed"], 1),
        "top_speed": None if totals["top_speed"] is None else round(totals["top_speed"], 1),
        "violations": totals["violations"],
        "active_run": runs.active_run_id(),
        "speed_limit": db.get_settings()["speed_limit"],
        "recent_violations": list_vehicles(violations_only=True, limit=6)["items"],
        "recent_runs": list_runs(limit=5),
    }


def analytics_report(run_id: Optional[int] = None, video_id: Optional[int] = None) -> dict:
    settings = db.get_settings()
    limit = settings["speed_limit"]
    if run_id is not None:
        run = db.one("SELECT speed_limit FROM runs WHERE id = ?", (run_id,))
        if run is None:
            raise NotFound("That run does not exist.")
        limit = run["speed_limit"] or limit
    return analytics.compute(run_id, video_id, settings["units"], limit)


def export_csv(run_id: Optional[int] = None, video_id: Optional[int] = None) -> str:
    rows = list_vehicles(run_id=run_id, video_id=video_id, limit=1_000_000)["items"]
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["vehicle_id", "run_id", "video", "track_id", "type", "first_seen_s", "last_seen_s",
                     "avg_speed_kmh", "top_speed_kmh", "direction", "speed_limit_kmh", "over_limit"])
    for r in rows:
        writer.writerow([r["id"], r["run_id"], r["video_name"], r["track_id"], r["cls"],
                         round(r["first_t"], 2), round(r["last_t"], 2), round(r["avg_speed"], 1),
                         round(r["top_speed"], 1), r["direction"], r["speed_limit"],
                         "yes" if r["violation"] else "no"])
    return buf.getvalue()


# -------------------------------------------------------------- settings
def update_settings(values: Dict[str, Any]) -> dict:
    clean = {}  # type: Dict[str, Any]
    if values.get("speed_limit") is not None:
        limit = float(values["speed_limit"])
        if not (10 <= limit <= 300):
            raise BadRequest("The speed limit should be between 10 and 300 km/h.")
        clean["speed_limit"] = limit
    if values.get("confidence") is not None:
        conf = float(values["confidence"])
        if not (0.05 <= conf <= 0.9):
            raise BadRequest("Detection confidence should be between 0.05 and 0.9.")
        clean["confidence"] = conf
    for key, options in (("quality", db.QUALITY_OPTIONS), ("model", db.MODEL_OPTIONS), ("units", db.UNIT_OPTIONS)):
        if values.get(key) is not None:
            if values[key] not in options:
                raise BadRequest("Unknown value for %s." % key)
            clean[key] = values[key]
    return db.set_settings(clean)


def reset_everything() -> None:
    """Remove all videos, runs and results (used by the Settings page)."""
    for run in db.query("SELECT id FROM runs"):
        runs.stop(run["id"])
    for name in ("readings", "vehicles", "runs", "videos"):
        db.execute("DELETE FROM %s" % name)
    for folder in (config.VIDEOS, config.CAPTURES, config.THUMBS):
        shutil.rmtree(folder, ignore_errors=True)
    config.ensure_dirs()
