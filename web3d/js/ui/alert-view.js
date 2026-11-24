/**
 * Alert list + toast notifications (driven by logic/alerts.js).
 */

const SEVERITY_LABEL = { info: 'INFO', warning: 'WARNING', critical: 'CRITICAL', ok: 'OK' };

export class AlertView {
  constructor() {
    this.list = document.getElementById('alert-list');
    this.summary = document.getElementById('alerts-summary');
    this.toastLayer = document.getElementById('toast-layer');
    this.clearButton = document.getElementById('clear-alerts');
    this.maxVisible = 18;
    this.toastTimers = new Set();
  }

  reset() {
    this.list.textContent = '';
    this.summary.textContent = 'no alerts';
  }

  render(center) {
    const items = center.log.slice(0, this.maxVisible);
    this.list.textContent = '';

    if (items.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'No alerts — telemetry looks nominal.';
      this.list.appendChild(empty);
    } else {
      items.forEach((alert) => {
        const li = document.createElement('li');
        li.className = `${alert.severity}${alert.resolved ? ' resolved' : ''}`;

        const title = document.createElement('b');
        title.textContent = `${SEVERITY_LABEL[alert.severity] || ''} · ${alert.title}`;
        const detail = document.createElement('span');
        detail.textContent = alert.detail || '';
        const meta = document.createElement('span');
        meta.className = 'ts';
        const time = alert.time instanceof Date ? alert.time.toLocaleTimeString('en-GB', { hour12: false }) : '—';
        meta.textContent = `${time} · frame #${alert.sample ?? '—'}${alert.count > 1 ? ` · ×${alert.count}` : ''}${alert.resolved ? ' · resolved' : ''}`;

        li.append(title, detail, meta);
        this.list.appendChild(li);
      });
    }

    const counts = center.counts;
    this.summary.textContent = counts.total === 0
      ? `no active alerts · target PDR ${center.pdrTarget} %`
      : `${counts.total} active · ${counts.warning} warning · ${counts.critical} critical`;
  }

  toast(alert) {
    const toast = document.createElement('div');
    toast.className = `toast ${alert.severity === 'critical' ? 'bad' : (alert.severity === 'warning' ? 'warn' : 'ok')}`;
    const title = document.createElement('b');
    title.textContent = alert.title;
    const detail = document.createElement('span');
    detail.textContent = alert.detail || '';
    toast.append(title, detail);
    this.toastLayer.appendChild(toast);

    const timer = window.setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
      this.toastTimers.delete(timer);
    }, 6500);
    this.toastTimers.add(timer);
  }

  clearToasts() {
    this.toastTimers.forEach((timer) => window.clearTimeout(timer));
    this.toastTimers.clear();
    this.toastLayer.textContent = '';
  }
}
