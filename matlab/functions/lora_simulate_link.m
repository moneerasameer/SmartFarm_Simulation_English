function sim = lora_simulate_link(cfg, options)
%LORA_SIMULATE_LINK Software simulation of a LoRa uplink (packet level).
%
%   sim = lora_simulate_link(cfg)
%   sim = lora_simulate_link(cfg, Name=Value, ...)
%
%   Generates a per-packet reception trace for ONE sensor node transmitting to
%   ONE gateway. For every packet the function:
%     1. evaluates the link budget at the packet's distance (path loss +
%        log-normal shadowing)            -> lora_link_budget
%     2. converts the link margin into a packet error probability (PER)
%     3. draws a random reception outcome
%     4. optionally applies scenario effects (burst outage / interference)
%     5. summarises the trace with the existing PACKET_STATISTICS function
%        (PDR, PLR, loss events, longest outage)
%
%   This is a SOFTWARE model. No LoRa radio, gateway or antenna is connected;
%   results are simulated, not measured.
%
%   Name-Value options
%     Scenario            "nominal" (default) | "outage" | "interference" | "range"
%     Distance_m          scalar or per-packet vector [m] (default cfg.distance_m)
%     Packets             number of packets (default cfg.packets)
%     OutageWindow        [first last] packet indices forced to be lost
%                         (Scenario = "outage")
%     InterferenceWindow  [first last] packet indices with extra interference
%                         (Scenario = "interference")
%     Interference_dB     effective SNR degradation inside that window (default 8)
%     Seed                RNG seed; default cfg.randomSeed. A private
%                         RandStream is used, so the caller's RNG is untouched
%                         and identical seeds give identical traces.
%     SampleIndices       sample numbers reported in the metrics (default 0..n-1)
%
%   Output (struct)
%     scenario, packets, sample, received (logical), perEffective,
%     link (struct from LORA_LINK_BUDGET, vectorised per packet),
%     toa (struct from LORA_TIME_ON_AIR), stats (struct from PACKET_STATISTICS),
%     dutyCycleUsed, seed, outageWindow, interferenceWindow

arguments
    cfg struct
    options.Scenario (1,1) string ...
        {mustBeMember(options.Scenario, ["nominal", "outage", "interference", "range"])} = "nominal"
    options.Distance_m double = []
    options.Packets (1,1) double {mustBeNonnegative, mustBeInteger} = 0
    options.OutageWindow double = []
    options.InterferenceWindow double = []
    options.Interference_dB (1,1) double {mustBeNonnegative} = 8
    options.Seed double = []
    options.SampleIndices double = []
end

% --- Packet count and distances -------------------------------------------
if options.Packets > 0
    n = options.Packets;
else
    n = cfg.packets;
end

if isempty(options.Distance_m)
    distance = repmat(cfg.distance_m, n, 1);
else
    distance = double(options.Distance_m(:));
    if isscalar(distance)
        distance = repmat(distance, n, 1);
    elseif numel(distance) ~= n
        n = numel(distance);
    end
end

if isempty(options.SampleIndices)
    sample = (0:n - 1)';
else
    sample = double(options.SampleIndices(:));
end
if numel(sample) ~= n
    error('lora_simulate_link:sampleMismatch', ...
        'SampleIndices has %d entries but %d packets were requested.', numel(sample), n);
end

% --- Reproducible randomness (private stream) -----------------------------
if isempty(options.Seed)
    seed = cfg.randomSeed;
else
    seed = options.Seed;
end
stream = RandStream('mt19937ar', 'Seed', seed);

% --- 1./2. Link budget and PER per packet --------------------------------
shadowing = randn(stream, n, 1) * cfg.shadowingSigma_dB;
link = lora_link_budget(cfg, distance, shadowing);
perEffective = link.packetErrorProbability;

% --- Scenario: interference (temporary SNR degradation) -------------------
interferenceWindow = options.InterferenceWindow(:)';
if options.Scenario == "interference" && ~isempty(interferenceWindow)
    inside = false(n, 1);
    inside(interferenceWindow(1):interferenceWindow(2)) = true;
    degradedMargin = link.linkMargin_dB - options.Interference_dB;
    perEffective(inside) = 1 ./ (1 + exp(cfg.perSteepness_dB * degradedMargin(inside)));
end

% --- 3. Random reception decision ---------------------------------------
draw = rand(stream, n, 1);
received = draw > perEffective;

% --- Scenario: burst outage (gateway down / node out of range) -----------
outageWindow = options.OutageWindow(:)';
if options.Scenario == "outage" && ~isempty(outageWindow)
    received(outageWindow(1):outageWindow(2)) = false;
end

% --- 5. Metrics (reuse the project's packet statistics) ------------------
stats = packet_statistics(received, sample);
toa = lora_time_on_air(cfg);

sim = struct( ...
    'scenario', options.Scenario, ...
    'packets', n, ...
    'sample', sample, ...
    'distance_m', distance, ...
    'received', received, ...
    'perEffective', perEffective, ...
    'link', link, ...
    'toa', toa, ...
    'stats', stats, ...
    'dutyCycleUsed', toa.timeOnAir_s / cfg.updateInterval_s, ...
    'seed', seed, ...
    'outageWindow', outageWindow, ...
    'interferenceWindow', interferenceWindow, ...
    'interference_dB', options.Interference_dB);
end
