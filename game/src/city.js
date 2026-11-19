// city.js — Palmshade City environment: sky, ground, districts, landmarks, marina, props.
// Returns colliders, walkable platforms, landmark points; update() animates water/boats.
import * as THREE from 'three';
import { ROADS, ROAD_W, SAND_X, WATER_X, WORLD, clamp } from './util.js';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function facadeTex(rng, base, floors, cols, litRatio) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    const fw = 256 / cols, fh = 256 / floors;
    for (let y = 0; y < floors; y++) for (let x = 0; x < cols; x++) {
      const lit = rng.next() < litRatio;
      g.fillStyle = lit ? (rng.chance(0.5) ? '#ffd489' : '#ffb85e') : '#20242c';
      g.fillRect(x * fw + fw * 0.22, y * fh + fh * 0.2, fw * 0.56, fh * 0.55);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 250, 256, 6);
  });
}

function signTex(text, bg, fg) {
  return canvasTex(512, 96, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 96);
    g.fillStyle = fg; g.font = 'bold 52px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 52);
  });
}

// Merge simple plane geometries (positions/normals/uvs/index) into one BufferGeometry.
function mergedPlanes(planes) {
  let vCount = 0, iCount = 0;
  for (const p of planes) { vCount += p.attributes.position.count; iCount += p.index.count; }
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
  const idx = new (vCount > 65535 ? Uint32Array : Uint16Array)(iCount);
  let vo = 0, io = 0;
  for (const p of planes) {
    pos.set(p.attributes.position.array, vo * 3);
    nor.set(p.attributes.normal.array, vo * 3);
    uv.set(p.attributes.uv.array, vo * 2);
    for (let i = 0; i < p.index.count; i++) idx[io + i] = p.index.array[i] + vo;
    vo += p.attributes.position.count; io += p.index.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

export function buildCity(scene, rng) {
  const colliders = [];   // {minX,maxX,minZ,maxZ,h}
  const platforms = [];   // {minX,maxX,minZ,maxZ,topY}
  const animated = { boats: [], waterMats: [] };
  const addCollider = (cx, cz, w, d, h) => colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h });
  const addPlatform = (cx, cz, w, d, topY) => platforms.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, topY });

  // ---------- sky dome, sun, clouds ----------
  const skyTex = canvasTex(64, 512, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, '#2e4a7a'); gr.addColorStop(0.42, '#7d9cc4');
    gr.addColorStop(0.62, '#e8a56b'); gr.addColorStop(0.74, '#ffb347'); gr.addColorStop(1, '#ff9a5c');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 512);
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
  scene.add(sky);
  const sunTex = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,244,200,1)'); gr.addColorStop(0.35, 'rgba(255,205,110,0.9)'); gr.addColorStop(1, 'rgba(255,160,60,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false }));
  sun.position.set(-620, 150, -260); sun.scale.setScalar(300); scene.add(sun);
  const cloudTex = canvasTex(256, 128, (g) => {
    g.clearRect(0, 0, 256, 128);
    for (let i = 0; i < 16; i++) {
      const x = 30 + rng.next() * 196, y = 44 + rng.next() * 40, r = 16 + rng.next() * 26;
      const gr = g.createRadialGradient(x, y, 2, x, y, r);
      gr.addColorStop(0, 'rgba(255,235,220,0.55)'); gr.addColorStop(1, 'rgba(255,235,220,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  });
  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
  for (let i = 0; i < 8; i++) {
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(rng.range(90, 150), rng.range(28, 44)), cloudMat);
    cl.position.set(rng.range(-700, 700), rng.range(120, 210), rng.range(-700, 700));
    cl.rotation.x = -Math.PI / 2 + rng.range(-0.2, 0.2); cl.rotation.z = rng.range(0, 3);
    scene.add(cl);
  }

  // ---------- ground ----------
  const S = 2; // px per unit
  const GW = (WORLD.maxX - WORLD.minX) * S, GH = (WORLD.maxZ - WORLD.minZ) * S;
  const groundTex = canvasTex(GW, GH, (g) => {
    const X = (x) => (x - WORLD.minX) * S, Z = (z) => (z - WORLD.minZ) * S;
    g.fillStyle = '#5d6066'; g.fillRect(0, 0, GW, GH); // block base concrete
    // block variation
    for (const bx of [-120, -40, 40, 120]) for (const bz of [-120, -40, 40, 120]) {
      g.fillStyle = `rgba(${40 + rng.int(0, 30)},${42 + rng.int(0, 26)},${46 + rng.int(0, 22)},0.35)`;
      g.fillRect(X(bx - 32), Z(bz - 32), 64 * S, 64 * S);
    }
    // park block
    g.fillStyle = '#3a6b35'; g.fillRect(X(8), Z(8), 64 * S, 64 * S);
    g.fillStyle = '#8a7a52'; g.fillRect(X(36), Z(8), 8 * S, 64 * S); g.fillRect(X(8), Z(36), 64 * S, 8 * S);
    // sand + beach shading
    g.fillStyle = '#ecd29a'; g.fillRect(X(SAND_X), 0, (WORLD.maxX - SAND_X) * S, GH);
    g.fillStyle = 'rgba(190,150,90,0.5)';
    for (let i = 0; i < 300; i++) g.fillRect(X(SAND_X) + rng.next() * (WORLD.maxX - SAND_X) * S, rng.next() * GH, 3, 3);
    // sidewalks: light border around each block + beachfront strip
    g.fillStyle = '#a7abae';
    for (const bx of [-120, -40, 40, 120]) for (const bz of [-120, -40, 40, 120])
      g.fillRect(X(bx - 34), Z(bz - 34), 68 * S, 68 * S);
    g.fillStyle = '#5d6066'; // re-cut block interiors
    for (const bx of [-120, -40, 40, 120]) for (const bz of [-120, -40, 40, 120])
      g.fillRect(X(bx - 32), Z(bz - 32), 64 * S, 64 * S);
    g.fillStyle = '#3a6b35'; g.fillRect(X(8), Z(8), 64 * S, 64 * S);
    g.fillStyle = '#8a7a52'; g.fillRect(X(36), Z(8), 8 * S, 64 * S); g.fillRect(X(8), Z(36), 64 * S, 8 * S);
    g.fillStyle = '#b9bdc0'; g.fillRect(X(168), 0, 6 * S, GH); // boulevard promenade
    // roads
    g.fillStyle = '#31343a';
    for (const r of ROADS) {
      g.fillRect(X(r - ROAD_W / 2), 0, ROAD_W * S, GH);
      g.fillRect(0, Z(r - ROAD_W / 2), (SAND_X - WORLD.minX) * S, ROAD_W * S);
    }
    // centre dashes
    g.fillStyle = '#e8c85a';
    for (const r of ROADS) {
      for (let z = WORLD.minZ; z < WORLD.maxZ; z += 8) g.fillRect(X(r) - 1, Z(z), 2, 4 * S * 0.5);
      for (let x = WORLD.minX; x < SAND_X; x += 8) g.fillRect(X(x), Z(r) - 1, 4 * S * 0.5, 2);
    }
    // crosswalks
    g.fillStyle = 'rgba(240,240,240,0.85)';
    for (const rx of ROADS) for (const rz of ROADS) {
      for (let i = -3; i <= 3; i++) {
        g.fillRect(X(rx - 5.4), Z(rz + i * 1.6 - 0.6), 1.4 * S, 1.1 * S);
        g.fillRect(X(rx + 4), Z(rz + i * 1.6 - 0.6), 1.4 * S, 1.1 * S);
        g.fillRect(X(rx + i * 1.6 - 0.6), Z(rz - 5.4), 1.1 * S, 1.4 * S);
        g.fillRect(X(rx + i * 1.6 - 0.6), Z(rz + 4), 1.1 * S, 1.4 * S);
      }
    }
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.maxX - WORLD.minX, WORLD.maxZ - WORLD.minZ),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((WORLD.minX + WORLD.maxX) / 2, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------- water ----------
  const waterTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#1b6d8f'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(140,220,255,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      const y = rng.next() * 256; g.beginPath(); g.moveTo(rng.next() * 200, y); g.lineTo(rng.next() * 200 + 60, y); g.stroke();
    }
  });
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping; waterTex.repeat.set(6, 24);
  const waterMat = new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.94 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(340, WORLD.maxZ - WORLD.minZ), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(WATER_X + 168, -0.35, 0);
  scene.add(water);
  animated.waterMats.push(waterTex);

  // ---------- materials / facades ----------
  const facades = [
    facadeTex(rng, '#8a7f74', 10, 6, 0.55), facadeTex(rng, '#6e7a86', 12, 7, 0.5),
    facadeTex(rng, '#9c8468', 8, 6, 0.6), facadeTex(rng, '#7a6a80', 14, 8, 0.45),
  ];
  const lowFacades = [
    facadeTex(rng, '#d9a066', 3, 6, 0.5), facadeTex(rng, '#c47f52', 3, 7, 0.55),
    facadeTex(rng, '#e3c493', 2, 6, 0.5), facadeTex(rng, '#a8bfb2', 3, 5, 0.5),
  ];
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a4642, roughness: 1 });
  const box = (w, h, d, mat, x, y, z, parent = scene) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const building = (cx, cz, w, d, h, tex) => {
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xff9a3d, emissiveIntensity: 0.38, roughness: 0.9 });
    const b = box(w, h, d, mat, cx, h / 2, cz);
    box(w + 0.6, 0.5, d + 0.6, roofMat, cx, h + 0.25, cz);
    addCollider(cx, cz, w, d, h);
    return b;
  };
  const roofProps = (cx, cz, w, d, h) => {
    if (rng.chance(0.5)) { // water tower
      const g = new THREE.Group();
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 3, 8), new THREE.MeshStandardMaterial({ color: 0x8a6f4d, roughness: 1 }));
      tank.position.y = 2.6; tank.castShadow = true; g.add(tank);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.2, 8), roofMat); cone.position.y = 4.7; g.add(cone);
      for (let i = 0; i < 4; i++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.4), roofMat);
        leg.position.set(Math.cos(i * 1.7) * 1.1, 0.7, Math.sin(i * 1.7) * 1.1); g.add(leg);
      }
      g.position.set(cx + rng.range(-w / 4, w / 4), h + 0.5, cz + rng.range(-d / 4, d / 4));
      scene.add(g);
    }
    if (rng.chance(0.7)) box(rng.range(2, 4), 1.1, rng.range(2, 3), roofMat, cx + rng.range(-w / 3, w / 3), h + 1, cz + rng.range(-d / 3, d / 3));
    if (rng.chance(0.4)) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, rng.range(3, 6)), roofMat);
      ant.position.set(cx + rng.range(-w / 3, w / 3), h + 3, cz + rng.range(-d / 3, d / 3)); scene.add(ant);
    }
  };

  // ---------- downtown + midtown blocks ----------
  const special = new Set(['-40,-40', '-120,-120', '40,40']);
  for (const bx of [-120, -40, 40, 120]) for (const bz of [-120, -40, 40, 120]) {
    if (special.has(`${bx},${bz}`)) continue;
    const downtown = bx <= -40;
    const n = rng.int(1, downtown ? 3 : 2);
    const spots = n === 1 ? [[0, 0]] : n === 2 ? [[-15, 0], [15, 0]] : [[-15, -15], [15, -15], [0, 15]];
    for (const [ox, oz] of spots) {
      const w = rng.range(15, 24), d = rng.range(15, 24);
      const h = downtown ? rng.range(24, 58) : rng.range(11, 28);
      building(bx + ox, bz + oz, w, d, h, rng.pick(facades));
      if (h > 20) roofProps(bx + ox, bz + oz, w, d, h);
    }
  }

  // ---------- park block (40,40) ----------
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7031, roughness: 1 });
  for (let i = 0; i < 9; i++) {
    const x = 40 + rng.range(-26, 26), z = 40 + rng.range(-26, 26);
    if (Math.abs(x - 40) < 5 || Math.abs(z - 40) < 5) continue;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 3.4, 6), trunkMat);
    tr.position.set(x, 1.7, z); tr.castShadow = true; scene.add(tr);
    const cr = new THREE.Mesh(new THREE.SphereGeometry(rng.range(2.2, 3.4), 8, 6), leafMat);
    cr.position.set(x, 4.6, z); cr.castShadow = true; scene.add(cr);
    addCollider(x, z, 0.9, 0.9, 3);
  }

  // ---------- police station (-120,-120) ----------
  building(-120, -124, 30, 18, 11, facades[1]);
  const pdSign = new THREE.Mesh(new THREE.PlaneGeometry(16, 3), new THREE.MeshBasicMaterial({ map: signTex('PALMSHADE PD', '#1c3050', '#ffd23e') }));
  pdSign.position.set(-120, 8.6, -114.8); scene.add(pdSign);
  box(30, 1.2, 4, new THREE.MeshStandardMaterial({ color: 0x2c4a73 }), -120, 10.2, -116);

  // ---------- parking garage (-40,-40) ----------
  {
    const conc = new THREE.MeshStandardMaterial({ color: 0x8f9296, roughness: 1 });
    const slab = box(38, 0.6, 38, conc, -40, 5.7, -40); slab.castShadow = true;
    addPlatform(-40, -40, 38, 38, 6.0);
    box(38, 0.4, 38, conc, -40, 0.2, -40).receiveShadow = true;
    for (const px of [-57, -40, -23]) for (const pz of [-57, -40, -23]) {
      if (px === -40 && pz === -40) continue;
      box(1.4, 5.4, 1.4, conc, px, 2.9, pz);
      addCollider(px, pz, 1.4, 1.4, 5.4);
    }
    const gSign = new THREE.Mesh(new THREE.PlaneGeometry(13, 2.6), new THREE.MeshBasicMaterial({ map: signTex('PARKING', '#333a42', '#ffffff') }));
    gSign.position.set(-40, 4.6, -20.8); scene.add(gSign);
    // crate stairs up the east side to the roof (ascending westward, top step overlaps roof edge)
    crateStairs(scene, platforms, -14.6, -52, -1, 0, 7);
  }

  // ---------- beachfront low-rise strip (x≈190) ----------
  const awnMats = [0xc0392b, 0x148f77, 0xd68910, 0x6c3483].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
  for (const bz of [-120, 40]) {
    const b = building(192, bz, 20, 30, rng.range(7, 10), rng.pick(lowFacades));
    for (let i = 0; i < 4; i++) {
      const aw = box(0.3, 0.18, 4.6, rng.pick(awnMats), 181.6, 3.4, bz - 11 + i * 7);
      aw.rotation.z = 0.5;
    }
  }
  building(192, -88, 18, 20, 8, lowFacades[3]);

  // ---------- Café Marisol (192,-48) + terrace ----------
  building(193, -48, 20, 24, 6.5, lowFacades[0]);
  const cafeSign = new THREE.Mesh(new THREE.PlaneGeometry(15, 2.8), new THREE.MeshBasicMaterial({ map: signTex('CAFÉ MARISOL', '#7a2d12', '#ffe9b0') }));
  cafeSign.position.set(182.8, 5.2, -48); cafeSign.rotation.y = -Math.PI / 2; scene.add(cafeSign);
  {
    const terrMat = new THREE.MeshStandardMaterial({ color: 0xcbb59a, roughness: 1 });
    const terr = box(10, 0.9, 18, terrMat, 173, 0.45, -48); terr.receiveShadow = true;
    addPlatform(173, -48, 10, 18, 0.9);
    const umbMat = new THREE.MeshStandardMaterial({ color: 0xe67e22, roughness: 0.8 });
    const tableMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.7 });
    for (const [tx, tz] of [[171, -53], [175, -53], [171, -43], [175, -43]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1), tableMat);
      pole.position.set(tx, 1.4, tz); scene.add(pole);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 10), tableMat);
      top.position.set(tx, 1.9, tz); top.castShadow = true; scene.add(top);
      const umb = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.7, 8), umbMat);
      umb.position.set(tx, 3.1, tz); umb.castShadow = true; scene.add(umb);
      const upole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2), tableMat);
      upole.position.set(tx, 2, tz); scene.add(upole);
    }
  }

  // ---------- Warehouse 7 (190,120) + crate stairs to roof ----------
  building(192, 120, 22, 32, 7, facades[2]);
  addPlatform(192, 120, 22, 32, 7.0);
  const whSign = new THREE.Mesh(new THREE.PlaneGeometry(15, 2.8), new THREE.MeshBasicMaterial({ map: signTex('WAREHOUSE 7', '#3d3d3d', '#ffd23e') }));
  whSign.position.set(180.8, 5.4, 120); whSign.rotation.y = -Math.PI / 2; scene.add(whSign);
  crateStairs(scene, platforms, 172.5, 112, 1, 0, 8);
  // scattered crates near warehouse + marina
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xa9803e, roughness: 1 });
  for (const [cx, cz] of [[176, 132], [178, 134], [176, 130], [230, 26], [228, -14]]) {
    box(1.8, 1.8, 1.8, crateMat, cx, 0.9, cz); addCollider(cx, cz, 1.8, 1.8, 1.8);
  }

  // ---------- marina + pier ----------
  {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 1 });
    const deck = box(44, 0.9, 8, woodMat, 258, 0.45, 12); deck.receiveShadow = true;
    addPlatform(258, 12, 44, 8, 0.9);
    for (let x = 238; x <= 278; x += 8) for (const z of [9, 15]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.4), woodMat);
      post.position.set(x, -0.4, z); scene.add(post);
    }
    for (let x = 238; x <= 278; x += 4) box(0.12, 0.8, 0.12, woodMat, x, 1.3, 8.3);
    box(42, 0.1, 0.12, woodMat, 258, 1.7, 8.3);
    // boats
    const hullCols = [0xe74c3c, 0xecf0f1, 0x3498db, 0xf39c12, 0x1abc9c, 0xecf0f1];
    const boatPos = [[248, -6], [262, -14], [252, 34], [268, 30], [244, 44], [272, -2]];
    boatPos.forEach(([bx, bz], i) => {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.1, 2.4), new THREE.MeshStandardMaterial({ color: hullCols[i], roughness: 0.6 }));
      hull.position.y = 0.4; hull.castShadow = true; boat.add(hull);
      const bow = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.2, 4), hull.material);
      bow.rotation.z = -Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(4.2, 0.4, 0); boat.add(bow);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.7), new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.5 }));
      cab.position.set(-0.6, 1.4, 0); cab.castShadow = true; boat.add(cab);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5.4), woodMat);
      mast.position.set(1.2, 3.4, 0); boat.add(mast);
      boat.position.set(bx, -0.25, bz);
      boat.rotation.y = rng.range(-0.4, 0.4);
      scene.add(boat);
      animated.boats.push({ g: boat, baseY: -0.25, ph: rng.range(0, 6) });
    });
  }

  // ---------- beach props ----------
  {
    // lifeguard stand (platform reachable by its ramp steps)
    const lgMat = new THREE.MeshStandardMaterial({ color: 0xecf0f1, roughness: 0.8 });
    for (const [lx, lz] of [[212.6, -91.4], [215.4, -91.4], [212.6, -88.6], [215.4, -88.6]])
      box(0.28, 1.8, 0.28, lgMat, lx, 0.9, lz);
    box(4, 0.25, 4, lgMat, 214, 1.9, -90);
    addPlatform(214, -90, 4, 4, 2.02);
    box(4.4, 0.18, 4.4, new THREE.MeshStandardMaterial({ color: 0xe74c3c }), 214, 3.6, -90);
    for (const [lx, lz] of [[212.2, -88.2], [215.8, -88.2]]) box(0.2, 1.7, 0.2, lgMat, lx, 2.75, lz);
    for (let i = 0; i < 3; i++) addPlatform(210.6 - i * 0.0, -90, 1.2, 3, 0); // placeholder no-op guard
    platforms.pop(); platforms.pop(); platforms.pop();
    addPlatform(211.2, -90, 1.6, 3.4, 0.7); addPlatform(212.6, -90, 1.4, 3.4, 1.4);
    // beach umbrellas + towels
    const umbCols = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0x1abc9c];
    for (let i = 0; i < 12; i++) {
      const x = rng.range(212, 232), z = rng.range(-180, 180);
      if (Math.abs(z - 12) < 8 && x > 230) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2), lgMat);
      pole.position.set(x, 1.1, z); pole.rotation.z = 0.16; scene.add(pole);
      const umb = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.8, 8), new THREE.MeshStandardMaterial({ color: rng.pick(umbCols), roughness: 0.9 }));
      umb.position.set(x + 0.18, 2.3, z); umb.castShadow = true; scene.add(umb);
    }
    // volleyball net
    const netMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    box(0.15, 2.4, 0.15, lgMat, 214, 1.2, 24); box(0.15, 2.4, 0.15, lgMat, 214, 1.2, 36);
    const net = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.1), netMat);
    net.rotation.y = Math.PI / 2; net.position.set(214, 1.7, 30); scene.add(net);
  }

  // ---------- palms (instanced) + streetlights (instanced) ----------
  {
    const spots = [];
    for (let z = -230; z <= 230; z += 18) { spots.push([172.5 + rng.range(-1, 1), z + rng.range(-3, 3)]); spots.push([rng.range(210, 230), z + rng.range(-6, 6)]); }
    for (let i = 0; i < 22; i++) spots.push([rng.range(-230, 230), rng.range(-230, 230)]);
    const N = spots.length;
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.3, 5.4, 6);
    trunkGeo.translate(0, 2.7, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 }), N);
    const leafTex = canvasTex(128, 128, (g) => {
      g.clearRect(0, 0, 128, 128);
      g.strokeStyle = '#3e7d2e'; g.lineWidth = 5; g.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const a = -0.4 - i * 0.22;
        g.beginPath(); g.moveTo(64, 118);
        g.quadraticCurveTo(64 + Math.cos(a) * 44, 118 + Math.sin(a) * 52 - 18, 64 + Math.cos(a) * 62, 118 + Math.sin(a) * 66 + 16);
        g.stroke();
      }
    });
    const frondPlanes = [];
    for (let i = 0; i < 7; i++) {
      const p = new THREE.PlaneGeometry(4.6, 4.6);
      p.translate(0, 2.1, 0); p.rotateX(-0.5); p.rotateY((i / 7) * Math.PI * 2);
      frondPlanes.push(p);
    }
    const frondGeo = mergedPlanes(frondPlanes);
    const fronds = new THREE.InstancedMesh(frondGeo, new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1 }), N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    spots.forEach(([x, z], i) => {
      const lean = rng.range(0, 0.14), la = rng.range(0, Math.PI * 2), s = rng.range(0.85, 1.3);
      e.set(Math.cos(la) * lean, rng.range(0, 3), Math.sin(la) * lean); q.setFromEuler(e);
      v.set(x, 0, z); sc.set(s, s, s);
      m4.compose(v, q, sc); trunks.setMatrixAt(i, m4);
      v.set(x + Math.sin(la) * lean * 5.2 * s, 5.35 * s, z + Math.cos(la) * lean * 5.2 * s);
      m4.compose(v, q, sc); fronds.setMatrixAt(i, m4);
      addCollider(x, z, 0.55, 0.55, 4);
    });
    trunks.castShadow = true; fronds.castShadow = true;
    scene.add(trunks); scene.add(fronds);

    const lampSpots = [];
    for (const r of ROADS) for (let t = -200; t <= 200; t += 40) {
      lampSpots.push([r + 9.4, t + 20]); lampSpots.push([t + 20, r - 9.4]);
    }
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.2, 5); poleGeo.translate(0, 2.6, 0);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.8 }), lampSpots.length);
    const headGeo = new THREE.BoxGeometry(0.5, 0.18, 0.5);
    const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: 0x554a33, emissive: 0xffc873, emissiveIntensity: 1.6 }), lampSpots.length);
    lampSpots.forEach(([x, z], i) => {
      if (x > SAND_X - 4 && Math.abs(x) > 0) { /* still place on boulevard */ }
      v.set(x, 0, z); q.identity(); sc.set(1, 1, 1); m4.compose(v, q, sc); poles.setMatrixAt(i, m4);
      v.set(x, 5.25, z); m4.compose(v, q, sc); heads.setMatrixAt(i, m4);
    });
    scene.add(poles); scene.add(heads);
  }

  // ---------- street props: benches, hydrants, bins ----------
  {
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 1 });
    const spotsB = [[176, -20], [176, 60], [176, -140], [30, 34], [50, 46], [-88, -74], [88, 74], [214, 44]];
    for (const [x, z] of spotsB) { box(2.2, 0.12, 0.6, benchMat, x, 0.5, z); box(2.2, 0.5, 0.1, benchMat, x, 0.85, z - 0.28); addCollider(x, z, 2.2, 0.7, 0.9); }
    const hydMat = new THREE.MeshStandardMaterial({ color: 0xc22e2e, roughness: 0.7 });
    for (const [x, z] of [[-72, -72], [72, 72], [-152, 88], [88, -152], [168, 88]]) {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.8, 7), hydMat);
      h.position.set(x, 0.4, z); h.castShadow = true; scene.add(h);
    }
  }

  function crateStairs(sc, plats, x0, z0, dx, dz, steps) {
    const crateMat = new THREE.MeshStandardMaterial({ color: 0xb0823f, roughness: 1 });
    for (let i = 0; i < steps; i++) {
      const topY = (i + 1) * 0.88;
      const cx = x0 + dx * i * 1.15, cz = z0 + dz * i * 1.15;
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.7, topY, 1.7), crateMat);
      c.position.set(cx, topY / 2, cz); c.castShadow = true; c.receiveShadow = true; sc.add(c);
      plats.push({ minX: cx - 0.85, maxX: cx + 0.85, minZ: cz - 0.85, maxZ: cz + 0.85, topY });
    }
  }

  const landmarks = {
    cafe: { x: 182, z: -48 }, marisol: { x: 172, z: -48 },
    warehouse: { x: 179, z: 120 }, warehouseDoor: { x: 176, z: 120 },
    garage: { x: -40, z: -19 }, garageRoof: { x: -40, z: -40 },
    policeStation: { x: -104, z: -106 }, respawn: { x: -96, z: -104 },
    pierEnd: { x: 272, z: 12 }, marina: { x: 244, z: 12 },
    vanSpawn: { x: 160, z: -28, heading: 0 },
  };

  return {
    colliders, platforms, landmarks,
    update(dt, t) {
      waterTex.offset.y = t * 0.008; waterTex.offset.x = Math.sin(t * 0.05) * 0.02;
      for (const b of animated.boats) {
        b.g.position.y = b.baseY + Math.sin(t * 0.9 + b.ph) * 0.14;
        b.g.rotation.z = Math.sin(t * 0.7 + b.ph) * 0.03;
        b.g.rotation.x = Math.cos(t * 0.6 + b.ph) * 0.02;
      }
    },
  };
}
