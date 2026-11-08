# MATLAB RESULTS — Smart Farm Simulation

**Project:** Smart Farm Monitoring and Automated Irrigation System (IoT / LoRa simulation)
**Folder analysed:** `matlab/`
**Environment used:** MATLAB **R2025a Update 1** (25.1.0.2973910), macOS Intel
**Run date:** 2026-11-08
**Nature of the work:** software simulation only — **no physical pump, sensor node or LoRa radio is involved.**
Every actuator command shown here is a software variable.

---

## 1. Simulation objectives

| # | Objective | Where it is implemented |
|---|---|---|
| 1 | Load the **recorded** dataset (`data/sensor_data.csv`) and validate it | `functions/load_sensor_data.m` |
| 2 | Visualise soil moisture, air temperature and air humidity | `Fig1`–`Fig3` |
| 3 | Compute the average of each sensor quantity | section 3 of `smart_farm_complete.m` |
| 4 | Replay the **automatic irrigation control law** (hysteresis 30 % / 40 %) | `functions/irrigation_control.m` |
| 5 | Visualise the pump ON/OFF command | `Fig4`, `Fig7` |
| 6 | Analyse the **simulated LoRa link**: reception, PDR, PLR, outages | `functions/packet_statistics.m`, `Fig5`, `Fig6` |
| 7 | Handle **communication failure** (lost packets) correctly | `irrigation_control.m` (`hold` / `failSafe`) |
| 8 | Compare **normal** with **safe** irrigation | `Fig7`, `Fig8`, `irrigation_mode_comparison.csv` |
| 9 | Prove the numbers instead of asserting them | 22 self-checks, section 6 of `smart_farm_complete.m` |

---

## 2. How to run

```bash
# headless (reproduces exactly the results below)
/Applications/MATLAB_R2025a.app/bin/matlab -batch \
  "run('/Users/gtx-z/Downloads/SmartFarm_Simulation_English/matlab/smart_farm_complete.m')"
```

Or interactively in MATLAB: open `matlab/smart_farm_complete.m` and press **Run**.

The scripts resolve their paths from `mfilename('fullpath')`, so they work **from any current folder**
(verified by running them with the MATLAB working directory set to `/tmp`).
The deprecated `matlab/smarf.m` still works: it now simply calls the maintained script.

**Requirements:** MATLAB R2020a or newer (`arguments` blocks, `tiledlayout`, `exportgraphics`).
No toolboxes are required (no Simulink, no Communications Toolbox, no Signal Processing Toolbox).

---

## 3. Folder structure after the reorganisation

```
matlab/
├── smart_farm_complete.m          MAIN entry point (load → analyse → control → verify → plot → export)
├── smart_farm_simulation.m        standalone synthetic demo (independent of the CSV, "what-if" variant)
├── smarf.m                        deprecated wrapper → smart_farm_complete.m
├── Figure_1.png                   legacy artefact from an older script (superseded, see §9)
└── functions/
    ├── load_sensor_data.m           CSV import + validation (column matching, True/False parsing)
    ├── parse_boolean_column.m       "True"/"False" text (or 0/1, or logical) → logical
    ├── irrigation_control.m         documented control law, 3 strategies
    ├── packet_statistics.m          PDR, PLR, availability, loss events, longest outage
    ├── plot_sensor_series.m         generic trend plot (soil / temperature / humidity)
    ├── plot_pump_timeline.m         pump command: recorded vs simulated
    ├── plot_packet_reception.m      packet reception strip (green = delivered, red = lost)
    ├── plot_packet_performance.m    packet counts + cumulative PDR
    └── plot_irrigation_comparison.m multi-strategy comparison incl. shaded outage window
```

Before the reorganisation the whole analysis lived in one 165-line script, duplicated as `smarf.m`.

---

## 4. Algorithms used

### 4.1 Dataset loading and validation

1. `detectImportOptions` + `readtable` with `VariableNamingRule = 'preserve'`, so the header
   (`Soil moisture (%)`, `Temperature (°C)`, …) is kept verbatim instead of being mangled into
   `SoilMoisture___`.
