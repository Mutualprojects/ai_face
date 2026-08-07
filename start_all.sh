#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Sentinel — one-shot launcher for the full stack:
#   1. MediaMTX (RTSP/WebRTC/HLS ingest & streaming)
#   2. Flask Backend (InsightFace + YOLOv8 + Supabase + camera workers)
#   3. Next.js Frontend (dashboard UI)
#
# Usage:
#   ./start_all.sh          # start everything in background
#   ./start_all.sh --dev    # same (default)
#   ./start_all.sh stop     # stop everything started by this script
# ─────────────────────────────────────────────────────────────

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT/Backend"
FRONTEND_DIR="$ROOT/front_end"
LOG_DIR="$ROOT/logs"
PID_FILE="$LOG_DIR/pids"

mkdir -p "$LOG_DIR"

start_backend() {
  echo "Starting Flask Backend..."
  ( cd "$BACKEND_DIR" && venv/bin/python app.py > "$LOG_DIR/backend.log" 2>&1 ) &
  echo "backend:$!" >> "$PID_FILE"
}

start_mediamtx() {
  echo "Starting MediaMTX..."
  ( cd "$BACKEND_DIR" && ./mediamtx mediamtx.yml > "$LOG_DIR/mediamtx.log" 2>&1 ) &
  echo "mediamtx:$!" >> "$PID_FILE"
}

start_frontend() {
  echo "Starting Next.js Frontend..."
  ( cd "$FRONTEND_DIR" && npm run dev > "$LOG_DIR/frontend.log" 2>&1 ) &
  echo "frontend:$!" >> "$PID_FILE"
}

stop_all() {
  if [ -f "$PID_FILE" ]; then
    while IFS=: read -r name pid; do
      [ -n "$pid" ] && kill "$pid" 2>/dev/null
    done < "$PID_FILE"
    rm -f "$PID_FILE"
  fi
  pkill -f "mediamtx mediamtx.yml" 2>/dev/null
  echo "All services stopped."
}

case "${1:-dev}" in
  stop)
    stop_all
    ;;
  *)
    [ -f "$PID_FILE" ] && stop_all
    start_mediamtx
    start_backend
    start_frontend
    echo "All services started. Logs in $LOG_DIR/"
    echo "  Backend:  http://127.0.0.1:5000/api/health"
    echo "  Frontend: http://127.0.0.1:3000"
    ;;
esac
