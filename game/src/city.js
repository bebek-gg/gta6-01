// city.js — builds procedural Solmar: a sun-soaked coastal city on a road grid,
// four districts, a beach and ocean, props, landmarks, and the road graph
// traffic and missions drive on. Exports colliders (building AABBs) and landmarks.
import * as THREE from 'three';
import { mulberry32, pick, clamp } from './utils.js';

export const BLOCK = 60, ROAD = 14, PITCH = BLOCK + ROAD; // 74
export const GRID = 7; // roads per axis, at -222..222 step 74
export const CITY_MIN = -229, CITY_MAX = 229;
export const LANDMARKS = {
  garage: { x: -185, z: 185, label: "Cleo's Garage" },
  bank: { x: 185, z: -185, label: 'Coral Bank' },
  safehouse: { x: 37, z: 185, label: 'Safehouse' },
  docks: { x: -111, z: 222, label: 'Portside Docks' },
  shops: [
    { x: -185, z: -185, label: 'Marina Mart' },
    { x: -111, z: -185, label: 'Tackle & Bait' },
    { x: -185, z: -111, label: 'Sunset Deli' },
  ],
  delivery: { x: 185, z: -111, label: 'Coral Heights' },
  hospital: { x: -37, z: -185, label: 'Solmar General' },
  policeHQ: { x: 111, z: 37, label: 'Solmar PD HQ' },
};

function roadCoord(i) { return -222 + i * PITCH; }
function blockCenter(i) { return -185 + i * PITCH; }
export function districtOf(bx, bz) {
  if (bz < 3) return bx < 3 ? 'marina' : 'coral';
  return bx < 3 ? 'sunfield' : 'neon';
}
const DISTRICT = {
  marina: { h: [10, 20], colors: [0xf0c060, 0xe87a5a, 0x5ab8ac, 0xefe4cc], win: 'warm' },
  coral: { h: [40, 95], colors: [0xb8d4f0, 0x9abce8, 0xcfe0f5, 0xa8c4e0], win: 'glass' },
  neon: { h: [18, 46], colors: [0xa88fe0, 0xe08ab0, 0x7a9fe0, 0x6a6a8a], win: 'neon' },
  sunfield: { h: [6, 12], colors: [0xf2d89a, 0xd89a7a, 0xaac89a, 0xe4c8b0], win: 'warm' },
};

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function windowTexture(kind, base) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const rng = mulberry32(kind.length * 7919 + base.length);
    for (let y = 8; y < h - 8; y += 18) {
      for (let x = 8; x < w - 8; x += 16) {
        const lit = rng() < (kind === 'neon' ? 0.55 : kind === 'glass' ? 0.35 : 0.45);
        g.fillStyle = lit ? (kind === 'glass' ? '#cfe8ff' : '#ffd98a') : 'rgba(72,82,112,0.9)';
        g.fillRect(x, y, 10, 12);
      }
    }
  });
}

function groundTexture() {
  return canvasTexture(2048, 2048, (g, W, H) => {
    const sx = (x) => (x + 290) / 530 * W, sz = (z) => (z + 240) / 480 * H;
    g.fillStyle = '#41464f'; g.fillRect(0, 0, W, H); // asphalt base
    g.fillStyle = '#c2a878'; g.fillRect(0, sz(-240), sx(-229), H); // beach west
    g.fillStyle = '#3f7fb8'; g.fillRect(0, 0, sx(-272), H); // ocean strip
    g.fillStyle = '#767c88'; // sidewalks = block tops
    for (let bx = 0; bx < 6; bx++) for (let bz = 0; bz < 6; bz++) {
      g.fillRect(sx(blockCenter(bx) - 30), sz(blockCenter(bz) - 30), (60 / 530) * W, (60 / 480) * H);
    }
    g.fillStyle = '#3f8f5f'; // a park block
    g.fillRect(sx(7), sz(7), (60 / 530) * W, (60 / 480) * H);
    g.strokeStyle = '#e8c84a'; g.lineWidth = 3; g.setLineDash([26, 22]); // center dashes
    for (let i = 0; i < GRID; i++) {
      g.beginPath(); g.moveTo(sx(roadCoord(i)), 0); g.lineTo(sx(roadCoord(i)), H); g.stroke();
      g.beginPath(); g.moveTo(0, sz(roadCoord(i))); g.lineTo(W, sz(roadCoord(i))); g.stroke();
    }
    g.setLineDash([]);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 5; // crosswalks
    for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
      const x = sx(roadCoord(i)), z = sz(roadCoord(j));
      for (let k = -2; k <= 2; k++) {
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.fillRect(x - 22 + k * 9, z - 9, 5, 18);
        g.fillRect(x - 9, z - 22 + k * 9, 18, 5);
      }
    }
  });
}

