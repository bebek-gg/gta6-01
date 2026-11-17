// main.js — SOLMAR boot, game loop, camera, input, crime hooks and ?shot= staging.
// A complete open-world crime game: on-foot and driving, traffic, pedestrians,
// police and a wanted system, five story missions, a HUD with minimap, saves,
// and procedural WebAudio. Everything here is original; the city is Solmar.
import * as THREE from 'three';
import { buildCity, LANDMARKS } from './city.js';
import { Traffic, makeCar, placeCar, drivePlayerCar } from './vehicles.js';
import { Pedestrians } from './pedestrians.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { saveGame, loadGame, clearSave } from './save.js';
import { clamp, damp, dist2, fmtCash } from './utils.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);

const city = buildCity(scene);
const traffic = new Traffic(scene, city);
const peds = new Pedestrians(scene, city);
const player = new Player(scene);
const police = new Police(scene, city);
const hud = new HUD();
const audio = new AudioEngine();

const world = {
  city, traffic, peds, police, hud, audio,
  cash: 200, playerX: 0, playerZ: 0, playerHeading: 0, playerSpeed: 0,
  inCar: false, playerCar: null, chopOffer: null, nextJobIn: 0,
  onAssault: (x, z) => { police.addHeat(140, 'assault'); peds.scare(x, z, 30); },
  onCrash: (speed) => { if (speed > 16) police.addHeat(40, 'reckless'); },
  onShootCar: () => { police.addHeat(90, 'shooting'); },
  onBusted: () => busted('BUSTED', 'The Solmar PD caught up with you. Bail cost 10% of your cash — the city is still yours to take.'),
  onRam: () => hurtPlayer(15),
  onCarWrecked: () => { hud.toast('Your ride is wrecked!'); forceExitCar(); },
  removePlayerCar: () => { if (world.playerCar) { scene.remove(world.playerCar.group); world.playerCar = null; world.inCar = false; } },
  saveGame: () => doSave(),
};
const missions = new Missions(scene, world);
world.missions = missions;

// cash pickups scattered around town
const pickups = [];
{
  const spots = [[-148, -37], [37, -111], [111, 111], [-37, 37], [185, 37], [-111, 185], [37, -185], [-185, -37]];
  const mat = new THREE.MeshStandardMaterial({ color: 0x2aff7a, emissive: 0x18c85a, emissiveIntensity: 1.2 });
  for (const [x, z] of spots) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mat);
    m.position.set(x, 1, z); m.castShadow = true;
    scene.add(m);
    pickups.push({ mesh: m, x, z, value: 50 + Math.floor(Math.random() * 100), respawn: 0 });
  }
}

// --- input ---
const keys = {};
let dragging = false, lastX = 0, lastY = 0, moved = 0, lastDrag = -10;
let camYaw = Math.PI, camPitch = 0.32;
addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  keys[e.code] = true;
  if (e.code === 'KeyP') togglePause();
  if (e.code === 'KeyM') { audio.ensure(); audio.setMuted(!audio.muted); hud.toast(audio.muted ? 'Sound muted' : 'Sound on'); }
  if (e.code === 'KeyC') { camYaw = player.heading + Math.PI; }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('pointerdown', (e) => { dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY; });
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  moved += Math.abs(dx) + Math.abs(dy);
  lastX = e.clientX; lastY = e.clientY;
  camYaw -= dx * 0.005;
  camPitch = clamp(camPitch + dy * 0.004, 0.12, 0.9);
  lastDrag = performance.now() / 1000;
});
addEventListener('pointerup', () => {
  if (dragging && moved < 6 && state === 'playing' && player.armed && !world.inCar) {
    player.shoot(camera, world);
  }
  dragging = false;
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- state ---
let state = 'title';
let timeSec = 0;
let hurtCd = 0, carHitCd = 0;
let exitCd = 0;
const clock = new THREE.Clock();

function hurtPlayer(n) {
  if (hurtCd > 0 || state !== 'playing') return;
  hurtCd = 1;
  player.health = Math.max(0, player.health - n);
  hud.setHealth(player.health);
  if (player.health <= 0) busted('WASTED', 'Milo went down. The hospital patched him up — for 10% of his cash.');
}
function busted(title, text) {
  if (state !== 'playing') return;
  state = 'busted';
  const lost = Math.floor(world.cash * 0.1);
  world.cash -= lost;
  police.clear();
  player.health = 100; hud.setHealth(100);
  hud.setBusted(title, text + ' Lost ' + fmtCash(lost) + '.');
  hud.show('busted');
  audio.sirenStop(); audio.engineStop();
  if (world.playerCar) { scene.remove(world.playerCar.group); world.playerCar = null; world.inCar = false; }
  player.setPosition(LANDMARKS.hospital.x, LANDMARKS.hospital.z, 0);
  player.group.visible = true;
  doSave();
}
function doSave() {
  return saveGame({
    cash: world.cash, missionIndex: missions.storyDone ? 99 : missions.index,
    storyDone: missions.storyDone, playerX: player.x, playerZ: player.z, armed: player.armed,
  });
}
function newGame() {
  clearSave();
  world.cash = 200;
  missions.index = 0; missions.active = null; missions.storyDone = false;
  police.clear();
  player.health = 100; player.armed = false;
  player.setPosition(-160, 160, 0);
  if (world.playerCar) { scene.remove(world.playerCar.group); world.playerCar = null; world.inCar = false; }
  hud.setCash(world.cash); hud.setHealth(100); hud.setWanted(0);
  hud.setObjective('FIRST WHEELS', 'Steal a car and bring it to Cleo\u2019s Garage.');
  startPlaying();
}
function startPlaying() {
  state = 'playing';
  hud.hide('title'); hud.hide('pause'); hud.hide('busted');
  audio.ensure(); audio.engineStart();
  hud.announce('SOLMAR — explore the city, steal a car, run jobs for Cleo Vane.');
}
function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    hud.setPauseStats('Cash ' + fmtCash(world.cash) + '  ·  Job ' + (missions.storyDone ? 'story complete' : (missions.index + 1) + ' of 5') + '  ·  Wanted ' + police.stars + '★');
    hud.show('pause');
  } else if (state === 'paused') startPlaying();
}

