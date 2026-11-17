// pedestrians.js — sidewalk walkers who flee from gunfire and crashes,
// and get knocked down when the player hits them.
import * as THREE from 'three';
import { mulberry32, pick, clamp, angDiff, dist2 } from './utils.js';

const SHIRTS = [0xe84a5f, 0x4a90e8, 0x50c878, 0xe8a33d, 0x9b59b6, 0xe8e8e8, 0x2a2d34, 0xd2691e];
const SKINS = [0xf2c89b, 0xc98d5a, 0x8a5a30, 0xf0d0b0];

export function makePed() {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: pick(Math.random, SHIRTS), roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: pick(Math.random, SKINS), roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.36), shirt);
  torso.position.y = 1.15; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.85; head.castShadow = true; g.add(head);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2d34, roughness: 0.95 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.26), legMat);
  legL.position.set(-0.16, 0.38, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  const armMat = new THREE.MeshStandardMaterial({ color: 0x2a2d34, roughness: 0.95 });
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), armMat);
  armL.position.set(-0.42, 1.15, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
  const ped = {
    group: g, x: 0, z: 0, heading: 0, speed: 0, state: 'walk',
    legL, legR, armL, armR, walkPhase: Math.random() * 6, downTimer: 0, fleeTimer: 0,
    node: null, next: null, side: 1,
  };
  g.userData.ped = ped;
  return ped;
}

export class Pedestrians {
  constructor(scene, city) {
    this.scene = scene; this.city = city;
    this.rng = mulberry32(4242);
    this.peds = [];
  }
  spawn(count) {
    for (let i = 0; i < count; i++) {
      const ped = makePed();
      const node = pick(this.rng, this.city.nodes);
      const next = pick(this.rng, this.city.neighbors(node));
      ped.node = node; ped.next = next;
      ped.side = this.rng() < 0.5 ? 1 : -1;
      ped.x = node.x + (this.rng() - 0.5) * 8;
      ped.z = node.z + (this.rng() - 0.5) * 8;
      ped.speed = 1.2 + this.rng() * 1.2;
      ped.group.scale.setScalar(0.92 + this.rng() * 0.16); // varied heights
      this.scene.add(ped.group);
      this.peds.push(ped);
    }
  }
  scare(x, z, radius) {
    for (const p of this.peds) {
      if (p.state === 'down') continue;
      if (dist2(x, z, p.x, p.z) < radius) {
        p.state = 'flee'; p.fleeTimer = 3 + this.rng() * 2;
        p.fleeFromX = x; p.fleeFromZ = z;
      }
    }
  }
  knockDown(ped) {
    if (ped.state === 'down') return;
    ped.state = 'down'; ped.downTimer = 5;
    ped.group.rotation.x = Math.PI / 2;
    ped.group.position.y = 0.3;
  }
  update(dt, world) {
    for (const p of this.peds) {
      if (p.state === 'down') {
        p.downTimer -= dt;
        if (p.downTimer <= 0) {
          p.state = 'flee'; p.fleeTimer = 4;
          p.group.rotation.x = 0; p.group.position.y = 0;
          p.fleeFromX = world.playerX; p.fleeFromZ = world.playerZ;
        }
        continue;
      }
      let tx, tz, spd = p.speed;
      if (p.state === 'flee') {
        p.fleeTimer -= dt;
        const dx = p.x - p.fleeFromX, dz = p.z - p.fleeFromZ;
        const d = Math.sqrt(dx * dx + dz * dz) || 1;
        tx = p.x + (dx / d) * 10; tz = p.z + (dz / d) * 10;
        spd = 4.2;
        if (p.fleeTimer <= 0) p.state = 'walk';
      } else {
        const dx = p.next.x - p.x, dz = p.next.z - p.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < 4) {
          p.node = p.next;
          p.next = pick(this.rng, this.city.neighbors(p.node));
          continue;
        }
        // walk on the sidewalk, offset from the road center
        const nx = -dz / d, nz = dx / d;
        tx = p.next.x + nx * p.side * 8.5;
        tz = p.next.z + nz * p.side * 8.5;
      }
      const dx = tx - p.x, dz = tz - p.z;
      const want = Math.atan2(dx, dz);
      p.heading += clamp(angDiff(p.heading, want), -3 * dt, 3 * dt);
      p.x += Math.sin(p.heading) * spd * dt;
      p.z += Math.cos(p.heading) * spd * dt;
      p.x = clamp(p.x, world.city.bounds.minX, world.city.bounds.maxX);
      p.z = clamp(p.z, world.city.bounds.minZ, world.city.bounds.maxZ);
      p.walkPhase += spd * dt * 3.2;
      const sw = Math.sin(p.walkPhase) * 0.5;
      p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
      p.armL.rotation.x = -sw * 0.7; p.armR.rotation.x = sw * 0.7;
      p.group.position.set(p.x, 0, p.z);
      p.group.rotation.y = p.heading;
    }
  }
}
