# PROJECT AUDIT

**Project:** Smart Farm Monitoring and Automated Irrigation System Using IoT, LoRa, MATLAB, Python, VHDL and SystemC
**Folder audited:** `SmartFarm_Simulation_English`
**Audit date:** 2026-11-08
**Audit type:** Read-only technical inspection (stage 1 report). **No source file was modified, moved or deleted.**
**Host:** macOS (Intel), VS Code

---

## 0. How this audit was produced (evidence, not assumptions)

Every claim below is backed by a command that was actually executed during this audit.
All *execution* tests were run against **copies** (`/private/tmp/sf_audit/...`) or against **read-only**
invocations, so that the existing project files, the existing `results/` outputs and the existing
`vhdl/` build artifacts were **not** overwritten.

| ID | What was checked | Command (abridged) | Observed result |
|----|------------------|--------------------|-----------------|
| T-01 | Python syntax | `.venv/bin/python -m py_compile app.py` | OK, no syntax errors |
| T-02 | Dashboard actually runs (defaults) | `streamlit.testing.v1.AppTest` | 0 exceptions; title rendered; metrics: Packet delivery **97.5 %**, RSSI **-104.1 dBm**, SNR **-4.6 dB**, Pump ON **42 samples**; dataframe rows = 15 |
| T-03 | Dashboard, max settings (300 samples, 30 % loss, 2000 m, dry = 50 %) | `AppTest` + slider overrides | 0 exceptions; delivery **69.7 %**, RSSI **-117.0 dBm**, SNR **-17.5 dB**, Pump ON **227** |
| T-04 | Dashboard, edge settings (dry = 10 %, loss = 0 %) | `AppTest` + slider overrides | 0 exceptions; delivery **100.0 %**, Pump ON **0** |
| T-05 | MATLAB availability | `matlab -batch "disp(version)"` | **25.1.0.2973910 (R2025a) Update 1** — licensed and working |
| T-06 | `matlab/smart_farm_complete.m` execution | `matlab -batch "smart_farm_complete"` (copy) | **Completes successfully**; prints sensor statistics, irrigation results, LoRa results; writes 5 PNGs + summary CSV. Produced `smart_farm_summary.csv` is **identical** (`diff` clean) to the committed `results/smart_farm_summary.csv` |
| T-07 | `matlab/smarf.m` execution | `matlab -batch "smarf"` (copy) | Completes successfully, identical output to T-06 (it is the same code) |
| T-08 | `matlab/smart_farm_simulation.m` execution | `matlab -batch "smart_farm_simulation"` (copy) | Completes successfully; text output shows a **literal `\n`** (escape bug, see E-08) |
| T-09 | VHDL analysis | `ghdl -a --std=08 irrigation_controller.vhd irrigation_controller_tb.vhd` | **exit 0**, zero diagnostics |
| T-10 | VHDL elaboration | `ghdl -e --std=08 irrigation_controller_tb` | **exit 0**, executable produced |
| T-11 | VHDL simulation | `./irrigation_controller_tb --stop-time=200ns --vcd=...` | Only output: `@100ns:(report note): Simulation finished`. VCD dump shows **`pump_enable` = `U` for the whole run** (single transition at t = 0) → the DUT is **not** instantiated |
| T-12 | VHDL simulation **without** `--stop-time` | `./irrigation_controller_tb` | Still running after 5 s → the testbench **hangs** (infinite clock + `wait;`) |
| T-13 | SystemC build | `g++ -std=c++17 ... smart_farm_systemc.cpp -lsystemc` | **`fatal error: 'systemc' file not found`** → SystemC is **not installed**; component cannot be built or run here |
| T-14 | Data lineage of `data/sensor_data.csv` | Recomputed the dashboard signal chain with the same seed/defaults | CSV **cannot** be regenerated from current `app.py` (see E-05) |
| T-15 | Prebuilt `vhdl/irrigation_controller_tb` binary | `./irrigation_controller_tb --stop-time=120ns` | Runs, same single report line (consistent with T-11: the binary is current, but the testbench is hollow) |
| T-16 | Documentation content | `zipfile` extraction of PPTX/DOCX | 11 slides, 48 report paragraphs, **no embedded images, no speaker notes** |

### Tool inventory found on this machine

| Tool | Required by project | Status |
|------|--------------------|--------|
| MATLAB R2025a Update 1 | `matlab/*.m` | **Installed** (`/Applications/MATLAB_R2025a.app`) |
| GHDL 5.1.1 (LLVM, macOS x86_64) | `vhdl/*.vhd` | **Installed** (`~/ghdl/ghdl-llvm-5.1.1-macos13-x86_64`) |
| Python 3.9.6 (`/usr/bin/python3`) + local `.venv` | `python_dashboard` | **Installed** — venv has streamlit 1.50.0, pandas 2.3.3, numpy 2.0.2, plotly 7.1.0, scikit-learn 1.6.1 |
| clang++ / g++ (Xcode CLT) | SystemC | **Installed** |
| **SystemC library** | `systemc/smart_farm_systemc.cpp` | **MISSING — not installed** |
| pytest | not referenced, but needed for automated checks | **MISSING (optional)** |
| Octave | README alternative to MATLAB | Not installed (not needed — MATLAB works) |

---

## 1. Executive summary

The project is a **four-language software-only simulation** (MATLAB, Python/Streamlit, VHDL/GHDL, SystemC)
of soil-moisture monitoring + a virtual-LoRa link + a hysteresis irrigation controller, plus documentation
(technical report, slide deck, scope note).

**What is genuinely working (executed during this audit):**

* The **Python/Streamlit dashboard** — runs, renders, exports CSV, no runtime exceptions in three configurations.
* **Two of the three MATLAB scripts** — `smart_farm_complete.m` (and its duplicate `smarf.m`) reproduce the
  committed `results/smart_farm_summary.csv` **exactly**; `smart_farm_simulation.m` also runs.
* The **VHDL RTL controller** — analyses and elaborates cleanly under GHDL 5.1.1 with `--std=08`.
* The **GHDL flow itself** — `-a`, `-e`, `-r` all work once a `--stop-time` is supplied.

**What is NOT working or not trustworthy:**

* **The VHDL testbench verifies nothing.** It contains **no instantiation of the design under test**, no `port map`
  and no `assert`/self-checking. The simulation "passes" with the DUT output stuck at `'U'` (T-11), and it **hangs**
  if `--stop-time` is omitted (T-12). This is the most serious defect in the package.
* **The SystemC model has never been built on this machine** — the SystemC library is not installed (T-13).
  Its correctness is **unknown** and must not be presented as verified.
* **Automatic-irrigation logic exists four times with three different behaviours** (single threshold in MATLAB vs
  30/40 hysteresis in VHDL/SystemC/Python), and the MATLAB "communication failure mode" does the **opposite** of
  what the report and slides claim (E-03, E-04).
* **The CSV dataset is orphaned and irreproducible**: nothing reads or writes `data/sensor_data.csv`, and the file
  cannot be regenerated by the current code (E-05, E-06).
* **No integration exists.** The four components share no data contract, no shared parameter file and no
  cross-checked results; they are **four independent demos** of the same idea.
* Documentation is **stale and inconsistent with the code** (README still says no VHDL testbench exists; report and
  slides describe hysteresis behaviour that MATLAB does not implement).
* Housekeeping: 839 MB project folder dominated by a 304 MB `VSCode-darwin-x64.dmg` and a 533 MB `.venv`;
  compiled VHDL binaries/objects left in the tree; no `.git`, no `.gitignore`, no run scripts, no tests.

**Bottom line:** roughly a **50–60 % complete academic prototype**. The concepts, the language coverage and the
plotting are in place; **verification, integration and documentation accuracy are not**. Section 12 gives a
realistic path to a defensible graduation-project state.


