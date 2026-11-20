// main.js — SOLMAR entry: the renderer, the scene, the camera, the game
// loop, the input, the interaction key, the ?shot= staging and the
// window.__solmar handle the playtest reads.
import * as THREE from 'three';
import { createCity, POINTS } from './city.js';
import { createTraffic, createCar, drivePlayerCar } from './vehicles.js';
import { createPlayer } from './player.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createShops } from './shops.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createSave } from './save.js';
import { clamp, dist2 } from './utils.js';

const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot');

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9db8d8);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// The shared game context. Systems read each other through G at run time.
const G = {
  state: 'menu',
  totalEarned: 0,
  world: {
    cash: 500,
    armor: 0,
    safehouse2Owned: false,
    inCar: false,
    playerCar: null,
    playerSpeed: 0,
    playerX: -150,
    playerZ: -150,
    traffic: null,
    peds: null,
  },
  input: { forward: false, back: false, left: false, right: false, sprint: false, e: false },
  city: null,
  audio: null,
  player: null,
  traffic: null,
  peds: null,
  police: null,
  shops: null,
  missions: null,
  hud: null,
  save: null,
  onStart: null,
  onBusted: null,
};

G.city = createCity(scene);
G.audio = createAudio();
G.player = createPlayer(scene, G.city, -150, -150);
G.traffic = createTraffic(scene, G.city);
G.world.traffic = G.traffic;
G.peds = createPedestrians(scene, G.city);
G.world.peds = G.peds;
G.police = createPolice(scene, G.city, G);
G.shops = createShops(G);
G.missions = createMissions(G);
G.hud = createHud(G);
G.save = createSave(G);

// Load a save for normal play, never for a staged screenshot.
if (!SHOT) G.save.loadGame();

// The start button hands the game over: menu away, job one begins.
G.onStart = () => {
  G.audio.ensure();
  G.hud.showMenu(false);
  G.state = 'playing';
  if (G.missions.index === 0 && !G.missions.active) G.missions.start(0);
};

// Busted: the PD takes Milo in. Bail, then back on the street at Sunfield.
let bustT = 0;
G.onBusted = () => {
  if (G.state !== 'playing') return;
  G.state = 'busted';
  const bail = Math.min(G.world.cash, 200);
  G.world.cash -= bail;
  G.police.clear();
  G.hud.showBusted(true, bail);
  bustT = 2.5;
};

// Wasted: Milo goes down. The clinic patches him up for a fee.
let wasteT = 0;
function onWasted() {
  if (G.state !== 'playing') return;
  G.state = 'wasted';
  const fee = Math.min(G.world.cash, 100);
  G.world.cash -= fee;
  G.police.clear();
  G.hud.showWasted(true);
  wasteT = 2.5;
}


// Entering and leaving a car.
function enterCar(car) {
  if (G.world.inCar) return;
  const parked = G.traffic.parked.indexOf(car);
  if (parked !== -1) G.traffic.parked.splice(parked, 1);
  const driving = G.traffic.cars.indexOf(car);
  if (driving !== -1) G.traffic.cars.splice(driving, 1);
  G.world.inCar = true;
  G.world.playerCar = car;
  G.world.playerSpeed = 0;
  car.sync();
}

function exitCar() {
  if (!G.world.inCar || !G.world.playerCar) return;
  const car = G.world.playerCar;
  G.traffic.addParkedCar(car);
  G.world.inCar = false;
  G.world.playerCar = null;
  G.world.playerSpeed = 0;
  // Step out beside the car.
  G.player.setPosition(car.x + 4, car.z + 3, car.angle + Math.PI / 2);
  G.player.syncMesh();
}

