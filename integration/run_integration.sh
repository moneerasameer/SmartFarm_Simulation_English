#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Smart Farm - full system integration run
#
#   ./integration/run_integration.sh
#
# Runs every component in dependency order, then the cross-component checks,
# and writes the whole log to results/integration_report.txt.
#
#   1. CSV schema + consumers + config + golden scenario + data flow  (python)
#   2. MATLAB analysis suite            (reads data/sensor_data.csv)
#   3. MATLAB LoRa link simulation      (reads data/sensor_data.csv)
#   4. MATLAB golden replay             (integration cross-check)
#   5. Python dashboard test suite      (reads data/sensor_data.csv)
#   6. VHDL + GHDL self-checking testbench
#   7. SystemC simulation
#   8. cross-component integration check (parses the transcripts of 2-7)
#
# Exit code: 0 only if every step succeeded.
# ---------------------------------------------------------------------------
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$(dirname "$SCRIPT_DIR")"
LOG="$PROJECT/results/integration_report.txt"
MATLAB="/Applications/MATLAB_R2025a.app/bin/matlab"
PYTHON="$PROJECT/.venv/bin/python"

mkdir -p "$PROJECT/results"
: > "$LOG"

step=0
failures=0
declare -a names=()
declare -a statuses=()

run_step() {
    local name="$1"; shift
    step=$((step + 1))
    {
        echo
        echo "=============================================================="
        echo " STEP $step  $name"
        echo "=============================================================="
        echo "\$ $*"
        echo
    } | tee -a "$LOG"

    "$@" >>"$LOG" 2>&1
    local status=$?

    names+=("$name")
    if [ "$status" -eq 0 ]; then
        statuses+=("PASS")
        echo "STEP $step RESULT: PASS" | tee -a "$LOG"
    else
        statuses+=("FAIL(exit $status)")
        failures=$((failures + 1))
        echo "STEP $step RESULT: FAIL (exit $status)" | tee -a "$LOG"
    fi
}

{
    echo "=============================================================="
    echo " SMART FARM - SYSTEM INTEGRATION RUN"
    echo "=============================================================="
    echo "project : $PROJECT"
    echo "date    : $(date '+%Y-%m-%d %H:%M:%S')"
    echo "host    : $(uname -m), macOS $(sw_vers -productVersion)"
    echo "matlab  : $([ -x "$MATLAB" ] && "$MATLAB" -batch "disp(version)" 2>/dev/null | tail -1 || echo 'not found')"
    echo "python  : $([ -x "$PYTHON" ] && "$PYTHON" --version 2>&1 || echo 'not found')"
    echo "ghdl    : $(command -v ghdl >/dev/null && ghdl --version | head -1 || echo 'not found')"
    echo "systemc : $([ -f "$HOME/systemc/include/systemc.h" ] && echo "$HOME/systemc" || echo 'not found')"
} | tee -a "$LOG"

# --- 1. dataset / configuration / data-flow checks -------------------------
run_step "dataset, configuration and data-flow checks" \
    python3 "$SCRIPT_DIR/integration_check.py"

# --- 2. MATLAB analysis (CSV -> results/) ---------------------------------
if [ -x "$MATLAB" ]; then
    run_step "MATLAB analysis suite (data/sensor_data.csv -> results/)" \
        "$MATLAB" -batch "run('$PROJECT/matlab/smart_farm_complete.m')"

    # --- 3. MATLAB LoRa link simulation -----------------------------------
    run_step "MATLAB LoRa link simulation" \
        "$MATLAB" -batch "run('$PROJECT/matlab/lora_link_simulation.m')"

    # --- 4. MATLAB golden replay (integration stimulus) -------------------
    run_step "MATLAB golden replay (integration/golden_scenario.csv)" \
        "$MATLAB" -batch "run('$PROJECT/integration/golden_replay.m')"
else
    echo "SKIP MATLAB steps: $MATLAB not found" | tee -a "$LOG"
fi

# --- 5. Python dashboard test suite ---------------------------------------
if [ -x "$PYTHON" ]; then
    run_step "Python dashboard test suite" \
        "$PYTHON" "$PROJECT/python_dashboard/tests/run_tests.py"
else
    echo "SKIP dashboard step: $PYTHON not found" | tee -a "$LOG"
fi

# --- 6. VHDL + GHDL -------------------------------------------------------
run_step "VHDL self-checking testbench (GHDL)" \
    "$PROJECT/vhdl/run_ghdl.sh"

# --- 7. SystemC -----------------------------------------------------------
run_step "SystemC simulation" \
    "$PROJECT/systemc/run_systemc.sh"

# --- 8. cross-component check (uses the transcripts from steps 2-7) -------
run_step "cross-component integration check (transcripts)" \
    python3 "$SCRIPT_DIR/integration_check.py"

# --- summary --------------------------------------------------------------
{
    echo
    echo "=============================================================="
    echo " INTEGRATION SUMMARY"
    echo "=============================================================="
    for i in "${!names[@]}"; do
        printf '%-6s %s\n' "${statuses[$i]}" "${names[$i]}"
    done
    echo "--------------------------------------------------------------"
    if [ "$failures" -eq 0 ]; then
        echo "ALL ${#names[@]} STEPS PASSED"
    else
        echo "$failures of ${#names[@]} STEPS FAILED"
    fi
    echo "log: $LOG"
} | tee -a "$LOG"

[ "$failures" -eq 0 ] || exit 1
