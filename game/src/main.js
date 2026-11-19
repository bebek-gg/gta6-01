// main.js — SOLMAR's entrypoint: boot, the game loop, the camera, input,
// the car and shop interactions, and the ?shot= staging the screenshots use.

import * as THREE from 'three';
import { City } from './city.js';
import { Vehicle, Traffic } from './vehicles.js';
import { Crowd } from './pedestrians.js';
import { Milo } from './player.js';
import { Wanted } from './police.js';
import { Missions } from './missions.js';
import { Store } from './shops.js';
import { Hud } from './hud.js';
import { SoundEngine } from './audio.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { clamp, turnToward } from './utils.js';

class Game {
  constructor() {
    this.state = 'menu';
    this.cash = 500;
    this.totalEarned = 0;
    this.ownedComet = false;
    this.ownedLoft = false;
    this.inCar = false;
    this.playerCar = null;
    this.shopOpen = false;
    this.time = 0;
    this.eHeld = false;
    this.keys = {};
    this.followYaw = Math.PI;
    this.orbitYaw = 0;
    this.camPitch = 0.4;
    this.tracers = [];
    this.booted = false;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('app').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b5e0);
    this.camera = new THREE.PerspectiveCamera(
      68, window.innerWidth / window.innerHeight, 0.1, 900,
    );
    this.camera.position.set(0, 60, 320);

    this.audio = new SoundEngine();
    this.city = new City(this.scene);
    this.traffic = new Traffic(this.city, this.scene);
    this.peds = new Crowd(this.city, this.scene);
    this.player = new Milo(this.scene);
    this.police = new Wanted(this);
    this.missions = new Missions(this);
    this.store = new Store(this);
    this.hud = new Hud(this);
    this.points = {
      mart: this.city.doorstep('mart'),
      safehouse: this.city.doorstep('safehouse'),
      loft: this.city.doorstep('loft'),
    };
    this.bindInput();
    this.loadProgress();
    this.buildHandle();

