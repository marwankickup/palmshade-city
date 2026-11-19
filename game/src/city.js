// city.js — Palmshade City: sky, sun, ground, two districts, landmarks, marina.
// Exports colliders, walkable platforms, parking spots and landmark positions.

import * as THREE from 'three';
import { ROAD_X, ROAD_Z, ROAD_HALF, BEACH_X, WATER_X, rand, randi, choice, clamp } from './util.js';

// ---------- small geometry merge helper (all inputs indexed, position/normal/uv) ----------
export function mergeGeoms(geoms) {
  let vCount = 0, iCount = 0;
  for (const g of geoms) { vCount += g.attributes.position.count; iCount += g.index.count; }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const g of geoms) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    io += gi.length; vo += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------- facade textures ----------
const PALETTES = [
  ['#e8b4a0', '#d99e83'], ['#f2d5a7', '#e3bd85'], ['#a8c8d8', '#87aec4'],
  ['#e6e0d4', '#cfc6b4'], ['#d8a7b8', '#c08ba0'], ['#9fc6a8', '#7dab8c'],
  ['#f0e6f0', '#d3c2d6'], ['#e8c9a0', '#d4ab78'], ['#b8d0e8', '#94b4d4'],
];
function facadeTextures(w, hgt, pastel) {
  const floors = Math.max(2, Math.round(hgt / 3.1));
  const cols = Math.max(3, Math.round(w / 3.4));
  const [c1, c2] = pastel;
  const map = canvasTex(128, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, c1); grad.addColorStop(1, c2);
    g.fillStyle = grad; g.fillRect(0, 0, 128, 256);
    const cw = 128 / cols, ch = 256 / floors;
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      const lit = Math.random() < 0.34;
      g.fillStyle = lit ? '#ffd98c' : '#33506b';
      g.fillRect(c * cw + cw * 0.22, f * ch + ch * 0.2, cw * 0.56, ch * 0.55);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(c * cw + cw * 0.22, f * ch + ch * 0.2, cw * 0.56, ch * 0.14);
    }
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 250, 128, 6);
  });
  const emissive = canvasTex(128, 256, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 256);
    const cw = 128 / cols, ch = 256 / floors;
    // Re-draw the same-ish lit pattern: deterministic-ish via seeded pattern is overkill;
    // a warm scatter reads fine at dusk.
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      if ((f * 7 + c * 13) % 10 < 3) {
        g.fillStyle = '#ffbe78';
        g.fillRect(c * cw + cw * 0.22, f * ch + ch * 0.2, cw * 0.56, ch * 0.55);
      }
    }
  });
  return { map, emissive };
}

function signTexture(text, bg, fg) {
  return canvasTex(512, 96, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 96);
    g.fillStyle = fg;
    g.font = 'bold 54px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 52);
  });
}

