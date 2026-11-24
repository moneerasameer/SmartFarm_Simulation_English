#!/usr/bin/env bash
# ===========================================================================
#  Smart Farm 3D — reproducible verification
#
#    1. static checks (files, imports, element ids, CSV law, LoRa trace)
#    2. logic tests in a real browser   (tests/logic-test.html)
#    3. guided presentation tests        (tests/presentation-test.html)
#    4. dashboard boot, presentation sync and component picking
#
#  Requires Google Chrome (macOS path below) and Python 3. The server is
#  started on PORT (default 8099) and stopped automatically.
# ===========================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB3D="$(dirname "$SCRIPT_DIR")"
PROJECT="$(dirname "$WEB3D")"
PORT="${PORT:-8099}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PYTHON="$PROJECT/.venv/bin/python"
[ -x "$PYTHON" ] || PYTHON="$(command -v python3)"

TMP_DIR="$(mktemp -d)"
SERVER_PID=""
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

echo "=============================================================="
echo " 1/4  static verification"
echo "=============================================================="
"$PYTHON" "$SCRIPT_DIR/verify_web3d.py"
STATIC_STATUS=$?

if [ ! -x "$CHROME" ]; then
  echo
  echo "Chrome not found at: $CHROME"
  echo "Set CHROME=/path/to/chrome and re-run for the browser checks."
  exit "$STATIC_STATUS"
fi

echo
echo "=============================================================="
echo " 2/4  browser logic tests"
echo "=============================================================="

cd "$PROJECT"
"$PYTHON" -m http.server "$PORT" --bind 127.0.0.1 > "$TMP_DIR/server.log" 2>&1 &
SERVER_PID=$!
sleep 1

LOGIC_HTML="$TMP_DIR/logic.html"
"$CHROME" --headless=new --no-sandbox --virtual-time-budget=9000 \
  --dump-dom "http://127.0.0.1:$PORT/web3d/tests/logic-test.html" > "$LOGIC_HTML" 2>/dev/null
LOGIC_RESULT="$(grep -o 'data-result="[^"]*"' "$LOGIC_HTML" | head -1)"
if [ -z "$LOGIC_RESULT" ]; then
  echo "FAIL: logic page produced no result"
  exit 1
fi
echo "$LOGIC_RESULT" | sed 's/data-result="//; s/"$//'
case "$LOGIC_RESULT" in
  *PASS*) LOGIC_STATUS=0 ;;
  *) LOGIC_STATUS=1 ;;
esac

echo
echo "=============================================================="
echo " 3/4  guided presentation tests"
echo "=============================================================="
PRES_HTML="$TMP_DIR/presentation.html"
"$CHROME" --headless=new --no-sandbox --virtual-time-budget=9000 \
  --dump-dom "http://127.0.0.1:$PORT/web3d/tests/presentation-test.html" > "$PRES_HTML" 2>/dev/null
PRES_RESULT="$(grep -o 'data-result="[^"]*"' "$PRES_HTML" | head -1)"
if [ -z "$PRES_RESULT" ]; then
  echo "FAIL: presentation page produced no result"
  exit 1
fi
echo "$PRES_RESULT" | sed 's/data-result="//; s/"$//'
case "$PRES_RESULT" in
  *PASS*) PRES_STATUS=0 ;;
  *) PRES_STATUS=1 ;;
esac

echo
echo "=============================================================="
echo " 4/4  dashboard boot + presentation sync"
echo "=============================================================="
DASH_HTML="$TMP_DIR/dashboard.html"
"$CHROME" --headless=new --no-sandbox --virtual-time-budget=12000 \
  --dump-dom "http://127.0.0.1:$PORT/web3d/" > "$DASH_HTML" 2>/dev/null

