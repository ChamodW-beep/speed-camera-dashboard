"""Runs one video through detection, tracking and speed measurement in the background."""
import json
import threading
import time
import traceback
from typing import Callable, Dict, List, Optional

import cv2

from . import config, db
from .detector import Detection
from .geometry import road_homography, to_ground
from .speed import SpeedTracker, Track

MAX_FRAME_SIDE = {"fast": 960, "balanced": 1280, "accurate": 1600}
KMH_TO_MPH = 0.621371

# BGR colours, matching the dashboard palette
ASPHALT = (40, 35, 28)
ALERT_RED = (47, 47, 211)
MARKING_YELLOW = (5, 183, 242)
WHITE = (255, 255, 255)


def format_speed(kmh: float, units: str) -> str:
    if units == "mph":
        return "%d mph" % round(kmh * KMH_TO_MPH)
    return "%d km/h" % round(kmh)


def draw_vehicle(frame, box, label: str, alert: bool) -> None:
    x1, y1, x2, y2 = (int(v) for v in box)
    cv2.rectangle(frame, (x1, y1), (x2, y2), ALERT_RED if alert else WHITE, 2)
    font, scale, thick, pad = cv2.FONT_HERSHEY_DUPLEX, 0.62, 1, 5
    (tw, th), _ = cv2.getTextSize(label, font, scale, thick)
    top = max(0, y1 - th - 2 * pad)
    cv2.rectangle(frame, (x1, top), (x1 + tw + 2 * pad, top + th + 2 * pad),
                  ALERT_RED if alert else ASPHALT, -1)
    cv2.putText(frame, label, (x1 + pad, top + th + pad - 1), font, scale, WHITE, thick, cv2.LINE_AA)
    cv2.circle(frame, (int((x1 + x2) / 2), y2), 3, MARKING_YELLOW, -1)


