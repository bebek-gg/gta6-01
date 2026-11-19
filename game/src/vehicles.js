// vehicles.js — the eight cars of SOLMAR, the arcade driving model and the
// traffic system that keeps the grid alive.

import * as THREE from 'three';
import { clamp, dist2, pick, rand, randi, wrapAngle } from './utils.js';
import { BOUND, ROADS } from './city.js';

/** The eight models: top speed (units/s), acceleration, grip, size, paint. */
export const MODELS = {
  comet: { name: 'Comet GT', top: 38, accel: 26, grip: 1.0, len: 4.6, wid: 2.0, color: 0xffd23a, price: 2500 },
  sunrunner: { name: 'Sunrunner', top: 26, accel: 18, grip: 0.9, len: 4.2, wid: 1.9, color: 0x3ab8ff, price: 900 },
  hauler: { name: 'Hauler Van', top: 22, accel: 13, grip: 0.7, len: 5.4, wid: 2.2, color: 0xe8e4da, price: 1200 },
  cab: { name: 'Solmar Cab', top: 25, accel: 17, grip: 0.85, len: 4.3, wid: 1.9, color: 0xffc21a, price: 800 },
  muscle: { name: 'Muscle V8', top: 32, accel: 22, grip: 0.8, len: 4.8, wid: 2.0, color: 0xd8382a, price: 1800 },
  coupe: { name: 'Coastal Coupe', top: 30, accel: 20, grip: 0.95, len: 4.4, wid: 1.9, color: 0x7ae0c8, price: 1500 },
  pickup: { name: 'Dune Pickup', top: 27, accel: 18, grip: 0.75, len: 4.9, wid: 2.0, color: 0xc88a4a, price: 1300 },
  cruiser: { name: 'PD Cruiser', top: 30, accel: 21, grip: 0.9, len: 4.6, wid: 2.0, color: 0xf2f2f2, price: 0 },
};

function buildMesh(def, key) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: def.color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1d22 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(def.wid, 0.75, def.len), paint);
  body.position.y = 0.62;
  body.castShadow = true;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(def.wid * 0.92, 0.5, def.len * 0.22), paint);
  nose.position.set(0, 0.5, def.len * 0.42);
  g.add(nose);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(def.wid * 0.82, 0.62, def.len * 0.42), dark);
  cabin.position.set(0, 1.28, -def.len * 0.05);
  cabin.castShadow = true;
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  for (const [wx, wz] of [
    [-def.wid / 2, def.len * 0.32], [def.wid / 2, def.len * 0.32],
    [-def.wid / 2, -def.len * 0.32], [def.wid / 2, -def.len * 0.32],
  ]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    g.add(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const lx of [-def.wid * 0.32, def.wid * 0.32]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.08), lightMat);
    lamp.position.set(lx, 0.62, def.len / 2 + 0.01);
    g.add(lamp);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const lx of [-def.wid * 0.32, def.wid * 0.32]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.08), tailMat);
    tail.position.set(lx, 0.66, -def.len / 2 - 0.01);
    g.add(tail);
  }
  if (key === 'cruiser') {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.22, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }),
    );
    bar.position.set(0, 1.68, -def.len * 0.05);
    g.add(bar);
    const bar2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.22, 0.42),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    bar2.position.set(0.55, 1.68, -def.len * 0.05);
    g.add(bar2);
  }
  if (key === 'cab') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.25, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
    );
    sign.position.set(0, 1.7, -def.len * 0.05);
    g.add(sign);
  }
  return g;
}

/** One car on the street. Forward is (sin angle, cos angle) in (x, z). */
export class Vehicle {
  constructor(key, scene) {
    this.key = key;
    this.def = MODELS[key];
    this.name = this.def.name;
    this.top = this.def.top;
    this.accel = this.def.accel;
    this.grip = this.def.grip;
    this.group = buildMesh(this.def, key);
    scene.add(this.group);
    this.x = 0;
    this.z = 0;
    this.angle = 0;
    this.speed = 0;
    this.health = 100;
    this.wrecked = false;
    this.axis = null;
    this.line = 0;
    this.pos = 0;
    this.dir = 1;
    this.cruise = rand(7, 12);
  }

  sync() {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.angle;
  }
}

/**
 * Arcade driving: throttle, brake/reverse, steering that bites harder at
 * low speed, and a handbrake that trades grip for slide. Turning left
 * increases the angle; turning right decreases it.
 */
export function driveVehicle(v, input, dt, city) {
  if (v.wrecked) {
    v.speed *= Math.max(0, 1 - 3 * dt);
    v.sync();
    return;
  }
  const forward = input.forward ? 1 : 0;
  const back = input.back ? 1 : 0;
  if (forward) {
    v.speed = Math.min(v.top, v.speed + v.accel * dt);
  } else if (back) {
    if (v.speed > 0.5) v.speed = Math.max(0, v.speed - 34 * dt);
    else v.speed = Math.max(-v.top * 0.42, v.speed - v.accel * 0.7 * dt);
  } else {
    const drag = 9 * dt;
    v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), drag);
  }
  if (input.handbrake) {
    v.speed *= Math.max(0, 1 - 2.1 * dt);
  }
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const speedFrac = clamp(Math.abs(v.speed) / 9, 0, 1);
  const turnRate = 2.1 * v.grip * (input.handbrake ? 1.7 : 1);
  v.angle += steer * turnRate * speedFrac * dt * (v.speed >= 0 ? 1 : -1);
  v.angle = wrapAngle(v.angle);

  const nx = v.x + Math.sin(v.angle) * v.speed * dt;
  const nz = v.z + Math.cos(v.angle) * v.speed * dt;
  const fixed = city.collide(nx, nz, 1.7);
  v.x = clamp(fixed.x, -BOUND, BOUND);
  // Cars may drive onto the sand as far as the waterline, so the docks
  // (z 222) are reachable by car; the ocean itself stays off-limits.
  v.z = clamp(fixed.z, -BOUND, 245);
  const hitWall = Math.abs(fixed.x - nx) > 0.01 || Math.abs(fixed.z - nz) > 0.01;
  const hitBound = v.x !== fixed.x || v.z !== fixed.z;
  if (hitWall && Math.abs(v.speed) > 9) {
    v.health = Math.max(0, v.health - Math.round((Math.abs(v.speed) - 9) * 1.2));
    v.speed *= 0.35;
  } else if (hitWall || hitBound) {
    v.speed *= 0.55;
  }
  if (v.health <= 0) {
    v.wrecked = true;
    v.speed = 0;
  }
  v.sync();
}

