/**
 * Frame parser shared by the live transports (Web Serial and MQTT).
 *
 * Accepted line formats — one frame per line:
 *   {"soil": 31.2, "temperature": 23.4, "humidity": 55.1, "packet_received": true}
 *   {"SoilMoisture": 31.2, "Temperature": 23.4, "AirHumidity": 55.1}
 *   31.2,23.4,55.1,1        (soil, temperature, humidity, packet_received)
 *   31.2 23.4 55.1 1
 *
 * Keys are normalised exactly like the CSV header (units and punctuation
 * removed), so an ESP32 firmware can print the same names as the dataset.
 */

import { normalizeHeader, parseBoolean } from './csv.js';

const KEY_ALIASES = {
  sample: ['sample', 'index', 'frame', 'id'],
  soil: ['soilmoisture', 'soil', 'moisture'],
  temperature: ['temperature', 'airtemperature', 'temp'],
  humidity: ['airhumidity', 'humidity', 'rh', 'relativehumidity'],
  received: ['packetreceived', 'received', 'packetok', 'delivered'],
  pump: ['pump', 'pumpstate', 'pumpcommand'],
  mlAdvice: ['mladvice', 'advice', 'ml'],
};

function pick(object, key) {
  const aliases = KEY_ALIASES[key] || [key];
  for (const [rawKey, value] of Object.entries(object)) {
    if (aliases.includes(normalizeHeader(rawKey))) return value;
  }
  return undefined;
}

function toNumber(value) {
  const num = Number(String(value == null ? '' : value).trim().replace(',', '.'));
  return Number.isFinite(num) ? num : NaN;
}

let counter = 0;

/**
 * @returns {object|null} a row shaped like the CSV rows, or null if the line
 *   does not contain a usable frame.
 */
export function parseFrameLine(line, options = {}) {
  const text = String(line || '').trim();
  if (!text) return null;

  let payload = null;
  let order = null;

  if (text.startsWith('{')) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      return null;
    }
  } else {
    // plain values: accept comma, semicolon or whitespace separators
    const parts = text.split(/[,;\s]+/).filter(Boolean);
    if (parts.length < 3) return null;
    order = parts;
  }

  const soil = payload ? toNumber(pick(payload, 'soil')) : toNumber(order[0]);
  const temperature = payload ? toNumber(pick(payload, 'temperature')) : toNumber(order[1]);
  const humidity = payload ? toNumber(pick(payload, 'humidity')) : toNumber(order[2]);
  const rawReceived = payload ? pick(payload, 'received') : order[3];
  const received = rawReceived === undefined ? true : (parseBoolean(rawReceived) ?? true);
  const rawPump = payload ? pick(payload, 'pump') : undefined;
  const recordedPump = rawPump === undefined ? null : parseBoolean(rawPump);
  const rawSample = payload ? pick(payload, 'sample') : undefined;
  const mlAdvice = payload ? (pick(payload, 'mlAdvice') || '') : '';

  let invalidReason = null;
  if (!Number.isFinite(soil)) invalidReason = 'soil value is not numeric';
  else if (soil < 0 || soil > 100) invalidReason = `soil ${soil.toFixed(1)} % is outside 0…100 %`;
  else if (!Number.isFinite(temperature)) invalidReason = 'temperature value is not numeric';
  else if (!Number.isFinite(humidity)) invalidReason = 'humidity value is not numeric';

  counter += 1;

  return {
    index: counter - 1,
    sample: Number.isFinite(toNumber(rawSample)) ? toNumber(rawSample) : counter,
    soil,
    temperature,
    humidity,
    received,
    recordedPump,
    mlAdvice: String(mlAdvice),
    valid: invalidReason === null,
    invalidReason,
    source: options.source || 'live input',
    measured: true,
  };
}

/** Reset the internal sample counter (used when a transport reconnects). */
export function resetFrameCounter() {
  counter = 0;
}
