/**
 * Three.js world: ground, fields, plants, irrigation hardware, sensors,
 * ESP32/LoRa nodes, gateway, edge server and the monitoring station.
 *
 * The module returns a small imperative API (setTelemetry, setPump, setView,
 * render, resize) that main.js drives from the processed telemetry frames.
 * All geometry is procedural — no external 3D assets are required.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SITE } from '../config.js';
import { LabelLayer } from './labels.js';

/* ------------------------------------------------------------------ */
/* Deterministic pseudo-random generator (reproducible plant layout)   */
/* ------------------------------------------------------------------ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Procedural canvas textures (offline, no external images)            */
/* ------------------------------------------------------------------ */
function canvasTexture(size, paint, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  paint(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function grassTexture() {
  return canvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#36582e';
    ctx.fillRect(0, 0, size, size);
    const rnd = mulberry32(11);
    for (let i = 0; i < 2200; i += 1) {
      const x = rnd() * size;
      const y = rnd() * size;
      const shade = 28 + Math.floor(rnd() * 42);
      ctx.fillStyle = `rgba(${shade + 22}, ${shade + 58}, ${shade + 12}, ${0.25 + rnd() * 0.4})`;
      ctx.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 3);
    }
    for (let i = 0; i < 40; i += 1) {
      ctx.strokeStyle = `rgba(180, 205, 130, ${0.05 + rnd() * 0.06})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rnd() * size, rnd() * size);
      ctx.lineTo(rnd() * size, rnd() * size);
      ctx.stroke();
    }
  }, 26, 16);
}

function soilTexture() {
  return canvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#4b3524';
    ctx.fillRect(0, 0, size, size);
    const rnd = mulberry32(29);
    for (let i = 0; i < 1600; i += 1) {
      const shade = 40 + Math.floor(rnd() * 60);
      ctx.fillStyle = `rgba(${shade + 18}, ${shade}, ${Math.max(10, shade - 16)}, ${0.2 + rnd() * 0.35})`;
      ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 3, 1 + rnd() * 3);
    }
    for (let y = 12; y < size; y += 34) {
      ctx.fillStyle = 'rgba(28, 18, 12, 0.45)';
      ctx.fillRect(0, y, size, 6);
      ctx.fillStyle = 'rgba(120, 90, 60, 0.18)';
      ctx.fillRect(0, y + 6, size, 2);
    }
  }, 5, 3);
}

function earthTexture() {
  return canvasTexture(128, (ctx, size) => {
    ctx.fillStyle = '#33251a';
    ctx.fillRect(0, 0, size, size);
    const rnd = mulberry32(7);
    for (let i = 0; i < 500; i += 1) {
      const shade = 26 + Math.floor(rnd() * 40);
      ctx.fillStyle = `rgba(${shade + 20}, ${shade + 6}, ${shade - 6}, 0.5)`;
      ctx.fillRect(rnd() * size, rnd() * size, 2 + rnd() * 4, 2 + rnd() * 4);
    }
  }, 8, 5);
}

function concreteTexture() {
  return canvasTexture(128, (ctx, size) => {
    ctx.fillStyle = '#6d7a86';
    ctx.fillRect(0, 0, size, size);
    const rnd = mulberry32(53);
    for (let i = 0; i < 900; i += 1) {
      const shade = 90 + Math.floor(rnd() * 50);
      ctx.fillStyle = `rgba(${shade}, ${shade + 6}, ${shade + 12}, 0.22)`;
      ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    ctx.strokeStyle = 'rgba(35, 45, 55, 0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(rnd() * size, 0);
      ctx.lineTo(rnd() * size, size);
      ctx.stroke();
    }
  }, 6, 2);
}

function flowTexture() {
  return canvasTexture(128, (ctx, size) => {
    ctx.fillStyle = '#54708a';
    ctx.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 24) {
      ctx.fillStyle = 'rgba(150, 240, 255, 0.95)';
      ctx.fillRect(x, 18, 8, 18);
      ctx.fillStyle = 'rgba(80, 200, 230, 0.45)';
      ctx.fillRect(x + 8, 22, 5, 10);
    }
    ctx.fillStyle = 'rgba(12, 26, 38, 0.55)';
    ctx.fillRect(0, 0, size, 10);
    ctx.fillRect(0, size - 10, size, 10);
  }, 1, 1);
}

/* ------------------------------------------------------------------ */
/* Small geometry helpers                                              */
/* ------------------------------------------------------------------ */
function addMesh(parent, geometry, material, options = {}) {
  const object = new THREE.Mesh(geometry, material);
  if (options.position) object.position.set(options.position[0], options.position[1], options.position[2]);
  if (options.rotation) object.rotation.set(options.rotation[0], options.rotation[1], options.rotation[2]);
  object.castShadow = options.castShadow !== false;
  object.receiveShadow = options.receiveShadow !== false;
  parent.add(object);
  return object;
}

function addBox(parent, size, position, material, options = {}) {
  return addMesh(parent, new THREE.BoxGeometry(size[0], size[1], size[2]), material, { ...options, position });
}

function addCylinder(parent, radiusTop, radiusBottom, height, position, material, options = {}) {
  return addMesh(
    parent,
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, options.segments || 16),
    material,
    { ...options, position, segments: undefined },
  );
}

function addTube(parent, points, radius, material, tubularSegments = 64) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'catmullrom', 0.15);
  const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, 10, false);
  return addMesh(parent, geometry, material, { castShadow: true, receiveShadow: true });
}

/* ================================================================== */
/* World factory                                                       */
/* ================================================================== */
export function createWorld({ canvas, labelsContainer }) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0d2130, 150, 300);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 700);
  const overview = SITE.camera.overview;
  camera.position.set(overview.position[0], overview.position[1], overview.position[2]);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(overview.target[0], overview.target[1], overview.target[2]);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 7;
  controls.maxDistance = 175;
  controls.maxPolarAngle = Math.PI * 0.487;
  controls.minPolarAngle = Math.PI * 0.06;
  controls.panSpeed = 0.8;
  controls.rotateSpeed = 0.7;
  controls.update();

  /* ---------------- sky dome (vertex-coloured gradient) ---------------- */
  const skyGeometry = new THREE.SphereGeometry(320, 32, 20);
  const skyColors = [];
  const skyTop = new THREE.Color('#040a12');
  const skyBottom = new THREE.Color('#1f4a5e');
  const positionAttribute = skyGeometry.attributes.position;
  const tmpColor = new THREE.Color();
  for (let i = 0; i < positionAttribute.count; i += 1) {
    const h = positionAttribute.getY(i) / 320;
    const t = THREE.MathUtils.smoothstep(h, -0.04, 0.62);
    tmpColor.copy(skyBottom).lerp(skyTop, t);
    skyColors.push(tmpColor.r, tmpColor.g, tmpColor.b);
  }
  skyGeometry.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
  const sky = new THREE.Mesh(
    skyGeometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  scene.add(sky);

  /* ---------------- lighting ---------------- */
  const hemi = new THREE.HemisphereLight(0xcfeaff, 0x3a4a26, 1.55);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2da, 2.85);
  sun.position.set(52, 82, 38);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.left = -78;
  sun.shadow.camera.right = 78;
  sun.shadow.camera.top = 78;
  sun.shadow.camera.bottom = -78;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 230;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  sun.target.position.set(0, 0, 0);
  scene.add(sun);
  scene.add(sun.target);

  const rimLight = new THREE.DirectionalLight(0x74c7ff, 0.55);
  rimLight.position.set(-55, 34, -48);
  scene.add(rimLight);
  scene.add(new THREE.AmbientLight(0x3f5d78, 0.55));

  /* ---------------- materials ---------------- */
  const materials = {
    grass: new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 0.96, metalness: 0 }),
    earth: new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 1, metalness: 0 }),
    soil: new THREE.MeshStandardMaterial({ map: soilTexture(), roughness: 1, metalness: 0 }),
    concrete: new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.9, metalness: 0.05 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x6d8496, roughness: 0.42, metalness: 0.65 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x2a3542, roughness: 0.55, metalness: 0.55 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b4c2f, roughness: 0.9, metalness: 0 }),
    white: new THREE.MeshStandardMaterial({ color: 0xe8eef4, roughness: 0.55, metalness: 0.1 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x69c7e6, roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.42,
    }),
    leaves: new THREE.MeshStandardMaterial({ color: 0x2f7d32, roughness: 0.85, metalness: 0 }),
    stem: new THREE.MeshStandardMaterial({ color: 0x4f7d34, roughness: 0.9, metalness: 0 }),
  };

  /* ---------------- static farm base ---------------- */
  const world = new THREE.Group();
  scene.add(world);

  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(SITE.platform.width, SITE.platform.height, SITE.platform.depth),
    [materials.earth, materials.earth, materials.grass, materials.earth, materials.earth, materials.earth],
  );
  platform.position.y = -SITE.platform.height / 2;
  platform.receiveShadow = true;
  platform.castShadow = true;
  world.add(platform);

  addMesh(world, new THREE.PlaneGeometry(60, 4.4), materials.concrete, {
    position: [-16, 0.02, 6.5], rotation: [-Math.PI / 2, 0, 0], castShadow: false,
  });
  addMesh(world, new THREE.PlaneGeometry(4.4, 34), materials.concrete, {
    position: [-16, 0.021, 2], rotation: [-Math.PI / 2, 0, 0], castShadow: false,
  });
  addMesh(world, new THREE.PlaneGeometry(22, 15), materials.concrete, {
    position: [36, 0.02, 13], rotation: [-Math.PI / 2, 0, 0], castShadow: false,
  });
  addMesh(world, new THREE.PlaneGeometry(11, 11), materials.concrete, {
    position: [29, 0.02, -23], rotation: [-Math.PI / 2, 0, 0], castShadow: false,
  });
  addMesh(world, new THREE.PlaneGeometry(7, 5), materials.concrete, {
    position: [22, 0.02, -12], rotation: [-Math.PI / 2, 0, 0], castShadow: false,
  });

  /* ---------------- crop fields ---------------- */
  const zoneVisuals = {};
  const cropHeadMaterials = {
    tomato: new THREE.MeshStandardMaterial({ color: 0x3f8f3a, roughness: 0.8 }),
    maize: new THREE.MeshStandardMaterial({ color: 0x7e9c3e, roughness: 0.8 }),
    lettuce: new THREE.MeshStandardMaterial({ color: 0x6fb548, roughness: 0.75 }),
    beans: new THREE.MeshStandardMaterial({ color: 0x2f7d44, roughness: 0.8 }),
  };

  SITE.zones.forEach((zone) => {
    const group = new THREE.Group();
    world.add(group);
    const bedTop = 0.5;
    const halfX = zone.size.x / 2;
    const halfZ = zone.size.z / 2;

    addBox(group, [zone.size.x, 0.5, zone.size.z], [zone.center.x, 0.25, zone.center.z], materials.soil, {
      castShadow: false, receiveShadow: true,
    });

    // wooden edge around each bed
    const edgeMaterial = materials.wood;
    addBox(group, [zone.size.x + 0.3, 0.18, 0.28], [zone.center.x, 0.58, zone.center.z - halfZ], edgeMaterial, { castShadow: false });
    addBox(group, [zone.size.x + 0.3, 0.18, 0.28], [zone.center.x, 0.58, zone.center.z + halfZ], edgeMaterial, { castShadow: false });
    addBox(group, [0.28, 0.18, zone.size.z + 0.3], [zone.center.x - halfX, 0.58, zone.center.z], edgeMaterial, { castShadow: false });
    addBox(group, [0.28, 0.18, zone.size.z + 0.3], [zone.center.x + halfX, 0.58, zone.center.z], edgeMaterial, { castShadow: false });

    // plants (instanced: one draw call per part)
    const rnd = mulberry32(101 + zone.id.charCodeAt(0) * 17);
    const rows = 4;
    const cols = 8;
    const count = rows * cols;
    const stemGeometry = new THREE.CylinderGeometry(0.055, 0.075, 0.62, 5);
    const crop = zone.crop;
    let headGeometry;
    let headOffset;
    let headScale;
    if (crop === 'maize') {
      headGeometry = new THREE.ConeGeometry(0.22, 1.25, 6);
      headOffset = 0.95;
      headScale = [1, 1, 1];
    } else if (crop === 'lettuce') {
      headGeometry = new THREE.SphereGeometry(0.34, 8, 6);
      headOffset = 0.34;
      headScale = [1.12, 0.62, 1.12];
    } else if (crop === 'beans') {
      headGeometry = new THREE.SphereGeometry(0.3, 7, 6);
      headOffset = 0.62;
      headScale = [1, 0.82, 1];
    } else {
      headGeometry = new THREE.SphereGeometry(0.34, 8, 6);
      headOffset = 0.78;
      headScale = [1, 0.92, 1];
    }

    const stems = new THREE.InstancedMesh(stemGeometry, materials.stem, count);
    const heads = new THREE.InstancedMesh(headGeometry, cropHeadMaterials[crop], count);
    stems.castShadow = true;
    stems.receiveShadow = true;
    heads.castShadow = true;
    heads.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let index = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = zone.center.x - halfX + 1.7 + (col * (zone.size.x - 3.4)) / (cols - 1) + (rnd() - 0.5) * 0.3;
        const z = zone.center.z - halfZ + 1.9 + (row * (zone.size.z - 3.8)) / (rows - 1) + (rnd() - 0.5) * 0.3;
        const scale = 0.82 + rnd() * 0.36;
        dummy.position.set(x, bedTop + 0.31 * scale, z);
        dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        stems.setMatrixAt(index, dummy.matrix);

        dummy.position.set(x, bedTop + headOffset * scale, z);
        dummy.scale.set(headScale[0] * scale, headScale[1] * scale, headScale[2] * scale);
        dummy.updateMatrix();
        heads.setMatrixAt(index, dummy.matrix);
        index += 1;
      }
    }
    stems.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    group.add(stems);
    group.add(heads);

    // pulsing highlight ring that follows the active telemetry source
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.3, 0.075, 8, 44),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.0, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(zone.soilSensor.x, 0.6, zone.soilSensor.z);
    world.add(ring);

    zoneVisuals[zone.id] = { group, ring, bedTop };
  });

  /* ---------------- water tank ---------------- */
  const tankSpec = SITE.tanks[0];
  const tankGroup = new THREE.Group();
  world.add(tankGroup);
  const tankBaseY = 2.2;
  const tankTopY = tankBaseY + tankSpec.height;

  [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]].forEach(([dx, dz]) => {
    addCylinder(tankGroup, 0.15, 0.18, tankBaseY, [tankSpec.x + dx, tankBaseY / 2, tankSpec.z + dz], materials.darkMetal);
  });

  addMesh(
    tankGroup,
    new THREE.CylinderGeometry(tankSpec.radius, tankSpec.radius, tankSpec.height, 28, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x5f7f93, roughness: 0.5, metalness: 0.55, side: THREE.DoubleSide }),
    { position: [tankSpec.x, tankBaseY + tankSpec.height / 2, tankSpec.z] },
  );
  [0.18, 0.5, 0.82].forEach((fraction) => {
    addMesh(
      tankGroup,
      new THREE.TorusGeometry(tankSpec.radius + 0.02, 0.07, 6, 32),
      materials.metal,
      { position: [tankSpec.x, tankBaseY + tankSpec.height * fraction, tankSpec.z], rotation: [Math.PI / 2, 0, 0] },
    );
  });
  addMesh(tankGroup, new THREE.CylinderGeometry(tankSpec.radius, tankSpec.radius, 0.18, 28), materials.darkMetal, {
    position: [tankSpec.x, tankTopY, tankSpec.z],
  });
  addMesh(tankGroup, new THREE.CylinderGeometry(0.6, 0.6, 0.22, 16), materials.metal, {
    position: [tankSpec.x, tankTopY + 0.18, tankSpec.z],
  });

  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x1d8dc0, roughness: 0.22, metalness: 0.1, transparent: true, opacity: 0.8,
    emissive: 0x0a4d66, emissiveIntensity: 0.35,
  });
  const waterFill = addMesh(
    tankGroup,
    new THREE.CylinderGeometry(tankSpec.radius - 0.18, tankSpec.radius - 0.18, tankSpec.height * 0.62, 28),
    waterMaterial,
    { position: [tankSpec.x, tankBaseY + tankSpec.height * 0.31, tankSpec.z], castShadow: false },
  );
  const waterSurfaceMaterial = new THREE.MeshStandardMaterial({
    color: 0x6fdcff, roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.85,
    emissive: 0x1aa3cc, emissiveIntensity: 0.45,
  });
  const waterSurface = addMesh(
    tankGroup,
    new THREE.CircleGeometry(tankSpec.radius - 0.2, 32),
    waterSurfaceMaterial,
    { position: [tankSpec.x, tankBaseY + tankSpec.height * 0.62, tankSpec.z], rotation: [-Math.PI / 2, 0, 0], castShadow: false },
  );

  for (let i = 0; i < 7; i += 1) {
    addBox(tankGroup, [0.07, 0.06, 0.46], [tankSpec.x + tankSpec.radius + 0.12, 2.5 + i * 0.62, tankSpec.z], materials.metal);
  }
  addBox(tankGroup, [0.07, 4.5, 0.07], [tankSpec.x + tankSpec.radius + 0.12, 4.4, tankSpec.z - 0.22], materials.metal);
  addBox(tankGroup, [0.07, 4.5, 0.07], [tankSpec.x + tankSpec.radius + 0.12, 4.4, tankSpec.z + 0.22], materials.metal);

  /* ---------------- pump ---------------- */
  const pumpGroup = new THREE.Group();
  world.add(pumpGroup);
  const pumpX = SITE.pump.x;
  const pumpZ = SITE.pump.z;
  addBox(pumpGroup, [2.8, 0.28, 2.1], [pumpX, 0.14, pumpZ], materials.darkMetal);
  const motorMaterial = new THREE.MeshStandardMaterial({ color: 0x3f6f92, roughness: 0.42, metalness: 0.6 });
  addMesh(pumpGroup, new THREE.CylinderGeometry(0.62, 0.62, 1.8, 20), motorMaterial, {
    position: [pumpX, 0.95, pumpZ], rotation: [0, 0, Math.PI / 2],
  });
  addMesh(pumpGroup, new THREE.CylinderGeometry(0.5, 0.62, 0.55, 20), materials.metal, {
    position: [pumpX + 1.05, 0.95, pumpZ], rotation: [0, 0, Math.PI / 2],
  });
  addBox(pumpGroup, [0.5, 0.5, 0.5], [pumpX - 1.1, 0.85, pumpZ], materials.darkMetal);
  addCylinder(pumpGroup, 0.16, 0.16, 1.4, [pumpX + 1.1, 1.7, pumpZ], materials.metal);
  addCylinder(pumpGroup, 0.16, 0.16, 1.3, [pumpX, 1.62, pumpZ], materials.metal);

  const impeller = new THREE.Group();
  impeller.position.set(pumpX + 1.32, 0.95, pumpZ);
  for (let i = 0; i < 4; i += 1) {
    const blade = addBox(impeller, [0.06, 0.42, 0.1], [0, 0, 0], materials.white, { castShadow: false });
    blade.rotation.x = (Math.PI / 2) * i;
    blade.position.set(0, Math.cos((Math.PI / 2) * i) * 0.22, Math.sin((Math.PI / 2) * i) * 0.22);
  }
  pumpGroup.add(impeller);

  const pumpLedMaterial = new THREE.MeshStandardMaterial({
    color: 0x333333, emissive: 0x34d399, emissiveIntensity: 0.0, roughness: 0.4,
  });
  addMesh(pumpGroup, new THREE.SphereGeometry(0.11, 12, 10), pumpLedMaterial, {
    position: [pumpX + 1.32, 1.55, pumpZ], castShadow: false,
  });

  /* ---------------- pipes, valves and drip lines ---------------- */
  const flowMap = flowTexture();
  flowMap.repeat.set(34, 1);
  const pipeMaterial = new THREE.MeshStandardMaterial({
    map: flowMap, color: 0xbcd2e0, roughness: 0.36, metalness: 0.55,
    emissive: 0x0a4155, emissiveIntensity: 0.25,
  });

  addTube(world, [
    [tankSpec.x, 0.55, tankSpec.z - 2.2],
    [tankSpec.x, 0.55, pumpZ + 1.2],
    [tankSpec.x, 0.95, pumpZ + 0.6],
  ], 0.2, pipeMaterial, 40);

  addTube(world, [
    [pumpX + 0.2, 2.3, pumpZ],
    [pumpX + 0.2, 0.55, pumpZ],
    [pumpX + 0.2, 0.55, 6.5],
    [8, 0.55, 6.5],
  ], 0.24, pipeMaterial, 120);

  SITE.pipes.risers.forEach((riser) => {
    addTube(world, [
      [riser.x, 0.55, 6.5],
      [riser.x, 0.55, riser.toZ],
    ], 0.16, pipeMaterial, 24);
    addBox(world, [0.55, 0.55, 0.5], [riser.x, 0.52, riser.toZ], materials.darkMetal);
    addBox(world, [0.42, 0.42, 0.34], [riser.x, 0.92, riser.toZ], new THREE.MeshStandardMaterial({ color: 0x2f7d55, roughness: 0.6, metalness: 0.4 }));
  });

  SITE.zones.forEach((zone) => {
    [-2.9, 0, 2.9].forEach((offset) => {
      addTube(world, [
        [zone.center.x - zone.size.x / 2 + 1.2, 0.53, zone.center.z + offset],
        [zone.center.x + zone.size.x / 2 - 1.2, 0.53, zone.center.z + offset],
      ], 0.055, pipeMaterial, 36);
    });
  });

  /* ---------------- soil moisture sensors ---------------- */
  const soilSensors = {};
  SITE.zones.forEach((zone) => {
    const group = new THREE.Group();
    world.add(group);
    const x = zone.soilSensor.x;
    const z = zone.soilSensor.z;
    addCylinder(group, 0.045, 0.045, 0.95, [x, 0.98, z], materials.metal, { segments: 8 });
    addCylinder(group, 0.028, 0.028, 0.55, [x, 0.28, z], materials.metal, { segments: 8 });
    addBox(group, [0.34, 0.24, 0.2], [x, 1.5, z], materials.white);
    const ledMaterial = new THREE.MeshStandardMaterial({
      color: 0x0b2c35, emissive: 0x22d3ee, emissiveIntensity: 0.9, roughness: 0.3,
    });
    addMesh(group, new THREE.SphereGeometry(0.07, 10, 8), ledMaterial, {
      position: [x, 1.5, z + 0.12], castShadow: false,
    });
    addBox(group, [0.44, 0.04, 0.3], [x, 1.66, z], new THREE.MeshStandardMaterial({
      color: 0x1d3557, roughness: 0.35, metalness: 0.5,
    }), { rotation: [-0.18, 0, 0], castShadow: false });
    soilSensors[zone.id] = {
      group, ledMaterial, position: new THREE.Vector3(x, 2.05, z),
    };
  });

  /* ---------------- ESP32 + LoRa end nodes ---------------- */
  const nodeVisuals = {};
  Object.entries(SITE.nodes).forEach(([key, node]) => {
    const group = new THREE.Group();
    world.add(group);
    addCylinder(group, 0.07, 0.09, 0.55, [node.x, 0.28, node.z], materials.metal, { segments: 8 });
    addBox(group, [0.92, 0.5, 0.62], [node.x, 0.72, node.z], new THREE.MeshStandardMaterial({
      color: 0xd6dee6, roughness: 0.65, metalness: 0.15,
    }));
    addBox(group, [0.72, 0.035, 0.44], [node.x, 0.99, node.z], new THREE.MeshStandardMaterial({
      color: 0x1f6b3a, roughness: 0.7,
    }));
    addCylinder(group, 0.026, 0.026, 2.6, [node.x + 0.28, 2.25, node.z], materials.darkMetal, { segments: 6 });
    const tipMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f2b2a, emissive: 0x34d399, emissiveIntensity: 1.3, roughness: 0.3,
    });
    addMesh(group, new THREE.SphereGeometry(0.075, 10, 8), tipMaterial, {
      position: [node.x + 0.28, 3.55, node.z], castShadow: false,
    });
    const ledMaterial = new THREE.MeshStandardMaterial({
      color: 0x0b2c35, emissive: 0x34d399, emissiveIntensity: 0.9, roughness: 0.3,
    });
    addMesh(group, new THREE.SphereGeometry(0.055, 8, 6), ledMaterial, {
      position: [node.x - 0.3, 0.74, node.z + 0.33], castShadow: false,
    });
    // Invisible pick proxy: makes the small node easier to click/raycast.
    addBox(group, [1.15, 1.8, 0.95], [node.x, 1.0, node.z], new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
    }), { castShadow: false, receiveShadow: false });
    nodeVisuals[key] = {
      group, ledMaterial, tipMaterial,
      position: new THREE.Vector3(node.x + 0.28, 3.7, node.z),
    };
  });

  /* ---------------- air temperature / humidity node ---------------- */
  const airGroup = new THREE.Group();
  world.add(airGroup);
  const airX = SITE.airNode.x;
  const airZ = SITE.airNode.z;
  addCylinder(airGroup, 0.07, 0.09, 2.7, [airX, 1.35, airZ], materials.metal, { segments: 8 });
  [2.18, 2.3, 2.42].forEach((y) => {
    addCylinder(airGroup, 0.32, 0.32, 0.055, [airX, y, airZ], materials.white, { segments: 18 });
  });
  addBox(airGroup, [0.3, 0.34, 0.22], [airX, 1.92, airZ], materials.white);
  const airLedMaterial = new THREE.MeshStandardMaterial({
    color: 0x201a35, emissive: 0xa78bfa, emissiveIntensity: 1.1, roughness: 0.3,
  });
  addMesh(airGroup, new THREE.SphereGeometry(0.06, 10, 8), airLedMaterial, {
    position: [airX, 1.92, airZ + 0.13], castShadow: false,
  });
  // small radiation shield cap
  addCylinder(airGroup, 0.38, 0.38, 0.07, [airX, 2.52, airZ], materials.white, { segments: 18 });

  /* ---------------- LoRa gateway ---------------- */
  const gatewayGroup = new THREE.Group();
  world.add(gatewayGroup);
  const gwX = SITE.gateway.x;
  const gwZ = SITE.gateway.z;
  const mastHeight = SITE.gateway.mastHeight;
  addBox(gatewayGroup, [1.9, 0.5, 1.5], [gwX, 0.25, gwZ], materials.concrete);
  addBox(gatewayGroup, [1.2, 1.15, 0.9], [gwX, 1.08, gwZ], materials.darkMetal);
  for (let i = 0; i < 4; i += 1) {
    addBox(gatewayGroup, [0.62, 0.045, 0.02], [gwX, 0.72 + i * 0.22, gwZ + 0.46], materials.metal, { castShadow: false });
  }
  addCylinder(gatewayGroup, 0.11, 0.14, mastHeight, [gwX, mastHeight / 2 + 0.6, gwZ], materials.metal, { segments: 10 });
  addBox(gatewayGroup, [2.7, 0.09, 0.09], [gwX, 11.55, gwZ], materials.darkMetal);
  [-1.0, 0, 1.0].forEach((dx) => {
    addCylinder(gatewayGroup, 0.03, 0.03, 1.7, [gwX + dx, 12.4, gwZ], materials.metal, { segments: 6 });
  });
  addBox(gatewayGroup, [3.2, 0.08, 1.9], [gwX, 9.5, gwZ], new THREE.MeshStandardMaterial({
    color: 0x12283f, roughness: 0.25, metalness: 0.65,
  }), { rotation: [-0.52, 0, 0] });
  const beaconMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a2a08, emissive: 0xf59e0b, emissiveIntensity: 1.5, roughness: 0.3,
  });
  addMesh(gatewayGroup, new THREE.SphereGeometry(0.14, 12, 10), beaconMaterial, {
    position: [gwX, 13.45, gwZ], castShadow: false,
  });

  /* ---------------- edge server / storage ---------------- */
  const serverGroup = new THREE.Group();
  world.add(serverGroup);
  const srvX = SITE.server.x;
  const srvZ = SITE.server.z;
  addBox(serverGroup, [1.6, 2.3, 1.05], [srvX, 1.15, srvZ], new THREE.MeshStandardMaterial({
    color: 0x1b2733, roughness: 0.6, metalness: 0.45,
  }));
  addBox(serverGroup, [1.66, 0.07, 1.11], [srvX, 2.32, srvZ], materials.metal);
  const serverLedGreen = new THREE.MeshStandardMaterial({ color: 0x0b2c35, emissive: 0x34d399, emissiveIntensity: 1.2 });
  const serverLedCyan = new THREE.MeshStandardMaterial({ color: 0x0b2c35, emissive: 0x22d3ee, emissiveIntensity: 1.1 });
  for (let i = 0; i < 9; i += 1) {
    addBox(serverGroup, [0.06, 0.05, 0.03], [
      srvX - 0.5 + (i % 3) * 0.16, 0.45 + Math.floor(i / 3) * 0.62, srvZ + 0.54,
    ], i % 2 === 0 ? serverLedGreen : serverLedCyan, { castShadow: false });
  }
  addBox(serverGroup, [1.7, 0.06, 1.15], [srvX, 0.03, srvZ], materials.darkMetal);

  /* ---------------- time-series database cabinet ---------------- */
  const dbGroup = new THREE.Group();
  world.add(dbGroup);
  const dbX = SITE.database.x;
  const dbZ = SITE.database.z;
  addBox(dbGroup, [1.3, 1.9, 0.9], [dbX, 0.95, dbZ], new THREE.MeshStandardMaterial({
    color: 0x182230, roughness: 0.55, metalness: 0.5,
  }));
  addBox(dbGroup, [1.36, 0.07, 0.96], [dbX, 1.93, dbZ], materials.metal);
  for (let i = 0; i < 6; i += 1) {
    addBox(dbGroup, [0.9, 0.15, 0.03], [dbX, 0.33 + i * 0.26, dbZ + 0.46], new THREE.MeshStandardMaterial({
      color: 0x2b3a4a, roughness: 0.7, metalness: 0.35,
    }), { castShadow: false });
  }
  const dbLedMaterial = new THREE.MeshStandardMaterial({ color: 0x0b2c35, emissive: 0x22d3ee, emissiveIntensity: 1.2 });
  for (let i = 0; i < 6; i += 1) {
    addBox(dbGroup, [0.05, 0.05, 0.03], [dbX + 0.47, 0.36 + i * 0.26, dbZ + 0.47], dbLedMaterial, { castShadow: false });
  }
  addBox(dbGroup, [1.4, 0.05, 1.0], [dbX, 0.03, dbZ], materials.darkMetal);

  /* ---------------- monitoring station + screen ---------------- */
  const stationGroup = new THREE.Group();
  world.add(stationGroup);
  const st = SITE.station;
  addBox(stationGroup, [st.width, st.height, st.depth], [st.x, st.height / 2, st.z], new THREE.MeshStandardMaterial({
    color: 0x24374a, roughness: 0.75, metalness: 0.2,
  }));
  addBox(stationGroup, [st.width + 0.35, 1.6, st.depth + 0.35], [st.x, 3.95, st.z], materials.glass, {
    castShadow: false, receiveShadow: false,
  });
  addBox(stationGroup, [st.width + 0.9, 0.3, st.depth + 0.9], [st.x, st.height + 0.15, st.z], materials.darkMetal);
  addBox(stationGroup, [1.7, 2.4, 0.14], [st.x - 3.9, 1.2, st.z + st.depth / 2 + 0.02], new THREE.MeshStandardMaterial({
    color: 0x14212e, roughness: 0.5, metalness: 0.3,
  }), { castShadow: false });
  [[-3.6, -2.6], [0.6, -2.6]].forEach(([dx, dz]) => {
    addBox(stationGroup, [3.8, 0.09, 2.7], [st.x + dx, st.height + 0.55, st.z + dz], new THREE.MeshStandardMaterial({
      color: 0x16324a, roughness: 0.3, metalness: 0.55,
    }), { rotation: [-0.32, 0, 0] });
  });
  addCylinder(stationGroup, 0.05, 0.05, 2.5, [st.x + 4.4, st.height + 1.2, st.z - 3.2], materials.metal, { segments: 8 });
  const roofLed = new THREE.MeshStandardMaterial({ color: 0x3a2a08, emissive: 0xf59e0b, emissiveIntensity: 1.4 });
  addMesh(stationGroup, new THREE.SphereGeometry(0.09, 10, 8), roofLed, {
    position: [st.x + 4.4, st.height + 2.5, st.z - 3.2], castShadow: false,
  });

  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 1024;
  screenCanvas.height = 384;
  const screenContext = screenCanvas.getContext('2d');
  const screenTexture = new THREE.CanvasTexture(screenCanvas);
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  screenTexture.anisotropy = 4;
  const screenMaterial = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false });
  addBox(stationGroup, [9.6, 3.7, 0.12], [st.x, 3.05, st.z + st.depth / 2 + 0.04], materials.darkMetal, { castShadow: false });
  addMesh(stationGroup, new THREE.PlaneGeometry(9.2, 3.4), screenMaterial, {
    position: [st.x, 3.05, st.z + st.depth / 2 + 0.11], castShadow: false, receiveShadow: false,
  });

  /* ---------------- trees for depth ---------------- */
  const treeSpots = [
    [-52, 2], [-52, -20], [-50, 29], [12, 29], [24, 29], [-6, 29],
    [48, 29], [47, -6], [12, -28], [-2, -28], [-40, -27], [44, -24],
  ];
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5a4128, roughness: 1 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x2b6b3a, roughness: 0.9 });
  treeSpots.forEach(([x, z]) => {
    const group = new THREE.Group();
    world.add(group);
    addCylinder(group, 0.16, 0.24, 2.1, [x, 1.05, z], trunkMaterial, { segments: 7 });
    addMesh(group, new THREE.ConeGeometry(1.5, 3.2, 8), leafMaterial, { position: [x, 3.2, z] });
    addMesh(group, new THREE.ConeGeometry(1.05, 2.4, 8), leafMaterial, { position: [x, 4.5, z] });
  });

  /* ---------------- dashboard labels ---------------- */
  const labels = new LabelLayer(labelsContainer, camera, canvas);
  SITE.zones.forEach((zone) => {
    labels.add({
      id: `soil-${zone.id}`,
      position: soilSensors[zone.id].position,
      className: 'soil',
      title: `Soil node ${zone.id}`,
      value: '— %',
      maxDistance: 235,
    });
  });
  labels.add({
    id: 'air',
    position: new THREE.Vector3(airX, 2.9, airZ),
    className: 'air',
    title: 'Air node · T / RH',
    value: '—',
    maxDistance: 220,
  });
  Object.entries(SITE.nodes).forEach(([key]) => {
    labels.add({
      id: key,
      position: nodeVisuals[key].position,
      className: 'node',
      title: `ESP32 · LoRa ${key.replace('node', 'node ')}`,
      value: 'listening',
      maxDistance: 70,
    });
  });
  labels.add({
    id: 'gateway',
    position: new THREE.Vector3(gwX, 14.4, gwZ),
    className: 'gw',
    title: 'LoRa gateway · EU868',
    value: '—',
    maxDistance: 250,
  });
  labels.add({
    id: 'pump',
    position: new THREE.Vector3(pumpX, 2.85, pumpZ),
    className: 'pump',
    title: 'Pump · idle',
    value: 'OFF',
    maxDistance: 240,
  });
  labels.add({
    id: 'tank',
    position: new THREE.Vector3(tankSpec.x, tankTopY + 1.1, tankSpec.z),
    className: 'tank',
    title: 'Water tank · visual level',
    value: '70 %',
    maxDistance: 240,
  });
  labels.add({
    id: 'station',
    position: new THREE.Vector3(st.x, st.height + 3.1, st.z),
    className: 'station',
    title: 'Monitoring station · HMI + controller',
    value: '—',
    maxDistance: 250,
  });
  labels.add({
    id: 'database',
    position: new THREE.Vector3(dbX, 2.7, dbZ),
    className: 'station',
    title: 'Time-series database',
    value: '—',
    maxDistance: 250,
  });

  /* ---------------- packet paths (one per field) ---------------- */
  const paths = {};
  const pathMaterial = new THREE.LineBasicMaterial({
    color: 0x22d3ee, transparent: true, opacity: 0.055, depthWrite: false,
  });

  function buildPath(zone) {
    const node = SITE.nodes[zone.node];
    const points = [
      new THREE.Vector3(zone.soilSensor.x, 1.55, zone.soilSensor.z),
      new THREE.Vector3(node.x, 1.05, node.z),
      new THREE.Vector3(node.x + 0.28, 3.58, node.z),
      new THREE.Vector3((node.x + gwX) / 2, 10.8, (node.z + gwZ) / 2),
      new THREE.Vector3(gwX, 13.2, gwZ),
      new THREE.Vector3(srvX, 2.45, srvZ),
      new THREE.Vector3(dbX, 1.95, dbZ),
      new THREE.Vector3(st.x, 3.05, st.z + st.depth / 2 + 0.25),
    ];
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.35);
    const sampleCount = 500;
    const uOf = (point) => {
      let bestU = 0;
      let bestDistance = Infinity;
      for (let i = 0; i <= sampleCount; i += 1) {
        const u = i / sampleCount;
        const distance = curve.getPointAt(u).distanceToSquared(point);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestU = u;
        }
      }
      return bestU;
    };
    const u = points.map(uOf);
    const polyline = curve.getPoints(120);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(polyline),
      pathMaterial,
    );
    world.add(line);
    return {
      curve,
      line,
      u: {
        sensor: u[0],
        node: u[1],
        tx: u[2],
        air: u[3],
        gateway: u[4],
        server: u[5],
        db: u[6],
        screen: u[7],
      },
      points,
    };
  }

  SITE.zones.forEach((zone) => {
    paths[zone.id] = buildPath(zone);
  });

  /* ---------------- station screen (canvas texture) ---------------- */
  function drawScreen(info) {
    const ctx = screenContext;
    const W = 1024;
    const H = 384;
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#051320');
    gradient.addColorStop(1, '#0a2032');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(34, 211, 238, 0.07)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    ctx.fillStyle = '#8cf7c4';
    ctx.font = 'bold 24px "SF Mono", Menlo, monospace';
    ctx.fillText('SMART FARM · CONTROL ROOM', 28, 44);
    ctx.fillStyle = '#5f8ea8';
    ctx.font = '14px "SF Mono", Menlo, monospace';
    ctx.fillText(`frame #${info.sample ?? '—'} · ${info.time || '--:--:--'}`, 28, 68);

    ctx.fillStyle = info.measured ? 'rgba(52, 211, 153, 0.16)' : 'rgba(245, 158, 11, 0.16)';
    ctx.fillRect(W - 330, 24, 302, 34);
    ctx.strokeStyle = info.measured ? '#34d399' : '#f59e0b';
    ctx.strokeRect(W - 330, 24, 302, 34);
    ctx.fillStyle = info.measured ? '#9ff5c4' : '#ffd48a';
    ctx.font = 'bold 13px "SF Mono", Menlo, monospace';
    ctx.fillText(info.measured ? `MEASURED · ${info.source || 'LIVE'}` : 'SIMULATED · CSV REPLAY', W - 316, 46);

    const safe = (value) => (Number.isFinite(value) ? value : 0);
    const metrics = [
      { label: 'SOIL MOISTURE', value: `${safe(info.soil).toFixed(1)} %`, color: '#22d3ee', x: 28, fill: safe(info.soil) / 100 },
      { label: 'TEMPERATURE', value: `${safe(info.temperature).toFixed(1)} °C`, color: '#fb7185', x: 352, fill: (safe(info.temperature) + 20) / 80 },
      { label: 'AIR HUMIDITY', value: `${safe(info.humidity).toFixed(1)} %`, color: '#34d399', x: 676, fill: safe(info.humidity) / 100 },
    ];
    metrics.forEach((metric) => {
      ctx.fillStyle = '#5f8ea8';
      ctx.font = '13px "SF Mono", Menlo, monospace';
      ctx.fillText(metric.label, metric.x, 120);
      ctx.fillStyle = metric.color;
      ctx.font = 'bold 40px "SF Mono", Menlo, monospace';
      ctx.fillText(metric.value, metric.x, 170);
      ctx.fillStyle = 'rgba(95, 142, 168, 0.22)';
      ctx.fillRect(metric.x, 186, 300, 8);
      ctx.fillStyle = metric.color;
      ctx.fillRect(metric.x, 186, Math.max(0, Math.min(1, metric.fill)) * 300, 8);
    });

    ctx.fillStyle = '#5f8ea8';
    ctx.font = '13px "SF Mono", Menlo, monospace';
    ctx.fillText('PUMP', 28, 236);
    ctx.fillText('LORA LINK', 190, 236);
    ctx.fillText('PDR', 400, 236);
    ctx.fillText('FRAME', 540, 236);

    ctx.fillStyle = info.pump ? '#34d399' : '#94a3b8';
    ctx.font = 'bold 28px "SF Mono", Menlo, monospace';
    ctx.fillText(info.pump ? 'ON' : 'OFF', 28, 276);

    const signalColor = info.signalTone === 'bad' ? '#ff8f8f' : (info.signalTone === 'warn' ? '#ffd48a' : '#8cf7c4');
    ctx.fillStyle = signalColor;
    ctx.font = 'bold 20px "SF Mono", Menlo, monospace';
    ctx.fillText(info.signalLabel || '—', 190, 274);

    ctx.fillStyle = '#b9f5ff';
    ctx.font = 'bold 26px "SF Mono", Menlo, monospace';
    ctx.fillText(Number.isFinite(info.pdr) ? `${info.pdr.toFixed(1)} %` : '—', 400, 274);
    ctx.fillText(`#${info.sample ?? '—'}`, 540, 274);

    ctx.strokeStyle = 'rgba(34, 211, 238, 0.25)';
    ctx.strokeRect(676, 224, 320, 104);
    ctx.fillStyle = '#7fd4e8';
    ctx.font = '13px "SF Mono", Menlo, monospace';
    ctx.fillText('Sensor → ESP32 → LoRa TX', 692, 252);
    ctx.fillText('→ Gateway → Server → DB', 692, 276);
    ctx.fillText(`→ Dashboard (frame ${info.sample ?? '—'})`, 692, 300);

    ctx.fillStyle = '#3f6b84';
    ctx.font = '11px "SF Mono", Menlo, monospace';
    ctx.fillText('Values are simulated unless the badge says MEASURED — no hardware is used in this mode.', 28, 356);

    screenTexture.needsUpdate = true;
  }

  drawScreen({ sample: '—', time: '--:--:--', soil: 0, temperature: 0, humidity: 0, pump: false });

  /* ---------------- presentation: components, highlight & picking ---------------- */
  const componentGroups = {
    air: airGroup,
    gateway: gatewayGroup,
    server: serverGroup,
    database: dbGroup,
    pump: pumpGroup,
    tank: tankGroup,
    station: stationGroup,
  };
  SITE.zones.forEach((zone) => {
    componentGroups[`sensor${zone.id}`] = soilSensors[zone.id].group;
    componentGroups[`node${zone.id}`] = nodeVisuals[zone.node].group;
  });
  Object.entries(componentGroups).forEach(([id, group]) => {
    group.traverse((child) => {
      if (child.isMesh) child.userData.componentId = id;
    });
  });
  const pickables = Object.values(componentGroups);

  const componentPositions = {
    air: new THREE.Vector3(airX, 0.06, airZ),
    gateway: new THREE.Vector3(gwX, 0.06, gwZ),
    server: new THREE.Vector3(srvX, 0.06, srvZ),
    database: new THREE.Vector3(dbX, 0.06, dbZ),
    pump: new THREE.Vector3(pumpX, 0.06, pumpZ),
    tank: new THREE.Vector3(tankSpec.x, 0.06, tankSpec.z),
    station: new THREE.Vector3(st.x, 0.06, st.z),
  };
  SITE.zones.forEach((zone) => {
    componentPositions[`sensor${zone.id}`] = new THREE.Vector3(zone.soilSensor.x, 0.06, zone.soilSensor.z);
    const node = SITE.nodes[zone.node];
    componentPositions[`node${zone.id}`] = new THREE.Vector3(node.x, 0.06, node.z);
  });

  const highlightGroup = new THREE.Group();
  highlightGroup.visible = false;
  const highlightRingMaterial = new THREE.MeshBasicMaterial({
    color: 0x22d3ee, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false,
  });
  const highlightRing = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.09, 8, 44), highlightRingMaterial);
  highlightRing.rotation.x = -Math.PI / 2;
  const highlightBeamMaterial = new THREE.MeshBasicMaterial({
    color: 0x22d3ee, transparent: true, opacity: 0.12, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const highlightBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 11, 18, 1, true),
    highlightBeamMaterial,
  );
  highlightBeam.position.y = 5.5;
  const highlightMarkerMaterial = new THREE.MeshBasicMaterial({
    color: 0x8beeff, transparent: true, opacity: 0.95, toneMapped: false,
  });
  const highlightMarker = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), highlightMarkerMaterial);
  highlightMarker.position.y = 1.3;
  highlightGroup.add(highlightRing, highlightBeam, highlightMarker);
  world.add(highlightGroup);

  const toneColor = (tone) => {
    if (tone === 'danger') return 0xff4d4d;
    if (tone === 'warm') return 0xf59e0b;
    if (tone === 'ok') return 0x34d399;
    return 0x22d3ee;
  };

  let connectionMesh = null;
  let connectionMaterial = null;

  function clearConnectionHighlight() {
    if (connectionMesh) {
      world.remove(connectionMesh);
      connectionMesh.geometry.dispose();
      connectionMaterial.dispose();
      connectionMesh = null;
      connectionMaterial = null;
    }
  }

  function buildConnection(points, tone) {
    clearConnectionHighlight();
    if (!points || points.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.2);
    const geometry = new THREE.TubeGeometry(curve, Math.max(32, points.length * 8), 0.085, 8, false);
    connectionMaterial = new THREE.MeshBasicMaterial({
      color: toneColor(tone), transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    connectionMesh = new THREE.Mesh(geometry, connectionMaterial);
    connectionMesh.renderOrder = 6;
    world.add(connectionMesh);
  }

  function setComponentHighlight(id, tone = 'cyan') {
    let position = null;
    if (id === 'loss') {
      const path = paths[state.activeZone] || paths[SITE.zones[0].id];
      const u = path.u.tx + (path.u.gateway - path.u.tx) * 0.45;
      position = path.curve.getPointAt(u);
    } else if (id) {
      position = componentPositions[id];
      const match = /^(?:sensor|node)([A-D])$/.exec(id);
      if (match) setActiveZone(match[1]);
    }
    if (!position) {
      highlightGroup.visible = false;
      return;
    }
    const color = toneColor(tone);
    highlightRingMaterial.color.setHex(color);
    highlightBeamMaterial.color.setHex(color);
    highlightMarkerMaterial.color.setHex(color);
    highlightGroup.position.copy(position);
    highlightRing.position.y = id === 'loss' ? 0 : 0.04;
    highlightMarker.position.y = id === 'loss' ? 0.4 : 1.3;
    highlightBeam.position.y = 5.5;
    highlightGroup.visible = true;
  }

  function clearHighlights() {
    highlightGroup.visible = false;
    clearConnectionHighlight();
  }

  function setConnectionByU(zoneId, fromKey, toKey, tone = 'cyan') {
    const path = paths[zoneId] || paths[SITE.zones[0].id];
    if (!path) return;
    const a = Math.min(path.u[fromKey], path.u[toKey]);
    const b = Math.max(path.u[fromKey], path.u[toKey]);
    const points = [];
    const samples = 42;
    for (let i = 0; i <= samples; i += 1) {
      points.push(path.curve.getPointAt(a + ((b - a) * i) / samples));
    }
    buildConnection(points, tone);
  }

  function highlightLink(fromId, toId, tone = 'cyan') {
    const from = componentPositions[fromId];
    const to = componentPositions[toId];
    if (!from || !to) return;
    const start = from.clone().setY(1.0);
    const end = to.clone().setY(1.0);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    mid.y = Math.max(start.y, end.y) + 3.2;
    buildConnection([start, mid, end], tone);
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function pickComponent(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, true);
    for (let i = 0; i < hits.length; i += 1) {
      let node = hits[i].object;
      while (node) {
        if (node.userData && node.userData.componentId) return node.userData.componentId;
        node = node.parent;
      }
    }
    return null;
  }

  const projectedPoint = new THREE.Vector3();

  function screenPositionOf(id, height = 1.1) {
    const base = componentPositions[id];
    if (!base) return null;
    projectedPoint.copy(base);
    projectedPoint.y += height;
    projectedPoint.project(camera);
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (projectedPoint.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-projectedPoint.y * 0.5 + 0.5) * rect.height,
    };
  }

  /* ---------------- live state + public API ---------------- */
  const state = {
    pumpOn: false,
    activeZone: SITE.zones[0].id,
    measured: false,
    txPulse: 0,
  };
  let cameraTween = null;
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  let lastScreenInfo = {
    sample: '—', time: '--:--:--', soil: NaN, temperature: NaN, humidity: NaN,
    pump: false, signalLabel: '—', signalTone: 'ok', pdr: null, measured: false, source: '',
  };

  function setActiveZone(zoneId) {
    if (!zoneVisuals[zoneId]) return;
    state.activeZone = zoneId;
    SITE.zones.forEach((zone) => {
      const ring = zoneVisuals[zone.id].ring;
      ring.material.opacity = zone.id === zoneId ? 0.45 : 0;
      ring.userData.phase = Math.random() * Math.PI * 2;
    });
  }

  function setPump(on) {
    state.pumpOn = Boolean(on);
    pumpLedMaterial.emissiveIntensity = state.pumpOn ? 1.8 : 0.05;
    labels.setValue('pump', state.pumpOn ? 'ON · irrigating' : 'OFF · idle');
    labels.setState('pump', { className: state.pumpOn ? 'pump on' : 'pump' });
    labels.setTitle('pump', state.pumpOn ? 'Pump · running' : 'Pump · idle');
  }

  function setTelemetry(info) {
    const { frame, pump, signal, pdr, measured, sourceLabel, zoneId } = info;
    const zone = SITE.zones.find((item) => item.id === zoneId) || SITE.zones[0];
    const nodeKey = zone.node;

    state.measured = Boolean(measured);
    state.txPulse = 1;
    setActiveZone(zone.id);

    const soilText = Number.isFinite(frame.soil) ? `${frame.soil.toFixed(1)} %` : 'invalid';
    const fresh = frame.received && frame.valid !== false;
    if (fresh) {
      labels.setValue(`soil-${zone.id}`, soilText);
      labels.flash(`soil-${zone.id}`);
      labels.setValue('air', `${frame.temperature.toFixed(1)} °C · ${frame.humidity.toFixed(0)} %`);
    } else {
      labels.setValue(`soil-${zone.id}`, 'no frame');
      labels.setValue('air', 'no frame');
    }
    labels.setState(`soil-${zone.id}`, { stale: !fresh });

    Object.keys(nodeVisuals).forEach((key) => {
      labels.setValue(key, key === nodeKey ? `TX · frame #${frame.sample}` : 'listening');
    });
    labels.setValue('gateway', signal.label);
    labels.setValue('station', `#${frame.sample} · PDR ${Number.isFinite(pdr) ? pdr.toFixed(0) : '—'} %`);

    setPump(pump);

    // The screen keeps the last measured values when a frame is lost (like a
    // real SCADA display) but the link status and frame counter update.
    const screenInfo = fresh
      ? {
        sample: frame.sample,
        time: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        soil: frame.soil,
        temperature: frame.temperature,
        humidity: frame.humidity,
        pump,
        signalLabel: signal.label,
        signalTone: signal.tone,
        pdr,
        measured: state.measured,
        source: sourceLabel,
      }
      : {
        ...lastScreenInfo,
        sample: frame.sample,
        pump,
        signalLabel: signal.label,
        signalTone: signal.tone,
        pdr,
        measured: state.measured,
        source: sourceLabel,
      };
    lastScreenInfo = screenInfo;
    drawScreen(screenInfo);
  }

  function setView(name) {
    const preset = SITE.camera[name];
    if (!preset) return;
    cameraTween = {
      t: 0,
      duration: 1.15,
      fromPosition: camera.position.clone(),
      toPosition: new THREE.Vector3(preset.position[0], preset.position[1], preset.position[2]),
      fromTarget: controls.target.clone(),
      toTarget: new THREE.Vector3(preset.target[0], preset.target[1], preset.target[2]),
    };
  }

  function resize() {
    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 1280;
    const height = canvas.clientHeight || canvas.parentElement?.clientHeight || 720;
    renderer.setSize(width, height, false);
    camera.aspect = Math.max(width, 1) / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }

  function update(dt, elapsed) {
    if (cameraTween) {
      cameraTween.t += dt / cameraTween.duration;
      const k = easeInOut(Math.min(cameraTween.t, 1));
      camera.position.lerpVectors(cameraTween.fromPosition, cameraTween.toPosition, k);
      controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, k);
      if (cameraTween.t >= 1) cameraTween = null;
    }
    controls.update();

    state.txPulse = Math.max(0, state.txPulse - dt * 1.7);

    // irrigation visuals
    impeller.rotation.x += dt * (state.pumpOn ? 16 : 0);
    flowMap.offset.x -= dt * (state.pumpOn ? 0.55 : 0);
    const targetEmissive = state.pumpOn ? 0.85 : 0.18;
    pipeMaterial.emissiveIntensity += (targetEmissive - pipeMaterial.emissiveIntensity) * Math.min(1, dt * 4);
    waterSurface.rotation.z += dt * (state.pumpOn ? 0.5 : 0);
    if (state.pumpOn) {
      pumpLedMaterial.emissiveIntensity = 1.5 + Math.sin(elapsed * 9) * 0.6;
    }

    // sensor + node LEDs
    SITE.zones.forEach((zone, index) => {
      const sensor = soilSensors[zone.id];
      const base = zone.id === state.activeZone ? 1.6 : 0.55;
      sensor.ledMaterial.emissiveIntensity = base + Math.sin(elapsed * 3 + index) * 0.18;
      const ring = zoneVisuals[zone.id].ring;
      if (zone.id === state.activeZone) {
        const pulse = 0.5 + 0.5 * Math.sin(elapsed * 3.2);
        ring.material.opacity = 0.18 + pulse * 0.3;
        ring.scale.setScalar(1 + pulse * 0.03);
      }
    });

    Object.keys(nodeVisuals).forEach((key, index) => {
      const visual = nodeVisuals[key];
      const active = key === `node${state.activeZone}`;
      visual.ledMaterial.emissiveIntensity = (active ? 1.7 : 0.45) + Math.sin(elapsed * 4 + index) * 0.15;
      visual.tipMaterial.emissiveIntensity = active ? 1.8 + state.txPulse * 2.2 : 0.7;
    });

    // gateway beacon + station roof LED + air node LED
    beaconMaterial.emissiveIntensity = 0.9 + Math.abs(Math.sin(elapsed * 2.6)) * 1.3;
    roofLed.emissiveIntensity = 0.8 + Math.abs(Math.sin(elapsed * 1.7 + 1)) * 0.9;
    airLedMaterial.emissiveIntensity = 0.7 + Math.sin(elapsed * 2.2) * 0.3;

    // presentation highlight pulse
    if (highlightGroup.visible) {
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 4);
      highlightRing.scale.setScalar(1 + pulse * 0.06);
      highlightRingMaterial.opacity = 0.45 + pulse * 0.4;
      highlightMarker.scale.setScalar(1 + pulse * 0.35);
      highlightBeamMaterial.opacity = 0.08 + pulse * 0.08;
    }

    labels.update();
  }

  function render() {
    renderer.render(scene, camera);
  }

  function stats() {
    const info = renderer.info.render;
    return {
      calls: info.calls,
      triangles: info.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      labels: labels.items.length,
      zones: SITE.zones.length,
      webgl: renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL1',
    };
  }

  function dispose() {
    scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const list = Array.isArray(object.material) ? object.material : [object.material];
        list.forEach((material) => {
          Object.values(material).forEach((value) => {
            if (value && value.isTexture) value.dispose();
          });
          material.dispose();
        });
      }
    });
    controls.dispose();
    renderer.dispose();
  }

  setActiveZone(state.activeZone);

  return {
    scene,
    camera,
    renderer,
    controls,
    labels,
    paths,
    state,
    materials,
    zoneVisuals,
    soilSensors,
    nodeVisuals,
    componentGroups,
    componentPositions,
    setTelemetry,
    setPump,
    setActiveZone,
    setComponentHighlight,
    clearHighlights,
    setConnectionByU,
    highlightLink,
    clearConnectionHighlight,
    pickComponent,
    screenPositionOf,
    setView,
    update,
    render,
    resize,
    stats,
    dispose,
  };
}
