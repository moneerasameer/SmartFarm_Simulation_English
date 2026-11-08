function toa = lora_time_on_air(cfg)
%LORA_TIME_ON_AIR LoRa packet airtime from the standard Semtech formula.
%
%   toa = lora_time_on_air(cfg)
%
%   Computes the time the modulator needs to transmit ONE packet. This is the
%   "packet transmission model" of the simulation: it defines how long the
%   channel is occupied and therefore the achievable update rate and the
%   duty-cycle budget. It uses the published LoRa CSS formula (Semtech
%   SX1276 datasheet, section "LoRa Modem"), not a fitted curve.
%
%   Input  cfg : struct returned by LORA_DEFAULT_CONFIG (fields used:
%                bandwidth_kHz, spreadingFactor, codingRate, preambleSymbols,
%                explicitHeader, payloadCrc, payloadBytes, lowDataRateOptimize)
%
%   Output toa : struct with fields
%                symbolTime_s        duration of one LoRa symbol
%                preambleSymbols     configured preamble length
%                payloadSymbols      number of payload symbols (n_payload)
%                packetSymbols       preamble + 4.25 + payload
%                timeOnAir_s         total airtime of one packet (seconds)
%                timeOnAir_ms        the same value in milliseconds
%                maxPacketsPerHour   duty-cycle budget (packets per hour)
%
%   Formula
%     Tsym      = 2^SF / BW
%     n_payload = 8 + max( ceil( (8*PL - 4*SF + 28 + 16*CRC - 20*IH) ...
%                                / (4*(SF - 2*DE)) ) * (CR + 4), 0 )
%     ToA       = (n_preamble + 4.25 + n_payload) * Tsym
%     where PL = payload bytes, CRC/IH/DE are 1 when enabled, CR = 4/5 -> 1.

sf  = cfg.spreadingFactor;
bw  = cfg.bandwidth_kHz * 1000;            % Hz
cr  = cfg.codingRate;                      % 1..4  -> 4/5 ... 4/8
pl  = cfg.payloadBytes;
ih  = double(cfg.explicitHeader);          % 1 = explicit header (20 bits removed)
crc = double(cfg.payloadCrc);

% Low-data-rate optimisation (DE) is mandatory for SF11/SF12 at 125 kHz.
if isstring(cfg.lowDataRateOptimize) && cfg.lowDataRateOptimize == "auto"
    de = double(sf >= 11 && cfg.bandwidth_kHz == 125);
else
    de = double(logical(cfg.lowDataRateOptimize));
end

symbolTime = (2 ^ sf) / bw;                                    % seconds

payloadSymbols = 8 + max(ceil((8 * pl - 4 * sf + 28 + 16 * crc - 20 * ih) ...
    / (4 * (sf - 2 * de))) * (cr + 4), 0);

packetSymbols = cfg.preambleSymbols + 4.25 + payloadSymbols;
timeOnAir = packetSymbols * symbolTime;

toa = struct( ...
    'symbolTime_s', symbolTime, ...
    'preambleSymbols', cfg.preambleSymbols, ...
    'payloadSymbols', payloadSymbols, ...
    'packetSymbols', packetSymbols, ...
    'timeOnAir_s', timeOnAir, ...
    'timeOnAir_ms', 1000 * timeOnAir, ...
    'lowDataRateOptimize', logical(de), ...
    'payLoadBytes', pl, ...
    'spreadingFactor', sf, ...
    'bandwidth_kHz', cfg.bandwidth_kHz, ...
    'codingRate', cr, ...
    'maxPacketsPerHour', 3600 * cfg.dutyCycleLimit / timeOnAir);
end
