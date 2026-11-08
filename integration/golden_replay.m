%% GOLDEN REPLAY - integration cross-check of the MATLAB controller
%
% Reads integration/golden_scenario.csv (the SPEC expressed as data), replays
% it through the EXISTING controller function matlab/functions/irrigation_control.m
% and compares the simulated pump state with the expected values.
%
% Nothing is re-implemented here: the control law lives in irrigation_control.m,
% the same function used by smart_farm_complete.m and lora_link_simulation.m.
%
% Outputs
%   results/golden_matlab.csv   per-step expected/actual for both policies
%
% Run:  matlab -batch "run('integration/golden_replay.m')"
% Exit: an error is raised (non-zero exit in -batch) if any step mismatches.

clear; clc;

scriptDir   = fileparts(mfilename('fullpath'));
projectRoot = fileparts(scriptDir);
functionsDir = fullfile(projectRoot, 'matlab', 'functions');
addpath(functionsDir);

scenarioFile = fullfile(scriptDir, 'golden_scenario.csv');
resultsDir   = fullfile(projectRoot, 'results');
if ~isfolder(resultsDir)
    mkdir(resultsDir);
end

if ~isfile(scenarioFile)
    error('golden_replay:missingScenario', 'Scenario file not found: %s', scenarioFile);
end

scenario = readtable(scenarioFile, 'TextType', 'string');

fprintf('=============================================================\n');
fprintf(' GOLDEN REPLAY - MATLAB control law vs integration scenario\n');
fprintf('=============================================================\n');
fprintf('scenario file : %s\n', scenarioFile);
fprintf('steps         : %d\n\n', height(scenario));

% --- build one continuous stimulus stream (each step held for N cycles) -----
soil = zeros(0, 1);
received = false(0, 1);
for k = 1:height(scenario)
    n = scenario.cycles(k);
    soil     = [soil;     repmat(scenario.soil_percent(k), n, 1)]; %#ok<AGROW>
    received = [received; repmat(logical(scenario.packet_ok(k)), n, 1)]; %#ok<AGROW>
end

% --- replay through the project's controller function -----------------------
holdResult = irrigation_control(soil, received, ...
    DryThreshold = 30, WetThreshold = 40, Mode = "hold");

safeResult = irrigation_control(soil, received, ...
    DryThreshold = 30, WetThreshold = 40, Mode = "failSafe", MaxHoldSamples = 3);

% --- evaluate the pump state at the END of every step ----------------------
endIndex = cumsum(scenario.cycles);

stepCount = height(scenario);
label = strings(stepCount, 1);
soilUsed = zeros(stepCount, 1);
linkOk = zeros(stepCount, 1);
expectedHold = zeros(stepCount, 1);
actualHold = zeros(stepCount, 1);
expectedSafe = zeros(stepCount, 1);
actualSafe = zeros(stepCount, 1);
result = strings(stepCount, 1);

for k = 1:stepCount
    label(k)        = scenario.label(k);
    soilUsed(k)     = scenario.soil_percent(k);
    linkOk(k)       = scenario.packet_ok(k);
    expectedHold(k) = scenario.expected_hold(k);
    actualHold(k)   = holdResult.pump(endIndex(k));
    expectedSafe(k) = scenario.expected_failsafe(k);
    actualSafe(k)   = safeResult.pump(endIndex(k));

    if actualHold(k) == expectedHold(k) && actualSafe(k) == expectedSafe(k)
        result(k) = "PASS";
    else
        result(k) = "FAIL";
    end
end

outTable = table((1:stepCount)', label, soilUsed, linkOk, ...
    expectedHold, actualHold, expectedSafe, actualSafe, result, ...
    'VariableNames', {'step', 'label', 'soil', 'link', 'expectedHold', ...
    'actualHold', 'expectedSafe', 'actualSafe', 'result'});

fprintf('%-4s %-42s %5s %4s %7s %7s  %s\n', 'step', 'scenario', 'soil', 'link', 'hold', 'safety', 'result');
for k = 1:stepCount
    fprintf('%-4d %-42s %4d%%   %d   %d/%d     %d/%d      %s\n', k, label(k), soilUsed(k), ...
        linkOk(k), expectedHold(k), actualHold(k), expectedSafe(k), actualSafe(k), result(k));
end

fprintf('\nsummary: hold ON %d samples, fail-safe ON %d samples, %d watchdog trip(s)\n', ...
    holdResult.onCount, safeResult.onCount, safeResult.watchdogTrips);

outFile = fullfile(resultsDir, 'golden_matlab.csv');
writetable(outTable, outFile);
fprintf('written: %s\n', outFile);

failures = sum(result == "FAIL");
if failures > 0
    error('golden_replay:mismatch', '%d of %d scenario steps did not match the specification.', ...
        failures, stepCount);
end
fprintf('RESULT: PASS (%d/%d steps)\n', stepCount, stepCount);
