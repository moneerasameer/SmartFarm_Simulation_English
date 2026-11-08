# DATA ANALYSIS — `data/sensor_data.csv`

**Project:** Smart Farm Monitoring and Automated Irrigation System (IoT / LoRa / MATLAB / Python / VHDL / SystemC)
**Dataset analysed:** `data/sensor_data.csv`
**Analysis date:** 2026-11-08
**Method:** read-only analysis (pandas 2.3.3 **and** an independent `csv`-module recomputation)
**File modified?** **No.** The CSV was only read. Its MD5 was identical before and after the analysis
(`9a8343666e45799de22dca5cdbeb977c`).

---

## 1. File profile

| Property | Value |
|---|---|
| Path | `data/sensor_data.csv` (project root → `data/`) |
| Size | 9 955 bytes |
| MD5 | `9a8343666e45799de22dca5cdbeb977c` |
| Lines | 121 (1 header + **120 data rows**) |
| Encoding | UTF-8 (`°` = 2 bytes `0xC2 0xB0`, no BOM) |
| Line endings | LF (no CRLF) |
| Trailing newline | yes |
| Delimiter | `,` — every one of the 121 lines contains exactly **7 fields** |
| Last modified | 2026-11-05 00:40 |
| Producer (inferred) | an earlier version of `python_dashboard/app.py`; the current app generates different values (§10, D-01) |

Raw header, first and last data line:

```
Sample,Soil moisture (%),Temperature (°C),Air humidity (%),Packet received,Pump,ML advice
0,30.852087127683028,23.920116058133825,53.877335642033735,True,OFF,No irrigation
119,33.503122588190436,19.018254814680585,67.24098855626201,True,ON,No irrigation
```

---

## 2. Schema / data dictionary

| # | Column (exact name) | Type detected | Unit | Kind | Meaning |
|---|---|---|---|---|---|
| 1 | `Sample` | `int64` | — | index | Sample (and packet) counter, **0 … 119**, contiguous |
| 2 | `Soil moisture (%)` | `float64` | % | measurement (synthetic) | Volumetric soil-moisture reading |
| 3 | `Temperature (°C)` | `float64` | °C | measurement (synthetic) | Air temperature |
| 4 | `Air humidity (%)` | `float64` | % | measurement (synthetic) | Relative air humidity |
| 5 | `Packet received` | `bool` | — | link telemetry | `True` = LoRa packet delivered, `False` = packet lost |
| 6 | `Pump` | text → `ON`/`OFF` | — | **derived** actuator state | Irrigation pump command produced by the controller |
| 7 | `ML advice` | text → 2 phrases | — | **derived** demo output | Decision-tree suggestion (educational, not agronomic) |

> Important for the report: columns 2–4 are *measurements* (synthetic), column 5 is *link telemetry*, while
> columns 6–7 are **derived decisions**, not sensor readings.

**Fields that are NOT recorded** (relevant for the LoRa/IoT narrative): timestamp, node/device ID, RSSI, SNR,
spreading factor / bandwidth, battery level, and a packet sequence number independent of `Sample`.
Consequently the dashboard can display delivery statistics but no real radio metrics (§5).

---

## 3. Integrity checks

| Check | Expected | Actual | Verdict |
|---|---|---|---|
| Missing values (all 7 columns) | 0 | **0** | ✅ PASS |
| Blank / empty cells | 0 | **0** | ✅ PASS |
| Leading/trailing spaces in any value | 0 | **0** | ✅ PASS |
| Fields per line | 7 × 121 | **7 × 121** | ✅ PASS |
| Data types | numeric where numeric, boolean where boolean | `int64`, `float64`×3, `bool`, 2× text | ✅ PASS |
| `Sample` contiguous 0…119 | yes | **yes**, monotonic increasing | ✅ PASS |
| Duplicate `Sample` indices | 0 | **0** | ✅ PASS |
| Duplicate rows (all 7 columns) | 0 | **0** | ✅ PASS |
| Duplicate sensor values within a column | allowed | 120 distinct values in each numeric column | ✅ PASS |
| Soil moisture inside 0–100 % | all | **0 violations** (13.94 … 62.82) | ✅ PASS |
| Air humidity inside 0–100 % | all | **0 violations** (39.73 … 75.34) | ✅ PASS |
| Temperature inside −20…60 °C | all | **0 violations** (18.53 … 30.61) | ✅ PASS |
| Column-name consistency | 7 stable names, no BOM/space artifacts | exact match, no leading/trailing spaces | ✅ PASS |
| `Packet received` tokens | only `True` / `False` | `{'True', 'False'}` | ✅ PASS |
| `Pump` tokens | only `ON` / `OFF` | `{'ON', 'OFF'}` | ✅ PASS |
| `ML advice` tokens | 2 expected phrases | `{'Irrigation suggested', 'No irrigation'}` | ✅ PASS |
| Invalid communication status values | 0 | **0** | ✅ PASS |
| Numeric precision | consistent | 12–15 decimal places (raw IEEE-754 text, see D-02) | ⚠️ cosmetic |

