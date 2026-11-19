// vehicles.js — the cars of Solmar: eight models with their own speed and
// handling, arcade driving physics, and the traffic that fills the roads.

import * as THREE from 'three';
import { clamp, pick, rand, randi } from './utils.js';
import { ROADS } from './city.js';

/** The eight models. top is units/second, turn is radians/second. */
export const MODELS = {
  comet: {
    name: 'Comet GT', top: 38, accel: 27, turn: 2.7,
    len: 4.4, wid: 1.95, body: 0xffd23a, trim: 0x191919, cabin: 0x18222e,
  },
  muscle: {
    name: 'Muscle V8', top: 34, accel: 25, turn: 2.2,
    len: 4.7, wid: 2.05, body: 0xd8382a, trim: 0x141414, cabin: 0x1c2430,
  },
  coupe: {
    name: 'Coastal Coupe', top: 32, accel: 22, turn: 2.5,
    len: 4.3, wid: 1.9, body: 0x3ab8ff, trim: 0xf2f2f2, cabin: 0x18222e,
  },
  sunrunner: {
    name: 'Sunrunner', top: 30, accel: 20, turn: 2.4,
    len: 4.2, wid: 1.9, body: 0x7ae0c8, trim: 0xffffff, cabin: 0x1c2430,
  },
  cab: {
    name: 'Solmar Cab', top: 28, accel: 19, turn: 2.5,
    len: 4.3, wid: 2.0, body: 0xffc93a, trim: 0x202020, cabin: 0x18222e,
  },
  pickup: {
    name: 'Dune Pickup', top: 27, accel: 18, turn: 2.2,
    len: 4.8, wid: 2.1, body: 0x8a6a3a, trim: 0x2a2a2a, cabin: 0x1c2430,
  },
  hauler: {
    name: 'Hauler Van', top: 24, accel: 15, turn: 1.9,
    len: 5.3, wid: 2.2, body: 0xe8e4da, trim: 0x5a6a7a, cabin: 0x24303e,
  },
  cruiser: {
    name: 'PD Cruiser', top: 30, accel: 22, turn: 2.4,
    len: 4.5, wid: 2.0, body: 0xf2f2f2, trim: 0x2244aa, cabin: 0x18222e,
  },
};

/** The models a civilian can drive — everything but the PD cruiser. */
export const CIVILIAN_KEYS = ['comet', 'muscle', 'coupe', 'sunrunner', 'cab', 'pickup', 'hauler'];

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/**
 * Build one car out of boxes: a low body, a cabin, four wheels, lights.
 * Vans get a tall box body, cabs a roof sign, cruisers a light bar.
 */
function buildCarMesh(def, key) {
  const g = new THREE.Group();
  const bodyMat = lambert(def.body);
  const trimMat = lambert(def.trim);
  const glassMat = lambert(def.cabin);
  const tyreMat = lambert(0x141414);
  const tall = key === 'hauler';
  const bodyH = tall ? 1.5 : 0.62;
  const bodyY = tall ? 1.05 : 0.55;
  g.add(box(def.wid, bodyH, def.len, bodyMat, 0, bodyY, 0));
  if (tall) {
    g.add(box(def.wid * 0.96, 0.9, def.len * 0.42, glassMat, 0, 1.95, def.len * 0.26));
  } else {
    g.add(box(def.wid * 0.82, 0.55, def.len * 0.44, glassMat, 0, 1.12, -def.len * 0.06));
  }
  // A dark skirt along the bottom edge, and a contrasting stripe.
  g.add(box(def.wid * 1.01, 0.16, def.len * 0.98, trimMat, 0, 0.32, 0));
  // Headlights and taillights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const sx of [-1, 1]) {
    g.add(box(0.34, 0.14, 0.06, headMat, sx * def.wid * 0.32, 0.62, def.len / 2));
    g.add(box(0.34, 0.14, 0.06, tailMat, sx * def.wid * 0.32, 0.62, -def.len / 2));
  }
  // Wheels: short cylinders turned on their sides.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeo, tyreMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * (def.wid / 2 - 0.08), 0.36, sz * (def.len / 2 - 0.85));
      wheel.castShadow = true;
      g.add(wheel);
    }
  }
  if (key === 'cruiser') {
    const bar = box(1.5, 0.16, 0.5, new THREE.MeshBasicMaterial({ color: 0x2244aa }), 0, 1.5, -0.2);
    g.add(bar);
    g.add(box(0.7, 0.18, 0.52, new THREE.MeshBasicMaterial({ color: 0xff2a2a }), -0.4, 1.5, -0.2));
    g.add(box(0.7, 0.18, 0.52, new THREE.MeshBasicMaterial({ color: 0x3a6aff }), 0.4, 1.5, -0.2));
  }
  if (key === 'cab') {
    g.add(box(0.9, 0.22, 0.4, new THREE.MeshBasicMaterial({ color: 0xffd23a }), 0, 1.5, -0.2));
  }
  if (key === 'pickup') {
    // An open bed: low walls at the back instead of a cabin roof.
    g.add(box(def.wid * 0.9, 0.5, 0.06, trimMat, 0, 1.0, -def.len / 2 + 0.1));
    g.add(box(0.06, 0.5, def.len * 0.3, trimMat, -def.wid / 2 + 0.05, 1.0, -def.len * 0.3));
    g.add(box(0.06, 0.5, def.len * 0.3, trimMat, def.wid / 2 - 0.05, 1.0, -def.len * 0.3));
  }
  return g;
}

