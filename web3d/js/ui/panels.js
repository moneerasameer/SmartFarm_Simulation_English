/**
 * Dashboard panels: sensor gauges, LoRa link card, irrigation card, top bar
 * pills, footer and the tabs. All values are written as text nodes so no
 * untrusted string is ever injected as HTML.
 */

import { TIME_ON_AIR } from '../logic/lora.js';

const $ = (id) => document.getElementById(id);

function formatNumber(value, digits = 1, suffix = '') {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}${suffix}`;
}

export class DashboardPanels {
  constructor() {
    this.el = {
      originBadge: $('data-origin-badge'),
      transportLabel: $('transport-label'),
      linkPill: $('link-pill'),
      linkPillText: $('link-pill').querySelector('span'),
      pumpPill: $('pump-pill'),
      pumpPillText: $('pump-pill').querySelector('span'),
      samplePill: $('sample-pill'),
      alertCount: $('alert-count'),
      tabAlertCount: $('tab-alert-count'),
      clock: $('clock'),

      playState: $('play-state'),
      datasetName: $('dataset-name'),
      datasetRows: $('dataset-rows'),
      seek: $('seek'),
      seekLabel: $('seek-label'),

      measurementTag: $('measurement-tag'),
      valSoil: $('val-soil'),
      valTemp: $('val-temp'),
      valHum: $('val-hum'),
      barSoil: $('bar-soil'),
      barTemp: $('bar-temp'),
      barHum: $('bar-hum'),
      soilNote: $('soil-note'),
      valReceived: $('val-received'),
      valLost: $('val-lost'),
      valPdr: $('val-pdr'),
      valPlr: $('val-plr'),

      valSignal: $('val-signal'),
      signalBars: $('signal-bars'),
      valRssi: $('val-rssi'),
      valSnr: $('val-snr'),
      valToa: $('val-toa'),
      valLatency: $('val-latency'),

      pumpChip: $('pump-state-chip'),
      pumpVisual: $('pump-visual'),
      pumpBadge: $('pump-badge'),
      pumpAction: $('pump-action'),
      controllerState: $('controller-state'),
      decisionLog: $('decision-log'),
      dryInput: $('dry-input'),
      wetInput: $('wet-input'),
      modeSelect: $('mode-select'),

      pktTx: $('pkt-tx'),
      pktOk: $('pkt-ok'),
      pktLost: $('pkt-lost'),
      pktPdr: $('pkt-pdr'),

      footerSource: $('footer-source'),
      footerSample: $('footer-sample'),
      footerClock: $('footer-clock'),
      footerFps: $('footer-fps'),
      footerDiag: $('footer-diag'),
      rendererStats: $('renderer-stats'),
      hintText: $('hint-text'),
    };
    this.lastDecisionSample = null;
    this.totalSamples = 0;
    this.currentAgreement = null;
  }

  setTotalSamples(total) {
    this.totalSamples = total;
  }

  setPlayState(text, tone = '') {
    this.el.playState.textContent = text;
    this.el.playState.className = `chip ${tone}`.trim();
  }

  setSource({ origin, transportLabel, datasetName, rows }) {
    const measured = origin === 'measured';
    this.el.originBadge.textContent = measured ? 'MEASURED · live sensor' : 'SIMULATED · recorded dataset';
    this.el.originBadge.className = `badge ${measured ? 'badge-live' : 'badge-sim'}`;
    this.el.transportLabel.textContent = transportLabel;
    this.el.measurementTag.textContent = measured ? 'measured' : 'simulated';
    this.el.measurementTag.className = `chip ${measured ? 'chip-ok' : 'chip-cyan'}`;
    this.el.footerSource.textContent = measured
      ? `source: ${transportLabel} (measured)`
      : `source: ${transportLabel} · recorded dataset (simulated)`;
    if (datasetName) this.el.datasetName.textContent = datasetName;
    if (Number.isFinite(rows)) this.el.datasetRows.textContent = `${rows} frames`;
    this.el.hintText.textContent = measured
      ? 'Live sensor frame — values are measured on the connected device.'
      : 'Simulation only — no radio hardware is connected.';
  }

  setDataset(name, rows) {
    if (name) this.el.datasetName.textContent = name;
    this.el.datasetRows.textContent = `${rows} frames`;
  }

  setSeek(index, total) {
    this.el.seek.max = String(Math.max(0, total - 1));
    this.el.seek.value = String(Math.max(0, index));
    this.el.seekLabel.textContent = `frame ${index + 1} / ${total}`;
    this.el.footerSample.textContent = `frame ${index + 1}/${total}`;
    if (this.el.footerClock) {
      this.el.footerClock.textContent = `t = ${Math.round((index + 1) * 60)} s (1 frame = 60 s)`;
    }
  }

  setThresholds(dry, wet) {
    if (document.activeElement !== this.el.dryInput) this.el.dryInput.value = String(dry);
    if (document.activeElement !== this.el.wetInput) this.el.wetInput.value = String(wet);
    this.el.soilNote.textContent = `dry < ${dry} · wet > ${wet}`;
    document.querySelectorAll('.bar .mark-dry').forEach((mark) => { mark.style.left = `${dry}%`; });
    document.querySelectorAll('.bar .mark-wet').forEach((mark) => { mark.style.left = `${wet}%`; });
  }

  clearDecisions() {
    this.el.decisionLog.textContent = '';
    this.el.controllerState.textContent = 'State: waiting for telemetry…';
    this.lastDecisionSample = null;
    this.currentAgreement = null;
  }

  /** Blank the gauges when switching to a live source with no frames yet. */
  clearMeasurements() {
    this.el.valSoil.textContent = '—';
    this.el.valTemp.textContent = '—';
    this.el.valHum.textContent = '—';
    this.el.barSoil.style.width = '0%';
    this.el.barTemp.style.width = '0%';
    this.el.barHum.style.width = '0%';
    this.el.valReceived.textContent = '0';
    this.el.valLost.textContent = '0';
    this.el.valPdr.textContent = '—';
    this.el.valPlr.textContent = '—';
    this.el.valSignal.textContent = '—';
    this.el.valSignal.className = '';
    this.el.valRssi.textContent = '—';
    this.el.valSnr.textContent = '—';
    this.el.valLatency.textContent = '—';
    this.el.pktTx.textContent = '0';
    this.el.pktOk.textContent = '0';
    this.el.pktLost.textContent = '0';
    this.el.pktPdr.textContent = '—';
    this.currentAgreement = null;
    this.setPump(false);
  }

  setTelemetry({ frame, decision, stats, signal, latencyMs, agreement, dry, wet, measured }) {
    const fresh = frame.received && frame.valid !== false;

    if (fresh) {
      this.el.valSoil.textContent = formatNumber(frame.soil, 1);
      this.el.valTemp.textContent = formatNumber(frame.temperature, 1);
      this.el.valHum.textContent = formatNumber(frame.humidity, 1);
      this.el.barSoil.style.width = `${Math.max(0, Math.min(100, frame.soil))}%`;
      this.el.barTemp.style.width = `${Math.max(0, Math.min(100, ((frame.temperature + 20) / 80) * 100))}%`;
      this.el.barHum.style.width = `${Math.max(0, Math.min(100, frame.humidity))}%`;
    }

    this.el.measurementTag.textContent = fresh ? (measured ? 'measured' : 'simulated') : 'holding last frame';
    this.el.measurementTag.className = `chip ${fresh ? (measured ? 'chip-ok' : 'chip-cyan') : 'chip-warn'}`;

    this.el.valReceived.textContent = String(stats.delivered);
    this.el.valLost.textContent = String(stats.lost);
    this.el.valPdr.textContent = formatNumber(stats.pdr, 1, ' %');
    this.el.valPlr.textContent = formatNumber(stats.plr, 1, ' %');

    this.el.valSignal.textContent = signal.label;
    this.el.valSignal.className = signal.tone;
    this.el.signalBars.setAttribute('data-level', String(signal.level));
    this.el.valRssi.textContent = Number.isFinite(signal.rssiDbm) ? `${signal.rssiDbm.toFixed(1)} dBm` : '—';
    this.el.valSnr.textContent = Number.isFinite(signal.snrDb) ? `${signal.snrDb.toFixed(1)} dB` : '—';
    this.el.valToa.textContent = `${TIME_ON_AIR.timeOnAirMs.toFixed(1)} ms`;
    this.el.valLatency.textContent = `${latencyMs.toFixed(0)} ms`;

    this.el.linkPillText.textContent = `LoRa link — ${signal.label}`;
    this.el.linkPill.className = `pill ${signal.tone === 'ok' ? 'ok' : (signal.tone === 'warn' ? 'warn' : 'bad')}`;

    this.setPump(decision.pump, decision);
    const displaySample = Number.isFinite(frame.sample) ? frame.sample + 1 : '—';
    this.el.samplePill.textContent = `${displaySample} / ${this.totalSamples || '—'}`;
    this.currentAgreement = agreement;

    this.el.pktTx.textContent = String(stats.sent);
    this.el.pktOk.textContent = String(stats.delivered);
    this.el.pktLost.textContent = String(stats.lost);
    this.el.pktPdr.textContent = formatNumber(stats.pdr, 1, ' %');

    this.pushDecision(decision, dry, wet);
  }

  setPump(on, decision) {
    this.el.pumpChip.textContent = on ? 'ON' : 'OFF';
    this.el.pumpChip.className = `chip ${on ? 'chip-ok' : ''}`.trim();
    this.el.pumpVisual.classList.toggle('on', on);
    this.el.pumpBadge.textContent = on ? 'Pump ON' : 'Pump OFF';
    this.el.pumpPillText.textContent = `Pump ${on ? 'ON' : 'OFF'}`;
    this.el.pumpPill.className = `pill ${on ? 'ok' : ''}`.trim();
    if (decision) {
      this.el.pumpAction.textContent = decision.action;
      this.el.pumpAction.style.color = decision.code === 'loss-hold' || decision.code === 'loss-failsafe'
        ? '#ffd48a'
        : (on ? '#9ff5c4' : '');
    }
  }

  pushDecision(decision, dry, wet) {
    if (!decision || decision.sample === this.lastDecisionSample) return;
    this.lastDecisionSample = decision.sample;

    const item = document.createElement('li');
    if (decision.code === 'loss-hold' || decision.code === 'loss-failsafe') item.className = 'loss';
    else item.className = decision.pump ? 'on' : 'off';

    const tag = document.createElement('b');
    tag.textContent = `#${decision.sample}`;
    const text = document.createElement('span');
    text.textContent = decision.action;
    item.appendChild(tag);
    item.appendChild(text);

    this.el.decisionLog.prepend(item);
    while (this.el.decisionLog.children.length > 8) {
      this.el.decisionLog.removeChild(this.el.decisionLog.lastChild);
    }

    this.el.controllerState.textContent = '';
    const label = document.createElement('span');
    label.textContent = 'State: ';
    const bold = document.createElement('b');
    bold.textContent = decision.pump ? 'pump ON' : 'pump OFF';
    const tail = document.createElement('span');
    const agreementText = Number.isFinite(this.currentAgreement) ? this.currentAgreement.toFixed(1) : '—';
    tail.textContent = ` · ${decision.code} · ${this.el.modeSelect.value} · agree ${agreementText} %`;
    this.el.controllerState.append(label, bold, tail);
  }

  setAlertCount(count, critical = 0) {
    this.el.alertCount.textContent = String(count);
    this.el.tabAlertCount.textContent = String(count);
    this.el.tabAlertCount.classList.toggle('hot', critical > 0);
    this.el.alertCount.style.background = critical > 0 ? '#ef4444' : (count > 0 ? '#f59e0b' : '#334155');
  }

  setFps(fps) {
    this.el.footerFps.textContent = `${fps.toFixed(0)} fps`;
  }

  setRendererStats(text) {
    this.el.rendererStats.textContent = text;
  }

  setDiagSummary(text, tone = '') {
    this.el.footerDiag.textContent = text;
    this.el.footerDiag.style.color = tone === 'fail' ? '#ffb4b4' : (tone === 'pass' ? '#9ff5c4' : '');
  }

  tickClock() {
    this.el.clock.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
  }
}
