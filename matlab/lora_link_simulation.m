%% SMART FARM - LoRa LINK SIMULATION (software only, packet level)
% Detailed software model of the LoRa uplink used by the Smart Farm sensor
% node. It replaces the statistical "4 % random loss" abstraction with an
% explicit link budget:
%
%   payload/SF/BW/CR  ->  time on air            (packet transmission model)
%   distance          ->  path loss + shadowing  (channel model)
%   received power    ->  SNR  ->  link margin   (receiver model)
%   link margin       ->  packet error rate      (packet loss model)
%   reception trace   ->  PDR / PLR / outages    (PACKET_STATISTICS)
%   reception trace   ->  irrigation controller  (IRRIGATION_CONTROL)
%
% NO LoRa radio, gateway or antenna is connected. Every parameter is a
% documented, configurable assumption (see lora_default_config.m) and every
% result is simulated, never measured.
%
% Outputs
%   results/Fig9_transmission_model.png
%   results/Fig10_link_budget_vs_distance.png
%   results/Fig11_link_failure_scenarios.png
%   results/Fig12_controller_under_link_failure.png
%   results/lora_config.csv, lora_scenarios.csv, lora_distance_sweep.csv,
%   lora_link_trace.csv, lora_controller_comparison.csv
%
% Run:  matlab -batch "run('matlab/lora_link_simulation.m')"
% Tested with MATLAB R2025a Update 1. No toolboxes required.

clear; clc; close all;

%% 0. Paths and configuration ------------------------------------------------
scriptDir = fileparts(mfilename('fullpath'));
if isempty(scriptDir)
    scriptDir = pwd;
end
projectRoot = fileparts(scriptDir);
addpath(fullfile(scriptDir, 'functions'));

resultsDir = fullfile(projectRoot, 'results');
if ~isfolder(resultsDir)
    mkdir(resultsDir);
end

cfg = lora_default_config();

fprintf('=============================================================\n');
fprintf(' SMART FARM - LoRa LINK SIMULATION (software only)\n');
fprintf(' No radio hardware is connected; all results are simulated.\n');
fprintf('=============================================================\n');
fprintf('MATLAB release      : %s\n', matlabRelease.Release);
fprintf('Region / frequency  : %s / %.1f MHz\n', cfg.region, cfg.frequency_MHz);
fprintf('Bandwidth / SF / CR : %g kHz / SF%d / 4/%d\n', ...
    cfg.bandwidth_kHz, cfg.spreadingFactor, cfg.codingRate + 4);
fprintf('Payload             : %d bytes (CRC %d, explicit header %d, preamble %d)\n', ...
    cfg.payloadBytes, cfg.payloadCrc, cfg.explicitHeader, cfg.preambleSymbols);
fprintf('TX power / gains    : %g dBm / %g dBi / %g dBi\n', ...
    cfg.txPower_dBm, cfg.txAntennaGain_dBi, cfg.rxAntennaGain_dBi);
fprintf('Channel             : n = %g, shadowing sigma = %g dB\n', ...
    cfg.pathLossExponent, cfg.shadowingSigma_dB);
fprintf('Reporting interval  : %g s (assumption)\n', cfg.updateInterval_s);
fprintf('Random seed         : %d\n\n', cfg.randomSeed);

%% 0b. Recorded reception trace (project dataset, for comparison) -----------
dataFile = fullfile(projectRoot, 'data', 'sensor_data.csv');
[data, dataInfo] = load_sensor_data(string(dataFile));
recordedStats = packet_statistics(data.received, data.sample);
fprintf('Reference dataset   : %s (%d rows, unparsable packets %d)\n\n', ...
    'data/sensor_data.csv', dataInfo.rowsUsed, dataInfo.unparsableReceived);

%% 1. Packet transmission model: time on air ---------------------------------
fprintf('--- 1. PACKET TRANSMISSION MODEL (time on air) ---\n');
fprintf('SF   Tsym [ms]   payload symbols   airtime [ms]   pkts/h @1%%   duty @%gs\n', ...
    cfg.updateInterval_s);
for sf = 7:12
    probe = cfg;
    probe.spreadingFactor = sf;
    t = lora_time_on_air(probe);
    fprintf('%2d   %9.4f   %15d   %12.3f   %10.1f   %8.3f %%\n', sf, ...
        1000 * t.symbolTime_s, t.payloadSymbols, t.timeOnAir_ms, ...
        t.maxPacketsPerHour, 100 * t.timeOnAir_s / cfg.updateInterval_s);
end

toa = lora_time_on_air(cfg);
fprintf('\nConfigured packet (SF%d): %.3f ms on air, %d payload symbols\n', ...
    cfg.spreadingFactor, toa.timeOnAir_ms, toa.payloadSymbols);
fprintf('Duty cycle used with a %g s interval: %.4f %% (limit %.2f %% -> %s)\n', ...
    cfg.updateInterval_s, 100 * toa.timeOnAir_s / cfg.updateInterval_s, ...
    100 * cfg.dutyCycleLimit, ...
    local_ternary(toa.timeOnAir_s / cfg.updateInterval_s <= cfg.dutyCycleLimit, ...
    "within limit", "EXCEEDS LIMIT"));
minimumInterval = toa.timeOnAir_s / cfg.dutyCycleLimit;
fprintf('Shortest legal interval for this packet: %.1f s\n\n', minimumInterval);

%% 2. Nominal scenario at the configured distance ----------------------------
fprintf('--- 2. NOMINAL LINK AT %.0f m ---\n', cfg.distance_m);
simNominal = lora_simulate_link(cfg, Scenario = "nominal");
linkNoShadow = lora_link_budget(cfg, cfg.distance_m, 0);   % deterministic budget

