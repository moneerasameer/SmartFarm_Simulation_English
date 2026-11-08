# LoRa SIMULATION — Smart Farm Link Model

**Project:** Smart Farm Monitoring and Automated Irrigation System
**Component:** software model of the LoRa uplink between the sensor node and the gateway
**Environment used:** MATLAB **R2025a Update 1**, macOS Intel
**Run date:** 2026-11-08
**Hardware:** **none.** No LoRa radio, gateway, antenna or sensor node is connected.
Every number in this document is **simulated**, not measured.

---

## 1. Purpose and scope

The project needs a communication layer that is (a) explicit about what it models, (b) reproducible and
(c) connected to the irrigation controller. This document describes the link-level LoRa model implemented in

```
matlab/functions/lora_default_config.m     all assumptions, in one place
matlab/functions/lora_time_on_air.m        packet transmission model
matlab/functions/lora_link_budget.m        channel + receiver model (Prx, SNR, margin, PER)
matlab/functions/lora_simulate_link.m      packet-level reception simulation + scenarios
matlab/lora_link_simulation.m              driver: scenarios, controller impact, figures, exports
```

In scope: packet airtime, link budget, packet error probability, reception trace, PDR/PLR, outage behaviour,
effect of the reception trace on the irrigation controller.
Out of scope: RF hardware, antenna patterns, measured channels, gateways/LoRaWAN MAC, ADR, retransmissions,
cryptography, energy measurement.

---

## 2. What the project contained before (inspection result)

| Location | What it does | Verdict |
|---|---|---|
| `data/sensor_data.csv` → `Packet received` | 120 pre-recorded `True`/`False` values (116/4) | a **statistical reception trace**: no radio parameters, no distance, no RSSI/SNR |
| `matlab/smart_farm_simulation.m:21-27` | `packetLossProbability = 0.04; received = rand > 0.04` | constant Bernoulli loss; the printed RSSI/SNR come from an unrelated hard-coded formula (`105 + 20*log10(d/100)`) that **does not influence** the reception decision |
| `systemc/smart_farm_systemc.cpp:22` | `packet_valid = (sample % 17) != 0` | deterministic pattern, ≈ 5.9 % loss |
| `vhdl/irrigation_controller.vhd` | `packet_valid` input pin | consumes the flag; contains no model |
| `python_dashboard/app.py` | reads the CSV flag (after the dashboard rework) | displays statistics; contains no model |

**Verdict: the project had a *statistical packet-reception abstraction*, not a LoRa simulation.**
The reception outcome was independent of distance, spreading factor, bandwidth, transmit power or any physical
quantity, and the only "radio" numbers printed were illustrative and unconnected to the loss decision.

---

## 3. Statistical model vs link-level simulation

| Aspect | Statistical model (previous) | Link-level model (this work) |
|---|---|---|
| Input | a loss probability (4 %) or a fixed pattern | radio configuration, distance, channel parameters |
| Reception decision | independent coin flip | derived from the link budget (Prx → SNR → margin → PER) |
| Distance dependence | none | path loss + shadowing; PDR curve vs distance |
| Modulation dependence | none | SF / BW / CR determine both airtime and sensitivity |
| Radio metrics | printed but unconnected | computed and **used** by the loss model |
| Loss structure | i.i.d. by construction | i.i.d. plus scenario-driven bursts (outage, interference) |
| Regulatory constraints | not considered | duty cycle derived from airtime |
| Reproducibility | seed per script | single documented seed + private RNG stream |
| Honest claim | "some packets are lost" | "these packets are lost **because** the margin is X dB" |

Both are legitimate tools. The statistical model answers *"what does the controller do when data is missing?"*;
the link-level model additionally answers *"why and when is data missing, and how does the radio configuration
change that?"*. The project now has both, clearly separated.

---

## 4. Communication architecture

```
            simulated sensor node                                simulated gateway
 ┌───────────────────────────────────────┐          ┌────────────────────────────────────┐
 │ soil / temperature / humidity sample  │          │  reception trace  (1 bit / packet) │
 │ (from data/sensor_data.csv)           │          │            │                       │
 │            │                          │          │            ▼                       │
 │            ▼                          │          │  packet_statistics.m               │
 │  payload 16 B                         │   RF     │   → PDR, PLR, loss events,         │
 │  SF / BW / CR ──► lora_time_on_air    │  model   │     longest outage                 │
 │            │       (airtime)          │ ───────► │            │                       │
 │            ▼                          │          │            ▼                       │
 │  distance ──► lora_link_budget        │          │  irrigation_control.m              │
 │   path loss + shadowing               │          │   "hold"     : keep last state     │
 │   Prx → SNR → margin → PER            │          │   "failSafe" : watchdog → OFF      │
 └───────────────────────────────────────┘          └────────────────────────────────────┘
                                                                    │
                                                                    ▼
                                                     simulated pump command (0/1)
                                                     ➜ figures + CSV + alerts
```