    const shot = new URLSearchParams(window.location.search).get('shot');
    this.clock = new THREE.Clock();
    this.booted = true;
    if (shot) {
      this.startGame();
      this.stageShot(shot);
    } else {
      this.hud.showTitle();
      if (this.hasSave) document.getElementById('btnReset').style.display = 'inline-block';
    }
    window.addEventListener('resize', () => this.onResize());
    this.animate();
  }

  /** Restore cash, rank, story progress, the loft and the Comet GT. */
  loadProgress() {
    const save = loadSave();
    this.hasSave = !!save;
    if (!save) return;
    this.cash = typeof save.cash === 'number' ? save.cash : 500;
    this.totalEarned = typeof save.totalEarned === 'number' ? save.totalEarned : 0;
    this.missions.index = typeof save.index === 'number' ? save.index : 0;
    this.missions.storyDone = !!save.storyDone;
    this.ownedLoft = !!save.ownedLoft;
    this.ownedComet = !!save.ownedComet;
    if (typeof save.station === 'number') this.audio.setStation(save.station);
  }

  saveProgress() {
    writeSave({
      cash: this.cash,
      totalEarned: this.totalEarned,
      index: this.missions.index,
      storyDone: this.missions.storyDone,
      ownedLoft: this.ownedLoft,
      ownedComet: this.ownedComet,
      station: this.audio.station,
    });
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /** The handle the playtest probe reads: window.__solmar. */
  buildHandle() {
    const game = this;
    const world = {};
    Object.defineProperties(world, {
      cash: {
        get: () => game.cash,
        set: (v) => { game.cash = v; },
        enumerable: true,
      },
      playerX: { get: () => game.player.x, enumerable: true },
      playerZ: { get: () => game.player.z, enumerable: true },
      inCar: { get: () => game.inCar, enumerable: true },
      playerCar: { get: () => game.playerCar, enumerable: true },
      playerSpeed: {
        get: () => (game.inCar && game.playerCar
          ? Math.abs(game.playerCar.speed)
          : game.player.speed),
        enumerable: true,
      },
      armor: { get: () => game.player.armor, enumerable: true },
      safehouse2Owned: { get: () => game.ownedLoft, enumerable: true },
      traffic: { get: () => game.traffic, enumerable: true },
      peds: { get: () => game.peds, enumerable: true },
    });
    this.handle = {
      get ready() { return game.booted; },
      get state() { return game.state; },
      world,
      get police() { return game.police; },
      get player() { return game.player; },
      get missions() { return game.missions; },
      get shopOpen() { return game.shopOpen; },
      get station() { return game.audio.stationName; },
      get heli() { return game.police.heli; },
      get landmarks() { return game.city.landmarks; },
      get points() { return game.points; },
    };
    window.__solmar = this.handle;
  }

  /** Leave the menu and take the next job, or free-roam when the story is done. */
  startGame() {
    this.audio.unlock();
    this.hud.hideTitle();
    this.state = 'playing';
    if (this.missions.storyDone) {
      this.hud.setJob('SOLMAR', 'Every job done. Free roam — the city is yours.');
    } else {
      this.missions.start(this.missions.index);
    }
    this.hud.refresh();
  }

  quitToMenu() {
    this.state = 'menu';
    this.hud.hidePause();
    this.hud.hideBusted();
    this.hud.showTitle();
    this.audio.siren(false);
    this.audio.rotor(false);
    this.audio.engine(0, false);
  }

  /** Put Milo in a car and hand him the keys. */
  giveCar(key, x, z, angle) {
    const car = new Vehicle(key, this.scene);
    car.x = x;
    car.z = z;
    car.angle = angle;
    car.sync();
    this.enterCar(car);
    return car;
  }

  /**
   * Stage one of the screenshot scenes. Runs right after startGame, so the
   * game is already playing; each shot then sets exactly what it needs.
   */
  stageShot(name) {
    const g = this;
    g.missions.active = null;
    g.missions.pendingNext = null;
    g.police.reset();
    if (name === 'heli') {
      g.city.setHour(10);
      g.giveCar('comet', 0, 0, 0);
      g.police.addHeat(950, 'shot');
    } else if (name === 'shop') {
      g.city.setHour(15);
      const door = g.city.doorstep('mart');
      g.player.setPosition(door.x, door.z, 0);
      g.store.open();
    } else if (name === 'heist') {
      g.city.setHour(20);
      g.giveCar('muscle', -90, 90, Math.PI / 2);
      g.missions.start(8);
      g.police.addHeat(800, 'shot');
    } else if (name === 'radio') {
      g.city.setHour(18.6);
      g.audio.setStation(1);
      g.giveCar('coupe', 60, 60, Math.PI);
    } else if (name === 'chase') {
      g.city.setHour(11);
      g.giveCar('comet', 0, 0, 0);
      g.police.addHeat(450, 'shot');
    } else if (name === 'street') {
      g.city.setHour(14);
      g.player.setPosition(60, 60, 0);
    } else if (name === 'mission') {
      g.city.setHour(10);
      g.missions.start(0);
    } else if (name === 'dusk') {
      g.city.setHour(18.4);
      g.player.setPosition(-30, 205, 0);
    }
    g.hud.refresh();
  }

  /** Keyboard, mouse and menu buttons. */
  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        this.keys[e.code] = true;
        return;
      }
      this.keys[e.code] = true;
      if (e.code === 'KeyE') {
        this.eHeld = true;
        if (this.state === 'shop') this.store.close();
        else if (this.state === 'playing') this.interact();
      } else if (e.code === 'KeyF') {
        if (this.state === 'playing') this.player.punch(this);
      } else if (e.code === 'KeyR') {
        if (this.state === 'playing') {
          this.audio.nextStation();
          this.hud.toast(this.audio.stationName);
        }
      } else if (e.code === 'KeyP') {
        if (this.state === 'playing') {
          this.state = 'paused';
          this.hud.showPause();
        } else if (this.state === 'paused') {
          this.state = 'playing';
          this.hud.hidePause();
        }
      } else if (e.code === 'KeyM') {
        const muted = this.audio.toggleMute();
        this.hud.toast(muted ? 'Muted' : 'Sound on');
      } else if (e.code === 'KeyC') {
        this.orbitYaw = 0;
        this.camPitch = 0.4;
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'KeyE') this.eHeld = false;
    });
    let drag = null;
    this.renderer.domElement.addEventListener('mousedown', (e) => {
      drag = { x: e.clientX, y: e.clientY, moved: 0 };
    });
    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      this.orbitYaw -= dx * 0.005;
      this.camPitch = clamp(this.camPitch + dy * 0.004, 0.15, 1.0);
    });
    window.addEventListener('mouseup', () => {
      if (drag && drag.moved < 6 && this.state === 'playing') {
        this.player.fire(this);
      }
      drag = null;
    });
    document.getElementById('btnStart').addEventListener('click', () => this.startGame());
    document.getElementById('btnReset').addEventListener('click', () => {
      clearSave();
      window.location.reload();
    });
    document.getElementById('btnResume').addEventListener('click', () => {
      this.state = 'playing';
      this.hud.hidePause();
    });
    document.getElementById('btnQuit').addEventListener('click', () => this.quitToMenu());
  }

  /** What E does, in order: work a job, steal a car, shop, rest, buy, sell. */
  interact() {
    // A job that needs holding E is worked by the mission step, not here.
    const hold = this.missions.holdTarget();
    if (hold && Math.hypot(this.player.x - hold.x, this.player.z - hold.z) < 8) return;
    if (this.inCar) {
      const chop = this.city.doorstep('chopShop');
      if (Math.hypot(this.player.x - chop.x, this.player.z - chop.z) < 10) {
        this.sellCar();
        return;
      }
      this.exitCar();
      return;
    }
    const car = this.traffic.nearest(this.player.x, this.player.z, 4.5);
    if (car) {
      this.enterCar(car);
      return;
    }
    if (this.store.atMart()) {
      if (this.missions.active) {
        this.hud.toast('Finish the job first');
        return;
      }
      this.store.open();
      return;
    }
    if (this.store.atHome()) {
      this.store.rest();
      return;
    }
    if (this.store.atLoft()) {
      if (!this.ownedLoft) {
        if (this.cash >= 2500) this.store.buyLoft();
        else this.hud.toast('The Coral Loft costs $2,500');
      } else {
        this.store.rest();
      }
    }
  }

  /** Climb in: the car leaves the flow, Milo hides inside it. */
  enterCar(car) {
    const wasParked = car.parked;
    this.traffic.remove(car);
    if (!wasParked) this.traffic.spawnDriver();
    this.playerCar = car;
    this.inCar = true;
    this.player.group.visible = false;
    this.player.x = car.x;
    this.player.z = car.z;
    this.player.angle = car.angle;
    this.audio.blip(520);
  }

  /** Step out beside the car. The car stays behind, parked where it stops. */
  exitCar() {
    if (!this.playerCar) return;
    const car = this.playerCar;
    const spot = this.city.collide(car.x + 2.5, car.z, 0.55);
    this.player.setPosition(spot.x, spot.z, 0);
    this.player.angle = car.angle;
    this.player.group.visible = true;
    this.playerCar = null;
    this.inCar = false;
    this.audio.engine(0, false);
    car.parked = true;
    this.traffic.parked.push(car);
  }

  /** Sell the car Milo is driving to Cleo's chop-shop. */
  sellCar() {
    const car = this.playerCar;
    if (!car) return;
    const prices = {
      comet: 800, muscle: 600, coupe: 500, sunrunner: 400,
      cab: 350, pickup: 450, hauler: 300, cruiser: 100,
    };
    const price = prices[car.key] || 300;
    this.scene.remove(car.group);
    const spot = this.city.collide(car.x + 2.5, car.z, 0.55);
    this.player.setPosition(spot.x, spot.z, 0);
    this.player.angle = car.angle;
    this.player.group.visible = true;
    this.playerCar = null;
    this.inCar = false;
    this.audio.engine(0, false);
    this.addCash(price, `Sold the ${car.name} to Cleo: +$${price}`);
    this.audio.chaChing();
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    if (this.state === 'playing') {
      this.update(dt);
    } else if (this.state === 'menu') {
      this.city.step(dt);
      const t = this.time * 0.03;
      this.camera.position.set(Math.sin(t) * 170, 55, 20 + Math.cos(t) * 170);
      this.camera.lookAt(0, 0, 20);
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** One frame of play: drive or walk, traffic, the crowd, the PD, the job. */
  update(dt) {
    const k = this.keys;
    const driveInput = {
      forward: !!(k.KeyW || k.ArrowUp),
      back: !!(k.KeyS || k.ArrowDown),
      left: !!(k.KeyA || k.ArrowLeft),
      right: !!(k.KeyD || k.ArrowRight),
      handbrake: !!k.Space,
    };
    const lookDir = this.followYaw + this.orbitYaw;
    if (this.inCar && this.playerCar) {
      this.playerCar.drive(dt, driveInput, this.city);
      this.player.x = this.playerCar.x;
      this.player.z = this.playerCar.z;
      this.player.angle = this.playerCar.angle;
      this.player.speed = Math.abs(this.playerCar.speed);
      this.audio.engine(Math.abs(this.playerCar.speed) / this.playerCar.topSpeed, true);
    } else {
      this.player.step(dt, {
        forward: driveInput.forward,
        back: driveInput.back,
        left: driveInput.left,
        right: driveInput.right,
        sprint: !!(k.ShiftLeft || k.ShiftRight),
        jump: !!k.Space,
      }, lookDir, this);
      this.audio.engine(0, false);
    }
    const danger = this.inCar && this.playerCar
      ? Math.abs(this.playerCar.speed)
      : this.player.speed;
    this.traffic.step(dt);
    this.peds.step(dt, this.player.x, this.player.z, danger);
    this.police.step(dt);
    this.missions.step(dt);
    this.city.step(dt);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.ttl -= dt;
      if (t.ttl <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      } else {
        t.line.material.opacity = (t.ttl / 0.12) * 0.9;
      }
    }
    this.updateCamera(dt);
    this.hud.refresh();
  }

  /** A chase camera that trails the heading; dragging orbits around Milo. */
  updateCamera(dt) {
    const focus = this.inCar && this.playerCar ? this.playerCar : this.player;
    this.followYaw = turnToward(this.followYaw, focus.angle, 2.4 * dt);
    const lookDir = this.followYaw + this.orbitYaw;
    const dist = 9 + this.camPitch * 4;
    const height = 3.5 + this.camPitch * 4.5;
    this.camera.position.set(
      focus.x - Math.sin(lookDir) * dist,
      height,
      focus.z - Math.cos(lookDir) * dist,
    );
    this.camera.lookAt(
      focus.x + Math.sin(lookDir) * 6,
      1.6,
      focus.z + Math.cos(lookDir) * 6,
    );
  }

  /** Busted: bail, the car left behind, and a wake-up at the safehouse. */
  arrested() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    const bail = this.cash > 0 ? Math.min(this.cash, Math.max(150, Math.round(this.cash * 0.1))) : 0;
    this.cash -= bail;
    if (this.inCar) this.exitCar();
    this.audio.lose();
    this.hud.showBusted(`Bail paid: $${bail.toLocaleString('en-US')} — the PD let you go.`);
    this.saveProgress();
    setTimeout(() => {
      const home = this.city.doorstep('safehouse');
      this.player.setPosition(home.x, home.z, 0);
      this.player.health = 100;
      this.police.reset();
      this.hud.hideBusted();
      this.state = 'playing';
    }, 3000);
  }

  /** Knocked out on foot: a fine, and a wake-up at the safehouse. */
  downed() {
    if (this.state !== 'playing') return;
    const fine = Math.min(this.cash, 100);
    this.cash -= fine;
    if (this.inCar) this.exitCar();
    const home = this.city.doorstep('safehouse');
    this.player.setPosition(home.x, home.z, 0);
    this.player.health = 100;
    this.player.armor = 0;
    this.police.reset();
    this.hud.showBanner('BACK ON YOUR FEET', 'Milo wakes up at the safehouse.');
    this.saveProgress();
  }

  /** Cash in, with an optional toast. Earnings count toward the rank. */
  addCash(n, msg) {
    this.cash += n;
    if (n > 0) this.totalEarned += n;
    if (msg) this.hud.toast(msg);
  }

  /** A short-lived tracer line for the pistol. */
  spawnTracer(x1, y1, z1, x2, y2, z2) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1, y1, z1),
      new THREE.Vector3(x2, y2, z2),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffe9a0, transparent: true, opacity: 0.9,
    }));
    this.scene.add(line);
    this.tracers.push({ line, ttl: 0.12 });
  }
}

new Game();
