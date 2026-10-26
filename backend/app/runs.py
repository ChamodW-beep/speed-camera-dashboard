"""Keeps track of the one processing run that can be active at a time."""
import threading
import time
from typing import Callable, Dict, Optional

from . import db
from .detector import YoloDetector
from .processor import Processor

_active = {}  # type: Dict[int, Processor]
_lock = threading.Lock()


class RunConflict(Exception):
    pass


def default_detector_factory(model: str, confidence: float, quality: str) -> Callable[[], object]:
    return lambda: YoloDetector(model, confidence, quality)


# The tests replace this with a function that returns a fake detector.
detector_factory_builder = default_detector_factory


def recover_interrupted() -> None:
    """Runs left 'running' by a previous crash or restart are marked as interrupted."""
    db.execute("UPDATE runs SET status='interrupted', finished_at=? WHERE status IN ('running', 'queued')",
               (time.time(),))


def active_run_id() -> Optional[int]:
    with _lock:
        for run_id, proc in list(_active.items()):
            if proc.is_alive():
                return run_id
            _active.pop(run_id, None)
    return None


def get(run_id: int) -> Optional[Processor]:
    with _lock:
        return _active.get(run_id)


def start(video: dict, speed_limit: float, quality: str, model: str, confidence: float, units: str) -> int:
    with _lock:
        for proc in _active.values():
            if proc.is_alive():
                raise RunConflict("Another video is already being processed. Stop it or wait for it to finish.")
        run_id = db.execute(
            "INSERT INTO runs(video_id, status, progress, speed_limit, quality, model, started_at) "
            "VALUES(?,?,?,?,?,?,?)",
            (video["id"], "running", 0.0, speed_limit, quality, model, time.time()),
        )
        proc = Processor(run_id, video, speed_limit, quality, units,
                         detector_factory_builder(model, confidence, quality))
        _active[run_id] = proc
        proc.start()
        return run_id


def stop(run_id: int) -> bool:
    proc = get(run_id)
    if proc is None or not proc.is_alive():
        return False
    proc.stop()
    return True