2. Column lookup ignores case, spaces and punctuation
   (`lower(regexprep(name,'[^A-Za-z0-9]',''))` + `startsWith`), so small header edits cannot break the script.
3. Numeric columns are coerced with `str2double`; unusable rows are counted and dropped.
4. **`Packet received` is TEXT** (`True`/`False`) in the CSV, so it is converted by `parse_boolean_column`,
   which accepts logical, numeric (0/1) **and** text tokens
   (`true/false/1/0/yes/no/on/off/received/lost`). Unrecognised tokens are counted (`unparsable`) and mapped
   to *false* (= lost) — the conservative choice for a controller.
5. Duplicate sample indices are removed and the table is sorted by `Sample`.

### 4.2 Documented irrigation control law

| Measured soil moisture | Packet | Pump command |
|---|---|---|
| `< 30 %` | received | **ON** — soil too dry |
| `> 40 %` | received | **OFF** — soil wet enough |
| `30 % … 40 %` (hysteresis band) | received | **keep previous state** |
| any value | **lost** | **keep previous state** (never act on stale data) |

Hysteresis stops the pump from chattering around a single threshold; holding on a lost packet avoids acting on
data that was never received. The pump starts in the safe state **OFF**.

### 4.3 The three strategies compared

| Mode | Rule | Purpose |
|---|---|---|
| `hold` (normal) | documented law above | baseline behaviour |
| `failSafe` (safe) | same law + watchdog: after **3 consecutive** lost packets the pump is forced **OFF** | conservative behaviour for long outages |
| `singleThreshold` (legacy) | `pump = (soil < 30)` | reproduces the **old** script, kept only to quantify its error |

### 4.4 Communication metrics

* **PDR** = delivered / transmitted, **PLR** = lost / transmitted, and `PDR + PLR = 100 %` is asserted.
* **Availability** = 1 − PLR.
* **Loss events** and **longest outage** are derived from runs of consecutive lost packets.
* Positions use the **dataset `Sample` numbering (0-based)**, not the MATLAB row index, to avoid the classic
  off-by-one error in reports.

### 4.5 Communication-failure stress test

Because the recorded run only contains *isolated* single-packet losses, the "hold" and "fail-safe" strategies
behave identically on it. To expose the difference, a **deterministic, clearly labelled synthetic outage** is
injected: every packet between samples **90 and 110** is marked lost. The sensor values are **not** modified.
Stress-test results are reported separately from the measured results.

### 4.6 Self-verification

Section 6 of `smart_farm_complete.m` compares 22 computed quantities with independently derived expected values
(from `DATA_ANALYSIS.md`) using explicit tolerances, and prints a PASS/FAIL table. A failing check raises a
MATLAB warning so it cannot be missed.


---

## 5. Actual numerical results

All values below were printed by MATLAB during the run of `smart_farm_complete.m`
(console output reproduced verbatim, rounded only where stated).

### 5.1 Dataset

| Quantity | Value |
|---|---|
| File | `data/sensor_data.csv` |
| Columns found | `Sample \| Soil moisture (%) \| Temperature (°C) \| Air humidity (%) \| Packet received \| Pump \| ML advice` |
| Rows read / used | **120 / 120** |
| Rows dropped (missing or non-numeric) | **0** |
| Duplicate samples removed | **0** |
| Unparsable `Packet received` tokens | **0** |
| Unparsable `Pump` tokens | **0** |
| Sample index range | **0 … 119** |
| Types after import | soil/temperature/humidity = `double`; received/pumpRecorded = `logical`; advice = `string` |

### 5.2 Sensor statistics

| Quantity | Average | Minimum | Maximum |
|---|---|---|---|
| Soil moisture | **41.4256 %** | 13.94 % (sample 105) | 62.82 % (sample 51) |
| Air temperature | **25.4417 °C** | 18.53 °C | 30.61 °C |
| Air humidity | **54.2380 %** | 39.73 % | 75.34 % |

### 5.3 Irrigation control (simulated)

