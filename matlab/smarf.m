
%% SMART FARM - COMPLETE MATLAB SIMULATION
% Software-only Smart Farm project
% Sensor and LoRa data are simulated.

clc;
clear;
close all;

%% 1. Load Sensor Data

dataFile = '../data/sensor_data.csv';

if ~isfile(dataFile)
    error('Sensor data file not found: %s', dataFile);
end

T = readtable(dataFile);

disp('SMART FARM SENSOR DATA');
disp(T(1:min(5,height(T)),:));

%% 2. Extract Sensor Values

sample = T.Sample;
soil = T.SoilMoisture___;
temperature = T.Temperature__C_;
humidity = T.AirHumidity___;

%% 3. Sensor Statistics

avgSoil = mean(soil);
avgTemperature = mean(temperature);
avgHumidity = mean(humidity);

fprintf('\n--- SENSOR STATISTICS ---\n');
fprintf('Average Soil Moisture: %.2f %%\n',avgSoil);
fprintf('Average Temperature: %.2f C\n',avgTemperature);
fprintf('Average Air Humidity: %.2f %%\n',avgHumidity);

%% 4. Sensor Visualization

figure('Name','Smart Farm Sensor Analysis');

subplot(3,1,1);
plot(sample,soil,'b-o');
title('Soil Moisture');
xlabel('Sample');
ylabel('Moisture (%)');
grid on;

subplot(3,1,2);
plot(sample,temperature,'r-o');
title('Temperature');
xlabel('Sample');
ylabel('Temperature (C)');
grid on;

subplot(3,1,3);
plot(sample,humidity,'g-o');
title('Air Humidity');
xlabel('Sample');
ylabel('Humidity (%)');
grid on;

%% 5. Automatic Irrigation Simulation

pump = double(soil < 30);

figure('Name','Automatic Irrigation');
stairs(sample,pump,'LineWidth',2);
ylim([-0.2 1.2]);
yticks([0 1]);
yticklabels({'OFF','ON'});
title('Smart Farm - Automatic Irrigation');
xlabel('Sample');
ylabel('Pump Status');
grid on;

pumpON = sum(pump == 1);
pumpOFF = sum(pump == 0);

fprintf('\n--- IRRIGATION RESULTS ---\n');
fprintf('Pump ON samples: %d\n',pumpON);
fprintf('Pump OFF samples: %d\n',pumpOFF);

%% 6. LoRa Communication Simulation Analysis

received = strcmpi(string(T.PacketReceived),'True');

totalPackets = length(received);
successfulPackets = sum(received);
lostPackets = totalPackets - successfulPackets;

deliveryRate = 100 * successfulPackets / totalPackets;
packetLossRate = 100 * lostPackets / totalPackets;

fprintf('\n--- LoRa COMMUNICATION RESULTS ---\n');
fprintf('Total Packets: %d\n',totalPackets);
fprintf('Successful Packets: %d\n',successfulPackets);
fprintf('Lost Packets: %d\n',lostPackets);
fprintf('Packet Delivery Rate: %.2f %%\n',deliveryRate);
fprintf('Packet Loss Rate: %.2f %%\n',packetLossRate);

figure('Name','LoRa Communication Performance');
bar([successfulPackets lostPackets]);
xticklabels({'Successful','Lost'});
ylabel('Number of Packets');
title('LoRa Packet Delivery Performance');
grid on;

%% 7. Packet Reception Visualization

figure('Name','LoRa Packet Reception');
stairs(sample,double(received),'LineWidth',1.5);
ylim([-0.2 1.2]);
yticks([0 1]);
yticklabels({'Lost','Received'});
title('LoRa Packet Reception');
xlabel('Sample');
grid on;

%% 8. Communication Failure Safety Mode

pumpSafe = double(soil < 30 & received);

figure('Name','Irrigation Safety Comparison');

stairs(sample,pump,'b','LineWidth',1.5);
hold on;
stairs(sample,pumpSafe,'r--','LineWidth',1.5);

ylim([-0.2 1.2]);
yticks([0 1]);
yticklabels({'OFF','ON'});
title('Normal vs Communication Failure Irrigation');
xlabel('Sample');
ylabel('Pump Status');
legend('Normal Irrigation','Communication Failure Mode');
grid on;

%% 9. Save Results

outputFolder = '../results';

if ~isfolder(outputFolder)
    mkdir(outputFolder);
end

summary = table(avgSoil,avgTemperature,avgHumidity,...
    pumpON,pumpOFF,totalPackets,successfulPackets,...
    lostPackets,deliveryRate,packetLossRate);

writetable(summary,fullfile(outputFolder,'smart_farm_summary.csv'));

figures = findall(0,'Type','figure');

for k = 1:length(figures)
    figure(figures(k));
    saveas(figures(k),fullfile(outputFolder,...
        sprintf('SmartFarm_Figure_%d.png',k)));
end

fprintf('\nAll results saved in the results folder.\n');
fprintf('SMART FARM MATLAB SIMULATION COMPLETED.\n');
