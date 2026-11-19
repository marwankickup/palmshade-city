// city.js — Palmshade City itself: sky, sun, ground painting, two districts of
// buildings with canvas facades, landmarks (Café Marisol, warehouse, police
// station, parking garage), marina + boats, beach and street props, palms,
// streetlights, and the collision/ground-height data every mover uses.

import * as THREE from 'three';
import { ROADS_X, ROADS_Z, ROAD_W, SAND_Z, WATER_Z, mulberry32, randRange, pick, clamp } from './util.js';

const BLOCK_X = [[-186, -157], [-143, -97], [-83, -37], [-23, 23], [37, 83], [97, 143], [157, 186]];
const BLOCK_Z = [[-173, -147], [-133, -87], [-73, -27], [-13, 33], [47, 93]];

function canvasTex(w, h, draw, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---- facade texture variants (colour map + emissive windows map) ----
function makeFacade(rng, base, win, litRatio, cols, rows, tower) {
  const map = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(0, h - 14, w, 14);
    const cw = w / cols, ch = h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      g.fillStyle = win;
      g.fillRect(i * cw + cw * 0.22, j * ch + ch * 0.2, cw * 0.56, ch * 0.55);
    }
    if (tower) { g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(0, 0, 10, h); }
  });
  const emissiveMap = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const cw = w / cols, ch = h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (rng() < litRatio) {
        g.fillStyle = pick(rng, ['#ffc978', '#ffd9a0', '#fff3c4', '#ffb066']);
        g.fillRect(i * cw + cw * 0.22, j * ch + ch * 0.2, cw * 0.56, ch * 0.55);
      }
    }
  });
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping;
  return { map, emissiveMap };
}

