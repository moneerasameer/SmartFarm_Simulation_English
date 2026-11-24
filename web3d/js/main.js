/**
 * Smart Farm 3D — application entry point.
 *
 * Responsibilities
 *  • boot the Three.js world, the panels and the charts;
 *  • load the recorded dataset + MATLAB LoRa trace;
 *  • replay frames through the irrigation controller and the link model;
 *  • drive the packet animation, charts, alerts and diagnostics;
 *  • switch between CSV replay, Web Serial (ESP32) and MQTT transports.
 */

import { CONTROL, PLAYBACK, SITE, DATA } from './config.js';
import { fetchText, parseSensorCsv, parseLoraTrace, CsvError } from './data/csv.js';
import { IrrigationController } from './logic/irrigation.js';
import { LinkStats, signalState, modelLatencyMs, TIME_ON_AIR } from './logic/lora.js';
import { AlertCenter } from './logic/alerts.js';
import { createWorld } from './scene/world.js';
import { PacketAnimator } from './scene/packets.js';
import { DashboardPanels } from './ui/panels.js';
import { Charts } from './ui/charts.js';
import { PacketView } from './ui/packet-view.js';
import { AlertView } from './ui/alert-view.js';
import { Diagnostics } from './ui/diagnostics.js';
import { PresentationView } from './ui/presentation-view.js';
import { PresentationController } from './presentation/controller.js';
import { SerialSource } from './data/serial.js';
import { MqttSource } from './data/mqtt.js';

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ */
/* Runtime state                                                       */
/* ------------------------------------------------------------------ */
const state = {
  rows: [],
  trace: new Map(),
  columns: null,
  datasetLabel: '',
  source: 'csv',
  origin: 'simulated',
  transportLabel: 'CSV replay',
  index: -1,
  liveCount: 0,
  playing: false,
  speed: 1,
  loop: PLAYBACK.loop,
  timer: null,
  history: [],
  clock: 0,
  lastFrame: null,
  lastDecision: null,
  lastLora: null,
  lastSignal: null,
  lastLatency: 0,
  lastZoneId: 'A',
  agreement: null,
  booted: false,
};

const runtimeErrors = [];
let fatalShown = false;

let world = null;
let panels = null;
let charts = null;
let packetView = null;
let alertView = null;
let alerts = null;
let animator = null;
let diagnostics = null;
let controller = null;
let stats = new LinkStats();
let presentation = null;
let presentationView = null;
let serialSource = null;
let mqttSource = null;

/* ------------------------------------------------------------------ */
/* Error handling                                                      */
/* ------------------------------------------------------------------ */
function recordError(error) {
  const message = error && error.message ? error.message : String(error);
  if (runtimeErrors.length < 20) runtimeErrors.push(message);
}

function showFatal(error, hint = '') {
  recordError(error);
  const overlay = $('error-overlay');
  const text = $('error-text');
  if (!overlay || !text) return;
  let message = error && error.message ? error.message : String(error);
  if (error instanceof CsvError && error.details) {
    message += `\n\nDetails: ${JSON.stringify(error.details, null, 2)}`;
  }
  if (error && error.stack && error.stack !== message) message += `\n\n${error.stack}`;
  text.textContent = `${message}${hint ? `\n\n${hint}` : ''}`;
  overlay.classList.remove('hidden');
  $('boot-overlay').classList.add('hidden');
  fatalShown = true;
}

window.addEventListener('error', (event) => recordError(event.error || event.message));
window.addEventListener('unhandledrejection', (event) => {
  recordError(event.reason || 'unhandled promise rejection');
});

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
function zoneFor(frameIndex) {
  return SITE.zones[Math.abs(frameIndex) % SITE.zones.length];
}

function interval() {
  return PLAYBACK.baseIntervalMs / state.speed;
}