function signTexture(text, fg, bg) {
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = 'bold 64px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  });
}

export function buildCity(scene) {
  const rng = mulberry32(20261118);
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'city';

  // lighting: warm late-afternoon sun
  const sun = new THREE.DirectionalLight(0xffe3b3, 3.1);
  sun.position.set(180, 260, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 700; sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0xa88a5e, 1.5));
  scene.fog = new THREE.Fog(0xf2c98f, 320, 900);
  scene.background = new THREE.Color(0x87b8dd);

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(530, 480),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-25, 0, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // ocean
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 560),
    new THREE.MeshStandardMaterial({ color: 0x2f7fb8, roughness: 0.25, metalness: 0.35 })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(-430, 0.4, 0);
  group.add(ocean);

  // buildings
  // near-white bases: the district colour multiplies the texture, so the
  // texture must stay light or the whole facade goes dark
  const winTex = {
    glass: windowTexture('glass', '#d8e8f8'),
    warm: windowTexture('warm', '#e8d8c0'),
    neon: windowTexture('neon', '#d8d0f0'),
  };
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.9 });
  for (let bx = 0; bx < 6; bx++) {
    for (let bz = 0; bz < 6; bz++) {
      const d = DISTRICT[districtOf(bx, bz)];
      const cx = blockCenter(bx), cz = blockCenter(bz);
      if (bx === 3 && bz === 3) { // central park
        const park = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 1.2, 12),
          new THREE.MeshStandardMaterial({ color: 0x4a8f5a, roughness: 1 }));
        park.position.set(cx, 0.6, cz); park.castShadow = true; group.add(park);
        for (let k = 0; k < 8; k++) group.add(makePalm(cx + (rng() - 0.5) * 44, cz + (rng() - 0.5) * 44, rng));
        continue;
      }
      const n = d.h[1] > 40 ? 1 : (rng() < 0.5 ? 1 : 4);
      const spots = n === 1 ? [[0, 0, 52, 52]] : [[-14, -14, 26, 26], [14, -14, 26, 26], [-14, 14, 26, 26], [14, 14, 26, 26]];
      for (const [ox, oz, w, dep] of spots) {
        const h = d.h[0] + rng() * (d.h[1] - d.h[0]);
        const mat = new THREE.MeshStandardMaterial({
          map: winTex[d.win], color: pick(rng, d.colors), roughness: 0.85,
        });
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, dep);
        b.position.set(cx + ox, h / 2, cz + oz);
        b.castShadow = true; b.receiveShadow = true;
        group.add(b);
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(w + 1, 1, dep + 1); roof.position.set(cx + ox, h + 0.5, cz + oz);
        group.add(roof);
        colliders.push({ minX: cx + ox - w / 2, maxX: cx + ox + w / 2, minZ: cz + oz - dep / 2, maxZ: cz + oz + dep / 2 });
      }
    }
  }

  // palms along the beach + lamps at intersections
  for (let z = -220; z <= 220; z += 28) group.add(makePalm(-238 + (rng() - 0.5) * 6, z + (rng() - 0.5) * 8, rng));
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.6, metalness: 0.6 });
  const lampGlow = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd23e, emissiveIntensity: 1.6 });
  for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
    if ((i + j) % 2) continue;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 6), lampMat);
    pole.position.set(roadCoord(i) + 8, 3.5, roadCoord(j) + 8); pole.castShadow = true; group.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), lampGlow);
    bulb.position.set(roadCoord(i) + 8, 7.2, roadCoord(j) + 8); group.add(bulb);
  }

  // billboards with original names
  const signs = [
    { text: 'SOLMAR', x: -222, z: -148, ry: Math.PI / 2, fg: '#ffd23e', bg: '#14204a' },
    { text: 'NEON STRIP', x: 148, z: 222, ry: Math.PI, fg: '#ff6ad5', bg: '#1a1030' },
    { text: "CLEO'S GARAGE", x: -185, z: 148, ry: 0, fg: '#7fd4ff', bg: '#20242e' },
    { text: 'CORAL BANK', x: 185, z: -148, ry: -Math.PI / 2, fg: '#ffe9a8', bg: '#0f2a1a' },
  ];
  for (const s of signs) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5),
      new THREE.MeshStandardMaterial({ map: signTexture(s.text, s.fg, s.bg), emissive: 0xffffff, emissiveMap: signTexture(s.text, s.fg, s.bg), emissiveIntensity: 0.55 }));
    m.position.set(s.x, 16, s.z); m.rotation.y = s.ry; group.add(m);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 13, 6), lampMat);
    post.position.set(s.x, 6.5, s.z); group.add(post);
  }

  // landmark beacons pads (garage / bank / safehouse / docks)
  const padMat = new THREE.MeshStandardMaterial({ color: 0xffd23e, emissive: 0xffb400, emissiveIntensity: 0.7 });
  for (const k of ['garage', 'bank', 'safehouse', 'docks']) {
    const p = LANDMARKS[k];
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.4, 20), padMat);
    pad.position.set(p.x, 0.2, p.z); group.add(pad);
  }

  scene.add(group);

  // road graph: 7x7 intersections
  const nodes = [];
  for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) nodes.push({ x: roadCoord(i), z: roadCoord(j), i, j });
  const nodeAt = (i, j) => (i < 0 || j < 0 || i >= GRID || j >= GRID) ? null : nodes[j * GRID + i];
  const neighbors = (n) => [nodeAt(n.i + 1, n.j), nodeAt(n.i - 1, n.j), nodeAt(n.i, n.j + 1), nodeAt(n.i, n.j - 1)].filter(Boolean);

  return {
    group, colliders, nodes, neighbors, ocean,
    bounds: { minX: -282, maxX: 236, minZ: -236, maxZ: 236 },
    update(dt, t) { ocean.position.y = 0.4 + Math.sin(t * 0.5) * 0.15; },
  };
}

function makePalm(x, z, rng) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 9, 6),
    new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 }));
  trunk.position.y = 4.5; trunk.castShadow = true; g.add(trunk);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f8f4a, roughness: 1 });
  for (let k = 0; k < 6; k++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 5, 4), leafMat);
    const a = (k / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.8, 9.6, Math.sin(a) * 1.8);
    leaf.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
    g.add(leaf);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rng() * Math.PI * 2;
  return g;
}

// circle vs building AABBs: returns corrected position (slide)
export function collideCircle(colliders, x, z, r) {
  for (const c of colliders) {
    const cx = clamp(x, c.minX, c.maxX), cz = clamp(z, c.minZ, c.maxZ);
    const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 0.0001) {
      const d = Math.sqrt(d2), push = (r - d) / d;
      x += dx * push; z += dz * push;
    } else if (d2 <= 0.0001) {
      // inside the box: push out along the smallest penetration axis
      const pl = x - (c.minX - r), pr = (c.maxX + r) - x, pt = z - (c.minZ - r), pb = (c.maxZ + r) - z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) x = c.minX - r; else if (m === pr) x = c.maxX + r;
      else if (m === pt) z = c.minZ - r; else z = c.maxZ + r;
    }
  }
  return { x, z };
}