---

## 2. Project architecture

### 2.1 Intended architecture (as documented in the report and slides)

```
 [Sensor node]            [Virtual LoRa link]          [Gateway]        [Controller]      [Dashboard]
 soil moisture  ──sample──▶  packet model       ──pkt──▶ valid update ──▶ hysteresis ──▶ plots / CSV
 temperature                  loss probability             filtering      pump ON/OFF      metrics / ML
 air humidity                 RSSI / SNR (estimates)
```

Documented control law (report §5, slide 6):

| Condition | Action |
|-----------|--------|
| soil moisture < 30 % | pump **ON** |
| soil moisture > 40 % | pump **OFF** |
| 30 % ≤ soil ≤ 40 % | keep previous state (hysteresis) |
| packet lost | keep previous state |

### 2.2 As-built architecture (what the files actually do)

The four "nodes" above are **not connected**. Each language re-implements the whole chain inside one file:

```
matlab/smart_farm_complete.m   ── reads ──▶ data/sensor_data.csv ── writes ──▶ results/*.png + summary.csv
matlab/smarf.m                 ── identical duplicate of the above
matlab/smart_farm_simulation.m ── self-generated data (rng(7)); no CSV in/out; figures only
python_dashboard/app.py        ── self-generated data (default_rng(seed)); CSV only via manual download button
                                  does NOT read data/sensor_data.csv, does NOT write results/
vhdl/irrigation_controller.vhd ── RTL of the hysteresis decision only (no sensors, no LoRa, no plotting)
vhdl/irrigation_controller_tb.vhd ── stimulus process only; NOT connected to the RTL   ← critical
systemc/smart_farm_systemc.cpp ── sensors + loss pattern + hysteresis + console log in one module
```

Consequences:

* There is exactly **one real integration point in the project**: `data/sensor_data.csv`, read by two MATLAB
  scripts. Everything else is isolated.
* The same algorithm is duplicated 4×, so the components **can disagree** — and they do (§7).
* No component produces evidence that another is correct (no shared reference vectors).

---

## 3. Existing files and their purposes

### 3.1 Root

| File | Size | Purpose | State |
|------|------|---------|-------|
| `README.md` | 2.1 KB | Run instructions, scope limits | **Stale** — lists only 4 source files, still says no VHDL testbench exists, no macOS/GHDL command sequence, no `--stop-time` hint (E-20) |
| `PROJECT_SCOPE.md` | 0.9 KB | Honest mapping to the professor's topic sheet (agriculture + LoRa; FPGA/VHDL/MATLAB/SystemC; AI/ML/cloud) | Good, accurate |
| `Smart_Farm_Technical_Report_EN.docx` | 39 KB | 10-section report (abstract, architecture, LoRa model, control logic, ML, verification, limitations, future work) | Text-only, **no figures**, some claims inconsistent with code (E-03, E-04, E-20) |
| `Smart_Farm_Presentation_EN.pptx` | 40 KB | 11-slide deck, text-only, **no speaker notes**, no figures | Same inconsistencies as the report |
| `VSCode-darwin-x64.dmg` | **304 MB** | Unrelated VS Code installer | Should not be in the deliverable (E-17) |
| `.venv/` | **533 MB** | Python 3.9.6 venv with all dashboard dependencies | Works, but unpinned and not portable (E-18) |

### 3.2 `data/`

| File | Content | State |
|------|---------|-------|
| `sensor_data.csv` | 120 rows × 7 columns: `Sample, Soil moisture (%), Temperature (°C), Air humidity (%), Packet received, Pump, ML advice`; 116 receptions (96.67 %), 44 rows `Pump=ON`, 24 rows `ML advice=Irrigation suggested` | Readable by pandas and MATLAB, but **orphaned and not reproducible** (E-05, E-06). Its `Pump` column was produced by a hysteresis rule, i.e. **not** by the MATLAB logic that consumes the file |


### 3.3 `matlab/`

| File | Lines | Purpose | State |
|------|-------|---------|-------|
| `smart_farm_complete.m` | 164 | Reads the CSV, statistics, 3 sensor plots, threshold irrigation, LoRa KPIs from the CSV, bar chart, reception stairs, "safety mode" comparison, writes `results/` | **Runs and reproduces the committed results**, but logic ≠ documented spec (E-03, E-04); relies on auto-sanitised column names (E-09) |
| `smarf.m` | 165 | **Byte-identical duplicate** of `smart_farm_complete.m` (diff = trailing `;` + final newline) | Duplicated code, misleading filename (E-07) |
| `smart_farm_simulation.m` | 58 | Self-contained simulation: synthetic signals, its own packet-loss model, hysteresis irrigation, 3-subplot figure, KPI printout | Runs; **literal `\n`** in all four `fprintf` (E-08); writes no files |
| `Figure_1.png` | 33 KB | 2-panel figure ("LoRa Packet Reception" + "Irrigation Pump Status") | **Orphan artifact** — no current script produces this layout (E-15) |

### 3.4 `python_dashboard/`

| File | Lines | Purpose | State |
|------|-------|---------|-------|
| `app.py` | 80 | Streamlit dashboard: 6 sidebar controls (samples, distance, loss %, dry %, wet %, seed), synthetic soil/temp/RH, virtual packet loss, hysteresis pump, 4 KPI metrics, 3 Plotly charts, 15-row table, CSV download, ML demo (DecisionTree depth 3 on 1500 synthetic points) | **Fully functional** (T-01…T-04). No CSV input, no results output, deprecated `use_container_width` (E-19), distance slider does not influence delivery (E-22) |
| `requirements.txt` | 5 deps | streamlit, pandas, numpy, plotly, scikit-learn (all `>=`, unpinned) | Complete but unpinned (E-18) |

### 3.5 `vhdl/`

| File | Lines | Purpose | State |
|------|-------|---------|-------|
| `irrigation_controller.vhd` | 38 | Synchronous pump controller: `clk`, `reset_n`, `packet_valid`, `soil_moisture(7:0)` → `pump_enable`; hysteresis 30/40 as constants | **Analyses + elaborates cleanly** (T-09, T-10); behaviour never exercised (see TB) |
| `irrigation_controller_tb.vhd` | 49 | Clock generator + 4 stimulus steps + `report "Simulation finished"` | **Hollow**: no DUT instance, no assertions, hangs without `--stop-time` (E-01, E-02) |
| `irrigation_controller.o`, `irrigation_controller_tb.o`, `e~irrigation_controller_tb.o`, `work-obj08.cf` | — | GHDL build artifacts | Left in the tree (E-14) |
| `irrigation_controller_tb` | 1.3 MB | macOS executable from `ghdl -e` | Runs (T-15); should not be versioned (E-14) |

### 3.6 `systemc/`

| File | Lines | Purpose | State |
|------|-------|---------|-------|
| `smart_farm_systemc.cpp` | 59 | Single `SC_MODULE(SmartFarm)`: synthetic moisture ramp, deterministic packet loss (`sample % 17 != 0`), hysteresis, console trace; `sc_main` with 1 Hz clock, 30 s run | **Source only — not compilable here** (T-13). Suspected non-determinism between the two threads (E-11). No header split, no testbench, no Makefile |

### 3.7 `results/`

| File | Purpose | State |
|------|---------|-------|
| `SmartFarm_Figure_1..5.png` | 5 figures from `smart_farm_complete.m` (sensor analysis, irrigation, LoRa bar chart, reception stairs, safety comparison) | Regenerable — reproduced in this audit with identical file sizes and matching content |
| `smart_farm_summary.csv` | One row: avgSoil 41.4256, avgTemp 25.4417, avgHum 54.2380, pumpON 27, pumpOFF 93, packets 120, received 116, lost 4, delivery 96.667 %, loss 3.333 % | **Reproduced byte-identically** ⇒ trustworthy *for the code as written* |