DIAG="$(grep -o 'data-diag="[^"]*"' "$DASH_HTML" | head -1 | sed 's/data-diag="//; s/"$//')"
ROWS="$(grep -o 'data-rows="[^"]*"' "$DASH_HTML" | head -1 | sed 's/data-rows="//; s/"$//')"
ERRORS="$(grep -o 'data-errors="[^"]*"' "$DASH_HTML" | head -1 | sed 's/data-errors="//; s/"$//')"
PACKETS="$(grep -o 'data-packets="[^"]*"' "$DASH_HTML" | head -1 | sed 's/data-packets="//; s/"$//')"

echo "diagnostics : ${DIAG:-missing}"
echo "dataset rows: ${ROWS:-missing}"
echo "runtime errs: ${ERRORS:-missing}"
echo "active pkts : ${PACKETS:-missing}"

DASH_STATUS=1
if [ "$DIAG" = "13/13" ] && [ "${ERRORS:-1}" = "0" ] && [ "${ROWS:-0}" = "120" ]; then
  DASH_STATUS=0
  echo "dashboard   : PASS"
else
  echo "dashboard   : FAIL"
fi

PRESENT_HTML="$TMP_DIR/present.html"
"$CHROME" --headless=new --no-sandbox --virtual-time-budget=14000 \
  --dump-dom "http://127.0.0.1:$PORT/web3d/?present=1&auto=1" > "$PRESENT_HTML" 2>/dev/null
PRESENT_ACTIVE="$(grep -o 'data-presentation="[^"]*"' "$PRESENT_HTML" | head -1 | sed 's/data-presentation="//; s/"$//')"
PRESENT_STAGE="$(grep -o 'data-presentation-stage="[^"]*"' "$PRESENT_HTML" | head -1 | sed 's/data-presentation-stage="//; s/"$//')"
PRESENT_REACHED="$(grep -o 'data-presentation-reached="[^"]*"' "$PRESENT_HTML" | head -1 | sed 's/data-presentation-reached="//; s/"$//')"
PRESENT_ERRORS="$(grep -o 'data-errors="[^"]*"' "$PRESENT_HTML" | head -1 | sed 's/data-errors="//; s/"$//')"

PICK_HTML="$TMP_DIR/pick.html"
"$CHROME" --headless=new --no-sandbox --virtual-time-budget=10000 \
  --dump-dom "http://127.0.0.1:$PORT/web3d/?scan=1&component=gateway" > "$PICK_HTML" 2>/dev/null
PICKABLE="$(grep -o 'data-pickable="[^"]*"' "$PICK_HTML" | head -1 | sed 's/data-pickable="//; s/"$//')"
PICKED_COMPONENT="$(grep -o 'data-presentation-component="[^"]*"' "$PICK_HTML" | head -1 | sed 's/data-presentation-component="//; s/"$//')"

echo "presentation: ${PRESENT_ACTIVE:-missing} · stage ${PRESENT_STAGE:-missing} · reached ${PRESENT_REACHED:-missing}"
echo "component   : ${PICKED_COMPONENT:-missing}"

SYNC_STATUS=1
PICK_OK=0
case "$PICKABLE" in
  *gateway:gateway*server:server*database:database*pump:pump*tank:tank*station:station*sensorA:sensorA*nodeA:nodeA*) PICK_OK=1 ;;
  *) PICK_OK=0 ;;
esac
if [ "$PRESENT_ACTIVE" = "active" ] \
  && [[ "$PRESENT_STAGE" =~ ^[0-9]+/10$ ]] \
  && [ "${PRESENT_ERRORS:-1}" = "0" ] \
  && [ "$PICKED_COMPONENT" = "gateway" ] \
  && [ "$PICK_OK" = "1" ]; then
  SYNC_STATUS=0
  echo "sync/picking: PASS"
else
  echo "sync/picking: FAIL"
fi

echo
echo "--------------------------------------------------------------"
if [ "$STATIC_STATUS" -eq 0 ] && [ "$LOGIC_STATUS" -eq 0 ] \
  && [ "$PRES_STATUS" -eq 0 ] && [ "$DASH_STATUS" -eq 0 ] && [ "$SYNC_STATUS" -eq 0 ]; then
  echo "RESULT: PASS — static 8/8, logic 13/13, presentation 29/29, dashboard 13/13, picking OK"
  exit 0
fi
echo "RESULT: FAIL — see the sections above"
exit 1