function setStatus(text, tone) {
  const el = $('play-state');
  if (el) {
    el.textContent = text;
    el.className = `chip ${tone || ''}`.trim();
  }
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ */
/* Presentation helpers                                               */
/* ------------------------------------------------------------------ */
function setPlaybackSpeed(speed) {
  const value = Number(speed);
  if (!PLAYBACK.speeds.includes(value)) return;
  state.speed = value;
  const select = $('speed-select');
  if (select) select.value = String(value);
  if (state.playing) scheduleNext(interval());
}

function findFirstLoss() {
  if (!state.rows.length) return null;
  const index = state.rows.findIndex((row) => !row.received || !row.valid);
  if (index < 0) return null;
  const target = Math.max(0, index - 1);
  seek(target);
  return { index, sample: state.rows[index].sample };
}

function statsSnapshot() {
  return {
    sent: stats.sent,
    delivered: stats.delivered,
    lost: stats.lost,
    pdr: stats.pdr,
    plr: stats.plr,
    consecutiveLosses: stats.consecutiveLosses,
    longestOutage: stats.longestOutage,
  };
}

function buildPresentationContext() {
  if (!state.lastFrame) return null;
  const frameIndex = state.index >= 0 ? state.index : state.liveCount;
  return {
    sample: state.lastFrame.sample,
    zoneId: state.lastZoneId || zoneFor(frameIndex).id,
    received: Boolean(state.lastFrame.received && state.lastFrame.valid),
    frame: state.lastFrame,
    decision: state.lastDecision || {
      pump: 0, previous: 0, changed: false, action: 'waiting for telemetry', code: 'idle',
    },
    signal: state.lastSignal || { label: '—', tone: '', rssiDbm: NaN, snrDb: NaN },
    lora: state.lastLora,
    latencyMs: state.lastLatency,
    stats: statsSnapshot(),
    thresholds: {
      dry: controller ? controller.dry : CONTROL.dryThreshold,
      wet: controller ? controller.wet : CONTROL.wetThreshold,
      maxHold: controller ? controller.maxHold : CONTROL.maxHoldSamples,
    },
    mode: controller ? controller.mode : CONTROL.mode,
    measured: state.origin === 'measured',
    transportLabel: state.transportLabel,
    timeOnAirMs: TIME_ON_AIR.timeOnAirMs,
    arrivalTime: null,
  };
}

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */
async function init() {
  panels = new DashboardPanels();

  try {
    charts = new Charts();
  } catch (error) {
    showFatal(error, 'Run ./web3d/run_web.sh — vendor libraries load relative to the web3d folder.');
    return;
  }

  packetView = new PacketView();
  alertView = new AlertView();
  alerts = new AlertCenter({
    pdrTarget: 90,
    onChange: (center) => {
      alertView.render(center);
      panels.setAlertCount(center.counts.total, center.counts.critical);
    },
    onRaise: (alert) => alertView.toast(alert),
  });
  diagnostics = new Diagnostics();

  controller = new IrrigationController({
    dryThreshold: CONTROL.dryThreshold,
    wetThreshold: CONTROL.wetThreshold,
    maxHoldSamples: CONTROL.maxHoldSamples,
    mode: CONTROL.mode,
  });
  panels.setThresholds(controller.dry, controller.wet);

  $('boot-text').textContent = 'Building the 3D farm…';
  try {
    world = createWorld({
      canvas: $('scene'),
      labelsContainer: $('labels-layer'),
    });
  } catch (error) {
    showFatal(error, 'WebGL may be disabled. Enable hardware acceleration or use Chrome/Edge/Firefox.');
    return;
  }

  animator = new PacketAnimator({
    scene: world.scene,
    paths: world.paths,
    onStage: handlePacketStage,
    onArrive: handlePacketArrive,
  });

  presentationView = new PresentationView();
  presentation = new PresentationController({
    world,
    ui: presentationView,
    actions: {
      play,
      pause,
      restart: () => {
        rewind();
        play();
      },
      seek,
      findLoss: findFirstLoss,
      getSpeed: () => state.speed,
      setSpeed: (speed) => setPlaybackSpeed(speed),
    },
    getContext: buildPresentationContext,
  });
  presentationView.attach(presentation);
  presentationView.renderIdle();

  bindUi();
  world.resize();
  world.render();
  startAnimationLoop();

  $('boot-text').textContent = 'Loading data/sensor_data.csv…';
  try {
    await loadDataset();
  } catch (error) {
    showFatal(error, 'Start the dashboard with ./web3d/run_web.sh and reload the page.');
    return;
  }

  $('boot-overlay').classList.add('hidden');
  state.booted = true;
  setStatus('ready', 'chip-ok');

  const params = new URLSearchParams(window.location.search);
  if (params.has('speed')) {
    const speed = Number(params.get('speed'));
    if (PLAYBACK.speeds.includes(speed)) {
      state.speed = speed;
      $('speed-select').value = String(speed);
    }
  }
  if (params.has('tab')) openTab(params.get('tab'));

  if (params.has('frame')) {
    const target = Math.max(0, Math.min(Number(params.get('frame')) || 0, state.rows.length - 1));
    pause();
    seek(target);
    if (params.get('play') === '1') play();
  } else if (PLAYBACK.autoStart) {
    play();
  }

  if (params.get('present') === '1') {
    presentation.start({ auto: params.get('auto') === '1' });
  }
  if (params.has('component')) {
    presentation.showComponent(params.get('component'));
  }
  if (params.get('scan') === '1') {
    window.setTimeout(scanComponentPicking, 1500);
  }
  if (params.get('demo') === 'loss') {
    window.setTimeout(() => presentation.lossDemo(), 1500);
  }
  if (params.has('step')) {
    const steps = Math.max(0, Number(params.get('step')) || 0);
    window.setTimeout(() => {
      for (let i = 0; i < steps; i += 1) presentation.next();
    }, 9000);
  }

  window.setTimeout(runDiagnostics, 2200);
  window.setInterval(() => panels.tickClock(), 1000);
  window.setInterval(updateRendererStats, 1500);
  panels.tickClock();
}

/* ------------------------------------------------------------------ */
/* Dataset loading                                                    */
/* ------------------------------------------------------------------ */
async function loadDataset() {
  const [csvText, traceText] = await Promise.all([
    fetchText(DATA.csvUrl),
    fetchText(DATA.loraTraceUrl).catch(() => ''),
  ]);
  applyDataset(csvText, DATA.label, traceText);
}

function applyDataset(csvText, label, traceText = '') {
  const parsed = parseSensorCsv(csvText, label);
  state.rows = parsed.rows;
  state.columns = parsed.columns;
  state.datasetLabel = label;
  state.trace = parseLoraTrace(traceText);
  state.source = 'csv';
  state.origin = 'simulated';
  state.transportLabel = 'CSV replay';

  $('source-select').value = 'csv';
  $('source-csv-controls').classList.remove('hidden');
  $('source-serial-controls').classList.add('hidden');
  $('source-mqtt-controls').classList.add('hidden');
  ['play-btn', 'step-btn', 'reset-btn', 'seek'].forEach((id) => {
    $(id).disabled = false;
  });

  panels.setTotalSamples(state.rows.length);
  panels.setDataset(label, state.rows.length);
  panels.setSource({
    origin: 'simulated',
    transportLabel: 'CSV replay',
    datasetName: label,
    rows: state.rows.length,
  });
  $('dataset-name').title = label;

  resetState();
  // show the first frame immediately, then start the replay
  advance({ animate: false, alerts: false });
  panels.setSeek(state.index, state.rows.length);
  charts.update(state.history, { dry: controller.dry, wet: controller.wet }, state.columns.hasPump);

  parsed.warnings.forEach((warning) => {
    alerts.raise({
      key: `dataset-${warning.slice(0, 24)}`,
      severity: 'info',
      title: 'Dataset note',
      detail: warning,
      sample: 0,
    });
  });

  if (traceText === '') {
    alerts.raise({
      key: 'no-lora-trace',
      severity: 'info',
      title: 'LoRa trace not available',
      detail: 'results/lora_link_trace.csv was not loaded; RSSI/SNR are shown as “—”.',
      sample: 0,
    });
  }
}

function resetState() {
  clearTimeout(state.timer);
  state.playing = false;
  state.index = -1;
  state.liveCount = 0;
  state.history = [];
  state.lastFrame = null;
  state.lastDecision = null;
  state.lastLora = null;
  state.lastSignal = null;
  state.agreement = null;
  controller.reset();
  stats.reset();
  if (animator) animator.clear();
  if (packetView) packetView.reset();
  if (alerts) alerts.reset();
  if (alertView) {
    alertView.reset();
    alertView.clearToasts();
  }
  if (panels) panels.setAlertCount(0);
  panels.clearDecisions();
  panels.setPlayState('idle');
  updatePlayButton();
  if (presentation) presentation.onReplayReset();
}

/* ------------------------------------------------------------------ */
/* Frame processing                                                   */
/* ------------------------------------------------------------------ */
function processFrame(row, options = {}) {
  const {
    animate = true,
    evaluateAlerts = true,
    updateCharts = true,
  } = options;

  const frameIndex = state.index >= 0 ? state.index : state.liveCount;
  const zone = state.origin === 'measured' ? SITE.zones[0] : zoneFor(frameIndex);
  const lora = state.trace.get(row.sample) || null;
  const receivedForLink = Boolean(row.received && row.valid);

  stats.record(receivedForLink);
  const decision = controller.step(row);

  const rssiDbm = lora && Number.isFinite(lora.rssiDbm) ? lora.rssiDbm : NaN;
  const snrDb = lora && Number.isFinite(lora.snrDb) ? lora.snrDb : NaN;
  const signal = { ...signalState(stats.consecutiveLosses, rssiDbm), rssiDbm, snrDb };
  const latencyMs = modelLatencyMs(row.sample);

  state.lastFrame = row;
  state.lastDecision = decision;
  state.lastLora = lora;
  state.lastSignal = signal;
  state.lastLatency = latencyMs;
  state.lastZoneId = zone.id;
  state.agreement = controller.agreementPercent;

  state.history.push({
    sample: row.sample,
    soil: row.soil,
    temperature: row.temperature,
    humidity: row.humidity,
    received: receivedForLink,
    pump: decision.pump,
    recordedPump: row.recordedPump,
  });
  if (state.history.length > 600) state.history.shift();

  const measured = state.origin === 'measured';

  panels.setTelemetry({
    frame: row,
    decision,
    stats,
    signal,
    latencyMs,
    agreement: controller.agreementPercent,
    dry: controller.dry,
    wet: controller.wet,
    measured,
  });

  world.setTelemetry({
    frame: { ...row, received: receivedForLink },
    pump: decision.pump,
    signal,
    pdr: stats.pdr,
    measured,
    sourceLabel: state.transportLabel,
    zoneId: zone.id,
  });

  if (updateCharts) {
    charts.update(state.history, { dry: controller.dry, wet: controller.wet }, Boolean(state.columns && state.columns.hasPump));
    document.body.dataset.pumpSeq = state.history.slice(-24).map((entry) => `${entry.sample}:${entry.pump}`).join(' ');
    document.body.dataset.chartPump = (charts.charts.pump.data.datasets[0].data || []).slice(-24).join(' ');
  }

  if (animate) {
    const animatedPacket = animator.spawn({
      zoneId: zone.id,
      sample: row.sample,
      received: receivedForLink,
      latencyMs,
      rssiDbm,
      snrDb,
    });
    if (animatedPacket && presentation) {
      presentation.registerPacket(animatedPacket, buildPresentationContext());
    }
    packetView.addPacket({
      sample: row.sample,
      zoneId: zone.id,
      latencyMs,
      rssiDbm,
      snrDb,
      received: receivedForLink,
    });
    packetView.setFlight({
      tag: 'IN FLIGHT',
      sample: `#${row.sample} · soil ${zone.id}`,
      title: `Frame #${row.sample} in transit`,
      detail: `Sensor ${zone.id} → ESP32 → LoRa TX (frame flight ${latencyMs.toFixed(0)} ms modelled)`,
      tone: 'ok',
    });
  }

  if (evaluateAlerts) {
    alerts.evaluate(
      { ...row, received: receivedForLink },
      {
        stats,
        controller,
        dry: controller.dry,
        wet: controller.wet,
        temperatureRange: [CONTROL.temperatureMin, CONTROL.temperatureMax],
        humidityRange: [CONTROL.humidityMin, CONTROL.humidityMax],
      },
    );
  }

  panels.setSeek(
    state.index >= 0 ? state.index : Math.max(0, state.liveCount - 1),
    state.index >= 0 ? state.rows.length : Math.max(1, state.liveCount),
  );
}

function advance(options = {}) {
  if (state.source !== 'csv' || state.rows.length === 0) return;

  if (state.index + 1 >= state.rows.length) {
    if (!state.loop) {
      pause();
      setStatus('end of dataset', 'chip-warn');
      return;
    }
    const wasPlaying = state.playing;
    resetState();
    state.playing = wasPlaying;
    if (state.playing) setStatus('playing', 'chip-ok');
  }

  state.index += 1;
  processFrame(state.rows[state.index], options);
}

function seek(target) {
  if (state.rows.length === 0) return;
  const wasPlaying = state.playing;
  pause();
  resetState();

  const clamped = Math.max(0, Math.min(target, state.rows.length - 1));
  for (let i = 0; i <= clamped; i += 1) {
    state.index = i;
    processFrame(state.rows[i], {
      animate: false,
      evaluateAlerts: false,
      updateCharts: false,
    });
  }
  charts.update(state.history, { dry: controller.dry, wet: controller.wet }, Boolean(state.columns && state.columns.hasPump));
  panels.setSeek(clamped, state.rows.length);

  if (wasPlaying) play();
}

function rewind() {
  pause();
  resetState();
  if (state.rows.length > 0) {
    state.index = 0;
    processFrame(state.rows[0], { animate: false, evaluateAlerts: false });
    panels.setSeek(0, state.rows.length);
    charts.update(state.history, { dry: controller.dry, wet: controller.wet }, Boolean(state.columns && state.columns.hasPump));
  }
  setStatus('rewound', '');
}

/* ------------------------------------------------------------------ */
/* Playback                                                          */
/* ------------------------------------------------------------------ */
function play() {
  if (state.source !== 'csv' || state.rows.length === 0) return;
  if (state.index >= state.rows.length - 1) rewind();
  state.playing = true;
  setStatus('playing', 'chip-ok');
  updatePlayButton();
  scheduleNext(interval());
}

function pause() {
  state.playing = false;
  clearTimeout(state.timer);
  state.timer = null;
  setStatus('paused', 'chip-warn');
  updatePlayButton();
}

function updatePlayButton() {
  const button = $('play-btn');
  if (button) button.textContent = state.playing ? 'Pause' : 'Play';
}

function scheduleNext(delay) {
  clearTimeout(state.timer);
  state.timer = window.setTimeout(() => {
    if (!state.playing) return;
    advance();
    if (state.playing) scheduleNext(interval());
  }, Number.isFinite(delay) ? delay : interval());
}

function stepOnce() {
  pause();
  advance({ animate: true });
}

/* ------------------------------------------------------------------ */
/* Packet animation callbacks                                        */
/* ------------------------------------------------------------------ */
const STAGE_TEXT = {
  sensor: ['SENSOR', 'Sensor sampling frame', 'soil probe → ESP32 ADC'],
  node: ['ENCODE', 'ESP32 encoding frame', 'CRC + 16-byte payload'],
  tx: ['LORA TX', 'Transmitting over LoRa', '868.1 MHz · SF7 · BW125 kHz'],
  gateway: ['GATEWAY', 'Gateway forwarding frame', 'LoRa → server backhaul'],
  server: ['SERVER', 'Edge server processing', 'validation + storage'],
  db: ['DATABASE', 'Frame stored', 'session time-series store'],
  dashboard: ['DASHBOARD', 'Frame on the dashboard', 'charts + 3D twin updated'],
};

function handlePacketStage(packet, stage) {
  if (presentation) presentation.onPacketStage(packet, stage);
  if (!packetView) return;

  if (stage === 'lost') {
    packetView.setStage('lost', packet.zoneId);
    packetView.setFlight({
      tag: 'LINK LOSS',
      sample: `#${packet.sample} · soil ${packet.zoneId}`,
      title: `Frame #${packet.sample} lost in transit`,
      detail: 'Dropped between the LoRa transmitter and the gateway (recorded loss).',
      tone: 'lost',
    });
    return;
  }

  packetView.setStage(stage, packet.zoneId);
  const [tag, title, detail] = STAGE_TEXT[stage] || STAGE_TEXT.sensor;
  const rssi = Number.isFinite(packet.rssiDbm) ? `${packet.rssiDbm.toFixed(1)} dBm` : 'no trace';
  packetView.setFlight({
    tag,
    sample: `#${packet.sample} · soil ${packet.zoneId}`,
    title: `${title} #${packet.sample}`,
    detail: `${detail} · RX ${rssi}`,
    tone: 'ok',
  });
}

function handlePacketArrive(packet, result) {
  if (presentation) presentation.onPacketArrive(packet, result);
  if (!packetView) return;
  const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
  document.body.dataset.lastArrival = `${packet.sample}:${result.status}:${time}`;

  if (result.status === 'delivered') {
    packetView.markArrived(packet.sample, packet.zoneId, 'delivered');
    packetView.setStage('dashboard', packet.zoneId);
    packetView.setFlight({
      tag: 'DELIVERED',
      sample: `#${packet.sample} · soil ${packet.zoneId}`,
      title: `Frame #${packet.sample} stored & displayed`,
      detail: `Arrived ${time} · latency ${packet.latencyMs.toFixed(0)} ms · dashboard updated.`,
      tone: 'ok',
    });
  } else {
    packetView.markArrived(packet.sample, packet.zoneId, 'lost');
    packetView.setFlight({
      tag: 'PACKET LOST',
      sample: `#${packet.sample} · soil ${packet.zoneId}`,
      title: `Frame #${packet.sample} lost — no fresh data`,
      detail: `Lost at ${time}. The controller holds its last valid command (no action on stale data).`,
      tone: 'lost',
    });
  }
}

/* ------------------------------------------------------------------ */
/* Live transports                                                    */
/* ------------------------------------------------------------------ */
function handleLiveFrame(frame) {
  if (state.source === 'csv') return;
  state.liveCount += 1;
  processFrame(frame, { animate: true, evaluateAlerts: true });
  panels.setDataset('live stream', state.liveCount);
  charts.update(state.history, { dry: controller.dry, wet: controller.wet }, false);
  $('footer-sample').textContent = `live frame ${state.liveCount} · ${frame.source}`;
}

async function toggleSerial() {
  const button = $('serial-connect');
  const status = $('serial-status');
  const log = $('serial-log');

  if (serialSource && serialSource.active) {
    await serialSource.disconnect();
    button.textContent = 'Connect serial';
    return;
  }

  serialSource = new SerialSource({
    onFrame: handleLiveFrame,
    onStatus: (statusText, detail) => {
      status.textContent = detail ? `${statusText} · ${detail}` : statusText;
      status.style.color = statusText === 'connected' ? '#9ff5c4' : (statusText === 'error' ? '#ffb4b4' : '');
    },
    onLog: (line) => {
      const stamp = new Date().toLocaleTimeString('en-GB', { hour12: false });
      log.textContent = `${stamp}  ${line}\n${log.textContent}`.slice(0, 4000);
    },
  });

  try {
    button.disabled = true;
    await serialSource.connect();
    button.textContent = 'Disconnect serial';
  } catch (error) {
    status.textContent = `error · ${error.message}`;
    alertView.toast({ severity: 'critical', title: 'Serial connection failed', detail: error.message });
  } finally {
    button.disabled = false;
  }
}

async function toggleMqtt() {
  const button = $('mqtt-connect');
  const status = $('mqtt-status');

  if (mqttSource && mqttSource.client) {
    await mqttSource.disconnect();
    button.textContent = 'Connect MQTT';
    return;
  }

  mqttSource = new MqttSource({
    onFrame: handleLiveFrame,
    onStatus: (statusText, detail) => {
      status.textContent = detail ? `${statusText} · ${detail}` : statusText;
      status.style.color = statusText === 'connected' ? '#9ff5c4' : (statusText === 'error' ? '#ffb4b4' : '');
    },
  });

  try {
    button.disabled = true;
    await mqttSource.connect({
      url: $('mqtt-url').value.trim(),
      topic: $('mqtt-topic').value.trim(),
    });
    button.textContent = 'Disconnect MQTT';
  } catch (error) {
    status.textContent = `error · ${error.message}`;
    alertView.toast({ severity: 'critical', title: 'MQTT connection failed', detail: error.message });
  } finally {
    button.disabled = false;
  }
}

async function setTransport(kind) {
  if (kind === state.source) return;

  if (serialSource && serialSource.active) {
    await serialSource.disconnect();
    $('serial-connect').textContent = 'Connect serial';
  }
  if (mqttSource && mqttSource.client) {
    await mqttSource.disconnect();
    $('mqtt-connect').textContent = 'Connect MQTT';
  }

  pause();
  state.source = kind;
  $('source-csv-controls').classList.toggle('hidden', kind !== 'csv');
  $('source-serial-controls').classList.toggle('hidden', kind !== 'serial');
  $('source-mqtt-controls').classList.toggle('hidden', kind !== 'mqtt');

  const replayable = kind === 'csv';
  ['play-btn', 'step-btn', 'reset-btn', 'seek'].forEach((id) => {
    $(id).disabled = !replayable;
  });

  resetState();
  charts.update([], { dry: controller.dry, wet: controller.wet }, false);

  if (kind === 'csv') {
    state.origin = 'simulated';
    state.transportLabel = 'CSV replay';
    panels.setSource({
      origin: 'simulated',
      transportLabel: 'CSV replay',
      datasetName: state.datasetLabel || 'sensor_data.csv',
      rows: state.rows.length,
    });
    panels.setTotalSamples(state.rows.length);
    if (state.rows.length > 0) {
      state.index = 0;
      processFrame(state.rows[0], { animate: false, evaluateAlerts: false });
      panels.setSeek(0, state.rows.length);
      if (PLAYBACK.autoStart) play();
    }
  } else {
    state.origin = 'measured';
    state.transportLabel = kind === 'serial' ? 'Web Serial' : 'MQTT over WebSocket';
    panels.clearMeasurements();
    panels.setSource({
      origin: 'measured',
      transportLabel: state.transportLabel,
      datasetName: 'live stream',
      rows: 0,
    });
    panels.setTotalSamples(0);
    setStatus(kind === 'serial' ? 'connect the ESP32' : 'connect the broker', 'chip-warn');
    panels.setSeek(0, 1);
  }
}

function applyThresholdInputs() {
  const dry = Number($('dry-input').value);
  const wet = Number($('wet-input').value);
  const mode = $('mode-select').value;

  if (!Number.isFinite(dry) || !Number.isFinite(wet) || dry < 1 || wet > 100 || wet <= dry) {
    alertView.toast({
      severity: 'warning',
      title: 'Invalid thresholds',
      detail: 'Use 1 ≤ dry < wet ≤ 100 (the wet threshold must be greater than the dry one).',
    });
    panels.setThresholds(controller.dry, controller.wet);
    $('mode-select').value = controller.mode;
    return;
  }

  controller.configure({ dryThreshold: dry, wetThreshold: wet, mode });
  panels.setThresholds(dry, wet);
  setStatus('controller updated', 'chip-ok');
  reconfigure();
  if (presentation) presentation.onContextUpdate(buildPresentationContext());
}

function reconfigure() {
  if (state.source !== 'csv' || state.rows.length === 0) return;
  const target = state.index;
  const wasPlaying = state.playing;

  pause();
  resetState();
  if (target >= 0) {
    for (let i = 0; i <= target; i += 1) {
      state.index = i;
      processFrame(state.rows[i], { animate: false, evaluateAlerts: false, updateCharts: false });
    }
    charts.update(state.history, { dry: controller.dry, wet: controller.wet }, Boolean(state.columns && state.columns.hasPump));
    panels.setSeek(target, state.rows.length);
  }
  if (wasPlaying) play();
}

/* ------------------------------------------------------------------ */
/* UI binding                                                         */
/* ------------------------------------------------------------------ */
function openTab(name) {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === name);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.panel === name);
  });
  if (name === 'charts') {
    window.setTimeout(() => charts && charts.resize(), 80);
  }
}

