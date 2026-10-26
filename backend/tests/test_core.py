"""Checks for the engine: calibration maths, speed estimation, the video run and the reports.

Run with:  python tests/test_core.py        (or: pytest)
No YOLO or web server needed: a fake detector drives vehicles along known paths so the
measured speeds can be compared with the true ones.
"""
import os
import shutil
import sys
import tempfile
import time
import traceback
from pathlib import Path

TMP = tempfile.mkdtemp(prefix="speedwatch-test-")
os.environ["SPEEDWATCH_DATA"] = TMP
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cv2  # noqa: E402
import numpy as np  # noqa: E402

from app import analytics, config, db, runs, services  # noqa: E402
from app.detector import Detection  # noqa: E402
from app.geometry import (birdseye, metres_per_pixel, order_points, road_homography,  # noqa: E402
                          to_ground, validate_quad)
from app.services import BadRequest  # noqa: E402
from app.speed import SpeedTracker  # noqa: E402

W_M, L_M = 7.0, 20.0
FRAME_W, FRAME_H, FPS = 960, 540, 30
QUAD = [[0.40, 0.30], [0.60, 0.30], [0.85, 0.90], [0.15, 0.90]]  # far-left, far-right, near-right, near-left


class FakeDetector:
    """Puts vehicles on the road at known positions and speeds."""

    def __init__(self, vehicles, noise_px=0.0, delay=0.0):
        self.vehicles = vehicles
        self.M = road_homography(QUAD, FRAME_W, FRAME_H, W_M, L_M)
        self.Minv = np.linalg.inv(self.M)
        self.rng = np.random.default_rng(3)
        self.noise = noise_px
        self.delay = delay
        self.n = 0

    def detect(self, frame):
        self.n += 1
        if self.delay:
            time.sleep(self.delay)
        out = []
        for v in self.vehicles:
            if v["start"] <= self.n <= v["end"]:
                t = (self.n - v["start"]) / float(FPS)
                p = cv2.perspectiveTransform(
                    np.array([[[v["x"], v["y0"] + v["ms"] * t]]], dtype=np.float32), self.Minv)[0][0]
                px, py = float(p[0]), float(p[1])
                if self.noise:
                    px += float(self.rng.normal(0, self.noise))
                    py += float(self.rng.normal(0, self.noise))
                assert 0 <= px < FRAME_W and 0 <= py < FRAME_H, "test vehicle left the picture"
                out.append(Detection(v["id"], (px - 30, py - 45, px + 30, py), v["cls"], 0.9))
        return out


