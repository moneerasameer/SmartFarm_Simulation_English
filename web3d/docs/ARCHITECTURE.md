# Smart Farm 3D — Architecture & Engineering Notes

This document describes how the Three.js dashboard is built, how it connects to
the existing MATLAB / VHDL / SystemC work, and how to extend it with real
hardware. It is written so that an engineering committee can verify every claim.

---

## 1. System context

```
        ┌──────────────────────── physical (optional) ────────────────────────┐
        │  soil probes + DHT22 ──► ESP32 + SX1276 ──► LoRa ──► gateway ESP32  │
        └───────────────────────────────────┬─────────────────────────────────┘
                                            │ USB serial or MQTT/WebSocket
┌───────────────────────────────────────────▼─────────────────────────────────┐
│ browser (this project)                                                      │
│                                                                             │
│  data layer            logic layer              presentation layer          │
│  ┌───────────────┐     ┌──────────────────┐     ┌─────────────────────────┐  │
│  │ CSV replay    │────►│ IrrigationControl│────►│ panels / charts / alerts│  │
│  │ Web Serial    │     │ LinkStats/LoRa   │     │ 3D world + packets      │  │
│  │ MQTT (WS)     │     │ AlertCenter      │     │ diagnostics             │  │
│  └───────────────┘     └──────────────────┘     └─────────────────────────┘  │
│          ▲                      ▲                          ▲                │
│          │                      │                          │                │
│   data/sensor_data.csv   results/lora_link_trace.csv   three.js + Chart.js  │
└─────────────────────────────────────────────────────────────────────────────┘
```

The browser is a **monitoring client**, not a controller: the pump command is
computed by a software model identical to the documented law, displayed, and
compared with the recorded dataset. No actuator is switched.

---

## 2. Module map

| Module | Responsibility | Key exports |
|---|---|---|
| `js/main.js` | boot, state machine, playback timer, transports, diagnostics wiring | `window.SmartFarm` debug API |
| `js/config.js` | single source of truth: paths, thresholds, LoRa modem assumptions, 3D layout | `CONTROL`, `LORA`, `SITE`, `PLAYBACK`, `computeTimeOnAir()` |
| `js/data/csv.js` | RFC-style CSV split, header normalisation, range validation, MATLAB trace join | `parseSensorCsv`, `parseLoraTrace`, `fetchText` |
| `js/data/frame.js` | live frame parser (JSON / comma / whitespace) | `parseFrameLine` |
| `js/data/serial.js` | Web Serial transport with line buffering | `SerialSource` |
| `js/data/mqtt.js` | MQTT-over-WebSocket transport, on-demand mqtt.js | `MqttSource` |
| `js/logic/irrigation.js` | hysteresis + hold/fail-safe law, statistics, agreement | `IrrigationController`, `replayLaw` |
| `js/logic/lora.js` | airtime, log-distance link budget, link statistics, signal status | `TIME_ON_AIR`, `linkBudget`, `LinkStats` |
| `js/logic/alerts.js` | deduplicated alert engine with severity | `AlertCenter` |
| `js/scene/world.js` | procedural farm, sensors, gateway, station screen, labels, camera presets | `createWorld()` |
| `js/scene/packets.js` | packet flight, loss effects, stage detection, ordered stage events | `PacketAnimator` |
| `js/scene/labels.js` | projection of 3D anchors to styled HTML labels | `LabelLayer` |
| `js/presentation/stages.js` | 10 guided stages + component dictionary (EN/AR) | `PRESENTATION_STAGES`, `COMPONENT_INFO` |
| `js/presentation/controller.js` | event-driven guided stage machine, loss branch, manual/auto controls | `PresentationController` |
| `js/ui/*` | panels, Chart.js, packet table, alerts, diagnostics, guided panel | classes |
| `js/ui/presentation-view.js` | guided panel DOM, controls, progress, Arabic notes, component card | `PresentationView` |
| `tests/verify_web3d.py` | static verification without a browser | exit code 0/1 |
| `tests/presentation-test.html` | 29 guided-stage assertions without WebGL | `data-result` |

