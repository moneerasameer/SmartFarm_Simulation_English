#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Smart Farm - GHDL build & simulation flow for the irrigation controller
#
#   ./run_ghdl.sh            analyze, elaborate, run the self-checking testbench
#   ./run_ghdl.sh clean      remove the build directory
#
# Everything is compiled with VHDL-2008 into ./build, so the source directory
# stays clean (build/ is git-ignored). The simulation transcript is copied to
# ../results/vhdl_simulation.log as evidence for the report.
#
# Exit codes: 0 = all checks passed, non-zero = at least one failure.
# ---------------------------------------------------------------------------
set -euo pipefail

# GHDL executable: override with GHDL=/path/to/ghdl ./run_ghdl.sh
GHDL="${GHDL:-$HOME/ghdl/ghdl-llvm-5.1.1-macos13-x86_64/bin/ghdl}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
WORK_DIR="$SCRIPT_DIR/build"
LOG_FILE="$PROJECT_DIR/results/vhdl_simulation.log"
STD="--std=08"

if [ "${1:-}" = "clean" ]; then
    rm -rf "$WORK_DIR"
    echo "removed $WORK_DIR"
    exit 0
fi

if [ ! -x "$GHDL" ]; then
    echo "ERROR: GHDL not found at $GHDL" >&2
    echo "       set GHDL=/path/to/ghdl and retry" >&2
    exit 2
fi

mkdir -p "$WORK_DIR" "$(dirname "$LOG_FILE")"

{
    echo "=============================================================="
    echo " GHDL simulation - irrigation_controller"
    echo "=============================================================="
    echo "ghdl      : $("$GHDL" --version | head -1)"
    echo "standard  : VHDL-2008 ($STD)"
    echo "sources   : vhdl/irrigation_controller.vhd"
    echo "            vhdl/irrigation_controller_tb.vhd"
    echo "workdir   : $WORK_DIR"
    echo "date      : $(date '+%Y-%m-%d %H:%M:%S')"
    echo
} | tee "$LOG_FILE"

echo "--- 1/4 analyze -------------------------------------------------"
"$GHDL" -a "$STD" --workdir="$WORK_DIR" \
    "$SCRIPT_DIR/irrigation_controller.vhd" \
    "$SCRIPT_DIR/irrigation_controller_tb.vhd" 2>&1 | tee -a "$LOG_FILE"
echo "analyze: OK"

echo "--- 2/4 elaborate design with default generics -------------------"
"$GHDL" -e "$STD" --workdir="$WORK_DIR" -o "$WORK_DIR/irrigation_controller" \
    irrigation_controller 2>&1 | tee -a "$LOG_FILE"
echo "elaborate (DUT, defaults): OK"

echo "--- 3/4 elaborate testbench --------------------------------------"
"$GHDL" -e "$STD" --workdir="$WORK_DIR" -o "$WORK_DIR/irrigation_controller_tb" \
    irrigation_controller_tb 2>&1 | tee -a "$LOG_FILE"
echo "elaborate (testbench): OK"

echo "--- 4/4 run (self-checking, stops by itself) ---------------------"
set +e
"$WORK_DIR/irrigation_controller_tb" --stop-time=10us \
    --vcd="$WORK_DIR/irrigation_controller_tb.vcd" 2>&1 | tee -a "$LOG_FILE"
RUN_STATUS=$?
set -e

echo
echo "run exit status: $RUN_STATUS"
echo "waveform       : $WORK_DIR/irrigation_controller_tb.vcd"
echo "transcript     : $LOG_FILE"

if [ "$RUN_STATUS" -ne 0 ]; then
    echo "RESULT: FAILED"
    exit "$RUN_STATUS"
fi
echo "RESULT: PASSED"
