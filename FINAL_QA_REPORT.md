# Final Quality Assurance Report

**Project:** Smart Farm Monitoring and Automated Irrigation System  
**Review date:** 9 November 2026  
**Role:** Independent university project examiner  
**Audit scope:** Source code, datasets, simulations, automated tests, reports, presentations, and project organization  
**Change policy:** No source code was modified. Executable tests ran from an isolated temporary copy to avoid overwriting project results.

## Examiner Verdict

**Readiness: Moderately ready as a software-only graduation-project prototype; not ready to be represented as a deployed or fully co-simulated IoT system.** The current automated regression passes, and the main sensor analysis, LoRa model, VHDL controller, and SystemC scenario have executable evidence. The central remaining risk is the gap between what some documents claim and what the current sources actually implement or compare.

Before submission, use the new 18-slide defense deck and current Markdown technical report as the authoritative materials. Correct or clearly archive the stale README, historical audit summary, legacy DOCX, and 11-slide PowerPoint. Be explicit that all sensor and radio outputs are simulated or synthetic and that no hardware was tested.

**Critical runtime failures:** None observed in the executed regression.  
**Material findings:** cross-simulator timing is not equivalent as documented; SystemC processing is outside the controller path; ML and MATLAB range-validation claims are inaccurate; older project documents are stale.

## Priority Findings

### High: Cross-simulator verification is overstated

