/**
 * In-page self-diagnostics.
 *
 * The checks make the live demo verifiable in front of a committee: dataset
 * integrity, control-law agreement with the recorded pump column, chart
 * creation, WebGL rendering, LoRa trace coverage and runtime errors.
 */

import { replayLaw } from '../logic/irrigation.js';
import { TIME_ON_AIR } from '../logic/lora.js';
import { CONTROL } from '../config.js';

export class Diagnostics {
  constructor() {
    this.list = document.getElementById('diag-list');
    this.summary = document.getElementById('diag-summary');
    this.button = document.getElementById('run-diag');
    this.results = [];
  }

  run(context) {
    const {
      rows, columns, loraTrace, charts, world, packets,
      rendererInfo, runtimeErrors, source,
    } = context;

    const results = [];
    const add = (name, passed, detail) => results.push({ name, passed, detail });

    add('Dataset loaded', Array.isArray(rows) && rows.length > 0,
      `${rows ? rows.length : 0} frame(s) from ${source || 'dataset'}`);

    add('Header schema recognised', Boolean(columns && columns.hasReceived && columns.hasPump),
      columns
        ? `received: ${columns.hasReceived ? 'yes' : 'assumed'} · pump: ${columns.hasPump ? 'yes' : 'missing'} · ML advice: ${columns.hasMlAdvice ? 'yes' : 'no'}`
        : 'no schema information');

    const invalid = (rows || []).filter((row) => !row.valid).length;
    add('Frame range validation', invalid === 0, `${invalid} invalid frame(s) out of ${rows ? rows.length : 0}`);

    const replay = replayLaw(rows || [], {
      dryThreshold: CONTROL.dryThreshold,
      wetThreshold: CONTROL.wetThreshold,
      mode: 'hold',
      maxHoldSamples: CONTROL.maxHoldSamples,
    });
    const agreement = replay.agreementPercent;
    add('Control law matches recorded pump', agreement !== null && agreement >= 99.5,
      agreement === null ? 'no recorded pump column' : `${agreement.toFixed(2)} % agreement over ${replay.compared} frame(s)`);

    const coverage = rows && loraTrace ? rows.filter((row) => loraTrace.has(row.sample)).length : 0;
    add('LoRa link-budget trace joined', coverage > 0,
      loraTrace ? `${coverage}/${rows ? rows.length : 0} frames have RSSI/SNR model data` : 'results/lora_link_trace.csv not loaded');

    add('Five charts created', Boolean(charts) && charts.count === 5, `${charts ? charts.count : 0} Chart.js instance(s)`);

    const webgl = rendererInfo && rendererInfo.webgl;
    add('WebGL renderer available', Boolean(webgl), webgl || 'no WebGL context');

    const calls = rendererInfo ? rendererInfo.calls : 0;
    add('3D scene is rendering', calls > 0, `${calls} draw call(s) · ${rendererInfo ? rendererInfo.triangles : 0} triangles`);

    add('Sensor labels anchored', Boolean(world) && world.labels && world.labels.items.length >= 8,
      world && world.labels ? `${world.labels.items.length} labels` : 'no labels');

    add('Packet paths built', Boolean(world) && world.paths && Object.keys(world.paths).length === 4,
      world && world.paths ? `${Object.keys(world.paths).length} field path(s)` : 'no paths');

    add('Packet animator ready', Boolean(packets) && typeof packets.spawn === 'function',
      packets ? `${packets.activeCount} active packet(s)` : 'not initialised');

    const toaOk = TIME_ON_AIR.timeOnAirMs > 20 && TIME_ON_AIR.timeOnAirMs < 3000;
    add('LoRa airtime formula sane', toaOk,
      `${TIME_ON_AIR.timeOnAirMs.toFixed(2)} ms (${TIME_ON_AIR.packetSymbols} symbols, SF7/BW125)`);

    add('No runtime errors', runtimeErrors.length === 0,
      runtimeErrors.length === 0 ? '0 errors captured' : `${runtimeErrors.length} error(s): ${runtimeErrors[0]}`);

    this.results = results;
    this.render();
    return results;
  }

  render() {
    this.list.textContent = '';
    this.results.forEach((result) => {
      const li = document.createElement('li');
      li.className = result.passed ? 'pass' : 'fail';
      const flag = document.createElement('span');
      flag.className = 'flag';
      flag.textContent = result.passed ? 'PASS' : 'FAIL';
      const body = document.createElement('span');
      const name = document.createElement('b');
      name.textContent = result.name;
      const detail = document.createElement('span');
      detail.textContent = result.detail ? ` — ${result.detail}` : '';
      body.append(name, detail);
      li.append(flag, body);
      this.list.appendChild(li);
    });

    const passed = this.results.filter((result) => result.passed).length;
    const total = this.results.length;
    this.summary.textContent = `${passed}/${total} checks passed`;
    this.summary.style.color = passed === total ? '#9ff5c4' : '#ffd48a';
  }

  get summaryText() {
    const passed = this.results.filter((result) => result.passed).length;
    return `${passed}/${this.results.length}`;
  }

  get allPassed() {
    return this.results.length > 0 && this.results.every((result) => result.passed);
  }
}
