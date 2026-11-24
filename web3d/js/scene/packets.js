/**
 * Animated telemetry packets.
 *
 * One glowing packet travels along the 3D path
 *   soil sensor → ESP32 node → LoRa TX → gateway → edge server → dashboard
 * for every replayed frame. When the recorded frame was lost, the packet stops
 * in mid-air between the transmitter and the gateway, turns red and fades out.
 */

import * as THREE from 'three';
import { SITE, PLAYBACK } from '../config.js';

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(160,250,255,0.9)');
  gradient.addColorStop(0.6, 'rgba(34,211,238,0.28)');
  gradient.addColorStop(1, 'rgba(34,211,238,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function ringTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(32, 32, 24, 0, Math.PI * 2);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export const STAGE_SEQUENCE = ['sensor', 'node', 'tx', 'gateway', 'server', 'db', 'dashboard'];

export class PacketAnimator {
  constructor({ scene, paths, onStage, onArrive }) {
    this.scene = scene;
    this.paths = paths;
    this.onStage = onStage || (() => {});
    this.onArrive = onArrive || (() => {});
    this.packets = [];
    this.effects = [];
    this.geometry = new THREE.SphereGeometry(0.16, 12, 10);
    this.glowMap = glowTexture();
    this.ringMap = ringTexture();
    this.maxPackets = 60;
  }

  stageFor(path, u) {
    const { u: marks } = path;
    if (u < marks.node) return 'sensor';
    if (u < marks.tx) return 'node';
    if (u < marks.gateway) return 'tx';
    if (u < marks.server) return 'gateway';
    if (u < marks.db) return 'server';
    if (u < marks.screen) return 'db';
    return 'dashboard';
  }

  /**
   * Emit every stage crossed since the last update. On a fast GPU the packet
   * moves a few percent per frame, but on a slow machine (or in headless
   * capture) one update can cross several thresholds; the presentation must
   * still receive each stage in order instead of skipping it.
   */
  advanceStage(packet, target) {
    const to = STAGE_SEQUENCE.indexOf(target);
    if (to < 0) return;
    const from = STAGE_SEQUENCE.indexOf(packet.stage);
    for (let index = Math.max(from + 1, 0); index <= to; index += 1) {
      packet.stage = STAGE_SEQUENCE[index];
      this.onStage(packet, packet.stage);
    }
  }

  spawn({ zoneId, sample, received, latencyMs, rssiDbm, snrDb }) {
    const path = this.paths[zoneId] || this.paths[SITE.zones[0].id];
    if (!path) return null;
    if (this.packets.length > this.maxPackets) this.clear();
    this.finalizeOlder(sample);

    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0x9ff7ff, transparent: true, opacity: 1, toneMapped: false,
    });
    const core = new THREE.Mesh(this.geometry, coreMaterial);
    core.scale.setScalar(received ? 1 : 0.9);

    const spriteMaterial = new THREE.SpriteMaterial({
      map: this.glowMap, color: 0x9ff7ff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const glow = new THREE.Sprite(spriteMaterial);
    glow.scale.setScalar(1.7);

    const trailMaterial = new THREE.SpriteMaterial({
      map: this.glowMap, color: 0x22d3ee, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const trail = new THREE.Sprite(trailMaterial);
    trail.scale.setScalar(1.0);

    const group = new THREE.Group();
    group.add(glow);
    group.add(trail);
    group.add(core);
    group.position.copy(path.curve.getPointAt(0));
    this.scene.add(group);

    const lostAt = path.u.tx + (path.u.gateway - path.u.tx) * (0.34 + (sample % 4) * 0.11);

    const packet = {
      group, core, coreMaterial,
      glowMaterial: spriteMaterial,
      trailMaterial, trail, path,
      zoneId, sample, received, latencyMs,
      rssiDbm: Number.isFinite(rssiDbm) ? rssiDbm : NaN,
      snrDb: Number.isFinite(snrDb) ? snrDb : NaN,
      u: 0, lostAt, stage: 'sensor',
      finished: false, lost: false, fade: 0, done: false,
    };
    this.packets.push(packet);
    this.onStage(packet, 'sensor');
    return packet;
  }

  /**
   * Safety net for very low frame rates (background tabs, headless capture):
   * when a frame two samples newer is transmitted, any packet that has not
   * reached the dashboard yet is finalised using its recorded outcome, so the
   * packet table and the alert log never miss a delivery/loss event.
   */
  finalizeOlder(currentSample) {
    const current = Number(currentSample);
    if (!Number.isFinite(current)) return;

    this.packets.forEach((packet) => {
      if (packet.finished) return;
      if (!Number.isFinite(packet.sample) || packet.sample >= current - 1) return;

      packet.finished = true;
      if (packet.received) {
        packet.u = 1;
        packet.group.position.copy(packet.path.curve.getPointAt(1));
        this.addEffect(packet.group.position, 0x34d399, 1.4);
        this.advanceStage(packet, 'dashboard');
        this.onArrive(packet, { status: 'delivered', u: 1, forced: true });
      } else {
        packet.lost = true;
        packet.u = Math.max(packet.u, packet.lostAt);
        packet.group.position.copy(packet.path.curve.getPointAt(Math.min(packet.u, 1)));
        this.advanceStage(packet, 'tx');
        packet.coreMaterial.color.setHex(0xff5a5a);
        packet.glowMaterial.color.setHex(0xff3b3b);
        packet.trailMaterial.opacity = 0;
        this.addEffect(packet.group.position, 0xff4d4d, 1.2);
        this.onStage(packet, 'lost');
        this.onArrive(packet, { status: 'lost', u: packet.u, forced: true });
      }
    });
  }

  addEffect(position, color, scale) {
    const material = new THREE.SpriteMaterial({
      map: this.ringMap, color, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.setScalar(scale || 1);
    this.scene.add(sprite);
    this.effects.push({ sprite, material, life: 0, duration: 0.8, scale: scale || 1 });
  }

  update(dt, speedFactor = 1) {
    for (let i = this.packets.length - 1; i >= 0; i -= 1) {
      const packet = this.packets[i];
      if (packet.done) {
        this.scene.remove(packet.group);
        packet.coreMaterial.dispose();
        packet.glowMaterial.dispose();
        packet.trailMaterial.dispose();
        this.packets.splice(i, 1);
        continue;
      }

      if (!packet.finished) {
        const duration = PLAYBACK.packetFlightSeconds / Math.max(speedFactor, 0.25);
        packet.u = Math.min(1, packet.u + dt / duration);

        if (!packet.received && packet.u >= packet.lostAt) {
          packet.finished = true;
          packet.lost = true;
          packet.group.position.copy(packet.path.curve.getPointAt(Math.min(packet.u, packet.lostAt)));
          this.advanceStage(packet, this.stageFor(packet.path, Math.min(packet.u, packet.lostAt)));
          packet.coreMaterial.color.setHex(0xff5a5a);
          packet.glowMaterial.color.setHex(0xff3b3b);
          packet.trailMaterial.opacity = 0;
          packet.glowMaterial.opacity = 1;
          this.addEffect(packet.group.position, 0xff4d4d, 1.4);
          this.onArrive(packet, { status: 'lost', u: packet.u });
          this.onStage(packet, 'lost');
        } else {
          const position = packet.path.curve.getPointAt(packet.u);
          packet.group.position.copy(position);

          const trailU = Math.max(0, packet.u - 0.018);
          packet.trail.position.copy(packet.path.curve.getPointAt(trailU)).sub(position);
          packet.trailMaterial.opacity = 0.25 + 0.25 * Math.sin(packet.u * 40);

          this.advanceStage(packet, this.stageFor(packet.path, packet.u));

          if (packet.u >= 1) {
            packet.finished = true;
            this.addEffect(packet.group.position, 0x34d399, 1.8);
            this.onArrive(packet, { status: 'delivered', u: 1 });
          }
        }
      } else {
        packet.fade += dt / 0.45;
        const opacity = Math.max(0, 1 - packet.fade);
        packet.coreMaterial.opacity = opacity;
        packet.glowMaterial.opacity = opacity;
        packet.trailMaterial.opacity = 0;
        packet.core.scale.setScalar((packet.lost ? 1.6 : 1.1) + packet.fade * 1.4);
        if (packet.fade >= 1) packet.done = true;
      }
    }

    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const effect = this.effects[i];
      effect.life += dt;
      const k = effect.life / effect.duration;
      effect.sprite.scale.setScalar(effect.scale * (1 + k * 2.4));
      effect.material.opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) {
        this.scene.remove(effect.sprite);
        effect.material.dispose();
        this.effects.splice(i, 1);
      }
    }
  }

  clear() {
    this.packets.forEach((packet) => {
      this.scene.remove(packet.group);
      packet.coreMaterial.dispose();
      packet.glowMaterial.dispose();
      packet.trailMaterial.dispose();
    });
    this.effects.forEach((effect) => {
      this.scene.remove(effect.sprite);
      effect.material.dispose();
    });
    this.packets = [];
    this.effects = [];
  }

  get activeCount() {
    return this.packets.length;
  }
}