[INTEGRATION_REPORT.md](INTEGRATION_REPORT.md#L257) says the same seven-step stimulus, with each step held for eight cycles, was applied to MATLAB, SystemC, and VHDL. The CSV scenario specifies eight cycles; MATLAB expands each step to eight samples, and SystemC holds each step for eight cycles. The VHDL testbench instead applies each mapped case for one clock edge in its `step` procedure. The integration checker maps VHDL testbench output labels to scenario rows and compares final pump states; it does not replay the same eight-cycle trace into VHDL.

This explains why the final outputs can agree while the temporal behavior does not. It is especially relevant to packet loss: MATLAB/SystemC exercise an eight-packet outage and a three-loss watchdog, whereas the VHDL test exercises a single lost-packet case and its fail-safe configuration switches OFF immediately. The 21/21 result is valid as a mapped final-state comparison, not as cycle-equivalent co-simulation.

**Action:** Either extend the VHDL stimulus and checker to execute the repeated scenario and compare timing/policy explicitly, or narrow the report to “mapped scenario end states agree.” Keep the differing fail-safe policies visible.

### High: Current ML classifier claims are unsupported

The current [Python dashboard](python_dashboard/app.py) imports pandas, Plotly, and Streamlit; it does not train or invoke a Decision Tree. The `ML advice` values are read from the CSV and displayed. The CSV contains 24 “Irrigation suggested” labels and 96 “No irrigation” labels. `python_dashboard/requirements.txt` does not declare scikit-learn.

The root [README.md](README.md#L9), legacy [Smart_Farm_Presentation_EN.pptx](Smart_Farm_Presentation_EN.pptx), and parts of [FINAL_PROJECT_REPORT.md](FINAL_PROJECT_REPORT.md#L276) and [FINAL_PROJECT_REPORT.md](FINAL_PROJECT_REPORT.md#L1170) describe a current illustrative classifier or a depth-3 Decision Tree. That description does not match the current source. An installed package in the local virtual environment is not evidence that the project uses it.

**Action:** Remove or qualify the classifier claims and describe `ML advice` as precomputed dataset content, or implement and test the classifier as a separate feature with documented synthetic labels. Do not claim ML functionality based on the CSV column alone.

### Moderate: SystemC processor is not in the pump-control path

The SystemC testbench instantiates `SoilMoistureProcessor`, but the controllers bind directly to `soil_gw_s` and `ready_s` in [smart_farm_tb.h](systemc/src/smart_farm_tb.h#L92). The processor’s `zone_s` and `valid_s` outputs are not consumed by either controller. The SystemC README diagram presents this as a monitoring branch, which matches the wiring; [FINAL_PROJECT_REPORT.md](FINAL_PROJECT_REPORT.md#L1121) calls the SystemC control path a registered five-stage pipeline, which does not match that wiring.

The 14 assertions check pump outputs for seven scenarios. They do not assert processor classification, validity behavior, packet counters, payload integrity, or the reported sample statistics. The testbench prints those values, but printing is not a self-check.

**Action:** Either route validated processor outputs into the controller and add checks for that interface, or state clearly that the processor is an observability/side branch and revise the pipeline and verification claims.

### Moderate: MATLAB range-validation claim is inaccurate

[FINAL_PROJECT_REPORT.md](FINAL_PROJECT_REPORT.md#L140) claims range validation in both Python and MATLAB. `load_sensor_data.m` converts values, removes missing/nonnumeric rows, and parses booleans, but does not reject or flag soil, humidity, or temperature values outside physical bounds. The integration check validates the current CSV fixture; it does not add range validation to the MATLAB loader.

The dashboard counts out-of-range values and displays a warning, but retains those rows for `replay_control`; an out-of-range soil value can still affect the displayed recommended pump state.

**Action:** Add explicit range validation and exclude/mark invalid measurements before control replay, or correct the report to distinguish dashboard and fixture checks from MATLAB-loader behavior.

### Moderate: Authoritative documentation is unclear and stale copies remain

The root [README.md](README.md) identifies the legacy `systemc/smart_farm_systemc.cpp` as the SystemC model, says a VHDL testbench still needs to be added at [README.md](README.md#L34), gives a Linux-only SystemC build recipe, and suggests GNU Octave compatibility without evidence. The current project instead has a modular SystemC implementation and self-checking GHDL testbench. The README also says Python 3.10+ while this regression ran successfully with Python 3.9.6.

[PROJECT_AUDIT.md](PROJECT_AUDIT.md) retains an initial audit that says there is no Git repository, no testbench, and no SystemC installation, followed by dated sections recording that these were resolved. The update history is useful, but the opening summary is now misleading if read alone. The tracked legacy DOCX still says runtime results should be recorded after execution. The tracked legacy PowerPoint has 11 text-only slides, no speaker notes, and no actual result visuals; it is superseded by `Smart_Farm_Graduation_Defense.pptx`.

**Action:** Update the root README, mark the old audit sections as historical or replace the executive summary, and archive/label the legacy Office files so only one current report and defense deck appear authoritative. Do not advertise Octave until it is tested.

### Minor: Other reporting and robustness issues

- The “208 assertions” total is the sum of suite executions, not 208 independent checks. It includes the same 34 integration checks both before and after the component runs and overlaps with golden-scenario behavior checked inside component suites. Report individual suite counts and label 208 as total check executions, not unique coverage. The count breakdown appears in [FINAL_PROJECT_REPORT.md](FINAL_PROJECT_REPORT.md#L1237).
- In [smart_farm_complete.m](matlab/smart_farm_complete.m#L136), `injectedLosses` counts additional losses relative to the original trace. The console label says “19 packets lost,” while all 21 samples in the forced outage window are lost; two were already lost in the recorded trace. Rename the console field to “additional packets forced lost” and separately report the total window loss.
- The standalone [smart_farm_simulation.m](matlab/smart_farm_simulation.m) is a separate stochastic simulation, not the CSV-driven main analysis or the link-budget model. Its 98.3% delivery and 51 pump-ON samples are valid for that separate seeded run, but must not be mixed with the CSV’s 96.67% PDR and 44 pump-ON rows. Its displayed RSSI/SNR are illustrative and do not determine packet reception.
- MATLAB and SystemC currently keep thresholds in separate source constants; no shared configuration file exists. The different loss/fail-safe models are partly intentional, but remain a drift risk.
- Folder clutter remains: the 533 MB `.venv`, 304 MB VS Code installer, old MATLAB figures, and top-level VHDL object files/binary sit beside current deliverables. The current defense deck, content, and generator are untracked in Git at audit time; the older PowerPoint and DOCX are tracked.

## Test Results

The complete `integration/run_integration.sh` suite was run on macOS 26.7 (Intel) from `/tmp/smartfarm-qa.iZWCNR`, a temporary copy of the project. Its `.venv` pointed to the existing local environment. **All 8 steps passed.**

| Test | Result | Scope / qualification |
|---|---:|---|
| Pre-run integration checker | 34/34 passed | CSV schema, source configuration, existing artifacts, mapped scenario outputs |
| MATLAB main analysis | 22/22 passed | CSV analysis, irrigation modes, packet statistics, stress scenario |
| MATLAB LoRa simulation | 15/15 passed | Assumption-driven link-budget and packet model checks |
| MATLAB golden replay | 7/7 passed | Seven repeated scenario steps through MATLAB controller |
| Python Streamlit AppTest | 13/13 passed | Rendering, counters, threshold interaction, missing/malformed/dirty data paths |
| GHDL VHDL testbench | 69/69 passed | Three DUT configurations, threshold boundaries, reset, invalid samples, loss cases |
| SystemC build and simulation | 14/14 passed | Seven scenario end states × two pump policies; one warning came from external `sc_fifo.h` |
| Post-run integration checker | 34/34 passed | Parses current run outputs and compares mapped final states |

Additional execution and reproducibility checks:

- The standalone MATLAB simulation completed: 118/120 packets received (98.3%) and 51 pump-ON samples in its separate seeded scenario. It has no self-checking suite.
- The deprecated `smarf.m` wrapper executed the maintained analysis and its 22 checks passed.
- The legacy single-file SystemC source compiled and ran for its 30-second simulation trace; it contains no assertions and is not the maintained test target.
- An independent CSV read confirmed 120 rows, samples 0-119, no blank fields or duplicate sample IDs, 116 received / 4 lost, and means 41.4256% soil, 25.4417 C temperature, and 54.2380% humidity.
- Five regenerated CSV artifacts exactly matched the checked-in files: `smart_farm_summary.csv`, `irrigation_mode_comparison.csv`, `packet_loss_events.csv`, `lora_scenarios.csv`, and `golden_matlab.csv`.
- The current `Smart_Farm_Graduation_Defense.pptx` reopens with 18 slides, 18 nonempty speaker-note sections, and 7 embedded images. The legacy PowerPoint has 11 slides, 0 notes, and 0 embedded images.

The passing regression verifies software behavior under the exercised cases only. It does not establish hardware behavior, RF range, sensor accuracy, energy use, water savings, ML quality, or timing equivalence across models.

## Completion Checklist

| Review area | Status | Examiner assessment |
|---|---|---|
| 1. Python dashboard execution | **Verified** | 13/13 AppTest checks passed; local Streamlit app reads the dataset. Out-of-range values are warned about but still used by replay. |
| 2. CSV data integrity | **Tested** | Independent and integration checks confirm schema, 120 rows, valid ranges, no blanks/duplicate sample IDs, 116/4 reception split. Exact generation provenance remains unresolved. |
| 3. MATLAB execution | **Verified** | Main analysis 22/22; golden replay 7/7; standalone variant and wrapper also executed. |
| 4. LoRa simulation logic | **Verified** | MATLAB link-budget model passed 15/15 checks; its outputs are model results under assumptions, not measured radio behavior. |
| 5. VHDL compilation | **Verified** | GHDL analysis/elaboration and synthesis check passed in the full flow. No FPGA implementation. |
| 6. GHDL testbench execution | **Verified** | 69/69 self-check assertions passed and simulation terminated with status 0. |
| 7. SystemC compilation and simulation | **Incomplete** | Maintained model builds and 14/14 pump-output checks pass, but processor outputs are bypassed and other module behavior is not self-checked. |
| 8. Irrigation control consistency | **Incomplete** | 30%/40% thresholds and hysteresis agree. Loss policy differs: MATLAB/SystemC watchdog after 3 losses, VHDL immediate OFF option, Python hold only. |
| 9. Communication failure handling | **Incomplete** | Tested scenarios pass within each implementation; equivalent loss duration and transient timing are not compared across all simulators. |
| 10. Documentation accuracy | **Incomplete** | Current Markdown reports are substantially detailed, but README, historical audit summary, some final-report claims, and legacy DOCX need correction/labeling. |
| 11. Presentation accuracy | **Verified** | Current 18-slide deck and notes reflect software-only scope and actual results. Legacy deck is incomplete and should be marked superseded. |
| 12. Project folder organization | **Incomplete** | Build/environment clutter, duplicate legacy deliverables, and untracked current presentation files make the submission set ambiguous. |
| Precomputed ML-advice field | **Implemented** | The CSV stores advice labels and the dashboard displays them; no model is trained or invoked. |
| Physical sensors, radio, pump, relay, FPGA | **Not implemented** | Correctly outside the current software-only scope; no physical results should be claimed. |
| Reproducible CSV producer | **Not implemented** | The checked-in trace is structurally valid but cannot be regenerated from current source. |
| Runtime MATLAB/VHDL/SystemC co-simulation | **Not implemented** | Integration is a post-run comparison of logs and a golden scenario, not runtime data exchange. |
| Current Decision Tree / ML training path | **Not implemented** | Current dashboard displays precomputed `ML advice` values only. |

## Recommended Actions Before Submission

1. Correct the ML, MATLAB range-validation, SystemC pipeline, and eight-cycle VHDL stimulus claims.
2. Choose and document one canonical lost-packet/fail-safe policy; if policies intentionally differ, state that in every high-level summary.
3. Refresh the root README and make the new Markdown report/deck the only clearly authoritative defense documents.
4. Add range validation before Python control replay and add SystemC checks for processor validity/classification if that module is intended to be part of the controller path.
5. Add a deterministic dataset generator or explicitly describe the CSV as a frozen, synthetic input with unknown generation provenance.
6. Prepare a clean submission folder: exclude the installer, virtual environment, build artifacts, superseded figures, and legacy office documents; ensure the current deck/content are included in the repository or submission package.
7. Keep the hardware boundary explicit: results are simulations and software checks, not measured field performance.

## Reproduction Environment

- macOS 26.7, Intel x86_64
- Python 3.9.6 project environment; Streamlit AppTest
- MATLAB R2025a Update 1
- GHDL 5.1.1, VHDL-2008
- SystemC 2.3.4 under `~/systemc`, clang++ / C++17

The project sources and checked-in result artifacts were not modified during this audit; only this QA report is being added.
