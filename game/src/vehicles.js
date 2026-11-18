// vehicles.js — car models, traffic AI on the road graph, parked cars,
// and the player's arcade driving physics.
import * as THREE from 'three';
import { mulberry32, pick, clamp, damp, angDiff, dist2 } from './utils.js';
import { collideCircle } from './city.js';

export const MODELS = {
  comet: { name: 'Comet GT', maxSpeed: 46, accel: 26, colors: [0xd21f2b, 0x1f6fd2, 0xe8e8e8, 0xffa41f] },
  sunrunner: { name: 'Sunrunner', maxSpeed: 34, accel: 18, colors: [0x3a6fd2, 0xd2a13a, 0x7a8a9a, 0x5a3a6a, 0xc0c8d0] },
  hauler: { name: 'Hauler Van', maxSpeed: 28, accel: 14, colors: [0xe8e8e8, 0x4a6a8a, 0x8a4a3a] },
  taxi: { name: 'Solmar Cab', maxSpeed: 34, accel: 18, colors: [0xffc41f] },
  cruiser: { name: 'PD Cruiser', maxSpeed: 42, accel: 24, colors: [0x14181f] },
  muscle: { name: 'Muscle V8', maxSpeed: 40, accel: 22, colors: [0x8a2a2a, 0x2a4a8a, 0xe8e8e8] },
  coupe: { name: 'Coastal Coupe', maxSpeed: 38, accel: 20, colors: [0xd2a13a, 0x3a6fd2, 0x5a3a6a] },
  pickup: { name: 'Dune Pickup', maxSpeed: 32, accel: 16, colors: [0x7a8a5a, 0xc0c8d0, 0x8a4a3a] },
};

const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);

export function makeCar(modelKey, color) {
  const m = MODELS[modelKey];
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.6 });
  // sunlit glass: pale blue, highly reflective, so the cabin reads as windows
  const glass = new THREE.MeshStandardMaterial({ color: 0x8fc4dd, roughness: 0.08, metalness: 0.9 });
  const body = new THREE.Mesh(bodyGeo, paint);
  const long = modelKey === 'hauler' ? 4.6 : 4.0;
  body.scale.set(1.9, 0.62, long);
  body.position.y = 0.62; body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(bodyGeo, glass);
  cabin.scale.set(1.7, 0.55, (modelKey === 'hauler' || modelKey === 'pickup') ? 1.2 : 2.0);
  cabin.position.set(0, 1.18, (modelKey === 'hauler' || modelKey === 'pickup') ? 0.9 : -0.15);
  cabin.castShadow = true;
  g.add(cabin);
  if (modelKey === 'cruiser') {
    const stripe = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }));
    stripe.scale.set(1.92, 0.2, 3.2); stripe.position.y = 0.72; g.add(stripe);
    const bar = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 1.4 }));
    bar.scale.set(1.1, 0.18, 0.5); bar.position.set(0, 1.55, -0.15); g.add(bar);
    g.userData.lightBar = bar;
  }
  if (modelKey === 'comet') {
    // rear spoiler on the sports car
    const spoiler = new THREE.Mesh(bodyGeo, paint);
    spoiler.scale.set(1.7, 0.08, 0.5);
    spoiler.position.set(0, 1.18, -long / 2 + 0.25);
    g.add(spoiler);
  }
  if (modelKey === 'muscle') {
    // hood scoop on the V8, and a spoiler like the Comet
    const scoop = new THREE.Mesh(bodyGeo, paint);
    scoop.scale.set(0.9, 0.22, 1.1);
    scoop.position.set(0, 1.0, 1.1);
    g.add(scoop);
    const spoiler = new THREE.Mesh(bodyGeo, paint);
    spoiler.scale.set(1.7, 0.08, 0.5);
    spoiler.position.set(0, 1.18, -long / 2 + 0.25);
    g.add(spoiler);
  }
  if (modelKey === 'pickup') {
    // open bed: low walls behind a short cabin
    const bed = new THREE.Mesh(bodyGeo, paint);
    bed.scale.set(1.7, 0.5, 1.6);
    bed.position.set(0, 0.85, -1.1);
    g.add(bed);
  }
  if (modelKey === 'taxi') {
    const sign = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd23e, emissiveIntensity: 0.8 }));
    sign.scale.set(0.7, 0.28, 0.45); sign.position.set(0, 1.6, -0.15); g.add(sign);
  }
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xb8bec8, roughness: 0.3, metalness: 0.8 });
  const hubGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.4, 10);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    w.add(new THREE.Mesh(hubGeo, hubMat)); // hub cap, spins with the wheel
    g.add(w); wheels.push(w);
  }
  const hl = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffedb0, emissiveIntensity: 1.2 });
  for (const wx of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), hl);
    lamp.position.set(wx, 0.66, long / 2 + 0.01); g.add(lamp);
  }
  const tl = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xd21f2b, emissiveIntensity: 1.4 });
  for (const wx of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tl);
    lamp.position.set(wx, 0.66, -long / 2 - 0.01); g.add(lamp);
  }
  const car = {
    group: g, model: modelKey, name: m.name, maxSpeed: m.maxSpeed, accel: m.accel,
    x: 0, z: 0, heading: 0, speed: 0, steer: 0, health: 100,
    isPolice: modelKey === 'cruiser', isPlayer: false, driver: null, wheels,
    length: long,
  };
  g.userData.car = car;
  return car;
}

export function placeCar(car, x, z, heading) {
  car.x = x; car.z = z; car.heading = heading; car.speed = 0;
  car.group.position.set(x, 0, z);
  car.group.rotation.y = heading;
}