**Conclusion of §3:** the file is **structurally clean** — no missing values, no duplicates, no type or range
violations and no malformed status tokens. The only remark is cosmetic (excessive decimal places).

---

## 4. Descriptive statistics

n = 120 samples for every column.

| Statistic | Soil moisture (%) | Air temperature (°C) | Air humidity (%) |
|---|---|---|---|
| Count | 120 | 120 | 120 |
| **Mean** | **41.4256** | **25.4417** | **54.2380** |
| Median | 40.5084 | 26.1556 | 52.6036 |
| Std. dev. (sample, ddof = 1) | 12.5750 | 3.1877 | 7.9748 |
| Std. dev. (population, ddof = 0) | 12.5225 | 3.1744 | 7.9415 |
| Minimum | **13.9366** (sample 105) | 18.5288 | 39.7297 |
| 25th percentile | 30.6127 | 22.9454 | 48.6358 |
| 75th percentile | 51.7498 | 28.1691 | 60.0968 |
| Maximum | **62.8188** (sample 51) | 30.6118 | 75.3435 |
| Range | 48.8823 | 12.0830 | 35.6137 |
| First / last value | 30.85 / 33.50 | 23.92 / 19.02 | 53.88 / 67.24 |

**Meaning of each statistic**

* **Mean** — arithmetic average over the whole run; these are exactly the values reported in
  `results/smart_farm_summary.csv` (`avgSoil`, `avgTemperature`, `avgHumidity`).
* **Median** — the 50 % point. For soil moisture the median (40.51) is slightly **below** the mean (41.43),
  so the distribution is marginally right-skewed: a few high-moisture samples pull the average up.
