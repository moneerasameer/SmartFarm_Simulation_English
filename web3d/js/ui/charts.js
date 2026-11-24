/**
 * Chart.js panels. Five charts share the same rolling history window:
 * soil moisture (with the two control thresholds), air temperature, air
 * humidity, packet delivery/loss ratio and the pump command.
 */

import { COLORS, PLAYBACK } from '../config.js';

function baseOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    resizeDelay: 120,
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: 2, right: 4, bottom: 0, left: 0 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(8,16,27,0.95)',
        borderColor: '#1d3149',
        borderWidth: 1,
        titleColor: '#dbe7f4',
        bodyColor: '#8ba3bd',
        titleFont: { size: 10, family: 'monospace' },
        bodyFont: { size: 10, family: 'monospace' },
        padding: 7,
        displayColors: false,
      },
    },
    scales: {
      x: {
        grid: { color: COLORS.grid, drawTicks: false },
        border: { color: '#1d3149' },
        ticks: { color: COLORS.tick, font: { size: 8, family: 'monospace' }, maxTicksLimit: 6, maxRotation: 0 },
      },
      y: {
        grid: { color: COLORS.grid, drawTicks: false },
        border: { color: '#1d3149' },
        ticks: { color: COLORS.tick, font: { size: 8, family: 'monospace' }, maxTicksLimit: 5 },
      },
    },
    ...extra,
  };
}

function lineDataset(label, color, options = {}) {
  return {
    label,
    data: [],
    borderColor: color,
    backgroundColor: options.fill || 'transparent',
    borderWidth: options.width ?? 1.6,
    pointRadius: 0,
    tension: 0.28,
    fill: Boolean(options.fill),
    borderDash: options.dash || [],
    spanGaps: false,
    ...options.extra,
  };
}

export class Charts {
  constructor() {
    this.charts = {};
    if (!window.Chart) {
      throw new Error('Chart.js was not loaded (vendor/chart.umd.js is missing).');
    }
    window.Chart.defaults.font.family = '"SF Mono", Menlo, monospace';
    this.build();
  }