fprintf('Path loss           : %.2f dB (no shadowing)\n', linkNoShadow.pathLoss_dB);
fprintf('Received power      : %.2f dBm\n', linkNoShadow.rxPower_dBm);
fprintf('Noise floor         : %.2f dBm (BW %g kHz, NF %g dB)\n', ...
    linkNoShadow.noiseFloor_dBm, cfg.bandwidth_kHz, cfg.receiverNoiseFigure_dB);
fprintf('SNR / limit         : %.2f dB / %.1f dB\n', ...
    linkNoShadow.snr_dB, linkNoShadow.snrLimit_dB);
fprintf('Link margin         : %.2f dB (mean over packets %.2f dB)\n', ...
    linkNoShadow.linkMargin_dB, mean(simNominal.link.linkMargin_dB));
fprintf('Sensitivity         : %.2f dBm\n', linkNoShadow.sensitivity_dBm);
fprintf('Mean PER            : %.6f\n', mean(simNominal.perEffective));
fprintf('Simulated packets   : %d | delivered %d | lost %d\n', ...
    simNominal.packets, simNominal.stats.receivedCount, simNominal.stats.lostCount);
fprintf('PDR / PLR           : %.6f %% / %.6f %%\n', ...
    simNominal.stats.pdrPercent, simNominal.stats.plrPercent);
fprintf(['Interpretation      : at %.0f m the modelled link has a comfortable margin, so the\n' ...
    '                      simulated PDR is %.1f %%. The recorded dataset shows only %.2f %%,\n' ...
    '                      which is therefore NOT explained by distance alone.\n\n'], ...
    cfg.distance_m, simNominal.stats.pdrPercent, recordedStats.plrPercent);

%% 3. Distance sweep: where does the link start to fail? --------------------
fprintf('--- 3. DISTANCE SWEEP (packet loss model) ---\n');
sweepDistances = logspace(log10(100), log10(12000), 25)';
sweepPackets = 400;

sweepRows = zeros(numel(sweepDistances), 7);
for k = 1:numel(sweepDistances)
    simK = lora_simulate_link(cfg, Scenario = "nominal", ...
        Distance_m = sweepDistances(k), Packets = sweepPackets, ...
        Seed = cfg.randomSeed + k);
    sweepRows(k, :) = [sweepDistances(k), mean(simK.link.pathLoss_dB), ...
        mean(simK.link.rxPower_dBm), mean(simK.link.snr_dB), ...
        mean(simK.link.linkMargin_dB), ...
        mean(simK.perEffective), simK.stats.pdrPercent];
end

sweep = array2table(sweepRows, 'VariableNames', ...
    {'distance_m', 'pathLoss_dB', 'rxPower_dBm', 'snr_dB', 'linkMargin_dB', ...
     'meanPER', 'simulatedPDR_percent'});

fprintf(' distance   pathloss    Prx      SNR    margin    meanPER    PDR\n');
reportIndex = [1 8 13 16 19 21 23 25];
for k = reportIndex
    fprintf('%7.0f m  %7.2f  %7.2f  %6.2f  %7.2f  %9.5f  %6.2f %%\n', ...
        sweep.distance_m(k), sweep.pathLoss_dB(k), sweep.rxPower_dBm(k), ...
        sweep.snr_dB(k), sweep.linkMargin_dB(k), sweep.meanPER(k), ...
        sweep.simulatedPDR_percent(k));
end

% Range at which the simulated PDR first drops below the 90 % target
belowTarget = find(sweep.simulatedPDR_percent < 90, 1, 'first');
if isempty(belowTarget)
    rangeAt90 = NaN;
    fprintf('\nPDR stays above 90 %% up to %.0f m (end of the swept range).\n\n', ...
        max(sweep.distance_m));
else
    rangeAt90 = sweep.distance_m(belowTarget);
    fprintf('\nSimulated range for PDR >= 90 %%: about %.0f m\n\n', rangeAt90);
end

%% 4. Communication failure scenarios ---------------------------------------
fprintf('--- 4. COMMUNICATION FAILURE SCENARIOS ---\n');

% 4a. Burst outage (gateway failure / node obstructed) over samples 90-110
sampleAxis = (0:cfg.packets - 1)';
outageSamples = [90 110];
outageIdx = find(sampleAxis >= outageSamples(1) & sampleAxis <= outageSamples(2));
simOutage = lora_simulate_link(cfg, Scenario = "outage", ...
    OutageWindow = [outageIdx(1) outageIdx(end)]);

% 4b. Interference burst on a link already near its range limit (5 km)
cfgEdge = cfg;
cfgEdge.distance_m = 5000;
interferenceSamples = [95 108];
interferenceIdx = find(sampleAxis >= interferenceSamples(1) & sampleAxis <= interferenceSamples(2));
simInterference = lora_simulate_link(cfgEdge, Scenario = "interference", ...
    InterferenceWindow = [interferenceIdx(1) interferenceIdx(end)], ...
    Interference_dB = 3);

% 4c. The recorded reception trace of the project dataset is used as the
%     reference (it was loaded in section 0b).

scenarioNames = ["recorded dataset"; "nominal 450 m"; "burst outage 90-110"; ...
    "interference @5 km"; "SF9 @5 km"; "SF12 @5 km"];
scenarioSims = {[], simNominal, simOutage, simInterference, [], []};