| Strategy | Pump ON samples | ON share | Transitions | Activations |
|---|---|---|---|---|
| **Normal** (`hold`, 30/40 hysteresis) | **44** | 36.67 % | 3 | 2 |
| **Safe** (`failSafe`, watchdog 3 packets) | **44** | 36.67 % | 3 | — (0 watchdog trips) |
| **Legacy** (`singleThreshold`) | **27** | 22.50 % | **18** | — |
| Recorded `Pump` column | **44** | 36.67 % | 3 | — |

* Agreement with the recorded pump: **normal 100.00 %**, **legacy 85.83 %**.
* The hysteresis law therefore reproduces the dataset exactly, while the old single-threshold rule
  mis-commands **17 of 120** samples and produces **18** pump transitions instead of 3.
* State changes: OFF→ON at sample 2 (23.62 %), ON→OFF at sample 11 (40.81 %), OFF→ON at sample 85 (29.97 %).

### 5.4 Simulated LoRa link

| Metric | Value |
|---|---|
| Packets transmitted | **120** |
| Packets delivered | **116** |
| Packets lost | **4** |
| **Packet Delivery Ratio** | **96.666667 %** |
| **Packet Loss Ratio** | **3.333333 %** |
| Availability (1 − PLR) | **0.966667** |
| Loss events | **4** |
| Longest outage | **1 packet** |
| Lost at sample indices | **41, 44, 96, 100** |

### 5.5 Communication-failure stress test (synthetic outage 90–110)

| Strategy | Pump ON samples | Watchdog trips | Comment |
|---|---|---|---|
| `hold` (normal) | **44** | 0 | keeps the pump ON through the whole outage |
| `failSafe` (safe) | **25** | **1** | forces the pump OFF at the 3rd consecutive lost packet |
| Difference | **19 samples** | — | samples 92 … 110 |

Timeline (extract of the console output):

| Sample | Soil | Packet | `hold` | `failSafe` | Reason |
|---|---|---|---|---|---|
| 89 | 26.86 % | received | ON | ON | soil below dry threshold |
| 90 | 20.73 % | lost | ON | ON | no telemetry → hold |
| 91 | 30.79 % | lost | ON | ON | no telemetry → hold |
| **92** | 25.17 % | lost | ON | **OFF** | **watchdog: 3 lost packets → pump OFF** |
| 93 … 110 | 13.94 … 34.10 % | lost | ON | OFF | watchdog keeps the pump OFF |
| **111** | 24.96 % | received | ON | **ON** | control resumes from real data |

Engineering interpretation: the fail-safe strategy protects against irrigating blind (over-irrigation,
empty tank, pump running dry), but in this scenario the soil was genuinely dry (13.94–34.10 %), so it stopped an
irrigation that was in fact needed. The normal strategy keeps irrigating but cannot react to a real change during
the outage. This trade-off — not a "correct answer" — is the point of the comparison.


---

## 6. Generated figures

All figures are written to `results/` at 150 dpi, with titles, axis labels, units, legends and grids.

| File | Content | Key observation |
|---|---|---|
| `Fig1_soil_moisture.png` | Soil moisture vs sample, mean line, dry/wet thresholds, red **×** on lost packets | Crosses both thresholds, so all three control branches are exercised |
| `Fig2_air_temperature.png` | Air temperature vs sample + mean | 18.53 … 30.61 °C, stable signal |
| `Fig3_air_humidity.png` | Air humidity vs sample + mean | 39.73 … 75.34 %, anti-correlated with temperature |
| `Fig4_pump_timeline.png` | Pump command: recorded vs simulated (step curves) | Curves are identical → 100 % agreement |
| `Fig5_packet_reception.png` | Reception strip, one bar per packet | 116 green, 4 red (samples 41, 44, 96, 100) |
| `Fig6_packet_performance.png` | Packet count bar chart + cumulative PDR with 90 % target | PDR dips to 95.56 % at packet 45, settles at 96.67 % — always above the 90 % target |
| `Fig7_irrigation_comparison.png` | Soil context + 4 pump commands (recorded, normal, safe, legacy) | Legacy line chatters 18×; normal/safe/recorded coincide |
| `Fig8_communication_failure.png` | Same comparison for the synthetic outage (shaded band) | Fail-safe drops the pump 19 samples earlier than "hold" |