class Processor(threading.Thread):
    def __init__(self, run_id: int, video: dict, speed_limit: float, quality: str,
                 units: str, detector_factory: Callable[[], object]):
        super().__init__(name="run-%d" % run_id, daemon=True)
        self.run_id = run_id
        self.video = video
        self.speed_limit = float(speed_limit)
        self.quality = quality
        self.units = units
        self.detector_factory = detector_factory
        self.stop_event = threading.Event()
        self.latest_jpeg = None  # type: Optional[bytes]
        self.frame_seq = 0
        self.vehicle_count = 0
        self.violation_count = 0
        self.live = {
            "stage": "starting", "progress": 0.0, "frame": 0, "frames": video.get("frames") or 0,
            "vehicles_in_view": [], "vehicles_total": 0, "violations": 0, "processing_fps": 0.0,
        }  # type: Dict[str, object]

    # ---- public -------------------------------------------------------
    def stop(self) -> None:
        self.stop_event.set()

    def run(self) -> None:
        try:
            self._process()
        except Exception as exc:  # reported to the dashboard instead of dying silently
            traceback.print_exc()
            self.live["stage"] = "failed"
            db.execute(
                "UPDATE runs SET status='failed', error=?, finished_at=?, vehicles=?, violations=? WHERE id=?",
                (str(exc)[:500], time.time(), self.vehicle_count, self.violation_count, self.run_id),
            )

    # ---- internals ----------------------------------------------------
    def _process(self) -> None:
        video = self.video
        path = config.VIDEOS / video["filename"]
        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            raise RuntimeError("The video file could not be opened.")
        try:
            fps = cap.get(cv2.CAP_PROP_FPS)
            if not fps or fps < 1 or fps > 240:
                fps = video.get("fps") or 25.0
            total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or int(video.get("frames") or 0)
            w0, h0 = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            scale = min(1.0, MAX_FRAME_SIDE.get(self.quality, 1280) / float(max(w0, h0)))
            pw, ph = int(round(w0 * scale)), int(round(h0 * scale))
            points = json.loads(video["cal_points"])
            M = road_homography(points, pw, ph, float(video["cal_width"]), float(video["cal_length"]))

            self.live["stage"] = "loading model"
            detector = self.detector_factory()
            self.live["stage"] = "running"

            tracker = SpeedTracker()
            frame_idx = 0
            # Save about 15 pictures per second so the finished run can be replayed in the browser
            keep_every = max(1, int(round(fps / 15.0)))
            play_fps = fps / keep_every
            play_dir = config.CAPTURES / ("run%d_play" % self.run_id)
            play_dir.mkdir(parents=True, exist_ok=True)
            saved = 0
            started = time.time()
            last_db = 0.0
            frame = None
            while not self.stop_event.is_set():
                ok, raw = cap.read()
                if not ok:
                    break
                frame_idx += 1
                t = (frame_idx - 1) / fps
                frame = cv2.resize(raw, (pw, ph), interpolation=cv2.INTER_AREA) if scale < 1.0 else raw

                in_view = []  # type: List[dict]
                detections = detector.detect(frame)  # type: List[Detection]
                overlay = []
                for det in detections:
                    x1, y1, x2, y2 = det.box
                    gx, gy = to_ground(M, (x1 + x2) / 2.0, y2)
                    track, speed = tracker.update(t, det.track_id, det.cls, gx, gy)
                    track.consider_crop(frame, det.box, (x2 - x1) * (y2 - y1))
                    alert = speed is not None and speed > self.speed_limit
                    label = "#%d" % det.track_id if speed is None else format_speed(speed, self.units)
                    overlay.append((det.box, label, alert))
                    in_view.append({"id": det.track_id, "cls": track.cls,
                                    "speed": None if speed is None else round(speed, 1),
                                    "alert": bool(alert)})
                for box, label, alert in overlay:
                    draw_vehicle(frame, box, label, alert)

                for lost in tracker.pop_lost(t):
                    self._finalize(lost)

                ok_jpg, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                if ok_jpg:
                    self.latest_jpeg = buf.tobytes()
                    if (frame_idx - 1) % keep_every == 0:
                        saved += 1
                        (play_dir / ("%05d.jpg" % saved)).write_bytes(self.latest_jpeg)
                    self.frame_seq += 1

                elapsed = max(time.time() - started, 1e-6)
                progress = (frame_idx / float(total)) if total else 0.0
                self.live = {
                    "stage": "running", "progress": min(progress, 0.999), "frame": frame_idx,
                    "frames": total, "vehicles_in_view": in_view,
                    "vehicles_total": self.vehicle_count + len(tracker.tracks),
                    "violations": self.violation_count,
                    "processing_fps": round(frame_idx / elapsed, 1),
                }
                now = time.time()
                if now - last_db > 1.0:
                    last_db = now
                    db.execute("UPDATE runs SET progress=?, frames_done=?, vehicles=?, violations=? WHERE id=?",
                               (min(progress, 0.999), frame_idx, self.vehicle_count,
                                self.violation_count, self.run_id))

            for remaining in tracker.pop_all():
                self._finalize(remaining)

            (play_dir / "meta.json").write_text(json.dumps({"frames": saved, "fps": round(play_fps, 3)}))
            stopped = self.stop_event.is_set()
            if frame is not None and self.latest_jpeg:
                (config.CAPTURES / ("run%d_last.jpg" % self.run_id)).write_bytes(self.latest_jpeg)
            self.live["stage"] = "stopped" if stopped else "completed"
            self.live["progress"] = self.live["progress"] if stopped else 1.0
            db.execute(
                "UPDATE runs SET status=?, progress=?, frames_done=?, vehicles=?, violations=?, finished_at=? WHERE id=?",
                ("stopped" if stopped else "completed", 1.0 if not stopped else float(self.live["progress"]),
                 frame_idx, self.vehicle_count, self.violation_count, time.time(), self.run_id),
            )
        finally:
            cap.release()

    def _finalize(self, track: Track) -> None:
        info = track.summary()
        if info is None:
            return
        violation = 1 if info["top_speed"] > self.speed_limit else 0
        snapshot = None
        if track.best_crop:
            snapshot = "run%d_veh%d.jpg" % (self.run_id, track.track_id)
            (config.CAPTURES / snapshot).write_bytes(track.best_crop)
        vehicle_id = db.execute(
            "INSERT INTO vehicles(run_id, track_id, cls, first_t, last_t, avg_speed, top_speed, "
            "direction, samples, violation, snapshot) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (self.run_id, info["track_id"], info["cls"], info["first_t"], info["last_t"],
             info["avg_speed"], info["top_speed"], info["direction"], info["samples"], violation, snapshot),
        )
        db.executemany("INSERT INTO readings(vehicle_id, t, speed) VALUES(?,?,?)",
                       [(vehicle_id, t, v) for t, v in info["readings"]])
        self.vehicle_count += 1
        self.violation_count += violation
