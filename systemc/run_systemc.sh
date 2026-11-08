#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Smart Farm - SystemC build & simulation flow
#
#   ./run_systemc.sh          build and run the simulation, archive the transcript
#   ./run_systemc.sh clean    remove the build directory
#
# SystemC is detected automatically (SYSTEMC_HOME, $HOME/systemc, /usr/local,
# /opt/homebrew, /opt/local). The transcript is copied to
# ../results/systemc_simulation.log as evidence for the report.
#
# Exit codes: 0 = all checks passed, 1 = check failure, 2 = SystemC missing.
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_DIR/results/systemc_simulation.log"

if [ "${1:-}" = "clean" ]; then
    make -C "$SCRIPT_DIR" clean
    exit 0
fi

# --- locate SystemC --------------------------------------------------------
if [ -z "${SYSTEMC_HOME:-}" ]; then
    for candidate in "$HOME/systemc" /usr/local /opt/homebrew /opt/local; do
        if [ -f "$candidate/include/systemc.h" ]; then
            SYSTEMC_HOME="$candidate"
            break
        fi
    done
fi

if [ -z "${SYSTEMC_HOME:-}" ]; then
    echo "ERROR: SystemC not found." >&2
    echo "       Install it (see systemc/README.md) or set SYSTEMC_HOME." >&2
    exit 2
fi
export SYSTEMC_HOME

mkdir -p "$(dirname "$LOG_FILE")"
{
    echo "=============================================================="
    echo " SystemC simulation - Smart Farm monitoring + irrigation"
    echo "=============================================================="
    echo "SystemC home : $SYSTEMC_HOME"
    if [ -f "$SYSTEMC_HOME/include/systemc.h" ]; then
        grep -m1 'SYSTEMC_VERSION_STRING' "$SYSTEMC_HOME/include/sysc/kernel/sc_ver.h" 2>/dev/null || true
    fi
    echo "compiler     : $(command -v clang++ || echo c++)"
    echo "date         : $(date '+%Y-%m-%d %H:%M:%S')"
    echo
} | tee "$LOG_FILE"

echo "--- 1/2 build ---------------------------------------------------"
make -C "$SCRIPT_DIR" 2>&1 | tee -a "$LOG_FILE"

echo "--- 2/2 run -----------------------------------------------------"
set +e
"$SCRIPT_DIR/build/smart_farm" 2>&1 | tee -a "$LOG_FILE"
RUN_STATUS=${PIPESTATUS[0]}
set -e

echo
echo "run exit status: $RUN_STATUS"
echo "transcript     : $LOG_FILE"

if [ "$RUN_STATUS" -ne 0 ]; then
    echo "RESULT: FAILED"
    exit "$RUN_STATUS"
fi
echo "RESULT: PASSED"
