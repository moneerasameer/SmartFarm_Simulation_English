/**
 * Packet monitor: table of transmitted frames and the transmission-stage
 * indicator that follows the flying packet in the 3D view.
 */

const STAGES = ['sensor', 'node', 'tx', 'gateway', 'server', 'db', 'dashboard'];

export class PacketView {
  constructor() {
    this.tbody = document.getElementById('packet-tbody');
    this.spans = Array.from(document.querySelectorAll('#stage-chain span'));
    this.tag = document.getElementById('flight-tag');
    this.sampleEl = document.getElementById('flight-sample');
    this.titleEl = document.getElementById('flight-title');
    this.detailEl = document.getElementById('flight-detail');
    this.rows = new Map();
    this.order = [];
    this.maxRows = 44;
  }

  reset() {
    this.tbody.textContent = '';
    this.rows.clear();
    this.order = [];
    this.resetStages();
    this.setFlight({
      tag: 'DATA FLOW',
      sample: '—',
      title: 'Waiting for telemetry…',
      detail: 'Sensor → ESP32 → LoRa TX → Gateway → Server → Dashboard',
    });
  }

  resetStages() {
    this.spans.forEach((span) => {
      span.className = '';
    });
  }

  setStage(stage, zoneId = '') {
    this.spans.forEach((span) => { span.className = ''; });
    if (stage === 'lost') {
      this.spans.forEach((span) => {
        const key = span.dataset.stage;
        if (STAGES.indexOf(key) <= STAGES.indexOf('tx')) span.className = 'done';
      });
      const gateway = this.spans.find((span) => span.dataset.stage === 'gateway');
      if (gateway) gateway.className = 'fail';
      return;
    }
    const index = STAGES.indexOf(stage);
    this.spans.forEach((span) => {
      const position = STAGES.indexOf(span.dataset.stage);
      if (position < index) span.className = 'done';
      else if (position === index) span.className = 'active';
    });
    if (stage === 'dashboard') {
      this.spans.forEach((span) => { span.className = 'done'; });
    }
    if (zoneId) this.sampleEl.dataset.zone = zoneId;
  }

  setFlight({ tag, sample, title, detail, tone }) {
    if (tag !== undefined) {
      this.tag.textContent = tag;
      this.tag.className = `flight-tag${tone === 'lost' ? ' lost' : ''}`;
    }
    if (sample !== undefined) this.sampleEl.textContent = sample;
    if (title !== undefined) this.titleEl.textContent = title;
    if (detail !== undefined) this.detailEl.textContent = detail;
  }

  addPacket({ sample, zoneId, latencyMs, rssiDbm, snrDb, received }) {
    const tr = document.createElement('tr');
    if (!received) tr.className = 'lost new';
    else tr.className = 'new';

    const cellSample = document.createElement('td');
    cellSample.textContent = `#${sample}`;

    const cellStatus = document.createElement('td');
    const statusTag = document.createElement('span');
    statusTag.className = 'status-tag status-ok';
    statusTag.textContent = 'SENT';
    cellStatus.appendChild(statusTag);

    const cellArrived = document.createElement('td');
    cellArrived.textContent = '—';

    const cellLatency = document.createElement('td');
    cellLatency.textContent = `${latencyMs.toFixed(0)} ms`;

    const cellRssi = document.createElement('td');
    cellRssi.textContent = Number.isFinite(rssiDbm) ? rssiDbm.toFixed(1) : '—';

    const cellSnr = document.createElement('td');
    cellSnr.textContent = Number.isFinite(snrDb) ? snrDb.toFixed(1) : '—';

    const cellPath = document.createElement('td');
    cellPath.textContent = `${zoneId}→ESP32→GW`;

    tr.append(cellSample, cellStatus, cellArrived, cellLatency, cellRssi, cellSnr, cellPath);
    this.tbody.prepend(tr);

    const entry = {
      tr,
      statusTag,
      arrivedCell: cellArrived,
      received,
    };
    this.rows.set(`${sample}-${zoneId}`, entry);
    this.order.unshift(`${sample}-${zoneId}`);
    while (this.order.length > this.maxRows) {
      const key = this.order.pop();
      const row = this.rows.get(key);
      if (row && row.tr.parentNode) row.tr.parentNode.removeChild(row.tr);
      this.rows.delete(key);
    }
    return entry;
  }

  markArrived(sample, zoneId, status) {
    const entry = this.rows.get(`${sample}-${zoneId}`);
    if (!entry) return;
    entry.statusTag.textContent = status === 'delivered' ? 'DELIVERED' : 'LOST';
    entry.statusTag.className = `status-tag ${status === 'delivered' ? 'status-ok' : 'status-lost'}`;
    entry.arrivedCell.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
    if (status === 'lost') entry.tr.classList.add('lost');
    entry.tr.classList.remove('new');
  }
}
