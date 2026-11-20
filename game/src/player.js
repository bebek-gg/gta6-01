// player.js — Milo Reyes on foot: walking, running, health, the gun, and
// the position the rest of the game reads. Driving lives in vehicles.js.
import * as THREE from 'three';
import { clamp, dist2 } from './utils.js';

const bodyGeo = new THREE.CapsuleGeometry(0.55, 1.1, 4, 10);
const headGeo = new THREE.SphereGeometry(0.34, 10, 8);

export function createPlayer(scene, city, startX, startZ) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2a6a4a });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 1.15;
  group.add(body);
  const head = new THREE.Mesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xd8a878 }));
  head.position.y = 2.25;
  group.add(head);
  group.position.set(startX, 0, startZ);
  scene.add(group);

  const player = {
    x: startX,
    z: startZ,
    angle: 0,
    health: 100,
    armed: false,
    ammo: 0,
    group,
    walkSpeed: 7,
    runSpeed: 11,
    setPosition(x, z, _y) {
      this.x = x;
      this.z = z;
      group.position.set(x, 0, z);
    },
    // WASD on foot. Returns the speed actually moved at.
    move(input, dt, sprint) {
      let mx = 0;
      let mz = 0;
      if (input.forward) mz -= 1;
      if (input.back) mz += 1;
      if (input.left) mx -= 1;
      if (input.right) mx += 1;
      if (mx === 0 && mz === 0) return 0;
      const len = Math.sqrt(mx * mx + mz * mz);
      mx /= len;
      mz /= len;
      // Movement is camera-relative: the camera sits behind the player, so
      // forward is away from the camera (the camera yaw is stored on the player).
      const sp = sprint ? this.runSpeed : this.walkSpeed;
      const ca = Math.cos(this.angle);
      const sa = Math.sin(this.angle);
      const dx = (mx * ca - mz * sa) * sp * dt;
      const dz = (mx * sa + mz * ca) * sp * dt;
      this.x += dx;
      this.z += dz;
      const c = city.clampToMap(this.x, this.z);
      this.x = c.x;
      this.z = c.z;
      const p = { x: this.x, z: this.z };
      city.resolveCollision(p, 0.8);
      this.x = p.x;
      this.z = p.z;
      // Face the direction of travel.
      const want = Math.atan2(dx, dz);
      let d = want - this.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.angle += d * Math.min(1, dt * 10);
      group.position.set(this.x, 0, this.z);
      group.rotation.y = this.angle;
      return sp;
    },
    heal(n) {
      this.health = clamp(this.health + n, 0, 100);
    },
    hurt(n) {
      this.health = clamp(this.health - n, 0, 100);
      return this.health <= 0;
    },
    // Fire one shot. Returns true when a bullet actually left the gun.
    shoot() {
      if (!this.armed || this.ammo <= 0) return false;
      this.ammo -= 1;
      return true;
    },
    // Keep the mesh with the body after a teleport.
    syncMesh() {
      this.group.position.set(this.x, 0, this.z);
      this.group.rotation.y = this.angle;
    },
  };
  return player;
}
