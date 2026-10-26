#!/usr/bin/env bash
# Starts SpeedWatch: API on http://localhost:8000 and dashboard on http://localhost:5173
set -e
cd "$(dirname "$0")"

# Free the ports if an old copy is still running
lsof -ti :8000 | xargs kill -9 2>/dev/null || true
lsof -ti :5173 | xargs kill -9 2>/dev/null || true

echo "==> Backend setup"
if [ ! -d backend/.venv ]; then
  python3 -m venv backend/.venv
fi
backend/.venv/bin/python -m pip install --quiet --upgrade pip
backend/.venv/bin/python -m pip install --quiet -r backend/requirements.txt

echo "==> Frontend setup"
cd frontend
if [ ! -d node_modules ]; then
  npm install
fi
npm ls @fontsource/barlow >/dev/null 2>&1 || npm install @fontsource/barlow @fontsource/barlow-condensed
cd ..

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "==> Starting. Open http://localhost:5173  (Ctrl+C stops everything)"
(cd backend && .venv/bin/python -m uvicorn app.main:app --reload --port 8000) &
(cd frontend && npm run dev -- --port 5173) &
wait