* **Standard deviation** — how much the signal varies. Soil moisture is the most dynamic signal (σ ≈ 12.58 %),
  temperature the most stable (σ ≈ 3.19 °C), humidity intermediate (σ ≈ 7.97 %).
  `ddof = 1` treats the 120 samples as a sample of a longer process (the convention used by MATLAB's `std`);
  `ddof = 0` treats them as the complete population.
* **Percentiles / range** — describe the operating envelope the controller must survive: soil moisture spans
  13.94 % … 62.82 %, i.e. it crosses both thresholds, so the dataset exercises the pump ON, pump OFF **and**
  hold branches (§6).

**Zone distribution relative to the documented thresholds (dry = 30 %, wet = 40 %)**

| Zone | Condition | Samples | Share |
|---|---|---|---|
| Dry | soil < 30 % | 27 | 22.50 % |
| Hysteresis band | 30 % ≤ soil ≤ 40 % | 32 | 26.67 % |
| Wet | soil > 40 % | 61 | 50.83 % |

**Cross-signal correlation (Pearson):** soil↔temperature **+0.8420**, soil↔humidity **−0.8319**,
temperature↔humidity **−0.8707**. The signs are physically coherent (warm, dry air ↔ drier soil), which confirms
that the three signals come from one consistent synthetic model rather than from independent noise.


---

## 5. Communication (LoRa packet) analysis

Each sample is treated as one transmitted packet, so *samples = packets*.

| Metric | Formula | Value |
|---|---|---|
| Total packets (samples) | n | **120** |
| Successful packets (`True`) | Σ received | **116** |
| Lost packets (`False`) | n − received | **4** |
| **Packet Delivery Ratio (PDR)** | received / n | 116 / 120 = 0.966667 → **96.6667 %** |
| **Packet Loss Ratio (PLR)** | lost / n | 4 / 120 = 0.033333 → **3.3333 %** |
| Consistency | PDR + PLR | 96.6667 + 3.3333 = **100.0000 %** ✅ |
| Loss events (runs of consecutive losses) | — | **4** |
| Longest outage | max run length | **1 sample** |
| Availability | 1 − PLR | **0.9667** |

**Meaning**

* **PDR** — fraction of control cycles for which the gateway received fresh sensor data. It is the key LoRa KPI in
  this project: a lost packet means the controller must **hold** its previous state instead of acting.
* **PLR** — the complementary fraction of *missing* updates. 3.33 % is close to the 4 % loss probability of the
  project's software link model (`packetLossProbability = 0.04` in `matlab/smart_farm_simulation.m`), so the dataset
  is statistically consistent with the model that was meant to produce it.
* **Loss events / longest outage** — whether losses are isolated or bursty. All four losses are isolated
  (length 1), so the link degrades gracefully instead of creating long blind periods.

**Exact loss locations**

| Lost at sample | Neighbouring packets | Soil moisture | Pump state (recorded) |
|---|---|---|---|
| 41 | 40 = received, 42 = received | 62.81 % | OFF |
| 44 | 43 = received, 45 = received | 54.85 % | OFF |
| 96 | 95 = received, 97 = received | 19.71 % | ON |
| 100 | 99 = received, 101 = received | 17.42 % | ON |

---

## 6. Pump (irrigation actuator) analysis

| Metric | Value |
|---|---|
| Pump ON rows | **44** (36.67 %) |
| Pump OFF rows | **76** (63.33 %) |
| State transitions | **3** |
| Pump ON ranges | samples **2–10** (9 samples) and **85–119** (35 samples) |
| Samples inside the 30–40 % band with pump ON (hold behaviour) | 17 |

**Transitions in detail** — all three occur on *received* packets, at values consistent with the law

| Sample | Change | Soil moisture | Packet |
|---|---|---|---|
| 2 | OFF → ON | 23.62 % (< 30 % ⇒ irrigate) | received |
| 11 | ON → OFF | 40.81 % (> 40 % ⇒ stop) | received |
| 85 | OFF → ON | 29.97 % (< 30 % ⇒ irrigate) | received |

**Control-law verification against the recorded data**

| Rule replayed on the CSV columns | Pump ON result | Agreement with recorded `Pump` |
|---|---|---|
| **Documented hysteresis law** (ON < 30 %, OFF > 40 %, hold inside the band, hold on lost packet) | 44 | **120 / 120 = 100.00 %** ✅ |
| Simple single threshold `pump = soil < 30 %` (as in `matlab/smart_farm_complete.m`) | 27 | 103 / 120 = 85.83 % ❌ |

Additional consistency checks (all pass):

* Pump ON while soil > 40 % (would violate the OFF rule): **0 samples**
* Pump OFF while soil < 30 % (would violate the ON rule): **0 samples**
* Pump state changed on a lost packet (must hold): **0 changes** — checked at samples 41, 44, 96, 100

**Meaning**

* The `Pump` column is **not sensor data**; it is the output of the controller. Its 100 % agreement with the
  documented 30/40 hysteresis law proves the dataset was produced with hysteresis, and that no spurious actuation
  happened while telemetry was missing.
* The 85.83 % agreement with a single-threshold rule shows that one threshold would mis-command 17 of 120 cycles
  (mostly inside the 30–40 % band) — the concrete, data-backed justification for using hysteresis.

---

## 7. `ML advice` analysis

| Token | Rows | Share |
|---|---|---|
| `No irrigation` | 96 | 80.00 % |
| `Irrigation suggested` | 24 | 20.00 % |

| Cross-check | Value |
|---|---|
| Rule `soil < 30 % AND temperature > 18 °C` (the label rule used to train the demo classifier) | 27 suggestions |
| Recorded `ML advice` suggestions | 24 |
| Agreement | **117 / 120 = 97.50 %** |
| Disagreement samples | **5, 85, 108** |

**Meaning:** the column is a *model output*, not a measurement. It agrees with its own training rule on 97.5 % of the
rows; the three exceptions are samples where the trained decision tree generalises slightly differently from the
underlying rule. This is expected for a depth-3 tree and matches the documentation statement that the classifier is
"for demonstration only" — it must not be presented as an agronomic recommendation.


---

## 8. Cross-validation against the project's own results

`results/smart_farm_summary.csv` is the file produced by `matlab/smart_farm_complete.m` when it reads **this**
dataset. Every value was recomputed from the CSV and compared:

| Quantity | In `smart_farm_summary.csv` | Recomputed from the CSV | Delta | Verdict |
|---|---|---|---|---|
| `avgSoil` | 41.425576 | 41.425576 | 0.000000 | ✅ MATCH |
| `avgTemperature` | 25.441694 | 25.441694 | 0.000000 | ✅ MATCH |
| `avgHumidity` | 54.238031 | 54.238031 | 0.000000 | ✅ MATCH |
| `totalPackets` | 120 | 120 | 0 | ✅ MATCH |
| `successfulPackets` | 116 | 116 | 0 | ✅ MATCH |
| `lostPackets` | 4 | 4 | 0 | ✅ MATCH |
| `deliveryRate` | 96.666667 | 96.666667 | 0.000000 | ✅ MATCH |
| `packetLossRate` | 3.333333 | 3.333333 | 0.000000 | ✅ MATCH |
| **`pumpON`** | **27** | **44** | **+17** | ❌ **MISMATCH** |

**Explanation of the single mismatch (this is a code issue, not a data issue):**
`results/smart_farm_summary.csv` claims 27 pump-ON samples, but the dataset itself contains **44** ON rows.
The MATLAB script recomputes the pump as `pump = double(soil < 30)` (`matlab/smart_farm_complete.m`, line 68) —
a single-threshold rule — and therefore **ignores the `Pump` column that is stored in the CSV**. 27 is exactly
`count(soil < 30 %)` (verified: 27 samples are below 30 %).

Consequence: the MATLAB report and figures describe a *different* controller than the one documented in the report
(hysteresis 30/40) and than the one recorded in the dataset. This is registered as finding **D-03** and matches
audit items E-03/E-04.

---

## 9. Independent recomputation (proof of consistency)

The same metrics were recomputed with the standard-library `csv` module (no pandas, no numpy) to rule out a
library-specific artefact:

| Metric | pandas 2.3.3 | pure Python (`csv`) | Identical? |
|---|---|---|---|
| Rows | 120 | 120 | ✅ |
| Mean soil moisture | 41.4255755358 | 41.4255755358 | ✅ |
| Mean temperature | 25.4416935298 | 25.4416935298 | ✅ |
| Mean air humidity | 54.2380306970 | 54.2380306970 | ✅ |
| Received / lost | 116 / 4 | 116 / 4 | ✅ |
| PDR / PLR | 96.6666666667 % / 3.3333333333 % | 96.6666666667 % / 3.3333333333 % | ✅ |

The dashboard (`python_dashboard/app.py`) displays exactly the same values, and its own test suite asserts them
(`python_dashboard/tests/run_tests.py`: 13/13 checks pass, including *"packet counters come from the CSV"*,
*"pump state comes from the CSV"* and *"replayed control law matches the recorded pump"*).

---

## 10. Findings

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| **D-01** | High | **The dataset is not reproducible from the current code.** Regenerating the dashboard signal chain with the documented parameters (seed 7, 120 samples, 4 % loss) produces different values (soil[0] = 29.4219 vs 30.8521 in the CSV; max deviation 14.11 units; 7/120 packet flags differ). The CSV therefore came from an earlier version of the generator, and no script currently in the repository can recreate it. | Recomputation in the audit (§T-14) and in this analysis |
| **D-02** | Low (cosmetic) | Numeric values are stored as raw IEEE-754 text with **12–15 decimal places** (e.g. `53.877335642033735`). Readable by MATLAB/pandas, but unnecessary and visually noisy for a report appendix; 2–3 decimals would be enough for sensor data. | §3, §4 |
| **D-03** | High | **The dataset and the MATLAB results disagree on the pump statistic** (44 vs 27) because `smart_farm_complete.m` uses a single threshold and ignores the stored `Pump` column. | §8 |
| **D-04** | Medium | **No radio-metric columns** (RSSI, SNR, SF/BW, TX power) and **no timestamps**, although the project is presented as a LoRa/IoT system. Only a boolean reception flag exists, which limits what can be claimed about the link. | §2 |
| **D-05** | Medium | `Pump` and `ML advice` are **derived** columns stored next to raw measurements with no marker in the schema. A reader can easily mistake them for sensor readings. | §2 |
| **D-06** | Low | Sample index doubles as the **packet counter**; there is no independent packet ID or retry/sequence number, so duplicates or retransmissions cannot be represented. | §2 |
| **D-07** | Info | 3.33 % PLR is **statistically consistent** with the 4 % model probability, and all losses are isolated (longest outage = 1). The link model behaves as intended. | §5 |
| **D-08** | Info | Correlations (+0.84 soil/temp, −0.83 soil/humidity, −0.87 temp/humidity) show a **physically coherent synthetic model**; the data is not random noise. | §4 |


---

## 11. Recommendations

| Priority | Action | Reason |
|---|---|---|
| **P0** | Add `python_dashboard/data_generator.py` that writes the CSV **deterministically** (parameters: samples, seed, loss %, thresholds) and regenerate the file from it, or keep the current file and document it explicitly as a frozen sample with its exact parameters. | Removes D-01 — currently nobody can answer "where does this file come from?" |
| **P0** | Make `matlab/smart_farm_complete.m` either **read the `Pump` column** or implement the 30/40 hysteresis, then regenerate `results/smart_farm_summary.csv`. | Removes D-03 — the report currently contains a pump statistic that contradicts both the dataset and the documented control law |
| P1 | Add a `README`/schema note marking `Pump` and `ML advice` as **derived** columns, and `Packet received` as link telemetry. | Removes D-05, protects against a misreading during the defence |
| P1 | Optionally extend the schema with `Timestamp`, `RSSI_dBm`, `SNR_dB`, `Distance_m`, `Node_ID` — clearly labelled as **model estimates** if they are not measured. | Addresses D-04 without inventing measurements |
| P2 | Format numeric columns to 2–3 decimals when regenerating. | D-02 cosmetic |
| P2 | Keep the current file untouched in `data/` (or archive the original) and let the generator write a new, reproducible version. | Preserves comparability with the figures already in `results/` |

---

## 12. How to reproduce this analysis

```bash
cd /Users/gtx-z/Downloads/SmartFarm_Simulation_English

# integrity + statistics + metrics (read-only)
.venv/bin/python - <<'EOF'
import pandas as pd
df = pd.read_csv("data/sensor_data.csv")
print(df.shape, df.dtypes.to_dict())
print(df[["Soil moisture (%)","Temperature (°C)","Air humidity (%)"]].mean())
print(df["Packet received"].value_counts(), df["Pump"].value_counts(), df["ML advice"].value_counts())
print("PDR =", 100*df["Packet received"].mean(), "%")
EOF

# dashboard cross-check (displays exactly these numbers)
.venv/bin/streamlit run python_dashboard/app.py
.venv/bin/python python_dashboard/tests/run_tests.py
```

Shell one-liners for the headline metrics:

```bash
# count samples
awk 'NR>1' data/sensor_data.csv | wc -l                     # -> 120

# packets received / lost
awk -F, 'NR>1 {c[$5]++} END {for (k in c) print k, c[k]}' data/sensor_data.csv
# -> True 116, False 4

# average soil moisture
awk -F, 'NR>1 {s+=$2; n++} END {printf "%.6f\n", s/n}' data/sensor_data.csv   # -> 41.425576
```

---

## 13. Summary of the verified numbers

| Requested item | Verified value |
|---|---|
| 1. Number of sensor samples | **120** (index 0–119, contiguous, no duplicates) |
| 2. Soil moisture values | min **13.94 %** (sample 105), max **62.82 %** (sample 51), mean **41.4256 %**, σ 12.5750 |
| 3. Temperature values | min **18.53 °C**, max **30.61 °C**, mean **25.4417 °C**, σ 3.1877 |
| 4. Air humidity values | min **39.73 %**, max **75.34 %**, mean **54.2380 %**, σ 7.9748 |
| 5. PacketReceived values | `True` **116**, `False` **4** — only these two tokens, no invalid status |
| 6. Pump values | `ON` **44**, `OFF` **76** — consistent with the 30/40 hysteresis law (100 % of samples) |
| 7. MLAdvice values | `Irrigation suggested` **24**, `No irrigation` **96** — matches its label rule on 97.5 % of rows |
| Missing values | **0** |
| Invalid data types | **0** |
| Incorrect sensor readings (out of range) | **0** |
| Duplicate samples | **0** (`Sample` and full-row) |
| Inconsistent column names | **0** |
| Invalid communication status values | **0** |
| **Average soil moisture** | **41.4256 %** |
| **Average temperature** | **25.4417 °C** |
| **Average air humidity** | **54.2380 %** |
| **Successful LoRa packets** | **116** |
| **Lost packets** | **4** |
| **Packet Delivery Ratio** | **96.6667 %** |
| **Packet Loss Ratio** | **3.3333 %** |

All values above were reproduced twice (pandas and the `csv` module) and are identical to what the Streamlit
dashboard displays and to what `results/smart_farm_summary.csv` reports — **except** `pumpON`, where the MATLAB
summary says 27 while the dataset contains 44 (finding D-03).

**The file `data/sensor_data.csv` was not modified during this analysis** (MD5 `9a8343666e45799de22dca5cdbeb977c`
before and after).

