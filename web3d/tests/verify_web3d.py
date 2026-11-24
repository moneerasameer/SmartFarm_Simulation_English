#!/usr/bin/env python3
"""Static verification of the Smart Farm 3D dashboard.

Checks (no browser required):
 1. every local asset referenced by index.html exists;
 2. every ES-module import resolves (including the import-map aliases);
 3. every element id used by the JavaScript exists in index.html;
 4. the CSV dataset parses and the documented control law reproduces the
    recorded ``Pump`` column exactly (same rule as MATLAB / VHDL);
 5. the MATLAB LoRa trace covers the dataset samples;
 6. vendor libraries are present and the airtime formula is sane.

Run:  .venv/bin/python web3d/tests/verify_web3d.py
"""

from __future__ import annotations

import csv
import pathlib
import re
import sys

WEB3D = pathlib.Path(__file__).resolve().parents[1]
PROJECT = WEB3D.parent
HTML = WEB3D / "index.html"
DATA = PROJECT / "data" / "sensor_data.csv"
TRACE = PROJECT / "results" / "lora_link_trace.csv"

RADIO_CONFIG = {
    "frequency_MHz": 868.1,
    "bandwidth_kHz": 125,
    "spreading_factor": 7,
    "coding_rate": 1,
    "preamble_symbols": 8,
    "explicit_header": True,
    "payload_crc": True,
    "payload_bytes": 16,
}

results = []


def check(name: str, passed: bool, detail: str = "") -> None:
    results.append((name, passed, detail))
    print(f"[{'PASS' if passed else 'FAIL'}] {name}" + (f" -> {detail}" if detail else ""))


def parse_csv_rows(path: pathlib.Path):
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        fields = {field.strip().lower(): field for field in reader.fieldnames or []}
        rows = []
        for raw in reader:
            def value(*names):
                for name in names:
                    for key, original in fields.items():
                        if key.startswith(name):
                            return raw[original]
                return None

            def as_float(text):
                try:
                    return float(str(text).strip().replace(",", "."))
                except (TypeError, ValueError):
                    return float("nan")

            received_text = str(value("packet") or "true").strip().lower()
            pump_text = str(value("pump") or "").strip().lower()
            rows.append({
                "sample": int(float(value("sample") or len(rows))),
                "soil": as_float(value("soil")),
                "received": received_text in {"true", "1", "yes", "on", "received"},
                "pump": pump_text in {"on", "true", "1", "yes"} if pump_text else None,
            })
    return rows


def replay_law(rows, dry=30, wet=40):
    """Python port of irrigation_control.m (hold mode)."""
    state = 0
    matches = 0
    compared = 0
    for row in rows:
        valid = row["soil"] == row["soil"] and 0 <= row["soil"] <= 100
        if row["received"] and valid:
            if row["soil"] < dry:
                state = 1
            elif row["soil"] > wet:
                state = 0
        if row["pump"] is not None:
            compared += 1
            if row["pump"] == bool(state):
                matches += 1
    return state, matches, compared


def time_on_air_ms(cfg=RADIO_CONFIG) -> float:
    sf = cfg["spreading_factor"]
    bandwidth = cfg["bandwidth_kHz"] * 1000
    de = 1 if sf >= 11 and cfg["bandwidth_kHz"] == 125 else 0
    symbol_time = (2 ** sf) / bandwidth
    numerator = (
        8 * cfg["payload_bytes"] - 4 * sf + 28
        + 16 * int(cfg["payload_crc"]) - 20 * int(cfg["explicit_header"])
    )
    payload_symbols = 8 + max(0, -(-numerator // (4 * (sf - 2 * de)))) * (cfg["coding_rate"] + 4)
    packet_symbols = cfg["preamble_symbols"] + 4.25 + payload_symbols
    return packet_symbols * symbol_time * 1000


def main() -> int:
    html = HTML.read_text(encoding="utf-8")

    # 1. local assets referenced by the HTML
    missing = []
    for match in re.finditer(r'(?:src|href)="([^"]+)"', html):
        ref = match.group(1)
        if ref.startswith(("http", "#", "mailto:")):
            continue
        target = (WEB3D / ref).resolve()
        if not target.exists():
            missing.append(ref)
    check("HTML assets exist", not missing, ", ".join(missing) or f"{len(html)} bytes scanned")

    # 2. ES module import graph
    import_map = {
        "three": WEB3D / "vendor" / "three.module.js",
        "three/addons/": WEB3D / "vendor" / "addons/",
    }
    unresolved = []
    module_count = 0
    for module in sorted((WEB3D / "js").rglob("*.js")):
        module_count += 1
        text = module.read_text(encoding="utf-8")
        for spec in re.findall(r"from\s+['\"]([^'\"]+)['\"]", text):
            if spec in import_map:
                continue
            if spec.startswith("three/addons/"):
                target = import_map["three/addons/"] / spec.split("three/addons/", 1)[1]
            elif spec.startswith("."):
                target = (module.parent / spec).resolve()
            else:
                unresolved.append(f"{module.name}: {spec}")
                continue
            if not target.exists():
                unresolved.append(f"{module.name}: {spec}")
    check("ES module imports resolve", not unresolved, ", ".join(unresolved) or f"{module_count} modules")

    # 3. DOM ids used by JS must exist in the HTML
    html_ids = set(re.findall(r'id="([^"]+)"', html))
    used_ids = set()
    for module in (WEB3D / "js").rglob("*.js"):
        text = module.read_text(encoding="utf-8")
        used_ids.update(re.findall(r"\$\('([A-Za-z0-9_-]+)'\)", text))
        used_ids.update(re.findall(r"getElementById\('([A-Za-z0-9_-]+)'\)", text))
    phantom = sorted(used_ids - html_ids)
    check("All JS element ids exist", not phantom, ", ".join(phantom) or f"{len(used_ids)} ids")

    # 4. dataset + control law
    rows = parse_csv_rows(DATA)
    _state, matches, compared = replay_law(rows)
    agreement = 100.0 * matches / compared if compared else 0.0
    check("Dataset loaded", len(rows) > 0, f"{len(rows)} rows from {DATA.name}")
    check("Control law reproduces recorded pump", compared > 0 and agreement == 100.0,
          f"{agreement:.2f} % over {compared} frames")

    # 5. LoRa trace coverage
    with TRACE.open(newline="", encoding="utf-8-sig") as handle:
        trace_samples = {int(float(row["sample"])) for row in csv.DictReader(handle)}
    covered = sum(1 for row in rows if row["sample"] in trace_samples)
    check("LoRa link trace covers the dataset", covered == len(rows),
          f"{covered}/{len(rows)} samples in {TRACE.name}")

    # 6. vendor libraries + airtime sanity
    vendor = {
        "three.module.js": WEB3D / "vendor" / "three.module.js",
        "OrbitControls.js": WEB3D / "vendor" / "addons" / "controls" / "OrbitControls.js",
        "chart.umd.js": WEB3D / "vendor" / "chart.umd.js",
        "mqtt.min.js": WEB3D / "vendor" / "mqtt.min.js",
    }
    sizes = {name: path.stat().st_size for name, path in vendor.items() if path.exists()}
    check("Vendor libraries present", len(sizes) == len(vendor),
          ", ".join(f"{name}={size // 1024} KiB" for name, size in sizes.items()))

    toa = time_on_air_ms()
    check("LoRa airtime is physically plausible", 20 < toa < 3000, f"{toa:.2f} ms (SF7/BW125/16 B)")

    passed = sum(1 for _name, ok, _detail in results if ok)
    print(f"\n{passed}/{len(results)} checks passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