// --- car enter / steal / sell ---
function tryEnterCar() {
  const near = traffic.nearestParked(player.x, player.z, 4) || traffic.nearestTraffic(player.x, player.z, 4);
  if (!near) return false;
  if (near.parked) {
    traffic.parked = traffic.parked.filter((c) => c !== near);
    police.addHeat(80, 'stolen parked car');
  } else {
    police.addHeat(150, 'grand theft auto');
    hud.toast('Car jacked! The owner ran for it.');
    peds.scare(near.x, near.z, 20);
  }
  near.isPlayer = true;
  world.playerCar = near; world.inCar = true;
  player.group.visible = false;
  audio.engineStart();
  hud.setCrosshair(false);
  return true;
}
function forceExitCar() {
  if (!world.playerCar) return;
  const car = world.playerCar;
  car.isPlayer = false; car.speed = 0;
  world.playerCar = null; world.inCar = false;
  player.setPosition(car.x + 2.5, car.z + 2.5, car.heading);
  player.group.visible = true;
  audio.engineStop();
}
function sellCar() {
  const car = world.playerCar;
  const price = { comet: 320, sunrunner: 180, hauler: 150, taxi: 120, cruiser: 0 }[car.model] || 150;
  if (price <= 0) { hud.toast('Cleo: "I don\u2019t fence cop cars, Milo."'); return; }
  world.cash += price;
  hud.toast('Sold the ' + car.name + ' for ' + fmtCash(price) + '.');
  hud.setCash(world.cash);
  audio.pickup();
  scene.remove(car.group);
  world.playerCar = null; world.inCar = false;
  player.setPosition(LANDMARKS.garage.x + 8, LANDMARKS.garage.z + 4, 0);
  player.group.visible = true;
  audio.engineStop();
  doSave();
}

