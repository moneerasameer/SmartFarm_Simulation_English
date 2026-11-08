# SYSTEMC TEST REPORT — Smart Farm Simulation

**Project:** Smart Farm Monitoring and Automated Irrigation System
**Component:** `systemc/` — system-level model (sensor node → LoRa link → gateway processing → irrigation controller → pump)
**Language / library:** C++17 + **SystemC 2.3.4-Accellera**
**Toolchain:** Apple clang 21.0.0 (x86_64), GNU make 3.81, CMake 3.25.0, macOS 26.7 Intel
**Date:** 2026-11-08
**Hardware:** **none** — no radio, sensor, pump or FPGA is connected. Everything in this report is simulated.

> **Status: COMPILED AND EXECUTED ON THIS MACHINE.**
> `build/smart_farm` was built with clang++ against `~/systemc/lib/libsystemc.a` and run:
> **14/14 checks PASS, exit code 0**. The transcript is archived at `results/systemc_simulation.log`.
> Nothing in this report is a projection or an assumption about what the code *would* do.

---

## 1. Answers to the four questions

| # | Question | Answer (verified on this machine) |
|---|---|---|
| 1 | Do SystemC source files already exist? | **Yes — one file.** `systemc/smart_farm_systemc.cpp`, 59 lines: one `SC_MODULE(SmartFarm)` with two `SC_THREAD`s and an ad-hoc `sc_main`. No header, no testbench, no build file, no assertions. |
| 2 | Is SystemC installed? | **It was NOT** (no headers/lib anywhere; no Homebrew, no pkg-config). **It is now** — built from the official Accellera source into `~/systemc` after your approval (§2). |
| 3 | Is the compiler available? | **Yes.** Apple clang 21.0.0, target `x86_64-apple-darwin25.6.0`, plus GNU make 3.81. CMake 3.25 was already present inside the MATLAB installation. |
| 4 | Could the existing SystemC code compile on macOS Intel? | **No, not before the installation.** The compiler stopped immediately: `smart_farm_systemc.cpp:1:10: fatal error: 'systemc' file not found`. After installation it compiles **and runs** (§4.3). |

---

## 2. What was installed (and why it needed two attempts)

| Step | Result |
|---|---|
| Download official source | `github.com/accellera-official/systemc/archive/refs/tags/2.3.4.tar.gz` (2.7 MB) — this is the link accellera.org now publishes; the old `accellera.org/images/.../systemc-2.3.4.tar.gz` URL returns **404** |
| Autotools build (`./configure && make`) | **FAILED**: the GitHub tarball does not contain the generated `src/Makefile.in` → `config.status: error: cannot find input file: 'src/Makefile.in'`. No `autoconf`/`automake` on the machine to regenerate it. |
| CMake build (CMake reused from MATLAB) | **SUCCESS** — `cmake --install` → `~/systemc/include/systemc.h` + `~/systemc/lib/libsystemc.a` |
| First link test | **FAILED**: `Undefined symbols: ___sanitizer_start_switch_fiber / ___sanitizer_finish_switch_fiber`, referenced from `sc_cor_qt.cpp.o` (QuickThreads coroutine package) |
| Rebuild with `-DENABLE_PTHREADS=ON` | **SUCCESS** — link and run clean |
| Smoke test | `SystemC 2.3.4-Accellera` banner, time resolution `1 ps` |

Nothing was installed system-wide, with `sudo`, or via Homebrew: everything lives in `~/systemc`.

---

## 3. Architecture of the new implementation

```
systemc/
├── smart_farm_main.cpp            sc_main + exit codes (0/1/2)
├── smart_farm_systemc.cpp         legacy single-file prototype (unchanged)
├── Makefile                       auto-detects SystemC, builds build/smart_farm
├── run_systemc.sh                 build + run + archive transcript
├── README.md                      architecture, build, SystemC installation
└── src/
    ├── smart_farm_types.h         thresholds (30/40), zone encoding, scripted scenario
    ├── sensor_monitor.h           SC_MODULE SensorMonitor    (sensor node)
    ├── lora_link.h                SC_MODULE LoRaLink         (packet delivery)
    ├── soil_moisture_processor.h  SC_MODULE SoilMoistureProcessor (classification)
    ├── irrigation_controller.h    SC_MODULE IrrigationController (hold / fail-safe)
    ├── pump_actuator.h            SC_MODULE PumpActuator     (ON/OFF + statistics)
    └── smart_farm_tb.h            SC_MODULE SmartFarmTB      (wiring + stimulus + checks)
```

| Module | Ports (in → out) | Behaviour |
|---|---|---|
| `SensorMonitor` | `clk, step_index` → `soil_moisture, sample_ready, air_temperature, air_humidity` | one sample per clock cycle; soil moisture from the scripted scenario, temperature/humidity synthetic and documented |
| `LoRaLink` | `clk, link_ok, sample_ready, soil_in` → `soil_out, packet_ready` | register stage: payload and `packet_ready` are published together, so a reader can never see a valid flag with a stale payload; counts sent/delivered/lost/outage |
| `SoilMoistureProcessor` | `clk, soil_in, packet_ready` → `zone, valid` | dry / band / wet classification; holds the last class and asserts `valid=0` when data is missing |
| `IrrigationController` | `clk, soil, packet_ready` → `pump_cmd` | documented law; `hold` or `fail-safe` policy chosen in the constructor |
| `PumpActuator` | `clk, pump_cmd` → `running` | registers the command, prints transitions, counts ON cycles / starts |
| `SmartFarmTB` | — | instantiates the 7 modules, binds 14 signals, drives 7 scenario steps, performs the checks |