cfgSF9 = cfgEdge; cfgSF9.spreadingFactor = 9;
cfgSF12 = cfgEdge; cfgSF12.spreadingFactor = 12;
simSF9 = lora_simulate_link(cfgSF9, Scenario = "nominal");
simSF12 = lora_simulate_link(cfgSF12, Scenario = "nominal");
simSF7Edge = lora_simulate_link(cfgEdge, Scenario = "nominal");
scenarioSims{5} = simSF9;
scenarioSims{6} = simSF12;

fprintf('%-22s %8s %8s %8s %10s %10s %9s\n', 'scenario', 'pkts', 'rx', 'lost', ...
    'PDR [%]', 'PLR [%]', 'outage');
for k = 1:numel(scenarioNames)
    if k == 1
        fprintf('%-22s %8d %8d %8d %10.4f %10.4f %9d\n', scenarioNames(k), ...
            recordedStats.total, recordedStats.receivedCount, recordedStats.lostCount, ...
            recordedStats.pdrPercent, recordedStats.plrPercent, recordedStats.longestOutage);
    else
        s = scenarioSims{k};
        fprintf('%-22s %8d %8d %8d %10.4f %10.4f %9d\n', scenarioNames(k), ...
            s.stats.total, s.stats.receivedCount, s.stats.lostCount, ...
            s.stats.pdrPercent, s.stats.plrPercent, s.stats.longestOutage);
    end
end
fprintf('  outage window detail       : %d packets, %d lost inside, PDR inside window %.1f %%\n', ...
    numel(simOutage.outageWindow(1):simOutage.outageWindow(2)), ...
    sum(~simOutage.received(simOutage.outageWindow(1):simOutage.outageWindow(2))), ...
    100 * mean(simOutage.received(simOutage.outageWindow(1):simOutage.outageWindow(2))));
fprintf('  interference window detail : %d packets, %d lost inside, PDR inside window %.1f %% (baseline at 5 km %.1f %%)\n', ...
    numel(simInterference.interferenceWindow(1):simInterference.interferenceWindow(2)), ...
    sum(~simInterference.received(simInterference.interferenceWindow(1):simInterference.interferenceWindow(2))), ...
    100 * mean(simInterference.received(simInterference.interferenceWindow(1):simInterference.interferenceWindow(2))), ...
    simSF7Edge.stats.pdrPercent);
fprintf('\nSF trade-off at 5 km: SF7 PDR %.2f %% (%.1f ms), SF9 PDR %.2f %% (%.1f ms), SF12 PDR %.2f %% (%.1f ms)\n\n', ...
    simSF7Edge.stats.pdrPercent, simSF7Edge.toa.timeOnAir_ms, ...
    simSF9.stats.pdrPercent, simSF9.toa.timeOnAir_ms, ...
    simSF12.stats.pdrPercent, simSF12.toa.timeOnAir_ms);


%% 5. Connection to the irrigation controller's safe operating logic --------
fprintf('--- 5. IMPACT ON THE IRRIGATION CONTROLLER ---\n');

% The controller keeps its last state while telemetry is missing ("hold") or
% fails safe after MaxHoldSamples consecutive losses ("failSafe").
maxHold = 3;
controllerRows = {};
controllerNames = ["recorded dataset", "nominal 450 m", "burst outage 90-110", ...
    "interference @5 km"];

receptionTraces = {data.received, simNominal.received, simOutage.received, ...
    simInterference.received};

blindHold = zeros(numel(controllerNames), 1);
blindSafe = zeros(numel(controllerNames), 1);
onHold = zeros(numel(controllerNames), 1);
onSafe = zeros(numel(controllerNames), 1);
tripsSafe = zeros(numel(controllerNames), 1);
difference = zeros(numel(controllerNames), 1);

for k = 1:numel(controllerNames)
    rx = logical(receptionTraces{k});
    hold = irrigation_control(data.soil, rx, DryThreshold = 30, WetThreshold = 40, ...
        Mode = "hold");
    safe = irrigation_control(data.soil, rx, DryThreshold = 30, WetThreshold = 40, ...
        Mode = "failSafe", MaxHoldSamples = maxHold);
    blindHold(k) = maxConsecutiveLosses(rx);
    blindSafe(k) = blindHold(k);
    onHold(k) = hold.onCount;
    onSafe(k) = safe.onCount;
    tripsSafe(k) = safe.watchdogTrips;
    difference(k) = sum(hold.pump ~= safe.pump);
end

fprintf('%-22s %10s %10s %9s %9s %10s\n', 'scenario', 'ON hold', 'ON safe', ...
    'trips', 'diff', 'max blind');
for k = 1:numel(controllerNames)
    fprintf('%-22s %10d %10d %9d %9d %10d\n', controllerNames(k), onHold(k), ...
        onSafe(k), tripsSafe(k), difference(k), blindHold(k));
end
fprintf(['\nWatchdog limit: %d consecutive lost packets. The fail-safe strategy can only\n' ...
    'differ from "hold" when the blind time reaches that limit.\n\n'], maxHold);

controllerComparison = table(controllerNames', onHold, onSafe, tripsSafe, ...
    difference, blindHold, ...
    'VariableNames', {'scenario', 'pumpOnHold', 'pumpOnFailSafe', ...
    'watchdogTrips', 'samplesDifferent', 'maxConsecutiveLosses'});


%% 6. Self-verification ------------------------------------------------------
fprintf('--- 6. VERIFICATION ---\n');

cfgSF7 = cfg;
toaSF7 = lora_time_on_air(cfgSF7);
toaSF12 = lora_time_on_air(cfgSF12);

