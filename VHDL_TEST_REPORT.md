# VHDL TEST REPORT — Irrigation Controller

**Project:** Smart Farm Monitoring and Automated Irrigation System
**Design under test:** `vhdl/irrigation_controller.vhd` (RTL), `vhdl/irrigation_controller_tb.vhd` (testbench)
**Simulator:** GHDL **5.1.1** (LLVM 20.1.6, macOS x86_64), VHDL-2008 (`--std=08`)
**Host:** macOS Intel · **Date:** 2026-11-08
**Overall result:** compilation **OK** · elaboration **OK** · synthesis **OK** · simulation **OK** ·
**69/69 assertions PASS**, exit code **0**

> This report only contains results that GHDL actually produced. The transcript of the run that
> produced them is archived at `results/vhdl_simulation.log`.

---

## 1. Environment verification

```
$ ls -la ~/ghdl/ghdl-llvm-5.1.1-macos13-x86_64/bin/ghdl
-rwxr-xr-x@ 1 gtx-z staff 7340336 Jun 18 2025 .../bin/ghdl

$ ~/ghdl/ghdl-llvm-5.1.1-macos13-x86_64/bin/ghdl --version
GHDL 5.1.1 (4.1.0.r775.g91725e47f) [Dunoon edition]
 Compiled with GNAT Version: 14.2.0
 llvm 20.1.6 code generator
```

The executable exists at the expected path, is on `PATH`, and supports VHDL-2008.

---

## 2. Inspection of the original files

### 2.1 `irrigation_controller.vhd` — RTL

| Item | Checked | Result |
|---|---|---|
| `library` / `use` clauses | `ieee.std_logic_1164`, `ieee.numeric_std` | correct |
| Entity name / ports | `clk, reset_n, packet_valid, soil_moisture(7:0), pump_enable` | correct, synthesizable types |
| Architecture | single clocked process, asynchronous reset, single driver | correct, no latches |
| Signal declarations | `pump_state : std_logic := '0'` | correct, safe initial value |
| Threshold implementation | `DRY_LIMIT`/`WET_LIMIT` as **fixed constants** | worked, but not configurable |
| Sample validation | none — a value of 150 % would be treated as a wet reading | **missing** |
| Behaviour on lost packet | hold previous state (hard-wired) | documented, but not selectable |
| Generic guards | none | **missing** |

### 2.2 `irrigation_controller_tb.vhd` — testbench (original)

| Item | Result |
|---|---|
| `pump_enable` signal declared | yes — **but nothing drives it** |
| DUT instantiation (`uut` / `port map`) | **absent** |
| Assertions (`assert ... report ... severity`) | **absent** |
| Self-termination | `wait;` → runs forever without `--stop-time` |
| Evidence | the original testbench was executed: its complete output is 2 lines — `Simulation finished` at 100 ns and `simulation stopped by --stop-time` — i.e. **zero checks** |

**Conclusion:** the original testbench generated stimulus but was not connected to the design, so it could
never fail and verified nothing (audit items E-01/E-02). The RTL itself was functionally plausible but had no
verification and two missing safety features (sample validation, configurable fail-safe behaviour).

---

## 3. Improvements applied

### 3.1 RTL (`irrigation_controller.vhd`)

* Ports unchanged (`clk, reset_n, packet_valid, soil_moisture, pump_enable`) → **no other file needs to change**.
* Four new **generics** with the previously hard-coded values as defaults (backward compatible):
  `DRY_THRESHOLD` (30), `WET_THRESHOLD` (40), `HYSTERESIS_ENABLE` (true), `FAILSAFE_ON_LOSS` (false).
* **Sample validation**: a sample is valid only when `packet_valid = '1'` **and** `soil_moisture <= 100`;
  physically impossible values are handled like a lost packet instead of driving the actuator with corrupt data.
* **Elaboration/simulation-start guard**: `assert WET_THRESHOLD > DRY_THRESHOLD severity failure`.
* Explicit, documented if-chain for the three decision branches (irrigate / hysteresis / single threshold).

### 3.2 Testbench (`irrigation_controller_tb.vhd`) — rewritten

* **Three DUT instances** receive the same stimulus, each with a different generic configuration, so the
  behaviour is verified for every supported configuration:

| Instance | `HYSTERESIS_ENABLE` | `FAILSAFE_ON_LOSS` | Behaviour implemented |
|---|---|---|---|
| `dut_hold` | true | false | documented project law: hysteresis + hold on loss (default) |
| `dut_failsafe` | true | true | documented law + fail-safe OFF when telemetry is lost |
| `dut_strict` | false | true | single threshold (≥ 30 % → OFF) + safe state OFF — the **strict wording of requirements 2 and 3** |

