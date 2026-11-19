// police.js — the wanted system: heat, stars, foot cops, PD cruisers and
// the helicopter that joins at four stars.

import * as THREE from 'three';
import { clamp, dist2, rand, turnToward } from './utils.js';
import { Vehicle } from './vehicles.js';

/** Heat needed for each star. */
const THRESHOLDS = [100, 250, 450, 650, 850];

function buildCopMesh() {
  const g = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.8, 0.26), dark);
  legs.position.y = 0.4;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.68, 0.32), navy);
  torso.position.y = 1.14;
  torso.castShadow = true;
  g.add(torso);
  const badge = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.14, 0.04),
    new THREE.MeshBasicMaterial({ color: 0xffd23a }),
  );
  badge.position.set(-0.14, 1.3, 0.18);
  g.add(badge);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), skin);
  head.position.y = 1.7;
  g.add(head);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.26, 0.12, 10),
    new THREE.MeshLambertMaterial({ color: 0x0e1a30 }),
  );
  cap.position.y = 1.88;
  g.add(cap);
  return g;
}

function buildHeliMesh() {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  const blue = new THREE.MeshLambertMaterial({ color: 0x2244aa });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 4.2), white);
  body.position.y = 0;
  body.castShadow = true;
  g.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.4, 4.24), blue);
  stripe.position.y = 0.1;
  g.add(stripe);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 1.2), white);
  nose.position.set(0, -0.1, 2.5);
  g.add(nose);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.4), white);
  tail.position.set(0, 0.3, -3.6);
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 0.9), blue);
  fin.position.set(0, 1.0, -5.1);
  g.add(fin);
  const rotor = new THREE.Group();
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.08, 0.45), bladeMat);
    blade.rotation.y = a;
    rotor.add(blade);
  }
  rotor.position.y = 1.0;
  g.add(rotor);
  const skids = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 3.4), bladeMat);
  skids.position.y = -1.0;
  g.add(skids);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(7, 20, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff2b0, transparent: true, opacity: 0.13,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  cone.position.y = -11;
  cone.rotation.x = Math.PI;
  g.add(cone);
  return { group: g, rotor };
}

export class Wanted {
  constructor(game) {
    this.game = game;
    this.heat = 0;
    this.cops = [];
    this.cars = [];
    this.heli = null;
    this.spotTarget = new THREE.Object3D();
    game.scene.add(this.spotTarget);
  }

  get level() {
    let stars = 0;
    for (const t of THRESHOLDS) if (this.heat >= t) stars += 1;
    return stars;
  }

  /** The star count, under the name the probe reads. */
  get stars() {
    return this.level;
  }

  addHeat(n, why) {
    if (n <= 0) return;
    this.heat = Math.min(1200, this.heat + n);
    if (this.level >= 1) this.game.audio.sirenBlip();
  }

  /** Heat to zero, every unit off the street. */
  reset() {
    this.heat = 0;    for (const cop of this.cops) this.game.scene.remove(cop.group);
    this.cops = [];
    for (const car of this.cars) this.game.scene.remove(car.group);
    this.cars = [];
    this.removeHeli();
    this.game.audio.siren(false);
    this.game.audio.rotor(false);
  }

  /** Short name for reset(), used by the playtest probe. */
  clear() {
    this.reset();
  }

  knockDown(cop) {
    if (!cop || cop.down > 0) return;
    cop.down = 8;
    cop.group.rotation.z = Math.PI / 2;
    cop.group.position.y = 0.25;
  }

  removeHeli() {
    if (!this.heli) return;
    this.game.scene.remove(this.heli.group);
    this.heli = null;
    this.game.audio.rotor(false);
  }

  spawnCop() {
    const g = this.game;
    const a = rand(0, Math.PI * 2);
    const d = rand(38, 55);
    const x = g.player.x + Math.sin(a) * d;
    const z = g.player.z + Math.cos(a) * d;
    const fixed = g.city.collide(x, z, 0.6);
    const cop = {
      group: buildCopMesh(),
      x: fixed.x,
      z: fixed.z,
      angle: 0,
      down: 0,
      arrestT: 0,
    };
    cop.group.position.set(cop.x, 0, cop.z);
    g.scene.add(cop.group);
    this.cops.push(cop);
  }

  spawnCruiser() {
    const g = this.game;
    const door = g.city.doorstep('pdhq');
    const car = new Vehicle('cruiser', g.scene);
    car.x = door.x + rand(-30, 30);
    car.z = door.z + rand(-30, 30);
    const fixed = g.city.collide(car.x, car.z, 1.7);
    car.x = fixed.x;
    car.z = fixed.z;
    car.angle = rand(0, Math.PI * 2);
    car.speed = 0;
    car.sync();
    this.cars.push(car);
  }

  spawnHeli() {
    const g = this.game;
    const { group, rotor } = buildHeliMesh();
    const px = g.player.x;
    const pz = g.player.z;
    const pa = g.playerCar ? g.playerCar.angle : g.player.angle;
    const heli = {
      group,
      rotor,
      x: px + Math.sin(pa) * 60,
      y: 18,
      z: pz + Math.cos(pa) * 60,
      angle: pa,
      light: null,
    };
    const spot = new THREE.SpotLight(0xfff2b0, 900, 90, 0.42, 0.5, 1.2);
    spot.position.set(0, -1, 0);
    spot.target = this.spotTarget;
    group.add(spot);
    heli.light = spot;
    group.position.set(heli.x, heli.y, heli.z);
    g.scene.add(group);
    this.heli = heli;
    g.audio.rotor(true);
  }

