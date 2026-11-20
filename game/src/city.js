// city.js — builds coastal Solmar: the road grid, four districts, the beach
// and the ocean, plus the buildings, lights and palms that fill it. It also
// owns the points of interest the rest of the game navigates to.
import * as THREE from 'three';
import { rand, randInt, pick, clamp } from './utils.js';

export const MAP = {
  min: -250,
  max: 250,
  oceanX: 235,
  beachX: 208,
  roadStep: 40,
  roadHalf: 6,
};

// Points of interest, all on road intersections or open ground so the player
// and the cars can always reach them.
export const POINTS = {
  mart: { x: 200, z: 80 },
  safehouse: { x: -160, z: -160 },
  loft: { x: -40, z: 200 },
  pdhq: { x: 160, z: 160 },
  chopshop: { x: 200, z: -120 },
  escape: { x: -120, z: 222 },
};

const ROAD_LINES = [];
for (let v = -240; v <= 240; v += 40) ROAD_LINES.push(v);

function lambert(color, emissive = 0x000000) {
  return new THREE.MeshLambertMaterial({ color, emissive });
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export function createCity(scene) {
  const group = new THREE.Group();
  group.name = 'solmar-city';
  scene.add(group);

  // Ground: sun-baked grass and concrete under the whole city.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 560),
    lambert(0x8a9a5b),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  group.add(ground);

  // Beach: a pale sand strip along the east edge, before the water.
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 560),
    lambert(0xe8d8a0),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(221, 0, 0);
  group.add(beach);

  // Ocean: a wide blue plane east of the beach, gently animated.
  const oceanMat = new THREE.MeshLambertMaterial({ color: 0x1e6f9e });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(320, 560), oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(396, -0.4, 0);
  group.add(ocean);

  // Roads: dark asphalt strips on every grid line, both directions.
  const roadMat = lambert(0x2e2e33);
  const lineMat = lambert(0xd8c95a);
  for (const v of ROAD_LINES) {
    const along = new THREE.Mesh(new THREE.PlaneGeometry(500, 12), roadMat);
    along.rotation.x = -Math.PI / 2;
    along.position.set(0, 0.02, v);
    group.add(along);
    const across = new THREE.Mesh(new THREE.PlaneGeometry(12, 500), roadMat);
    across.rotation.x = -Math.PI / 2;
    across.position.set(v, 0.02, 0);
    group.add(across);
    // Dashed centre lines down the middle of each road.
    for (let s = -240; s <= 240; s += 24) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 6), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(s, 0.05, v);
      group.add(dash);
      const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.2), lineMat);
      dash2.rotation.x = -Math.PI / 2;
      dash2.position.set(v, 0.05, s);
      group.add(dash2);
    }
  }

  // Buildings: one InstancedMesh of boxes, one per block, coloured by district.
  // The beach strip and the water stay clear, and nothing is built near a POI.
  const footprints = [];
  const spots = [];
  const palette = {
    downtown: [0x9fb4c8, 0xb8c4cc, 0x8fa3b5, 0xc8b89f],
    sunfield: [0xe8d8b0, 0xd8c8a8, 0xf0e0c0, 0xc8b8a0],
    marina: [0xf0e8d8, 0xe0d0b8, 0xd8e8e0, 0xc8d8e8],
    coral: [0xe8c8b8, 0xd8b8c8, 0xf0d8c0, 0xc8b8d8],
    mixed: [0xd8c8b0, 0xc8c0a8, 0xe0d8c8, 0xb8c8b8],
  };
  function districtAt(x, z) {
    if (Math.abs(x) < 90 && Math.abs(z) < 90) return 'downtown';
    if (x < 0 && z < 0) return 'sunfield';
    if (x > 110) return 'marina';
    if (z > 110) return 'coral';
    return 'mixed';
  }
  function nearPoi(x, z, r) {
    for (const k of Object.keys(POINTS)) {
      const p = POINTS[k];
      const dx = x - p.x;
      const dz = z - p.z;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }
  for (let ix = 0; ix < ROAD_LINES.length - 1; ix++) {
    for (let iz = 0; iz < ROAD_LINES.length - 1; iz++) {
      const x0 = ROAD_LINES[ix] + MAP.roadHalf + 2;
      const x1 = ROAD_LINES[ix + 1] - MAP.roadHalf - 2;
      const z0 = ROAD_LINES[iz] + MAP.roadHalf + 2;
      const z1 = ROAD_LINES[iz + 1] - MAP.roadHalf - 2;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      if (cx > 198) continue; // beach and water stay open
      if (nearPoi(cx, cz, 30)) continue;
      const d = districtAt(cx, cz);
      const tall = d === 'downtown';
      const w = rand(12, 22);
      const dep = rand(12, 22);
      const h = tall ? rand(24, 64) : rand(9, 24);
      spots.push({ x: cx + rand(-3, 3), z: cz + rand(-3, 3), w, d: dep, h, color: pick(palette[d]) });
      footprints.push({ x: cx, z: cz, hw: w / 2 + 1, hd: dep / 2 + 1 });
    }
  }
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const bmat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const inst = new THREE.InstancedMesh(unitBox, bmat, spots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const col = new THREE.Color();
  spots.forEach((s, i) => {
    pos.set(s.x, s.h / 2, s.z);
    sc.set(s.w, s.h, s.d);
    m4.compose(pos, q, sc);
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, col.setHex(s.color));
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  group.add(inst);

  // Landmark buildings at the points of interest, each in its own colour.
  function landmark(x, z, w, h, d, color) {
    const m = box(w, h, d, lambert(color), x, h / 2, z);
    group.add(m);
    footprints.push({ x, z, hw: w / 2 + 1, hd: d / 2 + 1 });
    return m;
  }
  landmark(POINTS.mart.x + 14, POINTS.mart.z, 26, 10, 18, 0x2e8b8b);
  landmark(POINTS.safehouse.x - 12, POINTS.safehouse.z, 16, 8, 14, 0xe8a860);
  landmark(POINTS.loft.x + 12, POINTS.loft.z, 20, 26, 16, 0xc86a8a);
  landmark(POINTS.pdhq.x + 14, POINTS.pdhq.z, 24, 22, 18, 0x4a6a8a);
  landmark(POINTS.chopshop.x + 14, POINTS.chopshop.z, 24, 9, 18, 0x8a6a4a);

  // Streetlights at the big intersections.
  const poleMat = lambert(0x3a3a3a);
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xffe9a0, emissive: 0xffdf80 });
  for (let x = -160; x <= 160; x += 80) {
    for (let z = -160; z <= 160; z += 80) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 7, 6), poleMat);
      pole.position.set(x + 8, 3.5, z + 8);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), lampMat);
      lamp.position.set(x + 8, 7.2, z + 8);
      group.add(lamp);
    }
  }

  // Palms along the beach and a few in the plazas.
  const trunkMat = lambert(0x8a6a4a);
  const leafMat = lambert(0x2e8b4a);
  for (let z = -220; z <= 220; z += 40) {
    const tx = 204 + rand(-2, 2);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 9, 6), trunkMat);
    trunk.position.set(tx, 4.5, z);
    group.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(3.2, 4, 7), leafMat);
    crown.position.set(tx, 10.5, z);
    group.add(crown);
  }

  // Floating markers above the points of interest, so the player can find them.
  const markerMat = new THREE.MeshLambertMaterial({ color: 0xffd23e, emissive: 0xaa8800 });
  const markers = [];
  for (const k of ['mart', 'safehouse', 'loft', 'chopshop']) {
    const p = POINTS[k];
    const mk = new THREE.Mesh(new THREE.OctahedronGeometry(1.6), markerMat);
    mk.position.set(p.x, 7, p.z);
    group.add(mk);
    markers.push(mk);
  }

  // A warm late-afternoon sun and a soft sky fill.
  const sun = new THREE.DirectionalLight(0xffe0b0, 1.6);
  sun.position.set(180, 260, 120);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x9db8d8, 0.85));
  scene.fog = new THREE.Fog(0xc8d8e8, 320, 620);

  function randomRoadPoint() {
    const along = pick(ROAD_LINES);
    const cross = rand(-240, 240);
    if (Math.random() < 0.5) return { x: along, z: Math.round(cross / 40) * 40 + rand(-4, 4) };
    return { x: Math.round(cross / 40) * 40 + rand(-4, 4), z: along };
  }

  function resolveCollision(p, r) {
    for (const b of footprints) {
      const dx = p.x - b.x;
      const dz = p.z - b.z;
      const px = b.hw + r - Math.abs(dx);
      const pz = b.hd + r - Math.abs(dz);
      if (px > 0 && pz > 0) {
        if (px < pz) p.x = b.x + (dx > 0 ? b.hw + r : -(b.hw + r));
        else p.z = b.z + (dz > 0 ? b.hd + r : -(b.hd + r));
      }
    }
  }

  function clampToMap(x, z) {
    return {
      x: clamp(x, MAP.min, 232),
      z: clamp(z, MAP.min, MAP.max),
    };
  }

  return {
    group,
    points: POINTS,
    ocean,
    footprints,
    randomRoadPoint,
    resolveCollision,
    clampToMap,
    update(dt, t) {
      oceanMat.color.setHSL(0.58, 0.55, 0.32 + Math.sin(t * 0.4) * 0.03);
      for (let i = 0; i < markers.length; i++) {
        markers[i].position.y = 7 + Math.sin(t * 2 + i) * 0.8;
        markers[i].rotation.y = t * 1.5 + i;
      }
    },
  };
}
