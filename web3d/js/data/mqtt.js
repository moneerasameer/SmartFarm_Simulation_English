/**
 * MQTT over WebSocket transport (measured data from a broker).
 *
 * mqtt.js is vendored at vendor/mqtt.min.js and loaded on demand, so the CSV
 * replay mode works completely offline.
 */

import { parseFrameLine, resetFrameCounter } from './frame.js';

let libraryPromise = null;

function loadMqttLibrary() {
  if (window.mqtt && typeof window.mqtt.connect === 'function') return Promise.resolve(window.mqtt);
  if (libraryPromise) return libraryPromise;
  libraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'vendor/mqtt.min.js';
    script.async = true;
    script.onload = () => {
      if (window.mqtt && typeof window.mqtt.connect === 'function') resolve(window.mqtt);
      else reject(new Error('vendor/mqtt.min.js loaded but window.mqtt is missing.'));
    };
    script.onerror = () => reject(new Error('Could not load vendor/mqtt.min.js.'));
    document.head.appendChild(script);
  });
  return libraryPromise;
}

export class MqttSource {
  constructor({ onFrame, onStatus, onLog }) {
    this.onFrame = onFrame || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onLog = onLog || (() => {});
    this.client = null;
    this.topic = '';
  }

  async connect({ url, topic }) {
    const mqtt = await loadMqttLibrary();
    if (this.client) await this.disconnect();

    this.topic = topic;
    resetFrameCounter();
    this.onStatus('connecting', url);

    const clientId = `smartfarm-3d-${Math.random().toString(16).slice(2, 8)}`;

    await new Promise((resolve, reject) => {
      const client = mqtt.connect(url, {
        clientId,
        clean: true,
        connectTimeout: 6000,
        reconnectPeriod: 0,
        protocolVersion: 4,
      });
      this.client = client;
      let settled = false;

      const fail = (error) => {
        if (settled) return;
        settled = true;
        this.onStatus('error', String(error.message || error));
        try { client.end(true); } catch (err) { /* ignore */ }
        this.client = null;
        reject(new Error(String(error.message || error)));
      };

      client.on('connect', () => {
        client.subscribe(topic, { qos: 0 }, (error) => {
          if (error) {
            fail(error);
            return;
          }
          if (settled) return;
          settled = true;
          this.onStatus('connected', `${url} · ${topic}`);
          this.onLog(`subscribed to ${topic}`);
          resolve();
        });
      });

      client.on('message', (receivedTopic, payload) => {
        const text = payload.toString();
        this.onLog(`${receivedTopic} ← ${text.slice(0, 100)}`);
        const frame = parseFrameLine(text, { source: 'MQTT' });
        if (frame) this.onFrame(frame);
      });

      client.on('error', (error) => fail(error));
      client.on('close', () => {
        if (settled && this.client) this.onStatus('disconnected', 'broker closed the socket');
      });

      window.setTimeout(() => {
        if (!settled) fail(new Error('MQTT connection timed out after 6 s.'));
      }, 6500);
    });
  }

  async disconnect() {
    if (!this.client) return;
    const client = this.client;
    this.client = null;
    try {
      await new Promise((resolve) => {
        client.end(true, {}, () => resolve());
      });
    } catch (error) {
      /* ignore */
    }
    this.onStatus('disconnected', 'mqtt client stopped');
  }
}