Modelled: one node → one gateway, uplink only, fixed reporting interval, packet-level decisions.
**Not** modelled: downlink, acknowledgements, retransmissions, MAC/ADR, collisions between nodes, antenna
radiation patterns, fading beyond log-normal shadowing, hardware energy consumption.

---

## 5. Simulation assumptions (all configurable)

Defaults from `lora_default_config.m`. **None of them was measured on the project's hardware** — they are
documented engineering assumptions taken from the published Semtech SX1276 datasheet and the LoRaWAN regional
parameters, and they can all be changed in one place.

| Parameter | Default | Unit | Origin / justification |
|---|---|---|---|
| Region | EU868 | — | regulatory band assumption |
| Carrier frequency | 868.1 | MHz | EU868 first channel |
| Bandwidth | 125 | kHz | LoRaWAN default |
| Spreading factor | 7 | — | fastest; SF12 = longest range |
| Coding rate | 4/5 | — | LoRaWAN default |
| Preamble | 8 | symbols | LoRaWAN default |
| Header / CRC | explicit / on | — | LoRaWAN default |
| Payload | 16 | bytes | typical sensor frame (assumption) |
| TX power | 14 | dBm | SX1276 maximum in EU868 |
| TX / RX antenna gain | 0 / 0 | dBi | small whip antennas (assumption) |
| Cable loss | 0 | dB | not modelled |
| Receiver noise figure | 6 | dB | typical low-cost front end |
| SNR limits per SF | −7.5 … −20 | dB | Semtech SX1276 table (SF7…SF12) |
| Implementation loss | 1.5 | dB | aligns the model with the published −123 dBm at SF7/BW125 |
| Path-loss exponent | 2.8 | — | 2.0 free space, 2.7–3.5 suburban |
| Shadowing σ | 6 | dB | log-normal, suburban, independent per packet |
| PER steepness | 1.5 | 1/dB | **assumption**: width of the PER-versus-SNR transition |
| Duty-cycle limit | 1 | % | EU868 regulatory assumption |
| Reporting interval | 60 | s | one measurement per minute (assumption) |
| Distance | 450 | m | same value the old script hard-coded |
| Packets per run | 120 | — | same length as the recorded dataset |
| Random seed | 20261108 | — | reproducibility (private RNG stream) |

**Explicitly not claimed:** these are not measurements, the model is not calibrated against a real deployment,
and the results must not be presented as field performance.

---

## 6. Packet transmission model

Each sample is one LoRa packet. Its airtime is computed with the standard LoRa CSS formula
(Semtech SX1276 datasheet), not with a fitted curve:

```
Tsym      = 2^SF / BW
n_payload = 8 + max( ceil( (8*PL − 4*SF + 28 + 16*CRC − 20*IH) / (4*(SF − 2*DE)) ) * (CR + 4), 0 )
ToA       = (n_preamble + 4.25 + n_payload) * Tsym
```

with `PL` = payload bytes, `IH` = 1 for an explicit header, `CRC` = 1 when the payload CRC is on,
`DE` = 1 when low-data-rate optimisation is enabled (mandatory for SF11/SF12 at 125 kHz), `CR` = 1 for 4/5.

**Measured model output** (BW 125 kHz, CR 4/5, 8-symbol preamble, 16-byte payload, explicit header, CRC on):

| SF | Symbol time | Payload symbols | **Airtime** | Packets/h at 1 % duty | Duty used at a 60 s interval |
|---|---|---|---|---|---|
| 7 | 1.0240 ms | 33 | **46.336 ms** | 776.9 | 0.077 % |
| 8 | 2.0480 ms | 28 | **82.432 ms** | 436.7 | 0.137 % |
| 9 | 4.0960 ms | 28 | **164.864 ms** | 218.4 | 0.275 % |
| 10 | 8.1920 ms | 23 | **288.768 ms** | 124.7 | 0.481 % |
| 11 | 16.3840 ms | 23 | **577.536 ms** | 62.3 | 0.963 % |
| 12 | 32.7680 ms | 23 | **1155.072 ms** | 31.2 | **1.925 % ⚠ exceeds the 1 % limit** |

