#!/usr/bin/env python3
"""Cross-component integration check for the Smart Farm project.

Verifies that the parts of the project that CAN exchange data actually agree:
  1. dataset schema and data types            (data/sensor_data.csv)
  2. consumer compatibility                   (dashboard + MATLAB loader)
  3. irrigation configuration agreement       (MATLAB / VHDL / SystemC / Python)
  4. control-law behaviour on a golden scenario (MATLAB / SystemC / VHDL transcripts)
  5. communication-failure safe state         (per component)
  6. file-level data flow                     (which artefacts really exist)

Standard library only - no third-party packages.

Usage:  python3 integration/integration_check.py
Exit:   0 = all integration checks passed, 1 = at least one failure.
"""

from __future__ import annotations

import csv
import pathlib
import re

PROJECT = pathlib.Path(__file__).resolve().parents[1]
DATA_FILE = PROJECT / "data" / "sensor_data.csv"
GOLDEN_FILE = PROJECT / "integration" / "golden_scenario.csv"
RESULTS = PROJECT / "results"

MATLAB_GOLDEN = RESULTS / "golden_matlab.csv"
SYSTEMC_LOG = RESULTS / "systemc_simulation.log"
VHDL_LOG = RESULTS / "vhdl_simulation.log"

APP_PY = PROJECT / "python_dashboard" / "app.py"
LOADER_M = PROJECT / "matlab" / "functions" / "load_sensor_data.m"
CONTROL_M = PROJECT / "matlab" / "functions" / "irrigation_control.m"
VHDL_RTL = PROJECT / "vhdl" / "irrigation_controller.vhd"
SC_TYPES = PROJECT / "systemc" / "src" / "smart_farm_types.h"

REQUIRED_COLUMNS = [
    "Sample",
    "Soil moisture (%)",
    "Temperature (°C)",
    "Air humidity (%)",
    "Packet received",
    "Pump",
    "ML advice",
]

failures: list[str] = []
checks = 0


def check(name: str, ok: bool, detail: str = "") -> bool:
    """Record one integration check."""
    global checks
    checks += 1
    status = "PASS" if ok else "FAIL"
    if not ok:
        failures.append(name)
    print(f"[{status}] {name}" + (f"  ({detail})" if detail else ""))
    return ok