Dependency direction is strictly one-way: `data → logic → scene/ui → main`.
No module reaches into another module's DOM except through its public methods.

---

## 3. Data model

### 3.1 Raw row (CSV / live frame)

| Field | Type | Meaning |
|---|---|---|
| `sample` | int | frame number (CSV `Sample`) |
| `soil` | float | soil moisture % (NaN if unparsable) |
| `temperature` | float | air temperature °C |
| `humidity` | float | air humidity %RH |
| `received` | bool | telemetry delivered (CSV `Packet received`) |
| `recordedPump` | bool \| null | recorded actuator state (CSV `Pump`) |
| `valid` | bool | passes 0…100 % / numeric checks |
| `invalidReason` | string \| null | human-readable reason |

Header aliases remove units and punctuation, so both
`Soil moisture (%)` and `SoilMoisture` map to `soil`. Missing required columns
raise a `CsvError` that lists the offending headers.

### 3.2 Processed frame (history entry)

`{sample, soil, temperature, humidity, received, pump, recordedPump}` where
`pump` is the **controller output** (0/1) and `received` is the effective link
outcome (`row.received && row.valid`). Charts, PDR/PLR and the pump chart all
consume this single structure.

---

## 4. Irrigation control law

### 4.1 State machine

```
            soil < dry                         soil > wet
   ┌─────────────────────────► ON ◄──┐   ┌──────────────► OFF ◄─┐
   │                                 │   │                      │
 OFF (initial, safe) ────────────────┘   └──────────────────────┘
        dry ≤ soil ≤ wet  →  hold previous state
        packet lost / invalid → hold (default) | OFF after N losses (fail-safe)
```

* Dry threshold **30 %**, wet threshold **40 %** (hysteresis band 30…40 %).
* A frame is *trustworthy* only if `received == true` **and**
  `0 ≤ soil ≤ 100`. A physically impossible value (e.g. 150 %) is treated
  exactly like a lost packet — the same rule as `sample_ok` in
  `vhdl/irrigation_controller.vhd`.
* `hold` = the documented law (`irrigation_control.m`, `Mode="hold"`).
* `failsafe` = watchdog: after `maxHoldSamples = 3` consecutive bad frames the
  pump is forced OFF (`Mode="failSafe"`, VHDL `FAILSAFE_ON_LOSS = true`).
* Statistics: transitions, activations, hold samples, loss samples, watchdog
  trips, ON percentage and **agreement** with the recorded pump column.

The implementation is verified against the recorded dataset: **100.00 %
agreement over 120 frames** (shown live in the irrigation card and in the
diagnostics panel, and reproduced by `tests/verify_web3d.py`).

### 4.2 Stale-data policy in the UI

When a frame is lost the dashboard:

* marks the link **DEGRADED / LINK LOST**,
* changes the sensor label to **“no frame”** and adds a red border,
* keeps the last measured number but tags the card **“holding last frame”**,
* logs the packet as **LOST** with the arrival attempt time,
* leaves the pump command unchanged (unless fail-safe is selected).

No stale value is ever presented as a fresh measurement.

---

## 5. LoRa model

### 5.1 Airtime (Semtech CSS formula)

```
Tsym      = 2^SF / BW
n_payload = 8 + max(ceil((8·PL − 4·SF + 28 + 16·CRC − 20·IH) / (4·(SF − 2·DE))) · (CR + 4), 0)
ToA       = (n_preamble + 4.25 + n_payload) · Tsym
```

With the project defaults (SF7, BW 125 kHz, CR 4/5, 8 preamble symbols, 16-byte
payload, explicit header, CRC on) the dashboard computes **46.34 ms** — exactly
the value of `matlab/functions/lora_time_on_air.m`.

### 5.2 Link budget (display only)

