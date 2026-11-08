function fig = plot_pump_timeline(sample, recordedPump, simulatedPump, outputFile, titleText)
%PLOT_PUMP_TIMELINE Pump command timeline: recorded vs simulated.
%
%   fig = plot_pump_timeline(sample, recordedPump, simulatedPump, outputFile, titleText)
%
%   Compares the pump command stored in the dataset ("Pump" column) with the
%   command produced by the simulated controller. Both signals are digital
%   (0 = OFF, 1 = ON) and are drawn as step ("stair") curves, which is the
%   correct representation for a discrete actuator command.
%
%   Note: this is a SIMULATION. No physical pump is driven by these scripts.

arguments
    sample (:,1) double
    recordedPump (:,1) logical
    simulatedPump (:,1) double
    outputFile (1,1) string
    titleText (1,1) string = "Pump command - recorded vs simulated"
end

fig = figure('Name', 'Pump timeline', 'Color', 'w');
fig.Position = [100 100 1000 420];
layout = tiledlayout(fig, 1, 1, 'TileSpacing', 'compact', 'Padding', 'compact');
ax = nexttile(layout);
hold(ax, 'on');
grid(ax, 'on');
box(ax, 'on');

p1 = stairs(ax, sample, double(recordedPump), '-', ...
    'Color', [0.49 0.18 0.56], 'LineWidth', 2.0);
p2 = stairs(ax, sample, simulatedPump, '--', ...
    'Color', [0.0 0.60 0.30], 'LineWidth', 1.8);

ylim(ax, [-0.25 1.25]);
yticks(ax, [0 1]);
yticklabels(ax, {'OFF', 'ON'});
xlim(ax, [min(sample) max(sample)]);
xlabel(ax, 'Sample index', 'FontWeight', 'bold');
ylabel(ax, 'Simulated pump command', 'FontWeight', 'bold');
title(ax, char(titleText), 'FontWeight', 'bold');
legend(ax, [p1 p2], {'Recorded pump (dataset)', 'Simulated pump (control law)'}, ...
    'Location', 'best');

text(ax, min(sample), 1.12, sprintf('ON in %d of %d samples (recorded)', ...
    sum(recordedPump), numel(recordedPump)), 'FontSize', 9, 'Color', [0.3 0.3 0.3]);
text(ax, min(sample), 1.02, sprintf('ON in %d of %d samples (simulated)', ...
    sum(simulatedPump == 1), numel(simulatedPump)), 'FontSize', 9, 'Color', [0.1 0.45 0.2]);

folder = fileparts(outputFile);
if ~isempty(folder) && ~isfolder(folder)
    mkdir(folder);
end
exportgraphics(fig, outputFile, 'Resolution', 150, 'BackgroundColor', 'white');
fprintf('  saved figure: %s\n', outputFile);
end
