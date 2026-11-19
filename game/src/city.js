// city.js — Solmar itself: four districts on a road grid, a beach and an
// ocean to the south, a pier, streetlights, palms, and a day/night cycle.

import * as THREE from 'three';
import { clamp, lerp, pick, rand, randi } from './utils.js';

/** The road lines, both directions. The grid is 60 units apart. */
export const ROADS = [-180, -120, -60, 0, 60, 120, 180];

/** The places the game navigates to: shops, jobs, homes, the PD. */
export const LANDMARKS = {
  mart: { x: -30, z: 150 },
  bank: { x: 90, z: 30 },
  warehouse: { x: -90, z: 90 },
  safehouse: { x: -150, z: -150 },
  loft: { x: 150, z: -90 },
  docks: { x: 120, z: 228 },
  chopShop: { x: -150, z: 150 },
  pdhq: { x: 150, z: 150 },
};

/** District tints, by the block a building stands on. */
const DISTRICT_COLORS = {
  marina: [0xe8b48a, 0xd89a6a, 0xc98a5a, 0xe8c89a],
  heights: [0x8aa8c8, 0x6a8ab0, 0xa8bdd8, 0x7a9ab8],
  neon: [0x9a6ad8, 0xd86a9a, 0x6a8ad8, 0xb05ad8],
  sunfield: [0xd8c89a, 0xc8b87a, 0xe8d8aa, 0xb8a86a],
};

