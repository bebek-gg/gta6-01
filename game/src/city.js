// city.js — SOLMAR itself: the road grid, four districts, beach, ocean,
// pier, buildings, palms, streetlights and the day/night cycle.
// Everything is built from boxes, cylinders and canvas textures.

import * as THREE from 'three';
import { clamp, lerp, pick, rand, randi } from './utils.js';

/** The seven roads in each direction. */
export const ROADS = [-180, -120, -60, 0, 60, 120, 180];
export const BOUND = 210;

/**
 * Named places. (x, z) is the building's centre; (dx, dz) is the doorstep
 * where Milo stands to use it — the buildings sit inside their blocks,
 * clear of the roads, so the doorstep is the reachable point.
 */
export const LANDMARKS = {
  mart: { x: -150, z: -150, dx: 0, dz: -20, name: 'Marina Mart' },
  safehouse: { x: 30, z: 150, dx: 0, dz: 18, name: 'Sunfield Safehouse' },
  loft: { x: 90, z: -150, dx: 0, dz: -18, name: 'Coral Loft' },
  warehouse: { x: -90, z: 195, dx: 0, dz: 20, name: 'Docks Warehouse' },
  bank: { x: 150, z: -150, dx: 0, dz: -20, name: 'Solmar Bank' },
  docks: { x: -120, z: 222, dx: 0, dz: 0, name: 'The Docks' },
  chopShop: { x: -150, z: 90, dx: 0, dz: 18, name: "Cleo's Chop-Shop" },
  pdhq: { x: 150, z: 150, dx: 0, dz: 18, name: 'PD Headquarters' },
};

const DISTRICT_COLORS = [
  0xd8a06a, 0xc98d5f, 0xb98a6e, 0x9fb4c8, 0x8aa8b8, 0xd8c49a, 0xa8b898, 0xc48a7a,
];