`results/lora_link_trace.csv` (produced by `lora_link_budget.m`) provides the
per-frame `distance_m`, `pathLoss_dB`, `rxPower_dBm` (RSSI), `snr_dB`,
`linkMargin_dB` and `packetErrorProbability`. The dashboard joins it by sample
index and shows RSSI/SNR as **model** values. Packet delivery is **not** decided
by this model — it comes from the recorded `Packet received` column. This
separation is intentional and documented in the UI.

Signal status combines the recorded losses with the model RSSI:

| Condition | Status |
|---|---|
| ≥ 3 consecutive lost frames | LINK LOST (critical) |
| 1–2 lost frames | DEGRADED |
| RSSI ≥ −100 dBm | ONLINE (strong margin) |
| −110 … −100 dBm | ONLINE (nominal) |
| −120 … −110 dBm | WEAK |
| < −120 dBm | CRITICAL |

### 5.3 Latency shown in the packet table

`latency = ToA + gateway forwarding (25 ms) + deterministic jitter (3…21 ms)`
The jitter is a function of the sample index, so the table is stable across
replays. This is labelled “modelled”, not measured.

---

## 6. Packet animation

One `PacketAnimator` instance owns a pool of transient objects:

* each packet = one sphere (core) + two additive sprites (glow + trail),
* the path is a `CatmullRomCurve3` through the actual 3D coordinates of
  sensor → node → antenna → gateway → server → station screen,
* `curve.getPointAt(u)` provides arc-length parameterisation so the speed is
  visually constant,
* stage thresholds (`u.sensor`, `u.node`, `u.tx`, `u.gateway`, `u.server`,
  `u.db`, `u.dashboard`) are found at start-up by sampling the curve, so the
  HUD stage chain always matches the physical position.

Loss handling: a frame with `received == false` is cut at

```
u_lost = u_tx + (u_gateway − u_tx) · (0.34 + (sample mod 4) · 0.11)
```

i.e. between the transmitter and the gateway. The core turns red, scales up and
fades out; a red ring expands at the drop point and the stage chain marks
“Gateway” as failed. The corresponding table row is updated to **LOST**.

Memory safety: each packet disposes its materials on removal; the animator caps
the pool at 60 packets and effects expire after 0.8 s. If the browser cannot
animate fast enough (background tab, headless capture), `finalizeOlder()`
finalises any packet older than two telemetry frames using its recorded
outcome, so the table and the alert log never miss a delivery or a loss.

---

## 6.1 Deep links

`main.js` reads `?frame=`, `?play=1`, `?speed=` and `?tab=` after loading the
dataset. This makes a demo deterministic (for example
`?frame=38&play=1&speed=2&tab=packets` reaches the recorded losses at samples 41
and 44) and lets automated checks inspect specific states.

---

## 6.2 Guided presentation mode

`PresentationController` turns the packet animation into an academic narrative.
It keeps a **cycle** for one guided packet: the packet object, the frame/decision
snapshot, the loss flag, the arrival status and an ordered list of reached
stages. The snapshot is taken when the frame is processed, so the values shown
belong to the guided frame and do not drift with later packets.

### Event → stage mapping

| Animation event | Reached stage(s) |
|---|---|
| packet spawn | 1 — Soil Moisture Sensing |
| `node` | 2 — ESP32 acquisition |
| `tx` | 3 — LoRa transmission |
| `gateway` | 4 — Gateway reception, 5 — no-loss check |
| `lost` | 5 — loss detected |
| `server` | 6 — edge server |
| `db` | 7 — database |
| arrival (delivered or lost) | 8 — decision, 9 — pump, 10 — dashboard |

A lost frame therefore produces `1 → 2 → 3 → 5 → 8 → 9 → 10`; stages **4, 6
and 7** are in the `skipped` set and are rendered with a red hatched progress
segment and the label **NOT REACHED**. A stage is never marked completed before
its event.

