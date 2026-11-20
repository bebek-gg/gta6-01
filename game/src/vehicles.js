// vehicles.js — the eight car models, the traffic that fills the roads, the
// parked cars Milo can steal, and the driving physics for the player's car.
import * as THREE from 'three';
import { clamp, rand, randInt, pick, dist2, angleLerp } from './utils.js';

export const MODELS = [
  { key: 'comet', name: 'Comet GT', color: 0xd83030, top: 42, accel: 24 },
  { key: 'sentinel', name: 'Sentinel', color: 0xc0c8d0, top: 32, accel: 16 },
  { key: 'taxi', name: 'Taxi', color: 0xf0c020, top: 30, accel: 15 },
  { key: 'van', name: 'Burrito Van', color: 0xe8e8e8, top: 26, accel: 12 },
  { key: 'pickup', name: 'Pickup', color: 0x3a7a3a, top: 30, accel: 15 },
  { key: 'coupe', name: 'Coupe', color: 0x2a5aa0, top: 36, accel: 19 },
  { key: 'hatch', name: 'Hatch', color: 0xe08020, top: 30, accel: 16 },
  { key: 'limo', name: 'Limo', color: 0x1c1c22, top: 30, accel: 13 },
];

export function modelByKey(key) {
  return MODELS.find((m) => m.key === key) || MODELS[0];
}

const bodyGeo = new THREE.BoxGeometry(2.1, 0.9, 4.4);
const cabinGeo = new THREE.BoxGeometry(1.8, 0.75, 2.2);
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
const wheelGeo = new THREE.BoxGeometry(0.5, 0.5, 0.9);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });

// A car: a THREE group (body, cabin, wheels) plus the numbers the game
// drives it by. `sync` pushes x/z/angle into the mesh after a teleport.
export function createCar(scene, key, x, z, angle) {
  const model = modelByKey(key);
  const group = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: model.color }));
  body.position.y = 0.65;
  group.add(body);
  const cabin = new THREE.Mesh(cabinGeo, glassMat);
  cabin.position.set(0, 1.35, -0.3);
  group.add(cabin);
  const wheels = [];
  for (const [wx, wz] of [[-1.0, 1.4], [1.0, 1.4], [-1.0, -1.4], [1.0, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, 0.35, wz);
    group.add(w);
    wheels.push(w);
  }
  group.position.set(x, 0, z);
  group.rotation.y = angle;
  scene.add(group);
  const car = {
    key: model.key,
    name: model.name,
    color: model.color,
    top: model.top,
    accel: model.accel,
    x, z, angle,
    speed: 0,
    group,
    health: 100,
    sync() {
      group.position.set(this.x, 0, this.z);
      group.rotation.y = this.angle;
    },
    dispose() {
      scene.remove(group);
    },
  };
  return car;
}

// Player driving: WASD over a car. W accelerates, S brakes or reverses,
// A/D steer (stronger at low speed, weaker at full speed). Returns speed.
export function drivePlayerCar(car, input, dt, city) {
  const fwd = input.forward ? 1 : 0;
  const back = input.back ? 1 : 0;
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  if (fwd) car.speed += car.accel * dt;
  else if (back) car.speed -= car.accel * 0.7 * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 14 * dt);
  car.speed = clamp(car.speed, -12, car.top);
  const spd = Math.abs(car.speed);
  if (spd > 0.1) {
    car.angle += steer * (1.9 - Math.min(1.1, spd / 45)) * dt * Math.sign(car.speed);
  }
  car.x += Math.sin(car.angle) * car.speed * dt;
  car.z += Math.cos(car.angle) * car.speed * dt;
  const c = city.clampToMap(car.x, car.z);
  car.x = c.x;
  car.z = c.z;
  const p = { x: car.x, z: car.z };
  city.resolveCollision(p, 2.2);
  car.x = p.x;
  car.z = p.z;
  car.sync();
  return car.speed;
}


