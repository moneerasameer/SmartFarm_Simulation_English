#!/usr/bin/env bash
# ===========================================================================
#  Smart Farm 3D — local run helper (macOS / Linux)
#
#    ./web3d/run_web.sh          serve on http://localhost:8080/web3d/
#    PORT=9000 ./web3d/run_web.sh
#
#  A plain HTTP server is required: browsers block ES modules and CSV fetches
#  on file:// pages. The script uses the project virtual environment when it
#  exists, otherwise it falls back to python3.
# ===========================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PORT="${PORT:-8080}"

PYTHON="$PROJECT_DIR/.venv/bin/python"
if [ ! -x "$PYTHON" ]; then
  PYTHON="$(command -v python3 || true)"
fi
if [ -z "$PYTHON" ]; then
  echo "ERROR: python3 not found. Install Python 3 or run any static server from $PROJECT_DIR." >&2
  exit 2
fi

cd "$PROJECT_DIR"

URL="http://localhost:${PORT}/web3d/"
echo "=============================================================="
echo " Smart Farm 3D — Three.js digital twin"
echo "--------------------------------------------------------------"
echo " project : $PROJECT_DIR"
echo " python  : $PYTHON"
echo " url     : $URL"
echo "=============================================================="
echo " Press Ctrl+C to stop the server."
echo

"$PYTHON" -m http.server "$PORT" --bind 127.0.0.1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

sleep 1
if command -v open >/dev/null 2>&1; then
  open "$URL" || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" || true
fi

wait "$SERVER_PID"
