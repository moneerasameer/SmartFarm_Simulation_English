% SMART FARM - MATLAB/Octave simulation (standalone synthetic variant)
% Synthetic sensors + virtual LoRa packet link + automatic irrigation.
%
% This script is intentionally independent of data/sensor_data.csv: it
% generates its own signal so the effect of the link model can be explored
% without touching the recorded dataset. The CSV-driven analysis lives in
% smart_farm_complete.m, which is the main entry point of the MATLAB part.
clear; clc; close all;
rng(7);
N = 120;
t = 1:N;

% Synthetic sensor signals (not real measurements)
soil = 42 + 17*sin((t-15)/18) + 4*randn(1,N);
soil = min(max(soil,5),95);
temp = 24 + 5*sin(t/28) + 1.2*randn(1,N);
humidity = 58 - 12*sin(t/28) + 3*randn(1,N);
humidity = min(max(humidity,20),95);

% Illustrative virtual LoRa link parameters
packetLossProbability = 0.04;
distance_m = 450;
txPower_dBm = 14;
pathLoss_dB = 105 + 20*log10(max(distance_m,1)/100);
rssi_dBm = txPower_dBm - pathLoss_dB;
snr_dB = 8.5 - 20*log10(max(distance_m,1)/100);
received = rand(1,N) > packetLossProbability;

% Irrigation logic with hysteresis
pump = zeros(1,N);
pumpState = 0;
dryThreshold = 30;
wetThreshold = 40;
for k = 1:N
    if received(k)
        if soil(k) < dryThreshold
            pumpState = 1;
        elseif soil(k) > wetThreshold
            pumpState = 0;
        end
    end
    pump(k) = pumpState;
end

figure('Name','Smart Farm Simulation');
subplot(3,1,1);
plot(t,soil,'b','LineWidth',1.2); hold on;
yline(dryThreshold,'r--','Dry threshold');
yline(wetThreshold,'g--','Wet threshold');
ylabel('Soil moisture (%)'); grid on; title('Synthetic sensor readings');
subplot(3,1,2);
plot(t,temp,'m','LineWidth',1.2); hold on;
plot(t,humidity,'c','LineWidth',1.2);
ylabel('Temperature / RH'); legend('Temperature (C)','Humidity (%)'); grid on;
subplot(3,1,3);
stairs(t,pump,'k','LineWidth',1.5);
ylim([-0.1 1.1]); yticks([0 1]); yticklabels({'OFF','ON'});
xlabel('Sample'); ylabel('Pump'); grid on;

fprintf('SMART FARM - VIRTUAL LoRa LINK\n');
fprintf('Distance: %.0f m | Estimated RSSI: %.1f dBm | Estimated SNR: %.1f dB\n', distance_m,rssi_dBm,snr_dB);
fprintf('Packets sent: %d | Packets received: %d | Delivery ratio: %.1f %%\n', N,sum(received),100*mean(received));
fprintf('Pump ON samples: %d of %d\n',sum(pump),N);