// --- shot staging (deterministic scenarios for screenshots) ---
function stageShot(name) {
  const comet = () => {
    const car = makeCar('comet', 0xd21f2b);
    scene.add(car.group);
    return car;
  };
  if (name === 'chase') {
    const car = comet();
    placeCar(car, 148, 60, 0);
    car.speed = 26; car.isPlayer = true;
    world.playerCar = car; world.inCar = true;
    player.group.visible = false;
    player.x = car.x; player.z = car.z; player.heading = 0;
    police.addHeat(500, 'shot');
    police.spawnCar(148, 20); police.spawnCar(140, 110);
    missions.start(1);
    missions.timer = 120;
  } else if (name === 'street') {
    // on foot at the Neon Strip kerb, looking down a busy boulevard
    player.setPosition(138, 100, Math.PI / 2);
    missions.start(0);
    const lane = [[144.5, 112], [151.5, 132], [144.5, 152]];
    for (let i = 0; i < 3; i++) {
      // static parked props for the shot (NOT traffic.cars: they have no route)
      const c = makeCar(i === 0 ? 'taxi' : 'sunrunner', 0);
      scene.add(c.group);
      placeCar(c, lane[i][0], lane[i][1], 0);
      traffic.parked.push(c);
    }
  } else if (name === 'mission') {
    // bank job: getaway car on the road by the Coral Bank, PD closing in
    const car = makeCar('sunrunner', 0x3a6fd2);
    scene.add(car.group);
    placeCar(car, 148, -168, 0);
    car.isPlayer = true;
    world.playerCar = car; world.inCar = true;
    player.group.visible = false;
    player.x = car.x; player.z = car.z; player.heading = 0;
    player.armed = true;
    missions.start(4);
    missions.stage = 1;
    police.addHeat(700, 'shot');
    police.spawnCar(148, -138); police.spawnCar(148, -196);
  } else { // dusk: beach cruise
    const car = comet();
    placeCar(car, -222, -40, 0);
    car.speed = 22; car.isPlayer = true;
    world.playerCar = car; world.inCar = true;
    player.group.visible = false;
    player.x = car.x; player.z = car.z; player.heading = 0;
    police.addHeat(150, 'shot');
    police.spawnCar(-222, -90);
    hud.setObjective('FREE ROAM', 'Cruise the beach road. The ocean, the palms, the whole coast.');
  }
  camYaw = player.heading + Math.PI;
  // snap the camera behind the player now, so the first frame is already framed
  camera.position.set(
    player.x + Math.sin(camYaw) * (world.inCar ? 13 : 9.5),
    (world.inCar ? 5.2 : 4.4) + Math.sin(camPitch) * 4,
    player.z + Math.cos(camYaw) * (world.inCar ? 13 : 9.5),
  );
  camera.lookAt(player.x - Math.sin(camYaw) * 6, 1.6, player.z - Math.cos(camYaw) * 6);
  startPlaying();
}

// --- build the world ---
traffic.spawn(14);
peds.spawn(24);
player.setPosition(-160, 160, 0);
player.armed = false;
hud.setCash(world.cash);
hud.setHealth(100);
hud.setObjective('FIRST WHEELS', 'Steal a car and bring it to Cleo\u2019s Garage.');
const saved = loadGame();
if (saved) hud.el.btnContinue.style.display = 'inline-block';
hud.el.btnStart.onclick = () => { audio.ensure(); newGame(); };
hud.el.btnContinue.onclick = () => {
  audio.ensure();
  if (saved) {
    world.cash = saved.cash;
    player.armed = !!saved.armed;
    player.setPosition(saved.playerX || -160, saved.playerZ || 160, 0);
    hud.setCash(world.cash);
    if (saved.storyDone) { missions.storyDone = true; missions.index = 99; }
    else if (saved.missionIndex > 0) { missions.index = saved.missionIndex; }
    if (!missions.storyDone) missions.start(missions.index);
    startPlaying();
  }
};
hud.el.btnResume.onclick = () => startPlaying();
hud.el.btnRestart.onclick = () => { hud.hide('pause'); newGame(); };
hud.el.btnSave.onclick = () => { hud.toast(doSave() ? 'Game saved.' : 'Save failed.'); };
hud.el.btnBusted.onclick = () => { hud.hide('busted'); startPlaying(); };
if (SHOT) stageShot(SHOT);