  step(dt) {
    const g = this.game;
    if (this.heat > 0) {
      // Cool off fast when nobody can see Milo, slowly when a unit is near.
      let near = false;
      for (const cop of this.cops) {
        if (cop.down <= 0 && dist2(cop.x, cop.z, g.player.x, g.player.z) < 30) near = true;
      }
      for (const car of this.cars) {
        if (dist2(car.x, car.z, g.player.x, g.player.z) < 40) near = true;
      }
      // The helicopter does not count: it always knows where Milo is, and
      // the heat still has to be losable at four stars.
      this.heat = Math.max(0, this.heat - (near ? 2 : 14) * dt);
    }
    const stars = this.level;
    g.audio.siren(stars >= 2 || this.cops.length > 0);

    // Foot cops: one per star, up to four.
    const wantCops = Math.min(stars, 4);
    while (this.cops.length < wantCops) this.spawnCop();
    while (this.cops.length > wantCops) {
      const cop = this.cops.pop();
      g.scene.remove(cop.group);
    }
    // Cruisers from two stars: one per star above the first, up to three.
    const wantCars = stars >= 2 ? Math.min(stars - 1, 3) : 0;
    while (this.cars.length < wantCars) this.spawnCruiser();
    while (this.cars.length > wantCars) {
      const car = this.cars.pop();
      g.scene.remove(car.group);
    }
    // The helicopter joins at four stars and leaves the moment heat drops.
    if (stars >= 4 && !this.heli) this.spawnHeli();
    if (stars < 4 && this.heli) this.removeHeli();

    const pSpeed = g.inCar && g.playerCar ? Math.abs(g.playerCar.speed) : g.player.speed;
    for (const cop of this.cops) {
      if (cop.down > 0) {
        cop.down -= dt;
        if (cop.down <= 0) {
          cop.group.rotation.z = 0;
          cop.group.position.y = 0;
        }
        continue;
      }
      const dx = g.player.x - cop.x;
      const dz = g.player.z - cop.z;
      const d = Math.hypot(dx, dz);
      cop.angle = Math.atan2(dx, dz);
      if (d > 1.6) {
        const stepLen = Math.min(d - 1.2, 6.6 * dt);
        const nx = cop.x + (dx / d) * stepLen;
        const nz = cop.z + (dz / d) * stepLen;
        const fixed = g.city.collide(nx, nz, 0.6);
        cop.x = fixed.x;
        cop.z = fixed.z;
      }
      cop.group.position.set(cop.x, 0, cop.z);
      cop.group.rotation.y = cop.angle;
      if (d < 2 && pSpeed < 4) {
        cop.arrestT += dt;
        if (cop.arrestT >= 1.0) {
          cop.arrestT = 0;
          g.arrested();
          return;
        }
      } else {
        cop.arrestT = 0;
      }
    }

    for (const car of this.cars) {
      const dx = g.player.x - car.x;
      const dz = g.player.z - car.z;
      const d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      car.angle = turnToward(car.angle, want, 1.9 * dt);
      car.speed = Math.min(20, car.speed + 14 * dt);
      const nx = car.x + Math.sin(car.angle) * car.speed * dt;
      const nz = car.z + Math.cos(car.angle) * car.speed * dt;
      const fixed = g.city.collide(nx, nz, 1.7);
      car.x = clamp(fixed.x, -210, 210);
      car.z = clamp(fixed.z, -210, 210);
      car.sync();
      // A ram hurts: Milo on foot, or his car.
      if (d < 3.2) {
        if (g.inCar && g.playerCar) {
          g.playerCar.health = Math.max(0, g.playerCar.health - 6);
          if (g.playerCar.health <= 0) g.playerCar.wrecked = true;
          g.playerCar.x += (dx / (d || 1)) * 1.5;
          g.playerCar.z += (dz / (d || 1)) * 1.5;
        } else {
          g.player.hurt(12, g);
        }
        car.speed *= 0.4;
      }
    }

    if (this.heli) {
      const h = this.heli;
      h.rotor.rotation.y += dt * 22;
      // Hover above and slightly ahead of Milo, capped at 18 units/s —
      // a Comet GT at full tilt can outrun it.
      const lead = 6;
      const tx = g.player.x + Math.sin(g.playerCar ? g.playerCar.angle : g.player.angle) * lead;
      const tz = g.player.z + Math.cos(g.playerCar ? g.playerCar.angle : g.player.angle) * lead;
      const dx = tx - h.x;
      const dz = tz - h.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.5) {
        const stepLen = Math.min(d, 18 * dt);
        h.x += (dx / d) * stepLen;
        h.z += (dz / d) * stepLen;
      }
      h.y = 18;
      h.angle = Math.atan2(g.player.x - h.x, g.player.z - h.z);
      h.group.position.set(h.x, h.y, h.z);
      h.group.rotation.y = h.angle;
      this.spotTarget.position.set(g.player.x, 0, g.player.z);
    }
  }
}
