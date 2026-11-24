/**
 * Central configuration for the Smart Farm 3D dashboard.
 *
 * Everything that the presentation may want to change lives here: file
 * locations, control-law defaults, the LoRa modem assumptions (identical to
 * matlab/functions/lora_default_config.m) and the 3D site layout.
 *
 * Coordinates are in metres, Y is up. The farm platform spans
 * x: -55..55, z: -32..32 (1 unit = 1 m).
 */

export const DATA = {
  /** Recorded dataset produced by the existing project pipeline. */
  csvUrl: '../data/sensor_data.csv',
  csvFallbackUrl: '/data/sensor_data.csv',
  /** MATLAB link-budget output, joined to the CSV by sample index. */
  loraTraceUrl: '../results/lora_link_trace.csv',
  /** Used to label the source honestly in the header and footer. */
  label: 'data/sensor_data.csv',
};

export const CONTROL = {
  dryThreshold: 30,   // % -> pump ON below this value
  wetThreshold: 40,   // % -> pump OFF above this value
  maxHoldSamples: 3,  // watchdog for the fail-safe strategy
  mode: 'hold',       // 'hold' | 'failsafe'
  soilMin: 0,
  soilMax: 100,       // values outside this range are invalid (VHDL rule)
  temperatureMin: -20,
  temperatureMax: 60,
  humidityMin: 0,
  humidityMax: 100,
};

export const PLAYBACK = {
  baseIntervalMs: 1200, // one telemetry frame per 1.2 s at 1x
  speeds: [0.5, 1, 2, 4, 8],
  windowSamples: 60,
  packetFlightSeconds: 1.05,
  autoStart: true,
  loop: true,
};

/**
 * LoRa modem assumptions — copied from matlab/functions/lora_default_config.m.
 * These are published Semtech/EU868 values, NOT measurements of our hardware.
 */
export const LORA = {
  region: 'EU868',
  frequencyMHz: 868.1,
  bandwidthKHz: 125,
  spreadingFactor: 7,
  codingRate: 1,          // 1 = 4/5
  preambleSymbols: 8,
  explicitHeader: true,
  payloadCrc: true,
  payloadBytes: 16,
  txPowerDbm: 14,
  txAntennaGainDbi: 0,
  rxAntennaGainDbi: 0,
  cableLossDb: 0,
  receiverNoiseFigureDb: 6,
  implementationLossDb: 1.5,
  snrLimitDb: [-7.5, -10.0, -12.5, -15.0, -17.5, -20.0], // SF7..SF12
  pathLossExponent: 2.8,
  referenceDistanceM: 1,
  dutyCycleLimit: 0.01,
  distanceM: 450,
  gatewayForwardingMs: 25,
};

export const COLORS = {
  soil: '#22d3ee',
  temperature: '#ef4444',
  humidity: '#34d399',
  pump: '#a78bfa',
  dry: '#f59e0b',
  wet: '#22d3ee',
  pdr: '#34d399',
  plr: '#ef4444',
  grid: 'rgba(148, 163, 184, 0.10)',
  tick: '#607a95',
  paper: 'rgba(10, 21, 36, 0.0)',
};

/** 3D site layout — single source of truth for scene + packet paths. */
export const SITE = {
  platform: { width: 110, depth: 64, height: 1.2 },

  zones: [
    { id: 'A', name: 'Field A', crop: 'tomato', center: { x: -28, z: 14 }, size: { x: 20, z: 12 }, node: 'nodeA', soilSensor: { x: -24, z: 17.2 } },
    { id: 'B', name: 'Field B', crop: 'maize', center: { x: -4, z: 14 }, size: { x: 20, z: 12 }, node: 'nodeB', soilSensor: { x: 0.5, z: 17.2 } },
    { id: 'C', name: 'Field C', crop: 'lettuce', center: { x: -28, z: -8 }, size: { x: 20, z: 12 }, node: 'nodeC', soilSensor: { x: -24, z: -4.8 } },
    { id: 'D', name: 'Field D', crop: 'beans', center: { x: -4, z: -8 }, size: { x: 20, z: 12 }, node: 'nodeD', soilSensor: { x: 0.5, z: -4.8 } },
  ],

  tanks: [{ id: 'tank', x: -45, z: 24.5, radius: 3.6, height: 7.5 }],
  pump: { x: -45, z: 16.5 },
  airNode: { x: 14, z: 24 },
  gateway: { x: 30, z: -24, mastHeight: 13.5 },
  server: { x: 22, z: -12 },
  database: { x: 25.2, z: -9.2 },
  station: { x: 38, z: 14, width: 12, depth: 9, height: 5.2 },

  nodes: {
    nodeA: { x: -17.6, z: 12.5, field: 'A' },
    nodeB: { x: 6.6, z: 12.5, field: 'B' },
    nodeC: { x: -17.6, z: -9.5, field: 'C' },
    nodeD: { x: 6.6, z: -9.5, field: 'D' },
  },

  /** Manifold pipe route: pump -> main line -> four field risers. */
  pipes: {
    main: [{ x: -45, z: 15.0 }, { x: -45, z: 6.5 }, { x: 8, z: 6.5 }],
    risers: [
      { x: -30, z: 6.5, toZ: 8.2 },
      { x: 0, z: 6.5, toZ: 8.2 },
      { x: -30, z: 6.5, toZ: -2.2 },
      { x: 0, z: 6.5, toZ: -2.2 },
    ],
  },

  camera: {
    overview: { position: [74, 46, 105], target: [0, 4, 0] },
    fields: { position: [-10, 14, 32], target: [-14, 1, 8] },
    pump: { position: [-32, 8, 26], target: [-45, 3, 21] },
    gateway: { position: [16, 11, -8], target: [30, 8, -24] },
    station: { position: [22, 9, 22], target: [38, 3, 14] },
  },
};

/** Where a telemetry frame starts and which labels it feeds. */
export function zoneById(id) {
  return SITE.zones.find((zone) => zone.id === id) || SITE.zones[0];
}

/** LoRa CSS airtime (Semtech SX1276 formula, see lora_time_on_air.m). */
export function computeTimeOnAir(cfg = LORA) {
  const sf = cfg.spreadingFactor;
  const bw = cfg.bandwidthKHz * 1000;
  const cr = cfg.codingRate;
  const pl = cfg.payloadBytes;
  const ih = cfg.explicitHeader ? 1 : 0;
  const crc = cfg.payloadCrc ? 1 : 0;
  const de = sf >= 11 && cfg.bandwidthKHz === 125 ? 1 : 0;
  const symbolTime = Math.pow(2, sf) / bw;
  const payloadSymbols = 8 + Math.max(
    Math.ceil((8 * pl - 4 * sf + 28 + 16 * crc - 20 * ih) / (4 * (sf - 2 * de))) * (cr + 4),
    0,
  );
  const packetSymbols = cfg.preambleSymbols + 4.25 + payloadSymbols;
  return {
    symbolTimeMs: symbolTime * 1000,
    payloadSymbols,
    packetSymbols,
    timeOnAirMs: packetSymbols * symbolTime * 1000,
    maxPacketsPerHour: (3600 * cfg.dutyCycleLimit) / (packetSymbols * symbolTime),
  };
}