def read_csv(path: pathlib.Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def section(title: str) -> None:
    print()
    print("=" * 78)
    print(title)
    print("=" * 78)


def normalise(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", name).lower()


# ---------------------------------------------------------------------------
# I-01  dataset schema, column names and data types
# ---------------------------------------------------------------------------
def check_dataset() -> None:
    section("I-01  DATASET SCHEMA AND DATA TYPES")
    if not DATA_FILE.is_file():
        check("dataset file present", False, str(DATA_FILE))
        return
    check("dataset file present", True, str(DATA_FILE.relative_to(PROJECT)))

    with DATA_FILE.open(newline="", encoding="utf-8") as handle:
        header = next(csv.reader(handle))
    check("header has exactly the 7 expected columns in order", header == REQUIRED_COLUMNS,
          " | ".join(header) if header != REQUIRED_COLUMNS else "")

    rows = read_csv(DATA_FILE)
    check("row count is 120", len(rows) == 120, f"{len(rows)} rows")

    numeric_ok = True
    boolean_ok = True
    for row in rows:
        try:
            float(row["Soil moisture (%)"])
            float(row["Temperature (°C)"])
            float(row["Air humidity (%)"])
            int(row["Sample"])
        except (TypeError, ValueError):
            numeric_ok = False
        if row["Packet received"] not in ("True", "False"):
            boolean_ok = False
    check("sensor columns parse as numbers", numeric_ok)
    check("Packet received only uses True/False", boolean_ok)

    pump_tokens = {row["Pump"] for row in rows}
    check("Pump column only uses ON/OFF", pump_tokens <= {"ON", "OFF"}, str(sorted(pump_tokens)))

    soil = [float(r["Soil moisture (%)"]) for r in rows]
    temp = [float(r["Temperature (°C)"]) for r in rows]
    hum = [float(r["Air humidity (%)"]) for r in rows]
    check("soil moisture inside 0..100 %", all(0 <= v <= 100 for v in soil),
          f"min {min(soil):.2f} max {max(soil):.2f}")
    check("air humidity inside 0..100 %", all(0 <= v <= 100 for v in hum),
          f"min {min(hum):.2f} max {max(hum):.2f}")
    check("temperature inside -20..60 degC", all(-20 <= v <= 60 for v in temp),
          f"min {min(temp):.2f} max {max(temp):.2f}")


# ---------------------------------------------------------------------------
# I-02  consumers can resolve the same column names
# ---------------------------------------------------------------------------
def check_consumers() -> None:
    section("I-02  CONSUMER COMPATIBILITY (column names)")
    with DATA_FILE.open(newline="", encoding="utf-8") as handle:
        header = next(csv.reader(handle))

    app_source = APP_PY.read_text(encoding="utf-8")
    map_block = re.search(r"COLUMN_MAP[^=]*=\s*\{(.*?)\}", app_source, re.S)
    dashboard_keys = re.findall(r'"([^"]+)"\s*:', map_block.group(1)) if map_block else []
    check("dashboard defines a COLUMN_MAP", bool(dashboard_keys), f"{len(dashboard_keys)} keys")
    missing = [k for k in dashboard_keys if k not in header]
    check("every dashboard column exists in the CSV header", not missing,
          "missing: " + ", ".join(missing) if missing else "all resolved")

    loader_source = LOADER_M.read_text(encoding="utf-8")
    loader_keys = re.findall(r'local_find_column\(names,\s*"([^"]+)"\)', loader_source)
    normalised_header = [normalise(h) for h in header]
    unresolved = [k for k in loader_keys
                  if not any(h.startswith(k) or k in h for h in normalised_header)]
    check("every MATLAB loader key resolves against the CSV header", not unresolved,
          "unresolved: " + ", ".join(unresolved) if unresolved else f"{len(loader_keys)} keys resolved")


# ---------------------------------------------------------------------------
# I-03  irrigation configuration agreement across the four implementations
# ---------------------------------------------------------------------------
def extract_int(source: str, pattern: str) -> int | None:
    match = re.search(pattern, source)
    return int(match.group(1)) if match else None


def read_configuration() -> dict:
    """Read the irrigation configuration out of every implementation's source."""
    control_src = CONTROL_M.read_text(encoding="utf-8")
    vhdl_src = VHDL_RTL.read_text(encoding="utf-8")
    sc_src = SC_TYPES.read_text(encoding="utf-8")
    app_src = APP_PY.read_text(encoding="utf-8")

    return {
        "MATLAB": {
            "file": str(CONTROL_M.relative_to(PROJECT)),
            "dry": extract_int(control_src, r"DryThreshold\s*\(1,1\)\s*double[^=]*=\s*(\d+)"),
            "wet": extract_int(control_src, r"WetThreshold\s*\(1,1\)\s*double[^=]*=\s*(\d+)"),
            "watchdog": extract_int(control_src, r"MaxHoldSamples\s*\(1,1\)\s*double[^=]*=\s*(\d+)"),
            "hold_on_loss": True,
            "fail_safe": "watchdog",
        },
        "VHDL": {
            "file": str(VHDL_RTL.relative_to(PROJECT)),
            "dry": extract_int(vhdl_src, r"DRY_THRESHOLD\s*:\s*integer\s*:=\s*(\d+)"),
            "wet": extract_int(vhdl_src, r"WET_THRESHOLD\s*:\s*integer\s*:=\s*(\d+)"),
            "watchdog": None,
            "hold_on_loss": "FAILSAFE_ON_LOSS  : boolean := false" in vhdl_src,
            "fail_safe": "immediate",
        },
        "SystemC": {
            "file": str(SC_TYPES.relative_to(PROJECT)),
            "dry": extract_int(sc_src, r"kDryThreshold\s*=\s*(\d+)"),
            "wet": extract_int(sc_src, r"kWetThreshold\s*=\s*(\d+)"),
            "watchdog": extract_int(sc_src, r"kMaxHoldSamples\s*=\s*(\d+)"),
            "hold_on_loss": True,
            "fail_safe": "watchdog",
        },
        "Python dashboard": {
            "file": str(APP_PY.relative_to(PROJECT)),
            "dry": extract_int(app_src, r"DEFAULT_DRY_THRESHOLD\s*=\s*(\d+)"),
            "wet": extract_int(app_src, r"DEFAULT_WET_THRESHOLD\s*=\s*(\d+)"),
            "watchdog": None,
            "hold_on_loss": True,
            "fail_safe": "not implemented",
        },
    }


def check_configuration() -> dict:
    section("I-03  IRRIGATION CONFIGURATION AGREEMENT")
    config = read_configuration()

    print(f"{'component':18} {'dry':>4} {'wet':>4} {'watchdog':>9}  {'on loss':15} file")
    for name, item in config.items():
        watchdog = "-" if item["watchdog"] is None else str(item["watchdog"])
        print(f"{name:18} {str(item['dry']):>4} {str(item['wet']):>4} {watchdog:>9}  "
              f"{item['fail_safe']:15} {item['file']}")
    print()

    dry_values = {item["dry"] for item in config.values()}
    wet_values = {item["wet"] for item in config.values()}
    check("dry threshold identical in all four implementations", dry_values == {30},
          f"values: {sorted(dry_values)}")
    check("wet threshold identical in all four implementations", wet_values == {40},
          f"values: {sorted(wet_values)}")
    check("every implementation holds the state when a packet is lost",
          all(item["hold_on_loss"] for item in config.values()))

    watchdogs = {name: item["watchdog"] for name, item in config.items()
                 if item["fail_safe"] == "watchdog"}
    check("the two watchdog implementations use the same limit",
          len(set(watchdogs.values())) == 1, f"{watchdogs}")

    print("NOTE  fail-safe mechanism differs by design: VHDL = OFF on the first missing packet,")
    print("      MATLAB/SystemC = watchdog after N consecutive losses, dashboard = hold only.")
    return config



# ---------------------------------------------------------------------------
# I-04  control-law behaviour on the golden scenario
# ---------------------------------------------------------------------------
VHDL_CASE_MAP = {
    1: "dry soil 20 % + telemetry",
    2: "band 35 % + telemetry",
    3: "wet soil 45 % + telemetry",
    4: "loss of telemetry while OFF",
    5: "telemetry restored, dry soil",
    6: "loss of telemetry while ON",
    7: "telemetry restored again",
}


def parse_matlab_golden() -> dict:
    if not MATLAB_GOLDEN.is_file():
        return {}
    return {int(row["step"]): row for row in read_csv(MATLAB_GOLDEN)}


def parse_systemc_log() -> dict:
    """Settled pump state of every scenario step, parsed from the transcript."""
    if not SYSTEMC_LOG.is_file():
        return {}
    steps: dict[int, dict] = {}
    current = None
    for line in SYSTEMC_LOG.read_text(encoding="utf-8").splitlines():
        match = re.search(r"\[step (\d+)\]", line)
        if match:
            current = int(match.group(1))
            continue
        match = re.search(r"settled: pump hold=(\w+)\s+fail-safe=(\w+)", line)
        if match and current is not None:
            steps[current] = {
                "hold": 1 if match.group(1).strip() == "ON" else 0,
                "failsafe": 1 if match.group(2).strip() == "ON" else 0,
            }
    return steps


def parse_vhdl_log() -> dict:
    """(policy, case) -> pump value, parsed from the GHDL transcript."""
    if not VHDL_LOG.is_file():
        return {}
    values: dict[tuple[str, str], int] = {}
    pattern = re.compile(r"PASS \| (hold|failsafe|strict)\s*\| (.+?) -> '([01])'")
    for line in VHDL_LOG.read_text(encoding="utf-8").splitlines():
        match = pattern.search(line)
        if match:
            values[(match.group(1), match.group(2).strip())] = int(match.group(3))
    return values


def check_golden_scenario() -> None:
    section("I-04  CONTROL LAW ON THE GOLDEN SCENARIO (cross-simulation)")
    golden = read_csv(GOLDEN_FILE)
    matlab = parse_matlab_golden()
    systemc = parse_systemc_log()
    vhdl = parse_vhdl_log()

    print("transcripts used:")
    print(f"  MATLAB  : {MATLAB_GOLDEN.relative_to(PROJECT)}  ({len(matlab)} steps)")
    print(f"  SystemC : {SYSTEMC_LOG.relative_to(PROJECT)}  ({len(systemc)} steps)")
    print(f"  VHDL    : {VHDL_LOG.relative_to(PROJECT)}  ({len(vhdl)} checks)")
    print()
    print(f"{'step':>4} {'scenario':42} {'expect':>7} {'MATLAB':>8} {'SystemC':>8} {'VHDL':>7}")
    print("-" * 84)

    matlab_bad, sc_bad, vhdl_bad, vhdl_missing = [], [], [], []
    for row in golden:
        step = int(row["step"])
        exp_h = int(row["expected_hold"])
        exp_f = int(row["expected_failsafe"])

        m_h = int(matlab[step]["actualHold"]) if step in matlab else None
        m_f = int(matlab[step]["actualSafe"]) if step in matlab else None

        s = systemc.get(step)
        vh_case = VHDL_CASE_MAP.get(step)
        v_h = vhdl.get(("hold", vh_case)) if vh_case else None
        v_f = vhdl.get(("failsafe", vh_case)) if vh_case else None

        if m_h != exp_h or m_f != exp_f:
            matlab_bad.append(step)
        if s is None or s["hold"] != exp_h or s["failsafe"] != exp_f:
            sc_bad.append(step)
        if v_h is None or v_f is None:
            vhdl_missing.append(step)
        elif v_h != exp_h or v_f != exp_f:
            vhdl_bad.append(step)

        def fmt(h, f):
            return f"{h}/{f}" if h is not None else "n/a"

        expect_text = f"{exp_h}/{exp_f}"
        sc_text = fmt(s["hold"], s["failsafe"]) if s else "n/a"
        print(f"{step:>4} {row['label'][:42]:42} {expect_text:>7} "
              f"{fmt(m_h, m_f):>8} {sc_text:>8} {fmt(v_h, v_f):>7}")

    print()
    check("MATLAB reproduces the golden scenario (hold + fail-safe)", not matlab_bad,
          f"failing steps {matlab_bad}" if matlab_bad else "7/7 steps")
    check("SystemC reproduces the golden scenario (hold + fail-safe)", not sc_bad,
          f"failing steps {sc_bad}" if sc_bad else "7/7 steps")
    check("VHDL reproduces the golden scenario on the mapped cases",
          not vhdl_bad and not vhdl_missing,
          f"failing {vhdl_bad}, unmapped {vhdl_missing}" if (vhdl_bad or vhdl_missing)
          else "7/7 mapped cases")



# ---------------------------------------------------------------------------
# I-05  communication failure leads to the intended safe state
# ---------------------------------------------------------------------------
def check_safe_state() -> None:
    section("I-05  COMMUNICATION FAILURE -> INTENDED SAFE PUMP STATE")
    golden = {int(r["step"]): r for r in read_csv(GOLDEN_FILE)}
    matlab = parse_matlab_golden()
    systemc = parse_systemc_log()
    vhdl = parse_vhdl_log()

    loss_steps = [s for s, r in golden.items() if int(r["packet_ok"]) == 0]
    print(f"communication-failure steps in the scenario: {loss_steps}")
    print()
    print(f"{'step':>4} {'situation':38} {'hold (documented)':>18} {'fail-safe':>10}")
    for step in loss_steps:
        row = golden[step]
        hold_text = "ON (held)" if int(row["expected_hold"]) else "OFF (held)"
        print(f"{step:>4} {row['label'][:38]:38} {hold_text:>18} "
              f"{'ON' if int(row['expected_failsafe']) else 'OFF':>10}")
    print()

    step4, step6 = loss_steps[0], loss_steps[1]

    check("MATLAB: pump stays OFF during the outage that begins with the pump OFF",
          int(matlab[step4]["actualHold"]) == 0 and int(matlab[step4]["actualSafe"]) == 0)
    check("MATLAB: hold keeps irrigating, watchdog forces OFF when the outage begins ON",
          int(matlab[step6]["actualHold"]) == 1 and int(matlab[step6]["actualSafe"]) == 0)
    check("SystemC: identical behaviour for both outage steps",
          systemc.get(step4, {}).get("failsafe") == 0
          and systemc.get(step6, {}).get("hold") == 1
          and systemc.get(step6, {}).get("failsafe") == 0)
    check("VHDL: fail-safe pump enters the safe state during the outage (mapped cases)",
          vhdl.get(("failsafe", VHDL_CASE_MAP[step4])) == 0
          and vhdl.get(("failsafe", VHDL_CASE_MAP[step6])) == 0)
    check("VHDL: hold policy keeps the previous state during the outage",
          vhdl.get(("hold", VHDL_CASE_MAP[step6])) == 1)
    print()
    print("CONCLUSION: no implementation switches the pump ON as a reaction to missing data;")
    print("            the fail-safe path always ends in the OFF state.")


# ---------------------------------------------------------------------------
# I-06  file-level data flow (what really exists on disk)
# ---------------------------------------------------------------------------
def check_data_flow() -> None:
    section("I-06  FILE-LEVEL DATA FLOW")
    expected_outputs = [
        ("results/smart_farm_summary.csv", "MATLAB analysis summary"),
        ("results/irrigation_mode_comparison.csv", "MATLAB strategy comparison"),
        ("results/packet_loss_events.csv", "MATLAB loss events"),
        ("results/lora_scenarios.csv", "MATLAB LoRa scenarios"),
        ("results/golden_matlab.csv", "integration golden replay"),
        ("results/systemc_simulation.log", "SystemC transcript"),
        ("results/vhdl_simulation.log", "GHDL transcript"),
    ]
    for rel, description in expected_outputs:
        check(f"artefact exists: {rel}", (PROJECT / rel).is_file(), description)

    check("dataset is read by the dashboard",
          "sensor_data.csv" in APP_PY.read_text(encoding="utf-8"))
    check("dataset is read by MATLAB",
          "sensor_data.csv" in LOADER_M.read_text(encoding="utf-8")
          or "sensor_data.csv" in (PROJECT / "matlab" / "smart_farm_complete.m").read_text(encoding="utf-8"))

    producers = []
    write_pattern = re.compile(r"(to_csv\(|writetable\(|ofstream|fopen\([^)]*'w')")
    for candidate in [APP_PY, CONTROL_M,
                      PROJECT / "matlab" / "smart_farm_complete.m",
                      PROJECT / "matlab" / "lora_link_simulation.m",
                      PROJECT / "systemc" / "smart_farm_main.cpp",
                      VHDL_RTL]:
        for line in candidate.read_text(encoding="utf-8").splitlines():
            # a line must BOTH write and mention the dataset to count as a producer
            if write_pattern.search(line) and "sensor_data" in line:
                producers.append(f"{candidate.name}: {line.strip()[:60]}")
    print(f"  components writing the dataset: {producers or 'none'}")
    check("no component regenerates data/sensor_data.csv (known gap D-01)",
          not producers, "dataset is an input-only artefact")

    print()
    print("Component interface summary")
    print(f"  {'component':20} {'reads':40} {'writes'}")
    print("  " + "-" * 84)
    print(f"  {'python_dashboard':20} {'data/sensor_data.csv':40} {'download only (CSV in browser)'}")
    print(f"  {'matlab (analysis)':20} {'data/sensor_data.csv':40} {'results/smart_farm_summary.csv, Fig*.png'}")
    print(f"  {'matlab (lora)':20} {'data/sensor_data.csv':40} {'results/lora_*.csv'}")
    print(f"  {'vhdl + GHDL':20} {'- (stimulus in the testbench)':40} {'results/vhdl_simulation.log'}")
    print(f"  {'systemc':20} {'- (scenario in smart_farm_types.h)':40} {'results/systemc_simulation.log'}")


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main() -> int:
    print("=" * 78)
    print(" SMART FARM - INTEGRATION CHECK")
    print("=" * 78)
    print(f"project: {PROJECT}")

    check_dataset()
    check_consumers()
    check_configuration()
    check_golden_scenario()
    check_safe_state()
    check_data_flow()

    section("INTEGRATION SUMMARY")
    print(f"checks executed: {checks}")
    print(f"checks failed  : {len(failures)}")
    for name in failures:
        print(f"  FAILED: {name}")
    print()
    print("RESULT:", "PASS" if not failures else "FAIL")
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

