/**
 * CSV loading and validation.
 *
 * The parser accepts the recorded dataset of this project
 * (`Sample, Soil moisture (%), Temperature (°C), Air humidity (%),
 *   Packet received, Pump, ML advice`) as well as the simplified header used
 * in the brief (`Sample, SoilMoisture, Temperature, AirHumidity,
 * PacketReceived, Pump, MLAdvice`). Headers are normalised by removing units
 * and punctuation, so both forms map to the same fields.
 */

export class CsvError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'CsvError';
    this.details = details || null;
  }
}

const HEADER_ALIASES = {
  sample: ['sample', 'index', 'frame', 'id', 'timestamp', 'time'],
  soil: ['soilmoisture', 'soil', 'moisture', 'soilhumidity'],
  temperature: ['temperature', 'airtemperature', 'temp'],
  humidity: ['airhumidity', 'humidity', 'relativehumidity', 'rh'],
  received: ['packetreceived', 'received', 'packetok', 'delivered', 'packetsuccess'],
  pump: ['pump', 'pumpstate', 'pumpstatus', 'pumpcommand'],
  mlAdvice: ['mladvice', 'advice', 'ml', 'recommendation'],
};

const TRUTHY = new Set(['true', '1', 'yes', 'y', 'on', 'received', 'ok', 'delivered', 'high']);
const FALSY = new Set(['false', '0', 'no', 'n', 'off', 'lost', 'missing', 'low', '']);

export function normalizeHeader(header) {
  return String(header)
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const token = String(value == null ? '' : value).trim().toLowerCase();
  if (TRUTHY.has(token)) return true;
  if (FALSY.has(token)) return false;
  return null;
}

/** Split one CSV line into fields, honouring double quotes. */
export function splitCsvLine(line) {
  const fields = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i += 1; }
        else quoted = false;
      } else current += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function toNumber(value) {
  if (value == null) return NaN;
  const cleaned = String(value).trim().replace(/\s+/g, '');
  if (cleaned === '') return NaN;
  const num = Number(cleaned.replace(',', '.'));
  return Number.isFinite(num) ? num : NaN;
}

function resolveColumns(headerCells) {
  const normalized = headerCells.map(normalizeHeader);
  const map = {};
  Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => {
    const index = normalized.findIndex((cell) => aliases.includes(cell));
    if (index >= 0) map[key] = index;
  });
  return { map, normalized };
}

/**
 * Parse the main sensor dataset.
 * @returns {{rows: Array, columns: Object, totalRows: number, keyword: string}}
 */