// --- main loop ---
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now() / 1000;
  if (state !== 'playing') { renderer.render(scene, camera); return; }
  timeSec += dt;
  hurtCd = Math.max(0, hurtCd - dt);
  carHitCd = Math.max(0, carHitCd - dt);
  exitCd = Math.max(0, exitCd - dt);

  const input = {
    fwd: !!keys.KeyW, back: !!keys.KeyS,
    left: !!keys.KeyA, right: !!keys.KeyD,
    jump: !!keys.Space, sprint: !!keys.ShiftLeft || !!keys.ShiftRight,
  };
  // camera-relative move direction (on foot)
  const camFwd = { x: -Math.sin(camYaw), z: -Math.cos(camYaw) };
  const camRight = { x: -camFwd.z, z: camFwd.x };
  let mx = camFwd.x * ((input.fwd ? 1 : 0) - (input.back ? 1 : 0)) + camRight.x * ((input.right ? 1 : 0) - (input.left ? 1 : 0));
  let mz = camFwd.z * ((input.fwd ? 1 : 0) - (input.back ? 1 : 0)) + camRight.z * ((input.right ? 1 : 0) - (input.left ? 1 : 0));
  const mLen = Math.hypot(mx, mz);
  if (mLen > 1) { mx /= mLen; mz /= mLen; }

  if (world.inCar && world.playerCar) {
    const spd01 = drivePlayerCar(world.playerCar, input, dt, world);
    world.playerX = world.playerCar.x; world.playerZ = world.playerCar.z;
    world.playerHeading = world.playerCar.heading;
    world.playerSpeed = Math.abs(world.playerCar.speed);
    audio.engineSet(spd01, true);
    hud.setSpeed(Math.abs(world.playerCar.speed) * 3.6, world.playerCar.name);
    if (world.playerCar.health <= 0) world.onCarWrecked();
  } else {
    player.update(dt, { x: mx, z: mz, mag: Math.min(1, mLen) }, input.sprint, input.jump, world);
    world.playerX = player.x; world.playerZ = player.z;
    world.playerHeading = player.heading;
    world.playerSpeed = player.speed;
    audio.engineSet(0, false);
    hud.setSpeed(0, null);
    hud.setCrosshair(player.armed);
    // traffic can knock the player down
    if (carHitCd <= 0) {
      for (const c of traffic.cars) {
        if (Math.abs(c.speed) > 4 && dist2(player.x, player.z, c.x, c.z) < 1.8) {
          hurtPlayer(20); carHitCd = 1;
          player.x += Math.sin(player.heading) * -2; player.z += Math.cos(player.heading) * -2;
          break;
        }
      }
    }
  }

  // E key: interact / enter / exit / sell
  if (keys.KeyE && exitCd <= 0) {
    exitCd = 0.35;
    if (world.inCar && world.chopOffer && !missions.active) sellCar();
    else if (world.inCar) forceExitCar();
    else if (missions.interact()) { /* hold handled below */ }
    else tryEnterCar();
  }
  if (keys.KeyF) player.punch(world);
  if (keys.KeyE && missions.interact()) {
    const p = missions.advanceHold(dt);
    const it = missions.interact();
    hud.prompt('<b>E</b> ' + (it ? it.label : '') + ' ' + Math.round(p * 100) + '%');
  } else if (!missions.interact()) {
    const near = !world.inCar && (traffic.nearestParked(player.x, player.z, 4) || traffic.nearestTraffic(player.x, player.z, 4));
    hud.prompt(near ? '<b>E</b> Steal the ' + near.name : (world.chopOffer && world.inCar ? '<b>E</b> Sell car to Cleo' : null));
  }

  // pickups
  for (const pk of pickups) {
    if (pk.respawn > 0) {
      pk.respawn -= dt;
      if (pk.respawn <= 0) pk.mesh.visible = true;
      continue;
    }
    pk.mesh.rotation.y += dt * 2;
    pk.mesh.position.y = 1 + Math.sin(timeSec * 2 + pk.x) * 0.25;
    if (dist2(world.playerX, world.playerZ, pk.x, pk.z) < 2.2) {
      world.cash += pk.value;
      hud.setCash(world.cash);
      hud.toast('Found ' + fmtCash(pk.value) + ' in cash.');
      audio.pickup();
      pk.mesh.visible = false;
      pk.respawn = 45;
    }
  }

  // next job countdown
  if (world.nextJobIn > 0 && !missions.active) {
    world.nextJobIn -= dt;
    if (world.nextJobIn <= 0 && !missions.storyDone) missions.start(missions.index);
  }

  traffic.update(dt, world);
  peds.update(dt, world);
  police.update(dt, world);
  missions.update(dt, world);
  city.update(dt, timeSec);

  // HUD
  hud.setCash(world.cash);
  hud.setWanted(police.stars);
  hud.setHealth(player.health);
  hud.drawMinimap(world);
  if (police.sirenOn) audio.sirenStart(); else audio.sirenStop();

  // camera: settle behind the player/car a while after the last drag
  if (now - lastDrag > 2.5) {
    let d = (world.playerHeading + Math.PI) - camYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    camYaw += clamp(d, -2.2 * dt, 2.2 * dt);
  }
  const dist = world.inCar ? 13 : 9.5;
  const height = world.inCar ? 5.2 : 4.4;
  const tx = world.playerX, tz = world.playerZ;
  const cx = tx + Math.sin(camYaw) * dist;
  const cz = tz + Math.cos(camYaw) * dist;
  const cy = height + Math.sin(camPitch) * 4;
  camera.position.set(
    damp(camera.position.x, cx, 6, dt),
    damp(camera.position.y, cy, 6, dt),
    damp(camera.position.z, cz, 6, dt),
  );
  camera.lookAt(tx - Math.sin(camYaw) * 6, 1.6, tz - Math.cos(camYaw) * 6);

  renderer.render(scene, camera);
}
animate();

// test handle for the playtest script
window.__solmar = {
  world, player, police, missions, traffic,
  get state() { return state; },
  start: () => { if (state === 'title') { hud.el.btnStart.click(); } },
  ready: true,
};
