function fig = plot_packet_performance(stats, targetPercent, outputFile)
%PLOT_PACKET_PERFORMANCE Communication performance summary.
%
%   fig = plot_packet_performance(stats, targetPercent, outputFile)
%
%   Left  panel: delivered vs lost packet counts.
%   Right panel: cumulative Packet Delivery Ratio during the run, with the
%                intended delivery target drawn for reference.
%
%   'stats' is the struct returned by PACKET_STATISTICS.

arguments
    stats struct
    targetPercent (1,1) double {mustBePositive}
    outputFile (1,1) string
end

fig = figure('Name', 'Packet performance', 'Color', 'w');
fig.Position = [100 100 1100 420];
layout = tiledlayout(fig, 1, 2, 'TileSpacing', 'compact', 'Padding', 'compact');

% --- Panel 1: received vs lost -------------------------------------------
ax1 = nexttile(layout);
b = bar(ax1, [stats.receivedCount, stats.lostCount], 0.55, 'FaceColor', 'flat', ...
    'EdgeColor', 'none');
b.CData = [0.15 0.68 0.38; 0.86 0.20 0.18];
grid(ax1, 'on');
box(ax1, 'on');
xticks(ax1, [1 2]);
xticklabels(ax1, {'Delivered', 'Lost'});
ylabel(ax1, 'Number of packets', 'FontWeight', 'bold');
title(ax1, sprintf('Packet counts (total = %d)', stats.total), 'FontWeight', 'bold');
for k = 1:2
    text(ax1, k, b.YData(k) + 0.03 * max(b.YData), sprintf('%d', b.YData(k)), ...
        'HorizontalAlignment', 'center', 'FontWeight', 'bold');
end
ylim(ax1, [0, max(b.YData) * 1.25 + 0.5]);

% --- Panel 2: cumulative PDR ---------------------------------------------
ax2 = nexttile(layout);
plot(ax2, 1:stats.total, stats.cumulativePdr, '-', ...
    'Color', [0 0.4470 0.7410], 'LineWidth', 1.8);
hold(ax2, 'on');
grid(ax2, 'on');
box(ax2, 'on');
yline(ax2, targetPercent, '--', sprintf('Target %.0f %%', targetPercent), ...
    'Color', [0.85 0.33 0.10], 'LineWidth', 1.3);
xlabel(ax2, 'Packet index', 'FontWeight', 'bold');
ylabel(ax2, 'Cumulative PDR (%)', 'FontWeight', 'bold');
title(ax2, sprintf('Cumulative delivery ratio (final %.2f %%)', ...
    stats.cumulativePdr(end)), 'FontWeight', 'bold');
ylim(ax2, [max(0, min(stats.cumulativePdr) - 5), 101]);
xlim(ax2, [1 stats.total]);

title(layout, sprintf(['Communication performance - PDR %.4f %%, PLR %.4f %%, ' ...
    'longest outage %d packet(s)'], stats.pdrPercent, stats.plrPercent, ...
    stats.longestOutage), 'FontWeight', 'bold');

folder = fileparts(outputFile);
if ~isempty(folder) && ~isfolder(folder)
    mkdir(folder);
end
exportgraphics(fig, outputFile, 'Resolution', 150, 'BackgroundColor', 'white');
fprintf('  saved figure: %s\n', outputFile);
end