function districtAt(x, z) {
  if (z >= 60) return x < 0 ? 'marina' : 'neon';
  if (x < 0) return 'sunfield';
  return 'heights';
}

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function flatBox(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

export class City {
  constructor(scene) {
    this.scene = scene;
    this.hour = 10;
    this.buildings = [];
    this.landmarks = {};
    for (const [name, p] of Object.entries(LANDMARKS)) {
      this.landmarks[name] = { x: p.x, z: p.z };
    }
    this.streetlights = [];
    this.windowMats = [];
    this.buildGround();
    this.buildRoads();
    this.buildBeachAndPier();
    this.buildBuildings();
    this.buildLandmarks();
    this.buildStreetlights();
    this.buildPalms();
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -230;
    this.sun.shadow.camera.right = 230;
    this.sun.shadow.camera.top = 230;
    this.sun.shadow.camera.bottom = -230;
    this.sun.shadow.camera.far = 600;
    scene.add(this.sun);
    this.sunTarget = new THREE.Object3D();
    scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;
    this.ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(this.ambient);
    scene.fog = new THREE.Fog(0x87b5e0, 130, 460);
    this.updateLight();
  }

  /** The asphalt base the whole city sits on. */
  buildGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 560),
      lambert(0x3d4148),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, 20);
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  /** Dark road strips with a pale centre line, both directions. */
  buildRoads() {
    const roadMat = lambert(0x22252b);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8c86a });
    for (const r of ROADS) {
      const v = flatBox(11, 0.06, 430, roadMat, r, 0, 0);
      this.scene.add(v);
      const h = flatBox(430, 0.06, 11, roadMat, 0, 0, r);
      this.scene.add(h);
      for (let d = -200; d <= 200; d += 20) {
        this.scene.add(flatBox(0.5, 0.08, 5, lineMat, r, 0.02, d));
        this.scene.add(flatBox(5, 0.08, 0.5, lineMat, d, 0.02, r));
      }
    }
  }

  /** Sand along the southern edge, the sea beyond it, and the pier. */
  buildBeachAndPier() {
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 46),
      lambert(0xe0c98f),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.01, 236);
    sand.receiveShadow = true;
    this.scene.add(sand);
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 120),
      new THREE.MeshLambertMaterial({ color: 0x1f6f9e }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.4, 318);
    this.scene.add(sea);
    // The pier: planks out over the water, with posts at the end.
    const plankMat = lambert(0x8a6a3a);
    for (let z = 214; z <= 282; z += 4) {
      this.scene.add(flatBox(10, 0.3, 3.6, plankMat, -30, 0.6, z));
    }
    const postMat = lambert(0x5a4020);
    for (const sx of [-1, 1]) {
      for (const z of [220, 250, 280]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.4, 8), postMat);
        post.position.set(-30 + sx * 4.6, 0, z);
        this.scene.add(post);
      }
    }
  }

  /** One or two buildings per block, tall in the centre, low near the beach. */
  buildBuildings() {
    const blockCentres = [-150, -90, -30, 30, 90, 150];
    for (const bx of blockCentres) {
      for (const bz of blockCentres) {
        const count = randi(1, 2);
        for (let i = 0; i < count; i++) {
          const w = rand(14, 26);
          const d = rand(14, 26);
          const x = bx + rand(-12, 12);
          const z = bz + rand(-12, 12);
          // Keep every doorstep clear of walls.
          let clear = true;
          for (const lm of Object.values(this.landmarks)) {
            if (Math.abs(lm.x - x) < w / 2 + 12 && Math.abs(lm.z - z) < d / 2 + 12) {
              clear = false;
            }
          }
          if (!clear) continue;
          const district = districtAt(x, z);
          const tall = (bx === -30 || bx === 30) && (bz === -30 || bz === 30);
          const h = tall ? rand(22, 46) : rand(6, 20);
          const color = pick(DISTRICT_COLORS[district]);
          const mat = lambert(color);
          const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          tower.position.set(x, h / 2, z);
          tower.castShadow = true;
          tower.receiveShadow = true;
          this.scene.add(tower);
          // A lighter roof slab, and an AC box on the taller roofs.
          this.scene.add(flatBox(w * 0.9, 0.5, d * 0.9, lambert(0xd8d8d8), x, h + 0.25, z));
          if (h > 18) {
            this.scene.add(flatBox(3, 1.4, 2.4, lambert(0x8a8a8a), x + w * 0.2, h + 1.2, z - d * 0.2));
          }
          // Lit windows: a glowing strip that shows after dark.
          if (Math.random() < 0.75) {
            const winMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
            winMat.transparent = true;
            winMat.opacity = 0;
            this.windowMats.push(winMat);
            const strip = new THREE.Mesh(
              new THREE.BoxGeometry(w * 0.7, Math.min(h * 0.55, 14), 0.15),
              winMat,
            );
            strip.position.set(x, h * 0.55, z + d / 2 + 0.08);
            this.scene.add(strip);
          }
          this.buildings.push({ x, z, hw: w / 2, hd: d / 2 });
        }
      }
    }
  }

  /** The named places: a coloured block with a roof sign, doorstep clear. */
  buildLandmarks() {
    const defs = {
      mart: { color: 0xffd23a, w: 22, h: 9, d: 16 },
      bank: { color: 0x5ab8ff, w: 20, h: 16, d: 16 },
      warehouse: { color: 0xff9a3a, w: 26, h: 10, d: 20 },
      safehouse: { color: 0x3affc8, w: 14, h: 7, d: 12 },
      loft: { color: 0xff4fd8, w: 16, h: 22, d: 14 },
      docks: { color: 0xe8e4da, w: 24, h: 4, d: 10 },
      chopShop: { color: 0x3affc8, w: 20, h: 8, d: 16 },
      pdhq: { color: 0x5ab8ff, w: 24, h: 18, d: 18 },
    };
    for (const [name, p] of Object.entries(this.landmarks)) {
      const def = defs[name];
      // The block sits behind its doorstep, so the doorstep stays open ground.
      const bx = p.x - 14;
      const bz = p.z;
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(def.w, def.h, def.d),
        lambert(def.color),
      );
      block.position.set(bx, def.h / 2, bz);
      block.castShadow = true;
      block.receiveShadow = true;
      this.scene.add(block);
      this.scene.add(flatBox(def.w * 0.9, 0.5, def.d * 0.9, lambert(0x222222), bx, def.h + 0.25, bz));
      this.buildings.push({ x: bx, z: bz, hw: def.w / 2, hd: def.d / 2 });
    }
  }

  /** Lamp posts at every other intersection; they glow after dark. */
  buildStreetlights() {
    const poleMat = lambert(0x2a2a2a);
    for (const rx of ROADS) {
      for (const rz of ROADS) {
        if ((rx + rz) % 120 !== 0) continue;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.5, 8), poleMat);
        pole.position.set(rx + 6.5, 3.25, rz + 6.5);
        this.scene.add(pole);
        const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
        lampMat.transparent = true;
        lampMat.opacity = 0;
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), lampMat);
        lamp.position.set(rx + 6.5, 6.6, rz + 6.5);
        this.scene.add(lamp);
        this.streetlights.push(lampMat);
      }
    }
  }

  /** Palms along the sand, leaning a little toward the sea. */
  buildPalms() {
    const trunkMat = lambert(0x6a4a2a);
    const frondMat = lambert(0x3a8a4a);
    for (let i = 0; i < 26; i++) {
      const x = rand(-200, 200);
      const z = rand(192, 210);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 5.5, 7), trunkMat);
      trunk.position.set(x, 2.75, z);
      trunk.rotation.z = rand(-0.12, 0.12);
      trunk.castShadow = true;
      this.scene.add(trunk);
      for (let f = 0; f < 5; f++) {
        const frond = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 5), frondMat);
        const a = (f / 5) * Math.PI * 2;
        frond.position.set(x + Math.sin(a) * 1.1, 5.9, z + Math.cos(a) * 1.1);
        frond.rotation.z = Math.sin(a) * 1.1;
        frond.rotation.x = -Math.cos(a) * 1.1;
        this.scene.add(frond);
      }
    }
  }

  /**
   * Keep a circle out of every building and inside the city. Returns the
   * corrected position; the beach is walkable, the sea is not.
   */
  collide(x, z, r) {
    x = clamp(x, -208, 208);
    z = clamp(z, -208, 252);
    for (const b of this.buildings) {
      const cx = clamp(x, b.x - b.hw, b.x + b.hw);
      const cz = clamp(z, b.z - b.hd, b.z + b.hd);
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      } else {
        const px = b.hw + r - Math.abs(x - b.x);
        const pz = b.hd + r - Math.abs(z - b.z);
        if (px < pz) x = b.x + (x >= b.x ? 1 : -1) * (b.hw + r);
        else z = b.z + (z >= b.z ? 1 : -1) * (b.hd + r);
      }
    }
    return { x, z };
  }

  /** The open ground in front of a named place. */
  doorstep(name) {
    const p = this.landmarks[name];
    return p ? { x: p.x, z: p.z } : { x: 0, z: 0 };
  }

  /** A random spot on a sidewalk, for spawning pedestrians. */
  sidewalkPoint() {
    const road = pick(ROADS);
    const along = rand(-195, 195);
    const off = pick([-1, 1]) * rand(7, 9.5);
    if (Math.random() < 0.5) return { x: road + off, z: along };
    return { x: along, z: road + off };
  }

  /** Jump the clock; the light follows at once. */
  setHour(h) {
    this.hour = ((h % 24) + 24) % 24;
    this.updateLight();
  }

  /** The day rolls on: one game hour every twenty seconds. */
  step(dt) {
    this.hour = (this.hour + dt / 20) % 24;
    this.updateLight();
  }

  /** Sun, sky, fog and lamps, all from the hour of day. */
  updateLight() {
    const h = this.hour;
    let dayF = 0;
    if (h > 5.5 && h < 19.5) dayF = clamp(Math.min((h - 5.5) / 2, (19.5 - h) / 2), 0, 1);
    const duskF = clamp(1 - Math.abs(h - 18.3) / 1.6, 0, 1)
      + clamp(1 - Math.abs(h - 6.7) / 1.6, 0, 1);
    const sunT = ((h - 6) / 12) * Math.PI;
    this.sun.position.set(Math.cos(sunT) * 190, Math.max(24, Math.sin(sunT) * 230), 70);
    this.sun.intensity = 0.15 + dayF * 1.25;
    this.sun.color.setHex(duskF > 0.4 ? 0xffb36a : 0xfff2d8);
    this.ambient.intensity = 0.18 + dayF * 0.38;
    const night = new THREE.Color(0x0b1026);
    const day = new THREE.Color(0x87b5e0);
    const sky = night.clone().lerp(day, dayF);
    if (duskF > 0) sky.lerp(new THREE.Color(0xff8a4a), Math.min(duskF, 1) * 0.45);
    this.scene.background = sky;
    if (this.scene.fog) this.scene.fog.color.copy(sky);
    const glow = (1 - dayF) * 0.9;
    for (const m of this.windowMats) m.opacity = glow;
    for (const m of this.streetlights) m.opacity = glow;
  }
}
