function fig = plot_packet_reception(sample, received, outputFile)
%PLOT_PACKET_RECEPTION Reception status strip for the simulated LoRa link.
%
%   fig = plot_packet_reception(sample, received, outputFile)
%
%   Displays one bar per sample: green = packet delivered, red = packet lost.
%   The link is a software model; no radio transmission takes place.

arguments
    sample (:,1) double
    received (:,1) logical
    outputFile (1,1) string
end

received = logical(received(:));
n = numel(received);

fig = figure('Name', 'Packet reception', 'Color', 'w');
fig.Position = [100 100 1000 320];
layout = tiledlayout(fig, 1, 1, 'TileSpacing', 'compact', 'Padding', 'compact');
ax = nexttile(layout);
hold(ax, 'on');
grid(ax, 'on');
box(ax, 'on');

bars = bar(ax, sample, double(received), 1.0, 'FaceColor', 'flat', 'EdgeColor', 'none');
colours = repmat([0.15 0.68 0.38], n, 1);
colours(~received, :) = repmat([0.86 0.20 0.18], sum(~received), 1);
bars.CData = colours;

ylim(ax, [-0.1 1.15]);
yticks(ax, [0 1]);
yticklabels(ax, {'Lost', 'Received'});
xlim(ax, [min(sample) - 0.5, max(sample) + 0.5]);
xlabel(ax, 'Sample index (one sample = one LoRa packet)', 'FontWeight', 'bold');
ylabel(ax, 'Packet status', 'FontWeight', 'bold');
title(ax, sprintf('Simulated LoRa packet reception: %d received, %d lost (PDR %.2f %%)', ...
    sum(received), n - sum(received), 100 * mean(received)), 'FontWeight', 'bold');

% Legend keys (patches) for the two states.
hOk = patch(ax, NaN, NaN, [0.15 0.68 0.38], 'EdgeColor', 'none');
hLost = patch(ax, NaN, NaN, [0.86 0.20 0.18], 'EdgeColor', 'none');
legend(ax, [hOk hLost], {'Packet delivered', 'Packet lost'}, 'Location', 'northeast');

if any(~received)
    lostX = sample(~received);
    text(ax, lostX, 1.06 * ones(size(lostX)), 'x', ...
        'Color', [0.86 0.20 0.18], 'FontSize', 10, ...
        'HorizontalAlignment', 'center', 'FontWeight', 'bold');
end

folder = fileparts(outputFile);
if ~isempty(folder) && ~isfolder(folder)
    mkdir(folder);
end
exportgraphics(fig, outputFile, 'Resolution', 150, 'BackgroundColor', 'white');
fprintf('  saved figure: %s\n', outputFile);
end