% Determinism: the same seed must reproduce the same trace
simRepeat = lora_simulate_link(cfg, Scenario = "nominal");
deterministic = isequal(simRepeat.received, simNominal.received);

% Monotonic degradation: PDR must not increase with distance
pdrFar = sweep.simulatedPDR_percent(end);
pdrNear = sweep.simulatedPDR_percent(1);

% Controller invariants
holdNominal = irrigation_control(data.soil, simNominal.received, Mode = "hold");
stateChangesOnLoss = 0;
lostIdx = find(~simNominal.received);
for k = 1:numel(lostIdx)
    idx = lostIdx(k);
    if idx > 1 && holdNominal.pump(idx) ~= holdNominal.pump(idx - 1)
        stateChangesOnLoss = stateChangesOnLoss + 1;
    end
end

% The watchdog must not trip when the blind time is below the limit
blindRecorded = maxConsecutiveLosses(data.received);
safeRecorded = irrigation_control(data.soil, data.received, Mode = "failSafe", ...
    MaxHoldSamples = maxHold);

items = {
    "Time on air SF7, 16 B, BW125 (ms)",     toaSF7.timeOnAir_ms,       46.336,  1e-3
    "Time on air SF12, 16 B, BW125 (ms)",    toaSF12.timeOnAir_ms,      1155.072, 1e-3
    "SF7 sensitivity, BW125 (dBm)",          lora_link_budget(cfg, 450).sensitivity_dBm, -123.031, 1e-2
    "Noise floor, BW125, NF6 (dBm)",         lora_link_budget(cfg, 450).noiseFloor_dBm,  -117.031, 1e-2
    "Nominal link margin, no shadowing (dB)", linkNoShadow.linkMargin_dB,      31.529, 1e-2
    "Recorded packets",                      recordedStats.total,       120,     0
    "Recorded delivered",                    recordedStats.receivedCount, 116,   0
    "Recorded PDR + PLR (%)",                recordedStats.pdrSumCheck, 100,     1e-9
    "Simulated PDR + PLR, nominal (%)",      simNominal.stats.pdrSumCheck, 100,  1e-9
    "Simulation is deterministic",           double(deterministic),     1,       0
    "PDR does not increase with distance",   double(pdrFar <= pdrNear), 1,       0
    "Pump changes on lost packets (nominal)", stateChangesOnLoss,      0,       0
    "Recorded blind time (packets)",         blindRecorded,             1,       0
    "Recorded watchdog trips",               safeRecorded.watchdogTrips, 0,      0
    "Outage scenario loses every packet in window", ...
        double(all(~simOutage.received(simOutage.outageWindow(1):simOutage.outageWindow(2)))), 1, 0
    };

checkTable = build_check_table(items);
disp(checkTable);

failCount = sum(checkTable.Result == "FAIL");
if failCount > 0
    warning('lora:verificationFailed', '%d of %d verification checks FAILED.', ...
        failCount, height(checkTable));
else
    fprintf('All %d verification checks passed.\n\n', height(checkTable));
end


%% 7. Figures ---------------------------------------------------------------
fprintf('--- 7. FIGURES ---\n');

plot_transmission_model(cfg, fullfile(resultsDir, 'Fig9_transmission_model.png'));
plot_link_budget(sweep, cfg, rangeAt90, ...
    fullfile(resultsDir, 'Fig10_link_budget_vs_distance.png'));
plot_failure_scenarios(simOutage, simInterference, ...
    fullfile(resultsDir, 'Fig11_link_failure_scenarios.png'));
plot_controller_impact(data, simOutage, maxHold, ...
    fullfile(resultsDir, 'Fig12_controller_under_link_failure.png'));

%% 8. Export ---------------------------------------------------------------
fprintf('--- 8. EXPORTED RESULTS ---\n');

configTable = build_config_table(cfg);
writetable(configTable, fullfile(resultsDir, 'lora_config.csv'));
fprintf('  saved config     : results/lora_config.csv\n');

scenarioTable = table(scenarioNames(:), ...
    [recordedStats.total; simNominal.stats.total; simOutage.stats.total; ...
     simInterference.stats.total; simSF9.stats.total; simSF12.stats.total], ...
    [recordedStats.receivedCount; simNominal.stats.receivedCount; ...
     simOutage.stats.receivedCount; simInterference.stats.receivedCount; ...
     simSF9.stats.receivedCount; simSF12.stats.receivedCount], ...
    [recordedStats.lostCount; simNominal.stats.lostCount; simOutage.stats.lostCount; ...
     simInterference.stats.lostCount; simSF9.stats.lostCount; simSF12.stats.lostCount], ...
    [recordedStats.pdrPercent; simNominal.stats.pdrPercent; simOutage.stats.pdrPercent; ...
     simInterference.stats.pdrPercent; simSF9.stats.pdrPercent; simSF12.stats.pdrPercent], ...
    [recordedStats.plrPercent; simNominal.stats.plrPercent; simOutage.stats.plrPercent; ...
     simInterference.stats.plrPercent; simSF9.stats.plrPercent; simSF12.stats.plrPercent], ...
    [recordedStats.lossEvents; simNominal.stats.lossEvents; simOutage.stats.lossEvents; ...
     simInterference.stats.lossEvents; simSF9.stats.lossEvents; simSF12.stats.lossEvents], ...
    [recordedStats.longestOutage; simNominal.stats.longestOutage; ...
     simOutage.stats.longestOutage; simInterference.stats.longestOutage; ...
     simSF9.stats.longestOutage; simSF12.stats.longestOutage], ...
    'VariableNames', {'scenario', 'packets', 'delivered', 'lost', 'pdrPercent', ...
    'plrPercent', 'lossEvents', 'longestOutage'});
