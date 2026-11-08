function result = irrigation_control(soil, received, options)
%IRRIGATION_CONTROL Simulated automatic irrigation controller.
%
%   result = irrigation_control(soil, received, Name=Value, ...)
%
%   This function models the DECISION LOGIC of the irrigation controller. It
%   does not drive or communicate with any physical pump: the returned vector
%   is the simulated pump command that a real controller would produce.
%
%   Documented control law (technical report, section 5)
%   ---------------------------------------------------
%   Hysteresis band with two thresholds:
%     * soil moisture  <  DryThreshold            -> pump ON  (soil too dry)
%     * soil moisture  >  WetThreshold            -> pump OFF (soil wet enough)
%     * DryThreshold <= soil moisture <= WetThreshold
%                                                 -> keep the previous state
%   Communication rule:
%     * packet lost (received == false)           -> keep the previous state,
%       because no fresh measurement is available and acting on stale data
%       would be unsafe.
%
%   Three strategies can be evaluated (parameter Mode):
%     "hold"            documented law, holds the state for any number of
%                       consecutive lost packets (baseline behaviour).
%     "failSafe"        same law plus a watchdog: after MaxHoldSamples
%                       consecutive lost packets the pump is forced OFF
%                       (a conservative, fail-safe behaviour for long outages).
%     "singleThreshold" legacy comparison: pump = (soil < DryThreshold),
%                       i.e. no hysteresis and no communication handling.
%                       It reproduces the behaviour of the original script and
%                       is kept only to quantify how much it differs.
%
%   Inputs
%     soil      n-by-1 double, soil moisture in percent
%     received  n-by-1 logical, true when the telemetry packet arrived
%     DryThreshold, WetThreshold    thresholds in percent (default 30 / 40)
%     Mode                          "hold" (default) | "failSafe" | "singleThreshold"
%     MaxHoldSamples                watchdog limit for "failSafe" (default 3)
%
%   Outputs (struct)
%     pump            n-by-1 double, 0 = OFF, 1 = ON
%     action          n-by-1 string, reason for the command
%     onCount / offCount, onPercent
%     transitions     number of ON<->OFF changes
%     activations     number of OFF->ON changes
%     holdSamples     samples where the state was kept because of the band
%     lossSamples     samples where the state was kept because of a lost packet
%     watchdogTrips   samples where "failSafe" forced the pump OFF
%     mode, dryThreshold, wetThreshold

arguments
    soil (:,1) double
    received (:,1) logical
    options.DryThreshold (1,1) double {mustBePositive} = 30
    options.WetThreshold (1,1) double {mustBePositive} = 40
    options.Mode (1,1) string {mustBeMember(options.Mode, ...
        ["hold", "failSafe", "singleThreshold"])} = "hold"
    options.MaxHoldSamples (1,1) double {mustBePositive, mustBeInteger} = 3
end

if options.WetThreshold <= options.DryThreshold
    error('irrigation_control:invalidThresholds', ...
        'WetThreshold (%g) must be greater than DryThreshold (%g).', ...
        options.WetThreshold, options.DryThreshold);
end
if numel(soil) ~= numel(received)
    error('irrigation_control:sizeMismatch', ...
        'soil (%d values) and received (%d values) must have the same length.', ...
        numel(soil), numel(received));
end

n = numel(soil);
pump = zeros(n, 1);
action = strings(n, 1);

state = 0;              % pump starts OFF (safe state)
consecutiveLosses = 0;
holdSamples = 0;
lossSamples = 0;
watchdogTrips = 0;

for k = 1:n
    if options.Mode == "singleThreshold"
        % Legacy comparison only: no hysteresis, no communication handling.
        if soil(k) < options.DryThreshold
            state = 1;
            action(k) = "Irrigate (single threshold)";
        else
            state = 0;
            action(k) = "Stop (single threshold)";
        end

    elseif received(k)
        consecutiveLosses = 0;
        if soil(k) < options.DryThreshold
            state = 1;
            action(k) = "Irrigate: soil below dry threshold";
        elseif soil(k) > options.WetThreshold
            state = 0;
            action(k) = "Stop irrigation: soil above wet threshold";
        else
            action(k) = "Hold: inside hysteresis band";
            holdSamples = holdSamples + 1;
        end

    else
        % No telemetry: never act on stale data.
        consecutiveLosses = consecutiveLosses + 1;
        lossSamples = lossSamples + 1;
        if options.Mode == "failSafe" && consecutiveLosses >= options.MaxHoldSamples
            if state ~= 0
                watchdogTrips = watchdogTrips + 1;
            end
            state = 0;
            action(k) = sprintf("Fail-safe watchdog: pump OFF (%d lost packets)", ...
                consecutiveLosses);
        else
            action(k) = "Hold: no telemetry (packet lost)";
        end
    end

    pump(k) = state;
end

changes = [false; diff(pump) ~= 0];

result = struct( ...
    'pump', pump, ...
    'action', action, ...
    'onCount', sum(pump == 1), ...
    'offCount', sum(pump == 0), ...
    'onPercent', 100 * mean(pump), ...
    'transitions', sum(changes), ...
    'activations', sum(diff(pump) == 1), ...
    'holdSamples', holdSamples, ...
    'lossSamples', lossSamples, ...
    'watchdogTrips', watchdogTrips, ...
    'mode', options.Mode, ...
    'dryThreshold', options.DryThreshold, ...
    'wetThreshold', options.WetThreshold);
end