No results from the VHDL, SystemC or Python components are stored anywhere — only MATLAB output exists.


---

## 4. Implemented vs Tested vs Verified

Definitions used throughout this audit (they are **not** interchangeable):

* **Implemented** — the source code exists and is complete enough to be run.
* **Tested** — it was actually executed on this machine during this audit and produced the stated output.
* **Verified** — its behaviour was checked against the intended specification with self-checking
  (assertions / golden references / automated pass-fail), so it can be trusted without a human re-reading a plot.

| Component | Implemented | Tested | Verified | Comment |
|-----------|:-----------:|:------:|:--------:|---------|
| Python dashboard `app.py` | ✅ | ✅ (T-01…T-04) | ⚠️ Partial | Runs in 3 configurations with 0 exceptions; but there is **no automated pass/fail** test, and its irrigation model is only spot-checked against the small hand-run script in this audit |
| `data/sensor_data.csv` | ✅ | ✅ (readable by pandas + MATLAB) | ❌ | Content cannot be regenerated from the current code (E-05) → no provenance, no reproducibility |
| `matlab/smart_farm_complete.m` | ✅ | ✅ (T-06) | ⚠️ Partial | Reproduces `results/smart_farm_summary.csv` exactly ⇒ self-consistent, but implements a *different* law than the documentation (E-03, E-04) |
| `matlab/smarf.m` | ✅ | ✅ (T-07) | ❌ | Exact duplicate — verifies nothing new (E-07) |
| `matlab/smart_farm_simulation.m` | ✅ | ✅ (T-08) | ⚠️ Partial | Self-consistent; cosmetic output bug (E-08) |
| Virtual LoRa model | ✅ (4 variants) | ✅ Python + MATLAB | ❌ | Four different loss models; RSSI/SNR decoupled from delivery (E-21, E-22) |
| Automatic irrigation logic | ✅ (4 variants) | ✅ | ❌ | Three different behaviours; MATLAB "safety mode" contradicts the spec (E-03, E-04) |
| VHDL RTL `irrigation_controller.vhd` | ✅ | ✅ analyse + elaborate (T-09, T-10) | ❌ | Functionally never exercised — the TB has no DUT instance |
| VHDL testbench `irrigation_controller_tb.vhd` | ⚠️ Skeleton | ✅ runs (T-11) | ❌ | No DUT, no assertions, no stop condition, always "passes" (E-01, E-02) |
| GHDL flow | ✅ (manual commands) | ✅ | ⚠️ Partial | Works, but not scripted and not regression-capable |
| SystemC model | ✅ (source) | ❌ | ❌ | **Cannot build** — SystemC library missing (E-10, T-13) |
| Documentation (README/report/slides) | ✅ | ✅ (content extracted) | ❌ | Stale and contradictory in several places (E-20) |
| End-to-end project integration | ❌ | ❌ | ❌ | No shared parameters, no pipeline, no cross-language validation |


---

## 5. Component-by-component findings

### 5.1 Python dashboard (`python_dashboard/app.py`)

**Implemented and tested.** Executed three times through `streamlit.testing.v1.AppTest`:

| Configuration | Exceptions | Delivery | RSSI | SNR | Pump ON |
|---------------|-----------|----------|------|-----|---------|
| Defaults (120 samples, 4 % loss, 450 m, dry 30 / wet 40, seed 7) | none | 97.5 % | -104.1 dBm | -4.6 dB | 42 |
| 300 samples, 30 % loss, 2000 m, dry 50 | none | 69.7 % | -117.0 dBm | -17.5 dB | 227 |
| dry 10, loss 0 % | none | 100.0 % | -104.1 dBm | -4.6 dB | 0 |

Findings:

* Code quality is good for a student prototype: clear sections, documented hysteresis, no dead code, no unused imports.
* It **generates** data instead of **loading** `data/sensor_data.csv` ⇒ the dataset in `data/` is dead weight for
  the dashboard, and the "history" story told in the slides (slide 3: "dashboard … CSV history") is not implemented
  (the only CSV interaction is a manual download with a *different* filename, `smart_farm_simulation.csv`).
* `distance` only affects the displayed RSSI/SNR; the packet-loss draw is independent of distance
  (E-22) — a reviewer can easily demonstrate this inconsistency.
* SNR of **-4.6 dB** shown next to a **97.5 %** delivery ratio is physically implausible for LoRa; it is labelled
  "illustrative", but the two numbers come from different, unlinked models.
* Streamlit 1.50 emits: *"`use_container_width` will be removed after 2025-12-31"* (E-19) — cosmetic now, will break later.
* No unit tests, no `pytest`, no data-layer module (everything is inline in the 80-line script).

### 5.2 Sensor CSV (`data/sensor_data.csv`)

**Readable, but provenance broken.** Reproducing the dashboard with seed 7 / 120 samples / 4 % loss yields:

| Column | Max abs. difference vs. CSV |
|--------|-----------------------------|
| Soil moisture | **14.11** |
| Temperature | 3.72 |
| Air humidity | 11.04 |
| Packet received | **7 of 120 rows differ** |
| Pump | **6 of 120 rows differ** |

(soil[0] recomputed = 29.421914, CSV = 30.852087.) Therefore the CSV was produced by an **earlier version** of the
dashboard (different RNG call order or different constants) and can no longer be regenerated. This is exactly the
kind of thing an examiner asks about: *"where does this file come from?"* — currently there is no answer.

Additional mismatch: the CSV `Pump` column (44 ON) reflects hysteresis (e.g. row 3: soil 38.23 %
→ still `ON`), while `smart_farm_complete.m` recomputes a **threshold-only** pump (27 ON) and ignores the column.
So one single dataset yields **three different pump statistics**: 44 (CSV), 42 (current dashboard code),
27 (MATLAB), 25 (MATLAB "safety mode").

### 5.3 MATLAB

* `smart_farm_complete.m` — **tested, reproduces committed results** (T-06). `diff` of the regenerated
  `smart_farm_summary.csv` against `results/smart_farm_summary.csv` is clean. Verified cross-check:
  `count(soil < 30) = 27` in the CSV ⇒ `pumpON = 27` is consistent with the implemented rule, and
  `count(soil < 30 & received) = 25` ⇒ `pumpSafe` is also consistent — **the code is doing what it says, but what it
  says is not what the report says** (E-03, E-04).
* `smarf.m` — exact duplicate (E-07).
* `smart_farm_simulation.m` — runs; its own synthetic data and its own LoRa numbers (delivery 98.3 %, pump ON 51)
  do not match the CSV-based results (96.67 %, pump ON 27). Two MATLAB scripts, two different parallel universes.
* All scripts depend on the **current working directory** (`'../data/...'`, `'../results'`): they only work if
  launched from inside `matlab/`. `README` does not state this.
* `matlab/Figure_1.png` is an orphan (E-15).

### 5.4 LoRa communication "simulation"

There is no LoRa *component* — there are four incompatible packet models:

| Location | Packet-loss model |
|----------|-------------------|
| `python_dashboard/app.py:25` | `received = rng.random(n) >= loss_pct/100` (independent Bernoulli, user-controlled) |
| `matlab/smart_farm_simulation.m:22` | `received = rand(1,N) > 0.04` (fixed 4 %, different RNG) |
| `matlab/smart_farm_complete.m:89` | **no model at all** — reads the boolean column from the CSV |
| `vhdl/…` | **no model at all** — `packet_valid` is driven manually by the testbench |
| `systemc/…:22` | deterministic `(sample % 17) != 0` (≈ 5.88 % loss, no randomness) |