Legacy artefacts `results/SmartFarm_Figure_1..5.png` (from the **old** single-threshold script) are still present
but are **superseded** by the eight figures above — see §9.

Additional exported data:

| File | Content |
|---|---|
| `results/smart_farm_summary.csv` | one row: averages, sample count, pump ON counts per strategy, packet counts, PDR, PLR, outages, agreement, thresholds |
| `results/irrigation_mode_comparison.csv` | per-strategy table (6 rows): `strategy, pumpOnSamples, transitions, watchdogTrips` |
| `results/packet_loss_events.csv` | the four loss events: `firstSample, length` = (41,1) (44,1) (96,1) (100,1) |

---

## 7. Test results

### 7.1 Built-in verification (22 checks, all PASS)

| # | Check | Actual | Expected |
|---|---|---|---|
| 1 | Rows used | 120 | 120 |
| 2 | Mean soil moisture (%) | 41.425575 | 41.425576 |
| 3 | Mean air temperature (°C) | 25.441694 | 25.441694 |
| 4 | Mean air humidity (%) | 54.238031 | 54.238031 |
| 5 | Packets delivered | 116 | 116 |
| 6 | Packets lost | 4 | 4 |
| 7 | Packet Delivery Ratio (%) | 96.666667 | 96.666667 |
| 8 | Packet Loss Ratio (%) | 3.333333 | 3.333333 |
| 9 | PDR + PLR (%) | 100 | 100 |
| 10 | Loss events | 4 | 4 |
| 11 | Longest outage (packets) | 1 | 1 |
| 12 | Normal strategy: pump ON samples | 44 | 44 |
| 13 | Normal vs recorded agreement (%) | 100 | 100 |
| 14 | Legacy strategy: pump ON samples | 27 | 27 |
| 15 | Safe strategy: pump ON samples | 44 | 44 |
| 16 | Safe strategy: watchdog trips (isolated losses) | 0 | 0 |
| 17 | Hysteresis violations | 0 | 0 |
| 18 | Pump state changes on lost packets | 0 | 0 |
| 19 | Invalid thresholds rejected | 1 | 1 |
| 20 | Stress: packets lost inside the outage window | 21 | 21 |
| 21 | Stress: watchdog changes the command | 1 | 1 |
| 22 | Stress: fail-safe ON ≤ hold ON | 1 | 1 |

Console line: `All 22 verification checks passed.`

### 7.2 Error-path and data-type tests (separate test script)

| Test | Result |
|---|---|
| A. `load_sensor_data` with a missing file | ✅ raises `load_sensor_data:fileNotFound` |
| B. `load_sensor_data` with a wrong header | ✅ raises `load_sensor_data:missingColumn` and lists the available columns |
| C. `parse_boolean_column` on `{'True','False','TRUE','false','0','1','MAYBE',''}` | ✅ `[1 0 1 0 0 1 0 0]`, `unparsable = 2` |
| D. `parse_boolean_column` on `logical` and on `[1;0;NaN]` | ✅ `[1 0 1]` / `[1 0 0]` with `unparsable = 1` |
| E. `irrigation_control` with `WetThreshold < DryThreshold` | ✅ raises `irrigation_control:invalidThresholds` |
| F. `irrigation_control` with mismatched vector lengths | ✅ raises `irrigation_control:sizeMismatch` |
| G. Hand-checked control sequence `soil = [25 35 45 35 25]`, `received = [1 1 1 0 1]` | ✅ `pump = [1 1 0 0 1]` (assert passes) |

Test G, step by step (this is the documented law executed one sample at a time):

| Soil | Packet | Action reported by the function | Pump |
|---|---|---|---|
| 25 % | received | Irrigate: soil below dry threshold | ON |
| 35 % | received | Hold: inside hysteresis band | ON (held) |
| 45 % | received | Stop irrigation: soil above wet threshold | OFF |
| 35 % | **lost** | Hold: no telemetry (packet lost) | OFF (held) |
| 25 % | received | Irrigate: soil below dry threshold | ON |

