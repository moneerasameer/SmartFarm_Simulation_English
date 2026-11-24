/**
 * LoRa link statistics and the link-budget model.
 *
 * IMPORTANT — provenance:
 *  • The per-frame RSSI / SNR shown in the panel are read from
 *    `results/lora_link_trace.csv`, i.e. they are the output of the MATLAB
 *    link-budget model of this project. They are NOT field measurements.
 *  • Delivery / loss outcomes come from the recorded dataset column
 *    “Packet received”, not from this model.
 *  • The airtime is computed with the published Semtech CSS formula
 *    (identical to matlab/functions/lora_time_on_air.m).
 */

import { LORA, computeTimeOnAir } from '../config.js';

export class LinkStats {
  constructor() {
    this.reset();
  }

  reset() {
    this.sent = 0;
    this.delivered = 0;
    this.lost = 0;
    this.consecutiveLosses = 0;
    this.longestOutage = 0;
    this.firstLossSample = null;
    this.lastOutcome = null;
  }

  record(received) {
    this.sent += 1;
    this.lastOutcome = Boolean(received);
    if (received) {
      this.delivered += 1;
      this.consecutiveLosses = 0;
    } else {
      this.lost += 1;
      this.consecutiveLosses += 1;
      if (this.consecutiveLosses > this.longestOutage) this.longestOutage = this.consecutiveLosses;
    }
    return this.lastOutcome;
  }

  get pdr() {
    return this.sent === 0 ? null : (100 * this.delivered) / this.sent;
  }

  get plr() {
    return this.sent === 0 ? null : (100 * this.lost) / this.sent;
  }
}

/**
 * Log-distance path-loss + link budget, port of lora_link_budget.m.
 * Used only to display the modelled margin for the configured distance.
 */
export function linkBudget(distanceM = LORA.distanceM, cfg = LORA) {
  const sf = cfg.spreadingFactor;
  const snrLimit = cfg.snrLimitDb[Math.min(Math.max(sf - 7, 0), cfg.snrLimitDb.length - 1)];
  const distance = Math.max(distanceM, cfg.referenceDistanceM);
  const referenceKm = cfg.referenceDistanceM / 1000;
  const pathLossAtReference = 32.44 + 20 * Math.log10(cfg.frequencyMHz) + 20 * Math.log10(referenceKm);
  const pathLoss = pathLossAtReference
    + 10 * cfg.pathLossExponent * Math.log10(distance / cfg.referenceDistanceM);
  const rxPower = cfg.txPowerDbm + cfg.txAntennaGainDbi + cfg.rxAntennaGainDbi
    - cfg.cableLossDb - pathLoss;
  const noiseFloor = -174 + 10 * Math.log10(cfg.bandwidthKHz * 1000) + cfg.receiverNoiseFigureDb;
  const snr = rxPower - noiseFloor;
  const margin = snr - (snrLimit + cfg.implementationLossDb);
  const per = 1 / (1 + Math.exp(cfg.perSteepnessDb * margin));
  return {
    distanceM: distance,
    pathLossDb: pathLoss,
    rssiDbm: rxPower,
    snrDb: snr,
    snrLimitDb: snrLimit,
    marginDb: margin,
    packetErrorProbability: per,
  };
}

export const TIME_ON_AIR = computeTimeOnAir(LORA);

/**
 * Modelled arrival delay for the replay: airtime + gateway forwarding + a
 * deterministic per-frame jitter (so the table does not show a constant).
 */
export function modelLatencyMs(sample) {
  const jitter = ((Number(sample) * 37) % 19) + 3; // 3…21 ms, reproducible
  return TIME_ON_AIR.timeOnAirMs + LORA.gatewayForwardingMs + jitter;
}

/**
 * Signal status shown in the UI. The streak of lost frames dominates,
 * because it is the only *recorded* evidence about the link.
 */
export function signalState(consecutiveLosses, rssiDbm) {
  if (consecutiveLosses >= 3) {
    return { level: 1, label: 'LINK LOST', tone: 'bad', detail: `${consecutiveLosses} consecutive lost frames` };
  }
  if (consecutiveLosses > 0) {
    return { level: 2, label: 'DEGRADED', tone: 'warn', detail: `${consecutiveLosses} lost frame(s)` };
  }
  if (!Number.isFinite(rssiDbm)) {
    return { level: 3, label: 'ONLINE', tone: 'ok', detail: 'no link-budget row' };
  }
  if (rssiDbm >= -100) return { level: 4, label: 'ONLINE', tone: 'ok', detail: 'strong model margin' };
  if (rssiDbm >= -110) return { level: 3, label: 'ONLINE', tone: 'ok', detail: 'nominal model margin' };
  if (rssiDbm >= -120) return { level: 2, label: 'WEAK', tone: 'warn', detail: 'low model margin' };
  return { level: 1, label: 'CRITICAL', tone: 'bad', detail: 'below sensitivity (model)' };
}
