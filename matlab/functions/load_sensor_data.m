function [data, info] = load_sensor_data(csvFile)
%LOAD_SENSOR_DATA Read and validate the Smart Farm sensor dataset.
%
%   [data, info] = load_sensor_data(csvFile)
%
%   Reads the recorded dataset produced by the project pipeline. Column names
%   are matched case-insensitively and ignoring spaces/punctuation, so the
%   loader works with the exact CSV header:
%
%     Sample, Soil moisture (%), Temperature (C), Air humidity (%),
%     Packet received, Pump, ML advice
%
%   "Packet received" is stored as the text tokens "True"/"False" and is
%   converted through PARSE_BOOLEAN_COLUMN; "Pump" is stored as "ON"/"OFF".
%
%   Outputs
%     data : struct with fields (all n-by-1, sorted by sample index)
%              sample, soil, temperature, humidity  (double)
%              received, pumpRecorded               (logical)
%              mlAdvice                             (string)
%              n                                    (number of usable rows)
%     info : struct describing the file and every validation action taken,
%            so the caller can report data quality instead of hiding it.

arguments
    csvFile (1,1) string
end

if ~isfile(csvFile)
    error('load_sensor_data:fileNotFound', ...
        'Sensor dataset not found:\n  %s', csvFile);
end

importOptions = detectImportOptions(csvFile);
importOptions.VariableNamingRule = 'preserve';
raw = readtable(csvFile, importOptions);

names = string(raw.Properties.VariableNames);

sampleIdx      = local_find_column(names, "sample");
soilIdx        = local_find_column(names, "soilmoisture");
temperatureIdx = local_find_column(names, "temperature");
humidityIdx    = local_find_column(names, "airhumidity");
receivedIdx    = local_find_column(names, "packetreceived");
pumpIdx        = local_find_column(names, "pump");
adviceIdx      = local_find_column(names, "mladvice");

sample      = local_to_double(raw{:, sampleIdx});
soil        = local_to_double(raw{:, soilIdx});
temperature = local_to_double(raw{:, temperatureIdx});
humidity    = local_to_double(raw{:, humidityIdx});

[received, unparsableReceived] = parse_boolean_column(raw{:, receivedIdx});
[pumpRecorded, unparsablePump] = parse_boolean_column(raw{:, pumpIdx});
mlAdvice = string(raw{:, adviceIdx});

rowsRead = height(raw);

valid = ~isnan(sample) & ~isnan(soil) & ~isnan(temperature) & ~isnan(humidity);
rowsDropped = sum(~valid);
if ~any(valid)
    error('load_sensor_data:noUsableRows', ...
        'No usable row remains after validation (%d read).', rowsRead);
end

sample = sample(valid);
soil = soil(valid);
temperature = temperature(valid);
humidity = humidity(valid);
received = received(valid);
pumpRecorded = pumpRecorded(valid);
mlAdvice = mlAdvice(valid);

[~, firstOccurrence] = unique(sample, 'first');
duplicatesRemoved = numel(sample) - numel(firstOccurrence);
keep = false(size(sample));
keep(firstOccurrence) = true;

sample = sample(keep);
soil = soil(keep);
temperature = temperature(keep);
humidity = humidity(keep);
received = received(keep);
pumpRecorded = pumpRecorded(keep);
mlAdvice = mlAdvice(keep);

[sample, order] = sort(sample);
soil = soil(order);
temperature = temperature(order);
humidity = humidity(order);
received = received(order);
pumpRecorded = pumpRecorded(order);
mlAdvice = mlAdvice(order);

data = struct( ...
    'sample', sample, ...
    'soil', soil, ...
    'temperature', temperature, ...
    'humidity', humidity, ...
    'received', received, ...
    'pumpRecorded', pumpRecorded, ...
    'mlAdvice', mlAdvice, ...
    'n', numel(sample));

info = struct( ...
    'file', csvFile, ...
    'columnsFound', strjoin(names, ' | '), ...
    'rowsRead', rowsRead, ...
    'rowsUsed', numel(sample), ...
    'rowsDropped', rowsDropped, ...
    'duplicatesRemoved', duplicatesRemoved, ...
    'unparsableReceived', unparsableReceived, ...
    'unparsablePump', unparsablePump, ...
    'firstSample', min(sample), ...
    'lastSample', max(sample));
end

% ---------------------------------------------------------------------------
% Local helpers
% ---------------------------------------------------------------------------
function index = local_find_column(names, key)
%LOCAL_FIND_COLUMN Locate a column by a punctuation-insensitive key.

normalised = lower(regexprep(names, '[^A-Za-z0-9]', ''));

match = find(startsWith(normalised, key), 1, 'first');
if isempty(match)
    match = find(contains(normalised, key), 1, 'first');
end
if isempty(match)
    error('load_sensor_data:missingColumn', ...
        'Required column "%s" not found. Available columns:\n  %s', ...
        key, strjoin(names, ', '));
end
index = match;
end

function values = local_to_double(column)
%LOCAL_TO_DOUBLE Convert a numeric or text column to double (NaN if unknown).

if isnumeric(column)
    values = double(column(:));
else
    values = str2double(string(column(:)));
end
end