function syncCar(car) {
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
  const spin = car.speed * 0.016 / 0.42;
  for (const w of car.wheels) w.rotation.x += spin;
  if (car.wheels[0]) car.wheels[0].rotation.y = car.steer * 0.4;
  if (car.wheels[1]) car.wheels[1].rotation.y = car.steer * 0.4;
}

// --- traffic ---
export class Traffic {
  constructor(scene, city) {
    this.scene = scene; this.city = city;
    this.rng = mulberry32(777);
    this.cars = [];
    this.parked = [];
  }
  spawn(count) {
    const keys = ['sunrunner', 'sunrunner', 'hauler', 'taxi', 'comet', 'muscle', 'coupe', 'pickup'];
    for (let i = 0; i < count; i++) {
      const car = makeCar(pick(this.rng, keys), 0);
      car.group.children[0].material = new THREE.MeshStandardMaterial({
        color: pick(this.rng, MODELS[car.model].colors), roughness: 0.35, metalness: 0.55,
      });
      const node = pick(this.rng, this.city.nodes);
      const next = pick(this.rng, this.city.neighbors(node));
      placeCar(car, node.x, node.z, Math.atan2(next.x - node.x, next.z - node.z));
      car.node = node; car.next = next;
      // fast models cruise faster: a Comet GT should not crawl like a Hauler
      car.cruise = (8 + this.rng() * 4) * (MODELS[car.model].maxSpeed / 34);
      this.scene.add(car.group);
      this.cars.push(car);
    }
    // parked cars along the roads: denser, so the streets read lived-in
    for (let i = 0; i < 16; i++) {
      const car = makeCar(pick(this.rng, ['sunrunner', 'comet', 'hauler', 'muscle', 'coupe', 'pickup']), 0);
      car.group.children[0].material = new THREE.MeshStandardMaterial({
        color: pick(this.rng, MODELS[car.model].colors), roughness: 0.35, metalness: 0.55,
      });
      const node = pick(this.rng, this.city.nodes);
      const horiz = this.rng() < 0.5;
      const ox = horiz ? 9 : 0, oz = horiz ? 0 : 9;
      placeCar(car, node.x + ox + (this.rng() - 0.5) * 30, node.z + oz + (this.rng() - 0.5) * 30, horiz ? Math.PI / 2 : 0);
      car.parked = true;
      this.scene.add(car.group);
      this.parked.push(car);
    }
  }
  nearestParked(x, z, maxD) {
    let best = null, bd = maxD;
    for (const c of this.parked) {
      const d = dist2(x, z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  nearestTraffic(x, z, maxD) {
    let best = null, bd = maxD;
    for (const c of this.cars) {
      const d = dist2(x, z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  update(dt, world) {
    for (const car of this.cars) {
      const dx = car.next.x - car.x, dz = car.next.z - car.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const wantHeading = Math.atan2(dx, dz);
      car.heading += clamp(angDiff(car.heading, wantHeading), -2.2 * dt, 2.2 * dt);
      // slow for the car ahead
      let target = car.cruise;
      for (const o of this.cars) {
        if (o === car) continue;
        const od = dist2(car.x, car.z, o.x, o.z);
        if (od < 9) {
          const ahead = Math.cos(angDiff(car.heading, Math.atan2(o.x - car.x, o.z - car.z)));
          if (ahead > 0.6) { target = Math.min(target, 3); break; }
        }
      }
      if (world.playerCar) {
        const pd = dist2(car.x, car.z, world.playerCar.x, world.playerCar.z);
        if (pd < 10) target = Math.min(target, 2);
      }
      car.speed += clamp(target - car.speed, -14 * dt, 8 * dt);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      if (d < 3) {
        car.node = car.next;
        const opts = this.city.neighbors(car.node).filter((n) => n !== car.prev);
        car.prev = car.node;
        car.next = opts.length ? pick(this.rng, opts) : car.node;
      }
      syncCar(car);
    }
  }
}

// --- player driving ---
export function drivePlayerCar(car, input, dt, world) {
  const fwd = input.fwd ? 1 : 0, back = input.back ? 1 : 0;
  const steerIn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const handbrake = input.jump;
  if (fwd) car.speed += car.accel * dt;
  else if (back) car.speed -= (car.speed > 0.5 ? 30 : 12) * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 10 * dt);
  if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  car.speed = clamp(car.speed, -13, car.maxSpeed);
  const spd01 = clamp(Math.abs(car.speed) / car.maxSpeed, 0, 1);
  const turnRate = (handbrake ? 2.6 : 1.7) * (1 - spd01 * 0.45);
  car.steer = damp(car.steer, steerIn, 8, dt);
  car.heading += car.steer * turnRate * Math.sign(car.speed || 1) * spd01 * dt;
  let nx = car.x + Math.sin(car.heading) * car.speed * dt;
  let nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const hit = collideCircle(world.city.colliders, nx, nz, 2.1);
  if (hit.x !== nx || hit.z !== nz) {
    car.speed *= 0.45;
    if (Math.abs(car.speed) > 12) world.onCrash && world.onCrash(Math.abs(car.speed));
    nx = hit.x; nz = hit.z;
  }
  // bump other traffic
  for (const o of world.traffic.cars) {
    const d = dist2(nx, nz, o.x, o.z);
    if (d < 3.6 && d > 0.01) {
      const push = (3.6 - d) / d;
      o.x -= (nx - o.x) * push * 0.5; o.z -= (nz - o.z) * push * 0.5;
      car.speed *= 0.7;
      if (Math.abs(car.speed) > 10) world.onCrash && world.onCrash(Math.abs(car.speed));
    }
  }
  car.x = clamp(nx, world.city.bounds.minX, world.city.bounds.maxX);
  car.z = clamp(nz, world.city.bounds.minZ, world.city.bounds.maxZ);
  syncCar(car);
  return spd01;
}