`PacketAnimator.advanceStage()` emits every threshold crossed since the last
render, so a slow machine cannot skip a stage between two animation frames.
The packet flight is also finalised with its recorded outcome if it is older
than two telemetry frames, which keeps the table and alerts complete without
inventing a delivery.

### Controls and navigation

* Manual mode (default): events accumulate in `reached[]`; **Next** increments
  the active index inside that list and can never move ahead of the animation.
  **Previous** walks backwards. At the dashboard, **Next** starts waiting for a
  fresh frame so an old, already-finished packet is never adopted.
* Auto play jumps to the newest reached stage on every event.
* Pause calls the replay `pause()` and freezes the events; resume continues.
* Restart rewinds to frame 1 and resets the cycle.
* Start temporarily sets the replay to 0.5× and restores the previous speed on exit.

The guided panel renders the stage title, the four explanation blocks, the
formula, the live values of the guided frame, provenance tags, a status chip and
the Arabic presenter notes. The viewport banner mirrors the stage number, title,
status and paint mode; the progress bar uses green = completed, cyan = active,
blue = reached ahead, red hatch = skipped.

### Component explanations and 3D highlight

`world.js` tags every mesh of the sensor, node, gateway, server, database,
pump, tank and station groups with a `componentId`. `pickComponent(x, y)` uses a
`Raycaster` over those groups, and a click (movement < 6 px so orbiting does not
trigger it) opens the component card. The same groups provide
`setComponentHighlight(id, tone)` (ring + beam + marker) and
`setConnectionByU()` / `highlightLink()` for the current connection. `?scan=1`
projects every component to the screen and reports the raycast hits, which is
used by the automated check.

### Verification

`tests/presentation-test.html` runs 29 assertions without WebGL: the ten stage
titles, content completeness, component dictionary, delivered sequence
`1…10`, loss branch `1,2,3,5,8,9,10` with `4,6,7` skipped, no advancement before
an event, Next/Previous limits, pause/resume, restart, auto play, slower
presentation speed and component metadata. `run_browser_checks.sh` also boots
the real dashboard in presentation mode and verifies the DOM state and the
component picking.

---

## 7. 3D world

### 7.1 Coordinate system and layout

1 unit = 1 m, +Y is up. Platform spans x ∈ [−55, 55], z ∈ [−32, 32].

| Object | Position (x, z) |
|---|---|
| Field A / B / C / D | (−28, 14) / (−4, 14) / (−28, −8) / (−4, −8) |
| Soil sensors | inside each field, near the north edge |
| ESP32 nodes A–D | east edge of each field |
| Air node (T/RH) | (14, 24) |
| Water tank / pump | (−45, 24.5) / (−45, 16.5) |
| Main pipe manifold | pump → (−45, 6.5) → (8, 6.5) |
| LoRa gateway | (30, −24), 13.5 m mast |
| Edge server cabinet | (22, −12) |
| Time-series database cabinet | (25.2, −9.2) |
| Monitoring station | (38, 14), 12 × 9 × 5.2 m |

### 7.2 Rendering techniques

* **Instancing** – 4 fields × 32 plants are drawn with 8 `InstancedMesh`
  objects (stems + heads), keeping the draw-call count low.
* **Procedural textures** – grass, soil, earth, concrete and water-flow maps are
  generated on `<canvas>` at start-up; no image downloads, so the dashboard is
  completely offline and deterministic.
* **Canvas screen** – the station display is a 1024 × 384 canvas texture
  updated once per frame (values, badge, link status, path text).
* **HTML labels** – `LabelLayer` projects 3D anchors with `Vector3.project()`
  every animation frame and positions absolutely-placed `<div>` elements.
  Labels fade with distance and are hidden behind the camera.
* **Pump / water** – impeller rotation, pipe texture offset and tank surface
  rotation are driven by the controller output; the flow reverses to a slow
  idle drift when the pump is off.