Engineering consequences (derived, not assumed):

* With SF7 the node needs **46.3 ms** of channel time per packet → **776 packets/hour** are allowed by the 1 %
  duty cycle, and a 60 s reporting interval uses only **0.077 %** of the band.
* With SF12 the same packet needs **1155 ms**, so a 60 s interval would use **1.925 %** — above the legal limit.
  The shortest legal interval for that packet is **115.5 s**. Choosing the longest range therefore forces a
  slower reporting rate: a real design trade-off that the old model could not express.


---

## 7. Packet loss model

Five steps, all inside `lora_link_budget.m`:

**Step 1 — Path loss** (log-distance with a Friis reference at d₀ = 1 m, plus log-normal shadowing)

```
PL(d0) = 32.44 + 20·log10(f_MHz) + 20·log10(d0_km)        → 31.20 dB at 868.1 MHz, 1 m
PL(d)  = PL(d0) + 10·n·log10(d/d0) + X,    X ~ N(0, σ²)   (σ = 6 dB, drawn per packet)
```

**Step 2 — Received power** `Prx = Ptx + Gtx + Grx − cable − PL(d)`

**Step 3 — Noise floor and SNR** `N = −174 + 10·log10(BW) + NF` → **−117.03 dBm** at BW 125 kHz, NF 6 dB;
`SNR = Prx − N`

**Step 4 — Link margin** `margin = SNR − (SNR_limit(SF) + implementation_loss)`

**Step 5 — Packet error probability** (logistic transition around the demodulation limit)

```
PER = 1 / (1 + exp(k · margin))        k = 1.5 /dB   → PER = 50 % at margin = 0 dB
```

Sensitivity per spreading factor (BW 125 kHz, NF 6 dB, 1.5 dB implementation loss):

| SF | SNR limit | Sensitivity |
|---|---|---|
| 7 | −7.5 dB | **−123.03 dBm** |
| 8 | −10.0 dB | −125.53 dBm |
| 9 | −12.5 dB | −128.03 dBm |
| 10 | −15.0 dB | −130.53 dBm |
| 11 | −17.5 dB | −133.03 dBm |
| 12 | −20.0 dB | −135.53 dBm |

The SF7 value reproduces the datasheet figure (−123 dBm), which is why the 1.5 dB implementation loss is included.
The PER steepness `k` and the shadowing σ are **assumptions** about the channel, not measured values.

**Failure scenarios** implemented on top of the loss model:

| Scenario | Mechanism | Used for |
|---|---|---|
| `nominal` | pure link-budget losses | baseline PDR |
| `outage` | a window of packets forced to be lost | gateway failure, node obstructed, node out of range |
| `interference` | extra `Interference_dB` subtracted from the margin inside a window | co-channel interferer, temporary obstruction |
| `range` | distance sweep | how far the link can go before losses start |

---

## 8. Actual results

All values printed by MATLAB during the run (`results/lora_*.csv` contain the same numbers).

### 8.1 Nominal link at 450 m (SF7)

| Quantity | Value |
|---|---|
| Path loss (no shadowing) | **105.50 dB** |
| Received power | **−91.50 dBm** |
| Noise floor | **−117.03 dBm** |
| SNR / SNR limit | **25.53 dB** / −7.5 dB |
| **Link margin** | **+31.53 dB** (mean over the 120 packets: 31.21 dB) |
| Sensitivity | −123.03 dBm |
| Mean PER | ≈ 0 (below 1·10⁻⁶) |
| **Simulated PDR / PLR** | **100.0000 % / 0.0000 %** (120/120 delivered) |

### 8.2 Distance sweep (400 packets per point, means over the shadowing)

