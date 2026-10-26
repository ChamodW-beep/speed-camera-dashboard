"""Numbers and chart data computed from saved vehicles."""
import math
from typing import Dict, List, Optional

import numpy as np

from . import db

KMH_TO_MPH = 0.621371
BUCKET_STEPS = [5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600]


def _fmt_time(seconds: float) -> str:
    s = int(seconds)
    return "%d:%02d" % (s // 60, s % 60)


def vehicle_rows(run_id: Optional[int] = None, video_id: Optional[int] = None) -> List[dict]:
    where, args = [], []  # type: List[str], list
    if run_id is not None:
        where.append("v.run_id = ?")
        args.append(run_id)
    if video_id is not None:
        where.append("r.video_id = ?")
        args.append(video_id)
    sql = "SELECT v.* FROM vehicles v JOIN runs r ON r.id = v.run_id"
    if where:
        sql += " WHERE " + " AND ".join(where)
    return db.query(sql + " ORDER BY v.id", tuple(args))


def compute(run_id: Optional[int], video_id: Optional[int], units: str, limit_kmh: float) -> Dict:
    factor = KMH_TO_MPH if units == "mph" else 1.0
    rows = vehicle_rows(run_id, video_id)
    limit = limit_kmh * factor
    out = {
        "unit": "mph" if units == "mph" else "km/h",
        "limit": round(limit, 1),
        "kpis": {"vehicles": 0, "avg_speed": None, "v85": None, "top_speed": None,
                 "violations": 0, "violation_rate": None},
        "histogram": [], "timeline": [], "classes": [], "directions": [],
    }
    if not rows:
        return out

    avg = np.array([r["avg_speed"] for r in rows], dtype=np.float64) * factor
    top = np.array([r["top_speed"] for r in rows], dtype=np.float64) * factor
    violations = sum(1 for r in rows if r["violation"])
    out["kpis"] = {
        "vehicles": len(rows),
        "avg_speed": round(float(avg.mean()), 1),
        "v85": round(float(np.percentile(avg, 85)), 1),
        "top_speed": round(float(top.max()), 1),
        "violations": violations,
        "violation_rate": round(100.0 * violations / len(rows), 1),
    }

    top_edge = max(30, int(math.ceil(float(avg.max()) / 10.0) * 10))
    edges = list(range(0, top_edge + 10, 10))
    counts, _ = np.histogram(avg, bins=edges)
    out["histogram"] = [
        {"label": "%d-%d" % (edges[i], edges[i + 1]), "from": edges[i], "to": edges[i + 1],
         "count": int(counts[i]), "over": edges[i] >= limit}
        for i in range(len(counts))
    ]

    duration = max(float(r["last_t"]) for r in rows)
    step = next((s for s in BUCKET_STEPS if duration / s <= 36), BUCKET_STEPS[-1])
    buckets = {}  # type: Dict[int, List[float]]
    for r, a in zip(rows, avg):
        buckets.setdefault(int(r["first_t"] // step), []).append(float(a))
    for i in range(int(duration // step) + 1):
        vals = buckets.get(i, [])
        out["timeline"].append({
            "t": i * step, "label": _fmt_time(i * step), "count": len(vals),
            "avg": round(sum(vals) / len(vals), 1) if vals else None,
        })

    for key, target in (("cls", "classes"), ("direction", "directions")):
        tally = {}  # type: Dict[str, int]
        for r in rows:
            tally[r[key] or "unknown"] = tally.get(r[key] or "unknown", 0) + 1
        out[target] = [{"name": k, "count": v} for k, v in sorted(tally.items(), key=lambda kv: -kv[1])]
    return out