writetable(scenarioTable, fullfile(resultsDir, 'lora_scenarios.csv'));
fprintf('  saved scenarios  : results/lora_scenarios.csv\n');

writetable(sweep, fullfile(resultsDir, 'lora_distance_sweep.csv'));
fprintf('  saved sweep      : results/lora_distance_sweep.csv\n');

traceTable = table(simNominal.sample, simNominal.distance_m, ...
    simNominal.link.pathLoss_dB, simNominal.link.rxPower_dBm, simNominal.link.snr_dB, ...
    simNominal.link.linkMargin_dB, simNominal.perEffective, double(simNominal.received), ...
    'VariableNames', {'sample', 'distance_m', 'pathLoss_dB', 'rxPower_dBm', 'snr_dB', ...
    'linkMargin_dB', 'packetErrorProbability', 'received'});
writetable(traceTable, fullfile(resultsDir, 'lora_link_trace.csv'));
fprintf('  saved trace      : results/lora_link_trace.csv\n');

writetable(controllerComparison, fullfile(resultsDir, 'lora_controller_comparison.csv'));
fprintf('  saved controller : results/lora_controller_comparison.csv\n');

%% 9. Summary --------------------------------------------------------------
fprintf('\n--- 9. SUMMARY ---\n');
fprintf('Recorded trace (project dataset) : PDR %.4f %% | PLR %.4f %% | largest blind time %d\n', ...
    recordedStats.pdrPercent, recordedStats.plrPercent, recordedStats.longestOutage);
fprintf('Model, %.0f m, SF%d (no shadowing) : PDR %.4f %% | margin %.2f dB\n', ...
    cfg.distance_m, cfg.spreadingFactor, simNominal.stats.pdrPercent, ...
    linkNoShadow.linkMargin_dB);
fprintf('Model, 5 km, SF%d (mean)           : PDR %.4f %% | mean margin %.2f dB\n', ...
    cfgEdge.spreadingFactor, simSF7Edge.stats.pdrPercent, ...
    mean(simSF7Edge.link.linkMargin_dB));
fprintf('Transmission model                : %.3f ms per packet, %.1f packets/h at 1 %% duty cycle\n', ...
    toa.timeOnAir_ms, toa.maxPacketsPerHour);
fprintf('\nLoRa LINK SIMULATION COMPLETED.\n');
fprintf('Software simulation only - no LoRa radio hardware was used.\n');

if batchStartupOptionUsed
    close all force;
end



%% ------------------------------------------------------------------------
%% Local functions
%% ------------------------------------------------------------------------
function out = local_ternary(condition, whenTrue, whenFalse)
%LOCAL_TERNARY Small helper to keep fprintf lines readable.
if condition
    out = whenTrue;
else
    out = whenFalse;
end
end

function longest = maxConsecutiveLosses(received)
%MAXCONSECUTIVELOSSES Longest run of consecutive lost packets (blind time).
received = logical(received(:));
longest = 0;
current = 0;
for k = 1:numel(received)
    if ~received(k)
        current = current + 1;
        longest = max(longest, current);
    else
        current = 0;
    end
end
end

function checkTable = build_check_table(items)
%BUILD_CHECK_TABLE Compare computed values against expected values.
name = strings(size(items, 1), 1);
actual = zeros(size(items, 1), 1);
expected = zeros(size(items, 1), 1);
delta = zeros(size(items, 1), 1);
result = strings(size(items, 1), 1);
for k = 1:size(items, 1)
    name(k) = string(items{k, 1});
    actual(k) = double(items{k, 2});
    expected(k) = double(items{k, 3});
    tolerance = double(items{k, 4});
    delta(k) = actual(k) - expected(k);
    if abs(delta(k)) <= tolerance
        result(k) = "PASS";
    else
        result(k) = "FAIL";
    end
end
checkTable = table(name, actual, expected, delta, result, ...
    'VariableNames', {'check', 'actual', 'expected', 'delta', 'Result'});
end

function configTable = build_config_table(cfg)
%BUILD_CONFIG_TABLE Export every assumption so results stay traceable.
names = [ ...
    "region"; "frequency"; "bandwidth"; "spreadingFactor"; "codingRate"; ...
    "preambleSymbols"; "explicitHeader"; "payloadCrc"; "payloadBytes"; ...
    "lowDataRateOptimize"; "txPower"; "txAntennaGain"; "rxAntennaGain"; ...
    "cableLoss"; "receiverNoiseFigure"; "implementationLoss"; "snrLimitSF";
    "pathLossExponent"; "referenceDistance"; "shadowingSigma"; "perSteepness"; ...
    "dutyCycleLimit"; "updateInterval"; "distance"; "packets"; "randomSeed"];

units = [ ...
    "-"; "MHz"; "kHz"; "-"; "4/(CR+4)"; "symbols"; "-"; "-"; "bytes"; ...
    "-"; "dBm"; "dBi"; "dBi"; "dB"; "dB"; "dB"; "dB"; "-"; "m"; "dB"; ...
    "1/dB"; "-"; "s"; "m"; "packets"; "-"];

