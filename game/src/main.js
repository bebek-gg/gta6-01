// main.js — SOLMAR's entrypoint: the Game wires every system together,
// runs the frame loop, owns the camera, the E key and the busted flow,
// and exposes the window.__solmar handle the playtest probe reads.

import * as THREE from 'three';
import { SoundEngine } from './audio.js';
import { buildCity } from './city.js';
import { Hud } from './hud.js';
import { Story } from './missions.js';
import { Milo } from './player.js';
import { Wanted } from './police.js';
import { clearSave, loadSave, writeSave } from './save.js';
import { Store } from './shops.js';
import { clamp, cashText, dist2, turnToward } from './utils.js';
import { Traffic, Vehicle, driveVehicle } from './vehicles.js';
import { Crowd } from './pedestrians.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

export class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87bfe8);
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 900);

    this.audio = new SoundEngine();
    this.city = buildCity(this.scene);
    this.traffic = new Traffic(this.city, this.scene);
    this.traffic.spawn();
    this.peds = new Crowd(this.city, this.scene);
    this.player = new Milo(this.scene);
    this.police = new Wanted(this);
    this.missions = new Story(this);
    this.store = new Store(this);
    this.hud = new Hud(this);

    this.state = 'menu';
    this.time = 0;
    this.cash = 500;
    this.totalEarned = 0;
    this.ownedLoft = false;
    this.ownedComet = false;
    this.bests = { topSpeed: 0, bestRace: 0 };
    this.inCar = false;
    this.playerCar = null;
    this.shopOpen = false;
    this.camYaw = Math.PI;
    this.dragOffset = 0;
    this.dragging = false;
    this.saveT = 0;
    this.ready = false;
    this.tracers = [];
    this.input = {
      forward: false, back: false, left: false, right: false,
      sprint: false, jump: false, handbrake: false, eHeld: false,
    };

    // The beacon: a light pillar and a ring over the current objective.
    this.beacon = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.9, 42, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff4fd8, transparent: true, opacity: 0.22,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    pillar.position.y = 21;
    this.beacon.add(pillar);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4.2, 0.22, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0xff4fd8 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    this.beacon.add(ring);
    this.beacon.visible = false;
    this.scene.add(this.beacon);

    // The probe's view of the world: plain fields where it only reads,
    // getters and setters where it also writes (cash, armour, loft).
    const self = this;
    this.world = {
      get cash() { return self.cash; },
      set cash(v) { self.cash = v; },
      get armor() { return self.player.armor; },
      set armor(v) { self.player.armor = v; },
      get safehouse2Owned() { return self.ownedLoft; },
      set safehouse2Owned(v) { self.ownedLoft = v; },
      get playerX() { return self.player.x; },
      get playerZ() { return self.player.z; },
      get inCar() { return self.inCar; },
      get playerCar() { return self.playerCar; },
      get playerSpeed() {
        return self.inCar && self.playerCar ? Math.abs(self.playerCar.speed) : self.player.speed;
      },
      traffic: this.traffic,
      peds: this.peds,
    };

    this.loadProgress();
  }

  addCash(n, note) {
    this.cash += n;
    this.totalEarned += n;
    if (note) this.hud.toast(note);
  }

  saveProgress() {
    writeSave({
      cash: this.cash,
      totalEarned: this.totalEarned,
      missionIndex: this.missions.idx,
      ownedLoft: this.ownedLoft,
      ownedComet: this.ownedComet,
      bests: this.bests,
    });
  }

  loadProgress() {
    const s = loadSave();
    if (!s) return;
    if (typeof s.cash === 'number') this.cash = s.cash;
    if (typeof s.totalEarned === 'number') this.totalEarned = s.totalEarned;
    if (typeof s.missionIndex === 'number') this.missions.idx = Math.min(s.missionIndex, 12);
    if (s.ownedLoft) this.ownedLoft = true;
    if (s.ownedComet) this.ownedComet = true;
    if (s.bests) this.bests = { ...this.bests, ...s.bests };
    if (this.missions.idx >= 12) this.missions.finished = true;
  }

  /** Get into a car: parked ones are free, moving ones count as a jacking. */
  takeCar(car, jacked) {
    if (!car || this.inCar) return;
    if (jacked) this.police.addHeat(120, 'jacking a car');
    this.traffic.detach(car);
    this.playerCar = car;
    this.inCar = true;
    this.player.group.visible = false;
    this.player.x = car.x;
    this.player.z = car.z;
    this.audio.blip(520);
  }

  /** Step out beside the car; the car stays where it is, parked. */
  leaveCar() {
    if (!this.inCar || !this.playerCar) return;
    const car = this.playerCar;
    const side = car.angle + Math.PI / 2;
    this.player.setPosition(car.x + Math.sin(side) * 2.6, car.z + Math.cos(side) * 2.6, 0);
    this.player.angle = car.angle;
    this.player.group.visible = true;
    this.traffic.park(car);
    this.playerCar = null;
    this.inCar = false;
    this.audio.engine(0, false);
  }

  /** The E key: shop, safehouse, loft, job start, chop-shop, cars. */
  use() {
    if (this.state === 'shop') {
      this.store.close();
      return;
    }
    if (this.state !== 'playing') return;
    // A hold step drinks from the held key; the press itself does nothing.
    const a = this.missions.active;
    if (a && !this.inCar) {
      const step = a.job.steps[a.stage];
      if (step && step.type === 'hold') {
        const t = this.missions.target();
        if (t && dist2(this.player.x, this.player.z, t.x, t.z) < step.r) return;
      }
    }
    if (this.store.atMart() && !this.missions.active) {
      this.store.open();
      return;
    }
    if (this.store.atHome()) {
      this.store.rest();
      return;
    }
    if (this.store.atLoft() && !this.ownedLoft) {
      this.store.buyLoft();
      return;
    }
    if (!this.missions.active) {
      const ns = this.missions.nextStartPoint();
      if (ns && dist2(this.player.x, this.player.z, ns.x, ns.z) < 8) {
        this.missions.start(this.missions.idx);
        return;
      }
    }
    if (this.inCar) {
      const chop = this.city.doorstep('chopShop');
      if (dist2(this.player.x, this.player.z, chop.x, chop.z) < 11) {
        this.missions.sellStolen();
        return;
      }
      this.leaveCar();
      return;
    }
    const parked = this.traffic.closestParked(this.player.x, this.player.z, 6);
    if (parked) {
      this.takeCar(parked, false);
      return;
    }
    const moving = this.traffic.closestMoving(this.player.x, this.player.z, 6);
    if (moving) this.takeCar(moving, true);
  }

  /** Caught: pay bail, wake up at the safehouse, heat cleared. */
  arrested() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    const bail = Math.min(300, this.cash);
    this.cash -= bail;
    this.input.eHeld = false;
    this.audio.lose();
    this.audio.engine(0, false);
    this.audio.siren(false);
    this.audio.rotor(false);
    this.hud.showBusted(`Busted — bail ${cashText(bail)}. Milo walks out of the precinct at dawn.`);
    setTimeout(() => {
      const door = this.city.doorstep('safehouse');
      this.player.setPosition(door.x, door.z, 0);
      this.player.health = 100;
      this.player.armor = 0;
      this.police.reset();
      this.missions.fail('Busted by the PD');
      this.hud.hideBusted();
      this.state = 'playing';
      this.hud.toast('Milo wakes up at the safehouse');
    }, 2600);
  }

  /** Beaten down on the street: same bail, same safehouse. */
  downed() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    const bill = Math.min(200, this.cash);
    this.cash -= bill;
    this.input.eHeld = false;
    this.audio.lose();
    this.audio.engine(0, false);
    this.hud.showBusted(`Wasted — hospital bill ${cashText(bill)}. The crew drags Milo to the safehouse.`);
    setTimeout(() => {
      const door = this.city.doorstep('safehouse');
      this.player.setPosition(door.x, door.z, 0);
      this.player.health = 100;
      this.player.armor = 0;
      this.police.reset();
      this.hud.hideBusted();
      this.state = 'playing';
      this.hud.toast('Milo wakes up at the safehouse');
    }, 2600);
  }

  /** A short-lived tracer line for a pistol shot. */
  spawnTracer(x1, y1, z1, x2, y2, z2) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1, y1, z1),
      new THREE.Vector3(x2, y2, z2),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0.9,
    }));
    this.scene.add(line);
    this.tracers.push({ line, ttl: 0.09 });
  }

  /** One simulation step while the game is playing. */
  frame(dt) {
    if (this.inCar && this.playerCar) {
      const car = this.playerCar;
      driveVehicle(car, {
        forward: this.input.forward,
        back: this.input.back,
        left: this.input.left,
        right: this.input.right,
        handbrake: this.input.jump,
      }, dt, this.city);
      this.player.x = car.x;
      this.player.z = car.z;
      this.player.angle = car.angle;
      this.player.speed = Math.abs(car.speed);
      // Shunting traffic: push both cars apart, damage at speed.
      for (const other of this.traffic.cars) {
        const d = dist2(car.x, car.z, other.x, other.z);
        if (d < 3.4 && d > 0.01) {
          const nx = (other.x - car.x) / d;
          const nz = (other.z - car.z) / d;
          const push = (3.4 - d) / 2;
          other.x += nx * push;
          other.z += nz * push;
          other.sync();
          car.x -= nx * push * 0.4;
          car.z -= nz * push * 0.4;
          if (car.speed > 8) {
            car.health = Math.max(0, car.health - 4);
            this.audio.thud();
          }
        }
      }
      if (car.wrecked) this.hud.toast('The car is wrecked — get out');
      this.bests.topSpeed = Math.max(this.bests.topSpeed, Math.abs(car.speed));
    } else {
      this.player.step(dt, {
        forward: this.input.forward,
        back: this.input.back,
        left: this.input.left,
        right: this.input.right,
        sprint: this.input.sprint,
        jump: this.input.jump,
      }, this.camYaw, this);
      // Traffic that clips Milo on foot hurts him. It does not shove him:
      // being pushed off a spot would break a hold step mid-job.
      for (const car of this.traffic.cars) {
        const d = dist2(car.x, car.z, this.player.x, this.player.z);
        if (d < 1.6 && d > 0.01) {
          this.player.hurt(10, this);
        }
      }
    }
    this.traffic.step(dt, this.inCar ? this.playerCar : null);
    const danger = this.inCar && this.playerCar ? Math.abs(this.playerCar.speed) : this.player.speed;
    this.peds.step(dt, this.player.x, this.player.z, danger);
    this.police.step(dt);
    this.missions.step(dt);
    this.city.update(dt);
    this.audio.engine(
      this.inCar && this.playerCar ? clamp(Math.abs(this.playerCar.speed) / this.playerCar.top, 0, 1) : 0,
      this.inCar,
    );
    // Tracers fade out.
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.ttl -= dt;
      if (t.ttl <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
    // The beacon tracks the current objective (or the next job's start).
    const target = this.missions.target();
    if (target && this.state === 'playing') {
      this.beacon.visible = true;
      this.beacon.position.set(target.x, 0, target.z);
      const s = 1 + Math.sin(this.time * 3) * 0.12;
      this.beacon.scale.set(s, 1, s);
    } else {
      this.beacon.visible = false;
    }
    this.cameraStep(dt);
    this.hint();
    this.hud.refresh();
    this.saveT += dt;
    if (this.saveT > 5) {
      this.saveT = 0;
      this.saveProgress();
    }
  }

  /** Chase camera: behind the heading, eased, with a drag offset. */
  cameraStep(dt) {
    const heading = this.inCar && this.playerCar ? this.playerCar.angle : this.player.angle;
    if (!this.dragging) this.dragOffset *= Math.max(0, 1 - 0.9 * dt);
    const want = heading + this.dragOffset;
    this.camYaw = turnToward(this.camYaw, want, 4.5 * dt);
    const dist = this.inCar ? 13 : 10.5;
    const height = this.inCar ? 5.8 : 4.6;
    const cx = this.player.x - Math.sin(this.camYaw) * dist;
    const cz = this.player.z - Math.cos(this.camYaw) * dist;
    this.camera.position.set(cx, height, cz);
    this.camera.lookAt(
      this.player.x + Math.sin(this.camYaw) * 6,
      1.6,
      this.player.z + Math.cos(this.camYaw) * 6,
    );
  }

  /** The contextual hint line at the bottom of the screen. */
  hint() {
    let text = '';
    if (this.state === 'shop') {
      text = 'E — close the shop';
    } else if (this.inCar) {
      const chop = this.city.doorstep('chopShop');
      if (dist2(this.player.x, this.player.z, chop.x, chop.z) < 11) text = 'E — sell this car to Cleo';
      else text = 'E — step out · Space — handbrake · R — radio';
    } else if (this.store.atMart() && !this.missions.active) {
      text = 'E — browse Marina Mart';
    } else if (this.store.atHome()) {
      text = 'E — rest at the safehouse';
    } else if (this.store.atLoft() && !this.ownedLoft) {
      text = 'E — buy the Coral Loft ($2,500)';
    } else if (!this.missions.active) {
      const ns = this.missions.nextStartPoint();
      if (ns && dist2(this.player.x, this.player.z, ns.x, ns.z) < 8) text = 'E — start the next job';
      else if (this.traffic.closestParked(this.player.x, this.player.z, 6)) text = 'E — take this car';
      else if (this.traffic.closestMoving(this.player.x, this.player.z, 6)) text = 'E — jack this car';
      else if (this.player.armed) text = 'Click — shoot · F — punch · R — radio';
      else text = 'WASD — move · Shift — sprint · Space — jump';
    } else {
      const a = this.missions.active;
      const step = a.job.steps[a.stage];
      if (step && step.type === 'hold') text = 'Hold E to work the job';
      else if (this.player.armed) text = 'Click — shoot · F — punch';
    }
    this.hud.setHint(text);
  }

  startGame() {
    this.audio.unlock();
    this.hud.hideTitle();
    this.state = 'playing';
    if (!this.missions.active && !this.missions.finished && this.missions.idx < 12) {
      this.missions.start(this.missions.idx);
    } else if (this.missions.finished) {
      this.hud.setJob('Story complete', 'Every job for Cleo is done. Solmar is yours.');
    }
  }

  pauseGame() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.hud.showPause();
      this.audio.duck(true);
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.hud.hidePause();
      this.audio.duck(false);
    }
  }

  /** Stage one scene for a screenshot: ?shot=heli|shop|heist|radio|... */
  poseForShot(kind) {
    this.startGame();
    if (kind === 'heli' || kind === 'chase') {
      const car = new Vehicle('comet', this.scene);
      car.x = 0;
      car.z = 150;
      car.angle = Math.PI;
      car.sync();
      this.takeCar(car, false);
      this.police.addHeat(kind === 'heli' ? 950 : 500, 'staging');
    } else if (kind === 'shop') {
      const door = this.city.doorstep('mart');
      this.player.setPosition(door.x, door.z, 0);
      this.player.angle = Math.PI * 0.75;
      this.camYaw = this.player.angle;
      this.missions.active = null;
      this.store.open();
    } else if (kind === 'heist') {
      this.missions.start(8);
      this.police.addHeat(700, 'staging');
      const car = new Vehicle('muscle', this.scene);
      car.x = -102;
      car.z = 180;
      car.angle = Math.PI / 2;
      car.sync();
      this.takeCar(car, false);
    } else if (kind === 'radio') {
      this.audio.setStation(1);
      this.city.setHour(18.4);
      const car = new Vehicle('coupe', this.scene);
      car.x = 120;
      car.z = 60;
      car.angle = Math.PI;
      car.sync();
      this.takeCar(car, false);
    } else if (kind === 'mission') {
      this.missions.start(0);
    } else if (kind === 'street') {
      this.player.setPosition(0, 60, 0);
      this.player.angle = Math.PI;
    } else if (kind === 'dusk') {
      this.city.setHour(18.4);
      this.player.setPosition(60, -60, 0);
    }
  }
}