function nearestTrafficCar(px, pz, maxD) {
  let best = null;
  let bestD = maxD * maxD;
  for (const car of G.traffic.cars) {
    const d = dist2(px, pz, car.x, car.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

// The E key: heist crack is handled by the hold below; everything else is
// an instant action. In a car, the chop-shop comes first, then stepping out.
function onInteract() {
  if (G.state === 'shop') {
    G.shops.closeShop();
    return;
  }
  if (G.state !== 'playing') return;
  const px = G.world.playerX;
  const pz = G.world.playerZ;
  if (G.missions.active && G.missions.active.def.id === 8) {
    const t = G.missions.target();
    if (t && dist2(px, pz, t.x, t.z) < 10) return; // The hold cracks it.
  }
  if (G.world.inCar) {
    if (G.missions.chopshop()) return;
    exitCar();
    return;
  }
  // Points of interest come first: a car driving past the mart must not
  // steal the keypress meant for the shop, the safehouse or the loft.
  if (dist2(px, pz, POINTS.mart.x, POINTS.mart.z) < 6) {
    G.shops.openShop();
    return;
  }
  if (dist2(px, pz, POINTS.safehouse.x, POINTS.safehouse.z) < 6) {
    G.shops.rest();
    return;
  }
  if (dist2(px, pz, POINTS.loft.x, POINTS.loft.z) < 6) {
    G.shops.loft();
    return;
  }
  const parked = G.traffic.nearestParked(px, pz, 5);
  const moving = parked || nearestTrafficCar(px, pz, 5);
  if (moving) {
    enterCar(moving);
    return;
  }
}

// Keyboard input.
const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  KeyE: 'e',
};
window.addEventListener('keydown', (ev) => {
  if (ev.repeat) return;
  if (ev.code === 'KeyR') {
    G.audio.cycleStation();
    return;
  }
  if (ev.code === 'KeyE') {
    G.input.e = true;
    onInteract();
    return;
  }
  const k = KEYMAP[ev.code];
  if (k) {
    G.input[k] = true;
    ev.preventDefault();
  }
});
window.addEventListener('keyup', (ev) => {
  const k = KEYMAP[ev.code];
  if (k) G.input[k] = false;
});

// Click to shoot, from the centre of the screen out.
renderer.domElement.addEventListener('mousedown', (ev) => {
  if (G.state !== 'playing') return;
  G.player.shoot();
});


// The camera: behind Milo on foot, behind the car while driving, and a slow
// orbit over the city on the menu.
let camYaw = 0;
let camDist = 10;
let camHeight = 5;
function updateCamera(dt) {
  let targetX = G.world.playerX;
  let targetZ = G.world.playerZ;
  let yaw;
  let dist = 10;
  let height = 5;
  if (G.state === 'menu') {
    const t = performance.now() / 1000;
    targetX = 0;
    targetZ = 0;
    camera.position.set(Math.sin(t * 0.05) * 190, 110, Math.cos(t * 0.05) * 190);
    camera.lookAt(0, 0, 0);
    return;
  }
  if (G.world.inCar && G.world.playerCar) {
    yaw = G.world.playerCar.angle;
    dist = 13;
    height = 6.5;
  } else {
    yaw = G.player.angle;
  }
  camYaw += (yaw - camYaw) * Math.min(1, dt * 3);
  camDist += (dist - camDist) * Math.min(1, dt * 3);
  camHeight += (height - camHeight) * Math.min(1, dt * 3);
  const bx = targetX - Math.sin(camYaw) * camDist;
  const bz = targetZ - Math.cos(camYaw) * camDist;
  camera.position.x += (bx - camera.position.x) * Math.min(1, dt * 6);
  camera.position.y += (camHeight - camera.position.y) * Math.min(1, dt * 6);
  camera.position.z += (bz - camera.position.z) * Math.min(1, dt * 6);
  camera.lookAt(targetX + Math.sin(camYaw) * 5, 1.5, targetZ + Math.cos(camYaw) * 5);
}

let ready = false;
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dtMs = now - last;
  last = now;
  const dt = Math.min(0.25, dtMs / 1000);
  const rawDt = Math.min(1.0, dtMs / 1000);

  if (G.state === 'menu') {
    G.traffic.update(dt);
    G.peds.update(dt, G.world.playerX, G.world.playerZ, G.world.inCar);
    G.city.update(dt, now / 1000);
    updateCamera(dt);
  } else if (G.state === 'playing') {
    // Movement: driving or on foot.
    if (G.world.inCar && G.world.playerCar) {
      const speed = drivePlayerCar(G.world.playerCar, G.input, dt, G.city);
      G.world.playerSpeed = speed;
      G.world.playerX = G.world.playerCar.x;
      G.world.playerZ = G.world.playerCar.z;
      G.player.x = G.world.playerCar.x;
      G.player.z = G.world.playerCar.z;
      G.player.angle = G.world.playerCar.angle;
    } else {
      G.player.move(G.input, dt, camYaw);
      G.world.playerX = G.player.x;
      G.world.playerZ = G.player.z;
      G.world.playerSpeed = 0;
    }
    G.traffic.update(dt);
    G.peds.update(dt, G.world.playerX, G.world.playerZ, G.world.inCar);
    G.police.update(dt, rawDt, G.world.playerX, G.world.playerZ, G.world.inCar, G.onBusted);
    G.missions.update(dt, rawDt);
    // Holding E cracks the heist.
    if (G.input.e) G.missions.holdE(rawDt);
    G.city.update(dt, now / 1000);
    G.audio.engine(G.world.playerSpeed, G.world.inCar);
    if (G.player.health <= 0) onWasted();
    updateCamera(dt);
    G.hud.update(rawDt);
  } else if (G.state === 'busted') {
    bustT -= rawDt;
    G.hud.update(rawDt);
    if (bustT <= 0) {
      G.hud.showBusted(false);
      G.player.setPosition(POINTS.safehouse.x, POINTS.safehouse.z, 0);
      G.world.playerX = G.player.x;
      G.world.playerZ = G.player.z;
      G.state = 'playing';
      G.hud.notify('You posted bail. Back on the street.');
    }
  } else if (G.state === 'wasted') {
    wasteT -= rawDt;
    G.hud.update(rawDt);
    if (wasteT <= 0) {
      G.hud.showWasted(false);
      G.player.setPosition(POINTS.safehouse.x, POINTS.safehouse.z, 0);
      G.player.heal(100);
      G.world.playerX = G.player.x;
      G.world.playerZ = G.player.z;
      G.state = 'playing';
      G.hud.notify('The clinic patched you up.');
    }
  } else if (G.state === 'shop') {
    G.hud.update(rawDt);
  }

  renderer.render(scene, camera);
  if (!ready) {
    ready = true;
    if (SHOT) stageShot(SHOT);
  }
}

// Staged shots: ?shot=heli|shop|heist|radio|chase|street|mission|dusk.
function stageShot(shot) {
  if (shot === 'shop') {
    G.player.setPosition(POINTS.mart.x + 4, POINTS.mart.z, 0);
    G.world.playerX = G.player.x;
    G.world.playerZ = G.player.z;
    G.state = 'playing';
    G.shops.openShop();
    return;
  }
  if (shot === 'heist') {
    G.player.setPosition(120, 80, 0);
    G.world.playerX = 120;
    G.world.playerZ = 80;
    G.missions.start(8);
    G.police.addHeat(700);
    G.state = 'playing';
    return;
  }
  if (shot === 'heli') {
    G.player.setPosition(0, 0, 0);
    G.world.playerX = 0;
    G.world.playerZ = 0;
    G.police.addHeat(950);
    G.state = 'playing';
    return;
  }
  if (shot === 'radio') {
    G.audio.setStation(1);
    const car = createCar(scene, 'comet', 0, 0, 0);
    G.traffic.addParkedCar(car);
    enterCar(car);
    G.state = 'playing';
    return;
  }
  if (shot === 'chase') {
    const car = createCar(scene, 'comet', 0, 0, 0);
    G.traffic.addParkedCar(car);
    enterCar(car);
    G.police.addHeat(500);
    G.state = 'playing';
    return;
  }
  if (shot === 'mission') {
    G.player.setPosition(0, 40, 0);
    G.world.playerX = 0;
    G.world.playerZ = 40;
    G.missions.start(0);
    G.state = 'playing';
    return;
  }
  if (shot === 'dusk') {
    scene.fog.color.setHex(0xd98a4a);
    scene.background.setHex(0xe8a05c);
    G.player.setPosition(0, 0, 0);
    G.world.playerX = 0;
    G.world.playerZ = 0;
    G.state = 'playing';
    return;
  }
  // street (default): Milo on foot downtown.
  G.player.setPosition(0, 0, 0);
  G.world.playerX = 0;
  G.world.playerZ = 0;
  G.state = 'playing';
}

// The handle the playtest reads.
window.__solmar = {
  get ready() {
    return ready;
  },
  get state() {
    return G.state;
  },
  world: G.world,
  police: G.police,
  player: G.player,
  missions: G.missions,
  points: POINTS,
  get shopOpen() {
    return G.shops.open;
  },
  get station() {
    return G.audio.stationName;
  },
  get heli() {
    return G.police.heli;
  },
};

requestAnimationFrame(loop);
