// pedestrians.js — the crowd of Solmar: 44 walkers who stroll the
// sidewalks, scatter from gunfire and fast cars, and pick themselves up
// after being knocked down.

import * as THREE from 'three';
import { dist2, pick, rand } from './utils.js';
import { ROADS } from './city.js';

const SHIRTS = [0xe86a5a, 0x3ab8ff, 0xffd23a, 0x7ae0c8, 0xc98ad8, 0x8ab85a, 0xe8e4da, 0x5a6a7a];
const PANTS = [0x2e3138, 0x4a3a2a, 0x2a3a5a, 0x5a5a5a];

function buildWalkerMesh() {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pick(SHIRTS) });
  const pants = new THREE.MeshLambertMaterial({ color: pick(PANTS) });
  const skin = new THREE.MeshLambertMaterial({ color: pick([0xe8b88a, 0xc98a5a, 0x8a5a38, 0xf2c9a0]) });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.24), pants);
  legs.position.y = 0.4;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.3), shirt);
  torso.position.y = 1.12;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.68;
  head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.23, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: pick([0x1a1a1a, 0x4a2a1a, 0x8a7a5a, 0xd8d8d8]) }),
  );
  hair.position.y = 1.72;
  g.add(hair);
  return g;
}

/** One person on the street. */
function makeWalker(city, scene) {
  const p = city.sidewalkPoint();
  const w = {
    group: buildWalkerMesh(),
    x: p.x,
    z: p.z,
    angle: pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]),
    speed: rand(0.9, 1.7),
    down: 0,
    fleeing: 0,
    bob: rand(0, Math.PI * 2),
  };
  w.group.position.set(w.x, 0, w.z);
  w.group.rotation.y = w.angle;
  scene.add(w.group);
  return w;
}

export class Crowd {
  constructor(city, scene) {
    this.city = city;
    this.scene = scene;
    this.walkers = [];
    for (let i = 0; i < 44; i++) this.walkers.push(makeWalker(city, scene));
  }

  get count() {
    return this.walkers.length;
  }

  /** The walkers, under the name the probe reads. */
  get peds() {
    return this.walkers;
  }

  /** Knock a walker down for a few seconds. */
  knockDown(w, secs = 3) {
    if (!w || w.down > 0) return;
    w.down = secs;
    w.group.rotation.z = Math.PI / 2;
    w.group.position.y = 0.25;
  }

  /** Walk the sidewalks; run from danger; get back up when the dust settles. */
  step(dt, px, pz, dangerSpeed) {
    for (const w of this.walkers) {
      if (w.down > 0) {
        w.down -= dt;
        if (w.down <= 0) {
          w.group.rotation.z = 0;
          w.group.position.y = 0;
          w.angle = pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
        }
        continue;
      }
      const d = dist2(w.x, w.z, px, pz);
      const scared = d < 12 && dangerSpeed > 6;
      if (scared) w.fleeing = 1.2;
      let speed = w.speed;
      let targetAngle = w.angle;
      if (w.fleeing > 0) {
        w.fleeing -= dt;
        speed = 4.2;
        // Run directly away from the threat.
        targetAngle = Math.atan2(w.x - px, w.z - pz);
      } else {
        // Amble along the sidewalk; turn at random, stay near a road.
        if (Math.random() < dt * 0.12) {
          targetAngle = w.angle + pick([-Math.PI / 2, Math.PI / 2, Math.PI]);
        }
      }
      // Ease the heading toward the target instead of snapping.
      let diff = targetAngle - w.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      w.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
      w.x += Math.sin(w.angle) * speed * dt;
      w.z += Math.cos(w.angle) * speed * dt;
      // Keep walkers inside the city and near the streets.
      if (Math.abs(w.x) > 205 || Math.abs(w.z) > 205 || w.z > 212) {
        w.angle += Math.PI;
        w.x = Math.max(-205, Math.min(205, w.x));
        w.z = Math.max(-205, Math.min(212, w.z));
      }
      w.bob += dt * (scared ? 14 : 7);
      w.group.position.set(w.x, Math.abs(Math.sin(w.bob)) * 0.05, w.z);
      w.group.rotation.y = w.angle;
    }
  }

  /** The nearest walker within maxD of (x, z), or null. */
  nearest(x, z, maxD) {
    let best = null;
    let bestD = maxD;
    for (const w of this.walkers) {
      if (w.down > 0) continue;
      const d = dist2(x, z, w.x, w.z);
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    return best;
  }
}
