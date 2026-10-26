# SpeedWatch

A web dashboard that measures vehicle speeds from fixed-camera video.
Upload a video, mark four corners of the road and type its real size, then watch every vehicle get an ID and a speed.

## How it works
1. **Calibrate**: four clicked corners + real width/length give a homography (perspective correction) from pixels to metres.
2. **Detect and track**: YOLOv8 finds vehicles, ByteTrack keeps each one's ID.
3. **Measure**: ground position over a 1.2 s sliding window gives speed, smoothed. Top speed is the 95th percentile of readings.
4. **Store**: SQLite keeps videos, runs, vehicles and readings. Violations get a snapshot.

## Run it
Needs Python 3.9+, Node 18+.

    ./start.sh

Open http://localhost:5173. The first run downloads the YOLO model.

## Pages
Overview, Videos (upload), Calibration, Live monitor, Violations, Analytics, Settings.

## Layout
- `backend/app`: FastAPI, SQLite, OpenCV, YOLO
- `backend/tests`: `python tests/test_core.py` (run inside `backend/`)
- `frontend/src`: React, Vite, Tailwind, Recharts

## Accuracy notes
- Speeds are only as good as the calibration: use a straight, flat stretch and real measurements.
- Vehicles far from the camera are less accurate; bends and hills break the flat-road assumption.
- Not certified for enforcement.