function onResize() {
  if (!world) return;
  world.resize();
  if (charts) charts.resize();
}

function bindUi() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => openTab(tab.dataset.tab));
  });

  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-view]').forEach((other) => {
        other.classList.toggle('active', other === button);
      });
      world.setView(button.dataset.view);
    });
  });

  $('labels-toggle').addEventListener('click', () => {
    const visible = world.labels.toggle();
    $('labels-toggle').textContent = `Labels: ${visible ? 'on' : 'off'}`;
  });

  $('play-btn').addEventListener('click', () => {
    if (state.playing) pause();
    else play();
  });
  $('step-btn').addEventListener('click', stepOnce);
  $('reset-btn').addEventListener('click', rewind);

  $('speed-select').addEventListener('change', (event) => {
    state.speed = Number(event.target.value) || 1;
    if (state.playing) scheduleNext(interval());
  });

  $('seek').addEventListener('change', (event) => {
    seek(Number(event.target.value));
  });

  $('source-select').addEventListener('change', (event) => {
    setTransport(event.target.value).catch((error) => {
      alertView.toast({ severity: 'critical', title: 'Could not switch transport', detail: error.message });
    });
  });

  $('file-input').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      pause();
      const text = await file.text();
      applyDataset(text, file.name, '');
      setStatus('ready', 'chip-ok');
      if (PLAYBACK.autoStart) play();
      alertView.toast({
        severity: 'info',
        title: 'CSV loaded',
        detail: `${file.name} · ${state.rows.length} frames parsed locally.`,
      });
    } catch (error) {
      showFatal(error, 'Expected a header with soil moisture, temperature and air humidity columns.');
    } finally {
      event.target.value = '';
    }
  });

  $('reload-csv').addEventListener('click', async () => {
    try {
      pause();
      $('boot-text').textContent = 'Reloading dataset…';
      await loadDataset();
      setStatus('ready', 'chip-ok');
      if (PLAYBACK.autoStart) play();
    } catch (error) {
      showFatal(error, 'Check that data/sensor_data.csv exists next to the web3d folder.');
    }
  });

  $('serial-connect').addEventListener('click', toggleSerial);
  $('mqtt-connect').addEventListener('click', toggleMqtt);

  $('dry-input').addEventListener('change', applyThresholdInputs);
  $('wet-input').addEventListener('change', applyThresholdInputs);
  $('mode-select').addEventListener('change', applyThresholdInputs);

  $('alerts-btn').addEventListener('click', () => openTab('alerts'));
  $('clear-alerts').addEventListener('click', () => {
    alerts.clearResolved();
    alertView.render(alerts);
  });

  $('run-diag').addEventListener('click', runDiagnostics);
  $('error-dismiss').addEventListener('click', () => $('error-overlay').classList.add('hidden'));

  if (typeof ResizeObserver !== 'undefined') {
    const target = document.querySelector('.viewport-wrap');
    if (target) {
      const observer = new ResizeObserver(() => onResize());
      observer.observe(target);
    }
  }
  window.addEventListener('resize', onResize);
  bindComponentPicking();
}