### 7.3 Other scripts

| Script | Result |
|---|---|
| `smart_farm_complete.m` | ✅ runs to completion, exit code 0, 8 figures + 3 CSV files, 22/22 checks |
| `smarf.m` (deprecated wrapper) | ✅ prints the deprecation note and runs the main script (verified from `/tmp`) |
| `smart_farm_simulation.m` (standalone synthetic demo) | ✅ runs; `\n` escapes fixed, prints 4 clean lines |


---

## 8. Errors found in the original MATLAB code and how they were fixed

| # | Problem found (before) | Evidence | Fix applied |
|---|---|---|---|
| 1 | **Irrigation used a single threshold** `pump = double(soil < 30)` — no hysteresis, contradicting the report and the dataset | `matlab/smart_farm_complete.m:68`; produced 27 ON samples instead of 44 | New `irrigation_control.m` implements the documented 30/40 hysteresis; the old rule is kept as an explicit `singleThreshold` comparison mode |
| 2 | **`pumpSafe` was wrong**: `double(soil < 30 & received)` switched the pump **OFF** whenever a packet was lost instead of holding the state | `matlab/smart_farm_complete.m:125`; the figure legend claimed "communication failure mode" | Replaced by documented `hold` (normal) and `failSafe` (watchdog) strategies in `irrigation_control.m` |
| 3 | **Duplicate script**: `smarf.m` was a byte-identical copy of `smart_farm_complete.m` (diff = one `;`), so every bug had to be fixed twice | `diff -u matlab/smarf.m matlab/smart_farm_complete.m` | `smarf.m` reduced to a documented wrapper that calls the maintained script |
| 4 | **Brittle column names**: relied on MATLAB's auto-sanitised names `T.SoilMoisture___`, `T.Temperature__C_`, `T.AirHumidity___` and printed a "column headers modified" warning on every run | run output | `load_sensor_data.m` uses `VariableNamingRule='preserve'` + punctuation-insensitive column matching |
| 5 | **True/False handling**: `strcmpi(string(T.PacketReceived),'True')` silently returned *false* for anything not exactly `True` (e.g. `true`, `1`, `TRUE `) | code review | `parse_boolean_column.m` accepts text, numeric and logical input, counts unrecognised tokens and reports them via `info.unparsableReceived` |
| 6 | **Path depended on the current folder** (`'../data/…'`, `'../results'`), so the script failed unless launched from `matlab/` | code review | paths derived from `mfilename('fullpath')`; verified by running from `/tmp` |
| 7 | **Figure names depended on `findall(0,'Type','figure')` order**, so PNG names did not reliably match the plots | `smart_farm_complete.m:156-162` | each figure is exported explicitly with a descriptive name (`Fig1_…` … `Fig8_…`) |
| 8 | **Literal `\n` in the console report** of `smart_farm_simulation.m` (`\\n` inside `fprintf`) | `od -c` of the file; runtime printed `…LINK\nDistance…` | escapes corrected; output now prints on separate lines |
| 9 | **No verification at all** — numbers were printed but never checked | code review | 22 self-checks with tolerances; a failure raises a warning |
| 10 | **Plot quality**: default styling, missing units, no legends on threshold lines | old figures | all plots rebuilt: white background, titles, axis labels with units, legends, grids, mean line, threshold lines, lost-packet markers, shaded outage window |

---

## 9. Remaining limitations

1. **Simulation only.** No physical pump, valve, sensor or radio exists. The "pump" is a 0/1 vector and the
   "LoRa link" is a reception flag; nothing here can be presented as field validation.
2. **The dataset is synthetic** and, as shown in `DATA_ANALYSIS.md` (finding D-01), it **cannot be regenerated**
   from the current project code. The MATLAB results are correct *for this file*, not for measured field data.
3. **No radio metrics.** The CSV contains no RSSI, SNR, spreading factor, bandwidth, TX power or timestamps.
   `smart_farm_simulation.m` still prints *illustrative* RSSI/SNR from a hard-coded formula — those are **not
   measurements** and must not be reported as results.
