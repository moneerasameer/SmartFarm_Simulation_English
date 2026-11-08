function fig = plot_sensor_series(sample, values, unit, titleText, outputFile, options)
%PLOT_SENSOR_SERIES Professional single-parameter trend figure.
%
%   fig = plot_sensor_series(sample, values, unit, titleText, outputFile, Name=Value,...)
%
%   Draws one measured parameter against the sample index with a marker line,
%   the mean value, optional irrigation thresholds and (optionally) markers on
%   the samples whose packet was lost, then exports the figure as a PNG.
%
%   Name-Value options
%     Color           line colour (default blue)
%     DryThreshold    draw a dashed line (optional)
%     WetThreshold    draw a dashed line (optional)
%     LostMask        logical vector; true = mark the sample as "packet lost"
%     ShowMean        draw the mean line (default true)

arguments
    sample (:,1) double
    values (:,1) double
    unit (1,1) string
    titleText (1,1) string
    outputFile (1,1) string
    options.Color (1,3) double = [0 0.4470 0.7410]
    options.DryThreshold double = []
    options.WetThreshold double = []
    options.LostMask logical = logical([])
    options.ShowMean (1,1) logical = true
end

fig = figure('Name', char(titleText), 'Color', 'w');
fig.Position = [100 100 1000 460];
layout = tiledlayout(fig, 1, 1, 'TileSpacing', 'compact', 'Padding', 'compact');
ax = nexttile(layout);
hold(ax, 'on');
grid(ax, 'on');
box(ax, 'on');

hLine = plot(ax, sample, values, '-o', ...
    'Color', options.Color, 'LineWidth', 1.4, 'MarkerSize', 4, ...
    'MarkerFaceColor', 'w', 'DisplayName', char(titleText));

legendEntries = {char(titleText)};
legendHandles = hLine;

if options.ShowMean
    meanValue = mean(values);
    hMean = yline(ax, meanValue, '-.', ...
        sprintf('Mean %.2f %s', meanValue, unit), ...
        'Color', [0.4 0.4 0.4], 'LineWidth', 1.1, ...
        'LabelHorizontalAlignment', 'left');
    legendHandles(end + 1) = hMean; %#ok<AGROW>
    legendEntries{end + 1} = sprintf('Mean %.2f %s', meanValue, unit); %#ok<AGROW>
end

if ~isempty(options.DryThreshold)
    hDry = yline(ax, options.DryThreshold, '--', ...
        sprintf('Dry threshold %g %s', options.DryThreshold, unit), ...
        'Color', [0.85 0.33 0.10], 'LineWidth', 1.3, ...
        'LabelHorizontalAlignment', 'left');
    legendHandles(end + 1) = hDry; %#ok<AGROW>
    legendEntries{end + 1} = sprintf('Dry threshold %g %s', options.DryThreshold, unit); %#ok<AGROW>
end

if ~isempty(options.WetThreshold)
    hWet = yline(ax, options.WetThreshold, '--', ...
        sprintf('Wet threshold %g %s', options.WetThreshold, unit), ...
        'Color', [0.0 0.60 0.30], 'LineWidth', 1.3, ...
        'LabelHorizontalAlignment', 'right');
    legendHandles(end + 1) = hWet; %#ok<AGROW>
    legendEntries{end + 1} = sprintf('Wet threshold %g %s', options.WetThreshold, unit); %#ok<AGROW>
end

if ~isempty(options.LostMask) && numel(options.LostMask) == numel(sample)
    lostMask = logical(options.LostMask(:));
    if any(lostMask)
        hLost = plot(ax, sample(lostMask), values(lostMask), 'x', ...
            'Color', [0.85 0.10 0.10], 'LineWidth', 1.6, 'MarkerSize', 9, ...
            'DisplayName', 'Packet lost');
        legendHandles(end + 1) = hLost; %#ok<AGROW>
        legendEntries{end + 1} = 'Packet lost'; %#ok<AGROW>
    end
end

xlabel(ax, 'Sample index', 'FontWeight', 'bold');
ylabel(ax, sprintf('%s (%s)', titleText, unit), 'FontWeight', 'bold');
title(ax, sprintf('%s - simulated sensor readings (%d samples)', titleText, numel(values)), ...
    'FontWeight', 'bold');
legend(ax, legendHandles, legendEntries, 'Location', 'best');
xlim(ax, [min(sample) max(sample)]);

export_figure(fig, outputFile);
end

function export_figure(fig, outputFile)
%EXPORT_FIGURE Write the figure to disk at print resolution.
folder = fileparts(outputFile);
if ~isempty(folder) && ~isfolder(folder)
    mkdir(folder);
end
exportgraphics(fig, outputFile, 'Resolution', 150, 'BackgroundColor', 'white');
fprintf('  saved figure: %s\n', outputFile);
end