| Distance | Path loss | Prx | SNR | Margin | Mean PER | **Simulated PDR** |
|---|---|---|---|---|---|---|
| 100 m | 87.39 dB | −73.39 dBm | 43.64 dB | +49.64 dB | 0.00000 | **100.00 %** |
| 404 m | 103.66 dB | −89.66 dBm | 27.37 dB | +33.37 dB | 0.00000 | **100.00 %** |
| 1 095 m | 116.28 dB | −102.28 dBm | 14.75 dB | +20.75 dB | 0.00001 | **100.00 %** |
| 1 993 m | 123.49 dB | −109.49 dBm | 7.54 dB | +13.54 dB | 0.01401 | **98.75 %** |
| 3 626 m | 130.54 dB | −116.54 dBm | 0.49 dB | +6.49 dB | 0.15725 | **83.25 %** |
| 5 403 m | 135.28 dB | −121.28 dBm | −4.25 dB | +1.75 dB | 0.40274 | **60.75 %** |
| 8 052 m | 140.76 dB | −126.76 dBm | −9.73 dB | −3.73 dB | 0.71266 | **29.75 %** |
| 12 000 m | 145.47 dB | −131.47 dBm | −14.44 dB | −8.44 dB | 0.90920 | **9.25 %** |

**Simulated range for PDR ≥ 90 %: ≈ 3.6 km** with the assumed suburban channel (n = 2.8, σ = 6 dB).
Beyond that the curve falls steeply: the transition happens within roughly one order of magnitude of distance,
which is the expected behaviour of a link-budget-limited LoRa system.

### 8.3 Failure scenarios

| Scenario | Packets | Delivered | Lost | **PDR** | **PLR** | Loss events | Longest outage |
|---|---|---|---|---|---|---|---|
| Recorded dataset (reference) | 120 | 116 | 4 | **96.6667 %** | **3.3333 %** | 4 | 1 |
| Nominal, 450 m, SF7 | 120 | 120 | 0 | **100.0000 %** | **0.0000 %** | 0 | 0 |
| Burst outage, packets 90–110 | 120 | 99 | 21 | **82.5000 %** | **17.5000 %** | 1 | **21** |
| Interference burst, 5 km, +3 dB, packets 95–108 | 120 | 71 | 49 | **59.1667 %** | **40.8333 %** | 29 | 5 |
| SF9 at 5 km | 120 | 107 | 13 | **89.1667 %** | **10.8333 %** | 11 | 3 |
| SF12 at 5 km | 120 | 119 | 1 | **99.1667 %** | **0.8333 %** | 1 | 1 |

Window details:

* **Outage:** all **21** packets inside samples 90–110 are lost → PDR inside the window **0.0 %**.
* **Interference:** inside samples 95–108, **10 of 14** packets are lost → PDR inside the window **28.6 %**,
  against a **62.5 %** baseline for the same 5 km link. The interference therefore *doubles* the loss rate locally.

### 8.4 Spreading-factor trade-off at 5 km

| Configuration | Airtime | **PDR** | Legality at a 60 s interval (1 % duty) |
|---|---|---|---|
| SF7 | 46.3 ms | **62.50 %** | yes (0.077 %) |
| SF9 | 164.9 ms | **89.17 %** | yes (0.275 %) |
| SF12 | 1155.1 ms | **99.17 %** | **no (1.925 %)** → interval must be ≥ 115.5 s |

This is the central LoRa design trade-off, now quantified with the project's own model: **range/reliability versus
airtime and duty cycle**. The old 4 %-loss abstraction could not express it.


### 8.5 Impact on the irrigation controller (connection to the safe logic)

The simulated reception trace is fed, unchanged, into the existing controller (`irrigation_control.m`), once in
`hold` mode (documented law: keep the state while telemetry is missing) and once in `failSafe` mode
(watchdog: force the pump OFF after `MaxHoldSamples = 3` consecutive lost packets).

| Scenario | Pump ON (hold) | Pump ON (fail-safe) | Watchdog trips | Samples where the commands differ | Longest blind period |
|---|---|---|---|---|---|
| Recorded dataset | 44 | 44 | 0 | 0 | 1 |
| Nominal 450 m | 44 | 44 | 0 | 0 | 0 |
| **Burst outage 90–110** | **44** | **25** | **1** | **19** | **21** |
| **Interference @5 km** | **44** | **36** | **4** | **8** | **5** |

Interpretation:

* With isolated losses (recorded dataset, blind time 1) the two strategies are **identical** — the watchdog never
  reaches its 3-packet limit. This is why the recorded dataset alone cannot demonstrate a difference.
* With a 21-packet outage, "hold" keeps irrigating through the whole blind period, while the fail-safe watchdog
  stops the pump after 3 lost packets and stays OFF, which is **19 samples of different actuation**.