RSSI/SNR formulas are duplicated (not shared) in `app.py:52-54` and `smart_farm_simulation.m:19-21`; they happen to
agree (-104.1 dBm / -4.6 dB at 450 m) because they are the same hard-coded expression. The report already admits the
model is illustrative — that is honest, but it means the "LoRa simulation" cannot be a standalone verified deliverable
in its current duplicated form.


### 5.5 Automatic irrigation logic (the core of the project)

| Implementation | Rule | Packet-loss behaviour |
|----------------|------|----------------------|
| `vhdl/irrigation_controller.vhd:29-33` | `< 30` ON, `> 40` OFF, else hold | hold (correct) |
| `systemc/smart_farm_systemc.cpp:32-36` | `< 30` ON, `> 40` OFF, else hold | hold (correct) — unverified, not compilable |
| `python_dashboard/app.py:27-34` | `< dry_limit` ON, `> wet_limit` OFF, else hold (user adjustable) | hold (correct) |
| `matlab/smart_farm_complete.m:68` | `pump = soil < 30` **single threshold, no hysteresis** | not modelled in `pump` |
| `matlab/smart_farm_complete.m:125` | `pumpSafe = soil < 30 & received` | **forces OFF on packet loss** (opposite of spec) |
| `matlab/smart_farm_simulation.m:29-38` | 30/40 hysteresis (correct) | hold (correct) |

So: the VHDL, SystemC, Python and one MATLAB script implement the documented law; the *main* MATLAB results script
does not, and its "safety mode" figure is mislabelled. This is a direct contradiction with report §5 and slide 6 —
the two artefacts a professor will read first.

### 5.6 VHDL RTL controller (`vhdl/irrigation_controller.vhd`)

Positive aspects (all confirmed by GHDL analysis/elaboration):

* Clean synchronous design, correct `reset_n` asynchronous reset, single-driver `pump_enable`.
* Correct hysteresis using unsigned 8-bit comparison: `< 30` → ON, `> 40` → OFF, otherwise hold.
* Style is synthesis-friendly: no latches, no inferred memories, no multiple clock domains.

Weaknesses:

* Thresholds are **hard-coded constants** (`DRY_LIMIT`/`WET_LIMIT`) — no `generic` overrides, so the Python dashboard's
  adjustable thresholds cannot be matched without editing the VHDL (E-12).
* No sensor-range validation (e.g. values > 100 are meaningless), no pump maximum-runtime watchdog, no fault input,
  no stuck-sensor detection — reasonable for a prototype, but worth listing explicitly as "not implemented" in the
  report rather than leaving it implicit.
* `packet_valid` is used as a level (sample-enable semantics). That is fine, but the report calls it "a packet was
  received", which implies an event; the RTL documentation should state the level semantics (E-13).
* Behaviour **never observed**: no waveform, no assertion, no console trace of a pump transition.

### 5.7 VHDL testbench (`vhdl/irrigation_controller_tb.vhd`) — critical defect

What the file contains: a clock generator, four stimulus settings (`20`, `50`, `80`, `10`), one `report` line, `wait;`.
What the file does **not** contain: the DUT. `grep -nE 'uut|port map|dut|inst|assert'` returns **nothing**.
Because `pump_enable` is a testbench-local signal that nothing drives, GHDL leaves it at `'U'`:

```
#0    ... U%          ← the only value pump_enable ever takes
```

Consequences:

* T-11 produces `@100ns:(report note): Simulation finished` and exit status 0 — it *looks* like a pass.
* T-12: without `--stop-time` the simulation never ends (free-running clock + `wait;`).
* No `assert`, no `std.env.finish`, no error counting ⇒ the testbench can **never** fail, so it provides zero
  evidence for the VHDL deliverable.

This is the highest-priority fix in the project (P0, small effort: ~30 lines).

### 5.8 GHDL flow

Works, but entirely manual and undocumented for macOS:

```bash
cd vhdl
ghdl -a --std=08 irrigation_controller.vhd irrigation_controller_tb.vhd
ghdl -e --std=08 irrigation_controller_tb
ghdl -r --std=08 irrigation_controller_tb --stop-time=200ns      # --stop-time is mandatory
```

Observed with GHDL 5.1.1 (LLVM, macOS x86_64): analysis exit 0, elaboration exit 0, run exit 0, no warnings about
the RTL. Note also that `ghdl -e` writes the executable **and** an `e~*.o` file into the working directory — the
existing `vhdl/` folder already contains such leftovers from an earlier, apparently aborted, run (E-14). Running
GHDL from within `vhdl/` overwrites `work-obj08.cf`; a `workdir` should be used instead to keep the tree clean.

### 5.9 SystemC (`systemc/smart_farm_systemc.cpp`)

* **Not buildable on this machine**: `#include <systemc>` → `fatal error: 'systemc' file not found` (no SystemC
  installation anywhere under `/usr/local`, `/opt/homebrew`, `$HOME`). Nothing about this file has been executed, so
  no statement about its correctness is possible (E-10).
* Static review observations (to be confirmed *after* the library is installed):
  * `sensor_and_link` and `irrigation_logic` are two `SC_THREAD`s both statically sensitive to `clk.pos()`. They resume
    in the same delta cycle in an implementation-defined order, so the read of `soil`/`packet_valid` may see the
    previous or the current value — an avoidable race (E-11).
  * Packet loss is a fixed pattern `(sample % 17) != 0` — not comparable with the Python/MATLAB probabilistic model.
  * `sc_clock clk("clk", 1, SC_SEC)` + `sc_start(30, SC_SEC)` = only 30 cycles at 1 Hz; fine as a demo, but the time
    base is unrealistic for a LoRa/IoT story.
  * The deprecated `sc_clock(name, double, sc_time_unit)` constructor may warn on SystemC 3.x.
  * No `SC_MODULE` header/`.cpp` split, no testbench, no Makefile, no log/golden-file comparison.


---

## 6. Errors and defects found (register)

Severity: **S1** = blocks the deliverable · **S2** = results/documentation not trustworthy · **S3** = quality/robustness
· **S4** = cosmetic/housekeeping. Status: `confirmed` = proven by execution (evidence in §0), `inspection` = static analysis.

| ID | Sev | File / line | Defect | Evidence | Status |
|----|-----|-------------|--------|----------|--------|
| E-01 | **S1** | `vhdl/irrigation_controller_tb.vhd` (whole file) | **No DUT instantiation, no `port map`, no assertions** — the "testbench" only generates stimulus | `grep -nE 'uut\|port map\|assert'` → no match; VCD shows `pump_enable = U` for the whole run (T-11) | confirmed |
| E-02 | **S1** | `vhdl/irrigation_controller_tb.vhd:47` (`wait;`) | Simulation never terminates by itself and can never fail | Still running after 5 s without `--stop-time` (T-12); exit code always 0 | confirmed |
| E-03 | **S2** | `matlab/smart_farm_complete.m:68` | Irrigation uses a **single threshold** (`soil < 30`), no 30/40 hysteresis — contradicts report §5 / slide 6 | `pumpON = 27` = `count(soil<30)`; no hysteresis in code | confirmed |
| E-04 | **S2** | `matlab/smart_farm_complete.m:125` | "Communication failure mode" sets the pump **OFF** on packet loss instead of **holding** the state; legend misleading | `pumpSafe = soil < 30 & received` (25 samples) vs spec "retain previous state" | confirmed |
| E-05 | **S2** | `data/sensor_data.csv` | Dataset **cannot be regenerated** from the current dashboard | soil[0] recomputed 29.4219 vs 30.8521; max diff 14.11; 7/120 packet and 6/120 pump mismatches (T-14) | confirmed |
| E-06 | **S2** | `python_dashboard/app.py`, `matlab/*.m` | CSV is **orphaned**: the dashboard never reads or writes `data/sensor_data.csv`; MATLAB never writes it | `grep read_csv app.py` → nothing; the path appears only in the two MATLAB scripts | confirmed |
| E-07 | **S3** | `matlab/smarf.m` vs `matlab/smart_farm_complete.m` | **Exact duplicate** (diff = one `;` + final newline); `smarf.m` is a typo-style name | `diff -u` shows a one-line difference | confirmed |
| E-08 | **S3** | `matlab/smart_farm_simulation.m:55-58` | `fprintf` contain `\\n` instead of `\n` → literal `\n` printed | `od -c` shows `\ \ n`; output `...VIRTUAL LoRa LINK\nDistance: ...` | confirmed |
| E-09 | **S3** | `matlab/smart_farm_complete.m:26-28` | Relies on auto-sanitised headers (`T.SoilMoisture___`, `T.Temperature__C_`, `T.AirHumidity___`) | MATLAB warns "Column headers … were modified" on every run | confirmed |
| E-10 | **S1/S2** | `systemc/smart_farm_systemc.cpp`, `README.md:36-42` | **SystemC library not installed**; README recipe is Linux-oriented (`lib-linux64`) | `fatal error: 'systemc' file not found` (T-13) | confirmed |
| E-11 | **S3** | `systemc/smart_farm_systemc.cpp:43-48` | Both `SC_THREAD`s sensitive to `clk.pos()`; read/write order of `soil`/`packet_valid` implementation-defined → potential race | static inspection (not executable here) | inspection |
| E-12 | **S3** | `vhdl/irrigation_controller.vhd:20-21` | Thresholds hard-coded, no generics | code inspection | inspection |