values = [ ...
    string(cfg.region); string(cfg.frequency_MHz); string(cfg.bandwidth_kHz); ...
    string(cfg.spreadingFactor); string(cfg.codingRate); string(cfg.preambleSymbols); ...
    string(cfg.explicitHeader); string(cfg.payloadCrc); string(cfg.payloadBytes); ...
    string(cfg.lowDataRateOptimize); string(cfg.txPower_dBm); ...
    string(cfg.txAntennaGain_dBi); string(cfg.rxAntennaGain_dBi); ...
    string(cfg.cableLoss_dB); string(cfg.receiverNoiseFigure_dB); ...
    string(cfg.implementationLoss_dB); ...
    strjoin(string(cfg.snrLimit_dB), " "); ...
    string(cfg.pathLossExponent); string(cfg.referenceDistance_m); ...
    string(cfg.shadowingSigma_dB); string(cfg.perSteepness_dB); ...
    string(cfg.dutyCycleLimit); string(cfg.updateInterval_s); ...
    string(cfg.distance_m); string(cfg.packets); string(cfg.randomSeed)];

configTable = table(names, values, units, ...
    'VariableNames', {'assumption', 'value', 'unit'});
end


%% ------------------------------------------------------------------------
function plot_transmission_model(cfg, outputFile)
%PLOT_TRANSMISSION_MODEL Airtime vs payload and the duty-cycle budget.
sfList = [7 9 11 12];
colours = [0.00 0.45 0.74; 0.85 0.33 0.10; 0.49 0.18 0.56; 0.20 0.60 0.30];
payloads = (1:100)';

fig = figure('Name', 'Packet transmission model', 'Color', 'w');
fig.Position = [80 80 1150 460];
layout = tiledlayout(fig, 1, 2, 'TileSpacing', 'compact', 'Padding', 'compact');

ax1 = nexttile(layout);
hold(ax1, 'on'); grid(ax1, 'on'); box(ax1, 'on');
handles = gobjects(numel(sfList), 1);
for k = 1:numel(sfList)
    probe = cfg;
    probe.spreadingFactor = sfList(k);
    probe.payloadBytes = 1;
    probe.perSteepness_dB = cfg.perSteepness_dB;
    airtime = zeros(numel(payloads), 1);
    for p = 1:numel(payloads)
        probe.payloadBytes = payloads(p);
        t = lora_time_on_air(probe);
        airtime(p) = t.timeOnAir_ms;
    end
    handles(k) = plot(ax1, payloads, airtime, '-', 'Color', colours(k, :), 'LineWidth', 1.8);
end
xlabel(ax1, 'Payload (bytes)', 'FontWeight', 'bold');
ylabel(ax1, 'Time on air (ms)', 'FontWeight', 'bold');
title(ax1, sprintf('Packet airtime, BW %g kHz, CR 4/%d', cfg.bandwidth_kHz, cfg.codingRate + 4), ...
    'FontWeight', 'bold');
legend(ax1, handles, compose("SF%d", sfList), 'Location', 'northwest');

ax2 = nexttile(layout);
hold(ax2, 'on'); grid(ax2, 'on'); box(ax2, 'on');
airtimes = zeros(6, 1);
packetsPerHour = zeros(6, 1);
dutyUsed = zeros(6, 1);
for sf = 7:12
    probe = cfg;
    probe.spreadingFactor = sf;
    t = lora_time_on_air(probe);
    airtimes(sf - 6) = t.timeOnAir_ms;
    packetsPerHour(sf - 6) = t.maxPacketsPerHour;
    dutyUsed(sf - 6) = 100 * t.timeOnAir_s / cfg.updateInterval_s;
end
bars = bar(ax2, 7:12, airtimes, 0.6, 'FaceColor', [0.30 0.55 0.85], 'EdgeColor', 'none');
for k = 1:6
    text(ax2, 6 + k, airtimes(k) + 25, sprintf('%.1f ms\n%.2f %% duty', airtimes(k), dutyUsed(k)), ...
        'HorizontalAlignment', 'center', 'FontSize', 8);
end
maxAirtime = 1000 * cfg.dutyCycleLimit * cfg.updateInterval_s;
yline(ax2, maxAirtime, '--', sprintf('limit for %.0f s interval at %.2f %% duty', ...
    cfg.updateInterval_s, 100 * cfg.dutyCycleLimit), 'Color', [0.85 0.20 0.15], ...
    'LineWidth', 1.4, 'LabelHorizontalAlignment', 'left');
xticks(ax2, 7:12);
xticklabels(ax2, compose("SF%d", 7:12));
xlabel(ax2, 'Spreading factor', 'FontWeight', 'bold');
ylabel(ax2, 'Time on air (ms)', 'FontWeight', 'bold');
title(ax2, 'Airtime and duty cycle per spreading factor', 'FontWeight', 'bold');
ylim(ax2, [0, max(airtimes) * 1.25]);
bars.HandleVisibility = 'off';

ax1.Toolbar.Visible = 'off';
ax2.Toolbar.Visible = 'off';
title(layout, 'LoRa packet transmission model (software simulation)', 'FontWeight', 'bold');
exportgraphics(fig, outputFile, 'Resolution', 150, 'BackgroundColor', 'white');
fprintf('  saved figure: %s\n', outputFile);
end

%% ------------------------------------------------------------------------
function plot_link_budget(sweep, cfg, rangeAt90, outputFile)
%PLOT_LINK_BUDGET Received power and simulated PDR versus distance.
fig = figure('Name', 'Link budget vs distance', 'Color', 'w');
fig.Position = [80 80 1150 460];
layout = tiledlayout(fig, 1, 2, 'TileSpacing', 'compact', 'Padding', 'compact');

ax1 = nexttile(layout);
hold(ax1, 'on'); grid(ax1, 'on'); box(ax1, 'on');
semilogx(ax1, sweep.distance_m, sweep.rxPower_dBm, '-o', 'Color', [0 0.45 0.74], ...
    'LineWidth', 1.8, 'MarkerSize', 4, 'MarkerFaceColor', 'w');