* With scattered interference (blind time 5) the watchdog trips **4 times**, producing short OFF excursions — the
  intended behaviour of a fail-safe design, at the cost of interrupting irrigation.
* In all cases the pump never changes state on a lost packet in `hold` mode (verified: 0 changes), which is the
  documented communication rule.

### 8.6 Comparison with the recorded dataset — an important finding

| Metric | Recorded dataset | Model at 450 m (SF7) |
|---|---|---|
| PDR | **96.6667 %** | **100.0000 %** |
| PLR | **3.3333 %** | **0.0000 %** |
| Link margin | not recorded | **+31.53 dB** |

The model says that at 450 m, with a suburban path-loss exponent and SF7, the link has a **31.5 dB margin** — far
above the demodulation limit — so essentially **no packets should be lost**. The recorded 3.33 % loss therefore
**cannot be explained by distance or path loss alone**. It is a statistical abstraction (a 4 % coin flip) that
represents unspecified impairments: interference, collisions, gateway downtime, blocked Fresnel zone, etc.
The `outage` and `interference` scenarios exist precisely to represent those causes explicitly.

---

## 9. Generated figures

| File | Content | Key observation |
|---|---|---|
| `results/Fig9_transmission_model.png` | Airtime vs payload (SF7/9/11/12) and airtime per SF with the duty-cycle limit | SF12 exceeds the 1 % duty cycle at a 60 s interval |
| `results/Fig10_link_budget_vs_distance.png` | Prx vs distance with sensitivity/noise floor, and simulated PDR vs distance | PDR ≥ 90 % up to ≈ 3.6 km, then a steep roll-off |
| `results/Fig11_link_failure_scenarios.png` | Reception strips for the burst outage and the interference burst | 21/21 lost in the outage; 10/14 lost in the interference window |
| `results/Fig12_controller_under_link_failure.png` | Soil moisture with the outage window and the two pump commands | fail-safe drops the pump after 3 lost packets, hold does not |

Exported data:

| File | Content |
|---|---|
| `results/lora_config.csv` | every assumption used for the run (parameter, value, unit) |
| `results/lora_scenarios.csv` | the six scenarios: packets, delivered, lost, PDR, PLR, loss events, longest outage |
| `results/lora_distance_sweep.csv` | the 25-point distance sweep (path loss, Prx, SNR, margin, mean PER, simulated PDR) |
| `results/lora_link_trace.csv` | per-packet trace of the nominal scenario (distance, PL, Prx, SNR, margin, PER, received) |
| `results/lora_controller_comparison.csv` | hold vs fail-safe per scenario (ON counts, watchdog trips, blind time) |

---

## 10. Verification performed

The driver script contains **15 self-checks** with explicit tolerances; all pass
(`All 15 verification checks passed.`):

| Check | Actual | Expected |
|---|---|---|
| Airtime SF7, 16 B, BW125 | 46.336 ms | 46.336 ms |
| Airtime SF12, 16 B, BW125 | 1155.072 ms | 1155.072 ms |
| SF7 sensitivity, BW125 | −123.03 dBm | −123.031 dBm |
| Noise floor, BW125, NF 6 dB | −117.03 dBm | −117.031 dBm |
| Nominal link margin, no shadowing | 31.530 dB | 31.529 dB |
| Recorded packets / delivered | 120 / 116 | 120 / 116 |
| Recorded PDR + PLR | 100 % | 100 % |
| Simulated PDR + PLR (nominal) | 100 % | 100 % |
| Simulation is deterministic (same seed → same trace) | yes | yes |
| PDR does not increase with distance | yes | yes |
| Pump state changes on lost packets (nominal) | 0 | 0 |
| Recorded blind time | 1 packet | 1 packet |
| Recorded watchdog trips | 0 | 0 |
| Outage scenario loses every packet in its window | yes | yes |

Additional evidence:

* **Airtime cross-check:** the formula reproduces the published Semtech LoRa-calculator values
  (SF7/125 kHz/16 B → 46.3 ms; SF12/125 kHz/16 B → 1155 ms).
* **Sensitivity cross-check:** the noise-floor formula reproduces the datasheet value −123 dBm at SF7/BW125.
* **Determinism:** a private `RandStream` is used, so the caller's RNG is untouched and the same seed reproduces
  the identical trace.
* **Backward compatibility:** no existing file was modified. The new code only *calls* `load_sensor_data.m`,
  `irrigation_control.m` and `packet_statistics.m`. The MATLAB suite still reports 22/22 checks and the dashboard
  suite still reports 13/13.


