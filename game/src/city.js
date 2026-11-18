// city.js — Palmshade City: procedural sun-soaked coastal city.
// Builds the ground (one big painted canvas: roads, dashes, sidewalks, sand),
// pastel art-deco buildings with lit windows, palm trees, street lights,
// a beach and the ocean. Exports the road network + building colliders that
// every other system (traffic, police, player, minimap) navigates by.
import * as THREE from 'three';

// ---- layout constants -------------------------------------------------
export const BLOCK = 40;          // city block size (units)
export const ROAD = 14;           // road width
export const PITCH = BLOCK + ROAD;
export const NBLK = 5;            // blocks per side
export const SPAN = NBLK * BLOCK + (NBLK + 1) * ROAD;   // 284
export const HALF = SPAN / 2;                           // 142
export const LANE = 3.4;          // lane offset from road centre

// road centre coordinates (6 roads each way)
export const ROADS = [];
for (let i = 0; i <= NBLK; i++) ROADS.push(-HALF + ROAD / 2 + i * PITCH);
// block centre coordinates (5 each way)
export const BLOCKS = [];
for (let i = 0; i < NBLK; i++) BLOCKS.push(-HALF + ROAD + BLOCK / 2 + i * PITCH);

export const BEACH_X = HALF + 4;        // sand starts here
export const OCEAN_X = HALF + 30;       // water starts here
export const WORLD_MIN = -HALF - 10;
export const WORLD_MAX_X = OCEAN_X + 6; // you can wade a little
export const WORLD_MAX_Z = HALF + 10;

// building colliders: {minX,maxX,minZ,maxZ}
export const colliders = [];

export function isOnRoad(x, z) {
  for (const r of ROADS) {
    if (Math.abs(x - r) < ROAD / 2 + 0.5) return true;
    if (Math.abs(z - r) < ROAD / 2 + 0.5) return true;
  }
  return false;
}

export function nearestRoadCoord(v) {
  let best = ROADS[0], bd = Infinity;
  for (const r of ROADS) { const d = Math.abs(v - r); if (d < bd) { bd = d; best = r; } }
  return best;
}

// a random point on a random road (for traffic / police spawns)
export function randomRoadPoint(rng) {
  const horiz = rng() < 0.5;
  const r = ROADS[Math.floor(rng() * ROADS.length)];
  const along = -HALF + rng() * SPAN;
  return horiz ? { x: along, z: r } : { x: r, z: along };
}

// a point on a sidewalk: edge of a random block
export function randomSidewalkPoint(rng) {
  const bx = BLOCKS[Math.floor(rng() * BLOCKS.length)];
  const bz = BLOCKS[Math.floor(rng() * BLOCKS.length)];
  const side = Math.floor(rng() * 4);
  const t = (rng() - 0.5) * (BLOCK - 4);
  const e = BLOCK / 2 + 2.2;
  if (side === 0) return { x: bx + t, z: bz - e };
  if (side === 1) return { x: bx + t, z: bz + e };
  if (side === 2) return { x: bx - e, z: bz + t };
  return { x: bx + e, z: bz + t };
}

export function collideAABBs(pos, radius) {
  // push a circle (pos.x,pos.z) out of every building AABB; returns impact speed factor lost
  let hit = false;
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = pos.x - c.minX, pr = c.maxX - pos.x, pt = pos.z - c.minZ, pb = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.minX - radius;
        else if (m === pr) pos.x = c.maxX + radius;
        else if (m === pt) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  return hit;
}

export function clampToWorld(pos) {
  pos.x = Math.max(WORLD_MIN, Math.min(WORLD_MAX_X, pos.x));
  pos.z = Math.max(-WORLD_MAX_Z, Math.min(WORLD_MAX_Z, pos.z));
}

// ---- canvas texture helpers -------------------------------------------
function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const PASTELS = ['#f7c8a0', '#f4a9b8', '#a8d8c8', '#f9e08a', '#b5c7e8', '#e8b4d8', '#ffd9b0', '#9fd4e8', '#f2b8a0', '#c5e3b8'];

function facadeTexture(rng, base) {
  return makeCanvas(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // art-deco vertical stripe
    g.fillStyle = 'rgba(255,255,255,0.20)';
    g.fillRect(w / 2 - 5, 0, 10, h);
    g.fillStyle = 'rgba(0,0,0,0.13)';
    g.fillRect(0, h - 14, w, 14);
    const cols = 4, rows = 9;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const lit = rng() < 0.42;
        g.fillStyle = lit ? '#ffd97a' : 'rgba(38,52,74,0.85)';
        g.fillRect(10 + i * 30, 14 + j * 26, 18, 15);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(10 + i * 30, 14 + j * 26, 18, 4);
      }
    }
  });
}