// ------------------------------------------------------------------- boot

const game = new Game();

const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  Space: 'jump',
};

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  const field = KEYMAP[e.code];
  if (field) game.input[field] = true;
  if (e.code === 'Space') game.input.handbrake = true;
  if (e.repeat) return;
  if (e.code === 'KeyE') {
    game.input.eHeld = true;
    game.use();
  }
  if (e.code === 'KeyF') game.player.punch(game);
  if (e.code === 'KeyR') {
    game.audio.nextStation();
    game.hud.toast(game.audio.stationName);
  }
  if (e.code === 'KeyP') game.pauseGame();
  if (e.code === 'KeyM') {
    const muted = game.audio.toggleMute();
    game.hud.toast(muted ? 'Muted' : 'Sound on');
  }
  if (e.code === 'KeyC') game.dragOffset = 0;
});

window.addEventListener('keyup', (e) => {
  const field = KEYMAP[e.code];
  if (field) game.input[field] = false;
  if (e.code === 'Space') game.input.handbrake = false;
  if (e.code === 'KeyE') game.input.eHeld = false;
});

// Drag to look; a click without a drag fires the pistol.
let downX = 0;
let downY = 0;
let downAt = 0;
const canvas = game.renderer.domElement;
canvas.addEventListener('mousedown', (e) => {
  game.dragging = true;
  downX = e.clientX;
  downY = e.clientY;
  downAt = performance.now();
  game.audio.unlock();
});
window.addEventListener('mousemove', (e) => {
  if (!game.dragging) return;
  game.dragOffset += e.movementX * 0.004;
});
window.addEventListener('mouseup', (e) => {
  if (!game.dragging) return;
  game.dragging = false;
  const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
  if (moved < 6 && performance.now() - downAt < 400) {
    game.player.fire(game);
  }
});

