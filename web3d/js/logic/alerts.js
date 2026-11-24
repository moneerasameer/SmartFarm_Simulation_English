/**
 * Alert engine.
 *
 * Alerts are *derived* from the replayed telemetry. They describe the data
 * (dry soil, lost frames, invalid values, low delivery ratio) and are not
 * hardware fault reports.
 */

const SEVERITY_ORDER = { info: 1, warning: 2, critical: 3, ok: 0 };

let counter = 0;

export class AlertCenter {
  constructor(options = {}) {
    this.maxItems = options.maxItems ?? 40;
    this.pdrTarget = options.pdrTarget ?? 90;
    this.active = new Map();   // key -> alert
    this.log = [];
    this.onChange = options.onChange || (() => {});
    this.onRaise = options.onRaise || (() => {});
  }

  reset() {
    this.active.clear();
    this.log = [];
    this.onChange(this);
  }

  raise({ key, severity = 'info', title, detail = '', sample = null }) {
    const existing = this.active.get(key);
    if (existing) {
      existing.detail = detail || existing.detail;
      existing.sample = sample;
      existing.count += 1;
      this.onChange(this);
      return existing;
    }
    counter += 1;
    const alert = {
      id: counter,
      key,
      severity,
      title,
      detail,
      sample,
      time: new Date(),
      count: 1,
      resolved: false,
    };
    this.active.set(key, alert);
    this.log.unshift(alert);
    if (this.log.length > this.maxItems) this.log.pop();
    this.onChange(this);
    if (SEVERITY_ORDER[severity] >= SEVERITY_ORDER.warning) this.onRaise(alert);
    return alert;
  }

  resolve(key, detail) {
    const alert = this.active.get(key);
    if (!alert) return;
    alert.resolved = true;
    if (detail) alert.detail = detail;
    this.active.delete(key);
    this.onChange(this);
  }

  clearResolved() {
    this.log = this.log.filter((alert) => !alert.resolved);
    this.onChange(this);
  }

  get counts() {
    let info = 0;
    let warning = 0;
    let critical = 0;
    this.active.forEach((alert) => {
      if (alert.severity === 'critical') critical += 1;
      else if (alert.severity === 'warning') warning += 1;
      else info += 1;
    });
    return { info, warning, critical, total: info + warning + critical };
  }

  /**
   * Evaluate one processed frame.
   * @param {object} frame row + derived telemetry
   * @param {object} ctx {stats, controller, thresholds}
   */
  evaluate(frame, ctx) {
    const stats = ctx.stats;
    const controller = ctx.controller;

    if (frame.valid === false) {
      this.raise({
        key: 'invalid-frame',
        severity: 'warning',
        title: 'Invalid telemetry frame ignored',
        detail: `Frame #${frame.sample}: ${frame.invalidReason}. The controller holds its state.`,
        sample: frame.sample,
      });
    } else {
      this.resolve('invalid-frame');
    }

    if (!frame.received) {
      this.raise({
        key: 'lost-frame',
        severity: 'warning',
        title: `Packet lost (frame #${frame.sample})`,
        detail: `No telemetry received. Consecutive losses: ${stats.consecutiveLosses}.`,
        sample: frame.sample,
      });
    } else {
      this.resolve('lost-frame');
    }

    if (stats.consecutiveLosses >= 3) {
      this.raise({
        key: 'link-outage',
        severity: 'critical',
        title: 'LoRa link outage',
        detail: `${stats.consecutiveLosses} consecutive frames lost. ` +
          (controller.mode === 'failsafe'
            ? 'Fail-safe watchdog forces the pump OFF.'
            : 'Controller holds the last valid command.'),
        sample: frame.sample,
      });
    } else if (stats.consecutiveLosses === 0) {
      this.resolve('link-outage', 'Link recovered');
    }

    if (frame.valid !== false && Number.isFinite(frame.soil)) {
      if (frame.soil < ctx.dry) {
        this.raise({
          key: 'soil-dry',
          severity: 'info',
          title: 'Irrigation started — soil below dry threshold',
          detail: `Soil ${frame.soil.toFixed(1)} % < ${ctx.dry} %. Pump command: ON.`,
          sample: frame.sample,
        });
      } else {
        this.resolve('soil-dry');
      }
      if (frame.soil > ctx.wet) {
        this.raise({
          key: 'soil-wet',
          severity: 'ok',
          title: 'Soil wet enough — irrigation stopped',
          detail: `Soil ${frame.soil.toFixed(1)} % > ${ctx.wet} %. Pump command: OFF.`,
          sample: frame.sample,
        });
      } else {
        this.resolve('soil-wet');
      }
    }

    if (stats.sent >= 10 && stats.pdr !== null && stats.pdr < this.pdrTarget) {
      this.raise({
        key: 'pdr-low',
        severity: 'warning',
        title: 'Delivery ratio below target',
        detail: `PDR ${stats.pdr.toFixed(1)} % < target ${this.pdrTarget} % after ${stats.sent} frames.`,
        sample: frame.sample,
      });
    } else if (stats.pdr === null || stats.pdr >= this.pdrTarget) {
      this.resolve('pdr-low');
    }

    const sensorAlarm = frame.valid !== false && (
      frame.temperature < ctx.temperatureRange[0] || frame.temperature > ctx.temperatureRange[1]
      || frame.humidity < ctx.humidityRange[0] || frame.humidity > ctx.humidityRange[1]
    );
    if (sensorAlarm) {
      this.raise({
        key: 'sensor-range',
        severity: 'warning',
        title: 'Air sensor outside physical range',
        detail: `T ${frame.temperature.toFixed(1)} °C · RH ${frame.humidity.toFixed(1)} % — check the node calibration.`,
        sample: frame.sample,
      });
    } else {
      this.resolve('sensor-range');
    }

    if (controller.mode === 'failsafe' && controller.watchdogTrips > 0) {
      this.raise({
        key: 'watchdog-trip',
        severity: 'critical',
        title: 'Fail-safe watchdog tripped',
        detail: `Watchdog forced the pump OFF ${controller.watchdogTrips} time(s) during this session.`,
        sample: frame.sample,
      });
    }
  }
}