probe = cfg;
sensitivity = lora_link_budget(probe, sweep.distance_m).sensitivity_dBm;
noiseFloor = lora_link_budget(probe, sweep.distance_m).noiseFloor_dBm;
yline(ax1, sensitivity(1), '--', sprintf('Sensitivity %0.1f dBm (SF%d)', ...
    sensitivity(1), cfg.spreadingFactor), 'Color', [0.85 0.20 0.15], 'LineWidth', 1.4, ...
    'LabelHorizontalAlignment', 'left');
yline(ax1, noiseFloor(1), ':', sprintf('Noise floor %.1f dBm', noiseFloor(1)), ...
    'Color', [0.4 0.4 0.4], 'LineWidth', 1.2, 'LabelHorizontalAlignment', 'right');
xlabel(ax1, 'Distance (m)', 'FontWeight', 'bold');
ylabel(ax1, 'Received power (dBm)', 'FontWeight', 'bold');
title(ax1, 'Link budget (log-distance + shadowing)', 'FontWeight', 'bold');
legend(ax1, {'Received power'}, 'Location', 'southwest');
set(ax1, 'XScale', 'log');

ax2 = nexttile(layout);
hold(ax2, 'on'); grid(ax2, 'on'); box(ax2, 'on');
semilogx(ax2, sweep.distance_m, sweep.simulatedPDR_percent, '-o', ...
    'Color', [0.20 0.60 0.30], 'LineWidth', 1.9, 'MarkerSize', 5, ...
    'MarkerFaceColor', 'w');
yline(ax2, 90, '--', 'PDR target 90 %', 'Color', [0.85 0.33 0.10], 'LineWidth', 1.3, ...
    'LabelHorizontalAlignment', 'left');
xline(ax2, cfg.distance_m, ':', sprintf('configured %.0f m', cfg.distance_m), ...
    'Color', [0.2 0.2 0.8], 'LineWidth', 1.2, 'LabelHorizontalAlignment', 'center');
if ~isnan(rangeAt90)
    xline(ax2, rangeAt90, '-.', sprintf('PDR 90 %% at %.0f m', rangeAt90), ...
        'Color', [0.6 0.1 0.1], 'LineWidth', 1.2, 'LabelHorizontalAlignment', 'right');
end
xlabel(ax2, 'Distance (m)', 'FontWeight', 'bold');
ylabel(ax2, 'Simulated PDR (%)', 'FontWeight', 'bold');
title(ax2, 'Packet delivery ratio versus distance', 'FontWeight', 'bold');
ylim(ax2, [-2 102]);
set(ax2, 'XScale', 'log');

ax1.Toolbar.Visible = 'off';
ax2.Toolbar.Visible = 'off';
title(layout, sprintf(['Channel model: n = %g, shadowing sigma = %g dB, PER steepness = %g/dB ' ...
    '(assumptions)'], cfg.pathLossExponent, cfg.shadowingSigma_dB, cfg.perSteepness_dB), ...
    'FontWeight', 'bold');
exportgraphics(fig, outputFile, 'Resolution', 150, 'BackgroundColor', 'white');
fprintf('  saved figure: %s\n', outputFile);
end


%% ------------------------------------------------------------------------
function plot_failure_scenarios(simOutage, simInterference, outputFile)
%PLOT_FAILURE_SCENARIOS Reception strips for the two failure scenarios.
fig = figure('Name', 'Link failure scenarios', 'Color', 'w');
fig.Position = [80 80 1150 620];
layout = tiledlayout(fig, 2, 1, 'TileSpacing', 'compact', 'Padding', 'loose');

draw_reception_strip(nexttile(layout), simOutage, ...
    sprintf('Burst outage: packets %d-%d forced lost (PDR %.2f %%)', ...
    simOutage.sample(simOutage.outageWindow(1)), ...
    simOutage.sample(simOutage.outageWindow(2)), simOutage.stats.pdrPercent));

draw_reception_strip(nexttile(layout), simInterference, ...
    sprintf('Interference burst at %.0f m: +%.0f dB noise for packets %d-%d (PDR %.2f %%)', ...
    simInterference.distance_m(1), simInterference.interference_dB, ...
    simInterference.sample(simInterference.interferenceWindow(1)), ...
    simInterference.sample(simInterference.interferenceWindow(2)), ...
    simInterference.stats.pdrPercent));

for ax = findall(fig, 'Type', 'axes')'
    ax.Toolbar.Visible = 'off';
end
title(layout, 'Simulated LoRa reception failures (one bar per packet)', 'FontWeight', 'bold');
exportgraphics(fig, outputFile, 'Resolution', 150, 'BackgroundColor', 'white');
fprintf('  saved figure: %s\n', outputFile);
end

function draw_reception_strip(ax, sim, titleText)
%DRAW_RECEPTION_STRIP Green/red packet strip with the failure window shaded.
hold(ax, 'on'); grid(ax, 'on'); box(ax, 'on');
received = double(sim.received);
bars = bar(ax, sim.sample, received, 1.0, 'FaceColor', 'flat', 'EdgeColor', 'none');
colours = repmat([0.15 0.68 0.38], numel(received), 1);
colours(~sim.received, :) = repmat([0.86 0.20 0.18], sum(~sim.received), 1);
bars.CData = colours;

window = [];
if ~isempty(sim.outageWindow)
    window = [sim.sample(sim.outageWindow(1)), sim.sample(sim.outageWindow(2))];
