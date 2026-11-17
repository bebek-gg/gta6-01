// police.js — the wanted system: heat, stars, foot cops and PD cruisers
// that chase, ram and bust the player.
import * as THREE from 'three';
import { mulberry32, clamp, angDiff, dist2 } from './utils.js';
import { collideCircle } from './city.js';
import { makeCar, placeCar } from './vehicles.js';

function makeCopMesh() {
  const g = new THREE.Group();
  const uni = new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98d5a, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.9, 0.38), uni);
  torso.position.y = 1.2; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
  head.position.y = 1.92; g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.3, 0.14, 10),
    new THREE.MeshStandardMaterial({ color: 0x0f1a30, roughness: 0.7 }));
  cap.position.y = 2.08; g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.8, 0.28), uni);
  legL.position.set(-0.17, 0.4, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.17; g.add(legR);
  return { group: g, legL, legR };
}

export class Police {
  constructor(scene, city) {
    this.scene = scene; this.city = city;
    this.rng = mulberry32(99);
    this.heat = 0; this.stars = 0;
    this.cops = []; this.cars = [];
    this.bustTimer = 0; this.unseenTimer = 0;
    this.sirenOn = false;
  }
  addHeat(n, why) {
    if (this.heat <= 0 && n > 0) this.unseenTimer = 0;
    this.heat = clamp(this.heat + n, 0, 1000);
    const s = this.stars;
    this.stars = this.heat <= 0 ? 0 : Math.min(5, Math.ceil(this.heat / 200));
    return this.stars !== s;
  }
  clear() {
    this.heat = 0; this.stars = 0; this.bustTimer = 0;
    for (const c of this.cops) this.scene.remove(c.group);
    for (const c of this.cars) this.scene.remove(c.group);
    this.cops = []; this.cars = [];
    this.siren(false);
  }
  siren(on) {
    this.sirenOn = on;
  }
  hearShot(x, z) {
    this.addHeat(120, 'shot');
    for (const c of this.cops) { c.tx = x; c.tz = z; }
  }
  spawnCop(x, z) {
    const m = makeCopMesh();
    const cop = { ...m, x, z, heading: 0, speed: 7.5, health: 100, down: false, downTimer: 0, phase: Math.random() * 6 };
    this.scene.add(cop.group);
    this.cops.push(cop);
    return cop;
  }
  spawnCar(x, z) {
    const car = makeCar('cruiser', 0x14181f);
    placeCar(car, x, z, 0);
    car.health = 120; car.stuckTimer = 0;
    this.scene.add(car.group);
    this.cars.push(car);
    return car;
  }
  wantedCounts() {
    const s = this.stars;
    return { cops: s === 0 ? 0 : s < 3 ? s : s + 1, cars: s < 2 ? 0 : Math.min(4, s - 1) };
  }
  update(dt, world) {
    const px = world.playerX, pz = world.playerZ;
    const want = this.wantedCounts();
    // spawn / despawn to match the wanted level
    while (this.cops.filter((c) => !c.down).length < want.cops) {
      const a = this.rng() * Math.PI * 2, d = 45 + this.rng() * 25;
      this.spawnCop(clamp(px + Math.cos(a) * d, -220, 220), clamp(pz + Math.sin(a) * d, -220, 220));
    }
    while (this.cars.filter((c) => c.health > 0).length < want.cars) {
      const node = this.city.nodes[Math.floor(this.rng() * this.city.nodes.length)];
      this.spawnCar(node.x, node.z);
    }
    // heat decay when unseen
    let seen = false;
    for (const c of this.cops) if (!c.down && dist2(px, pz, c.x, c.z) < 55) seen = true;
    for (const c of this.cars) if (c.health > 0 && dist2(px, pz, c.x, c.z) < 70) seen = true;
    if (seen) this.unseenTimer = 0;
    else {
      this.unseenTimer += dt;
      if (this.unseenTimer > 12) this.heat = Math.max(0, this.heat - 30 * dt);
      this.stars = this.heat <= 0 ? 0 : Math.min(5, Math.ceil(this.heat / 200));
    }
    this.siren(this.stars > 0);
    // foot cops chase
    // one shared bust timer: it fills while ANY cop is on the player and
    // only drains when NO cop is close (a far cop must not cancel a near one)
    let anyCopClose = false;
    for (const c of this.cops) {
      if (c.down) {
        c.downTimer -= dt;
        if (c.downTimer <= 0) {
          c.down = false; c.health = 100;
          c.group.rotation.x = 0; c.group.position.y = 0;
        }
        continue;
      }
      if (c.health <= 0) {
        c.down = true; c.downTimer = 6;
        c.group.rotation.x = Math.PI / 2; c.group.position.y = 0.3;
        continue;
      }
      const d = dist2(px, pz, c.x, c.z);
      const wantH = Math.atan2(px - c.x, pz - c.z);
      c.heading += clamp(angDiff(c.heading, wantH), -4 * dt, 4 * dt);
      const spd = d > 6 ? c.speed : c.speed * 0.6;
      let nx = c.x + Math.sin(c.heading) * spd * dt;
      let nz = c.z + Math.cos(c.heading) * spd * dt;
      const hit = collideCircle(this.city.colliders, nx, nz, 0.7);
      c.x = clamp(hit.x, -230, 230); c.z = clamp(hit.z, -230, 230);
      c.phase += spd * dt * 1.8;
      const sw = Math.sin(c.phase) * 0.5;
      c.legL.rotation.x = sw; c.legR.rotation.x = -sw;
      c.group.position.set(c.x, 0, c.z);
      c.group.rotation.y = c.heading;
      // bust: this cop has reached a slow player on foot
      if (!world.inCar && d < 2.2 && world.playerSpeed < 3) anyCopClose = true;
    }
    if (anyCopClose) {
      this.bustTimer += dt;
      if (this.bustTimer > 1.0) { this.bustTimer = 0; world.onBusted && world.onBusted(); }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
    }
    // police cars chase (direct steering + slide + unstuck)
    for (const car of this.cars) {
      if (car.health <= 0) continue;
      const d = dist2(px, pz, car.x, car.z);
      const wantH = Math.atan2(px - car.x, pz - car.z);
      car.heading += clamp(angDiff(car.heading, wantH), -2.4 * dt, 2.4 * dt);
      const target = this.stars >= 4 ? 30 : 24;
      car.speed += clamp(target - car.speed, -20 * dt, 12 * dt);
      let nx = car.x + Math.sin(car.heading) * car.speed * dt;
      let nz = car.z + Math.cos(car.heading) * car.speed * dt;
      const hit = collideCircle(this.city.colliders, nx, nz, 2.1);
      if (hit.x !== nx || hit.z !== nz) {
        car.speed *= 0.5;
        car.stuckTimer += dt;
        if (car.stuckTimer > 2) { car.heading += Math.PI * 0.9; car.stuckTimer = 0; }
      } else car.stuckTimer = 0;
      car.x = clamp(hit.x, -230, 230); car.z = clamp(hit.z, -230, 230);
      // ram the player's car
      if (world.playerCar) {
        const pd = dist2(car.x, car.z, world.playerCar.x, world.playerCar.z);
        if (pd < 3.8) {
          world.playerCar.health -= 12 * dt * 4;
          world.playerCar.speed *= 0.985;
          if (world.playerCar.health <= 0) world.onCarWrecked && world.onCarWrecked();
        }
      } else if (d < 3.4 && world.playerSpeed > 1) {
        // cruiser clips the player on foot
        world.onRam && world.onRam();
      }
      car.group.position.set(car.x, 0, car.z);
      car.group.rotation.y = car.heading;
      const bar = car.group.userData.lightBar;
      if (bar) bar.material.emissive.setHex(Math.floor(performance.now() / 350) % 2 ? 0xff2020 : 0x2040ff);
    }
  }
}