function bindComponentPicking() {
  const canvas = $('scene');
  if (!canvas || !world) return;
  let down = null;

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    down = { x: event.clientX, y: event.clientY };
  });

  canvas.addEventListener('pointerup', (event) => {
    if (!down) return;
    const distance = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    down = null;
    if (distance > 6) return;
    const id = world.pickComponent(event.clientX, event.clientY);
    if (id && presentation) presentation.showComponent(id);
  });

  canvas.addEventListener('pointerleave', () => {
    down = null;
  });

  let hoverTimer = null;
  canvas.addEventListener('pointermove', (event) => {
    if (hoverTimer) return;
    const { clientX, clientY } = event;
    hoverTimer = window.setTimeout(() => {
      hoverTimer = null;
      const id = world.pickComponent(clientX, clientY);
      canvas.style.cursor = id ? 'pointer' : '';
    }, 120);
  });
}

function scanComponentPicking() {
  if (!world) return [];
  const results = Object.keys(world.componentPositions).map((id) => {
    const point = world.screenPositionOf(id);
    if (!point) return `${id}:empty`;
    const hit = world.pickComponent(point.x, point.y);
    return `${id}:${hit || 'miss'}`;
  });
  document.body.dataset.pickable = results.join(' ');
  return results;
}

/* ------------------------------------------------------------------ */
/* Render loop + diagnostics                                          */
/* ------------------------------------------------------------------ */
let lastFrameTime = performance.now();
let fpsFrames = 0;
let fpsTime = 0;