  build() {
    const Chart = window.Chart;

    this.charts.soil = new Chart(document.getElementById('chart-soil'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          lineDataset('Soil moisture', COLORS.soil, { fill: 'rgba(34,211,238,0.10)' }),
          lineDataset('Dry threshold', COLORS.dry, { dash: [4, 4], width: 1 }),
          lineDataset('Wet threshold', '#5eead4', { dash: [4, 4], width: 1 }),
        ],
      },
      options: baseOptions({
        scales: {
          x: baseOptions().scales.x,
          y: { ...baseOptions().scales.y, min: 0, max: 100 },
        },
      }),
    });

    this.charts.temperature = new Chart(document.getElementById('chart-temp'), {
      type: 'line',
      data: { labels: [], datasets: [lineDataset('Temperature', COLORS.temperature, { fill: 'rgba(239,68,68,0.10)' })] },
      options: baseOptions({
        scales: { x: baseOptions().scales.x, y: { ...baseOptions().scales.y, suggestedMin: 15, suggestedMax: 35 } },
      }),
    });

    this.charts.humidity = new Chart(document.getElementById('chart-hum'), {
      type: 'line',
      data: { labels: [], datasets: [lineDataset('Air humidity', COLORS.humidity, { fill: 'rgba(52,211,153,0.10)' })] },
      options: baseOptions({
        scales: { x: baseOptions().scales.x, y: { ...baseOptions().scales.y, min: 0, max: 100 } },
      }),
    });

    this.charts.delivery = new Chart(document.getElementById('chart-delivery'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          lineDataset('PDR', COLORS.pdr, { fill: 'rgba(52,211,153,0.10)' }),
          lineDataset('PLR', COLORS.plr, { dash: [4, 3], width: 1.2 }),
        ],
      },
      options: baseOptions({
        scales: {
          x: baseOptions().scales.x,
          y: {
            ...baseOptions().scales.y,
            min: -5,
            max: 105,
            ticks: {
              color: COLORS.tick,
              font: { size: 8, family: 'monospace' },
              stepSize: 25,
              callback: (value) => (value >= 0 && value <= 100 ? value : ''),
            },
          },
        },
      }),
    });

    this.charts.pump = new Chart(document.getElementById('chart-pump'), {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Controller pump',
            data: [],
            backgroundColor: 'rgba(167,139,250,0.75)',
            borderColor: COLORS.pump,
            borderWidth: 0.5,
            borderRadius: 2,
            barPercentage: 0.9,
            categoryPercentage: 0.95,
          },
          {
            label: 'Recorded pump',
            data: [],
            type: 'line',
            borderColor: '#f59e0b',
            borderDash: [3, 3],
            borderWidth: 1.1,
            pointRadius: 0,
            stepped: true,
            tension: 0,
          },
        ],
      },
      options: baseOptions({
        scales: {
          x: baseOptions().scales.x,
          y: {
            ...baseOptions().scales.y,
            min: -0.1,
            max: 1.25,
            ticks: {
              color: COLORS.tick,
              font: { size: 8, family: 'monospace' },
              stepSize: 1,
              callback: (value) => (value === 1 ? 'ON' : (value === 0 ? 'OFF' : '')),
            },
          },
        },
      }),
    });
  }

  /**
   * Refresh every chart from the rolling history.
   * @param {Array} history processed frames (last N)
   * @param {{dry:number, wet:number}} thresholds
   * @param {boolean} hasRecordedPump
   */
  update(history, thresholds, hasRecordedPump) {
    const visible = history.slice(-PLAYBACK.windowSamples);
    const labels = visible.map((entry) => `#${entry.sample}`);

    let delivered = 0;
    const pdrSeries = [];
    const plrSeries = [];
    visible.forEach((entry, index) => {
      if (entry.received) delivered += 1;
      const pdr = (100 * delivered) / (index + 1);
      pdrSeries.push(pdr);
      plrSeries.push(100 - pdr);
    });

    const soil = this.charts.soil;
    soil.data.labels = labels;
    soil.data.datasets[0].data = visible.map((entry) => (Number.isFinite(entry.soil) ? entry.soil : null));
    soil.data.datasets[1].data = visible.map(() => thresholds.dry);
    soil.data.datasets[2].data = visible.map(() => thresholds.wet);
    soil.update('none');

    const temperature = this.charts.temperature;
    temperature.data.labels = labels;
    temperature.data.datasets[0].data = visible.map((entry) => (Number.isFinite(entry.temperature) ? entry.temperature : null));
    temperature.update('none');

    const humidity = this.charts.humidity;
    humidity.data.labels = labels;
    humidity.data.datasets[0].data = visible.map((entry) => (Number.isFinite(entry.humidity) ? entry.humidity : null));
    humidity.update('none');

    const delivery = this.charts.delivery;
    delivery.data.labels = labels;
    delivery.data.datasets[0].data = pdrSeries;
    delivery.data.datasets[1].data = plrSeries;
    delivery.update('none');

    const pump = this.charts.pump;
    pump.data.labels = labels;
    pump.data.datasets[0].data = visible.map((entry) => entry.pump);
    pump.data.datasets[1].data = hasRecordedPump
      ? visible.map((entry) => (entry.recordedPump === null ? null : (entry.recordedPump ? 1 : 0)))
      : [];
    pump.data.datasets[1].hidden = !hasRecordedPump;
    pump.update('none');
  }

  get count() {
    return Object.keys(this.charts).length;
  }

  resize() {
    Object.values(this.charts).forEach((chart) => chart.resize());
  }

  destroy() {
    Object.values(this.charts).forEach((chart) => chart.destroy());
    this.charts = {};
  }
}
