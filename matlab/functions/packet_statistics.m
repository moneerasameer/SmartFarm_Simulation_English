function stats = packet_statistics(received, sample)
%PACKET_STATISTICS LoRa link performance metrics from the reception flags.
%
%   stats = packet_statistics(received)
%   stats = packet_statistics(received, sample)
%
%   Each recorded sample corresponds to one telemetry packet, so the number of
%   packets equals the number of samples.
%
%   Inputs
%     received  n-by-1 logical, true when a packet arrived
%     sample    n-by-1 double with the dataset "Sample" values (optional).
%               When supplied, the reported positions use the dataset sample
%               numbers (0-based) instead of the MATLAB row index (1-based),
%               which avoids the classic off-by-one confusion in reports.
%
%   Output (struct)
%     total            number of transmitted packets (= samples)
%     receivedCount    packets delivered
%     lostCount        packets lost
%     pdr              Packet Delivery Ratio   = received / total   (0..1)
%     plr              Packet Loss Ratio       = lost / total       (0..1)
%     pdrPercent       PDR in percent
%     plrPercent       PLR in percent
%     availability     1 - PLR (fraction of time fresh data is available)
%     longestOutage    longest run of consecutive lost packets
%     lossEvents       number of separate loss runs
%     events           table with columns: firstSample, length
%     lostSamples      dataset sample numbers whose packet was lost
%     cumulativePdr    running PDR in percent (for plotting)
%     pdrSumCheck      pdrPercent + plrPercent (must be 100)

received = logical(received(:));
n = numel(received);

if nargin < 2 || isempty(sample)
    sample = (0:n - 1)';
else
    sample = double(sample(:));
end
if numel(sample) ~= n
    error('packet_statistics:sizeMismatch', ...
        'received (%d values) and sample (%d values) must have the same length.', ...
        n, numel(sample));
end

receivedCount = sum(received);
lostCount = n - receivedCount;
pdr = receivedCount / n;
plr = lostCount / n;

lostSamples = sample(~received);
changes = diff([false; ~received; false]);
runStarts = find(changes == 1);
runStops = find(changes == -1) - 1;

firstSamples = zeros(numel(runStarts), 1);
lengths = zeros(numel(runStarts), 1);
for k = 1:numel(runStarts)
    firstSamples(k) = sample(runStarts(k));
    lengths(k) = runStops(k) - runStarts(k) + 1;
end

if isempty(lengths)
    longestOutage = 0;
else
    longestOutage = max(lengths);
end

cumulativePdr = 100 * cumsum(received) ./ (1:n)';

stats = struct( ...
    'total', n, ...
    'receivedCount', receivedCount, ...
    'lostCount', lostCount, ...
    'pdr', pdr, ...
    'plr', plr, ...
    'pdrPercent', 100 * pdr, ...
    'plrPercent', 100 * plr, ...
    'availability', 1 - plr, ...
    'longestOutage', longestOutage, ...
    'lossEvents', numel(lengths), ...
    'events', table(firstSamples, lengths, ...
        'VariableNames', {'firstSample', 'length'}), ...
    'lostSamples', lostSamples, ...
    'cumulativePdr', cumulativePdr, ...
    'pdrSumCheck', 100 * pdr + 100 * plr);
end