// Traffic: 24 cars cruising the road grid plus the parked cars Milo can steal.
// A driving car always heads for an adjacent intersection, so it never cuts
// across a block. Parked cars sit at the road edge, clear of the POIs.
export function createTraffic(scene, city) {
  const cars = [];
  const parked = [];
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

  function spawnDriver() {
    const p = city.randomRoadPoint();
    const car = createCar(scene, pick(MODELS).key, p.x, p.z, rand(0, Math.PI * 2));
    const t = pickTarget(p.x, p.z);
    car.tx = t.x;
    car.tz = t.z;
    car.cruise = rand(9, 15);
    car.speed = car.cruise;
    cars.push(car);
    return car;
  }

  function spawnParked() {
    for (let tries = 0; tries < 20; tries++) {
      const along = pick(ROAD);
      const cross = rand(-230, 230);
      const side = Math.random() < 0.5 ? 8.5 : -8.5;
      let x;
      let z;
      let angle;
      if (Math.random() < 0.5) {
        x = along + side;
        z = snapRoad(cross);
        angle = Math.random() < 0.5 ? 0 : Math.PI;
      } else {
        x = snapRoad(cross);
        z = along + side;
        angle = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      }
      if (x > 200) continue;
      let clear = true;
      for (const k of Object.keys(city.points)) {
        const q = city.points[k];
        if (dist2(x, z, q.x, q.z) < 16) { clear = false; break; }
      }
      if (!clear) continue;
      const car = createCar(scene, pick(MODELS).key, x, z, angle);
      parked.push(car);
      return car;
    }
    return null;
  }

  for (let i = 0; i < 24; i++) spawnDriver();
  for (let i = 0; i < 10; i++) spawnParked();

  return {
    cars,
    parked,
    update(dt) {
      for (const car of cars) {
        const d = dist2(car.x, car.z, car.tx, car.tz);
        if (d < 6) {
          const t = pickTarget(car.tx, car.tz);
          car.tx = t.x;
          car.tz = t.z;
        }
        const want = Math.atan2(car.tx - car.x, car.tz - car.z);
        car.angle = angleLerp(car.angle, want, Math.min(1, dt * 2.2));
        // Ease off when another car is right ahead, so they do not pile up.
        let slow = 1;
        for (const o of cars) {
          if (o === car) continue;
          const dd = dist2(car.x, car.z, o.x, o.z);
          if (dd < 9) {
            const fx = Math.sin(car.angle);
            const fz = Math.cos(car.angle);
            const dot = ((o.x - car.x) * fx + (o.z - car.z) * fz) / Math.max(0.01, dd);
            if (dot > 0.6) { slow = 0.45; break; }
          }
        }
        car.speed += (car.cruise * slow - car.speed) * Math.min(1, dt * 1.5);
        car.x += Math.sin(car.angle) * car.speed * dt;
        car.z += Math.cos(car.angle) * car.speed * dt;
        const c = city.clampToMap(car.x, car.z);
        car.x = c.x;
        car.z = c.z;
        car.sync();
      }
      // Keep the streets full: replace any driving car the player stole.
      if (cars.length < 24) spawnDriver();
    },
    // The Comet GT a player buys at Marina Mart: a fresh red Comet parked
    // outside the mart, ready to be driven away.
    spawnOwnedComet() {
      const p = city.points.mart;
      const car = createCar('comet', p.x - 6, p.z + 6, Math.PI / 2);
      parked.push(car);
      return car;
    },
    nearestParked(x, z, r) {
      let best = null;
      let bd = r;
      for (const car of parked) {
        const d = dist2(x, z, car.x, car.z);
        if (d < bd) { bd = d; best = car; }
      }
      return best;
    },
    removeParked(car) {
      const i = parked.indexOf(car);
      if (i >= 0) parked.splice(i, 1);
      // Keep the street stocked: a fresh parked car appears shortly after.
      setTimeout(() => {
        if (parked.length < 10) spawnParked();
      }, 8000);
    },
    addParkedCar(car) {
      parked.push(car);
    },
  };
}