---

## 11. Limitations

1. **No hardware.** Nothing in this document was measured. There is no LoRa radio, no gateway and no antenna.
   All PDR/PLR values are properties of the model, not of a deployment.
2. **Assumed parameters.** SF, BW, CR, payload, TX power, noise figure, path-loss exponent, shadowing σ and the
   PER steepness are documented assumptions (§5). Changing them changes every number in §8. In particular the
   `PER = 1/(1+exp(k·margin))` shape and `k = 1.5 /dB` are modelling choices, not measurements; a real LoRa PER curve
   is steeper at low SF and flatter near the sensitivity limit.
3. **Shadowing is drawn independently per packet.** A real shadowing process is spatially correlated (a tractor
   parked next to the node would affect many consecutive packets). The `outage` scenario approximates that case
   explicitly instead.
4. **No collision model.** With several nodes transmitting on the same channel, ALOHA-like collisions would add
   losses at high load; the model assumes one transmitter.
5. **No LoRaWAN MAC.** No acknowledgements, no retransmissions, no ADR, no duty-cycle manager; the duty cycle is
   only *checked*, not enforced.
6. **No antenna or environment specifics.** Antenna gain 0 dBi and no cable loss; buildings, terrain and vegetation
   are represented only through `n` and σ. The reported 3.6 km range is a **model output for the assumed suburban
   channel**, not a measured range.
7. **The recorded dataset remains unexplained.** §8.6 shows that its 3.33 % PLR is not distance-driven. Its true
   cause (interference, collisions, gateway downtime) is unknown and is not recoverable from the data.
8. **No energy model.** Battery lifetime is not computed; only airtime and the duty-cycle budget are.
9. **Timestamp-free.** The dataset has no timestamps, so "per sample" results cannot be converted to real time
   except through the assumed 60 s reporting interval.
10. **The link model is not calibrated** against any measurement campaign; do not present it as validated.

---

## 12. Reproduction

```bash
cd /Users/gtx-z/Downloads/SmartFarm_Simulation_English

# full LoRa simulation: 4 figures + 5 CSV files in results/
/Applications/MATLAB_R2025a.app/bin/matlab -batch "run('matlab/lora_link_simulation.m')"

# inspect the exported numbers
cat results/lora_config.csv
cat results/lora_scenarios.csv
cat results/lora_controller_comparison.csv
```

Use the model directly in MATLAB:

```matlab
addpath('matlab/functions');
cfg = lora_default_config();

% change an assumption
cfg.spreadingFactor = 9;
cfg.distance_m = 2000;

sim = lora_simulate_link(cfg, Scenario = "nominal");
fprintf('PDR %.2f %% | margin %.2f dB | airtime %.1f ms\n', ...
        sim.stats.pdrPercent, mean(sim.link.linkMargin_dB), sim.toa.timeOnAir_ms);

% a gateway outage between packets 90 and 110
simOut = lora_simulate_link(cfg, Scenario = "outage", OutageWindow = [91 111]);
```

---

## 13. Summary

| Question | Answer |
|---|---|
| What existed before? | A **statistical packet-reception abstraction** (constant 4 % Bernoulli loss in MATLAB, a fixed `sample % 17` pattern in SystemC, pre-recorded flags in the CSV) with unrelated illustrative RSSI/SNR numbers. |
| Is it now a LoRa simulation? | **Yes, at link level:** airtime from the LoRa CSS formula, path loss + shadowing, noise floor, SNR, link margin, PER, per-packet reception, duty-cycle check. |
| Packet loss included? | Yes — derived from the link margin, not from a constant probability. |
| Communication failure included? | Yes — burst outage and interference scenarios, plus a distance sweep to the range limit. |
| PDR / PLR computed? | Yes, by the project's existing `packet_statistics.m`: e.g. nominal 100 % / 0 %, outage 82.5 % / 17.5 %, interference 59.17 % / 40.83 %. |
| Visualised? | Yes — `Fig9`…`Fig12` (airtime, link budget/PDR vs distance, failure strips, controller impact). |
| Connected to the irrigation safe logic? | Yes — the simulated trace drives `irrigation_control.m`: hold 44 ON vs fail-safe 25 ON in the outage scenario, 1 watchdog trip, 19 samples different. |
| Real hardware claimed? | **No.** Simulation only. |

