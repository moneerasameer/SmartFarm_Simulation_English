%% SMART FARM - MATLAB SIMULATION (main entry point)
% Software-only simulation of a Smart Farm monitoring and irrigation system.
%
%  1. loads the recorded dataset ................. data/sensor_data.csv
%  2. computes sensor statistics ................. mean / min / max
%  3. replays the automatic irrigation control ... hysteresis 30 % / 40 %
%  4. analyses the simulated LoRa link ........... PDR / PLR / outages
%  5. compares irrigation strategies ............. normal / safe / legacy
%  6. runs a communication-failure stress test ... synthetic burst outage
%  7. verifies every number against known values . self-checking
%  8. writes figures and summaries ............... results/
%
% IMPORTANT: this is a SIMULATION. No physical pump, valve, sensor node or
% LoRa radio is connected; every actuator command is a software variable.
%
% Run from anywhere:
%   matlab -batch "run('/path/to/matlab/smart_farm_complete.m')"
%
% Requirements: MATLAB R2020a or newer (arguments blocks, tiledlayout,
% exportgraphics). Tested with MATLAB R2025a Update 1.

clear; clc; close all;

%% 0. Paths and configuration ------------------------------------------------
scriptDir = fileparts(mfilename('fullpath'));
if isempty(scriptDir)
    scriptDir = pwd;
end
projectRoot = fileparts(scriptDir);
addpath(fullfile(scriptDir, 'functions'));

dataFile   = fullfile(projectRoot, 'data', 'sensor_data.csv');
resultsDir = fullfile(projectRoot, 'results');
if ~isfolder(resultsDir)
    mkdir(resultsDir);
end

cfg.dryThreshold   = 30;   % soil moisture (%) below which irrigation starts
cfg.wetThreshold   = 40;   % soil moisture (%) above which irrigation stops
cfg.maxHoldSamples = 3;    % watchdog limit for the fail-safe strategy
cfg.deliveryTarget = 90;   % intended minimum Packet Delivery Ratio (%)

fprintf('=============================================================\n');
fprintf(' SMART FARM - MATLAB SIMULATION (software only, no hardware)\n');
fprintf('=============================================================\n');
fprintf('MATLAB release      : %s\n', matlabRelease.Release);
fprintf('Project root        : %s\n', projectRoot);
fprintf('Dataset             : %s\n\n', dataFile);

%% 1. Load and validate the dataset -----------------------------------------
fprintf('--- 1. DATASET ---\n');
[data, info] = load_sensor_data(string(dataFile));

fprintf('Columns found       : %s\n', info.columnsFound);
fprintf('Rows read / used    : %d / %d\n', info.rowsRead, info.rowsUsed);
fprintf('Rows dropped        : %d (missing or non-numeric values)\n', info.rowsDropped);
fprintf('Duplicate samples   : %d removed\n', info.duplicatesRemoved);
fprintf('Unparsable packets  : %d (mapped to "lost")\n', info.unparsableReceived);
fprintf('Unparsable pump     : %d (mapped to "OFF")\n', info.unparsablePump);
fprintf('Sample index range  : %d ... %d\n', info.firstSample, info.lastSample);
fprintf('Types: soil/temperature/humidity = double, received/pumpRecorded = logical\n\n');

%% 2. Sensor statistics ------------------------------------------------------
fprintf('--- 2. SENSOR STATISTICS ---\n');
soilMean        = mean(data.soil);
temperatureMean = mean(data.temperature);
humidityMean    = mean(data.humidity);

fprintf('Average soil moisture   : %.4f %%\n', soilMean);
fprintf('Average air temperature : %.4f degC\n', temperatureMean);
fprintf('Average air humidity    : %.4f %%\n', humidityMean);
fprintf('Soil moisture range     : %.2f ... %.2f %%\n', min(data.soil), max(data.soil));
fprintf('Temperature range       : %.2f ... %.2f degC\n', min(data.temperature), max(data.temperature));
fprintf('Humidity range          : %.2f ... %.2f %%\n\n', min(data.humidity), max(data.humidity));


%% 3. Automatic irrigation control (simulated) ------------------------------
fprintf('--- 3. IRRIGATION CONTROL (simulated) ---\n');
fprintf('Law: soil < %g %% -> ON | soil > %g %% -> OFF | band -> hold | lost packet -> hold\n\n', ...
    cfg.dryThreshold, cfg.wetThreshold);

normal = irrigation_control(data.soil, data.received, ...
    DryThreshold = cfg.dryThreshold, WetThreshold = cfg.wetThreshold, Mode = "hold");

