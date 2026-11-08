%% SMART FARM - deprecated entry point
% This file used to be a copy of smart_farm_complete.m (two files with the
% same code drifted apart, and the copy still contained the old single-
% threshold control law). It is now a thin wrapper that simply runs the
% maintained script, so there is only one implementation to keep correct.
%
% Use smart_farm_complete.m directly for new work.

fprintf('NOTE: smarf.m is deprecated - running smart_farm_complete.m instead.\n\n');

scriptDir = fileparts(mfilename('fullpath'));
run(fullfile(scriptDir, 'smart_farm_complete.m'));