function startAnimationLoop() {
  requestAnimationFrame(loop);
}

function loop(now) {
  const dt = Math.min(0.08, Math.max(0.0005, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  state.clock += dt;

  try {
    world.update(dt, state.clock);
    animator.update(dt, state.speed);
    world.render();
  } catch (error) {
    if (!fatalShown) showFatal(error, 'The 3D renderer stopped. Reload the page to recover.');
  }

  fpsFrames += 1;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    panels.setFps(fpsFrames / fpsTime);
    fpsFrames = 0;
    fpsTime = 0;
  }

  requestAnimationFrame(loop);
}

function updateRendererStats() {
  if (!world || !panels) return;
  try {
    const info = world.stats();
    panels.setRendererStats(
      `${info.webgl} · ${info.calls} calls · ${(info.triangles / 1000).toFixed(1)}k tris · ${info.labels} labels`,
    );
    document.body.dataset.packets = String(animator ? animator.activeCount : -1);
    document.body.dataset.hud = `${document.getElementById('flight-tag').textContent} | ${document.getElementById('flight-title').textContent}`;
    document.body.dataset.index = String(state.index);
    document.body.dataset.errors = String(runtimeErrors.length);
  } catch (error) {
    /* renderer may not be ready yet */
  }
}

function runDiagnostics() {
  if (!diagnostics || !world) return;
  const rendererInfo = world.stats();
  diagnostics.run({
    rows: state.rows,
    columns: state.columns,
    loraTrace: state.trace,
    charts,
    world,
    packets: animator,
    rendererInfo,
    runtimeErrors,
    source: state.datasetLabel || state.transportLabel,
  });
  panels.setDiagSummary(
    `diagnostics: ${diagnostics.summaryText}`,
    diagnostics.allPassed ? 'pass' : 'fail',
  );
  document.body.dataset.diag = diagnostics.summaryText;
  document.body.dataset.diagPassed = String(diagnostics.allPassed);
  document.body.dataset.rows = String(state.rows.length);
  document.body.dataset.source = state.datasetLabel || state.transportLabel;

  // Layout probe (also useful for headless verification): confirms that the
  // overlay HUD elements are inside the viewport and not covered by the canvas.
  const probe = (selector) => {
    const node = document.querySelector(selector);
    if (!node) return 'missing';
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)}x${Math.round(rect.height)},z=${style.zIndex},vis=${style.visibility},disp=${style.display}`;
  };
  document.body.dataset.overlay = `vp=${probe('.viewport-wrap')} legend=${probe('.legend')} footer=${probe('.viewport-footer')}`;
}

/* ------------------------------------------------------------------ */
/* Public debug API + start                                           */
/* ------------------------------------------------------------------ */
window.SmartFarm = {
  state,
  get world() { return world; },
  get controller() { return controller; },
  get charts() { return charts; },
  get diagnostics() { return diagnostics; },
  get packets() { return animator; },
  get alerts() { return alerts; },
  get presentation() { return presentation; },
  get presentationView() { return presentationView; },
  play,
  pause,
  seek,
  advance,
  stepOnce,
  rewind,
  applyDataset,
  runDiagnostics,
  scanComponentPicking,
};

init().catch((error) => {
  showFatal(error, 'Start the dashboard with ./web3d/run_web.sh (served over http://localhost).');
});