export function buildCity(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const platforms = [];
  const parkingSpots = [];
  const animated = { boats: [], waterTex: null, clouds: [] };

  // ---------- sky dome ----------
  const sunDir = new THREE.Vector3(-0.62, 0.30, -0.42).normalize();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sunDir: { value: sunDir } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'varying vec3 vDir; uniform vec3 sunDir;',
        'void main(){',
        ' float h = clamp(vDir.y, -0.12, 1.0);',
        ' vec3 zen = vec3(0.16, 0.36, 0.66);',
        ' vec3 mid = vec3(0.98, 0.62, 0.38);',
        ' vec3 hor = vec3(1.0, 0.78, 0.52);',
        ' vec3 col = mix(hor, mid, smoothstep(0.0, 0.18, h));',
        ' col = mix(col, zen, smoothstep(0.12, 0.65, h));',
        ' float s = max(dot(normalize(vDir), sunDir), 0.0);',
        ' col += vec3(1.0, 0.75, 0.42) * pow(s, 220.0) * 1.4;',
        ' col += vec3(1.0, 0.6, 0.3) * pow(s, 8.0) * 0.28;',
        ' gl_FragColor = vec4(col, 1.0);',
        '}',
      ].join('\n'),
    })
  );
  scene.add(sky);

  // ---------- lights ----------
  const sun = new THREE.DirectionalLight(0xffb36b, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -130; sun.shadow.camera.right = 130;
  sun.shadow.camera.top = 130; sun.shadow.camera.bottom = -130;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 520;
  sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0x9fc0ff, 0xffd9a8, 0.85);
  scene.add(hemi);
  scene.fog = new THREE.Fog(0xf7b98a, 190, 780);

  // ---------- clouds (billboard sprites) ----------
  const cloudTex = canvasTex(256, 128, (g) => {
    g.clearRect(0, 0, 256, 128);
    for (let i = 0; i < 26; i++) {
      const x = 30 + Math.random() * 196, y = 45 + Math.random() * 40, r = 16 + Math.random() * 26;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,244,230,0.55)');
      gr.addColorStop(1, 'rgba(255,244,230,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  });
  for (let i = 0; i < 13; i++) {
    const m = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.75, depthWrite: false, fog: false });
    const s = new THREE.Sprite(m);
    s.position.set(rand(-700, 700), rand(120, 190), rand(-650, 650));
    const sc = rand(160, 300);
    s.scale.set(sc, sc * 0.42, 1);
    scene.add(s);
    animated.clouds.push(s);
  }

  // ---------- ground (painted canvas) ----------
  const W2C = 3.2; // px per world unit
  const groundTex = canvasTex(2048, 1408, (g) => {
    const X = (x) => (x + 300) * W2C;
    const Z = (z) => (z + 220) * W2C;
    // base: warm city pavement / dirt
    g.fillStyle = '#77705f'; g.fillRect(0, 0, 2048, 1408);
    // park-green west strip
    g.fillStyle = '#5d7d46'; g.fillRect(0, 0, X(-246), 1408);
    // sand
    const sandGrad = g.createLinearGradient(X(BEACH_X), 0, X(WATER_X), 0);
    sandGrad.addColorStop(0, '#ecd3a0'); sandGrad.addColorStop(1, '#dfc28c');
    g.fillStyle = sandGrad; g.fillRect(X(BEACH_X), 0, X(WATER_X) - X(BEACH_X), 1408);
    // seabed under water
    g.fillStyle = '#1d6076'; g.fillRect(X(WATER_X), 0, 2048 - X(WATER_X), 1408);
    // promenade (beachfront walk)
    g.fillStyle = '#c2ab84'; g.fillRect(X(178), 0, X(BEACH_X) - X(178), 1408);
    g.fillStyle = 'rgba(120,90,50,0.25)';
    for (let x = 180; x < BEACH_X; x += 4) g.fillRect(X(x), 0, 1.5, 1408);
    // block sidewalks
    g.fillStyle = '#98917f';
    const blockEdges = [-300, ...ROAD_X.flatMap(r => [r - ROAD_HALF, r + ROAD_HALF]), 178];
    const blockEdgesZ = [-220, ...ROAD_Z.flatMap(r => [r - ROAD_HALF, r + ROAD_HALF]), 220];
    for (let i = 0; i < blockEdges.length - 1; i += 2) {
      for (let j = 0; j < blockEdgesZ.length - 1; j += 2) {
        g.fillRect(X(blockEdges[i]) - 3, Z(blockEdgesZ[j]) - 3,
          (blockEdges[i + 1] - blockEdges[i]) * W2C + 6, (blockEdgesZ[j + 1] - blockEdgesZ[j]) * W2C + 6);
      }
    }
    // roads
    g.fillStyle = '#3a3d42';
    for (const rx of ROAD_X) g.fillRect(X(rx - ROAD_HALF), 0, ROAD_HALF * 2 * W2C, 1408);
    for (const rz of ROAD_Z) g.fillRect(0, Z(rz - ROAD_HALF), 2048, ROAD_HALF * 2 * W2C);
    // centre dashes
    g.fillStyle = '#e8c95a';
    for (const rx of ROAD_X) for (let z = -216; z < 216; z += 8) {
      if (ROAD_Z.some(rz => Math.abs(z - rz) < 11)) continue;
      g.fillRect(X(rx) - 1, Z(z), 2, 4.2 * W2C * 0.45);
    }
    for (const rz of ROAD_Z) for (let x = -296; x < 200; x += 8) {
      if (ROAD_X.some(rx => Math.abs(x - rx) < 11)) continue;
      g.fillRect(X(x), Z(rz) - 1, 4.2 * W2C * 0.45, 2);
    }
    // crosswalks
    g.fillStyle = 'rgba(240,240,235,0.85)';
    for (const rx of ROAD_X) for (const rz of ROAD_Z) {
      for (let s = -6; s <= 6; s += 2.4) {
        g.fillRect(X(rx + s) - 2, Z(rz - ROAD_HALF) - 1, 4, 5);
        g.fillRect(X(rx + s) - 2, Z(rz + ROAD_HALF) - 4, 4, 5);
        g.fillRect(X(rx - ROAD_HALF) - 1, Z(rz + s) - 2, 5, 4);
        g.fillRect(X(rx + ROAD_HALF) - 4, Z(rz + s) - 2, 5, 4);
      }
    }
  });
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(640, 440),
    new THREE.MeshLambertMaterial({ map: groundTex })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(20, 0, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // ---------- water ----------
  const waterTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#2b7f96'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 380; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.13})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 22, 1.6);
    }
    for (let i = 0; i < 200; i++) {
      g.fillStyle = `rgba(10,60,80,${Math.random() * 0.2})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 8 + Math.random() * 26, 2);
    }
  });
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(7, 26);
  animated.waterTex = waterTex;
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 440),
    new THREE.MeshPhongMaterial({ map: waterTex, shininess: 120, specular: 0xffca90, transparent: true, opacity: 0.94 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(WATER_X + 73, -0.35, 0);
  group.add(water);

  // ---------- buildings ----------
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5c554e });
  const roofMat2 = new THREE.MeshLambertMaterial({ color: 0x746a5e });

  function addBuilding(x, z, w, d, h, opts = {}) {
    const pastel = opts.palette || choice(PALETTES);
    const { map, emissive } = facadeTextures(w, h, pastel);
    const sideMat = new THREE.MeshLambertMaterial({ map, emissiveMap: emissive, emissive: 0xffb765, emissiveIntensity: 0.85 });
    const mats = [sideMat, sideMat, opts.roofMat || roofMat, roofMat2, sideMat, sideMat];
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
    m.position.set(x, h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
    // awning for low-rise
    if (opts.awning) {
      const aw = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.18, 2.2),
        new THREE.MeshLambertMaterial({ color: opts.awning }));
      aw.position.set(x, 3.1, z + d / 2 + 1.0);
      aw.rotation.x = 0.35;
      group.add(aw);
    }
    return m;
  }

  // rooftop props (downtown)
  const acGeo = new THREE.BoxGeometry(2.4, 1.1, 1.8);
  const acMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a4 });
  const tankGeo = new THREE.CylinderGeometry(1.5, 1.5, 3.4, 8);
  const tankRoofGeo = new THREE.ConeGeometry(1.8, 1.1, 8);
  const tankMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4e });
  const antGeo = new THREE.CylinderGeometry(0.06, 0.1, 6, 4);
  const antMat = new THREE.MeshLambertMaterial({ color: 0x44484c });
  function roofProps(x, z, w, d, h) {
    const n = randi(1, 3);
    for (let i = 0; i < n; i++) {
      const px = x + rand(-w / 4, w / 4), pz = z + rand(-d / 4, d / 4);
      const kind = randi(0, 2);
      if (kind === 0) {
        const ac = new THREE.Mesh(acGeo, acMat);
        ac.position.set(px, h + 0.55, pz); ac.castShadow = true;
        group.add(ac);
      } else if (kind === 1) {
        const t = new THREE.Mesh(tankGeo, tankMat);
        t.position.set(px, h + 1.7, pz); t.castShadow = true;
        const r = new THREE.Mesh(tankRoofGeo, tankMat);
        r.position.set(px, h + 3.9, pz);
        group.add(t); group.add(r);
      } else {
        const a = new THREE.Mesh(antGeo, antMat);
        a.position.set(px, h + 3, pz);
        group.add(a);
      }
    }
  }

  // Landmark blocks are handled separately below; skip them in the generic pass.
  const landmarkBlocks = new Set(['2,1', '3,2', '5,2', '1,4', '4,4']);
  // block index: i over x-slots between roads, j over z-slots
  const xSlots = [[-262, -238], [-222, -158], [-142, -78], [-62, 2], [18, 82], [98, 162]];
  const zSlots = [[-196, -158], [-142, -78], [-62, 2], [18, 82], [98, 172]];
  for (let i = 0; i < xSlots.length; i++) {
    for (let j = 0; j < zSlots.length; j++) {
      if (landmarkBlocks.has(i + ',' + j)) continue;
      const [x0, x1] = xSlots[i], [z0, z1] = zSlots[j];
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const bw = x1 - x0, bd = z1 - z0;
      const district = cx < 2 ? 'downtown' : cx < 90 ? 'midtown' : 'beach';
      if (Math.random() < 0.10) {
        // parking lot block: stalls + a few parked cars (positions exported)
        const lot = new THREE.Mesh(new THREE.BoxGeometry(bw - 4, 0.12, bd - 4),
          new THREE.MeshLambertMaterial({ color: 0x4a4d52 }));
        lot.position.set(cx, 0.06, cz); lot.receiveShadow = true;
        group.add(lot);
        for (let s = 0; s < 6; s++) {
          if (Math.random() < 0.75) {
            parkingSpots.push({ x: x0 + 8 + (s % 3) * 7, z: z0 + 10 + Math.floor(s / 3) * (bd - 20), heading: Math.PI / 2 });
          }
        }
        continue;
      }
      const lots = district === 'downtown' ? randi(1, 2) : randi(2, 3);
      for (let l = 0; l < lots; l++) {
        const lw = (bw - 8) / lots;
        const lx = x0 + 4 + lw * (l + 0.5);
        const w = lw * rand(0.78, 0.95), d = (bd - 8) * rand(0.7, 0.92);
        const h = district === 'downtown' ? rand(19, 44) : district === 'midtown' ? rand(10, 21) : rand(6, 12);
        addBuilding(lx, cz + rand(-2, 2), w, d, h, {
          awning: district === 'beach' ? choice([0xc9563c, 0x2e8f86, 0xe0a83c]) : null,
        });
        if (district === 'downtown') roofProps(lx, cz, w, d, h);
      }
    }
  }

  // ---------- landmarks ----------
  const landmarks = {};

  function addSign(text, x, y, z, w, bg, fg, rotY = 0) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.19),
      new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg) }));
    s.position.set(x, y, z); s.rotation.y = rotY;
    group.add(s);
    return s;
  }

  // Police station (block x[-142,-78], z[-142,-78])
  {
    addBuilding(-110, -118, 44, 34, 13, { palette: ['#cfd8de', '#aebac2'] });
    addSign('POLICE', -110, 10.5, -100.8, 26, '#1d3a5f', '#ffffff');
    addSign('PALMSHADE PD', -110, 7.6, -100.8, 20, '#1d3a5f', '#ffd98c');
    landmarks.policeStation = { x: -110, z: -92 };
  }

  // Parking garage (block x[-62,2], z[-62,2]): three open slabs + pillars
  {
    const slabMat = new THREE.MeshLambertMaterial({ color: 0x8f8a80 });
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0x7c766c });
    // ground floor is the street itself; two raised decks above it
    for (let lvl = 1; lvl <= 2; lvl++) {
      const y = lvl * 3.4;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(56, 0.5, 56), slabMat);
      slab.position.set(-30, y, -30);
      slab.castShadow = true; slab.receiveShadow = true;
      group.add(slab);
      platforms.push({ x0: -58, z0: -58, x1: -2, z1: -2, top: y + 0.25 });
    }
    const pilGeo = new THREE.BoxGeometry(1.1, 7.6, 1.1);
    for (const px of [-56, -30, -4]) for (const pz of [-56, -30, -4]) {
      const p = new THREE.Mesh(pilGeo, pillarMat);
      p.position.set(px, 3.8, pz); p.castShadow = true;
      group.add(p);
    }
    addSign('PARKING', -30, 8.6, -1.6, 24, '#37414a', '#ffd98c');
    landmarks.garage = { x: -30, z: -30 };
    // crate stairs up the east edge to deck 1 (top 3.65) — crates overlap the slab edge
    const crateMat = new THREE.MeshLambertMaterial({ color: 0xa8793f });
    for (let k = 0; k < 5; k++) {
      const top = 0.68 * (k + 1);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(2.2, top, 2.2), crateMat);
      crate.position.set(-1.2, top / 2, -13 - k * 2.3);
      crate.castShadow = true;
      group.add(crate);
      platforms.push({ x0: -2.3, z0: -14.1 - k * 2.3, x1: -0.1, z1: -11.9 - k * 2.3, top });
    }
  }

  // Café Marisol (block x[98,162], z[-62,2]) + terrace platform
  {
    addBuilding(126, -30, 34, 44, 9, { palette: ['#f6e3c2', '#e8cca0'], awning: 0xc9563c });
    addSign('CAFÉ MARISOL', 126, 7.4, -7.7, 24, '#7a2d1d', '#ffe9c4');
    // terrace: raised deck east of the café, tables + umbrellas
    const deckMat = new THREE.MeshLambertMaterial({ color: 0xb08c5a });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(17, 0.9, 34), deckMat);
    deck.position.set(155.5, 0.45, -30);
    deck.receiveShadow = true; deck.castShadow = true;
    group.add(deck);
    platforms.push({ x0: 147, z0: -47, x1: 164, z1: -13, top: 0.9 });
    // steps on the east side
    for (let k = 0; k < 2; k++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3 + k * 0.3, 6), deckMat);
      st.position.set(165.2 + (1 - k) * 1.1, (0.3 + k * 0.3) / 2, -30);
      group.add(st);
      platforms.push({ x0: 164 + (1 - k) * 1.1 - 1.2, z0: -33, x1: 164 + (1 - k) * 1.1 + 1.2, z1: -27, top: 0.3 + k * 0.3 });
    }
    const tableMat = new THREE.MeshLambertMaterial({ color: 0xf2ead8 });
    const umbMats = [0xc9563c, 0x2e8f86, 0xe0a83c].map(c => new THREE.MeshLambertMaterial({ color: c }));
    for (let i = 0; i < 3; i++) {
      const tz = -40 + i * 10;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.12, 10), tableMat);
      top.position.set(155, 1.95, tz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 5), tableMat);
      pole.position.set(155, 1.4, tz);
      const umb = new THREE.Mesh(new THREE.ConeGeometry(2.3, 0.8, 8), umbMats[i % 3]);
      umb.position.set(155, 3.1, tz); umb.castShadow = true;
      group.add(top); group.add(pole); group.add(umb);
    }
    landmarks.cafe = { x: 143, z: -30 };
    landmarks.marisol = { x: 168, z: -24 };   // she stands on the promenade by the terrace steps
    landmarks.cafeTerrace = { x: 155, z: -30, y: 0.9 };
  }

  // Warehouse (block x[-222,-158], z[98,172]) + yard + annex roof with crate stairs
  {
    const wh = new THREE.Mesh(new THREE.BoxGeometry(46, 12, 34),
      new THREE.MeshLambertMaterial({ color: 0x9c8d7a }));
    wh.position.set(-196, 6, 122); wh.castShadow = true; wh.receiveShadow = true;
    group.add(wh);
    colliders.push({ x0: -219, z0: 105, x1: -173, z1: 139 });
    addSign('WAREHOUSE 7', -196, 9.5, 139.3, 30, '#4a3b28', '#ffd98c');
    // annex (low, flat roof you can climb)
    const annex = new THREE.Mesh(new THREE.BoxGeometry(16, 2.4, 20),
      new THREE.MeshLambertMaterial({ color: 0xb3a189 }));
    annex.position.set(-164, 1.2, 122); annex.castShadow = true;
    group.add(annex);
    platforms.push({ x0: -172, z0: 112, x1: -156, z1: 132, top: 2.4 });
    const crateMat = new THREE.MeshLambertMaterial({ color: 0xa8793f });
    const crateGeo = new THREE.BoxGeometry(1.9, 1, 1.9);
    // crate stairs: 0.6, 1.2, 1.8 south of the annex
    [[-164, 135.5, 0.6], [-164, 133.4, 1.2], [-164, 131.3, 1.8]].forEach(([cx, cz, top]) => {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.9, top, 1.9), crateMat);
      crate.position.set(cx, top / 2, cz);
      crate.castShadow = true;
      group.add(crate);
      platforms.push({ x0: cx - 0.95, z0: cz - 0.95, x1: cx + 0.95, z1: cz + 0.95, top });
    });
    // scattered yard crates (visual)
    for (let i = 0; i < 9; i++) {
      const cx = rand(-216, -178), cz = rand(146, 166);
      const crate = new THREE.Mesh(crateGeo, crateMat);
      crate.position.set(cx, 0.5 + (i % 3 === 0 ? 1 : 0), cz);
      crate.rotation.y = rand(0, 3);
      crate.castShadow = true;
      group.add(crate);
    }
    landmarks.warehouse = { x: -196, z: 150 };
  }

  // Hospital (block x[18,82], z[98,172])
  {
    addBuilding(50, 128, 46, 30, 10, { palette: ['#eef2f2', '#d4dddd'] });
    addSign('PALMSHADE GENERAL', 50, 8.2, 143.3, 30, '#b03030', '#ffffff');
    landmarks.hospital = { x: 50, z: 148 };
  }

  // ---------- marina: pier + boats ----------
  {
    const deckMat = new THREE.MeshLambertMaterial({ color: 0x9a7c56 });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(60, 0.85, 18), deckMat);
    pier.position.set(264, 0.425, 38);
    pier.castShadow = true; pier.receiveShadow = true;
    group.add(pier);
    platforms.push({ x0: 234, z0: 29, x1: 294, z1: 47, top: 0.85 });
    const postGeo = new THREE.CylinderGeometry(0.3, 0.3, 2.4, 6);
    const postMat = new THREE.MeshLambertMaterial({ color: 0x6e5638 });
    for (let px = 240; px <= 290; px += 10) for (const pz of [31, 45]) {
      const p = new THREE.Mesh(postGeo, postMat);
      p.position.set(px, -0.6, pz);
      group.add(p);
    }
    // boats
    const hullMats = [0xe8e2d4, 0xc9563c, 0x2e6f8f, 0xe0a83c, 0x7dab8c].map(c => new THREE.MeshLambertMaterial({ color: c }));
    const boatSpots = [[252, 8], [268, 66], [284, 12], [258, 96], [290, 84]];
    boatSpots.forEach(([bx, bz], i) => {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.1, 2.4), hullMats[i % hullMats.length]);
      hull.position.y = 0.4;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 1.8),
        new THREE.MeshLambertMaterial({ color: 0xf4efe4 }));
      cabin.position.set(-0.4, 1.4, 0);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5.4, 4),
        new THREE.MeshLambertMaterial({ color: 0x8a8a8a }));
      mast.position.set(1.2, 3.2, 0);
      boat.add(hull); boat.add(cabin); boat.add(mast);
      boat.position.set(bx, -0.25, bz);
      boat.rotation.y = rand(-0.4, 0.4);
      group.add(boat);
      animated.boats.push({ g: boat, phase: rand(0, 6), baseY: -0.25 });
    });
    landmarks.pierEnd = { x: 288, z: 38 };
    landmarks.marina = { x: 250, z: 38 };
  }

  // ---------- beach props ----------
  {
    const umbCols = [0xc9563c, 0xe0a83c, 0x2e8f86, 0xe77fb0, 0x4a7fc9];
    for (let i = 0; i < 13; i++) {
      const ux = rand(212, 230), uz = rand(-180, 180);
      if (Math.abs(uz - 38) < 14) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5),
        new THREE.MeshLambertMaterial({ color: 0xd8d0c0 }));
      pole.position.set(ux, 1.2, uz);
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.7, 8),
        new THREE.MeshLambertMaterial({ color: choice(umbCols) }));
      top.position.set(ux, 2.5, uz); top.castShadow = true;
      const towel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.9),
        new THREE.MeshLambertMaterial({ color: choice(umbCols) }));
      towel.position.set(ux + rand(-1.6, 1.6), 0.05, uz + rand(1.4, 2.2));
      towel.rotation.y = rand(0, 3);
      group.add(pole); group.add(top); group.add(towel);
    }
    // lifeguard stand (climbable platform)
    const lgMat = new THREE.MeshLambertMaterial({ color: 0xf0e8da });
    const stand = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, 2.6), lgMat);
    stand.position.set(224, 1.7, -64);
    stand.castShadow = true;
    group.add(stand);
    platforms.push({ x0: 222.7, z0: -65.3, x1: 225.3, z1: -62.7, top: 1.83 });
    for (let k = 0; k < 3; k++) {
      const top = 0.55 * (k + 1);
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.4, top, 0.9), lgMat);
      step.position.set(220.6 + k * 0.95, top / 2, -64);
      group.add(step);
      platforms.push({ x0: 219.9 + k * 0.95, z0: -64.45, x1: 221.3 + k * 0.95, z1: -63.55, top });
    }
    const lgSign = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 0.18),
      new THREE.MeshLambertMaterial({ color: 0xc9563c }));
    lgSign.position.set(224, 2.6, -64);
    group.add(lgSign);
    // volleyball net
    const netMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const net = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.1), netMat);
    net.position.set(222, 1.15, 58); net.rotation.y = Math.PI / 2;
    group.add(net);
    for (const nz of [53.5, 62.5]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2, 5), lgMat);
      p.position.set(222, 1, nz);
      group.add(p);
    }
    landmarks.lifeguard = { x: 224, z: -64, y: 1.83 };
  }

  // ---------- street props (benches, hydrants, bins, bus stop) ----------
  {
    const benchMat = new THREE.MeshLambertMaterial({ color: 0x7a5c38 });
    const benchGeo = mergeGeoms([
      new THREE.BoxGeometry(2.2, 0.12, 0.6).translate(0, 0.5, 0),
      new THREE.BoxGeometry(2.2, 0.5, 0.1).translate(0, 0.85, -0.26),
      new THREE.BoxGeometry(0.12, 0.5, 0.55).translate(-0.95, 0.25, 0),
      new THREE.BoxGeometry(0.12, 0.5, 0.55).translate(0.95, 0.25, 0),
    ]);
    const hydGeo = mergeGeoms([
      new THREE.CylinderGeometry(0.16, 0.2, 0.7, 6).translate(0, 0.35, 0),
      new THREE.SphereGeometry(0.17, 6, 5).translate(0, 0.75, 0),
    ]);
    const hydMat = new THREE.MeshLambertMaterial({ color: 0xd23c2a });
    const binGeo = new THREE.CylinderGeometry(0.34, 0.3, 0.85, 7);
    const binMat = new THREE.MeshLambertMaterial({ color: 0x3f6e4e });
    const spots = [];
    for (let z = -196; z <= 196; z += 28) spots.push([196, z]);
    for (const rx of ROAD_X) for (const rz of ROAD_Z) {
      spots.push([rx + 11, rz + 11]); spots.push([rx - 11, rz - 11]);
    }
    spots.forEach(([sx, sz], i) => {
      if (sx > BEACH_X) return;
      const kind = i % 3;
      let mesh;
      if (kind === 0) mesh = new THREE.Mesh(benchGeo, benchMat);
      else if (kind === 1) mesh = new THREE.Mesh(hydGeo, hydMat);
      else mesh = new THREE.Mesh(binGeo, binMat);
      mesh.position.set(sx, 0, sz);
      mesh.rotation.y = rand(0, Math.PI);
      mesh.castShadow = true;
      group.add(mesh);
    });
    // bus stop near the café
    const shelter = new THREE.Group();
    const roofB = new THREE.Mesh(new THREE.BoxGeometry(5, 0.15, 1.8),
      new THREE.MeshLambertMaterial({ color: 0x2e8f86 }));
    roofB.position.y = 2.5;
    shelter.add(roofB);
    for (const px of [-2.3, 2.3]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.5, 5), binMat);
      post.position.set(px, 1.25, -0.7);
      shelter.add(post);
    }
    const bench = new THREE.Mesh(benchGeo, benchMat);
    shelter.add(bench);
    shelter.position.set(182, 0, 26);
    group.add(shelter);
  }

  // ---------- palms (instanced) ----------
  {
    const trunkGeo = new THREE.CylinderGeometry(0.13, 0.24, 1, 5);
    trunkGeo.translate(0, 0.5, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
    const leafTex = canvasTex(128, 64, (g) => {
      g.clearRect(0, 0, 128, 64);
      g.fillStyle = '#3f8f3f';
      g.beginPath();
      g.moveTo(0, 32);
      g.quadraticCurveTo(60, 6, 128, 30);
      g.quadraticCurveTo(60, 40, 0, 32);
      g.fill();
      g.strokeStyle = '#2f7030'; g.lineWidth = 2;
      for (let i = 1; i < 8; i++) {
        g.beginPath(); g.moveTo(i * 15, 30); g.lineTo(i * 15 + 7, 12 + (i % 3) * 8); g.stroke();
      }
    });
    leafTex.wrapS = THREE.ClampToEdgeWrapping;
    const fronds = [];
    for (let i = 0; i < 8; i++) {
      const p = new THREE.PlaneGeometry(3.4, 1.15);
      p.translate(1.55, 0, 0);
      p.rotateX(-0.5);
      p.rotateY((i / 8) * Math.PI * 2);
      fronds.push(p);
    }
    const frondGeo = mergeGeoms(fronds);
    const frondMat = new THREE.MeshLambertMaterial({ map: leafTex, alphaTest: 0.45, side: THREE.DoubleSide });
    const palmPos = [];
    for (let z = -200; z <= 200; z += 15) { palmPos.push([192 + rand(-2, 2), z + rand(-3, 3)]); }
    for (let z = -196; z <= 196; z += 24) { palmPos.push([182, z + 6]); palmPos.push([-176, z]); }
    for (let i = 0; i < 26; i++) palmPos.push([rand(-250, 160), rand(-200, 200)]);
    // keep palms off roads/buildings roughly: reject if on a road centre band
    const finalPalms = palmPos.filter(([x, z]) =>
      !ROAD_X.some(rx => Math.abs(x - rx) < 10) && !ROAD_Z.some(rz => Math.abs(z - rz) < 10));
    const n = finalPalms.length;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, n);
    const crowns = new THREE.InstancedMesh(frondGeo, frondMat, n);
    const dummy = new THREE.Object3D();
    finalPalms.forEach(([x, z], i) => {
      const h = rand(5.5, 9.5);
      const lean = rand(0.04, 0.16), la = rand(0, Math.PI * 2);
      dummy.position.set(x, 0, z);
      dummy.rotation.set(Math.cos(la) * lean, rand(0, 3), Math.sin(la) * lean);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      // crown sits at the trunk top (accounting for lean, approximately)
      dummy.position.set(x + Math.sin(la) * lean * h * -0.9, h * 0.99, z + Math.cos(la) * lean * h * 0.0);
      dummy.position.x = x - Math.sin(dummy.rotation.z) * h;
      dummy.position.z = z + Math.sin(dummy.rotation.x) * h;
      dummy.scale.set(rand(0.9, 1.3), 1, rand(0.9, 1.3));
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
    });
    trunks.castShadow = true; crowns.castShadow = true;
    group.add(trunks); group.add(crowns);
  }

  // ---------- streetlights (instanced) ----------
  {
    const poleGeo = mergeGeoms([
      new THREE.CylinderGeometry(0.07, 0.09, 5.6, 5).translate(0, 2.8, 0),
      new THREE.BoxGeometry(1.4, 0.09, 0.09).translate(0.6, 5.55, 0),
    ]);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3c4046 });
    const headGeo = new THREE.BoxGeometry(0.7, 0.14, 0.3);
    const headMat = new THREE.MeshLambertMaterial({ color: 0x554e33, emissive: 0xffca7a, emissiveIntensity: 1.4 });
    const positions = [];
    for (const rx of ROAD_X) for (let z = -200; z <= 200; z += 27) positions.push([rx + 9.3, z, Math.PI]);
    for (const rz of ROAD_Z) for (let x = -260; x <= 190; x += 27) positions.push([x, rz + 9.3, Math.PI / 2]);
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, positions.length);
    const heads = new THREE.InstancedMesh(headGeo, headMat, positions.length);
    const dummy = new THREE.Object3D();
    positions.forEach(([x, z, ry], i) => {
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, ry, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x + Math.sin(ry) * 0.0 + (ry === Math.PI ? -0.6 : 0), 5.5, z + (ry === Math.PI / 2 ? 0.6 : 0));
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
    });
    group.add(poles); group.add(heads);
  }

  // ---------- ground height (platforms / water) ----------
  function groundHeightAt(x, z, curY) {
    let y = x > WATER_X ? -0.55 : 0;
    for (const p of platforms) {
      if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) {
        if (p.top <= curY + 0.9 && p.top > y) y = p.top;
      }
    }
    return y;
  }

  function collide(x, z, radius) {
    // returns corrected [x, z] pushed out of building AABBs
    for (const c of colliders) {
      const nx = clamp(x, c.x0, c.x1), nz = clamp(z, c.z0, c.z1);
      const dx = x - nx, dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          x = nx + (dx / d) * radius; z = nz + (dz / d) * radius;
        } else {
          // inside: push out along smallest penetration
          const pl = x - c.x0, pr = c.x1 - x, pt = z - c.z0, pb = c.z1 - z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = c.x0 - radius; else if (m === pr) x = c.x1 + radius;
          else if (m === pt) z = c.z0 - radius; else z = c.z1 + radius;
        }
      }
    }
    return [x, z];
  }

  function update(dt, t) {
    if (animated.waterTex) animated.waterTex.offset.set(t * 0.008, t * 0.013);
    for (const b of animated.boats) {
      b.g.position.y = b.baseY + Math.sin(t * 0.9 + b.phase) * 0.12;
      b.g.rotation.z = Math.sin(t * 0.7 + b.phase) * 0.03;
      b.g.rotation.x = Math.cos(t * 0.6 + b.phase) * 0.02;
    }
    for (const c of animated.clouds) {
      c.position.x += dt * 1.1;
      if (c.position.x > 760) c.position.x = -760;
    }
    // sun shadow follows the sky group origin; main.js moves the light itself
    sky.position.copy(scene.camera ? scene.camera.position : sky.position);
  }

  return { group, colliders, platforms, parkingSpots, landmarks, groundHeightAt, collide, update, sun, sunDir };
}