* Self-checking: a local `check` procedure counts passes/failures and reports the **observed value** on every
  line (`PASS | hold | ... -> '1'`).
* Self-terminating: `std.env.finish(0/1)` → no hang, meaningful exit code for automation.
* 23 stimulus steps × 3 DUTs = **69 assertions**.

---

## 4. Compilation and simulation status

| Step | Command (VHDL-2008) | Status |
|---|---|---|
| 1. Analyze RTL + TB | `ghdl -a --std=08 --workdir=build irrigation_controller.vhd irrigation_controller_tb.vhd` | **OK** — no error, no warning |
| 2. Elaborate DUT with default generics | `ghdl -e --std=08 --workdir=build -o build/irrigation_controller irrigation_controller` | **OK** (proves the new generics are backward compatible) |
| 3. Elaborate testbench | `ghdl -e --std=08 --workdir=build -o build/irrigation_controller_tb irrigation_controller_tb` | **OK** |
| 4. Run simulation | `build/irrigation_controller_tb --stop-time=10us --vcd=build/irrigation_controller_tb.vcd` | **OK** — `simulation finished @256ns with status 0` |
| 5. Analyze with extended warnings | `ghdl -a --std=08 -Wunused -Wsensitivity -Wport-bounds -Wparenthesis ...` | **OK** — 0 warnings |
| 6. Synthesis check | `ghdl --synth --std=08 vhdl/irrigation_controller.vhd -e irrigation_controller` | **OK** — RTL synthesizes (no latches, no unsupported constructs) |

The simulation **terminates by itself** at 256 ns through `std.env.finish(0)`; `--stop-time=10us` is only a
safety net, so the testbench no longer depends on an external stop condition.

---

## 5. Test cases, expected and actual results

Notation: **expected/actual** pump output for the three instances (`1` = pump ON, `0` = pump OFF).
Actual values are taken from the GHDL transcript (`results/vhdl_simulation.log`).

| # | Stimulus (soil % / telemetry) | Test case | hold exp/act | failsafe exp/act | strict exp/act | Requirement |
|---|---|---|---|---|---|---|
| 1 | — / — | asynchronous reset | 0/0 | 0/0 | 0/0 | safe state |
| 2 | 20 % / valid | **dry soil** | 1/1 | 1/1 | 1/1 | **1** |
| 3 | 35 % / valid | **normal (band) soil** | 1/1 | 1/1 | 0/0 | 2 (strict) / hysteresis |
| 4 | 45 % / valid | **wet soil** | 0/0 | 0/0 | 0/0 | **2** |
| 5 | 35 % / valid | band after stop (hold) | 0/0 | 0/0 | 0/0 | hysteresis |
| 6 | 20 % / **lost** | comms lost while pump OFF | 0/0 | 0/0 | 0/0 | **3** |
| 7 | 20 % / valid | telemetry restored | 1/1 | 1/1 | 1/1 | 1 |
| 8 | 20 % / **lost** | **comms lost while pump ON** | 1/1 | 0/0 | 0/0 | **3** (fail-safe) |
| 9 | 20 % / valid | telemetry restored again | 1/1 | 1/1 | 1/1 | 1 |
| 10 | 30 % / valid | exact dry threshold | 1/1 | 1/1 | 0/0 | 2 (≥ threshold → OFF) |
| 11 | 29 % / valid | just below dry threshold | 1/1 | 1/1 | 1/1 | 1 |
| 12 | 40 % / valid | exact wet threshold | 1/1 | 1/1 | 0/0 | 2 (≥ threshold → OFF) |
| 13 | 41 % / valid | just above wet threshold | 0/0 | 0/0 | 0/0 | 2 |
| 14 | 20 % / valid | dry again | 1/1 | 1/1 | 1/1 | 1 |
| 15 | 150 % / valid | out-of-range sample | 1/1 | 0/0 | 0/0 | invalid data → safe handling |
| 16 | 20 % / valid | recovery after invalid sample | 1/1 | 1/1 | 1/1 | 1 |
| 17 | 100 % / valid | maximum valid value (wet) | 0/0 | 0/0 | 0/0 | 2 |
| 18 | 101 % / valid | invalid percentage | 0/0 | 0/0 | 0/0 | invalid data |
| 19 | 20 % / valid | repeatability 1/3 | 1/1 | 1/1 | 1/1 | **4** |
| 20 | 20 % / valid | repeatability 2/3 | 1/1 | 1/1 | 1/1 | **4** |
| 21 | 20 % / valid | repeatability 3/3 | 1/1 | 1/1 | 1/1 | **4** |
| 22 | — / — | asynchronous reset **without a clock edge** | 0/0 | 0/0 | 0/0 | safe state |
| 23 | 20 % / valid | restart after reset | 1/1 | 1/1 | 1/1 | 1 |