function signTexture(text, bg, fg) {
  return canvasTex(512, 96, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = 'bold 52px Georgia, serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

function makeFrondGeometry() {
  const pos = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const dx = Math.sin(a), dz = Math.cos(a);
    const bx = dx * 0.16, bz = dz * 0.16, px = -dz * 0.14, pz = dx * 0.14;
    const mx = dx * 1.25, mz = dz * 1.25, tx = dx * 2.35, tz = dz * 2.35;
    // two triangles: base->mid (raised), mid->tip (drooping)
    pos.push(-px, 0, -pz, px, 0, pz, mx, 0.55, mz);
    pos.push(-px * 0.4, 0.28, -pz * 0.4, mx, 0.55, mz, tx, -0.55, tz);
    pos.push(px * 0.4, 0.28, pz * 0.4, -px * 0.4, 0.28, -pz * 0.4, tx, -0.55, tz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function buildCity(scene, seed = 1) {
  const rng = mulberry32(seed * 7919 + 13);
  const solids = [];
  const addSolid = (x0, z0, x1, z1, h) => { const s = { minX: x0, maxX: x1, minZ: z0, maxZ: z1, h }; solids.push(s); return s; };

  // ---------- sky, sun, lights ----------
  const skyTex = canvasTex(64, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#274b73'); gr.addColorStop(0.42, '#7fb0d8');
    gr.addColorStop(0.68, '#f7b267'); gr.addColorStop(0.85, '#ff9e64'); gr.addColorStop(1, '#ffd9a0');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(640, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
  sky.position.set(0, 0, 35);
  scene.add(sky);

  const sunDir = new THREE.Vector3(-0.48, 0.40, 0.78).normalize();
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(34, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff0bc, fog: false }));
  sunDisc.position.copy(sunDir).multiplyScalar(590).add(new THREE.Vector3(0, 0, 35));
  sunDisc.lookAt(0, 0, 35);
  scene.add(sunDisc);
  const sunGlow = new THREE.Mesh(new THREE.CircleGeometry(80, 24),
    new THREE.MeshBasicMaterial({ color: 0xffbe78, transparent: true, opacity: 0.35, fog: false }));
  sunGlow.position.copy(sunDir).multiplyScalar(585).add(new THREE.Vector3(0, 0, 35));
  sunGlow.lookAt(0, 0, 35);
  scene.add(sunGlow);

  const sun = new THREE.DirectionalLight(0xffbe78, 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -95; sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 95; sun.shadow.camera.bottom = -95;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 420;
  sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0xffd9a8, 0x4a4a6a, 0.74));
  scene.fog = new THREE.Fog(0xf2a56b, 160, 560);

  // clouds (billboard sprites)
  const cloudTex = canvasTex(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) {
      const x = 30 + Math.random() * (w - 60), y = 45 + Math.random() * 40, r = 18 + Math.random() * 26;
      const gr = g.createRadialGradient(x, y, 2, x, y, r);
      gr.addColorStop(0, 'rgba(255,240,220,0.55)'); gr.addColorStop(1, 'rgba(255,240,220,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  });
  const clouds = [];
  for (let i = 0; i < 12; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.8, fog: false }));
    sp.position.set(randRange(rng, -420, 420), randRange(rng, 95, 150), randRange(rng, -260, 320));
    const s = randRange(rng, 80, 150); sp.scale.set(s, s * 0.42, 1);
    scene.add(sp); clouds.push(sp);
  }

  // ---------- ground painting ----------
  const W2P = 2048 / 480, OX = 240, OZ = 205; // world -> canvas px
  const groundTex = canvasTex(2048, 2048, (g) => {
    const X = (x) => (x + OX) * W2P, Z = (z) => (z + OZ) * W2P;
    g.fillStyle = '#877d6d'; g.fillRect(0, 0, 2048, 2048);
    // sea floor + sand
    g.fillStyle = '#17607e'; g.fillRect(0, Z(WATER_Z), 2048, 2048 - Z(WATER_Z));
    g.fillStyle = '#eed9a4'; g.fillRect(0, Z(SAND_Z), 2048, Z(WATER_Z + 4) - Z(SAND_Z));
    g.fillStyle = '#e6cc92'; g.fillRect(0, Z(WATER_Z - 4), 2048, Z(WATER_Z + 4) - Z(WATER_Z - 4));
    // blocks: sidewalk apron + inner lot
    for (const [bx0, bx1] of BLOCK_X) for (const [bz0, bz1] of BLOCK_Z) {
      g.fillStyle = '#a79c8a'; g.fillRect(X(bx0), Z(bz0), (bx1 - bx0) * W2P, (bz1 - bz0) * W2P);
      g.fillStyle = '#8f8577'; g.fillRect(X(bx0 + 2.2), Z(bz0 + 2.2), (bx1 - bx0 - 4.4) * W2P, (bz1 - bz0 - 4.4) * W2P);
    }
    // plaza + parking lots read as asphalt
    const lot = (x0, z0, x1, z1) => { g.fillStyle = '#5a5d63'; g.fillRect(X(x0), Z(z0), (x1 - x0) * W2P, (z1 - z0) * W2P); };
    lot(-21, 49, 21, 91); lot(39, -131, 81, -89);
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
    for (let i = 0; i < 7; i++) { g.strokeRect(X(-19 + i * 6), Z(52), 5 * W2P, 12 * W2P); }
    // roads
    g.fillStyle = '#33373d';
    for (const rx of ROADS_X) g.fillRect(X(rx - ROAD_W / 2), Z(-180), ROAD_W * W2P, Z(107) - Z(-180));
    for (const rz of ROADS_Z) g.fillRect(X(-196), Z(rz - ROAD_W / 2), 392 * W2P, ROAD_W * W2P);
    // edge lines + centre dashes
    g.fillStyle = '#cfd4d8';
    for (const rx of ROADS_X) { g.fillRect(X(rx - ROAD_W / 2), Z(-180), 2, Z(107) - Z(-180)); g.fillRect(X(rx + ROAD_W / 2) - 2, Z(-180), 2, Z(107) - Z(-180)); }
    g.fillStyle = '#e8e3c8';
    for (const rx of ROADS_X) for (let z = -178; z < 104; z += 8) g.fillRect(X(rx) - 1, Z(z), 2, 4 * W2P);
    for (const rz of ROADS_Z) for (let x = -194; x < 192; x += 8) g.fillRect(X(x), Z(rz) - 1, 4 * W2P, 2);
    // crosswalks
    g.fillStyle = 'rgba(240,240,235,0.85)';
    for (const rx of ROADS_X) for (const rz of ROADS_Z) {
      for (let i = -2; i <= 2; i++) {
        g.fillRect(X(rx + i * 2.4 - 0.9), Z(rz - ROAD_W / 2 - 3.4), 1.8, 3);
        g.fillRect(X(rx + i * 2.4 - 0.9), Z(rz + ROAD_W / 2 + 0.4), 1.8, 3);
        g.fillRect(X(rx - ROAD_W / 2 - 3.4), Z(rz + i * 2.4 - 0.9), 3, 1.8);
        g.fillRect(X(rx + ROAD_W / 2 + 0.4), Z(rz + i * 2.4 - 0.9), 3, 1.8);
      }
    }
    // volleyball court lines
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3;
    g.strokeRect(X(-70), Z(136), 20 * W2P, 18 * W2P);
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(480, 480),
    new THREE.MeshLambertMaterial({ map: groundTex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 35);
  ground.receiveShadow = true;
  scene.add(ground);

  // water
  const waterTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#22779c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(190,235,255,0.35)'; g.lineWidth = 3;
    for (let i = 0; i < 22; i++) {
      const y = Math.random() * h; g.beginPath(); g.moveTo(Math.random() * w, y);
      g.lineTo(Math.random() * w, y + randRange(rng, -4, 4)); g.stroke();
    }
  });
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping; waterTex.repeat.set(10, 3);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(480, 120),
    new THREE.MeshLambertMaterial({ map: waterTex, transparent: true, opacity: 0.94, emissive: 0x0d3a4d, emissiveIntensity: 0.7 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.14, WATER_Z + 58);
  scene.add(water);

  // ---------- buildings ----------
  const facades = [
    makeFacade(rng, '#f2d5a0', '#3a4a55', 0.34, 5, 10, false),
    makeFacade(rng, '#e8836b', '#33424e', 0.3, 5, 10, false),
    makeFacade(rng, '#9fd8c9', '#2f4048', 0.36, 6, 12, false),
    makeFacade(rng, '#f7ede2', '#3a4a55', 0.28, 5, 10, false),
    makeFacade(rng, '#d9a7c7', '#38304a', 0.32, 5, 10, false),
    makeFacade(rng, '#7fb5d5', '#223140', 0.4, 6, 12, false),
  ];
  const towerFacade = makeFacade(rng, '#5d7d99', '#1d2a38', 0.5, 8, 18, true);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b6560 });
  const sideMats = facades.map(f => new THREE.MeshLambertMaterial({
    map: f.map, emissive: 0xffb066, emissiveMap: f.emissiveMap, emissiveIntensity: 0.5,
  }));
  const towerMat = new THREE.MeshLambertMaterial({
    map: towerFacade.map, emissive: 0xffc27a, emissiveMap: towerFacade.emissiveMap, emissiveIntensity: 0.65,
  });

  function building(x0, z0, x1, z1, h, mat) {
    const w = x1 - x0, d = z1 - z0;
    const m = mat || pick(rng, sideMats);
    const tex = m.map;
    const oldRx = tex.repeat.x, oldRy = tex.repeat.y;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      [m, m, roofMat, roofMat, m, m]);
    mesh.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    addSolid(x0, z0, x1, z1, h);
    tex.repeat.x = oldRx; tex.repeat.y = oldRy;
    return mesh;
  }

  function rooftopProps(cx, cz, w, d, top) {
    const r = rng();
    if (r < 0.45) { // water tower
      const g = new THREE.Group();
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.6, 8),
        new THREE.MeshLambertMaterial({ color: 0x8a5a3a }));
      tank.position.y = 2.6; tank.castShadow = true;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.1, 8),
        new THREE.MeshLambertMaterial({ color: 0x5d4030 }));
      cone.position.y = 4.4;
      g.add(tank, cone);
      for (let i = 0; i < 4; i++) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.4, 0.18),
          new THREE.MeshLambertMaterial({ color: 0x4a4a4a }));
        leg.position.set(Math.cos(i * 1.7) * 1.1, 0.7, Math.sin(i * 1.7) * 1.1);
        g.add(leg);
      }
      g.position.set(cx + randRange(rng, -w / 4, w / 4), top, cz + randRange(rng, -d / 4, d / 4));
      scene.add(g);
    } else if (r < 0.8) { // AC unit
      const ac = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 2),
        new THREE.MeshLambertMaterial({ color: 0x9aa0a4 }));
      ac.position.set(cx + randRange(rng, -w / 4, w / 4), top + 0.6, cz + randRange(rng, -d / 4, d / 4));
      ac.castShadow = true;
      scene.add(ac);
    } else { // antenna
      const an = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 5, 4),
        new THREE.MeshLambertMaterial({ color: 0x333338 }));
      an.position.set(cx, top + 2.5, cz);
      scene.add(an);
    }
  }

  const reserved = new Set(['3,4', '5,1', '1,2', '4,1', '2,2', '4,4']); // plaza, warehouse, PD, garage, hideout roof, beach roof
  for (let bi = 0; bi < BLOCK_X.length; bi++) for (let bj = 0; bj < BLOCK_Z.length; bj++) {
    if (reserved.has(bi + ',' + bj)) continue;
    const [bx0, bx1] = BLOCK_X[bi], [bz0, bz1] = BLOCK_Z[bj];
    const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
    const downtown = Math.abs(cx) <= 83 && cz <= 33 && cz >= -110;
    const beachfront = bj === 4;
    if (downtown) {
      const w = randRange(rng, 26, 36), d = randRange(rng, 26, 36), h = randRange(rng, 24, 44);
      building(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, h, towerMat);
      rooftopProps(cx, cz, w, d, h);
      if (rng() < 0.6) rooftopProps(cx, cz, w, d, h);
    } else if (beachfront) {
      const n = 2 + (rng() * 2 | 0);
      const lotW = (bx1 - bx0 - 6) / n;
      for (let i = 0; i < n; i++) {
        const x0 = bx0 + 3 + i * lotW + 1, x1 = bx0 + 3 + (i + 1) * lotW - 1;
        const z0 = bz0 + randRange(rng, 4, 9), z1 = bz1 - randRange(rng, 12, 17);
        const h = randRange(rng, 5.5, 9.5);
        building(x0, z0, x1, z1, h);
        // awning over the boulevard-facing (south) side
        const awn = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 - 2, 0.18, 3),
          new THREE.MeshLambertMaterial({ color: pick(rng, [0xe4572e, 0x17a398, 0xf2a65a, 0xef476f]) }));
        awn.position.set((x0 + x1) / 2, 3.1, z1 + 1.4);
        awn.rotation.x = 0.35; awn.castShadow = true;
        scene.add(awn);
      }
    } else {
      const n = 2 + (rng() * 3 | 0);
      for (let i = 0; i < n; i++) {
        const x0 = bx0 + 3 + randRange(rng, 0, 8), x1 = bx1 - 3 - randRange(rng, 0, 8);
        const z0 = bz0 + 3 + i * ((bz1 - bz0 - 6) / n), z1 = bz0 + 3 + (i + 1) * ((bz1 - bz0 - 6) / n) - randRange(rng, 1, 4);
        if (x1 - x0 < 8 || z1 - z0 < 8) continue;
        const h = randRange(rng, 8, 18);
        building(x0, z0, x1, z1, h);
        if (h > 13 && rng() < 0.5) rooftopProps((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, h);
      }
    }
  }

  // ---------- landmarks ----------
  // Café Marisol: terrace platform + building + sign, south of the boulevard.
  const terrace = new THREE.Mesh(new THREE.BoxGeometry(34, 0.9, 7),
    new THREE.MeshLambertMaterial({ color: 0xcbb59a }));
  terrace.position.set(0, 0.45, 110.5); terrace.receiveShadow = true; terrace.castShadow = true;
  scene.add(terrace); addSolid(-17, 107, 17, 114, 0.9);
  const cafeMat = new THREE.MeshLambertMaterial({ color: 0xf6e3c1 });
  const cafe = new THREE.Mesh(new THREE.BoxGeometry(30, 5.5, 12), cafeMat);
  cafe.position.set(0, 2.75, 120); cafe.castShadow = true; cafe.receiveShadow = true;
  scene.add(cafe); addSolid(-15, 114, 15, 126, 5.5);
  const cafeSign = new THREE.Mesh(new THREE.PlaneGeometry(17, 3.1),
    new THREE.MeshBasicMaterial({ map: signTexture('CAFÉ MARISOL', '#274156', '#ffd9a0') }));
  cafeSign.position.set(0, 4.4, 113.9); cafeSign.rotation.y = Math.PI;
  scene.add(cafeSign);
  for (let i = 0; i < 4; i++) { // terrace umbrellas + tables
    const ux = -12 + i * 8;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5),
      new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
    pole.position.set(ux, 0.9 + 1.2, 110.5);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.6, 8),
      new THREE.MeshLambertMaterial({ color: pick(rng, [0xef476f, 0x17a398, 0xf2a65a]) }));
    top.position.set(ux, 0.9 + 2.5, 110.5); top.castShadow = true;
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.08, 10),
      new THREE.MeshLambertMaterial({ color: 0xffffff }));
    table.position.set(ux, 0.9 + 0.75, 110.5);
    scene.add(pole, top, table);
  }

  // Warehouse (Breakwater Storage) with a loading dock.
  const whMat = new THREE.MeshLambertMaterial({ color: 0x7d8894 });
  const wh = new THREE.Mesh(new THREE.BoxGeometry(36, 9, 30), whMat);
  wh.position.set(120, 4.5, -112); wh.castShadow = true; wh.receiveShadow = true;
  scene.add(wh); addSolid(102, -127, 138, -97, 9);
  const dock = new THREE.Mesh(new THREE.BoxGeometry(24, 0.45, 8),
    new THREE.MeshLambertMaterial({ color: 0x9a9184 }));
  dock.position.set(130, 0.22, -92); dock.receiveShadow = true;
  scene.add(dock); addSolid(118, -96, 142, -88, 0.45);
  const whSign = new THREE.Mesh(new THREE.PlaneGeometry(22, 3.6),
    new THREE.MeshBasicMaterial({ map: signTexture('BREAKWATER STORAGE', '#33373d', '#f2f2f2') }));
  whSign.position.set(120, 6.8, -96.9);
  scene.add(whSign);
  for (let i = 0; i < 3; i++) { // dock doors
    const door = new THREE.Mesh(new THREE.PlaneGeometry(5, 4.4),
      new THREE.MeshLambertMaterial({ color: 0x4a5058 }));
    door.position.set(112 + i * 8, 2.2, -96.95);
    scene.add(door);
  }

  // Police station.
  const pdMat = new THREE.MeshLambertMaterial({ color: 0x4a5a6e });
  const pd = new THREE.Mesh(new THREE.BoxGeometry(28, 8, 26), pdMat);
  pd.position.set(-121, 4, -50); pd.castShadow = true; pd.receiveShadow = true;
  scene.add(pd); addSolid(-135, -63, -107, -37, 8);
  const pdSign = new THREE.Mesh(new THREE.PlaneGeometry(15, 2.8),
    new THREE.MeshBasicMaterial({ map: signTexture('PALMSHADE PD', '#1d2a38', '#ffffff') }));
  pdSign.position.set(-121, 6.4, -36.9);
  scene.add(pdSign);

  // Parking garage: columns + two open slabs (visual), stalls painted on ground.
  const garMat = new THREE.MeshLambertMaterial({ color: 0xb0a89c });
  for (const lvl of [3.2, 6.4]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(40, 0.5, 40), garMat);
    slab.position.set(60, lvl, -110); slab.castShadow = true; slab.receiveShadow = true;
    scene.add(slab);
  }
  for (let ix = 0; ix < 5; ix++) for (let iz = 0; iz < 5; iz++) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.8, 6.4, 0.8), garMat);
    col.position.set(42 + ix * 9, 3.2, -128 + iz * 9);
    col.castShadow = true;
    scene.add(col);
    addSolid(41.6 + ix * 9, -128.4 + iz * 9, 42.4 + ix * 9, -127.6 + iz * 9, 6.4);
  }

  // Rooftop hideout block: one low building + crate stairs (0.8 / 1.6 / 2.4 → roof 3.2).
  const hideMat = new THREE.MeshLambertMaterial({ color: 0xe8b04b });
  const hide = new THREE.Mesh(new THREE.BoxGeometry(20, 3.2, 20), hideMat);
  hide.position.set(-59, 1.6, -50); hide.castShadow = true; hide.receiveShadow = true;
  scene.add(hide); addSolid(-69, -60, -49, -40, 3.2);
  const crateMat = new THREE.MeshLambertMaterial({ color: 0xa9743f });
  // steps touch each other and the roof edge — no gaps to fall into
  [[-43.4, -52, 0.8, 2.0], [-45.4, -52, 1.6, 2.0], [-47.7, -52, 2.4, 2.6]].forEach(([cx, cz, h, w]) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), crateMat);
    c.position.set(cx, h / 2, cz); c.castShadow = true;
    scene.add(c); addSolid(cx - w / 2, cz - 1.5, cx + w / 2, cz + 1.5, h);
  });
  // second crate stair: beachfront rooftop at (45, 78)
  const hide2 = new THREE.Mesh(new THREE.BoxGeometry(16, 3.2, 14), new THREE.MeshLambertMaterial({ color: 0x7fb5d5 }));
  hide2.position.set(48, 1.6, 76); hide2.castShadow = true; hide2.receiveShadow = true;
  scene.add(hide2); addSolid(40, 69, 56, 83, 3.2);
  [[61.6, 74, 0.8, 2.0], [59.6, 74, 1.6, 2.0], [57.3, 74, 2.4, 2.6]].forEach(([cx, cz, h, w]) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), crateMat);
    c.position.set(cx, h / 2, cz); c.castShadow = true;
    scene.add(c); addSolid(cx - w / 2, cz - 1.5, cx + w / 2, cz + 1.5, h);
  });

  // ---------- marina: pier + boats ----------
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6b4a });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 50), pierMat);
  pier.position.set(122, 0.25, 189); pier.receiveShadow = true; pier.castShadow = true;
  scene.add(pier); addSolid(116, 164, 128, 214, 0.5);
  for (let i = 0; i < 6; i++) for (const px of [117, 127]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.6, 6), pierMat);
    post.position.set(px, -0.3, 168 + i * 9);
    scene.add(post);
  }
  const boats = [];
  const hullCols = [0xef476f, 0x17a398, 0xf2a65a, 0xf7ede2, 0x7fb5d5];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.1, 1, 7.4),
      new THREE.MeshLambertMaterial({ color: hullCols[i] }));
    hull.position.y = 0.35; hull.castShadow = true;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 2.4),
      new THREE.MeshLambertMaterial({ color: 0xffffff }));
    cabin.position.set(0, 1.25, -0.6);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.6, 4),
      new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    mast.position.set(0, 2.8, 1.4);
    b.add(hull, cabin, mast);
    const side = i % 2 === 0 ? -1 : 1;
    b.position.set(122 + side * randRange(rng, 11, 17), 0.15, 172 + i * 9 + randRange(rng, -2, 2));
    b.rotation.y = randRange(rng, -0.25, 0.25);
    scene.add(b);
    boats.push({ g: b, phase: rng() * 6.28, y: 0.15 });
  }

  // ---------- beach props ----------
  const umbCols = [0xef476f, 0xf2a65a, 0x17a398, 0x7fb5d5, 0xffd166];
  for (let i = 0; i < 11; i++) {
    const ux = randRange(rng, -170, 170), uz = randRange(rng, 133, 156);
    if (Math.abs(ux - 122) < 12) continue;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 5),
      new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
    pole.position.set(ux, 1.05, uz);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.7, 8),
      new THREE.MeshLambertMaterial({ color: umbCols[i % umbCols.length] }));
    top.position.set(ux, 2.2, uz); top.castShadow = true;
    scene.add(pole, top);
  }
  // lifeguard stand (platform 0.9, step-up reachable)
  const lg = new THREE.Group();
  const lgPlat = new THREE.Mesh(new THREE.BoxGeometry(3, 0.9, 3),
    new THREE.MeshLambertMaterial({ color: 0xf7ede2 }));
  lgPlat.position.y = 0.45;
  const lgHut = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 2.2),
    new THREE.MeshLambertMaterial({ color: 0xe4572e }));
  lgHut.position.y = 1.7;
  const lgRoof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.8, 4),
    new THREE.MeshLambertMaterial({ color: 0xf7ede2 }));
  lgRoof.position.y = 2.9; lgRoof.rotation.y = Math.PI / 4;
  lg.add(lgPlat, lgHut, lgRoof);
  lg.position.set(60, 0, 140);
  lg.traverse(o => { o.castShadow = true; });
  scene.add(lg); addSolid(58.5, 138.5, 61.5, 141.5, 0.9);
  // volleyball net
  const netMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
  const net = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.1), netMat);
  net.position.set(-60, 1.15, 145);
  scene.add(net);
  for (const nx of [-64.5, -55.5]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 5),
      new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    p.position.set(nx, 0.9, 145);
    scene.add(p);
  }

  // ---------- street props ----------
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x6e4f30 });
  const metalMat = new THREE.MeshLambertMaterial({ color: 0x555b61 });
  for (let i = 0; i < 9; i++) {
    const bx = -160 + i * 40, bz = i % 2 ? 91 : 109;
    const bench = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.6), benchMat);
    seat.position.y = 0.5;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.1), benchMat);
    back.position.set(0, 0.85, -0.26);
    bench.add(seat, back);
    bench.position.set(bx, 0, bz);
    bench.rotation.y = bz < 100 ? Math.PI : 0;
    scene.add(bench);
  }
  for (let i = 0; i < 10; i++) {
    const hx = pick(rng, ROADS_X) + 8.6, hz = randRange(rng, -160, 90);
    const hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.7, 7),
      new THREE.MeshLambertMaterial({ color: 0xd23b2e }));
    hyd.position.set(hx, 0.35, hz);
    scene.add(hyd);
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.95, 8),
      new THREE.MeshLambertMaterial({ color: 0x2e7d5b }));
    bin.position.set(pick(rng, ROADS_X) - 8.6, 0.48, randRange(rng, -160, 95));
    scene.add(bin);
  }
  for (const [sx, sz] of [[-38, 92], [98, 108]]) { // bus stops on the boulevard
    const stop = new THREE.Group();
    for (const px of [-1.8, 1.8]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 0.12), metalMat);
      post.position.set(px, 1.25, 0); stop.add(post);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.1, 1.6),
      new THREE.MeshLambertMaterial({ color: 0x17a398 }));
    roof.position.y = 2.5; roof.castShadow = true;
    stop.add(roof);
    stop.position.set(sx, 0, sz);
    scene.add(stop);
  }

  // ---------- palms (instanced) ----------
  const palmPts = [];
  for (let x = -182; x <= 182; x += 23) { palmPts.push([x + randRange(rng, -2, 2), 90.6]); palmPts.push([x + randRange(rng, -2, 2), 109.4]); }
  for (let i = 0; i < 34; i++) palmPts.push([randRange(rng, -185, 185), randRange(rng, 131, 158)]);
  for (let i = 0; i < 16; i++) palmPts.push([pick(rng, ROADS_X) + (rng() < 0.5 ? -8.8 : 8.8), randRange(rng, -165, 85)]);
  palmPts.push([-19, 52], [19, 52], [-19, 88], [19, 88], [118, 160], [126, 160]);
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.24, 3.6, 5);
  trunkGeo.translate(0, 1.8, 0);
  const trunkIM = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x8a6b4a }), palmPts.length);
  const frondIM = new THREE.InstancedMesh(makeFrondGeometry(),
    new THREE.MeshLambertMaterial({ color: 0x3f9e4d, side: THREE.DoubleSide }), palmPts.length);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  palmPts.forEach(([px, pz], i) => {
    const lean = randRange(rng, 0.04, 0.16), la = rng() * 6.28, hs = randRange(rng, 0.85, 1.45);
    dummy.position.set(px, 0, pz);
    dummy.rotation.set(Math.cos(la) * lean, rng() * 6.28, Math.sin(la) * lean);
    dummy.scale.set(1, hs, 1);
    dummy.updateMatrix();
    trunkIM.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 3.6 * hs;
    dummy.updateMatrix();
    frondIM.setMatrixAt(i, dummy.matrix);
    frondIM.setColorAt(i, col.setHSL(0.33, 0.5, randRange(rng, 0.3, 0.42)));
  });
  trunkIM.castShadow = true; frondIM.castShadow = true;
  scene.add(trunkIM, frondIM);

  // ---------- streetlights (instanced) ----------
  const lightPts = [];
  for (const rx of ROADS_X) for (let z = -165; z <= 100; z += 32) lightPts.push([rx + 7.8, z]);
  for (const rz of ROADS_Z) for (let x = -180; x <= 180; x += 36) lightPts.push([x, rz - 7.8]);
  const poleIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.12, 5.2, 5), metalMat, lightPts.length);
  const headIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0xffe6b3 }), lightPts.length);
  lightPts.forEach(([px, pz], i) => {
    dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
    dummy.position.set(px, 2.6, pz); dummy.updateMatrix();
    poleIM.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 5.25; dummy.updateMatrix();
    headIM.setMatrixAt(i, dummy.matrix);
  });
  poleIM.castShadow = true;
  scene.add(poleIM, headIM);

  // ---------- collision / ground ----------
  function groundAt(x, z, curY = 0) {
    let best = 0;
    for (const s of solids) {
      if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) {
        if (s.h <= curY + 0.9 && s.h > best) best = s.h;
      }
    }
    return best;
  }

  function collideCircle(x, z, r, curY = 0) {
    let hit = false;
    for (const s of solids) {
      if (s.h <= curY + 0.9) continue;
      const nx = clamp(x, s.minX, s.maxX), nz = clamp(z, s.minZ, s.maxZ);
      const dx = x - nx, dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          x = nx + (dx / d) * r; z = nz + (dz / d) * r;
        } else {
          // centre inside the box: push out along the smallest penetration axis
          const pl = x - (s.minX - r), pr = (s.maxX + r) - x, pt = z - (s.minZ - r), pb = (s.maxZ + r) - z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = s.minX - r; else if (m === pr) x = s.maxX + r;
          else if (m === pt) z = s.minZ - r; else z = s.maxZ + r;
        }
      }
    }
    return { x, z, hit };
  }

  const landmarks = {
    cafe: { x: 0, z: 110.5 },
    marisol: { x: 3, z: 110.5 },
    plazaVan: { x: 14, z: 84 },
    warehouseDock: { x: 130, z: -90 },
    warehouseDoor: { x: 122, z: -97 },
    policeStation: { x: -121, z: -33 },
    pdRespawn: { x: -120, z: -24 },
    garage: { x: 60, z: -92 },
    marina: { x: 122, z: 168 },
    pierEnd: { x: 122, z: 208 },
    hideRoof: { x: -59, z: -50 },
  };

  return {
    solids, landmarks, groundAt, collideCircle,
    update(dt, t) {
      waterTex.offset.y = t * 0.012;
      waterTex.offset.x = Math.sin(t * 0.05) * 0.02;
      for (const b of boats) {
        b.g.position.y = b.y + Math.sin(t * 0.9 + b.phase) * 0.11;
        b.g.rotation.z = Math.sin(t * 0.7 + b.phase) * 0.03;
        b.g.rotation.x = Math.cos(t * 0.6 + b.phase) * 0.02;
      }
      for (const c of clouds) { c.position.x += dt * 0.7; if (c.position.x > 460) c.position.x = -460; }
    },
    setSunTarget(x, z) {
      sun.position.set(x + sunDir.x * 180, sunDir.y * 180, z + sunDir.z * 180);
      sun.target.position.set(x, 0, z);
      sun.target.updateMatrixWorld();
    },
  };
}