All modules are `SC_METHOD`s on `clk.pos()` (no threads in the datapath): the model is deterministic and free of
the delta-cycle race that the legacy file has.

---

## 4. Compilation and simulation status

### 4.1 Build

```
$ cd systemc && ./run_systemc.sh
SystemC home : /Users/gtx-z/systemc
SystemC lib  : /Users/gtx-z/systemc/lib
compiler     : clang++
target       : build/smart_farm
clang++ -std=c++17 -O2 -g -Wall -Wextra -Isrc -I/Users/gtx-z/systemc/include \
        smart_farm_main.cpp -o build/smart_farm -L/Users/gtx-z/systemc/lib -lsystemc -lpthread
```

**Result: compiles and links with no warnings from the project code.**
The only warning emitted is inside SystemC's own header
(`sc_fifo.h:331: variable 'j' set but not used`), which is not our code.

### 4.2 Run

```
$ ./build/smart_farm
...
SIMULATION SUMMARY
 simulated time          : 56500 ms
 sensor samples          : 57
 packets sent/delivered  : 55 / 39
 packets lost            : 16  (longest outage 8 cycles)
 valid / invalid samples : 38 / 19
 controller 'hold'       : ON 39 cycles, 2 activation(s), 0 trip(s)
 controller 'fail-safe'  : ON 33 cycles, 3 activation(s), 1 trip(s)
 pump 'hold'             : ON 38 / OFF 19 cycles, 2 start(s)
 pump 'fail-safe'        : ON 32 / OFF 25 cycles, 3 start(s)
 checks executed         : 14
 checks failed           : 0
 RESULT                  : PASS
```

`sc_main exit code: 0 (PASS)` — the process return value is checked by `run_systemc.sh`.

### 4.3 The legacy file, for completeness

```
$ clang++ -std=c++17 -I$HOME/systemc/include -L$HOME/systemc/lib smart_farm_systemc.cpp -lsystemc -lpthread ...
$ ./legacy
0 s | soil=24% | packet=0 | pump=0
1 s | soil=25% | packet=1 | pump=1
...
```
It compiles and runs, but it contains **no assertions**: it produces a trace and no verdict.

---

## 5. Test cases, expected and actual results

The stimulus walks through seven steps; each step is held for 8 clock cycles so the 5-stage pipeline settles.
`hold` and `fail-safe` are two instances of the same controller class fed by the same link output.

| # | Scenario (required coverage) | Stimulus (soil / link) | Expected `hold` | Actual `hold` | Expected `fail-safe` | Actual `fail-safe` | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | **dry soil** | 20 % / OK | ON | **ON** | ON | **ON** | ✅ |
| 2 | **normal soil** (band) | 35 % / OK | ON (held) | **ON** | ON (held) | **ON** | ✅ |
| 3 | **wet soil** | 45 % / OK | OFF | **OFF** | OFF | **OFF** | ✅ |
| 4 | **communication failure** while pump is OFF | 20 % / DOWN | OFF (held) | **OFF** | OFF | **OFF** | ✅ |
| 5 | **automatic irrigation response** (telemetry back, dry) | 25 % / OK | ON | **ON** | ON | **ON** | ✅ |
| 6 | communication failure while pump is ON | 25 % / DOWN | ON (held) | **ON** | **OFF** (watchdog) | **OFF** | ✅ |
| 7 | telemetry restored, still dry | 25 % / OK | ON | **ON** | ON | **ON** | ✅ |

**14 assertions executed, 14 PASS, 0 FAIL.**

Physical behaviour observed in the transcript (selected lines):

```
[     0 s] sensor  : soil= 20 %  T= 24.0 C  RH= 57.0 %   <- 1. dry soil (20 %), telemetry OK
[     1 s] link    : UP   - delivered (soil= 20 %)
[     3 s] process : soil= 20 % -> zone dry  (valid)
[     3 s] ctrl/hold     : pump ON    (irrigate (soil below dry threshold))
[     4 s] pump/hold     : START (ON)
...
[    20 s] ctrl/hold     : pump OFF   (stop (soil above wet threshold))       <- wet soil
...
[    27 s] process : no fresh sample -> zone wet  held (invalid)             <- comms failure
...
[    45 s] ctrl/fail-safe: pump OFF   (fail-safe watchdog: pump OFF)         <- watchdog after 3 lost packets
```

Meaning of the numbers:

* **55 packets sent, 39 delivered, 16 lost** — 8 losses in step 4 and 8 in step 6 (16 = the two outage windows),
  all other packets delivered. Note that a lost packet is *counted*, not silently dropped.