/** A facade texture: a base colour with a grid of windows, some lit. */
function facadeTexture(base, litRatio) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 128);
  for (let y = 8; y < 120; y += 16) {
    for (let x = 6; x < 58; x += 14) {
      const lit = Math.random() < litRatio;
      g.fillStyle = lit ? '#ffd97a' : '#20283a';
      g.fillRect(x, y, 9, 11);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A floating text sign made from a canvas. */
function signTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#101418';
  g.fillRect(0, 0, 256, 64);
  g.font = 'bold 30px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];

  // --- ground, roads, beach, ocean -------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshLambertMaterial({ color: 0x6f7f6a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 20);
  ground.receiveShadow = true;
  group.add(ground);

  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  for (const r of ROADS) {
    const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(10, 430), roadMat);
    vRoad.rotation.x = -Math.PI / 2;
    vRoad.position.set(r, 0, 0);
    vRoad.receiveShadow = true;
    group.add(vRoad);
    const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(430, 10), roadMat);
    hRoad.rotation.x = -Math.PI / 2;
    hRoad.position.set(0, 0.01, r);
    hRoad.receiveShadow = true;
    group.add(hRoad);
  }
  // Centre dashes down every road.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c25a });
  const dashGeo = new THREE.BoxGeometry(0.6, 0.06, 4);
  for (const r of ROADS) {
    for (let p = -200; p <= 200; p += 16) {
      const d1 = new THREE.Mesh(dashGeo, dashMat);
      d1.position.set(r, 0.06, p);
      group.add(d1);
      const d2 = new THREE.Mesh(dashGeo, dashMat);
      d2.rotation.y = Math.PI / 2;
      d2.position.set(p, 0.06, r);
      group.add(d2);
    }
  }

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 44),
    new THREE.MeshLambertMaterial({ color: 0xe0c98f }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0, 236);
  sand.receiveShadow = true;
  group.add(sand);
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x1f6f9e, transparent: true, opacity: 0.92 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(560, 110), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.05, 313);
  group.add(water);

  // The pier: planks out to sea with a hut at the end.
  const plankMat = new THREE.MeshLambertMaterial({ color: 0x8a6a45 });
  for (let z = 248; z <= 328; z += 4) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4, 3.6), plankMat);
    plank.position.set(-120, 0.6, z);
    plank.castShadow = true;
    group.add(plank);
  }
  const postMat = new THREE.MeshLambertMaterial({ color: 0x5a4630 });
  for (const [px, pz] of [[-124, 252], [-116, 252], [-124, 290], [-116, 290], [-124, 326], [-116, 326]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3.4, 8), postMat);
    post.position.set(px, 0.4, pz);
    group.add(post);
  }
  const hut = new THREE.Mesh(
    new THREE.BoxGeometry(7, 4, 6),
    new THREE.MeshLambertMaterial({ color: 0xc96a5a }),
  );
  hut.position.set(-120, 2.6, 326);
  hut.castShadow = true;
  group.add(hut);
  colliders.push({ x: -120, z: 326, hx: 3.5, hz: 3 });

  // --- buildings ---------------------------------------------------------
  const facadeCache = new Map();
  function facade(base, lit) {
    const key = base + '|' + lit;
    if (!facadeCache.has(key)) facadeCache.set(key, facadeTexture(base, lit));
    return facadeCache.get(key);
  }

  function addBox(x, z, w, h, d, color, lit = 0.35) {
    const tex = facade('#' + new THREE.Color(color).getHexString(), lit);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    box.position.set(x, h / 2, z);
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);
    // A flat roof cap so the top reads as a rooftop, not a texture edge.
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.92, 0.5, d * 0.92),
      new THREE.MeshLambertMaterial({ color: 0x3a3f46 }),
    );
    roof.position.set(x, h + 0.25, z);
    group.add(roof);
    colliders.push({ x, z, hx: w / 2 + 0.3, hz: d / 2 + 0.3 });
    return box;
  }

  function addSign(x, y, z, text, color, rotY = 0) {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 4),
      new THREE.MeshBasicMaterial({ map: signTexture(text, color), transparent: true }),
    );
    sign.position.set(x, y, z);
    sign.rotation.y = rotY;
    group.add(sign);
  }

  // Landmark buildings, each with a lit sign.
  addBox(-150, -150, 26, 9, 16, 0xe86a5a, 0.5);
  addSign(-150, 10.5, -141, 'MARINA MART', '#ffd23a');
  addBox(150, -150, 24, 26, 18, 0xcfd8dc, 0.4);
  addSign(150, 27.5, -140, 'SOLMAR BANK', '#5ab8ff');
  addBox(-90, 195, 34, 10, 14, 0x8a7a5a, 0.3);
  addSign(-90, 11.5, 187, 'DOCKS', '#ff9a3a');
  addBox(30, 150, 14, 8, 12, 0xf2e3c0, 0.6);
  addSign(30, 9.5, 157, 'SAFEHOUSE', '#3affc8');
  addBox(90, -150, 18, 20, 14, 0xb08ac8, 0.5);
  addSign(90, 21.5, -142, 'CORAL LOFT', '#ff4fd8');
  addBox(-150, 90, 22, 9, 16, 0x5a6a7a, 0.4);
  addSign(-150, 10.5, 99, "CLEO'S", '#3affc8');
  addBox(150, 150, 26, 22, 18, 0x4a6a9e, 0.4);
  addSign(150, 23.5, 160, 'PD HQ', '#5ab8ff');

  // Regular blocks: one or two towers per block, skipped near landmarks.
  const blockCenters = [-150, -90, -30, 30, 90, 150];
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      const nearLm = Object.values(LANDMARKS).some(
        (lm) => Math.hypot(lm.x - bx, lm.z - bz) < 42,
      );
      if (nearLm) continue;
      const north = bz < -60;
      const n = randi(1, 2);
      for (let i = 0; i < n; i++) {
        const w = rand(16, 28);
        const d = rand(13, 20);
        const h = north ? rand(16, 42) : rand(7, 20);
        const ox = bx + (i === 0 ? -8 : 10) + rand(-3, 3);
        const oz = bz + rand(-6, 6);
        addBox(ox, oz, w, h, d, pick(DISTRICT_COLORS), 0.3);
      }
    }
  }

  // --- palms and streetlights -------------------------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const palmMat = new THREE.MeshLambertMaterial({ color: 0x2e7d46 });
  for (let i = 0; i < 46; i++) {
    const road = pick(ROADS);
    const along = rand(-195, 195);
    const side = Math.random() < 0.5 ? -1 : 1;
    const vertical = Math.random() < 0.5;
    const px = vertical ? road + side * 8 : along;
    const pz = vertical ? along : road + side * 8;
    if (Math.abs(px) > 205 || Math.abs(pz) > 205 || pz > 210) continue;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 7, 6), trunkMat);
    trunk.position.set(px, 3.5, pz);
    trunk.castShadow = true;
    group.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.4, 7), palmMat);
    crown.position.set(px, 8.2, pz);
    group.add(crown);
    colliders.push({ x: px, z: pz, hx: 0.5, hz: 0.5 });
  }

  const lampHeads = [];
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x30343a });
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.5, 6), poleMat);
      pole.position.set(rx + 6, 3.25, rz + 6);
      group.add(pole);
      const headMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), headMat);
      head.position.set(rx + 6, 6.7, rz + 6);
      group.add(head);
      lampHeads.push(headMat);
    }
  }

  // --- lights and sky ----------------------------------------------------
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 700;
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0xbfd4ff, 0.55);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x54452e, 0.5);
  scene.add(hemi);

  let hour = 10.5;
  const daySky = new THREE.Color(0x87bfe8);
  const duskSky = new THREE.Color(0xe88a4a);
  const nightSky = new THREE.Color(0x0b1026);

  function setHour(h) {
    hour = ((h % 24) + 24) % 24;
    // Sun height: up at 6, down at 18.
    const dayFrac = clamp(Math.sin(((hour - 6) / 12) * Math.PI), 0, 1);
    const duskFrac = clamp(1 - Math.abs(hour - 18.5) / 1.6, 0, 1) + clamp(1 - Math.abs(hour - 5.5) / 1.6, 0, 1);
    const nightFrac = 1 - dayFrac;
    const az = ((hour - 6) / 12) * Math.PI;
    sun.position.set(Math.cos(az) * 220, 40 + dayFrac * 180, 90 + Math.sin(az) * 120);
    sun.intensity = 0.25 + dayFrac * 2.2;
    sun.color.setHex(0xfff2d8).lerp(new THREE.Color(0xff9a4a), clamp(duskFrac, 0, 1) * 0.7);
    ambient.intensity = 0.16 + dayFrac * 0.45;
    hemi.intensity = 0.12 + dayFrac * 0.42;
    const sky = daySky.clone().lerp(duskSky, clamp(duskFrac, 0, 1));
    sky.lerp(nightSky, nightFrac * 0.85);
    scene.background = sky;
    scene.fog = new THREE.Fog(sky.clone(), 240, 620);
    for (const m of lampHeads) m.color.setHex(nightFrac > 0.5 ? 0xffe9a8 : 0x8a7a5a);
  }

  /** Push a circle out of every building it overlaps. Returns new {x, z}. */
  function collide(x, z, r) {
    for (const b of colliders) {
      const dx = x - b.x;
      const dz = z - b.z;
      const px = b.hx + r - Math.abs(dx);
      const pz = b.hz + r - Math.abs(dz);
      if (px > 0 && pz > 0) {
        if (px < pz) x = b.x + (dx >= 0 ? 1 : -1) * (b.hx + r);
        else z = b.z + (dz >= 0 ? 1 : -1) * (b.hz + r);
      }
    }
    return { x: clamp(x, -250, 250), z: clamp(z, -208, 328) };
  }

  function roadPoint() {
    const vertical = Math.random() < 0.5;
    const line = pick(ROADS);
    const along = rand(-195, 195);
    const p = vertical ? { x: line, z: along } : { x: along, z: line };
    p.vertical = vertical;
    return p;
  }

  function sidewalkPoint() {
    const p = roadPoint();
    if (p.vertical) return { x: p.x + (Math.random() < 0.5 ? -8 : 8), z: p.z };
    return { x: p.x, z: p.z + (Math.random() < 0.5 ? -8 : 8) };
  }

  setHour(hour);

  return {
    group,
    colliders,
    landmarks: LANDMARKS,
    get hour() {
      return hour;
    },
    /** The doorstep of a named place: where Milo stands to use it. */
    doorstep(name) {
      const lm = LANDMARKS[name];
      return { x: lm.x + (lm.dx || 0), z: lm.z + (lm.dz || 0) };
    },
    /** Every doorstep, by name. */
    get doorsteps() {
      const out = {};
      for (const name of Object.keys(LANDMARKS)) out[name] = this.doorstep(name);
      return out;
    },
    collide,
    roadPoint,
    sidewalkPoint,
    setHour,
    /** A full day takes about eight minutes. */
    update(dt) {
      setHour(hour + (dt * 24) / 480);
    },
  };
}
