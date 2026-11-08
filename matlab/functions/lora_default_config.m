function cfg = lora_default_config()
%LORA_DEFAULT_CONFIG Assumptions for the software LoRa link simulation.
%
%   cfg = lora_default_config()
%
%   Returns a struct with EVERY parameter of the simulated LoRa link, its unit
%   and a short justification. Nothing here is a measured value from a real
%   radio: these are documented engineering assumptions that the user can and
%   should change to match a specific hardware setup.
%
%   The project does NOT contain a real LoRa module, and none of these numbers
%   were read from hardware. They are the standard values published in the
%   Semtech SX1276 datasheet and in the LoRaWAN regional parameters for the
%   EU868 band, rounded to typical application values.
%
%   Fields (unit)                       Default           Origin / justification
%   ------------------------------------------------------------------ ---------
%   region                              "EU868"           regulatory band assumption
%   frequency_MHz                       868.1             EU868 first channel (assumption)
%   bandwidth_kHz                       125               125 kHz is the LoRaWAN default
%   spreadingFactor                     7                 SF7 = fastest, SF12 = longest range
%   codingRate                          1                 1 = 4/5 (LoRaWAN default)
%   preambleSymbols                     8                 LoRaWAN default
%   explicitHeader                      true              LoRaWAN default
%   payloadCrc                          true              LoRaWAN default
%   payloadBytes                        16                typical sensor payload (assumption)
%   lowDataRateOptimize                 "auto"            mandatory for SF11/SF12 @125 kHz
%   txPower_dBm                         14                SX1276 maximum in EU868
%   txAntennaGain_dBi                   0                 small whip antenna assumption
%   rxAntennaGain_dBi                   0                 small whip antenna assumption
%   cableLoss_dB                        0                 no cable in the model
%   receiverNoiseFigure_dB              6                 typical low-cost SX1276 front end
%   implementationLoss_dB               1.5               aligns the model with the published
%                                                         SF7/125 kHz sensitivity of -123 dBm
%   snrLimit_dB                         32               per-SF demodulation limits, see table
%   pathLossExponent                    2.8               2.0 = free space, 2.7-3.5 = suburban
%   referenceDistance_m                 1                 PL(d0) from the Friis equation
%   shadowingSigma_dB                   6                 log-normal shadowing, suburban
%   perSteepness_dB                     1.5               slope of the PER-vs-SNR transition
%   dutyCycleLimit                      0.01              EU868 1 % (regulatory assumption)
%   randomSeed                          20261108          fixed seed => reproducible results
%   updateInterval_s                    60                sensor reporting period (assumption)
%   distance_m                          450               nominal link distance (same value
%                                                         the old script hard-coded)
%
%   Example
%     cfg = lora_default_config();
%     cfg.spreadingFactor = 12;          % trade data rate for sensitivity
%     cfg.distance_m = 2000;             % move the node further away

cfg = struct();

% --- Radio configuration (regulatory + modem settings) --------------------
cfg.region               = "EU868";
cfg.frequency_MHz        = 868.1;
cfg.bandwidth_kHz        = 125;
cfg.spreadingFactor      = 7;          % 7 ... 12
cfg.codingRate           = 1;          % 1 = 4/5, 2 = 4/6, 3 = 4/7, 4 = 4/8
cfg.preambleSymbols      = 8;
cfg.explicitHeader       = true;
cfg.payloadCrc           = true;
cfg.payloadBytes         = 16;
cfg.lowDataRateOptimize  = "auto";     % "auto" | true | false

% --- Transmitter / receiver ------------------------------------------------
cfg.txPower_dBm            = 14;
cfg.txAntennaGain_dBi      = 0;
cfg.rxAntennaGain_dBi      = 0;
cfg.cableLoss_dB           = 0;
cfg.receiverNoiseFigure_dB = 6;

% Published LoRa demodulation SNR limits (Semtech SX1276, bandwidth independent)
cfg.snrLimit_dB = [-7.5, -10.0, -12.5, -15.0, -17.5, -20.0];   % SF7 ... SF12
cfg.implementationLoss_dB = 1.5;

% --- Channel model ---------------------------------------------------------
cfg.pathLossExponent     = 2.8;
cfg.referenceDistance_m  = 1.0;
cfg.shadowingSigma_dB    = 6.0;
cfg.perSteepness_dB      = 1.5;

% --- Traffic / regulatory --------------------------------------------------
cfg.dutyCycleLimit  = 0.01;
cfg.randomSeed      = 20261108;
cfg.distance_m      = 450;
cfg.packets         = 120;
cfg.updateInterval_s = 60;   % one measurement per minute (assumption)
end