| E-13 | **S4** | `vhdl/irrigation_controller.vhd:28-34` | `packet_valid` is level-sensitive (sample enable) but documented as an event | code vs report §6 | inspection |
| E-14 | **S4** | `vhdl/*.o`, `vhdl/e~irrigation_controller_tb.o`, `vhdl/work-obj08.cf`, `vhdl/irrigation_controller_tb` | Build artifacts + a 1.3 MB macOS binary in the source tree; `e~…o` is a leftover of an aborted elaboration | directory listing | confirmed |
| E-15 | **S4** | `matlab/Figure_1.png` | Orphan figure (reception + pump, 2 panels) that no current script produces | current scripts produce a 3-subplot figure / one plot per figure | confirmed |
| E-16 | **S3** | project root | **No version control** (`.git` absent), no `.gitignore`, no CI, no run-all script, no tests | `git status` → "not a git repository"; no `Makefile`/`*.sh`/`*.yml` | confirmed |
| E-17 | **S4** | `VSCode-darwin-x64.dmg` | 304 MB unrelated installer inside the project (total 839 MB) | `du -sh` | confirmed |
| E-18 | **S3** | `.venv/`, `requirements.txt`, `README.md:15` | 533 MB venv in the project; deps unpinned (`>=`); README says Python 3.10+ but the env is 3.9.6; README uses system `pip` while the project uses the local venv | `pip list`, `pyvenv.cfg` | confirmed |
| E-19 | **S4** | `python_dashboard/app.py:66,69,73,76` | `use_container_width` deprecated (removed after 2025-12-31) | Streamlit 1.50 runtime warning | confirmed |
| E-20 | **S2** | `README.md`, docx, pptx | Documentation **stale/contradictory**: README says "a dedicated testbench should be added" (one exists); report/slides describe hysteresis + hold-on-loss that MATLAB does not implement; report appendix lists only 4 files; no figures; no speaker notes | content extraction (T-16) + code review | confirmed |
| E-21 | **S2** | 5 locations (§5.4) | LoRa link modelled **four different ways**, no single source of truth | §5.4 table | confirmed |
| E-22 | **S3** | `python_dashboard/app.py:25,52-55` | Packet loss independent of `distance` while RSSI/SNR depend only on distance; SNR −4.6 dB shown next to 97.5 % delivery | T-02/T-03: distance 450 → 2000 m did not change the loss model | confirmed |
| E-23 | **S4** | `matlab/*.m` | Scripts assume CWD = `matlab/` (`../data`, `../results`) and the README never says so | code inspection | inspection |

---

## 7. Inconsistencies between components

| Quantity | MATLAB `smart_farm_complete.m` | MATLAB `smart_farm_simulation.m` | Python dashboard (defaults) | VHDL | SystemC | CSV `Pump` column |
|----------|-------------------------------|----------------------------------|-----------------------------|------|---------|-------------------|
| Dry threshold | 30 (only) | 30 | 30 (adjustable) | 30 | 30 | 30 (implied) |
| Wet threshold | — | 40 | 40 (adjustable) | 40 | 40 | 40 (implied) |
| Hysteresis | **No** | Yes | Yes | Yes | Yes | Yes |
| Packet loss | read from CSV | `rand > 0.04` | `rng.random >= loss_pct/100` | none | `sample % 17` | pre-generated |
| Behaviour on packet loss | **pump forced OFF** ("safety mode") | hold | hold | hold | hold | (n/a) |
| Pump ON samples (same nominal 120-sample dataset) | **27** | 51 | **42** | n/a | n/a | **44** |
| Data source | `data/sensor_data.csv` | generated `rng(7)` | generated `default_rng(7)` | stimulus | internal ramp | — |

Four different "pump ON" numbers for what a reader will assume is the same experiment. Any of these can be defended
individually, but presenting them together in one report requires that the differences be **documented**, not accidental.

---

## 8. Duplicated code and single-source-of-truth violations

| Duplicated artefact | Copies | Risk |
|---------------------|--------|------|
| Irrigation hysteresis rule | 4 (`vhdl:29-33`, `systemc:32-35`, `app.py:30-33`, `smart_farm_simulation.m:31-35`) + 1 non-hysteresis (`smart_farm_complete.m:68`) | Thresholds can drift; no golden reference |
| Packet-loss model | 3 real models + 2 "none" (§5.4) | Results not comparable |
| RSSI/SNR formula | 2 (`app.py:52-54`, `smart_farm_simulation.m:19-21`) | Silent divergence if one is edited |
| Whole MATLAB script | 2 (`smarf.m`, `smart_farm_complete.m`) | 100 % duplicate (E-07) |
| Synthetic signal generator | 3 (`app.py`, `smart_farm_simulation.m`, `systemc`) | Different seeds/periods → different "sensor traces" |
| Figure-saving / output logic | 1 (MATLAB only) | VHDL/SystemC/Python produce no archived artifacts |


---

## 9. Missing files (needed for a complete, defensible deliverable)

| # | Missing file | Why it is needed | Priority |
|---|--------------|------------------|----------|
| M-01 | **Self-checking VHDL testbench** (or a fixed `irrigation_controller_tb.vhd`) | The current TB contains no DUT (E-01) — without this the VHDL part is not deliverable | P0 |
| M-02 | `vhdl/run_ghdl.sh` (or `Makefile` with `analyze/elaborate/run` targets incl. `--stop-time` and `--vcd`) | Reproducible one-command VHDL evidence | P0 |
| M-03 | `systemc/Makefile` + a real SystemC testbench (`smart_farm_systemc_tb.cpp`) + `smart_farm.h` | SystemC currently has no build recipe that works on macOS and no verification | P1 |
| M-04 | `python_dashboard/data_generator.py` (writes `data/sensor_data.csv` deterministically) + `data_loader.py` | Restores the broken Python→CSV→MATLAB pipeline (E-05, E-06) | P0 |
| M-05 | `python_dashboard/tests/test_logic.py` (pytest) | Automated pass/fail for the dashboard logic (hysteresis, packet loss, thresholds) | P1 |
| M-06 | `matlab/tests/verify_thresholds.m` (or a self-checking script with `assert`) | MATLAB runs but asserts nothing; `pumpON = 27` is never checked against an expectation | P1 |
| M-07 | `matlab/run_all.m` | Single entry point that runs the intended script(s) from any CWD (fixes E-23) | P2 |
| M-08 | `config/params.json` (thresholds, loss %, distance, seeds, TX power) consumed by all 4 languages | Single source of truth for the control law and link model (fixes §7, §8) | P1 |
| M-09 | `docs/figures/` + figures embedded in the DOCX/PPTX | The report and the deck currently contain **no images** while 5 PNGs sit unused in `results/` | P1 |
| M-10 | `.gitignore` (`.venv/`, `*.o`, `work-obj*.cf`, VHDL executables, `.DS_Store`, `*.dmg`) | Prevents committing 800 MB of junk and build artifacts (E-14, E-17, E-18) | P0 |
| M-11 | `requirements-lock.txt` (`pip freeze` output) | Reproducible Python environment (E-18) | P1 |
| M-12 | `docs/data_dictionary.md` (CSV schema, units, generation rule) | Answers "where does this CSV come from?" (E-05) | P2 |
| M-13 | `LICENSE` / authorship + course metadata (report has empty `Student: ______` / `Course: ______` fields) | Formalities of a graduation submission | P2 |
| M-14 | `AUDIT`-follow-up doc / `CHANGELOG.md` | Traceability of the fixes done after this audit | P3 |