4. **The communication-failure stress test is synthetic.** The outage window 90–110 is injected by the script and
   labelled in the console output and in `Fig8`. It demonstrates the logic; it is not a measured outage.
5. **`Pump` and `ML advice` in the CSV are derived columns**, not sensor data; `ML advice` is a demonstration
   classifier output and is not used by the controller.
6. **Stale artefacts still present** (not deleted without permission): `matlab/Figure_1.png` (older script) and
   `results/SmartFarm_Figure_1..5.png` (produced by the old single-threshold code that contained the incorrect
   `pumpSafe` logic). Recommend deleting them or replacing with `Fig1…Fig8` in the report.
7. **`smart_farm_simulation.m` does not read the CSV** — by design: it is the standalone synthetic "what-if"
   variant. The CSV-driven analysis is `smart_farm_complete.m`. Both are now documented in their file headers.
8. **Thresholds are constants** in the main script (`cfg.dryThreshold`, `cfg.wetThreshold`), single-sourced and
   passed down, but not yet read from a shared project configuration file (`config/params.json` shared with the
   Python/VHDL parts is a recommended next step).
9. **No unit-test framework.** The 22 checks run inside the main script and a separate ad-hoc test script exists,
   but there is no `matlab.unittest` suite (`runtests`) suitable for CI.


---

## 10. Reproduction commands

```bash
# 1. Main simulation (writes the 8 figures and 3 CSV files into results/)
cd /Users/gtx-z/Downloads/SmartFarm_Simulation_English
/Applications/MATLAB_R2025a.app/bin/matlab -batch \
  "run('matlab/smart_farm_complete.m')"

# 2. Deprecated wrapper (behaves identically)
/Applications/MATLAB_R2025a.app/bin/matlab -batch "run('matlab/smarf.m')"

# 3. Standalone synthetic demo (independent of the CSV)
/Applications/MATLAB_R2025a.app/bin/matlab -batch "run('matlab/smart_farm_simulation.m')"

# 4. Inspect the exported numbers
cat results/smart_farm_summary.csv
cat results/irrigation_mode_comparison.csv
cat results/packet_loss_events.csv
```

Inside MATLAB the functions can also be used directly:

```matlab
addpath('matlab/functions');
[data, info] = load_sensor_data("data/sensor_data.csv");
normal = irrigation_control(data.soil, data.received, DryThreshold = 30, ...
                            WetThreshold = 40, Mode = "hold");
safe   = irrigation_control(data.soil, data.received, Mode = "failSafe", MaxHoldSamples = 3);
link   = packet_statistics(data.received, data.sample);
fprintf('ON normal=%d safe=%d | PDR=%.6f %% | PLR=%.6f %%\n', ...
        normal.onCount, safe.onCount, link.pdrPercent, link.plrPercent);
```

---

## 11. Summary

| Question | Answer |
|---|---|
| Do the scripts read the real CSV? | **Yes** — `smart_farm_complete.m` reads `data/sensor_data.csv` (120/120 rows, 0 dropped). `smart_farm_simulation.m` is the documented exception (synthetic by design). |
| Are the variable names and data types correct? | **Yes** — after import: 3× `double`, 2× `logical`, 1× `string`, `Sample` = 0…119. The True/False text column is parsed explicitly and unknown tokens are counted. |
| Is the irrigation threshold logic correct? | **Yes** — 30/40 hysteresis with hold: 0 violations, 100 % agreement with the recorded pump, hand-checked case passes. |
| Are the packet calculations correct? | **Yes** — PDR **96.666667 %**, PLR **3.333333 %**, sum = 100 %, cross-checked against `DATA_ANALYSIS.md`. |
| Is communication failure handled? | **Yes** — the state is held on lost packets (0 state changes across the 4 lost samples); a fail-safe watchdog is provided and demonstrated on a labelled synthetic outage. |
| Normal vs safe compared? | **Yes** — identical on this dataset (isolated losses); they differ by **19 samples** in the synthetic burst outage (44 vs 25 ON samples, 1 watchdog trip). |
| Is MATLAB controlling a physical pump? | **No.** Everything is a software simulation; no hardware is connected. |

