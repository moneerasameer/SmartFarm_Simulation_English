# SystemC — Smart Farm monitoring & automatic irrigation

Software-only SystemC model of the Smart Farm system: **sensor node → simulated LoRa link →
gateway processing → irrigation controller → pump actuator**.

> **No hardware is involved.** There is no radio, no sensor, no pump and no FPGA in this folder.
> Everything is simulated. The model has been **compiled and executed** on this machine
> (SystemC 2.3.4 + Apple clang 21, macOS Intel) — see `../SYSTEMC_TEST_REPORT.md`.

---

## 1. Why SystemC here (and what it adds)

| Component | Language | Level of abstraction |
|---|---|---|
| `matlab/` | MATLAB | algorithm / data analysis, link budget physics |
| `vhdl/` | VHDL | synthesizable RTL of the controller (cycle-accurate hardware) |
| **`systemc/`** | **C++ / SystemC** | **system-level model: all modules of the system talking through signals** |
| `python_dashboard/` | Python | user interface |

SystemC is the only place where the *complete system* — sensor node, link, processing, control and actuator — is
modelled together, module by module, on a real simulation kernel with a self-checking testbench.

---

## 2. Architecture

```
  testbench stimulus                      gateway / controller                   actuator
 ┌──────────────────┐
 │ step_index       │
 │ link_ok          │
 └────────┬─────────┘
          ▼
 ┌──────────────────┐  soil_moisture  ┌──────────────┐  soil_out  ┌────────────────────────┐  zone/valid
 │  SensorMonitor   ├────────────────►│  LoRaLink    ├───────────►│ SoilMoistureProcessor  ├────────► (monitor)
 │  (sensor node)   │  sample_ready───┤  (channel)   │  ready     └────────────────────────┘
 └──────────────────┘                 └──────┬───────┘
                                             │ soil_out / packet_ready
                            ┌────────────────┴─────────────────┐
                            ▼                                  ▼
                 ┌──────────────────────┐           ┌──────────────────────┐
                 │ IrrigationController │           │ IrrigationController │
                 │  policy = "hold"     │           │ policy = "fail-safe" │
                 └──────────┬───────────┘           └──────────┬───────────┘
                            ▼                                  ▼
                 ┌──────────────────────┐           ┌──────────────────────┐
                 │    PumpActuator      │           │    PumpActuator      │
                 └──────────────────────┘           └──────────────────────┘
```

| Module | File | Responsibility |
|---|---|---|
| `SensorMonitor` | `src/sensor_monitor.h` | one measurement per cycle: soil moisture (scripted), synthetic temperature/humidity; asserts `sample_ready` |
| `LoRaLink` | `src/lora_link.h` | packet-level uplink: DELIVERED / LOST from the channel state, registers payload + `packet_ready` together, counts packets |
| `SoilMoistureProcessor` | `src/soil_moisture_processor.h` | classifies a valid sample into dry / band / wet; holds the last class and sets `valid=0` when data is missing |
| `IrrigationController` | `src/irrigation_controller.h` | documented 30 %/40 % hysteresis with *hold* or *fail-safe watchdog* policy (constructor parameter) |
| `PumpActuator` | `src/pump_actuator.h` | registers the command, reports ON/OFF transitions, counts ON cycles and starts |
| `SmartFarmTB` | `src/smart_farm_tb.h` | instantiates and wires everything, drives the scenario, checks the pump states |
| `smart_farm_main.cpp` | `sc_main` | banner, `sc_start`, exit code 0/1/2 |
| `src/smart_farm_types.h` | shared | thresholds, zone encoding, scripted scenario, timing constants |

**Control law** (identical to `vhdl/irrigation_controller.vhd` and `matlab/functions/irrigation_control.m`):

```
soil < 30 %   -> pump ON
soil > 40 %   -> pump OFF
30 .. 40 %    -> keep previous state                       (hysteresis)
no packet     -> keep previous state                       (policy "hold")
no packet     -> after 3 consecutive losses, force OFF      (policy "fail-safe", watchdog)
```

---

## 3. Build and run

```bash
cd systemc
ls $HOME/systemc/include/systemc.h      # 1. SystemC must be installed (section 4)
./run_systemc.sh                        # 2. build + run + archive the transcript
```

Step by step:

```bash
make            # builds build/smart_farm
make run        # runs it
make clean      # removes build/
```

`run_systemc.sh` writes the full transcript to `../results/systemc_simulation.log` and returns a non-zero exit
code if any check fails. `SYSTEMC_HOME` is detected automatically (`$SYSTEMC_HOME`, `$HOME/systemc`,
`/usr/local`, `/opt/homebrew`, `/opt/local`) and can be overridden:

```bash
SYSTEMC_HOME=/path/to/systemc make
```

### Files produced

| Path | Content |
|---|---|
| `build/smart_farm` | simulation executable (git-ignored) |
| `../results/systemc_simulation.log` | full transcript + summary |

---

## 4. Installing SystemC (only needed on a new machine)

SystemC is a **separate library** (not the C++ standard library) and must be built once.

```bash
cd /tmp
curl -L -o systemc-2.3.4.tar.gz \
  https://github.com/accellera-official/systemc/archive/refs/tags/2.3.4.tar.gz
tar xzf systemc-2.3.4.tar.gz && cd systemc-2.3.4

cmake -S . -B build -DCMAKE_INSTALL_PREFIX=$HOME/systemc \
      -DCMAKE_CXX_COMPILER=clang++ -DCMAKE_CXX_STANDARD=17 \
      -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
      -DENABLE_PTHREADS=ON
cmake --build build -j4
cmake --install build
```

**Why CMake?** The GitHub tarball (which is what accellera.org links to) no longer ships the generated
autotools `Makefile.in` files, so `./configure` fails with *"cannot find input file: src/Makefile.in"*.
On this machine CMake came from the MATLAB installation
(`/Applications/MATLAB_R2025a.app/bin/maci64/cmake/bin/cmake`), so nothing extra had to be installed.

**Why `-DENABLE_PTHREADS=ON`?** With the default QuickThreads coroutine package the static library references the
AddressSanitizer fiber hooks (`__sanitizer_start_switch_fiber` / `__sanitizer_finish_switch_fiber`), which a normal
`clang++` link does not provide → *"Undefined symbols for architecture x86_64"*. The pthreads package avoids the
assembly coroutines entirely and is fully supported by SystemC 2.3.4.

Verify:

```bash
ls $HOME/systemc/include/systemc.h $HOME/systemc/lib/libsystemc.a
```

---

## 5. The legacy single-file prototype

`smart_farm_systemc.cpp` is the **original** 59-line prototype that was in the project before this rework
(one `SC_MODULE`, two `SC_THREAD`s, an ad-hoc `sc_main`). It is kept unchanged for reference and it still
compiles against SystemC 2.3.4, but:

* it contains **no assertions and no testbench**, so it can never fail;
* both threads are sensitive to `clk.pos()`, so the read/write order of `soil` / `packet_valid` inside a delta
  cycle is implementation-defined (a potential race);
* it prints a trace but computes no result.

The modular implementation in `src/` + `smart_farm_main.cpp` replaces it and is the one covered by
`../SYSTEMC_TEST_REPORT.md`.