safe = irrigation_control(data.soil, data.received, ...
    DryThreshold = cfg.dryThreshold, WetThreshold = cfg.wetThreshold, ...
    Mode = "failSafe", MaxHoldSamples = cfg.maxHoldSamples);

legacy = irrigation_control(data.soil, data.received, ...
    DryThreshold = cfg.dryThreshold, WetThreshold = cfg.wetThreshold, ...
    Mode = "singleThreshold");

fprintf('Normal (hysteresis+hold) : ON %3d (%.2f %%), %d transitions, %d activations\n', ...
    normal.onCount, normal.onPercent, normal.transitions, normal.activations);
fprintf('Safe (watchdog %d pkts)   : ON %3d (%.2f %%), %d transitions, %d watchdog trips\n', ...
    cfg.maxHoldSamples, safe.onCount, safe.onPercent, safe.transitions, safe.watchdogTrips);
fprintf('Legacy (single threshold): ON %3d (%.2f %%), %d transitions\n', ...
    legacy.onCount, legacy.onPercent, legacy.transitions);
fprintf('Recorded in dataset      : ON %3d (%.2f %%)\n\n', ...
    sum(data.pumpRecorded), 100 * mean(data.pumpRecorded));

agreementNormal = 100 * mean(normal.pump == double(data.pumpRecorded));
agreementLegacy = 100 * mean(legacy.pump == double(data.pumpRecorded));
fprintf('Agreement with recorded pump: normal %.2f %% | legacy %.2f %%\n\n', ...
    agreementNormal, agreementLegacy);

%% 4. Simulated LoRa link analysis ------------------------------------------
fprintf('--- 4. SIMULATED LoRa LINK ---\n');
link = packet_statistics(data.received, data.sample);

