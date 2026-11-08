function fig = plot_irrigation_comparison(sample, soil, pumps, labels, dryThreshold, ...
    wetThreshold, titleText, outputFile, options)
%PLOT_IRRIGATION_COMPARISON Compare several simulated irrigation strategies.
%
%   fig = plot_irrigation_comparison(sample, soil, pumps, labels, dryThreshold, ...
%                                    wetThreshold, titleText, outputFile)
%
%   Top panel : soil moisture with the two thresholds (context for the
%               decisions below).
%   Bottom    : pump commands of every strategy as a step curve, so the
%               effect of hysteresis / communication handling is visible.
%
%   Inputs
%     pumps    n-by-m matrix of pump commands (0 = OFF, 1 = ON), one column
%              per strategy
%     labels   1-by-m string array with the strategy names
%
%   Simulation only: no physical pump or valve is actuated.

arguments
    sample (:,1) double
    soil (:,1) double
    pumps (:,:) double
    labels (1,:) string
    dryThreshold (1,1) double
    wetThreshold (1,1) double
    titleText (1,1) string
    outputFile (1,1) string
    options.OutageWindow (1,2) double = [NaN NaN]
end

if size(pumps, 1) ~= numel(sample)
    error('plot_irrigation_comparison:sizeMismatch', ...
        'pumps has %d rows but sample has %d elements.', size(pumps, 1), numel(sample));
end
if size(pumps, 2) ~= numel(labels)
    error('plot_irrigation_comparison:labelMismatch', ...
        '%d strategies but %d labels.', size(pumps, 2), numel(labels));
end

colours = [0.55 0.55 0.55; 0.00 0.45 0.74; 0.49 0.18 0.56; 0.85 0.33 0.10];
lineStyles = {'-', '--', ':', '-.'};
lineWidths = [2.8, 1.7, 1.7, 1.4];

fig = figure('Name', char(titleText), 'Color', 'w');
fig.Position = [80 80 1150 760];
layout = tiledlayout(fig, 2, 1, 'TileSpacing', 'compact', 'Padding', 'loose');

% --- Soil moisture context ------------------------------------------------
ax1 = nexttile(layout);
hold(ax1, 'on');
grid(ax1, 'on');
box(ax1, 'on');
plot(ax1, sample, soil, '-', 'Color', [0 0.4470 0.7410], 'LineWidth', 1.4);
yline(ax1, dryThreshold, '--', sprintf('Dry %g %%', dryThreshold), ...
    'Color', [0.85 0.33 0.10], 'LineWidth', 1.2, 'LabelHorizontalAlignment', 'left');
yline(ax1, wetThreshold, '--', sprintf('Wet %g %%', wetThreshold), ...
    'Color', [0.0 0.60 0.30], 'LineWidth', 1.2, 'LabelHorizontalAlignment', 'right');
xlabel(ax1, 'Sample index', 'FontWeight', 'bold');
ylabel(ax1, 'Soil moisture (%)', 'FontWeight', 'bold');
title(ax1, 'Recorded soil moisture and irrigation thresholds', 'FontWeight', 'bold');
xlim(ax1, [min(sample) max(sample)]);

% --- Pump commands of every strategy -------------------------------------
ax2 = nexttile(layout);
hold(ax2, 'on');
grid(ax2, 'on');
box(ax2, 'on');

handles = gobjects(size(pumps, 2), 1);
for k = 1:size(pumps, 2)
    handles(k) = stairs(ax2, sample, pumps(:, k), lineStyles{mod(k - 1, numel(lineStyles)) + 1}, ...
        'Color', colours(mod(k - 1, size(colours, 1)) + 1, :), ...
        'LineWidth', lineWidths(mod(k - 1, numel(lineWidths)) + 1));
end

ylim(ax2, [-0.25 1.35]);
yticks(ax2, [0 1]);
yticklabels(ax2, {'OFF', 'ON'});
xlim(ax2, [min(sample) max(sample)]);
xlabel(ax2, 'Sample index', 'FontWeight', 'bold');
ylabel(ax2, 'Simulated pump command', 'FontWeight', 'bold');
title(ax2, 'Pump command per strategy', 'FontWeight', 'bold');

legendLabels = cell(1, size(pumps, 2));
for k = 1:size(pumps, 2)
    legendLabels{k} = sprintf('%s (ON in %d samples)', labels(k), sum(pumps(:, k) == 1));
end
legend(ax2, handles, legendLabels, 'Location', 'southoutside', ...
    'Orientation', 'horizontal', 'NumColumns', 2);

% --- Optional shaded outage window (communication-failure stress test) ----
if ~any(isnan(options.OutageWindow))
    x0 = options.OutageWindow(1);
    x1 = options.OutageWindow(2);
    for ax = [ax1 ax2]
        yl = ylim(ax);
        patch(ax, [x0 x1 x1 x0], [yl(1) yl(1) yl(2) yl(2)], [0.85 0.20 0.18], ...
            'FaceAlpha', 0.10, 'EdgeColor', [0.85 0.20 0.18], 'LineStyle', '--', ...
            'HandleVisibility', 'off');
        ylim(ax, yl);
    end
    text(ax1, mean([x0 x1]), max(soil), 'link outage (synthetic)', ...
        'HorizontalAlignment', 'center', 'VerticalAlignment', 'bottom', ...
        'Color', [0.70 0.15 0.12], 'FontWeight', 'bold', 'FontSize', 9);
end

title(layout, char(titleText), 'FontWeight', 'bold');

folder = fileparts(outputFile);
if ~isempty(folder) && ~isfolder(folder)
    mkdir(folder);
end
exportgraphics(fig, outputFile, 'Resolution', 150, 'BackgroundColor', 'white');
fprintf('  saved figure: %s\n', outputFile);
end