window.addEventListener('resize', () => {
  game.camera.aspect = window.innerWidth / window.innerHeight;
  game.camera.updateProjectionMatrix();
  game.renderer.setSize(window.innerWidth, window.innerHeight);
});

document.getElementById('btnStart').addEventListener('click', () => game.startGame());
document.getElementById('btnReset').addEventListener('click', () => {
  clearSave();
  window.location.reload();
});
document.getElementById('btnResume').addEventListener('click', () => game.pauseGame());
document.getElementById('btnQuit').addEventListener('click', () => {
  game.state = 'menu';
  game.hud.hidePause();
  game.hud.showTitle();
  game.audio.duck(false);
});

// If a previous save owns the Comet GT, park it outside the mart again.
if (game.ownedComet) {
  const car = new Vehicle('comet', game.scene);
  const door = game.city.doorstep('mart');
  car.x = door.x;
  car.z = door.z - 10;
  car.angle = Math.PI / 2;
  car.sync();
  game.traffic.park(car);
}

const saved = loadSave();
if (saved) {
  document.getElementById('btnStart').textContent = 'Continue';
  document.getElementById('btnReset').style.display = 'inline-block';
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (game.state === 'playing') {
    game.time += dt;
    game.frame(dt);
  } else if (game.state === 'menu') {
    // Attract mode: the city lives while the title is up.
    game.time += dt;
    game.city.update(dt);
    game.traffic.step(dt, null);
    game.peds.step(dt, game.player.x, game.player.z, 0);
    const a = game.time * 0.03;
    game.camera.position.set(Math.sin(a) * 175, 85, Math.cos(a) * 175);
    game.camera.lookAt(0, 0, 0);
  }
  game.renderer.render(game.scene, game.camera);
}

game.hud.showTitle();
if (shot) game.poseForShot(shot);
game.ready = true;
animate();

/** The handle the playtest probe reads: state, world, police, missions. */
window.__solmar = {
  get ready() {
    return game.ready;
  },
  get state() {
    return game.state;
  },
  world: game.world,
  police: game.police,
  player: game.player,
  missions: game.missions,
  get shopOpen() {
    return game.shopOpen;
  },
  get station() {
    return game.audio.stationName;
  },
  get heli() {
    return game.police.heli;
  },
  landmarks: game.city.landmarks,
  /** Doorsteps: where Milo stands to use each named place. */
  points: game.city.doorsteps,
};