elseif ~isempty(sim.interferenceWindow)
    window = [sim.sample(sim.interferenceWindow(1)), sim.sample(sim.interferenceWindow(2))];
end
if ~isempty(window)
    x0 = window(1) - 0.5;
    x1 = window(2) + 0.5;
    patch(ax, [x0 x1 x1 x0], [-0.1 -0.1 1.2 1.2], [0.85 0.20 0.18], ...
        'FaceAlpha', 0.08, 'EdgeColor', [0.85 0.20 0.18], 'LineStyle', '--', ...
        'HandleVisibility', 'off');
end
ylim(ax, [-0.1 1.2]);
yticks(ax, [0 1]);
yticklabels(ax, {'Lost', 'Received'});
xlim(ax, [min(sim.sample) - 1, max(sim.sample) + 1]);
xlabel(ax, 'Sample / packet index', 'FontWeight', 'bold');
ylabel(ax, 'Status', 'FontWeight', 'bold');
title(ax, titleText, 'FontWeight', 'bold');
end

%% ------------------------------------------------------------------------
function plot_controller_impact(data, simOutage, maxHold, outputFile)
%PLOT_CONTROLLER_IMPACT Pump command with the simulated link failures.
holdControl = irrigation_control(data.soil, simOutage.received, ...
    DryThreshold = 30, WetThreshold = 40, Mode = "hold");
safeControl = irrigation_control(data.soil, simOutage.received, ...
    DryThreshold = 30, WetThreshold = 40, Mode = "failSafe", MaxHoldSamples = maxHold);

fig = figure('Name', 'Controller under link failure', 'Color', 'w');
fig.Position = [80 80 1150 700];
layout = tiledlayout(fig, 2, 1, 'TileSpacing', 'compact', 'Padding', 'loose');

ax1 = nexttile(layout);
hold(ax1, 'on'); grid(ax1, 'on'); box(ax1, 'on');
plot(ax1, data.sample, data.soil, '-', 'Color', [0 0.45 0.74], 'LineWidth', 1.5);
yline(ax1, 30, '--', 'Dry 30 %', 'Color', [0.85 0.33 0.10], 'LineWidth', 1.2, ...
    'LabelHorizontalAlignment', 'left');
yline(ax1, 40, '--', 'Wet 40 %', 'Color', [0.0 0.60 0.30], 'LineWidth', 1.2, ...
    'LabelHorizontalAlignment', 'right');
shade_outage(ax1, simOutage);
xlabel(ax1, 'Sample index', 'FontWeight', 'bold');
ylabel(ax1, 'Soil moisture (%)', 'FontWeight', 'bold');
title(ax1, 'Soil moisture with the simulated outage window', 'FontWeight', 'bold');
xlim(ax1, [min(data.sample) max(data.sample)]);

ax2 = nexttile(layout);
hold(ax2, 'on'); grid(ax2, 'on'); box(ax2, 'on');
p1 = stairs(ax2, data.sample, holdControl.pump, '-', 'Color', [0 0.45 0.74], 'LineWidth', 2.0);
p2 = stairs(ax2, data.sample, safeControl.pump, '--', 'Color', [0.49 0.18 0.56], ...
    'LineWidth', 1.8);
shade_outage(ax2, simOutage);
ylim(ax2, [-0.25 1.35]);
yticks(ax2, [0 1]);
yticklabels(ax2, {'OFF', 'ON'});
xlim(ax2, [min(data.sample) max(data.sample)]);
xlabel(ax2, 'Sample index', 'FontWeight', 'bold');
ylabel(ax2, 'Simulated pump command', 'FontWeight', 'bold');
title(ax2, sprintf(['Pump command under the simulated outage: hold %d ON / fail-safe %d ON ' ...
    '(%d watchdog trips)'], holdControl.onCount, safeControl.onCount, safeControl.watchdogTrips), ...
    'FontWeight', 'bold');
legend(ax2, [p1 p2], {sprintf('Hold (normal): %d ON', holdControl.onCount), ...
    sprintf('Fail-safe (watchdog %d packets): %d ON', maxHold, safeControl.onCount)}, ...
    'Location', 'southoutside', 'Orientation', 'horizontal', 'NumColumns', 2);

ax1.Toolbar.Visible = 'off';
ax2.Toolbar.Visible = 'off';
title(layout, 'Communication status driving the irrigation safe logic (simulation)', 'FontWeight', 'bold');
exportgraphics(fig, outputFile, 'Resolution', 150, 'BackgroundColor', 'white');
fprintf('  saved figure: %s\n', outputFile);
end

function shade_outage(ax, sim)
%SHADE_OUTAGE Shade the forced-outage window on an axes.
if isempty(sim.outageWindow)
    return
end
x0 = sim.sample(sim.outageWindow(1)) - 0.5;
x1 = sim.sample(sim.outageWindow(2)) + 0.5;
yl = ylim(ax);
patch(ax, [x0 x1 x1 x0], [yl(1) yl(1) yl(2) yl(2)], [0.85 0.20 0.18], ...
    'FaceAlpha', 0.10, 'EdgeColor', [0.85 0.20 0.18], 'LineStyle', '--', ...
    'HandleVisibility', 'off');
ylim(ax, yl);
text(ax, mean([x0 x1]), yl(2) - 0.05 * (yl(2) - yl(1)), 'link outage', ...
    'HorizontalAlignment', 'center', 'VerticalAlignment', 'top', ...
    'Color', [0.70 0.15 0.12], 'FontWeight', 'bold', 'FontSize', 9);
end

