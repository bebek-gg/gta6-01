// player.js — Milo Reyes on foot: third-person movement, jump, punch,
// pistol, and entering / stealing cars.
import * as THREE from 'three';
import { clamp, damp, dist2 } from './utils.js';
import { collideCircle } from './city.js';

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    const jacket = new THREE.MeshStandardMaterial({ color: 0x2e5fa3, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc98d5a, roughness: 0.8 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2a2d34, roughness: 0.95 });
    this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.9, 0.38), jacket);
    this.torso.position.y = 1.2; this.torso.castShadow = true;
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
    this.head.position.y = 1.92; this.head.castShadow = true;
    // flat cap with a brim, so Milo reads as a character, not a pawn
    const capMat = new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.85 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.29, 0.12, 12), capMat);
    cap.position.y = 2.1; this.group.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.22), capMat);
    brim.position.set(0, 2.05, 0.28); this.group.add(brim);
    // belt at the waist
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.09, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.7 }));
    belt.position.y = 0.78; this.group.add(belt);
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.8, 0.28), pants);
    this.legL.position.set(-0.17, 0.4, 0);
    // shoes ride on the legs so they swing with the walk cycle
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 });
    const shoeGeo = new THREE.BoxGeometry(0.28, 0.12, 0.44);
    const shoeL = new THREE.Mesh(shoeGeo, shoeMat);
    shoeL.position.set(0, -0.36, 0.06); this.legL.add(shoeL);
    this.legR = this.legL.clone(); this.legR.position.x = 0.17;
    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.22), jacket);
    this.armL.position.set(-0.45, 1.2, 0);
    this.armR = this.armL.clone(); this.armR.position.x = 0.45;
    // pistol in the right hand when armed
    this.gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.4, metalness: 0.7 }));
    this.gun.position.set(0.45, 0.85, 0.25);
    this.gun.visible = false;
    this.group.add(this.torso, this.head, this.legL, this.legR, this.armL, this.armR, this.gun);
    scene.add(this.group);
    this.x = 0; this.z = 0; this.y = 0; this.vy = 0; this.heading = 0;
    this.health = 100; this.armed = false; this.ammo = 0;
    this.punchCd = 0; this.shootCd = 0;
    this.walkPhase = 0; this.speed = 0;
    // tracer line for shots
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    this.tracer.frustumCulled = false;
    scene.add(this.tracer);
    this.tracerLife = 0;
  }
  setPosition(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading; this.y = 0; this.vy = 0;
    this.sync();
  }
  sync() {
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.heading;
  }
  // moveDir: {x, z} world-space desired direction (already camera-relative), magnitude 0..1
  update(dt, moveDir, sprint, jump, world) {
    this.punchCd = Math.max(0, this.punchCd - dt);
    this.shootCd = Math.max(0, this.shootCd - dt);
    const targetSpeed = moveDir.mag * (sprint ? 10 : 6);
    this.speed = damp(this.speed, targetSpeed, 10, dt);
    if (this.speed > 0.3) {
      const want = Math.atan2(moveDir.x, moveDir.z);
      let d = want - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.heading += clamp(d, -8 * dt, 8 * dt);
    }
    let nx = this.x + Math.sin(this.heading) * this.speed * dt;
    let nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const hit = collideCircle(world.city.colliders, nx, nz, 0.7);
    nx = hit.x; nz = hit.z;
    this.x = clamp(nx, world.city.bounds.minX, world.city.bounds.maxX);
    this.z = clamp(nz, world.city.bounds.minZ, world.city.bounds.maxZ);
    // jump + gravity
    if (jump && this.y === 0) this.vy = 8;
    this.vy -= 22 * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) { this.y = 0; this.vy = 0; }
    // walk cycle
    this.walkPhase += this.speed * dt * 1.6;
    const sw = Math.sin(this.walkPhase) * 0.55 * clamp(this.speed / 6, 0, 1);
    this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
    this.armL.rotation.x = -sw * 0.6; this.armR.rotation.x = sw * 0.6;
    this.gun.visible = this.armed;
    if (this.tracerLife > 0) {
      this.tracerLife -= dt;
      this.tracer.material.opacity = Math.max(0, this.tracerLife * 8);
    }
    this.sync();
  }
  punch(world) {
    if (this.punchCd > 0) return false;
    this.punchCd = 0.55;
    const px = this.x + Math.sin(this.heading) * 1.4;
    const pz = this.z + Math.cos(this.heading) * 1.4;
    let hitAny = false;
    for (const p of world.peds.peds) {
      if (p.state !== 'down' && dist2(px, pz, p.x, p.z) < 1.6) {
        world.peds.knockDown(p);
        world.onAssault && world.onAssault(p.x, p.z);
        hitAny = true;
      }
    }
    for (const c of world.police.cops) {
      if (!c.down && dist2(px, pz, c.x, c.z) < 1.8) {
        c.health -= 34;
        world.onAssault && world.onAssault(c.x, c.z);
        hitAny = true;
      }
    }
    world.audio.punch();
    return hitAny;
  }
  shoot(camera, world) {
    if (this.shootCd > 0 || !this.armed) return false;
    if (this.ammo <= 0) {
      this.shootCd = 0.3;
      world.audio.denied();
      world.hud.toast('Out of ammo — buy more at a shop.');
      return false;
    }
    this.shootCd = 0.3;
    this.ammo--;
    world.hud.setAmmo(this.ammo);
    world.audio.gunshot();
    const origin = { x: this.x, y: this.y + 1.5, z: this.z };
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const end = {
      x: origin.x + dir.x * 90, y: Math.max(0.1, origin.y + dir.y * 90), z: origin.z + dir.z * 90,
    };
    // find the closest hit along the ray (peds, cops, cars)
    let bestT = 90, hitKind = null, hitObj = null;
    const test = (ox, oz, r, kind, obj) => {
      const dx = ox - origin.x, dz = oz - origin.z;
      const along = dx * dir.x + dz * dir.z;
      if (along < 0 || along > bestT) return;
      const px = origin.x + dir.x * along, pz = origin.z + dir.z * along;
      if (dist2(px, pz, ox, oz) < r + 0.6) { bestT = along; hitKind = kind; hitObj = obj; }
    };
    for (const p of world.peds.peds) if (p.state !== 'down') test(p.x, p.z, 0.7, 'ped', p);
    for (const c of world.police.cops) if (!c.down) test(c.x, c.z, 0.8, 'cop', c);
    for (const c of [...world.traffic.cars, ...world.traffic.parked]) test(c.x, c.z, 2.2, 'car', c);
    // PD cruisers are shootable too: a pursuing cruiser takes damage like any car
    for (const c of world.police.cars) if (c.health > 0) test(c.x, c.z, 2.2, 'pcar', c);
    if (hitKind === 'ped') {
      world.peds.knockDown(hitObj);
      world.onAssault && world.onAssault(hitObj.x, hitObj.z);
    } else if (hitKind === 'cop') {
      hitObj.health -= 50;
      world.onAssault && world.onAssault(hitObj.x, hitObj.z);
    } else if (hitKind === 'car') {
      hitObj.health -= 25;
      world.onShootCar && world.onShootCar(hitObj);
    } else if (hitKind === 'pcar') {
      hitObj.health -= 25;
      world.onShootCar && world.onShootCar(hitObj);
    }
    end.x = origin.x + dir.x * bestT; end.y = Math.max(0.1, origin.y + dir.y * bestT); end.z = origin.z + dir.z * bestT;
    const pos = this.tracer.geometry.attributes.position;
    pos.setXYZ(0, origin.x, origin.y, origin.z);
    pos.setXYZ(1, end.x, end.y, end.z);
    pos.needsUpdate = true;
    this.tracer.material.opacity = 0.9;
    this.tracerLife = 0.12;
    world.peds.scare(this.x, this.z, 40);
    world.police.hearShot(this.x, this.z);
    return true;
  }
}
