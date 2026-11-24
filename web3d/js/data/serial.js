/**
 * Web Serial transport (measured data from a real ESP32).
 *
 * Only available in Chromium-based browsers served from localhost/https.
 * The firmware is expected to print one frame per line — see
 * docs/ARCHITECTURE.md for the Arduino sketch.
 */

import { parseFrameLine, resetFrameCounter } from './frame.js';

export class SerialSource {
  constructor({ onFrame, onStatus, onLog, baudRate = 115200 }) {
    this.onFrame = onFrame || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onLog = onLog || (() => {});
    this.baudRate = baudRate;
    this.port = null;
    this.reader = null;
    this.active = false;
    this.loop = null;
  }

  static get supported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  async connect() {
    if (!SerialSource.supported) {
      throw new Error('Web Serial is not available in this browser. Use Chrome/Edge on http://localhost.');
    }
    if (this.active) return;

    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: this.baudRate, bufferSize: 8192 });
    this.active = true;
    resetFrameCounter();
    this.onStatus('connected', `port open @ ${this.baudRate} baud`);
    this.onLog(`connected @ ${this.baudRate} baud`);

    const decoder = new TextDecoderStream();
    this.pipe = this.port.readable.pipeTo(decoder.writable).catch(() => {});
    this.reader = decoder.readable.getReader();

    this.loop = (async () => {
      let buffer = '';
      try {
        while (this.active) {
          const { value, done } = await this.reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop();
          lines.forEach((line) => {
            if (!line.trim()) return;
            const frame = parseFrameLine(line, { source: 'Web Serial' });
            if (frame) {
              this.onFrame(frame);
              this.onLog(line.trim().slice(0, 120));
            } else {
              this.onLog(`ignored: ${line.trim().slice(0, 80)}`);
            }
          });
        }
      } catch (error) {
        if (this.active) this.onStatus('error', String(error.message || error));
      }
    })();
  }

  async disconnect() {
    this.active = false;
    try {
      if (this.reader) await this.reader.cancel();
    } catch (error) { /* reader already closed */ }
    try {
      if (this.pipe) await this.pipe;
    } catch (error) { /* pipe already closed */ }
    try {
      if (this.port) await this.port.close();
    } catch (error) { /* port already closed */ }
    this.port = null;
    this.reader = null;
    this.pipe = null;
    this.loop = null;
    this.onStatus('disconnected', 'serial port closed');
  }
}