/** One car in the world: a model, a position, a speed, a health bar. */
export class Vehicle {
  constructor(key, scene) {
    const def = MODELS[key] || MODELS.sunrunner;
    this.key = key;
    this.name = def.name;
    this.def = def;
    this.topSpeed = def.top;
    this.accel = def.accel;
    this.turnRate = def.turn;
    this.len = def.len;
    this.wid = def.wid;
    this.x = 0;
    this.z = 0;
    this.angle = 0;
    this.speed = 0;
    this.health = 100;
    this.wrecked = false;
    this.group = buildCarMesh(def, key);
    scene.add(this.group);
    this.sync();
  }

  sync() {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.angle;
  }

  /** Lose health; at zero the car is a wreck and will not move. */
  damage(n) {
    if (this.wrecked) return;
    this.health -= n;
    if (this.health <= 0) {
      this.health = 0;
      this.wrecked = true;
      this.speed = 0;
    }
  }

  /**
   * Arcade driving. input is {forward, back, left, right, handbrake}.
   * Steering bites harder the faster the car goes, and flips in reverse.
   * A handbrake turn scrubs speed and swings the tail out.
   */
  drive(dt, input, city) {
    if (this.wrecked) {
      this.speed *= Math.max(0, 1 - 4 * dt);
      if (Math.abs(this.speed) < 0.05) this.speed = 0;
      this.sync();
      return;
    }
    const grip = clamp(Math.abs(this.speed) / 9, 0, 1);
    const dir = this.speed >= 0 ? 1 : -1;
    let steer = 0;
    if (input.left) steer += 1;
    if (input.right) steer -= 1;
    if (steer !== 0 && Math.abs(this.speed) > 0.4) {
      let rate = this.turnRate * grip * dir;
      if (input.handbrake && Math.abs(this.speed) > 6) rate *= 1.9;
      this.angle += steer * rate * dt;
    }
    if (input.forward) {
      this.speed = Math.min(this.topSpeed, this.speed + this.accel * dt);
    } else if (input.back) {
      this.speed = Math.max(-12, this.speed - this.accel * 0.65 * dt);
    } else {
      // Rolling drag, and a hard stop on the handbrake.
      const drag = input.handbrake ? 30 : 9;
      const s = Math.sign(this.speed);
      this.speed -= s * Math.min(Math.abs(this.speed), drag * dt);
    }
    const nx = this.x + Math.sin(this.angle) * this.speed * dt;
    const nz = this.z + Math.cos(this.angle) * this.speed * dt;
    const fixed = city.collide(nx, nz, 1.7);
    const hit = Math.hypot(fixed.x - nx, fixed.z - nz);
    if (hit > 0.4 && Math.abs(this.speed) > 12) {
      this.damage(4);
      this.speed *= 0.45;
    } else if (hit > 0.05) {
      this.speed *= 0.6;
    }
    this.x = fixed.x;
    this.z = fixed.z;
    this.sync();
  }
}