export function parseSensorCsv(text, sourceLabel = 'sensor_data.csv') {
  if (!text || !String(text).trim()) {
    throw new CsvError(`The file “${sourceLabel}” is empty.`);
  }
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) {
    throw new CsvError(`The file “${sourceLabel}” has a header but no data rows.`);
  }

  const headerCells = splitCsvLine(lines[0]);
  const { map, normalized } = resolveColumns(headerCells);
  const missing = ['soil', 'temperature', 'humidity'].filter((key) => map[key] === undefined);
  if (missing.length > 0) {
    throw new CsvError(
      `The dataset is missing required column(s): ${missing.join(', ')}.`,
      { header: headerCells, normalised: normalized, expected: Object.keys(HEADER_ALIASES) },
    );
  }

  const receivedAssumed = map.received === undefined;
  const pumpAssumed = map.pump === undefined;
  const warnings = [];
  if (receivedAssumed) warnings.push('No “Packet received” column: every valid frame is treated as delivered.');
  if (pumpAssumed) warnings.push('No “Pump” column: the recorded pump state is not available for comparison.');

  const rows = [];
  let invalidCount = 0;

  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]);
    if (cells.every((cell) => String(cell).trim() === '')) continue;

    const soil = toNumber(cells[map.soil]);
    const temperature = toNumber(cells[map.temperature]);
    const humidity = toNumber(cells[map.humidity]);
    const rawReceived = map.received === undefined ? true : parseBoolean(cells[map.received]);
    const received = rawReceived === null ? false : rawReceived;
    const recordedPump = map.pump === undefined ? null : parseBoolean(cells[map.pump]);
    const sample = map.sample === undefined ? rows.length : toNumber(cells[map.sample]);
    const mlAdvice = map.mlAdvice === undefined ? '' : String(cells[map.mlAdvice] || '').trim();

    let invalidReason = null;
    if (!Number.isFinite(soil)) invalidReason = 'soil value is not numeric';
    else if (soil < 0 || soil > 100) invalidReason = `soil ${soil.toFixed(1)} % is outside 0…100 %`;
    else if (!Number.isFinite(temperature)) invalidReason = 'temperature value is not numeric';
    else if (!Number.isFinite(humidity)) invalidReason = 'humidity value is not numeric';

    if (invalidReason) invalidCount += 1;

    rows.push({
      index: rows.length,
      sample: Number.isFinite(sample) ? sample : rows.length,
      soil,
      temperature,
      humidity,
      received,
      recordedPump,
      mlAdvice,
      valid: invalidReason === null,
      invalidReason,
      source: sourceLabel,
    });
  }

  if (rows.length === 0) {
    throw new CsvError(`The file “${sourceLabel}” contains no usable data rows.`);
  }

  if (invalidCount > 0) warnings.push(`${invalidCount} frame(s) failed range validation and are treated like lost telemetry.`);

  return {
    rows,
    totalRows: rows.length,
    warnings,
    keyword: sourceLabel,
    columns: {
      header: headerCells,
      map,
      hasReceived: !receivedAssumed,
      hasPump: !pumpAssumed,
      hasMlAdvice: map.mlAdvice !== undefined,
    },
  };
}

/** Parse the MATLAB LoRa link-budget trace (`results/lora_link_trace.csv`). */
export function parseLoraTrace(text) {
  const result = new Map();
  if (!text || !String(text).trim()) return result;
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) return result;
  const header = splitCsvLine(lines[0]).map(normalizeHeader);
  const col = (names) => header.findIndex((cell) => names.includes(cell));
  const idx = {
    sample: col(['sample', 'index']),
    distance: col(['distancem', 'distance']),
    rssi: col(['rxpowerdbm', 'rssi', 'rxpower']),
    snr: col(['snrdb', 'snr']),
    margin: col(['linkmargin', 'linkmargindb', 'margin']),
    per: col(['packeterrorprobability', 'per']),
    received: col(['received', 'packetreceived']),
  };
  if (idx.sample < 0) return result;

  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]);
    const sample = toNumber(cells[idx.sample]);
    if (!Number.isFinite(sample)) continue;
    result.set(sample, {
      distanceM: idx.distance >= 0 ? toNumber(cells[idx.distance]) : NaN,
      rssiDbm: idx.rssi >= 0 ? toNumber(cells[idx.rssi]) : NaN,
      snrDb: idx.snr >= 0 ? toNumber(cells[idx.snr]) : NaN,
      marginDb: idx.margin >= 0 ? toNumber(cells[idx.margin]) : NaN,
      packetErrorProbability: idx.per >= 0 ? toNumber(cells[idx.per]) : NaN,
      received: idx.received >= 0 ? parseBoolean(cells[idx.received]) : null,
    });
  }
  return result;
}

/** Fetch a text asset with a helpful error when the page is opened via file://. */
export async function fetchText(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return await response.text();
  } catch (error) {
    if (window.location.protocol === 'file:') {
      throw new CsvError(
        'The CSV cannot be fetched from a file:// page. Start the dashboard with ' +
        './web3d/run_web.sh (or python3 -m http.server 8080) and open http://localhost:8080/web3d/. ' +
        'You can also load the CSV manually with “Load CSV…”.',
        { cause: String(error) },
      );
    }
    throw new CsvError(`Could not load ${url}. ${error.message}`, { cause: String(error) });
  }
}
