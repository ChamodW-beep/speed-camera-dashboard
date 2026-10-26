"""Paths used by the backend. Everything the app stores lives under backend/data."""
import os
from pathlib import Path

DATA = Path(os.environ.get("SPEEDWATCH_DATA", Path(__file__).resolve().parent.parent / "data"))
VIDEOS = DATA / "videos"
CAPTURES = DATA / "captures"
THUMBS = DATA / "thumbs"
DB_PATH = DATA / "speedwatch.db"

ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}
MAX_UPLOAD_MB = 4096


def ensure_dirs():
    for p in (DATA, VIDEOS, CAPTURES, THUMBS):
        p.mkdir(parents=True, exist_ok=True)