* **longest outage 8 cycles** — the modelled outages are complete (every packet in the window is lost).
* **valid 38 / invalid 19** — the processor correctly refused to classify when `packet_ready` was low.
* **`hold` ON 39 cycles vs `fail-safe` ON 33 cycles** — the difference (6 cycles) is exactly where the watchdog
  turned the pump off during the outage while `hold` kept irrigating.
* **1 watchdog trip** — the fail-safe controller forced the pump OFF once (step 6), as designed.


---

## 6. Real implementation vs conceptual design — where each file stands

This is the distinction the project needs to keep straight:

| Artefact | Status | Evidence |
|---|---|---|
| `systemc/src/*.h`, `smart_farm_main.cpp` | **REAL, executable SystemC implementation** | compiled with clang++ against SystemC 2.3.4, executed, 14/14 checks passed |
| `systemc/smart_farm_systemc.cpp` (legacy) | **Real, compilable, but not a verification** — no assertions | compiles and runs (§4.3), computes no verdict |
| `systemc/README.md` architecture section | design description | matches the code |
| `vhdl/irrigation_controller.vhd` | real RTL, simulated with GHDL | see `VHDL_TEST_REPORT.md` |
| `matlab/lora_link_simulation.m` | real MATLAB link-budget model | see `LORA_SIMULATION.md` |
| Report/slides statements about "SystemC model" | now backed by an executable model | this report |

**Not claimed:** no TLM-2.0 transaction modelling, no power/energy estimation, no RTOS/QEMU co-simulation,
no FPGA or board execution, and no measured radio behaviour.

---

## 7. Design decisions worth recording

1. **`SC_METHOD` everywhere in the datapath** (no `SC_THREAD`): deterministic evaluation order per delta cycle,
   which removes the read/write race of the legacy file.
2. **One-cycle register stage in the link**: the payload and its `packet_ready` flag are captured and published
   together. Without this, a reader in the same delta could observe a *fresh* flag with a *stale* payload — a bug
   that the first version of this implementation actually had (the first delivered packet carried the power-up
   value `0 %`), and which was found and fixed during development.
3. **`sample_ready` handshake**: the link transmits only when the node really has a sample, so no packet exists
   before the first measurement.
4. **Two controller instances** instead of a compile-time `#define`: the hold policy and the fail-safe policy run
   side by side on the same stimulus, so the difference is measured rather than asserted.
5. **Self-checking testbench + process exit code**: `sc_main` returns 0/1/2, so the whole run is scriptable and
   cannot silently pass.

---

## 8. Limitations

1. **Simulation only.** No radio, no sensor, no pump, no FPGA. "Packet delivered", "pump ON" are simulation
   variables.
2. **The link model is binary and scripted.** `link_ok` is driven by the testbench; there is no path loss, SNR or
   PER here. Those physics are in `matlab/lora_link_simulation.m`; the two models are complementary and are
   deliberately *not* merged (SystemC models the system timing/architecture, MATLAB models the RF budget).
3. **No random loss** in the SystemC model — determinism was chosen over realism so the transcript is reproducible.
4. **No timing annotation** (no `wait()` delays in the datapath): one clock cycle = one reporting interval, and the
   physical airtime of a packet (46 ms … 1.2 s, see `LORA_SIMULATION.md`) is not represented in the SystemC timing.
5. **Hard-coded scenario** of seven steps; a longer or randomised campaign would need an external stimulus file.
6. **Sensor values are synthetic** (temperature sine wave, humidity derived). The soil values follow the same
   scenario table as the MATLAB/VHDL models, but they are not the recorded dataset.
7. **SystemC is a local installation** in `~/systemc` (not system-wide). A fresh machine must rebuild it (§4 of
   `systemc/README.md`); the Makefile detects it but cannot install it.
8. **No coverage or assertion library** (no SCV/UVM-SC): the checks are hand-written `printf`-based assertions.

---

## 9. How to reproduce

```bash
cd /Users/gtx-z/Downloads/SmartFarm_Simulation_English/systemc
./run_systemc.sh ; echo "exit=$?"     # 0 = all 14 checks passed
tail -20 ../results/systemc_simulation.log
```

Clean rebuild from scratch:

```bash
./run_systemc.sh clean && ./run_systemc.sh
```

---

## 10. Summary

| Question | Result |
|---|---|
| SystemC sources existed? | Yes — one 59-line single-file prototype, no testbench, no assertions |
| SystemC installed? | **Was not**; now installed in `~/systemc` (SystemC 2.3.4) after your approval |
| Compiler available? | Yes — Apple clang 21.0.0 (x86_64) |
| Could the old code compile? | No before the installation (`'systemc' file not found`); **yes** afterwards |
| New implementation | 6 SystemC modules + shared types header + `sc_main`, wired through 14 signals |
| Compilation | **OK** — no project warnings |
| Simulation | **OK** — 56.5 s simulated, exit code 0 |
| Assertions | **14 / 14 PASS** |
| Scenarios covered | dry soil, normal soil, wet soil, communication failure (×2), automatic irrigation response |
| Hardware claimed? | **No** |