---

## 10. Missing dependencies and installation requirements

### 10.1 Already satisfied on this machine (verified)

| Dependency | Version found | Used by |
|------------|---------------|---------|
| MATLAB | R2025a Update 1 (25.1.0.2973910) | `matlab/*.m` |
| GHDL | 5.1.1 LLVM, macOS x86_64 | `vhdl/*.vhd` |
| Python | 3.9.6 (`.venv` created from `/Library/Developer/CommandLineTools/usr/bin`) | `python_dashboard` |
| streamlit / pandas / numpy / plotly / scikit-learn | 1.50.0 / 2.3.3 / 2.0.2 / 7.1.0 / 1.6.1 | `python_dashboard` |
| Xcode Command Line Tools (clang++/g++) | present | SystemC build |

### 10.2 Missing (installation required — **I have not installed anything**)

| Dependency | Needed for | Notes / options to decide together |
|------------|------------|------------------------------------|
| **SystemC 2.3.4 or 3.0.0** (Accellera) | Compiling/running `systemc/smart_farm_systemc.cpp` | No package found under `/usr/local`, `/opt/homebrew`, `$HOME`. Options: (a) build Accellera SystemC from source into `~/systemc` (Safari/curl download + cmake + `make install`, ~5 min), (b) try a Homebrew formula if available, (c) skip SystemC and remove it from the deliverables. **Requires your approval.** |
| **cmake** (only if building SystemC from source) | SystemC build | **Also not installed** (`which cmake` → not found); SystemC can alternatively be built with the bundled Autotools/`configure` flow, which needs no cmake |
| **pytest** | `M-05` automated dashboard tests | `pip install pytest` inside `.venv` — requires approval |
| Python **3.10+** | Matches what the README claims | The `.venv` is 3.9.6; either upgrade the env or correct the README (E-18). `plotly 7.x` / `streamlit 1.50` work on 3.9 for now, but this is a latent problem |

### 10.3 Environment notes

* System Python is `/usr/bin/python3` (3.9.6, Apple). The README's `pip install -r requirements.txt` would install
  into a user/global site-packages, not into `.venv`. The correct invocation is `../.venv/bin/pip install -r requirements.txt`
  or activating the venv first.
* `ghdl` is on `PATH` only through `~/ghdl/ghdl-llvm-5.1.1-macos13-x86_64/bin` — worth documenting, since a fresh
  shell / another machine will not have it (E-20).
* MATLAB must be invoked as `/Applications/MATLAB_R2025a.app/bin/matlab -batch "<script>"` for headless runs;
  `matlab` is not on `PATH`.


---

## 11. Documentation and presentation review

### 11.1 `README.md` (2.1 KB, 49 lines)

Good: honest "software-only, no RF transmission" disclaimer; Streamlit run instructions; limitations section.
Problems:

* Lists only 4 source files — does not mention `data/`, `results/`, `matlab/smarf.m`,
  `matlab/smart_farm_complete.m` or `vhdl/irrigation_controller_tb.vhd` (all of which exist).
* Still says *"A dedicated testbench should be added for full signal-level verification"* — a testbench **does**
  exist (it is simply broken), so the sentence is misleading (E-20).
* GHDL section gives only `-a` and `-e`: no `-r`, no run example, no `--stop-time` warning (E-02).
* SystemC section is Linux-only (`lib-linux64`) — unusable on this macOS machine (E-10).
* Says "Python 3.10+" while the working environment is 3.9.6 (E-18).

### 11.2 `Smart_Farm_Technical_Report_EN.docx` (39 KB, 10 sections + appendix)

Well written and appropriately cautious about limitations (synthetic data, illustrative RSSI/SNR, ML not validated).
Problems:

* **Contradicts the code**: §5 states 30/40 hysteresis and "if a packet is lost the controller retains its previous
  state" — `smart_farm_complete.m` implements a single threshold and forces OFF on loss (E-03, E-04).
* §8 ("Expected Results and Verification") contains **no actual results**: no numbers, no figures, no screenshots.
  It literally says *"Actual runtime results should be recorded after running the software"* — although the numbers
  already exist in `results/smart_farm_summary.csv`. This is the weakest part of the report for an examiner.
* Appendix lists only `smart_farm_simulation.m`, `irrigation_controller.vhd`, `smart_farm_systemc.cpp`, `app.py` —
  the three files added later (`smarf.m`, `smart_farm_complete.m`, `irrigation_controller_tb.vhd`) are missing.
* SystemC is presented as part of "Software Implementation" although it has never been built here.
* Header fields still empty: `Student: ____________  Course: ____________  Year: 2026`.
* No embedded figures, only one small parameter table.

### 11.3 `Smart_Farm_Presentation_EN.pptx` (40 KB, 11 slides)

Structure is sound (motivation → architecture → parameters → LoRa model → irrigation logic → technologies → ML →
verification → limitations → conclusion). Problems:

* Slide 6 repeats the "hold previous state on packet loss" claim that MATLAB violates (E-04).
* Slide 3 promises a dashboard with "CSV history" — not implemented (E-06).
* Slide 9 ("Verification and Expected Behaviour") lists what the user *should* observe; there is **no slide with
  measured output** (no figure, no KPI table) — the same gap as report §8.
* **No images at all** and **no speaker notes** (T-16): 11 text-only slides will look thin next to the five unused
  figures in `results/`.
* No slide mentions the VHDL/GHDL evidence or the actual SystemC status.

### 11.4 `PROJECT_SCOPE.md` (0.9 KB)

Accurate and conservatively worded: it maps the topic row "Applicazioni in agricoltura, protocollo LoRa" to the three
ticked areas and explicitly warns against claiming compliance with unstated requirements. **No changes needed.**


---

## 12. Recommended next steps (ordered — nothing has been changed yet)

### Phase 0 — Safety net (≈30 min) — *do this before touching any code*

1. `git init`, add a `.gitignore` (`.venv/`, `*.o`, `work-obj*.cf`, `vhdl/irrigation_controller_tb`, `*.dmg`,
   `.DS_Store`), commit the current state as the baseline. Everything after this becomes reversible.
2. Decide the fate of `VSCode-darwin-x64.dmg` (move it out of the project) and `.venv` (keep locally, ignore it).
3. Freeze the environment: `../.venv/bin/pip freeze > requirements-lock.txt`.

### Phase 1 — Make the VHDL deliverable real (P0, ≈2–3 h)

4. Rewrite `irrigation_controller_tb.vhd` so that it (a) instantiates `irrigation_controller` with a `port map`,
   (b) checks the whole hysteresis state machine with `assert` (ON below 30, hold in 30–40, OFF above 40,
   hold when `packet_valid = '0'`, asynchronous reset), (c) ends with `std.env.finish` and prints `PASS`/`FAIL`.