**Actual results: 69 assertions executed, 69 PASS, 0 FAIL.**
Raw evidence (last lines of the transcript):

```
vhdl/irrigation_controller_tb.vhd:265:9:@256ns:(report note):
    ==== irrigation_controller_tb: 69 checks, 0 failure(s) ====
vhdl/irrigation_controller_tb.vhd:270:13:@256ns:(report note): RESULT: PASS
simulation finished @256ns with status 0
```

---

## 6. Requirement traceability

| Functional requirement | Implemented by | Verified by |
|---|---|---|
| 1. soil < threshold **and** comms available → pump ON | `moisture < DRY_THRESHOLD` branch (all configurations) | tests 2, 7, 9, 11, 14, 16, 19–21, 23 |
| 2. soil ≥ threshold → pump OFF | `dut_strict` (`HYSTERESIS_ENABLE = false`): any value ≥ 30 % → OFF. The **default** configuration implements the documented hysteresis law instead (OFF only **above** 40 %, state held in 30–40 %) | strict: tests 3, 10, 12, 17, 18; hysteresis: tests 4, 13 |
| 3. comms unavailable → defined safe state **OFF** | `FAILSAFE_ON_LOSS = true` (`dut_failsafe`, `dut_strict`). The **default** configuration keeps the previous state ("hold"), as documented in the project report | tests 6 and **8** |
| 4. consistent behaviour for all test cases | deterministic single-clock state machine, no uninitialised state, asynchronous reset | tests 19–21 (repeatability), 22 (async reset) and the full 69-check run |

> **Important design note.** Requirements 2 and 3 as written ("≥ threshold → OFF", "no comms → OFF") correspond to
> `HYSTERESIS_ENABLE = false`, `FAILSAFE_ON_LOSS = true` — the `dut_strict` configuration, which is **verified and
> passing**. The shipped default keeps `HYSTERESIS_ENABLE = true`, `FAILSAFE_ON_LOSS = false` because that is the
> control law documented in the technical report, slide 6, the MATLAB model and the recorded dataset (which the
> MATLAB replay reproduces on 120/120 samples). Both behaviours are therefore available and tested; switching is a
> one-line generic override, e.g.:
>
> ```vhdl
> uut : entity work.irrigation_controller
>     generic map (HYSTERESIS_ENABLE => false, FAILSAFE_ON_LOSS => true)
>     port map (...);
> ```
>
> The documentation and the RTL must eventually agree on one law; this is recorded as an open item below.


---

## 7. Defects found and fixed during this verification

### 7.1 Defect in the original testbench (critical)

* **Symptom:** the simulation "passed" (`Simulation finished`, exit code 0) although the design was never
  connected and `pump_enable` stayed at `'U'`.
* **Cause:** no instantiation (`uut`/`port map`), no assertions, no termination condition.
* **Fix:** testbench rewritten with three DUT instances, 69 assertions, `std.env.finish`.
* **Evidence it was broken:** running the original testbench produces exactly two lines and **zero checks**
  (`Simulation finished` @100 ns, then stopped by `--stop-time`).

### 7.2 Real RTL defect caught by the new testbench (wet-threshold boundary)

* **Symptom (first run):** 67 PASS / **2 FAIL** —
  `FAIL | hold | exact wet threshold 40 % | expected '1' but got '0'` (same for `failsafe`).
* **Cause:** the first refactored version evaluated
  `elsif (not HYSTERESIS_ENABLE) or (moisture >= WET_THRESHOLD)` — that switched the pump **OFF at exactly 40 %**,
  whereas the documented law stops only when the moisture is **strictly above** 40 %.
  This would have broken the "100 % agreement with the recorded pump" property of the dataset.
* **Fix:** the branch was split into an explicit hysteresis branch (`moisture > WET_THRESHOLD`) and an explicit
  single-threshold branch (any value ≥ `DRY_THRESHOLD` → OFF).
* **Re-run after the fix:** **69/69 PASS, exit code 0** (`simulation finished @256ns with status 0`).

This is exactly the situation the testbench exists for: the defect was invisible in the original code base
(which had no checks) and would have produced a wrong pump command at exactly 40 % soil moisture.

### 7.3 Generic consistency guard

A deliberately inconsistent instantiation (`DRY_THRESHOLD => 40, WET_THRESHOLD => 30`) was elaborated and run:

```
vhdl/irrigation_controller.vhd:69:5:@0ms:(assertion failure):
    irrigation_controller: WET_THRESHOLD must be greater than DRY_THRESHOLD
...error: simulation failed      (exit code 1)
```