function groundTexture() {
  const S = 2048, EXT = 460; // plane is EXT x EXT centred on 0
  const px = (v) => ((v + EXT / 2) / EXT) * S;
  const sz = (v) => (v / EXT) * S;
  return makeCanvas(S, S, (g) => {
    // surround: warm scrub grass
    g.fillStyle = '#8fae5e'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#86a557';
    for (let i = 0; i < 900; i++) g.fillRect(Math.random() * S, Math.random() * S, 8, 8);
    // beach sand (east)
    g.fillStyle = '#f2dc9f';
    g.fillRect(px(BEACH_X - 2), 0, sz(EXT / 2 - BEACH_X + 4), S);
    g.fillStyle = '#ecd28d';
    for (let i = 0; i < 500; i++) g.fillRect(px(BEACH_X) + Math.random() * sz(60), Math.random() * S, 6, 6);
    // city base: concrete
    g.fillStyle = '#b9b3a4';
    g.fillRect(px(-HALF - 8), px(-HALF - 8), sz(SPAN + 16), sz(SPAN + 16));
    // block slabs (sidewalk)
    for (const bx of BLOCKS) for (const bz of BLOCKS) {
      g.fillStyle = '#cfc8b8';
      g.fillRect(px(bx - BLOCK / 2 - 2.5), px(bz - BLOCK / 2 - 2.5), sz(BLOCK + 5), sz(BLOCK + 5));
      g.fillStyle = '#c2bba8';
      g.fillRect(px(bx - BLOCK / 2), px(bz - BLOCK / 2), sz(BLOCK), sz(BLOCK));
    }
    // roads
    g.fillStyle = '#33333c';
    for (const r of ROADS) {
      g.fillRect(px(r - ROAD / 2), px(-HALF - 8), sz(ROAD), sz(SPAN + 16));
      g.fillRect(px(-HALF - 8), px(r - ROAD / 2), sz(SPAN + 16), sz(ROAD));
    }
    // centre dashes
    g.fillStyle = '#e8c85a';
    for (const r of ROADS) {
      for (let t = -HALF - 6; t < HALF + 6; t += 9) {
        g.fillRect(px(r - 0.35), px(t), sz(0.7), sz(4.4));
        g.fillRect(px(t), px(r - 0.35), sz(4.4), sz(0.7));
      }
    }
    // crosswalks at intersections
    g.fillStyle = 'rgba(240,240,235,0.75)';
    for (const rx of ROADS) for (const rz of ROADS) {
      for (let i = -2; i <= 2; i++) {
        g.fillRect(px(rx - ROAD / 2 + 1), px(rz + i * 2.6 - 0.8), sz(3), sz(1.6));
        g.fillRect(px(rx + ROAD / 2 - 4), px(rz + i * 2.6 - 0.8), sz(3), sz(1.6));
        g.fillRect(px(rx + i * 2.6 - 0.8), px(rz - ROAD / 2 + 1), sz(1.6), sz(3));
        g.fillRect(px(rx + i * 2.6 - 0.8), px(rz + ROAD / 2 - 4), sz(1.6), sz(3));
      }
    }
  });
}