5. Add `vhdl/run_ghdl.sh`: `analyze → elaborate → run --stop-time=… --vcd=…`; run it and archive the transcript
   in `results/`.
6. Optional but valuable: add `generic` thresholds so the RTL can mirror the dashboard settings (E-12).

### Phase 2 — Reproduce and reattach the data pipeline (P0, ≈1–2 h)

7. Add `python_dashboard/data_generator.py` that writes `data/sensor_data.csv` deterministically and regenerate the
   file from code (or clearly label it a frozen sample with documented parameters).
8. Let the dashboard optionally read the CSV ("generate / load dataset" switch) so that
   Python → CSV → MATLAB becomes a real pipeline (E-06).
9. Fix the MATLAB logic to match the documented law: 30/40 hysteresis, and a "safety mode" that *holds* instead of
   forcing OFF — or rename the figure to what it actually computes (E-03, E-04).
10. Remove `matlab/smarf.m` (or reduce it to a thin wrapper): one source of truth (E-07).

### Phase 3 — SystemC (P1, blocked by a decision)

11. With your approval: install SystemC (source build into `~/systemc`; the Autotools flow needs no cmake) →
    compile → run → capture the transcript. If installation is refused, **remove SystemC from the claims** and
    say so explicitly in the report.
12. Once it builds: split the module into a header, add a testbench with assertions on the pump waveform, and
    remove the clock-sensitivity race (E-11).

### Phase 4 — Automation and evidence (P1, ≈2 h)

13. Add `pytest` tests for the dashboard logic and a self-checking MATLAB verifier (e.g. `assert(pumpON == 27)`).
14. Add a top-level `run_all.sh` (or `Makefile`) that runs all four components and writes their transcripts into
    `results/`, so the whole project is one command.
15. Add a shared `config/params.json` (thresholds, loss %, distance, TX power, seed) used by all languages (§8).

### Phase 5 — Documentation truth-up (P1, ≈2 h)

16. Update `README.md`: real file list, correct GHDL commands (with `--stop-time`), macOS SystemC instructions,
    Python version, venv usage.
17. Update report §8 with the **actual** numbers from `results/smart_farm_summary.csv` and the regenerated figures,
    plus the real VHDL/SystemC status; fill in the student/course fields; fix the appendix file list.
18. Embed the five figures in the DOCX and in slides 3 / 6 / 9; add speaker notes.
19. State per technology whether it is *implemented / tested / verified* — reuse the table in §4.

### Phase 6 — Polish (P2, ≈1 h)

20. Fix the `\n` escapes (E-08); use `VariableNamingRule`/clean headers (E-09); replace `use_container_width`
    (E-19); remove the orphan `matlab/Figure_1.png` (E-15); clean the GHDL artifacts out of `vhdl/` (E-14).


---

## 13. Realistic completion checklist

Legend: **P0** = must exist before submission · **P1** = strongly expected · **P2** = polish.
Estimates assume one person who already knows the codebase.

### A. Verification (the part that decides the grade)

- [ ] **P0** Self-checking VHDL testbench (DUT instantiated + `assert` + `PASS/FAIL` + `std.env.finish`) — 2 h — *unblocks E-01/E-02*
- [ ] **P0** GHDL run script + archived transcript in `results/` — 0.5 h
- [ ] **P0** MATLAB logic aligned with the documented control law; "safety mode" figure corrected or renamed — 1 h
- [ ] **P1** `pytest` suite for the dashboard (hysteresis, thresholds, loss model, CSV export) — 1.5 h
- [ ] **P1** Self-checking MATLAB verification script — 0.5 h
- [ ] **P1** SystemC compiled and executed at least once, with an assertion-based testbench — 2–3 h (**needs install approval**)
- [ ] **P1** Console/waveform evidence archived for every component in `results/` — 1 h

### B. Integration (the "system" in "system simulation")

- [ ] **P0** Deterministic CSV generator; `data/sensor_data.csv` reproducible from code — 1 h
- [ ] **P1** Dashboard can load that CSV (closed Python → CSV → MATLAB loop) — 1 h
- [ ] **P1** Shared `config/params.json` used by all four languages — 1 h
- [ ] **P2** One command runs everything (`run_all.sh`) — 1 h

### C. Code hygiene

- [ ] **P0** `git init` + baseline commit + `.gitignore` — 0.5 h
- [ ] **P0** Remove the duplicate `matlab/smarf.m` — 0.1 h
- [ ] **P1** Remove `VSCode-darwin-x64.dmg` from the project; remove `*.o`/binary/`work-obj08.cf` from `vhdl/` — 0.2 h
- [ ] **P1** `requirements-lock.txt`; README venv/Python version corrected — 0.5 h
- [ ] **P2** Fix `\n` escapes, `use_container_width`, stale `matlab/Figure_1.png` — 0.5 h
- [ ] **P2** Generic (configurable) thresholds in the VHDL — 0.5 h

### D. Documentation

- [ ] **P0** Report §8 replaced with real measured results + figures — 1.5 h
- [ ] **P0** README rewritten (file list, macOS commands, `--stop-time`, venv) — 0.5 h
- [ ] **P0** Report and slides corrected (hysteresis, hold-on-loss) — 0.5 h
- [ ] **P1** Figures embedded in DOCX and PPTX + speaker notes — 1 h
- [ ] **P1** Explicit "implemented / tested / verified" table per technology — 0.5 h
- [ ] **P1** Student/course fields, appendix file list, data dictionary — 0.5 h

**Total realistic remaining effort ≈ 20–25 working hours**, of which roughly **4 h are P0 verification work** and
**2–3 h depend on the SystemC installation decision**.

---

## 14. What was NOT verified (explicit limitations of this audit)

To avoid overstating anything, these points remain **open**:

1. **SystemC behaviour is unknown** — the file was never compiled here (no library). All SystemC statements in this
   document are static code review only (E-11, §5.9).
2. **The VHDL RTL was never functionally exercised** — analysis and elaboration succeed, but no input/output
   behaviour of `irrigation_controller` has been observed, because the testbench does not connect to it. The RTL
   *looks* correct by inspection (state machine with two thresholds and a hold branch), but "looks correct" is not
   verification and is flagged as such in §4.
3. **MATLAB results were reproduced, not independently re-derived.** I did not recompute the LoRa/RSSI/SNR formulas
   from a propagation model — they are the project's own illustrative formulas.
4. **The dashboard's ML classifier** was executed (no exceptions) but its accuracy/meaningfulness was not evaluated;
   it is trained on synthetic data with a synthetic label rule, as the project itself states.
5. **The DOCX/PPTX were inspected textually** (XML extraction). I did not verify fonts, layout, slide design,
   or whether they open correctly in PowerPoint on your machine.
6. **No file in the project was modified, deleted or created except this report** — the tests used copies in
   `/private/tmp/sf_audit/`. The existing `vhdl/` build artifacts were left untouched (only executed read-only in T-15).

---

## 15. Appendix — commands used in this audit (reproducible)

