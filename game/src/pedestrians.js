// pedestrians.js — the people of Solmar: 48 walkers on the sidewalks who
// stroll between intersections and scatter when a car or a gunshot comes near.
import * as THREE from 'three';
import { rand, randInt, pick, dist2, clamp } from './utils.js';

const SHIRTS = [0xd85a5a, 0x5a8ad8, 0x5ad88a, 0xd8c85a, 0x9a5ad8, 0xe8e8e8, 0x5ad8d8, 0xd88a5a];
const pedGeo = new THREE.CapsuleGeometry(0.42, 0.9, 4, 8);
const headGeo = new THREE.SphereGeometry(0.26, 8, 6);
const skinMat = new THREE.MeshLambertMaterial({ color: 0xd8a878 });

export function createPedestrians(scene, city) {
  const peds = [];
  const ROAD = [];
  for (let v = -240; v <= 240; v += 40) ROAD.push(v);

  function snapRoad(v) {
    return Math.round(v / 40) * 40;
  }

  function pickTarget(fromX, fromZ) {
    const ix = snapRoad(fromX);
    const iz = snapRoad(fromZ);
    const dirs = [[40, 0], [-40, 0], [0, 40], [0, -40]];
    const options = [];
    for (const [dx, dz] of dirs) {
      const nx = ix + dx;
      const nz = iz + dz;
      if (nx >= -240 && nx <= 240 && nz >= -240 && nz <= 240) options.push({ x: nx, z: nz });
    }
    return pick(options);
  }

  function spawnPed() {
    const p = city.randomRoadPoint();
    const group = new THREE.Group();
    const body = new THREE.Mesh(pedGeo, new THREE.MeshLambertMaterial({ color: pick(SHIRTS) }));
    body.position.y = 0.95;
    group.add(body);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.85;
    group.add(head);
    group.position.set(p.x, 0, p.z);
    scene.add(group);
    const t = pickTarget(p.x, p.z);
    const ped = {
      x: p.x,
      z: p.z,
      tx: t.x,
      tz: t.z,
      angle: rand(0, Math.PI * 2),
      speed: rand(1.1, 2.1),
      group,
      fleeT: 0,
      sync() {
        group.position.set(this.x, 0, this.z);
        group.rotation.y = this.angle;
      },
    };
    ped.sync();
    peds.push(ped);
    return ped;
  }

  for (let i = 0; i < 48; i++) spawnPed();


  function update(dt, playerX, playerZ, inCar) {
    for (const ped of peds) {
      // Scatter when a car bears down on the sidewalk.
      if (inCar && dist2(ped.x, ped.z, playerX, playerZ) < 12) {
        ped.fleeT = 2.5;
      }
      if (ped.fleeT > 0) {
        ped.fleeT -= dt;
        const dx = ped.x - playerX;
        const dz = ped.z - playerZ;
        const d = Math.max(0.1, Math.sqrt(dx * dx + dz * dz));
        ped.angle = Math.atan2(dx / d, dz / d);
        ped.x += Math.sin(ped.angle) * 4.5 * dt;
        ped.z += Math.cos(ped.angle) * 4.5 * dt;
      } else {
        const d = dist2(ped.x, ped.z, ped.tx, ped.tz);
        if (d < 5) {
          const t = pickTarget(ped.tx, ped.tz);
          ped.tx = t.x;
          ped.tz = t.z;
        }
        const want = Math.atan2(ped.tx - ped.x, ped.tz - ped.z);
        let diff = want - ped.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ped.angle += diff * Math.min(1, dt * 3);
        ped.x += Math.sin(ped.angle) * ped.speed * dt;
        ped.z += Math.cos(ped.angle) * ped.speed * dt;
      }
      const c = city.clampToMap(ped.x, ped.z);
      ped.x = c.x;
      ped.z = c.z;
      ped.sync();
    }
  }

  // A gunshot nearby sends the closest walkers running.
  function scare(x, z, radius) {
    for (const ped of peds) {
      if (dist2(ped.x, ped.z, x, z) < radius) ped.fleeT = 2.5;
    }
  }

  return { peds, update, scare };
}