The guard fires at simulation start (time 0). Note: it is a **run-time** check, not an elaboration-time check —
`ghdl -e` alone does not execute it.

---

## 8. Timing behaviour observed

* The pump output is **registered**: a sample applied before a rising clock edge changes `pump_enable`
  **one clock period later** (10 ns with the testbench clock). Checks are therefore made 1 ns after each
  rising edge; the first assertion appears at 46 ns after the 45 ns edge.
* `reset_n` is **asynchronous and dominant**: driving it low forces the output to `'0'` immediately, without
  waiting for a clock edge (test 22 proves this by checking 1 ns after the reset assertion).
* Total simulated time: **256 ns** (≈ 25 clock cycles).

---

## 9. How to reproduce

```bash
cd /Users/gtx-z/Downloads/SmartFarm_Simulation_English/vhdl
./run_ghdl.sh          # analyze -> elaborate -> run; transcript copied to ../results/vhdl_simulation.log
echo $?                # 0 = all 69 checks passed
```

`run_ghdl.sh` compiles everything into `vhdl/build/` (git-ignored), so the source directory stays clean, and it
accepts an alternative simulator path with `GHDL=/path/to/ghdl ./run_ghdl.sh`.

Equivalent manual commands:

```bash
GHDL=~/ghdl/ghdl-llvm-5.1.1-macos13-x86_64/bin/ghdl
mkdir -p build
$GHDL -a --std=08 --workdir=build irrigation_controller.vhd irrigation_controller_tb.vhd
$GHDL -e --std=08 --workdir=build -o build/irrigation_controller_tb irrigation_controller_tb
build/irrigation_controller_tb --stop-time=10us --vcd=build/irrigation_controller_tb.vcd
```


---

## 10. Limitations and open items

1. **The documentation and the RTL must agree on one control law.** The report/slides/MATLAB use hysteresis +
   hold-on-loss; requirements 2 and 3 as written describe a single threshold + fail-safe OFF. Both are implemented
   and verified, but only one can be the "documented" behaviour. Recommendation: keep the documented law as the
   default (as done here) **or** update the report, the MATLAB model and the dataset together.
2. **Simulation only.** No FPGA board, pin constraints, static timing analysis or post-synthesis timing simulation
   was performed. `ghdl --synth` proves the RTL *can* be synthesized, not that it meets timing on a device.
3. **`soil_moisture` is 8 bits (0…255)** while only 0…100 is meaningful; the design rejects values above 100, but
   the real sensor interface (ADC scaling, saturation) is outside this design.
4. **No time filtering**: one sample can change the decision. In the field a median or moving average over several
   packets would normally be added.
5. **`packet_valid` is level-sensitive** (valid at this clock edge), not edge-triggered; the testbench documents
   this by holding it stable across the sampling edge.
6. **No coverage metric**: the checks cover the requirements and the boundaries, but there is no functional-coverage
   report (e.g. GHDL `--coverage`) — that is the next verification step.
7. **Other project files were intentionally not modified** (MATLAB, Python, SystemC, README). The README still says
   *"a dedicated testbench should be added"*, which is now out of date (audit item E-20).
8. **Stale build artefacts** from the previous flow (`irrigation_controller.o`, `irrigation_controller_tb.o`,
   `e~irrigation_controller_tb.o`, `work-obj08.cf` and the old `irrigation_controller_tb` binary) are still present in
   `vhdl/`. They are git-ignored and no longer used — `run_ghdl.sh` builds into `vhdl/build/` — but they should be
   deleted to avoid confusing a reader or an older compile command.

---

## 11. Summary

| Question | Result |
|---|---|
| GHDL executable and version verified? | **Yes** — `~/ghdl/ghdl-llvm-5.1.1-macos13-x86_64/bin/ghdl`, GHDL 5.1.1 (LLVM) |
| Entity / architecture / signals / ports verified? | **Yes** — §2.1; ports unchanged and synthesizable |
| Testbench verified? | The original testbench was **unusable** (no DUT, no assertions) and was rewritten |
| Compilation (VHDL-2008) | **OK** — no errors, no warnings (also with extended warning flags) |
| Elaboration | **OK** — DUT with default generics + testbench |
| Synthesis check | **OK** — `ghdl --synth` completes |
| Simulation | **OK** — `simulation finished @256ns with status 0` |
| Assertions | **69/69 PASS, 0 FAIL** |
| Defects found | 1 critical (original testbench) + 1 real RTL threshold bug (fixed and re-verified) |
| Test cases included | dry soil, normal/band soil, wet soil, communication failure, exact thresholds, out-of-range data, repeatability, asynchronous reset |

