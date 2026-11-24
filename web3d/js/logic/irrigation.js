/**
 * Automatic irrigation controller — software model of the documented law.
 *
 * The law is identical to matlab/functions/irrigation_control.m and to the
 * synthesizable VHDL controller (vhdl/irrigation_controller.vhd):
 *
 *   soil  <  dry            -> pump ON
 *   soil  >  wet            -> pump OFF
 *   dry <= soil <= wet      -> hold the previous state (hysteresis)
 *   packet lost / invalid   -> hold (default) or force OFF after the watchdog
 *
 * No physical pump is driven by this class: it produces the same command a
 * real controller would, so the dashboard can compare it with the recorded
 * `Pump` column of the dataset.
 */

export class IrrigationController {
  constructor(options = {}) {
    this.dry = options.dryThreshold ?? 30;
    this.wet = options.wetThreshold ?? 40;
    this.maxHold = options.maxHoldSamples ?? 3;
    this.mode = options.mode ?? 'hold';
    this.reset();
  }

  configure(options = {}) {
    if (Number.isFinite(options.dryThreshold)) this.dry = options.dryThreshold;
    if (Number.isFinite(options.wetThreshold)) this.wet = options.wetThreshold;
    if (Number.isFinite(options.maxHoldSamples)) this.maxHold = options.maxHoldSamples;
    if (options.mode === 'hold' || options.mode === 'failsafe') this.mode = options.mode;
    this.reset();
  }

  get validConfig() {
    return this.wet > this.dry;
  }

  reset() {
    this.state = 0;                 // pump starts OFF (safe state)
    this.consecutiveLosses = 0;
    this.holdSamples = 0;
    this.lossSamples = 0;
    this.watchdogTrips = 0;
    this.transitions = 0;
    this.activated = 0;
    this.onSamples = 0;
    this.samples = 0;
    this.compared = 0;
    this.matched = 0;
    this.last = null;
  }

  /** True when the frame can safely drive the actuator (VHDL sample_ok rule). */
  static isTrustworthy(frame) {
    return Boolean(
      frame
      && frame.valid !== false
      && frame.received !== false
      && Number.isFinite(frame.soil)
      && frame.soil >= 0
      && frame.soil <= 100,
    );
  }

  /**
   * Advance the controller by one telemetry frame.
   * @param {{soil:number, received:boolean, valid:boolean, sample:number}}} frame
   */
  step(frame) {
    const previous = this.state;
    const trustworthy = IrrigationController.isTrustworthy(frame);
    let action = '';
    let code = '';

    if (!trustworthy) {
      this.consecutiveLosses += 1;
      this.lossSamples += 1;
      if (this.mode === 'failsafe' && this.consecutiveLosses >= this.maxHold) {
        if (this.state !== 0) this.watchdogTrips += 1;
        this.state = 0;
        action = `Watchdog: pump OFF (${this.consecutiveLosses} lost)`;
        code = 'loss-failsafe';
      } else {
        action = this.consecutiveLosses === 1
          ? 'Hold: no telemetry'
          : `Hold: no telemetry (${this.consecutiveLosses})`;
        code = 'loss-hold';
      }
    } else {
      this.consecutiveLosses = 0;
      if (frame.soil < this.dry) {
        this.state = 1;
        action = `Irrigate: ${frame.soil.toFixed(1)}% < ${this.dry}%`;
        code = 'dry';
      } else if (frame.soil > this.wet) {
        this.state = 0;
        action = `Stop: ${frame.soil.toFixed(1)}% > ${this.wet}%`;
        code = 'wet';
      } else {
        this.holdSamples += 1;
        action = `Hold: ${frame.soil.toFixed(1)}% in ${this.dry}…${this.wet}%`;
        code = 'band';
      }
    }

    if (this.state !== previous) {
      this.transitions += 1;
      if (this.state === 1) this.activated += 1;
    }

    this.samples += 1;
    if (this.state === 1) this.onSamples += 1;

    let matchesRecorded = null;
    if (frame && frame.recordedPump !== null && frame.recordedPump !== undefined) {
      this.compared += 1;
      matchesRecorded = (frame.recordedPump === (this.state === 1));
      if (matchesRecorded) this.matched += 1;
    }

    this.last = {
      pump: this.state,
      action,
      code,
      changed: this.state !== previous,
      previous,
      trustworthy,
      consecutiveLosses: this.consecutiveLosses,
      matchesRecorded,
      sample: frame ? frame.sample : null,
    };
    return this.last;
  }

  get onPercent() {
    return this.samples === 0 ? 0 : (100 * this.onSamples) / this.samples;
  }

  get agreementPercent() {
    return this.compared === 0 ? null : (100 * this.matched) / this.compared;
  }
}

/** Replay the law over a whole dataset (used by the diagnostics panel). */
export function replayLaw(rows, options = {}) {
  const controller = new IrrigationController(options);
  rows.forEach((row) => controller.step(row));
  return controller;
}
