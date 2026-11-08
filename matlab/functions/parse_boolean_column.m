function [flags, unparsable] = parse_boolean_column(values)
%PARSE_BOOLEAN_COLUMN Convert a mixed True/False column into a logical vector.
%
%   The Smart Farm dataset (data/sensor_data.csv) stores the LoRa reception
%   flag as the TEXT tokens "True" / "False". Depending on the import method,
%   MATLAB may hand that column back as a string array, a cell array of
%   character vectors, a logical array or a numeric array (0/1). All of those
%   representations are accepted here, so the analysis never depends on how
%   the CSV happened to be imported.
%
%   [flags, unparsable] = parse_boolean_column(values)
%
%   Inputs
%     values      logical | numeric | string | cellstr column, length n
%
%   Outputs
%     flags       n-by-1 logical vector (unknown/missing entries -> false)
%     unparsable  number of entries that could not be interpreted
%
%   Accepted TRUE  tokens : true, 1, 1.0, yes, y, on, received, ok
%   Accepted FALSE tokens : false, 0, 0.0, no, n, off, lost
%   Any other entry (e.g. "", "MAYBE", missing) counts as unparsable and is
%   mapped to false so that downstream code always receives a valid logical.

if islogical(values)
    flags = values(:);
    unparsable = 0;
    return
end

if isnumeric(values)
    column = double(values(:));
    unparsable = sum(isnan(column));
    flags = column ~= 0;
    flags(isnan(column)) = false;
    return
end

text = lower(strtrim(string(values)));
text = text(:);

trueTokens  = ["true", "1", "1.0", "yes", "y", "on", "received", "ok"];
falseTokens = ["false", "0", "0.0", "no", "n", "off", "lost"];

isTrue  = ismember(text, trueTokens);
isFalse = ismember(text, falseTokens);

flags = isTrue;
unparsable = sum(~(isTrue | isFalse));
end