* **Lighting** – hemisphere + directional sun with 2048² PCF-soft shadows,
  ACES tone mapping, sRGB output. Sky is a vertex-coloured dome.
* **Camera** – `OrbitControls` (damping, distance 7…140 m, polar limit) plus
  tweened presets in `SITE.camera`.

Measured in headless Chrome at 1680 × 1050: **≈ 250–300 draw calls,
≈ 35–43 k triangles, 14 labels** and 15–30 fps while rendering with software
WebGL. A GPU-backed browser is substantially faster; the scene is instanced and
contains no external textures.

---

## 8. Transports and frame schema

| Transport | Secure context | Frame format | Badge |
|---|---|---|---|
| CSV replay | any static server | project dataset | SIMULATED |
| Web Serial | `http://localhost` in Chrome/Edge | one JSON/CSV line per frame | MEASURED |
| MQTT/WebSocket | any page, broker must expose WS | JSON payload on a topic | MEASURED |

JSON keys are normalised (`SoilMoisture`, `soil_moisture`, `soil` are equivalent).
A frame without `packet_received` is assumed delivered; `false` creates a
visualised loss and a controller hold. Invalid ranges are marked `valid=false`
and the controller ignores them.

---

## 9. Diagnostics and verification

`js/ui/diagnostics.js` runs 13 checks and renders PASS/FAIL:

dataset loaded · header schema · range validation · control-law agreement ·
LoRa trace coverage · five charts · WebGL renderer · 3D scene rendering ·
labels anchored · packet paths built · animator ready · airtime sanity ·
no runtime errors.

The result is mirrored to `document.body.dataset.diag` so automated tools can
read it without screenshots.

`tests/verify_web3d.py` (Python, no browser) verifies:

1. all HTML assets exist;
2. the ES-module import graph resolves (20 modules);
3. every element id used from JavaScript exists in the HTML (135 ids);
4. the CSV parses and the law reproduces the recorded pump (100.00 %);
5. the LoRa trace covers all 120 samples;
6. vendor libraries exist and the airtime is plausible (46.34 ms).

`tests/logic-test.html` runs 13 assertions inside a real browser: simplified CSV
header aliases, missing-column rejection, out-of-range invalidation, hysteresis
sequence `110011`, fail-safe watchdog, JSON/plain frame parsing, airtime,
latency, signal state, dataset agreement (120/120) and trace size. It prints
`PASS 13/13` and sets `<body data-result="PASS 13/13">`.

`tests/presentation-test.html` runs 29 assertions on the guided mode (see
section 6.2) without WebGL.

`tests/run_browser_checks.sh` orchestrates all four layers (static, browser
logic, presentation, dashboard + presentation sync + raycast picking) on a
temporary server; the current result is
**8/8 + 13/13 + 29/29 + 13/13 with 0 runtime errors and picking OK**.

---

## 10. Extending the system

* **Backend / database** – add a `POST /frames` endpoint and replace the
  in-memory history with a fetch; the `processFrame()` boundary is the only
  place that needs to change.
* **More nodes** – extend `SITE.zones` and `SITE.nodes`; paths, labels and
  round-robin assignment are generated from that configuration.
* **More crops / buildings** – add a builder function in `world.js`; keep
  materials in the shared `materials` object to avoid duplicate textures.
* **Alarm delivery** – `AlertCenter.onRaise` can forward to e-mail/Telegram
  without touching the UI.
* **Security** – Web Serial requires a user gesture and a localhost secure
  context; MQTT credentials are entered at runtime and never stored.

---

## 11. Assumptions and limitations

* Dataset cadence is assumed to be 60 s per frame (same as the MATLAB model).
* The 3D tank level (70 %) is decorative; it is not a level sensor.
* Round-robin field assignment is a visualisation choice for a single-stream
  dataset, not a claim that four physical nodes exist.
* Losses are replayed, never generated by the page.
* The LoRa model outputs are documented engineering assumptions, not field
  measurements.
