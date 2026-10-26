"""SQLite storage: videos, runs, vehicles, readings and settings."""
import sqlite3
import threading
from typing import Any, Dict, List, Optional

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    filename TEXT NOT NULL,
    fps REAL, width INTEGER, height INTEGER, frames INTEGER, duration REAL,
    created_at REAL,
    cal_points TEXT, cal_width REAL, cal_length REAL, cal_updated REAL
);
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    progress REAL DEFAULT 0,
    speed_limit REAL, quality TEXT, model TEXT,
    started_at REAL, finished_at REAL, error TEXT,
    frames_done INTEGER DEFAULT 0,
    vehicles INTEGER DEFAULT 0,
    violations INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    track_id INTEGER, cls TEXT,
    first_t REAL, last_t REAL,
    avg_speed REAL, top_speed REAL,
    direction TEXT, samples INTEGER,
    violation INTEGER DEFAULT 0,
    snapshot TEXT
);
CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    t REAL, speed REAL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE INDEX IF NOT EXISTS idx_vehicles_run ON vehicles(run_id);
CREATE INDEX IF NOT EXISTS idx_readings_vehicle ON readings(vehicle_id);
"""

DEFAULT_SETTINGS = {
    "speed_limit": 80.0,
    "quality": "balanced",
    "model": "yolov8s.pt",
    "confidence": 0.25,
    "units": "kmh",
}
QUALITY_OPTIONS = ("fast", "balanced", "accurate")
MODEL_OPTIONS = ("yolov8n.pt", "yolov8s.pt", "yolov8m.pt")
UNIT_OPTIONS = ("kmh", "mph")

_write_lock = threading.RLock()


def connect() -> sqlite3.Connection:
    config.ensure_dirs()
    conn = sqlite3.connect(config.DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init() -> None:
    config.ensure_dirs()
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def query(sql: str, args: tuple = ()) -> List[Dict[str, Any]]:
    conn = connect()
    try:
        return [dict(r) for r in conn.execute(sql, args).fetchall()]
    finally:
        conn.close()


def one(sql: str, args: tuple = ()) -> Optional[Dict[str, Any]]:
    rows = query(sql, args)
    return rows[0] if rows else None


def execute(sql: str, args: tuple = ()) -> int:
    with _write_lock:
        conn = connect()
        try:
            cur = conn.execute(sql, args)
            conn.commit()
            return cur.lastrowid
        finally:
            conn.close()


def executemany(sql: str, rows: List[tuple]) -> None:
    if not rows:
        return
    with _write_lock:
        conn = connect()
        try:
            conn.executemany(sql, rows)
            conn.commit()
        finally:
            conn.close()


def get_settings() -> Dict[str, Any]:
    out = dict(DEFAULT_SETTINGS)
    for row in query("SELECT key, value FROM settings"):
        key = row["key"]
        if key in out:
            default = DEFAULT_SETTINGS[key]
            try:
                out[key] = type(default)(row["value"])
            except (TypeError, ValueError):
                pass
    return out


def set_settings(values: Dict[str, Any]) -> Dict[str, Any]:
    for key, value in values.items():
        if key not in DEFAULT_SETTINGS or value is None:
            continue
        execute(
            "INSERT INTO settings(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, str(value)),
        )
    return get_settings()
