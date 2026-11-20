// police.js — the wanted system: heat, stars, foot cops, cruisers and the
// helicopter. Heat falls fast when the PD is far away, slow when it is close.
import * as THREE from 'three';
import { clamp, rand, dist2, angleLerp } from './utils.js';
import { createCar } from './vehicles.js';

export function starsForHeat(heat) {
  if (heat < 100) return 0;
  if (heat < 250) return 1;
  if (heat < 450) return 2;
  if (heat < 650) return 3;
  if (heat < 850) return 4;
  return 5;
}

const copGeo = new THREE.CapsuleGeometry(0.5, 1.0, 4, 8);
const copMat = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
const copHeadGeo = new THREE.SphereGeometry(0.3, 8, 6);
const copHeadMat = new THREE.MeshLambertMaterial({ color: 0xd8a878 });

export function createPolice(scene, city, G) {
  const cops = [];
  const cars = [];
  let heli = null;
  let heat = 0;
  let stars = 0;
  let spawnT = 0;

  function starCap(n) {
    return [0, 2, 3, 4, 5, 6][n] || 0;
  }
  function cruiserCap(n) {
    return [0, 0, 1, 2, 3, 4][n] || 0;
  }

  function spawnCop() {
    const p = city.points.pdhq;
    const a = rand(0, Math.PI * 2);
    const x = p.x + Math.sin(a) * rand(20, 40);
    const z = p.z + Math.cos(a) * rand(20, 40);
    const group = new THREE.Group();
    const body = new THREE.Mesh(copGeo, copMat);
    body.position.y = 1.1;
    group.add(body);
    const head = new THREE.Mesh(copHeadGeo, copHeadMat);
    head.position.y = 2.1;
    group.add(head);
    group.position.set(x, 0, z);
    scene.add(group);
    const cop = {
      x, z, angle: 0, group, speed: 5.5,
      sync() {
        group.position.set(this.x, 0, this.z);
        group.rotation.y = this.angle;
      },
    };
    cop.sync();
    cops.push(cop);
    return cop;
  }

  function spawnCruiser() {
    const p = city.points.pdhq;
    const a = rand(0, Math.PI * 2);
    const car = createCar(scene, 'sentinel', p.x + Math.sin(a) * 24, p.z + Math.cos(a) * 24, a);
    // Police paint: a dark body with a white roof band is faked by a pale cabin.
    car.group.children[0].material = new THREE.MeshLambertMaterial({ color: 0x14181f });
    car.top = 36;
    car.cruise = 30;
    cars.push(car);
    return car;
  }

  function spawnHeli() {
    if (heli) return heli;
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(4.5, 1.4, 2.2),
      new THREE.MeshLambertMaterial({ color: 0x2a2a2a }),
    );
    body.position.y = 0;
    group.add(body);
    const rotor = new THREE.Mesh(
      new THREE.BoxGeometry(7, 0.15, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x888888 }),
    );
    rotor.position.y = 1.0;
    group.add(rotor);
    const light = new THREE.SpotLight(0xfff2b0, 60, 90, 0.35, 0.5);
    light.position.set(0, -1, 0);
    light.target.position.set(0, -45, 0);
    group.add(light);
    group.add(light.target);
    scene.add(group);
    heli = { x: G.world.playerX, y: 45, z: G.world.playerZ, group, rotor, light };
    return heli;
  }

  function removeHeli() {
    if (!heli) return;
    scene.remove(heli.group);
    heli = null;
  }

  function clearUnits() {
    for (const c of cops) scene.remove(c.group);
    cops.length = 0;
    for (const c of cars) c.dispose();
    cars.length = 0;
    removeHeli();
  }


  function recomputeStars() {
    const s = starsForHeat(heat);
    if (s !== stars) {
      stars = s;
      if (stars < 4) removeHeli();
    }
  }

  function addHeat(n, _source) {
    heat = clamp(heat + n, 0, 1000);
    recomputeStars();
  }

  function clear() {
    heat = 0;
    stars = 0;
    clearUnits();
  }

  function nearestUnitDist(px, pz) {
    let best = 1e9;
    for (const c of cops) best = Math.min(best, dist2(px, pz, c.x, c.z));
    for (const c of cars) best = Math.min(best, dist2(px, pz, c.x, c.z));
    if (heli) best = Math.min(best, dist2(px, pz, heli.x, heli.z));
    return best;
  }

  function update(dt, rawDt, px, pz, inCar, onBusted) {
    // Heat falls with real time: fast while the PD is far, slow when close.
    if (heat > 0) {
      const nd = nearestUnitDist(px, pz);
      const rate = nd > 60 ? 14 : nd > 30 ? 6 : 1;
      heat = Math.max(0, heat - rate * rawDt);
      recomputeStars();
      if (heat <= 0) clearUnits();
    }
    // Grow the response to the wanted level, one unit at a time.
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = 1.2;
      if (cops.length < starCap(stars)) spawnCop();
      else if (cars.length < cruiserCap(stars)) spawnCruiser();
    }
    if (stars >= 4 && !heli) spawnHeli();
    // Foot cops run the player down.
    for (const cop of cops) {
      const want = Math.atan2(px - cop.x, pz - cop.z);
      cop.angle = angleLerp(cop.angle, want, Math.min(1, dt * 3));
      cop.x += Math.sin(cop.angle) * cop.speed * dt;
      cop.z += Math.cos(cop.angle) * cop.speed * dt;
      cop.sync();
      if (!inCar && dist2(cop.x, cop.z, px, pz) < 3 && onBusted) onBusted();
    }
    // Cruisers chase the car (or the player on foot) and try to ram it.
    for (const cr of cars) {
      const want = Math.atan2(px - cr.x, pz - cr.z);
      cr.angle = angleLerp(cr.angle, want, Math.min(1, dt * 1.8));
      const target = Math.min(cr.top, dist2(cr.x, cr.z, px, pz) > 12 ? 30 : 12);
      cr.speed += (target - cr.speed) * Math.min(1, dt * 1.2);
      cr.x += Math.sin(cr.angle) * cr.speed * dt;
      cr.z += Math.cos(cr.angle) * cr.speed * dt;
      const c = city.clampToMap(cr.x, cr.z);
      cr.x = c.x;
      cr.z = c.z;
      cr.sync();
    }
    // The helicopter hangs above the player, capped speed, outrunnable.
    if (heli) {
      const dx = px - heli.x;
      const dz = pz - heli.z;
      const d = Math.max(0.1, Math.sqrt(dx * dx + dz * dz));
      const sp = Math.min(20, d * 0.8);
      heli.x += (dx / d) * sp * dt;
      heli.z += (dz / d) * sp * dt;
      heli.y = 45 + Math.sin(performance.now() / 900) * 2;
      heli.group.position.set(heli.x, heli.y, heli.z);
      heli.group.rotation.y = Math.atan2(dx, dz);
      heli.rotor.rotation.y += dt * 22;
      heli.light.target.position.set(px - heli.x, -heli.y, pz - heli.z);
    }
  }

  return {
    get stars() { return stars; },
    get heat() { return heat; },
    get heli() { return heli; },
    cops,
    cars,
    addHeat,
    clear,
    update,
  };
}
