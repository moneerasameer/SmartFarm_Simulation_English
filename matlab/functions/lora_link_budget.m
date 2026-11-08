function link = lora_link_budget(cfg, distance_m, shadowing_dB)
%LORA_LINK_BUDGET Received power, SNR, link margin and packet error probability.
%
%   link = lora_link_budget(cfg, distance_m)
%   link = lora_link_budget(cfg, distance_m, shadowing_dB)
%
%   Implements the propagation/sensitivity part of the simulated link:
%
%     1. Log-distance path loss with a Friis reference at d0 = 1 m
%          PL(d0) = 32.44 + 20*log10(f_MHz) + 20*log10(d0_km)
%          PL(d)  = PL(d0) + 10*n*log10(d/d0) + X_sigma
%        where n = path-loss exponent (2.0 free space, ~2.8 suburban) and
%        X_sigma is zero-mean log-normal shadowing (dB).
%     2. Received power
%          Prx = Ptx + Gtx + Grx - cable - PL(d)
%     3. Noise floor and SNR
%          N    = -174 + 10*log10(BW) + NF          [dBm]
%          SNR  = Prx - N                            [dB]
%     4. Demodulation requirement
%          SNR_limit(SF) from the Semtech table, plus an implementation loss
%          margin = SNR - (SNR_limit + implementationLoss)   [dB]
%     5. Packet error probability (logistic model around the demodulation
%        limit; the steepness is an ASSUMPTION, see cfg.perSteepness_dB)
%          PER = 1 / (1 + exp(k * margin))    -> PER = 50 % at margin = 0
%
%   Inputs
%     cfg           struct from LORA_DEFAULT_CONFIG
%     distance_m    scalar or per-packet vector of distances [m]
%     shadowing_dB  per-packet shadowing realisation [dB] (default: zero)
%
%   Output (struct, vectors shaped like distance_m)
%     distance_m, pathLoss_dB, rxPower_dBm, noiseFloor_dBm, snr_dB,
%     snrLimit_dB, linkMargin_dB, sensitivity_dBm, packetErrorProbability

if nargin < 3 || isempty(shadowing_dB)
    shadowing_dB = zeros(size(distance_m));
end

sfIndex = cfg.spreadingFactor - 6;                 % SF7 -> 1 ... SF12 -> 6
if sfIndex < 1 || sfIndex > numel(cfg.snrLimit_dB)
    error('lora_link_budget:spreadingFactor', ...
        'Spreading factor must be 7...12 (got %g).', cfg.spreadingFactor);
end
snrLimit = cfg.snrLimit_dB(sfIndex);

bw = cfg.bandwidth_kHz * 1000;
frequency = cfg.frequency_MHz;

% --- 1. Path loss ---------------------------------------------------------
distance = max(double(distance_m(:)), cfg.referenceDistance_m);
referenceKm = cfg.referenceDistance_m / 1000;
pathLossAtReference = 32.44 + 20 * log10(frequency) + 20 * log10(referenceKm);
pathLoss = pathLossAtReference + 10 * cfg.pathLossExponent * log10(distance / cfg.referenceDistance_m) ...
    + double(shadowing_dB(:));

% --- 2. Received power ----------------------------------------------------
rxPower = cfg.txPower_dBm + cfg.txAntennaGain_dBi + cfg.rxAntennaGain_dBi ...
    - cfg.cableLoss_dB - pathLoss;

% --- 3. Noise floor and SNR ----------------------------------------------
noiseFloor = -174 + 10 * log10(bw) + cfg.receiverNoiseFigure_dB;
snr = rxPower - noiseFloor;

% --- 4. Link margin relative to the demodulation limit -------------------
margin = snr - (snrLimit + cfg.implementationLoss_dB);
sensitivity = noiseFloor + snrLimit + cfg.implementationLoss_dB;

% --- 5. Packet error probability (logistic transition) -------------------
per = 1 ./ (1 + exp(cfg.perSteepness_dB * margin));

link = struct( ...
    'distance_m', distance, ...
    'pathLoss_dB', pathLoss, ...
    'rxPower_dBm', rxPower, ...
    'noiseFloor_dBm', noiseFloor, ...
    'snr_dB', snr, ...
    'snrLimit_dB', snrLimit, ...
    'linkMargin_dB', margin, ...
    'sensitivity_dBm', sensitivity, ...
    'packetErrorProbability', per);
end
