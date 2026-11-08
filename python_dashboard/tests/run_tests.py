"""Self-checking test suite for the Smart Farm Streamlit dashboard.

Runs with the project virtual environment only (streamlit + pandas), no pytest:

    .venv/bin/python python_dashboard/tests/run_tests.py

Each test drives the real app through ``streamlit.testing.v1.AppTest`` and
asserts on the rendered elements, so the checks are reproducible and do not
depend on a browser.
"""

from __future__ import annotations

import pathlib
import shutil
import sys
import tempfile

import pandas as pd
from streamlit.testing.v1 import AppTest

APP_DIR = pathlib.Path(__file__).resolve().parents[1]
APP_FILE = APP_DIR / "app.py"
DATA_FILE = APP_DIR.parent / "data" / "sensor_data.csv"

RESULTS = []


def check(name: str, passed: bool, detail: str = "") -> None:
    RESULTS.append((name, passed, detail))
    print(f"[{'PASS' if passed else 'FAIL'}] {name}" + (f" -> {detail}" if detail else ""))


def make_project(tmp: pathlib.Path, csv_text: str | None) -> pathlib.Path:
    """Create a throw-away project skeleton with the app and an optional CSV."""
    (tmp / "python_dashboard").mkdir(parents=True)
    shutil.copy(APP_FILE, tmp / "python_dashboard" / "app.py")
    if csv_text is not None:
        (tmp / "data").mkdir()
        (tmp / "data" / "sensor_data.csv").write_text(csv_text, encoding="utf-8")
    return tmp / "python_dashboard" / "app.py"


def metrics_of(app: AppTest) -> dict:
    return {metric.label: metric.value for metric in app.metric}


def test_happy_path() -> None:
    app = AppTest.from_file(str(APP_FILE), default_timeout=180).run()
    metrics = metrics_of(app)
    expected_rows = len(pd.read_csv(DATA_FILE))
    csv_pump_on = int((pd.read_csv(DATA_FILE)["Pump"].str.upper() == "ON").sum())
    csv_received = int(pd.read_csv(DATA_FILE)["Packet received"].astype(bool).sum())

    check("dataset loads without exception", not list(app.exception), str(list(app.exception))[:120])
    check(
        "all CSV rows are displayed",
        metrics.get("Samples analysed") == str(expected_rows),
        f"{metrics.get('Samples analysed')} of {expected_rows}",
    )
    check(
        "packet counters come from the CSV",
        metrics.get("Packets received") == str(csv_received)
        and metrics.get("Packets lost") == str(expected_rows - csv_received),
        f"received={metrics.get('Packets received')} lost={metrics.get('Packets lost')}",
    )
    check(
        "pump state comes from the CSV",
        metrics.get("Pump ON - recorded") == f"{csv_pump_on} sample(s)",
        f"{metrics.get('Pump ON - recorded')} vs CSV {csv_pump_on}",
    )
    check(
        "replayed control law matches the recorded pump",
        metrics.get("Control-law agreement") == "100.0 %",
        str(metrics.get("Control-law agreement")),
    )
    check("six dashboard tabs", len(app.tabs) == 6, str(len(app.tabs)))
    check("seven charts rendered", len(app.get("plotly_chart")) == 7, str(len(app.get("plotly_chart"))))
    check("five tables rendered", len(app.dataframe) == 5, str(len(app.dataframe)))
    check("no critical alerts on clean data", len(app.error) == 0, str(len(app.error)))


def test_threshold_interaction() -> None:
    app = AppTest.from_file(str(APP_FILE), default_timeout=180).run()
    before = metrics_of(app).get("Pump ON - documented law")
    app.slider[0].set_value(50)
    app.slider[1].set_value(60)
    app.run()
    after = metrics_of(app).get("Pump ON - documented law")
    check(
        "changing thresholds recomputes the control law",
        not list(app.exception) and before != after,
        f"{before} -> {after}",
    )


def test_missing_dataset() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        app_file = make_project(pathlib.Path(tmp), None)
        app = AppTest.from_file(str(app_file), default_timeout=120).run()
        detail = " ".join(code.value for code in app.code)
        check(
            "missing CSV is reported, not crashed",
            not list(app.exception) and len(app.error) == 1 and "sensor_data.csv" in detail,
            detail.splitlines()[0][:120] if detail else "no detail",
        )


def test_missing_columns() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        app_file = make_project(pathlib.Path(tmp), "Sample,Moisture\n0,10\n")
        app = AppTest.from_file(str(app_file), default_timeout=120).run()
        detail = " ".join(code.value for code in app.code)
        check(
            "wrong CSV header is reported with the missing columns",
            not list(app.exception) and "Soil moisture (%)" in detail,
            detail.replace("\n", " ")[:120],
        )


def test_dirty_values() -> None:
    frame = pd.read_csv(DATA_FILE)
    frame["Soil moisture (%)"] = frame["Soil moisture (%)"].astype(object)
    frame.loc[5, "Soil moisture (%)"] = "ERR_SENSOR"
    frame.loc[7, "Air humidity (%)"] = 165.0
    frame.loc[9, "Pump"] = "MAYBE"
    frame = pd.concat([frame, frame.iloc[[10]]], ignore_index=True)
    with tempfile.TemporaryDirectory() as tmp:
        app_file = make_project(pathlib.Path(tmp), frame.to_csv(index=False))
        app = AppTest.from_file(str(app_file), default_timeout=120).run()
        checks = app.dataframe[3].value
        flagged = int((checks["Status"] != "OK").sum())
        check(
            "dirty dataset is flagged in the data-quality tab",
            not list(app.exception) and flagged >= 4,
            f"{flagged} checks flagged",
        )


def main() -> int:
    print(f"Dashboard: {APP_FILE}")
    print(f"Dataset  : {DATA_FILE}\n")
    test_happy_path()
    test_threshold_interaction()
    test_missing_dataset()
    test_missing_columns()
    test_dirty_values()

    failed = [name for name, passed, _ in RESULTS if not passed]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} checks passed")
    if failed:
        print("Failed checks: " + ", ".join(failed))
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