// ---- build -------------------------------------------------------------
export function buildCity(scene, rng) {
  const group = new THREE.Group();
  scene.add(group);

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(460, 460),
    new THREE.MeshLambertMaterial({ map: groundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  group.add(ground);

  // ocean
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(340, 460),
    new THREE.MeshPhongMaterial({ color: 0x1f9db4, shininess: 160, specular: 0x99ddff }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(OCEAN_X + 168, -0.25, 0);
  group.add(ocean);
  // foam line
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 460),
    new THREE.MeshBasicMaterial({ color: 0xfdf6dd }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(OCEAN_X + 0.5, -0.06, 0);
  group.add(foam);

  // buildings
  const facades = PASTELS.map((p) => facadeTexture(rng, p));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x8d7f72 });
  const parkingBlocks = new Set(['1,3', '3,1']); // two blocks are parking lots / plaza
  for (let bi = 0; bi < NBLK; bi++) {
    for (let bj = 0; bj < NBLK; bj++) {
      const bx = BLOCKS[bi], bz = BLOCKS[bj];
      if (parkingBlocks.has(bi + ',' + bj)) continue;
      const n = 2 + Math.floor(rng() * 3); // 2-4 buildings per block
      const placed = [];
      for (let k = 0; k < n; k++) {
        const w = 11 + rng() * 9, d = 11 + rng() * 9;
        const hgt = 11 + rng() * rng() * 30;
        let x = bx, z = bz, ok = false;
        for (let tries = 0; tries < 8 && !ok; tries++) {
          x = bx + (rng() - 0.5) * (BLOCK - w - 3);
          z = bz + (rng() - 0.5) * (BLOCK - d - 3);
          ok = placed.every((p) => Math.abs(p.x - x) > (p.w + w) / 2 + 2 || Math.abs(p.z - z) > (p.d + d) / 2 + 2);
        }
        if (!ok) continue;
        placed.push({ x, z, w, d });
        const tex = facades[Math.floor(rng() * facades.length)];
        const side = new THREE.MeshLambertMaterial({ map: tex });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), [side, side, roofMat, roofMat, side, side]);
        mesh.position.set(x, hgt / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        // rooftop box detail
        if (rng() < 0.6) {
          const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 1.6, d * 0.4), roofMat);
          cap.position.set(x, hgt + 0.8, z);
          cap.castShadow = true;
          group.add(cap);
        }
      }
    }
  }

  // palm trees (instanced): trunk + squashed-cone canopy
  const palmSpots = [];
  for (const bx of BLOCKS) for (const bz of BLOCKS) {
    for (let i = 0; i < 3; i++) {
      palmSpots.push({ x: bx + (rng() - 0.5) * (BLOCK + 6), z: bz + (rng() - 0.5) * (BLOCK + 6) });
    }
  }
  for (let i = 0; i < 26; i++) palmSpots.push({ x: BEACH_X + 4 + rng() * 16, z: -HALF + rng() * SPAN });
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 5.4, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x9a7350 });
  const canGeo = new THREE.ConeGeometry(2.6, 1.5, 7);
  const canMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const cans = new THREE.InstancedMesh(canGeo, canMat, palmSpots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  palmSpots.forEach((p, i) => {
    const tilt = (rng() - 0.5) * 0.22;
    e.set(tilt, rng() * Math.PI, (rng() - 0.5) * 0.22);
    q.setFromEuler(e);
    v.set(p.x, 2.7, p.z);
    m4.compose(v, q, s);
    trunks.setMatrixAt(i, m4);
    v.set(p.x + tilt * -6, 5.6, p.z);
    const sc = 0.85 + rng() * 0.5;
    m4.compose(v, q, new THREE.Vector3(sc, sc * 0.55, sc));
    cans.setMatrixAt(i, m4);
  });
  trunks.castShadow = true; cans.castShadow = true;
  group.add(trunks, cans);

  // street lights (instanced poles + emissive heads)
  const lightSpots = [];
  for (const rx of ROADS) for (const rz of ROADS) {
    lightSpots.push({ x: rx + ROAD / 2 + 1.2, z: rz + ROAD / 2 + 1.2 });
    lightSpots.push({ x: rx - ROAD / 2 - 1.2, z: rz - ROAD / 2 - 1.2 });
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 5.6, 5);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x4a4a52 });
  const headGeo = new THREE.BoxGeometry(0.5, 0.22, 1.1);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffe6a3 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lightSpots.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, lightSpots.length);
  lightSpots.forEach((p, i) => {
    m4.compose(new THREE.Vector3(p.x, 2.8, p.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    poles.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(p.x, 5.6, p.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    heads.setMatrixAt(i, m4);
  });
  group.add(poles, heads);

  // Marisol's café — a landmark kiosk near spawn (visual anchor for missions)
  const cafe = new THREE.Group();
  const cafeBase = new THREE.Mesh(new THREE.BoxGeometry(9, 3.4, 7), new THREE.MeshLambertMaterial({ color: 0xff8c66 }));
  cafeBase.position.y = 1.7; cafeBase.castShadow = true;
  const cafeRoof = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.5, 8.4), new THREE.MeshLambertMaterial({ color: 0x2a9db5 }));
  cafeRoof.position.y = 3.65;
  const cafeSign = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.1, 0.3), new THREE.MeshBasicMaterial({ color: 0xffd94d }));
  cafeSign.position.set(0, 4.4, 0);
  cafe.add(cafeBase, cafeRoof, cafeSign);
  cafe.position.set(-124, 0, -124);
  cafe.rotation.y = Math.PI / 4;
  group.add(cafe);
  colliders.push({ minX: -128.5, maxX: -119.5, minZ: -128.5, maxZ: -119.5 });

  // warehouse landmark (mission destination, NE block)
  const wh = new THREE.Mesh(new THREE.BoxGeometry(24, 9, 18), new THREE.MeshLambertMaterial({ color: 0x7f96ad }));
  wh.position.set(112, 4.5, 112);
  wh.castShadow = true; wh.receiveShadow = true;
  group.add(wh);
  const whDoor = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 0.4), new THREE.MeshLambertMaterial({ color: 0x44586e }));
  whDoor.position.set(112, 3, 102.8);
  group.add(whDoor);
  colliders.push({ minX: 100, maxX: 124, minZ: 103, maxZ: 121 });

  return { group, ocean, foam };
}

// golden-hour sky: a big gradient dome drawn on a canvas
export function makeSky(scene) {
  const tex = makeCanvas(16, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#3f6fb5');
    grad.addColorStop(0.42, '#7fb0dd');
    grad.addColorStop(0.62, '#f7c873');
    grad.addColorStop(0.78, '#ff9e5e');
    grad.addColorStop(1, '#ff8a5c');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 20, 14),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(0xf7c489, 190, 720);
  return sky;
}
