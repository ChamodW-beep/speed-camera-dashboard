"""Speed estimation for tracked vehicles, working in road metres."""
import math
from collections import deque
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

WINDOW_S = 1.2        # look back at most this far when measuring movement
MIN_DT = 0.4          # need at least this much movement history before reporting
MAX_KMH = 250.0       # anything faster is a tracking jump, not a real speed
MIN_SAMPLES = 5       # tracks with fewer speed readings are ignored
EMA_ALPHA = 0.3       # smoothing: higher reacts faster, lower is steadier
LOST_AFTER_S = 1.5    # a vehicle unseen this long has left the picture
READING_EVERY_S = 0.5


class Track:
    """One vehicle followed through the video."""

    def __init__(self, track_id: int, cls: str, t: float):
        self.track_id = track_id
        self.first_t = t
        self.last_t = t
        self.cls_votes = {}  # type: Dict[str, int]
        self.pos = deque()   # (t, X, Y) road positions in metres
        self.ema = None      # type: Optional[float]
        self.speeds = []     # type: List[Tuple[float, float]]
        self.y_first = None  # type: Optional[float]
        self.y_last = None   # type: Optional[float]
        self.best_area = 0.0
        self.best_crop = None  # type: Optional[bytes]
        self._crop_tick = 0
        self.vote(cls)

    def vote(self, cls: str) -> None:
        self.cls_votes[cls] = self.cls_votes.get(cls, 0) + 1

    @property
    def cls(self) -> str:
        if not self.cls_votes:
            return "vehicle"
        return max(self.cls_votes, key=lambda k: self.cls_votes[k])

    def push(self, t: float, x: float, y: float) -> Optional[float]:
        """Add a road position. Returns the smoothed speed in km/h, or None while warming up."""
        self.last_t = t
        if self.y_first is None:
            self.y_first = y
        self.y_last = y
        self.pos.append((t, x, y))
        while self.pos and t - self.pos[0][0] > WINDOW_S:
            self.pos.popleft()
        t0, x0, y0 = self.pos[0]
        dt = t - t0
        if dt < MIN_DT:
            return None
        v = math.hypot(x - x0, y - y0) / dt * 3.6
        if v > MAX_KMH:
            return None
        self.ema = v if self.ema is None else (1 - EMA_ALPHA) * self.ema + EMA_ALPHA * v
        self.speeds.append((t, self.ema))
        return self.ema

    def consider_crop(self, frame: np.ndarray, box, area: float) -> None:
        """Keep the clearest (largest) picture of this vehicle for the record."""
        self._crop_tick += 1
        if self.best_crop is not None and (self._crop_tick % 4 != 0 or area < self.best_area * 1.2):
            return
        h_img, w_img = frame.shape[:2]
        x1, y1, x2, y2 = box
        pad = 0.15 * max(x2 - x1, y2 - y1)
        xa, ya = int(max(0, x1 - pad)), int(max(0, y1 - pad))
        xb, yb = int(min(w_img, x2 + pad)), int(min(h_img, y2 + pad))
        crop = frame[ya:yb, xa:xb]
        if crop.size == 0:
            return
        ch, cw = crop.shape[:2]
        scale = min(1.0, 260.0 / max(ch, cw))
        if scale < 1.0:
            crop = cv2.resize(crop, (max(1, int(cw * scale)), max(1, int(ch * scale))),
                              interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 82])
        if ok:
            self.best_crop = buf.tobytes()
            self.best_area = area

    def summary(self) -> Optional[dict]:
        """Final numbers for this vehicle, or None if there was not enough to trust."""
        if len(self.speeds) < MIN_SAMPLES:
            return None
        usable = self.speeds[2:] if len(self.speeds) >= MIN_SAMPLES + 2 else self.speeds
        vals = np.array([v for _, v in usable], dtype=np.float64)
        top = float(np.percentile(vals, 95)) if len(vals) >= 8 else float(vals.max())
        dy = (self.y_last or 0.0) - (self.y_first or 0.0)
        direction = "toward" if dy > 1.0 else "away" if dy < -1.0 else "unclear"
        readings = []
        next_t = -1.0
        for t, v in usable:
            if t >= next_t:
                readings.append((float(t), float(v)))
                next_t = t + READING_EVERY_S
        return {
            "track_id": self.track_id,
            "cls": self.cls,
            "first_t": float(self.first_t),
            "last_t": float(self.last_t),
            "avg_speed": float(vals.mean()),
            "top_speed": top,
            "direction": direction,
            "samples": len(self.speeds),
            "readings": readings,
        }


class SpeedTracker:
    """Keeps a Track per vehicle id and hands back vehicles that have left the picture."""

    def __init__(self):
        self.tracks = {}  # type: Dict[int, Track]

    def update(self, t: float, track_id: int, cls: str, x: float, y: float) -> Tuple[Track, Optional[float]]:
        track = self.tracks.get(track_id)
        if track is None:
            track = Track(track_id, cls, t)
            self.tracks[track_id] = track
        else:
            track.vote(cls)
        return track, track.push(t, x, y)

    def pop_lost(self, t: float) -> List[Track]:
        lost = [tr for tr in self.tracks.values() if t - tr.last_t > LOST_AFTER_S]
        for tr in lost:
            del self.tracks[tr.track_id]
        return lost

    def pop_all(self) -> List[Track]:
        remaining = list(self.tracks.values())
        self.tracks = {}
        return remaining
