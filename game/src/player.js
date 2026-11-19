// player.js — Milo Reyes on foot: camera-relative movement, sprint, jump,
// health and armour, punches and the pistol.

import * as THREE from 'three';
import { clamp, dist2 } from './utils.js';

function buildMiloMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2a6a8a });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.85, 0.26), jeans);
  legs.position.y = 0.42;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.34), jacket);
  torso.position.y = 1.2;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skin);
  head.position.y = 1.78;
  head.castShadow = true;
  g.add(head);
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2.4),
    new THREE.MeshLambertMaterial({ color: 0xd8382a }),
  );
  cap.position.y = 1.82;
  g.add(cap);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), jacket);
  armL.position.set(-0.4, 1.2, 0);
  g.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), jacket);
  armR.position.set(0.4, 1.2, 0);
  g.add(armR);
  return g;
}

export class Milo {
  constructor(scene) {
    this.group = buildMiloMesh();
    scene.add(this.group);
    this.x = 0;
    this.z = 150;
    this.y = 0;
    this.vy = 0;
    this.angle = Math.PI;
    this.speed = 0;
    this.health = 100;
    this.armor = 0;
    this.armed = false;
    this.ammo = 0;
    this.lastHurtAt = -99;
    this.punchCooldown = 0;
    this.shotCooldown = 0;
    this.sync();
  }

  setPosition(x, z, y = 0) {
    this.x = x;
    this.z = z;
    this.y = y;
    this.vy = 0;
    this.sync();
  }

  sync() {
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.angle;
  }

  /**
   * Move on foot. input is {forward, back, left, right, sprint, jump};
   * camYaw is the camera's heading so W always means "away from camera".
   */
  step(dt, input, camYaw, game) {
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);
    // Slow health recovery after eight calm seconds.
    if (game.time - this.lastHurtAt > 8 && this.health > 0 && this.health < 100) {
      this.health = Math.min(100, this.health + 3 * dt);
    }
    const fwdX = Math.sin(camYaw);
    const fwdZ = Math.cos(camYaw);
    const rightX = Math.sin(camYaw - Math.PI / 2);
    const rightZ = Math.cos(camYaw - Math.PI / 2);
    let mx = 0;
    let mz = 0;
    if (input.forward) { mx += fwdX; mz += fwdZ; }
    if (input.back) { mx -= fwdX; mz -= fwdZ; }
    if (input.right) { mx += rightX; mz += rightZ; }
    if (input.left) { mx -= rightX; mz -= rightZ; }
    const moving = mx !== 0 || mz !== 0;
    const top = input.sprint ? 12 : 8;
    if (moving) {
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
      this.angle = Math.atan2(mx, mz);
      this.speed = top;
    } else {
      this.speed = 0;
    }
    const nx = this.x + mx * this.speed * dt;
    const nz = this.z + mz * this.speed * dt;
    const fixed = game.city.collide(nx, nz, 0.55);
    this.x = fixed.x;
    this.z = fixed.z;
    // Jump: simple vertical velocity, land back on the street.
    if (input.jump && this.y === 0) this.vy = 7.5;
    if (this.y > 0 || this.vy !== 0) {
      this.vy -= 22 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
      }
    }
    this.sync();
  }

  /** Take a hit: armour soaks 60% before health does. */
  hurt(amount, game) {
    if (this.health <= 0 || game.state !== 'playing') return;
    this.lastHurtAt = game.time;
    let rest = amount;
    if (this.armor > 0) {
      const soaked = Math.min(this.armor, rest * 0.6);
      this.armor -= soaked;
      rest -= soaked;
    }
    this.health -= rest;
    game.audio.thud();
    if (this.health <= 0) {
      this.health = 0;
      game.downed();
    }
  }

  /** A swing at whatever is in front: peds, cops, and loose cash. */
  punch(game) {
    if (this.punchCooldown > 0 || game.state !== 'playing') return;
    this.punchCooldown = 0.45;
    game.audio.thud();
    const reach = 2.3;
    const fx = Math.sin(this.angle);
    const fz = Math.cos(this.angle);
    // Pedestrians go down and drop a few dollars.
    const ped = game.peds.nearest(this.x + fx * 1.2, this.z + fz * 1.2, reach);
    if (ped) {
      game.peds.knockDown(ped, 3);
      const loot = 5 + Math.floor(Math.random() * 20);
      game.addCash(loot, `+$${loot} off the street`);
      return;
    }
    // Cops go down for eight seconds.
    for (const cop of game.police.cops) {
      if (cop.down > 0) continue;
      const d = dist2(this.x, this.z, cop.x, cop.z);
      if (d < reach) {
        game.police.knockDown(cop);
        game.addCash(15, '+$15 — the cop will not remember this');
        return;
      }
    }
  }

  /** Fire the pistol at the closest thing in front of Milo. */
  fire(game) {
    if (!this.armed || this.ammo <= 0 || this.shotCooldown > 0) return;
    if (game.state !== 'playing') return;
    this.shotCooldown = 0.3;
    this.ammo -= 1;
    game.audio.shot();
    const fx = Math.sin(this.angle);
    const fz = Math.cos(this.angle);
    // A short-lived tracer line from the muzzle.
    game.spawnTracer(this.x + fx, 1.4, this.z + fz, this.x + fx * 34, 1.4, this.z + fz * 34);
    let best = null;
    let bestD = 34;
    const consider = (x, z, obj) => {
      const along = (x - this.x) * fx + (z - this.z) * fz;
      const side = Math.abs((x - this.x) * fz - (z - this.z) * fx);
      if (along > 1 && along < bestD && side < 1.8) {
        bestD = along;
        best = obj;
      }
    };
    for (const cop of game.police.cops) {
      if (cop.down <= 0) consider(cop.x, cop.z, { kind: 'cop', ref: cop });
    }
    for (const w of game.peds.walkers) {
      if (w.down <= 0) consider(w.x, w.z, { kind: 'ped', ref: w });
    }
    for (const car of game.traffic.cars) {
      consider(car.x, car.z, { kind: 'car', ref: car });
    }
    if (!best) return;
    if (best.kind === 'cop') {
      game.police.knockDown(best.ref);
      game.police.addHeat(60, 'shot a cop');
    } else if (best.kind === 'ped') {
      game.peds.knockDown(best.ref, 4);
      game.police.addHeat(25, 'shot a pedestrian');
    } else {
      best.ref.health = Math.max(0, best.ref.health - 25);
      if (best.ref.health <= 0) best.ref.wrecked = true;
      game.police.addHeat(15, 'shot at traffic');
    }
  }
}