/** The traffic system: 24 cars driving the grid and 10 parked cars. */
export class Traffic {
  constructor(city, scene) {
    this.city = city;
    this.scene = scene;
    this.cars = [];
    this.parked = [];
    this.keys = Object.keys(MODELS).filter((k) => k !== 'cruiser');
  }

  spawn() {
    for (let i = 0; i < 24; i++) {
      const car = new Vehicle(pick(this.keys), this.scene);
      this.placeOnRoad(car);
      this.cars.push(car);
      car.sync();
    }
    for (let i = 0; i < 10; i++) {
      const car = new Vehicle(pick(this.keys), this.scene);
      const p = this.city.sidewalkPoint();
      car.x = p.x;
      car.z = p.z;
      car.angle = pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      car.speed = 0;
      this.parked.push(car);
      car.sync();
    }
  }

  placeOnRoad(car) {
    const vertical = Math.random() < 0.5;
    car.axis = vertical ? 'z' : 'x';
    car.line = pick(ROADS);
    car.pos = rand(-195, 195);
    car.dir = Math.random() < 0.5 ? -1 : 1;
    car.speed = car.cruise;
    this.applyRoadPose(car);
  }

  applyRoadPose(car) {
    if (car.axis === 'x') {
      car.x = car.pos;
      car.z = car.line;
      car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.x = car.line;
      car.z = car.pos;
      car.angle = car.dir > 0 ? 0 : Math.PI;
    }
  }

  step(dt, hero) {
    for (const car of this.cars) {
      // Ease toward cruise speed, unless something is in the way.
      let target = car.cruise;
      if (hero) {
        const dHero = dist2(car.x, car.z, hero.x, hero.z);
        if (dHero < 7) target = 0;
      }
      for (const other of this.cars) {
        if (other === car || other.axis !== car.axis || other.line !== car.line) continue;
        const ahead = (other.pos - car.pos) * car.dir;
        if (ahead > 0 && ahead < 9) {
          target = Math.min(target, Math.max(0, other.speed));
        }
      }
      car.speed += clamp(target - car.speed, -26 * dt, 12 * dt);
      const lastPos = car.pos;
      car.pos += car.dir * car.speed * dt;
      if (car.pos > 205 || car.pos < -205) {
        car.dir *= -1;
        car.pos = clamp(car.pos, -205, 205);
      } else {
        // Crossed a road line: sometimes turn onto it.
        for (const r of ROADS) {
          if ((lastPos - r) * (car.pos - r) < 0 && Math.random() < 0.14) {
            const oldLine = car.line;
            car.axis = car.axis === 'x' ? 'z' : 'x';
            car.line = r;
            car.pos = oldLine;
            car.dir = Math.random() < 0.5 ? -1 : 1;
            break;
          }
        }
      }
      this.applyRoadPose(car);
      car.sync();
    }
  }

  closestParked(x, z, maxD) {
    let best = null;
    let bestD = maxD;
    for (const car of this.parked) {
      const d = dist2(x, z, car.x, car.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  closestMoving(x, z, maxD) {
    let best = null;
    let bestD = maxD;
    for (const car of this.cars) {
      const d = dist2(x, z, car.x, car.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  /** A moving car becomes a parked one (used when Milo buys the Comet). */
  park(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    if (!this.parked.includes(car)) this.parked.push(car);
    car.speed = 0;
  }

  /** A parked car joins the traffic flow. */
  unpark(car) {
    const i = this.parked.indexOf(car);
    if (i >= 0) this.parked.splice(i, 1);
    if (!this.cars.includes(car)) this.cars.push(car);
    // Snap onto the nearest road so it drives cleanly from here.
    let bestLine = ROADS[0];
    let bestD = Infinity;
    for (const r of ROADS) {
      const d = Math.min(Math.abs(car.x - r), Math.abs(car.z - r));
      if (d < bestD) {
        bestD = d;
        bestLine = r;
      }
    }
    if (Math.abs(car.x - bestLine) <= Math.abs(car.z - bestLine)) {
      car.axis = 'z';
      car.line = bestLine;
      car.pos = car.z;
    } else {
      car.axis = 'x';
      car.line = bestLine;
      car.pos = car.x;
    }
    car.dir = Math.random() < 0.5 ? -1 : 1;
    car.speed = car.cruise;
    this.applyRoadPose(car);
  }

  /** Take a car out of both lists, leaving its mesh on the street. */
  detach(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    const j = this.parked.indexOf(car);
    if (j >= 0) this.parked.splice(j, 1);
  }

  /** Remove a car from the street entirely. */
  drop(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    const j = this.parked.indexOf(car);
    if (j >= 0) this.parked.splice(j, 1);
    this.scene.remove(car.group);
  }
}