def make_video(path: Path, frames: int = 135) -> None:
    for fourcc, name in (("mp4v", path), ("MJPG", path.with_suffix(".avi"))):
        writer = cv2.VideoWriter(str(name), cv2.VideoWriter_fourcc(*fourcc), FPS, (FRAME_W, FRAME_H))
        if not writer.isOpened():
            continue
        for i in range(frames):
            img = np.full((FRAME_H, FRAME_W, 3), 70, dtype=np.uint8)
            cv2.rectangle(img, (int(FRAME_W * 0.2), int(FRAME_H * 0.3)), (int(FRAME_W * 0.8), FRAME_H), (90, 90, 90), -1)
            cv2.putText(img, str(i), (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
            writer.write(img)
        writer.release()
        if name.exists() and name.stat().st_size > 0:
            if name != path:
                shutil.move(str(name), str(path))
            return
    raise RuntimeError("this OpenCV build cannot write test videos")


def fresh_db():
    shutil.rmtree(TMP, ignore_errors=True)
    config.ensure_dirs()
    if config.DB_PATH.exists():
        config.DB_PATH.unlink()
    db.init()


def wait_for(run_id, timeout=60):
    proc = runs.get(run_id)
    proc.join(timeout)
    assert not proc.is_alive(), "run did not finish"
    return services.get_run(run_id)


def add_video(frames=135):
    src = Path(TMP) / ("src_%d.mp4" % time.time_ns())
    make_video(src, frames)
    dest = config.VIDEOS / src.name
    shutil.move(str(src), str(dest))
    return services.register_video(dest, "Test highway.mp4")


SHUFFLED = [QUAD[2], QUAD[0], QUAD[3], QUAD[1]]  # clicked in a different order on purpose


# ------------------------------------------------------------------ tests
def test_points_can_be_clicked_in_any_order():
    assert np.allclose(order_points(SHUFFLED), order_points(QUAD))
    assert np.allclose(order_points(QUAD), np.array(QUAD))


def test_bad_points_are_explained():
    assert validate_quad(QUAD) is None
    assert "too little" in validate_quad([[0.5, 0.5], [0.51, 0.5], [0.51, 0.51], [0.5, 0.51]])
    # clicking the corners in a criss-cross order is fixed automatically
    assert validate_quad([[0.2, 0.3], [0.8, 0.9], [0.8, 0.3], [0.2, 0.9]]) is None
    # but a point pushed inside the shape cannot be a rectangle on the road
    assert "cross" in validate_quad([[0.2, 0.3], [0.8, 0.3], [0.9, 0.9], [0.5, 0.45]])
    assert validate_quad([[0.1, 0.1]] * 3) is not None
    assert validate_quad([[1.5, 0.1], [0.2, 0.2], [0.3, 0.8], [0.1, 0.8]]) is not None


def test_homography_maps_corners_to_real_size():
    M = road_homography(QUAD, FRAME_W, FRAME_H, W_M, L_M)
    far_left = to_ground(M, 0.40 * FRAME_W, 0.30 * FRAME_H)
    near_right = to_ground(M, 0.85 * FRAME_W, 0.90 * FRAME_H)
    assert np.allclose(far_left, (0, 0), atol=1e-3)
    assert np.allclose(near_right, (W_M, L_M), atol=1e-3)
    assert metres_per_pixel(M, 0.5 * FRAME_W, 0.6 * FRAME_H) > 0


def test_birdseye_view_is_produced():
    M = road_homography(QUAD, FRAME_W, FRAME_H, W_M, L_M)
    img = birdseye(np.full((FRAME_H, FRAME_W, 3), 120, dtype=np.uint8), M, W_M, L_M)
    assert img.shape[0] > 100 and img.shape[1] > 100


def test_constant_speed_is_measured_accurately():
    for kmh in (20, 50, 90):
        tracker = SpeedTracker()
        ms = kmh / 3.6
        for i in range(60):
            t = i / 30.0
            track, _ = tracker.update(t, 1, "car", 3.5, ms * t)
        info = track.summary()
        assert info is not None
        assert abs(info["avg_speed"] - kmh) < 0.5, (kmh, info["avg_speed"])
        assert info["direction"] == "toward"


def test_measuring_survives_pixel_noise():
    M = road_homography(QUAD, FRAME_W, FRAME_H, W_M, L_M)
    det = FakeDetector([dict(id=1, x=3.5, y0=-6, ms=10.0, start=1, end=80, cls="car")], noise_px=1.2)
    tracker = SpeedTracker()
    for i in range(1, 81):
        for d in det.detect(None):
            gx, gy = to_ground(M, (d.box[0] + d.box[2]) / 2, d.box[3])
            tracker.update((i - 1) / 30.0, d.track_id, d.cls, gx, gy)
    info = list(tracker.tracks.values())[0].summary()
    assert abs(info["avg_speed"] - 36.0) < 4.0, info["avg_speed"]  # within about 10 percent


def test_full_run_finds_vehicles_and_flags_the_fast_one():
    fresh_db()
    video = add_video()
    assert video["frames"] == 135 and abs(video["fps"] - FPS) < 1
    cal = services.save_calibration(video["id"], SHUFFLED, W_M, L_M)
    assert cal["calibrated"] and cal["calibration"]["meters_per_pixel"] > 0
    assert services.birdseye_jpeg(video["id"])[:2] == b"\xff\xd8"
    assert services.frame_jpeg(video["id"], 0.5)[:2] == b"\xff\xd8"

    fake = FakeDetector([
        dict(id=7, x=5.2, y0=-8, ms=10.0, start=1, end=78, cls="car"),     # 36 km/h, leaves early
        dict(id=9, x=1.8, y0=-8, ms=6.0, start=1, end=135, cls="truck"),   # 21.6 km/h, whole clip
    ])
    runs.detector_factory_builder = lambda model, conf, quality: (lambda: fake)
    started = services.start_run(video["id"], speed_limit=30)
    run = wait_for(started["id"])
    assert run["status"] == "completed", run
    assert run["progress"] == 1.0 and run["vehicles"] == 2 and run["violations"] == 1, run

    items = services.list_vehicles(run_id=run["id"], order="speed")["items"]
    fast, slow = items[0], items[1]
    assert fast["cls"] == "car" and abs(fast["avg_speed"] - 36.0) < 2.0, fast
    assert slow["cls"] == "truck" and abs(slow["avg_speed"] - 21.6) < 1.5, slow
    assert fast["violation"] and not slow["violation"]
    assert fast["direction"] == "toward" and fast["over_by"] > 0
    assert fast["snapshot_url"] and (config.CAPTURES / fast["snapshot_url"].split("/")[-1]).exists()
    assert len(services.vehicle_detail(fast["id"])["readings"]) >= 3
    assert (config.CAPTURES / ("run%d_last.jpg" % run["id"])).exists()
    return video, run


def test_reports_and_exports():
    video, run = test_full_run_finds_vehicles_and_flags_the_fast_one()
    ov = services.overview()
    assert ov["videos"] == 1 and ov["vehicles"] == 2 and ov["violations"] == 1 and ov["active_run"] is None
    assert len(ov["recent_violations"]) == 1 and ov["recent_runs"][0]["video_name"] == "Test highway"

    rep = services.analytics_report(run_id=run["id"])
    k = rep["kpis"]
    assert k["vehicles"] == 2 and k["violations"] == 1 and k["violation_rate"] == 50.0
    assert sum(b["count"] for b in rep["histogram"]) == 2
    assert sum(t["count"] for t in rep["timeline"]) == 2
    assert {c["name"] for c in rep["classes"]} == {"car", "truck"}
    assert rep["unit"] == "km/h" and rep["limit"] == 30

    db.set_settings({"units": "mph"})
    mph = services.analytics_report(run_id=run["id"])
    assert mph["unit"] == "mph" and abs(mph["kpis"]["top_speed"] - k["top_speed"] * 0.621371) < 0.2
    db.set_settings({"units": "kmh"})

    csv_text = services.export_csv(run_id=run["id"])
    lines = csv_text.strip().splitlines()
    assert len(lines) == 3 and lines[0].startswith("vehicle_id") and ",yes" in csv_text
    assert len(services.list_vehicles(violations_only=True)["items"]) == 1

    services.delete_run(run["id"])
    assert services.overview()["vehicles"] == 0
    assert not list(config.CAPTURES.glob("run%d_*" % run["id"]))


def test_run_needs_calibration_and_only_one_at_a_time():
    fresh_db()
    video = add_video()
    try:
        services.start_run(video["id"])
        raise AssertionError("should have asked for calibration")
    except BadRequest as exc:
        assert "Calibrate" in str(exc)
    services.save_calibration(video["id"], QUAD, W_M, L_M)
    slow = FakeDetector([], delay=0.05)
    runs.detector_factory_builder = lambda model, conf, quality: (lambda: slow)
    first = services.start_run(video["id"])
    try:
        services.start_run(video["id"])
        raise AssertionError("second run should be refused")
    except BadRequest as exc:
        assert "already" in str(exc)
    assert services.overview()["active_run"] == first["id"]
    time.sleep(0.4)
    services.stop_run(first["id"])
    stopped = wait_for(first["id"])
    assert stopped["status"] == "stopped" and 0 < stopped["progress"] < 1


def test_failed_run_reports_a_reason():
    fresh_db()
    video = add_video()
    services.save_calibration(video["id"], QUAD, W_M, L_M)

    def broken():
        raise RuntimeError("model file missing")

    runs.detector_factory_builder = lambda model, conf, quality: broken
    run = wait_for(services.start_run(video["id"])["id"])
    assert run["status"] == "failed" and "model file missing" in run["error"]


def test_input_checks():
    fresh_db()
    video = add_video()
    for bad_w, bad_l in ((0, 10), (7, 1), ("abc", 10)):
        try:
            services.save_calibration(video["id"], QUAD, bad_w, bad_l)
            raise AssertionError("should reject %r" % ((bad_w, bad_l),))
        except BadRequest:
            pass
    junk = config.VIDEOS / "junk.mp4"
    junk.write_bytes(b"this is not a video")
    try:
        services.register_video(junk, "junk.mp4")
        raise AssertionError("junk file should be rejected")
    except BadRequest:
        assert not junk.exists()
    try:
        services.update_settings({"speed_limit": 5})
        raise AssertionError("limit too low")
    except BadRequest:
        pass
    assert services.update_settings({"speed_limit": 60, "quality": "fast"})["speed_limit"] == 60
    assert services.rename_video(video["id"], "Bridge morning")["name"] == "Bridge morning"
    services.delete_video(video["id"])
    assert services.list_videos() == []


def test_stale_runs_are_marked_interrupted():
    fresh_db()
    video = add_video()
    rid = db.execute("INSERT INTO runs(video_id, status) VALUES(?, 'running')", (video["id"],))
    runs.recover_interrupted()
    assert db.one("SELECT status FROM runs WHERE id=?", (rid,))["status"] == "interrupted"


def test_analytics_with_no_data():
    fresh_db()
    rep = analytics.compute(None, None, "kmh", 80)
    assert rep["kpis"]["vehicles"] == 0 and rep["histogram"] == []


if __name__ == "__main__":
    tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_")]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print("PASS  " + name)
        except Exception:
            failed += 1
            print("FAIL  " + name)
            traceback.print_exc()
    shutil.rmtree(TMP, ignore_errors=True)
    print("\n%d of %d checks passed" % (len(tests) - failed, len(tests)))
    sys.exit(1 if failed else 0)
