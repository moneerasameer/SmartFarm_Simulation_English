/**
 * HTML label layer anchored to 3D positions.
 *
 * CSS3D labels are used instead of sprite textures so the text stays crisp at
 * any camera distance and can be styled with the same CSS as the dashboard.
 */

import * as THREE from 'three';

export class LabelLayer {
  constructor(container, camera, canvas) {
    this.container = container;
    this.camera = camera;
    this.canvas = canvas;
    this.items = [];
    this.visible = true;
    this.tmp = new THREE.Vector3();
  }

  /**
   * @param {{id:string, position:THREE.Vector3, className:string, title:string, value:string}} spec
   */
  add(spec) {
    const el = document.createElement('div');
    el.className = `world-label ${spec.className || ''}`;
    const title = document.createElement('span');
    title.textContent = spec.title || '';
    const value = document.createElement('b');
    value.textContent = spec.value || '—';
    el.appendChild(title);
    el.appendChild(value);
    this.container.appendChild(el);
    const item = {
      id: spec.id,
      anchor: spec.position.clone(),
      el,
      valueEl: value,
      titleEl: title,
      className: spec.className || '',
      maxDistance: spec.maxDistance ?? 110,
      visible: true,
    };
    this.items.push(item);
    return item;
  }

  get(id) {
    return this.items.find((item) => item.id === id) || null;
  }

  setValue(id, value) {
    const item = this.get(id);
    if (item) item.valueEl.textContent = value;
  }

  setTitle(id, title) {
    const item = this.get(id);
    if (item) item.titleEl.textContent = title;
  }

  setState(id, { className, stale } = {}) {
    const item = this.get(id);
    if (!item) return;
    if (className !== undefined && className !== item.className) {
      item.className = className;
      item.el.className = `world-label ${className}`;
    }
    if (stale !== undefined) item.el.classList.toggle('stale', Boolean(stale));
  }

  flash(id) {
    const item = this.get(id);
    if (!item) return;
    item.el.classList.add('flash');
    window.setTimeout(() => item.el.classList.remove('flash'), 550);
  }

  setVisible(visible) {
    this.visible = visible;
    this.container.style.display = visible ? '' : 'none';
  }

  toggle() {
    this.setVisible(!this.visible);
    return this.visible;
  }

  clear() {
    this.items.forEach((item) => item.el.remove());
    this.items = [];
  }

  update() {
    if (!this.visible) return;
    const width = this.canvas.clientWidth || 1;
    const height = this.canvas.clientHeight || 1;
    const cameraPosition = this.camera.position;

    this.items.forEach((item) => {
      if (!item.visible) {
        item.el.style.display = 'none';
        return;
      }
      const distance = cameraPosition.distanceTo(item.anchor);
      this.tmp.copy(item.anchor).project(this.camera);
      const behind = this.tmp.z > 1 || this.tmp.z < -1;
      if (behind || distance > item.maxDistance) {
        item.el.style.display = 'none';
        return;
      }
      item.el.style.display = '';
      const x = (this.tmp.x * 0.5 + 0.5) * width;
      const y = (-this.tmp.y * 0.5 + 0.5) * height;
      const scale = THREE.MathUtils.clamp(1.22 - distance / 330, 0.8, 1.05);
      item.el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(2)})`;
      item.el.style.opacity = distance > item.maxDistance * 0.92 ? '0.45' : '1';
    });
  }
}