fprintf('Packets transmitted     : %d\n', link.total);
fprintf('Packets delivered       : %d\n', link.receivedCount);
fprintf('Packets lost            : %d\n', link.lostCount);
fprintf('Packet Delivery Ratio   : %.6f %%\n', link.pdrPercent);
fprintf('Packet Loss Ratio       : %.6f %%\n', link.plrPercent);
fprintf('Availability (1 - PLR)  : %.6f\n', link.availability);
fprintf('Loss events             : %d\n', link.lossEvents);
fprintf('Longest outage          : %d packet(s)\n', link.longestOutage);
if ~isempty(link.lostSamples)
    fprintf('Lost at sample indices  : %s\n', mat2str(link.lostSamples'));
end
fprintf('\n');

%% 5. Communication-failure stress test (synthetic) -------------------------
% The recorded run only contains isolated single-packet losses, so the
% difference between "hold" and the watchdog only appears for a burst outage.
% A deterministic, clearly-labelled synthetic outage is therefore injected
% inside the second irrigation period (where the simulated pump is ON).
% The sensor values themselves are NOT modified - this is a link-failure
% scenario only, and it is reported separately from the measured results.
fprintf('--- 5. COMMUNICATION-FAILURE STRESS TEST (synthetic) ---\n');
stressWindow = [90 110];
stressMask = data.sample >= stressWindow(1) & data.sample <= stressWindow(2);
receivedStress = data.received;
receivedStress(stressMask) = false;
injectedLosses = link.receivedCount - sum(receivedStress);

normalStress = irrigation_control(data.soil, receivedStress, ...
    DryThreshold = cfg.dryThreshold, WetThreshold = cfg.wetThreshold, Mode = "hold");
safeStress = irrigation_control(data.soil, receivedStress, ...
    DryThreshold = cfg.dryThreshold, WetThreshold = cfg.wetThreshold, ...
    Mode = "failSafe", MaxHoldSamples = cfg.maxHoldSamples);

fprintf('Injected outage window  : samples %d ... %d (%d packets lost)\n', ...
    stressWindow(1), stressWindow(2), injectedLosses);
fprintf('Hold strategy           : ON %3d samples, %d watchdog trips\n', ...
    normalStress.onCount, normalStress.watchdogTrips);
fprintf('Fail-safe strategy      : ON %3d samples, %d watchdog trips\n', ...
    safeStress.onCount, safeStress.watchdogTrips);
fprintf('Difference              : %d sample(s) where the commands differ\n\n', ...
    sum(normalStress.pump ~= safeStress.pump));

%% 6. Verification (self-checks against known values) -----------------------
fprintf('--- 6. VERIFICATION ---\n');
checkTable = run_verification(data, info, normal, safe, legacy, link, agreementNormal, ...
    cfg, receivedStress, stressMask, normalStress, safeStress);
disp(checkTable);

failCount = sum(checkTable.Result == "FAIL");
if failCount > 0
    warning('smart_farm:verificationFailed', ...
        '%d of %d verification check(s) FAILED - see the table above.', ...
        failCount, height(checkTable));
else
    fprintf('All %d verification checks passed.\n\n', height(checkTable));
end

%% 7. Figures ---------------------------------------------------------------
fprintf('--- 7. FIGURES ---\n');

figs = gobjects(0);
figs(end + 1) = plot_sensor_series(data.sample, data.soil, "%", "Soil moisture", ...
    fullfile(resultsDir, "Fig1_soil_moisture.png"), ...
    Color = [0 0.4470 0.7410], DryThreshold = cfg.dryThreshold, ...
    WetThreshold = cfg.wetThreshold, LostMask = ~data.received); %#ok<SAGROW>

figs(end + 1) = plot_sensor_series(data.sample, data.temperature, "degC", ...
    "Air temperature", fullfile(resultsDir, "Fig2_air_temperature.png"), ...
    Color = [0.8500 0.3250 0.0980], LostMask = ~data.received); %#ok<SAGROW>

figs(end + 1) = plot_sensor_series(data.sample, data.humidity, "%", ...
    "Air humidity", fullfile(resultsDir, "Fig3_air_humidity.png"), ...
    Color = [0.0 0.60 0.30], LostMask = ~data.received); %#ok<SAGROW>

figs(end + 1) = plot_pump_timeline(data.sample, data.pumpRecorded, normal.pump, ...
    fullfile(resultsDir, "Fig4_pump_timeline.png"), ...
    sprintf("Pump command - recorded vs simulated (hysteresis %g/%g %%)", ...
    cfg.dryThreshold, cfg.wetThreshold)); %#ok<SAGROW>

figs(end + 1) = plot_packet_reception(data.sample, data.received, ...
    fullfile(resultsDir, "Fig5_packet_reception.png")); %#ok<SAGROW>

figs(end + 1) = plot_packet_performance(link, cfg.deliveryTarget, ...
    fullfile(resultsDir, "Fig6_packet_performance.png")); %#ok<SAGROW>

figs(end + 1) = plot_irrigation_comparison(data.sample, data.soil, ...
    [double(data.pumpRecorded), normal.pump, safe.pump, legacy.pump], ...
    ["Recorded (dataset)", "Normal: hysteresis + hold", ...
     "Safe: watchdog fail-safe", "Legacy: single threshold"], ...
    cfg.dryThreshold, cfg.wetThreshold, ...
    "Irrigation strategies - normal vs safe vs legacy", ...
    fullfile(resultsDir, "Fig7_irrigation_comparison.png")); %#ok<SAGROW>

figs(end + 1) = plot_irrigation_comparison(data.sample, data.soil, ...
    [normalStress.pump, safeStress.pump], ...
    ["Hold on outage (normal)", "Watchdog fail-safe"], ...
    cfg.dryThreshold, cfg.wetThreshold, ...
    sprintf("Communication failure stress test: samples %d-%d forced lost", ...
    stressWindow(1), stressWindow(2)), ...
    fullfile(resultsDir, "Fig8_communication_failure.png"), ...
    OutageWindow = stressWindow); %#ok<SAGROW>

fprintf('%d figures written to %s\n\n', numel(figs), resultsDir);


%% 8. Summary files ---------------------------------------------------------
fprintf('--- 8. EXPORTED RESULTS ---\n');

summary = table( ...
    soilMean, temperatureMean, humidityMean, ...
    info.rowsUsed, ...
    sum(data.pumpRecorded), normal.onCount, safe.onCount, legacy.onCount, ...
    link.total, link.receivedCount, link.lostCount, ...
    link.pdrPercent, link.plrPercent, link.longestOutage, link.lossEvents, ...
    agreementNormal, cfg.dryThreshold, cfg.wetThreshold, ...
    'VariableNames', { ...
    'avgSoil', 'avgTemperature', 'avgHumidity', ...
    'samples', ...
    'pumpOnRecorded', 'pumpOnNormal', 'pumpOnSafe', 'pumpOnLegacy', ...
    'totalPackets', 'successfulPackets', 'lostPackets', ...
    'deliveryRate', 'packetLossRate', 'longestOutage', 'lossEvents', ...
    'controlLawAgreement', 'dryThreshold', 'wetThreshold'});

summaryFile = fullfile(resultsDir, 'smart_farm_summary.csv');
writetable(summary, summaryFile);
fprintf('  saved summary : %s\n', summaryFile);

modeComparison = table( ...
    ["Recorded (dataset)"; "Normal: hysteresis + hold"; "Safe: watchdog fail-safe"; ...
     "Legacy: single threshold"; "Hold - outage stress"; "Fail-safe - outage stress"], ...
    [sum(data.pumpRecorded); normal.onCount; safe.onCount; legacy.onCount; ...
     normalStress.onCount; safeStress.onCount], ...
    [normal.transitions; normal.transitions; safe.transitions; legacy.transitions; ...
     normalStress.transitions; safeStress.transitions], ...
    [0; normal.watchdogTrips; safe.watchdogTrips; 0; normalStress.watchdogTrips; ...
     safeStress.watchdogTrips], ...
    'VariableNames', {'strategy', 'pumpOnSamples', 'transitions', 'watchdogTrips'});

modeFile = fullfile(resultsDir, 'irrigation_mode_comparison.csv');
writetable(modeComparison, modeFile);
fprintf('  saved modes   : %s\n', modeFile);

lossFile = fullfile(resultsDir, 'packet_loss_events.csv');
writetable(link.events, lossFile);
fprintf('  saved losses  : %s\n', lossFile);

fprintf('\nSMART FARM MATLAB SIMULATION COMPLETED.\n');
fprintf('Simulation only - no physical pump, sensor or LoRa radio was used.\n');

if batchStartupOptionUsed
    close all force;
end

%% Local functions ----------------------------------------------------------
function checkTable = run_verification(data, info, normal, safe, legacy, link, ...
        agreementNormal, cfg, receivedStress, stressMask, normalStress, safeStress)

% Rejecting invalid thresholds is verified with a negative test.
invalidRejected = 0;
try
    irrigation_control([50; 60], [true; true], DryThreshold = 40, WetThreshold = 30);
catch
    invalidRejected = 1;
end

% Hysteresis compliance of the simulated (normal) command.
hysteresisViolations = sum(normal.pump == 1 & data.soil > cfg.wetThreshold) + ...
                       sum(normal.pump == 0 & data.soil < cfg.dryThreshold);

% The pump state must not change on a lost packet.
lostIdx = find(~data.received);
stateChangesOnLoss = 0;
for k = 1:numel(lostIdx)
    idx = lostIdx(k);
    if idx > 1 && normal.pump(idx) ~= normal.pump(idx - 1)
        stateChangesOnLoss = stateChangesOnLoss + 1;
    end
end

items = {
    "Rows used",                          info.rowsUsed,            120,               0
    "Mean soil moisture (%)",             mean(data.soil),          41.4255755358,     1e-6
    "Mean air temperature (degC)",        mean(data.temperature),   25.4416935298,     1e-6
    "Mean air humidity (%)",              mean(data.humidity),      54.2380306970,     1e-6
    "Packets delivered",                  link.receivedCount,       116,               0
    "Packets lost",                       link.lostCount,           4,                 0
    "Packet Delivery Ratio (%)",          link.pdrPercent,          96.6666666667,     1e-6
    "Packet Loss Ratio (%)",              link.plrPercent,          3.3333333333,      1e-6
    "PDR + PLR (%)",                      link.pdrSumCheck,         100,               1e-9
    "Loss events",                        link.lossEvents,          4,                 0
    "Longest outage (packets)",           link.longestOutage,       1,                 0
    "Normal strategy: pump ON samples",   normal.onCount,           44,                0
    "Normal vs recorded agreement (%)",   agreementNormal,          100,               1e-9
    "Legacy strategy: pump ON samples",   legacy.onCount,           27,                0
    "Safe strategy: pump ON samples",     safe.onCount,             44,                0
    "Safe strategy: watchdog trips",      safe.watchdogTrips,       0,                 0
    "Hysteresis violations",              hysteresisViolations,     0,                 0
    "Pump changes on lost packets",       stateChangesOnLoss,       0,                 0
    "Invalid thresholds rejected",        invalidRejected,          1,                 0
    "Stress: packets lost in outage",      sum(~receivedStress(stressMask)), 21, 0
    "Stress: watchdog changes command",   double(sum(normalStress.pump ~= safeStress.pump) > 0), 1, 0
    "Stress: fail-safe ON <= hold ON",    double(safeStress.onCount <= normalStress.onCount), 1, 0
    };

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