/** Where the parked cars sit: [axis, lane, along]. Kept clear of every doorstep. */
const PARKED_SPOTS = [
  ['z', -180, -150], ['z', -120, 30], ['z', -60, -90], ['z', 0, 150],
  ['z', 60, -150], ['z', 120, -30], ['z', 180, 90],
  ['x', -120, -150], ['x', 0, 90], ['x', 120, -60],
];

function headingFor(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

/** The traffic of Solmar: 24 cars driving the road grid, 10 parked. */
export class Traffic {
  constructor(city, scene) {
    this.city = city;
    this.scene = scene;
    this.cars = [];
    this.parked = [];
    for (let i = 0; i < 24; i++) this.spawnDriver();
    for (const [axis, lane, along] of PARKED_SPOTS) {
      const car = new Vehicle(pick(CIVILIAN_KEYS), scene);
      car.axis = axis;
      car.parked = true;
      if (axis === 'z') {
        car.x = lane + 5.5;
        car.z = along;
        car.angle = pick([0, Math.PI]);
      } else {
        car.x = along;
        car.z = lane + 5.5;
        car.angle = pick([Math.PI / 2, -Math.PI / 2]);
      }
      car.sync();
      this.parked.push(car);
    }
  }

  /** One more car joins the flow, on a random road far from the player. */
  spawnDriver() {
    const car = new Vehicle(pick(CIVILIAN_KEYS), this.scene);
    car.axis = pick(['x', 'z']);
    car.lane = pick(ROADS);
    car.dir = pick([-1, 1]);
    car.side = car.dir > 0 ? 2.6 : -2.6;
    car.along = rand(-190, 190);
    car.cruise = rand(8, 13);
    car.turnIn = rand(2, 8);
    car.parked = false;
    this.placeDriver(car);
    this.cars.push(car);
    return car;
  }

  /** Put a driver's mesh where its route says it should be. */
  placeDriver(car) {
    if (car.axis === 'x') {
      car.x = car.along;
      car.z = car.lane + car.side;
    } else {
      car.x = car.lane + car.side;
      car.z = car.along;
    }
    car.angle = headingFor(car.axis, car.dir);
    car.sync();
  }

  /** Park a car for good (the Comet GT bought at the mart). */
  park(car) {
    car.parked = true;
    this.parked.push(car);
  }

  /** Take a car out of the flow — stolen, sold, or written off. */
  remove(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    const j = this.parked.indexOf(car);
    if (j >= 0) this.parked.splice(j, 1);
  }

  /** The nearest car (driving or parked) within maxD of a point. */
  nearest(x, z, maxD) {
    let best = null;
    let bestD = maxD;
    for (const car of [...this.cars, ...this.parked]) {
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  /** Drive the flow: along the grid, turning at intersections, never leaving the roads. */
  step(dt) {
    for (const car of this.cars) {
      if (car.wrecked) {
        car.speed = Math.max(0, car.speed - 20 * dt);
        car.sync();
        continue;
      }
      car.turnIn -= dt;
      car.along += car.dir * car.cruise * dt;
      // Turn at an intersection: the nearest crossing, snapped to the grid.
      const cross = Math.round(car.along / 60) * 60;
      if (Math.abs(car.along - cross) < 2.5 && car.turnIn <= 0 && Math.random() < 0.35) {
        const wasX = car.axis === 'x';
        const here = wasX ? car.z : car.x;
        car.axis = wasX ? 'z' : 'x';
        car.lane = cross;
        car.along = here;
        car.dir = pick([-1, 1]);
        car.side = car.dir > 0 ? 2.6 : -2.6;
        car.turnIn = rand(6, 12);
      }
      // At the edge of town, turn around instead of driving into the sea.
      if (Math.abs(car.along) > 198) {
        car.along = Math.max(-198, Math.min(198, car.along));
        car.dir *= -1;
        car.side = car.dir > 0 ? 2.6 : -2.6;
      }
      car.speed = car.cruise;
      this.placeDriver(car);
    }
  }
}