```bash
# --- Python dashboard -------------------------------------------------------
/Users/gtx-z/Downloads/SmartFarm_Simulation_English/.venv/bin/python -m py_compile python_dashboard/app.py
# (AppTest harness used streamlit.testing.v1.AppTest with the project venv)

# --- MATLAB (run from a copy, CWD must be matlab/) --------------------------
/Applications/MATLAB_R2025a.app/bin/matlab -batch "smart_farm_complete"
/Applications/MATLAB_R2025a.app/bin/matlab -batch "smarf"
/Applications/MATLAB_R2025a.app/bin/matlab -batch "smart_farm_simulation"

# --- GHDL (run from vhdl/, output redirected to a temp workdir) -------------
ghdl -a --std=08 --workdir=/private/tmp/sf_audit/g irrigation_controller.vhd irrigation_controller_tb.vhd
ghdl -e --std=08 --workdir=/private/tmp/sf_audit/g -o /private/tmp/sf_audit/g/tb2 irrigation_controller_tb
/private/tmp/sf_audit/g/tb2 --stop-time=200ns --vcd=/private/tmp/sf_audit/g/tb.vcd
grep '%' /private/tmp/sf_audit/g/tb.vcd      # → pump_enable stays 'U'

# --- SystemC (expected to fail until the library is installed) --------------
g++ -std=c++17 -I/usr/local/include -I/opt/homebrew/include \
    systemc/smart_farm_systemc.cpp -lsystemc -o /tmp/sf_audit/sf_sysc
# → fatal error: 'systemc' file not found

# --- Data lineage -----------------------------------------------------------
# recompute app.py's signal chain with seed 7 / 120 samples / 4 % loss and diff against data/sensor_data.csv
```


---

## 16. Post-audit change log

### 2026-11-08 — Python dashboard rebuilt around the recorded dataset

Scope: `python_dashboard/app.py` rewritten (821 lines, was 80), `python_dashboard/tests/run_tests.py` added.
The previous version is preserved in git history (commit `00a545e`).

| Audit item | Status after this change |
|------------|--------------------------|
| E-06 — dashboard never reads `data/sensor_data.csv` | **Resolved.** The dashboard loads the CSV via `__file__`-relative path (CWD-independent), validates it and never generates random values. |
| E-19 — deprecated `use_container_width` | **Resolved.** No deprecated arguments are used any more (verified: no Streamlit warnings in the server log). |
| E-22 — RSSI/SNR decoupled from packet loss | **Resolved by removal.** The dataset contains no distance/RSSI/SNR, so the fabricated radio metrics were dropped; the Communication tab now reports only measured link statistics. |
| M-05 — no automated tests for the dashboard | **Resolved.** `python_dashboard/tests/run_tests.py` runs 13 self-checking assertions: 13/13 pass. |
| E-05 — CSV not reproducible from code | **Still open.** The dashboard can now be used to verify a regenerated CSV, but no generator script exists yet. |

Verified behaviour (executed, not assumed):

* `st.metric` values match the CSV exactly: 120 samples, 116 received / 4 lost (96.7 % delivery),
  44 pump-ON rows, mean soil 41.4 %, mean air 25.4 °C, mean humidity 54.2 %.
* Replaying the documented 30 %/40 % hysteresis law on the CSV reproduces the recorded pump state on
  **120/120 samples (100 % agreement)** — this confirms the dataset itself was produced with hysteresis,
  which is the behaviour `matlab/smart_farm_complete.m` does *not* implement (E-03).
* Error paths: missing file, wrong header and dirty values all produce operator messages instead of exceptions.
* Real server launch: `streamlit run python_dashboard/app.py` answers `HTTP 200` on `/_stcore/health`.

### 2026-11-08 — Dataset analysis added

Scope: `DATA_ANALYSIS.md` created. The analysis is **read-only**: `data/sensor_data.csv` was not modified
(MD5 `9a8343666e45799de22dca5cdbeb977c` before and after).

Measured results: 120 samples, 0 missing values, 0 duplicate samples, 0 out-of-range readings,
116 received / 4 lost (PDR 96.67 %, PLR 3.33 %), 44 pump-ON rows, means 41.43 % / 25.44 °C / 54.24 %.
The dataset follows the documented 30/40 hysteresis law on **120/120 samples (100 %)** and keeps the pump state on
every lost packet, whereas `results/smart_farm_summary.csv` reports `pumpON = 27` because
`matlab/smart_farm_complete.m` uses a single threshold and ignores the stored `Pump` column (E-03 now confirmed
with data, registered as finding D-03).

**End of audit.**

### 2026-11-08 — LoRa link-level simulation added

Scope: `matlab/functions/lora_default_config.m`, `lora_time_on_air.m`, `lora_link_budget.m`,
`lora_simulate_link.m` and `matlab/lora_link_simulation.m` added; `LORA_SIMULATION.md` created.
**No existing file was modified** — the new code only calls `load_sensor_data.m`, `irrigation_control.m` and
`packet_statistics.m`, so the MATLAB suite still passes 22/22 and the dashboard suite 13/13.

| Audit item | Status after this change |
|------------|--------------------------|
| E-21 — LoRa modelled four incompatible ways, no single source of truth | **Resolved for MATLAB.** One documented link model (airtime + link budget + PER) replaces the constant-4 % coin flip; the Python/SystemC variants remain statistical traces by design and are documented as such. |
| E-22 — packet loss decoupled from distance/SNR | **Resolved for MATLAB.** Reception is now derived from the link margin, which depends on distance, SF, BW, TX power and channel parameters. |
| D-04 — no radio-metric columns in the dataset | **Mitigated.** The model computes Prx/SNR/margin per packet and exports them to `results/lora_link_trace.csv`; the dataset itself is untouched. |

Verified behaviour (executed, not assumed): 15/15 self-checks pass; airtime SF7 = 46.336 ms and SF12 = 1155.072 ms
(match the published Semtech calculator); SF7 sensitivity −123.03 dBm; nominal link at 450 m has +31.53 dB margin
→ PDR 100 %; simulated range for PDR ≥ 90 % ≈ 3.6 km; burst outage 82.5 % PDR with a 21-packet blind period;
interference window drops PDR inside the window from 62.5 % to 28.6 %; the fail-safe watchdog differs from "hold"
on 19 samples during the outage (25 vs 44 pump-ON samples).

### 2026-11-08 — MATLAB folder restructured and verified

Scope: `matlab/smart_farm_complete.m` rewritten as a self-checking orchestrator, 9 reusable functions added under
`matlab/functions/`, `matlab/smarf.m` reduced to a deprecated wrapper, `matlab/smart_farm_simulation.m` escape bug
fixed, `MATLAB_RESULTS.md` created. The previous scripts are preserved in git history.

| Audit item | Status after this change |
|------------|--------------------------|
| E-03 — MATLAB used a single threshold instead of 30/40 hysteresis | **Resolved.** `irrigation_control.m` implements the documented law; agreement with the recorded pump is **100 %** (was 85.83 %). |
| E-04 — "communication failure mode" forced the pump OFF instead of holding | **Resolved.** Documented `hold` + explicit `failSafe` watchdog strategies; the mislabelled `pumpSafe` logic is gone. |
| E-07 — `smarf.m` duplicate of `smart_farm_complete.m` | **Resolved.** `smarf.m` is now a wrapper, so there is a single implementation. |
| E-08 — literal `\n` in `smart_farm_simulation.m` output | **Resolved.** |
| E-09 — reliance on auto-sanitised column names | **Resolved.** `VariableNamingRule='preserve'` + punctuation-insensitive column matching. |
| E-23 — scripts only worked from `matlab/` | **Resolved.** Paths derived from `mfilename('fullpath')`; verified from `/tmp`. |
| M-06 — no self-checking MATLAB verification | **Resolved.** 22 checks with tolerances: **22/22 pass**. |

Verified behaviour (executed, not assumed): 120/120 rows loaded with 0 drops, means 41.4256 % / 25.4417 °C /
54.2380 %, PDR 96.666667 %, PLR 3.333333 %, 44 pump-ON samples for the documented law vs 27 for the legacy rule,
0 pump changes on lost packets, 8 figures + 3 CSV files regenerated into `results/`.
The communication-failure comparison uses a clearly labelled synthetic outage (samples 90–110): the fail-safe
watchdog drops the pump 19 samples earlier than "hold" (25 vs 44 ON samples).



**End of audit.**
