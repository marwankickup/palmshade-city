// city.js — Palmshade City: sky, golden-hour light, painted ground, two districts,
// landmarks (Café Marisol, Warehouse 7, Palmshade PD, parking garage), marina,
// beach props, street props, instanced palms + streetlights, colliders.
import * as THREE from 'three';
import { ROADS, ROAD_W, BEACH_X, WATER_X, addCollider, mulberry32 } from './util.js';

const BC = [-150, -90, -30, 30, 90, 150]; // block centres
const rng = mulberry32(20240);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function facadeTextures(base, litRatio) {
  const r = mulberry32((base.length * 977) % 100000);
  const map = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let y = 10; y < h - 12; y += 22) for (let x = 10; x < w - 12; x += 24) {
      g.fillStyle = r() < 0.5 ? '#2b3542' : '#3d4a5a'; g.fillRect(x, y, 14, 13);
    }
  });
  const emissiveMap = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let y = 10; y < h - 12; y += 22) for (let x = 10; x < w - 12; x += 24) {
      if (r() < litRatio) { g.fillStyle = '#ffb85c'; g.fillRect(x, y, 14, 13); }
    }
  });
  return { map, emissiveMap };
}
function signTexture(text, bg, fg) {
  return canvasTex(512, 96, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = 'bold 52px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}
const box = (mat, w, h, d, x, y, z, parent, shadow = true) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); if (shadow) { m.castShadow = true; m.receiveShadow = true; }
  parent.add(m); return m;
};

export const landmarks = {
  cafe: { x: 150, z: -30 },
  marisol: { x: 160, z: -25 },
  vanSpawn: { x: 172, z: -52, heading: Math.PI },
  policeStation: { x: -30, z: -150 },
  respawn: { x: -30, z: -124, heading: Math.PI },
  warehouse: { x: -150, z: 150 },
  garage: { x: 90, z: 90 },
  marina: { x: 250, z: 0 },
  dario: { x: 244, z: 4 },
  boatDock: { x: 274, z: -10 },
  pierEnd: { x: 284, z: 0 },
  park: { x: -30, z: 30 },
};
export const packageSpots = [
  { x: 158, y: 1.0, z: -36 },   // café terrace
  { x: 284, y: 0.9, z: 0 },     // pier end
  { x: 80, y: 6.4, z: 80 },     // garage roof
  { x: -160, y: 8, z: 140 },    // warehouse roof
  { x: 232, y: 1.6, z: 60 },    // lifeguard stand
  { x: -30, y: 0, z: 30 },      // park gazebo
  { x: 238, y: 0, z: -80 },     // beach umbrellas
  { x: -97, y: 0, z: -76 },     // downtown alley
  { x: 248, y: 0.9, z: 40 },    // marina dock
  { x: 144, y: 8, z: 84 },      // beachfront rooftop
  { x: 100, y: 6.4, z: 98 },    // garage roof, far corner
  { x: -140, y: 8, z: 158 },    // warehouse roof, north end
  { x: 140, y: 7, z: -30 },     // café roof (crate stairs on the west side)
  { x: 222, y: 3.4, z: 22 },    // marina hut roof (crates beside it)
  { x: 240, y: 0, z: -140 },    // south beach
  { x: 236, y: 0, z: 150 },     // north beach
  { x: -52, y: 0, z: 48 },      // park west edge
  { x: 68, y: 0, z: -186 },     // south sidewalk
  { x: -186, y: 0, z: 60 },     // west sidewalk
  { x: 196, y: 0, z: -160 },    // promenade south end
];

let waterMat, boats = [], clouds = [];
export function updateCity(dt, t) {
  if (waterMat) {
    waterMat.map.offset.x = t * 0.015;
    waterMat.map.offset.y = Math.sin(t * 0.11) * 0.03;
    waterMat.opacity = 0.9 + Math.sin(t * 0.8) * 0.04;
  }
  for (const b of boats) {
    b.position.y = Math.sin(t * 0.9 + b.userData.phase) * 0.16 - 0.1;
    b.rotation.z = Math.sin(t * 0.7 + b.userData.phase) * 0.03;
    b.rotation.x = Math.cos(t * 0.5 + b.userData.phase) * 0.02;
  }
  for (const c of clouds) {
    c.position.x += dt * 0.7;
    if (c.position.x > 420) c.position.x = -420;
  }
}

function crateStairs(parent, mat, x, z, dx, dz, topH, step = 0.8, wdt = 2.4) {
  const n = Math.round(topH / step);
  for (let i = 0; i < n; i++) {
    const h = step * (i + 1);
    const cx = x + dx * i * 1.7, cz = z + dz * i * 1.7;
    box(mat, dx !== 0 ? 1.8 : wdt, h, dz !== 0 ? 1.8 : wdt, cx, h / 2, cz, parent);
    addCollider(cx, cz, dx !== 0 ? 1.8 : wdt, dz !== 0 ? 1.8 : wdt, h);
  }
}

export function buildCity(scene) {
  // ---------- sky, sun, lights ----------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = normalize(vP).y;
          vec3 top = vec3(0.10,0.30,0.56);
          vec3 mid = vec3(1.0,0.66,0.33);
          vec3 low = vec3(1.0,0.44,0.24);
          vec3 c = h > 0.22 ? mix(mid, top, smoothstep(0.22,0.75,h)) : mix(low, mid, smoothstep(-0.06,0.22,h));
          float sunAmt = pow(max(dot(normalize(vP), normalize(vec3(-0.62,0.30,-0.33))), 0.0), 6.0);
          c += vec3(1.0,0.55,0.22) * sunAmt * 0.45;
          gl_FragColor = vec4(c,1.0);
        }`,
    }));
  scene.add(sky);
  scene.fog = new THREE.Fog(0xe8905c, 230, 720);
  const hemi = new THREE.HemisphereLight(0xffd9a8, 0x4a5a6a, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb36b, 2.0);
  sun.position.set(-260, 190, -140);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 900; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.5;
  scene.add(sun); scene.add(sun.target);
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
      gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.35, 'rgba(255,190,90,0.85)'); gr.addColorStop(1, 'rgba(255,150,60,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }), transparent: true, depthWrite: false, fog: false,
  }));
  sunSprite.position.set(-620, 300, -330); sunSprite.scale.setScalar(190);
  scene.add(sunSprite);
  const cloudTex = canvasTex(256, 128, (g) => {
    for (const [x, y, r] of [[70, 80, 42], [128, 66, 54], [186, 82, 40], [105, 88, 36]]) {
      const gr = g.createRadialGradient(x, y, 2, x, y, r);
      gr.addColorStop(0, 'rgba(255,235,220,0.85)'); gr.addColorStop(1, 'rgba(255,235,220,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  });
  clouds = [];
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
    s.position.set(rng() * 760 - 380, 120 + rng() * 90, rng() * 700 - 350);
    s.scale.set(120 + rng() * 130, 42 + rng() * 30, 1);
    scene.add(s); clouds.push(s);
  }

  // ---------- ground ----------
  const S = 1024, W2P = S / 680, px = v => (v + 340) * W2P;
  const groundTex = canvasTex(S, S, (g) => {
    g.fillStyle = '#3f444b'; g.fillRect(0, 0, S, S);
    for (const bx of BC) for (const bz of BC) {
      g.fillStyle = (bx === -30 && bz === 30) ? '#4d7c4d' : '#494e55';
      g.fillRect(px(bx - 23), px(bz - 23), 46 * W2P, 46 * W2P);
      g.strokeStyle = '#787f88'; g.lineWidth = 3;
      g.strokeRect(px(bx - 23), px(bz - 23), 46 * W2P, 46 * W2P);
    }
    g.fillStyle = '#dbba7d'; g.fillRect(px(BEACH_X), 0, px(WATER_X) - px(BEACH_X), S);
    g.fillStyle = '#0d4a63'; g.fillRect(px(WATER_X), 0, S - px(WATER_X), S);
    g.fillStyle = '#2b2e33';
    for (const r of ROADS) {
      g.fillRect(px(r - ROAD_W / 2), 0, ROAD_W * W2P, S);
      g.fillRect(0, px(r - ROAD_W / 2), S, ROAD_W * W2P);
    }
    g.strokeStyle = '#f5d76e'; g.lineWidth = 2; g.setLineDash([14, 12]);
    for (const r of ROADS) {
      g.beginPath(); g.moveTo(px(r), 0); g.lineTo(px(r), S); g.stroke();
      g.beginPath(); g.moveTo(0, px(r)); g.lineTo(S, px(r)); g.stroke();
    }
    g.setLineDash([]); g.fillStyle = '#cfd4da';
    for (const rx of ROADS) for (const rz of ROADS) {
      for (let i = -2; i <= 2; i++) {
        g.fillRect(px(rx - 5 + i * 2.4), px(rz - ROAD_W / 2 - 2), 1.3 * W2P, 2.4 * W2P);
        g.fillRect(px(rx - ROAD_W / 2 - 2), px(rz - 5 + i * 2.4), 2.4 * W2P, 1.3 * W2P);
      }
    }
  });
  groundTex.wrapS = groundTex.wrapT = THREE.ClampToEdgeWrapping;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(680, 680),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  // water
  const waterTexC = canvasTex(128, 128, (g) => {
    g.fillStyle = '#14607e'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(255,255,255,0.13)';
    for (let i = 0; i < 8; i++) g.fillRect(0, i * 16 + 4, 128, 3);
  });
  waterTexC.wrapS = waterTexC.wrapT = THREE.RepeatWrapping; waterTexC.repeat.set(6, 30);
  waterMat = new THREE.MeshPhongMaterial({ map: waterTexC, transparent: true, opacity: 0.92, shininess: 120, color: 0x9fd4e8 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(150, 680), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(WATER_X + 74, -0.35, 0);
  scene.add(water);

  // ---------- buildings ----------
  const facades = [facadeTextures('#8a5a48', 0.5), facadeTextures('#5d6d7e', 0.62), facadeTextures('#a08364', 0.45), facadeTextures('#746a8a', 0.55)];
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3c4046, roughness: 1 });
  const reserved = new Set(['150,-30', '-30,-150', '-150,150', '90,90', '-30,30']);
  function building(x, z, w, d, h, fi) {
    const f = facades[fi % facades.length];
    const mat = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissiveMap, emissive: 0xffb066, emissiveIntensity: 0.85, roughness: 0.9 });
    const m = box(mat, w, h, d, x, h / 2, z, scene);
    const roof = box(roofMat, w + 0.6, 0.5, d + 0.6, x, h + 0.25, z, scene);
    roof.castShadow = false;
    if (h > 14 && rng() < 0.8) { // rooftop props
      box(roofMat, 2.4, 1.4, 2.4, x + (rng() - 0.5) * w * 0.5, h + 1.1, z + (rng() - 0.5) * d * 0.5, scene);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.6, 10), roofMat);
      tank.position.set(x - (rng() - 0.5) * w * 0.5, h + 1.8, z - (rng() - 0.5) * d * 0.5);
      tank.castShadow = true; scene.add(tank);
    }
    addCollider(x, z, w, d, h);
    return m;
  }
  for (const bx of BC) for (const bz of BC) {
    const k = bx + ',' + bz;
    if (reserved.has(k)) continue;
    const beachfront = bx === 150;
    if (beachfront) {
      const h = 7 + rng() * 4;
      building(bx - 4, bz, 26, 34, h, 2);
      // awning on the east face
      const awn = box(new THREE.MeshStandardMaterial({ color: 0xc75146, roughness: 0.8 }), 1.6, 0.18, 20, bx + 10.5, 3.4, bz, scene);
      awn.rotation.z = 0.5;
    } else if (bx === -90 && bz === -90) {
      building(bx - 8, bz, 16, 36, 22, 1); building(bx + 12, bz, 12, 36, 17, 0); // alley between them
    } else {
      const h = 17 + rng() * 24;
      building(bx, bz, 30 + rng() * 8, 30 + rng() * 8, h, (Math.abs(bx) + Math.abs(bz)) % 4);
    }
  }
  // Rooftop crate stairs run ALONG the walls (a run straight at a solid wall
  // dead-ends: the wall blocks entry until your feet are nearly at roof height).
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x9a6b3f, roughness: 0.95 });
  crateStairs(scene, crateMat, 131, 64, 0, 1, 8); // along the west wall of block (150,90) up to its h≈8 roof
  crateStairs(scene, crateMat, 129.2, -48, 0, 1, 7); // along Café Marisol's west wall to its h=7 roof

  // ---------- Café Marisol ----------
  {
    const g = new THREE.Group(); scene.add(g);
    const wall = new THREE.MeshStandardMaterial({ color: 0xf2e3c2, roughness: 0.85 });
    box(wall, 18, 7, 16, 140, 3.5, -30, g);
    addCollider(140, -30, 18, 16, 7);
    box(new THREE.MeshStandardMaterial({ color: 0xc75146 }), 19.5, 0.6, 17.5, 140, 7.3, -30, g);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(15, 2.8),
      new THREE.MeshBasicMaterial({ map: signTexture('CAFÉ MARISOL', '#7a2d20', '#ffd9a0') }));
    sign.position.set(149.2, 5.6, -30); sign.rotation.y = Math.PI / 2; g.add(sign);
    // terrace deck (h=1) with crate step
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x8a6844, roughness: 1 });
    box(deckMat, 15, 1, 13, 158, 0.5, -33, g);
    addCollider(158, -33, 15, 13, 1);
    box(crateMat, 2.2, 0.5, 2.2, 167, 0.25, -33, g); addCollider(167, -33, 2.2, 2.2, 0.5);
    // terrace tables + umbrellas
    for (const [tx, tz] of [[154, -37], [161, -29], [155, -28]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 6), roofMat);
      pole.position.set(tx, 2.3, tz); g.add(pole);
      const um = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.7, 8), new THREE.MeshStandardMaterial({ color: 0xe2725b, roughness: 0.8 }));
      um.position.set(tx, 3.7, tz); um.castShadow = true; g.add(um);
      const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.08, 10), deckMat);
      tb.position.set(tx, 1.75, tz); g.add(tb);
    }
  }
  // ---------- Palmshade PD ----------
  {
    const wall = new THREE.MeshStandardMaterial({ color: 0x9fb4c4, roughness: 0.85 });
    box(wall, 30, 10, 20, -30, 5, -150, scene);
    addCollider(-30, -150, 30, 20, 10);
    box(new THREE.MeshStandardMaterial({ color: 0x2c4a63 }), 31, 0.7, 21, -30, 10.3, -150, scene);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(17, 3),
      new THREE.MeshBasicMaterial({ map: signTexture('PALMSHADE PD', '#1d3247', '#cfe6ff') }));
    sign.position.set(-30, 7.6, -139.8); scene.add(sign);
    box(new THREE.MeshStandardMaterial({ color: 0x2c4a63 }), 8, 3, 1, -30, 1.5, -138, scene); // entrance canopy posts block
  }
  // ---------- Warehouse 7 ----------
  {
    const wall = new THREE.MeshStandardMaterial({ color: 0x7d7468, roughness: 1 });
    box(wall, 34, 8, 26, -150, 4, 150, scene);
    addCollider(-150, 150, 34, 26, 8);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 3),
      new THREE.MeshBasicMaterial({ map: signTexture('WAREHOUSE 7', '#3a352c', '#ffd9a0') }));
    sign.position.set(-150, 6.4, 136.8); sign.rotation.y = Math.PI; scene.add(sign);
    crateStairs(scene, crateMat, -168.6, 128, 0, 1, 8); // stairs up along the west wall to the roof
  }
  // ---------- Parking garage ----------
  {
    const conc = new THREE.MeshStandardMaterial({ color: 0x8d9299, roughness: 1 });
    for (const lvl of [3.2, 6.4]) {
      box(conc, 36, 0.5, 28, 90, lvl - 0.25, 90, scene);
      addCollider(90, 90, 36, 28, lvl, lvl - 0.9);
    }
    for (const cx of [-16, 0, 16]) for (const cz of [-12, 12]) {
      box(conc, 1.4, 6.4, 1.4, 90 + cx, 3.2, 90 + cz, scene);
      addCollider(90 + cx, 90 + cz, 1.4, 1.4, 6.4);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(13, 2.6),
      new THREE.MeshBasicMaterial({ map: signTexture('PARKING', '#333a42', '#ffd9a0') }));
    sign.position.set(90, 5.4, 75.8); sign.rotation.y = Math.PI; scene.add(sign);
    crateStairs(scene, crateMat, 66, 80, 1, 0, 6.4); // west-side crate stairs to the roof
  }
  // ---------- Park ----------
  {
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
    const leafM = new THREE.MeshStandardMaterial({ color: 0x3e6b34, roughness: 1 });
    for (let i = 0; i < 9; i++) {
      const x = -30 + (rng() - 0.5) * 34, z = 30 + (rng() - 0.5) * 34;
      if (Math.hypot(x + 30, z - 30) < 6) continue;
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 3, 7), trunkM);
      tr.position.set(x, 1.5, z); tr.castShadow = true; scene.add(tr);
      const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 0), leafM);
      lf.position.set(x, 4.4, z); lf.castShadow = true; scene.add(lf);
      addCollider(x, z, 0.8, 0.8, 3);
    }
    // gazebo
    for (let a = 0; a < 6; a++) {
      const x = -30 + Math.cos(a / 6 * Math.PI * 2) * 3.4, z = 30 + Math.sin(a / 6 * Math.PI * 2) * 3.4;
      box(roofMat, 0.25, 2.6, 0.25, x, 1.3, z, scene);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0xa34a3a, roughness: 0.9 }));
    roof.position.set(-30, 3.4, 30); roof.castShadow = true; scene.add(roof);
  }
  // ---------- Marina + piers + boats ----------
  boats = [];
  {
    const wood = new THREE.MeshStandardMaterial({ color: 0x7d5c39, roughness: 1 });
    box(wood, 80, 0.9, 12, 252, 0.45, 0, scene); addCollider(252, 0, 80, 12, 0.9);
    box(wood, 38, 0.9, 8, 233, 0.45, 40, scene); addCollider(233, 40, 38, 8, 0.9);
    for (let x = 220; x <= 288; x += 17) { // pier posts
      box(wood, 0.5, 1.6, 0.5, x, -0.4, -5.4, scene); box(wood, 0.5, 1.6, 0.5, x, -0.4, 5.4, scene);
    }
    const hut = new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.9 });
    box(hut, 7, 3.4, 6, 222, 1.7, 22, scene); addCollider(222, 22, 7, 6, 3.4);
    crateStairs(scene, crateMat, 211, 22, 1, 0, 3.4); // crates up the hut's west side
    const hullM = [0xe8e4da, 0x3f7fbf, 0xd1603f, 0x53a06b].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
    [[292, -22, 0.4], [298, 18, -0.3], [286, 44, 0.9], [306, -38, 0.1]].forEach(([x, z, ry], i) => {
      const b = new THREE.Group();
      const hull = box(hullM[i], 7.5, 1.6, 2.8, 0, 0.5, 0, b);
      hull.rotation.z = 0.0;
      box(new THREE.MeshStandardMaterial({ color: 0xf4f1ea }), 2.6, 1.1, 2, -0.4, 1.7, 0, b);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 6, 6), roofMat);
      mast.position.set(1.4, 3.6, 0); b.add(mast);
      b.position.set(x, 0, z); b.rotation.y = ry; b.userData.phase = i * 1.7;
      scene.add(b); boats.push(b);
    });
  }
  // ---------- Beach props ----------
  {
    const umCols = [0xe2725b, 0x3f8fbf, 0xf2c14e, 0x53a06b];
    const loungeM = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.9 });
    for (let i = 0; i < 15; i++) {
      const x = 226 + rng() * 34, z = -120 + rng() * 220;
      if (Math.abs(z) < 10 || Math.abs(z - 40) < 8) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6), roofMat);
      pole.position.set(x, 1.2, z); pole.rotation.z = 0.16; scene.add(pole);
      const um = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.6, 8), new THREE.MeshStandardMaterial({ color: umCols[i % 4], roughness: 0.85 }));
      um.position.set(x + 0.2, 2.5, z); um.castShadow = true; scene.add(um);
      // loungers + a towel under each umbrella
      for (const s of [-1, 1]) {
        const lg = box(loungeM, 0.75, 0.22, 1.9, x + s * 1.5, 0.16, z + 0.7, scene);
        lg.rotation.x = -0.18;
      }
      const towel = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2),
        new THREE.MeshStandardMaterial({ color: umCols[(i + 2) % 4], roughness: 1 }));
      towel.rotation.x = -Math.PI / 2; towel.rotation.z = rng() * 0.8 - 0.4;
      towel.position.set(x - 0.4, 0.03, z - 1.6); towel.receiveShadow = true; scene.add(towel);
    }
    // lifeguard stand
    const lgM = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.9 });
    box(lgM, 2.6, 0.3, 2.6, 232, 1.6, 60, scene); addCollider(232, 60, 2.6, 2.6, 1.6);
    box(lgM, 2.2, 1.2, 0.25, 232, 2.3, 58.8, scene);
    for (const [lx, lz] of [[231, 59], [233, 59], [231, 61], [233, 61]]) box(lgM, 0.22, 1.6, 0.22, lx, 0.8, lz, scene);
    box(crateMat, 2, 0.8, 2, 229.4, 0.4, 60, scene); addCollider(229.4, 60, 2, 2, 0.8);
    // volleyball net
    box(roofMat, 0.15, 2.2, 0.15, 240, 1.1, -60, scene); box(roofMat, 0.15, 2.2, 0.15, 240, 1.1, -48, scene);
    const net = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    net.position.set(240, 1.6, -54); net.rotation.y = Math.PI / 2; scene.add(net);
  }
  // ---------- Street props ----------
  {
    const benchM = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
    const binM = new THREE.MeshStandardMaterial({ color: 0x3f5a46, roughness: 0.9 });
    const hydM = new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.7 });
    const spots = [];
    for (const r of ROADS) for (const s of [-1, 1]) {
      spots.push({ x: r + s * 9.6, z: -100 + rng() * 200 });
      spots.push({ x: -100 + rng() * 200, z: r + s * 9.6 });
    }
    for (const s of spots.slice(0, 26)) {
      const kind = rng();
      if (kind < 0.4) { box(benchM, 2, 0.5, 0.6, s.x, 0.45, s.z, scene); addCollider(s.x, s.z, 2, 0.6, 0.5); }
      else if (kind < 0.7) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1, 8), binM); b.position.set(s.x, 0.5, s.z); b.castShadow = true; scene.add(b); }
      else { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.8, 8), hydM); h.position.set(s.x, 0.4, s.z); h.castShadow = true; scene.add(h); addCollider(s.x, s.z, 0.5, 0.5, 0.8); }
    }
    // bus stop shelter on the beachfront boulevard
    const shel = new THREE.MeshStandardMaterial({ color: 0x44586a, roughness: 0.8 });
    box(shel, 5, 0.15, 1.8, 171, 2.5, 40, scene);
    box(shel, 0.15, 2.5, 0.15, 168.8, 1.25, 39.4, scene); box(shel, 0.15, 2.5, 0.15, 173.2, 1.25, 39.4, scene);
    box(benchM, 4.2, 0.12, 0.5, 171, 0.8, 39.6, scene);
    const bsign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.1), new THREE.MeshBasicMaterial({ map: signTexture('BUS', '#274b63', '#ffffff') }));
    bsign.position.set(171, 3.4, 40); bsign.rotation.y = -Math.PI / 2; scene.add(bsign);
  }
  // ---------- Billboards (original fake brands) ----------
  {
    const poleM = new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.8 });
    function billboard(x, z, ry, title, sub, bg, fg) {
      const g = new THREE.Group();
      for (const s of [-3.4, 3.4]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 7.6, 8), poleM);
        p.position.set(s, 3.8, 0); p.castShadow = true; g.add(p);
      }
      const tex = canvasTex(1024, 384, (c, w, h) => {
        c.fillStyle = bg; c.fillRect(0, 0, w, h);
        c.strokeStyle = fg; c.lineWidth = 14; c.strokeRect(18, 18, w - 36, h - 36);
        c.fillStyle = fg; c.textAlign = 'center';
        c.font = '900 118px system-ui, sans-serif';
        c.fillText(title, w / 2, h / 2 - 8);
        c.font = '700 54px system-ui, sans-serif';
        c.fillText(sub, w / 2, h / 2 + 92);
      });
      const panel = new THREE.Mesh(new THREE.BoxGeometry(13, 4.9, 0.35),
        new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.7 }));
      panel.position.y = 8.6; panel.castShadow = true; g.add(panel);
      for (const s of [1, -1]) {
        const face = new THREE.Mesh(new THREE.PlaneGeometry(12.6, 4.55),
          new THREE.MeshBasicMaterial({ map: tex }));
        face.position.set(0, 8.6, s * 0.19); face.rotation.y = s > 0 ? 0 : Math.PI; g.add(face);
      }
      g.position.set(x, 0, z); g.rotation.y = ry;
      scene.add(g);
      addCollider(x, z, 1.2, 1.2, 7.6);
    }
    billboard(194, -56, Math.PI / 2, 'BRISA COLA', 'TASTE THE SUNSET', '#8e2318', '#ffd9a0');
    billboard(194, 96, Math.PI / 2, 'ONDAS GRAND', 'SLEEP BY THE SEA', '#14425e', '#bfe6ff');
    billboard(-70, -104, 0.5, 'PALMSHADE MOTORS', 'OWN THE BOULEVARD', '#20301e', '#c8ffb0');
  }
  // ---------- Palms (instanced) ----------
  {
    const positions = [];
    for (let z = -200; z <= 200; z += 16 + rng() * 10) positions.push([206 + rng() * 3, z]);
    for (let z = -196; z <= 200; z += 26 + rng() * 14) positions.push([189, z]);
    for (let z = -190; z <= 200; z += 22 + rng() * 12) positions.push([216 + rng() * 2, z]); // young palms on the sand edge
    for (let x = -196; x <= 160; x += 30 + rng() * 16) positions.push([x, 189]);
    for (let i = 0; i < 12; i++) positions.push([-30 + (rng() - 0.5) * 38, 30 + (rng() - 0.5) * 38]);
    const trunkG = new THREE.CylinderGeometry(0.16, 0.3, 5.2, 6);
    const crownG = new THREE.IcosahedronGeometry(1.9, 0); crownG.scale(1.25, 0.5, 1.25);
    const trunkI = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), positions.length);
    const crownI = new THREE.InstancedMesh(crownG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), positions.length);
    const dummy = new THREE.Object3D();
    const crownCols = [0x3f7d33, 0x2f6b2a, 0x55a03c, 0x6fae3f, 0x87a83c, 0x478c46];
    const trunkCols = [0x8a6a48, 0x77572f, 0x9a7a52];
    const col = new THREE.Color();
    positions.forEach(([x, z], i) => {
      const lean = (rng() - 0.5) * 0.22, sc = 0.85 + rng() * 0.5;
      dummy.position.set(x, 2.6 * sc, z);
      dummy.rotation.set(lean, rng() * 6.28, lean * 0.7);
      dummy.scale.setScalar(sc); dummy.updateMatrix();
      trunkI.setMatrixAt(i, dummy.matrix);
      trunkI.setColorAt(i, col.setHex(trunkCols[(rng() * trunkCols.length) | 0]));
      dummy.position.y = 5.3 * sc; dummy.updateMatrix();
      crownI.setMatrixAt(i, dummy.matrix);
      crownI.setColorAt(i, col.setHex(crownCols[(rng() * crownCols.length) | 0]));
      addCollider(x, z, 0.55, 0.55, 3);
    });
    if (trunkI.instanceColor) trunkI.instanceColor.needsUpdate = true;
    if (crownI.instanceColor) crownI.instanceColor.needsUpdate = true;
    trunkI.castShadow = crownI.castShadow = true;
    scene.add(trunkI); scene.add(crownI);
  }
  // ---------- Streetlights (instanced) ----------
  {
    const pts = [];
    for (const r of ROADS) for (let v = -204; v <= 204; v += 34) { pts.push([r + 8.6, v]); pts.push([v, r - 8.6]); }
    for (let v = -204; v <= 204; v += 34) pts.push([203, v]); // promenade lamps along the beach
    const poleI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x2f353c, roughness: 0.8 }), pts.length);
    const headI = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.22, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffc37a, emissiveIntensity: 1.6 }), pts.length);
    const dummy = new THREE.Object3D();
    pts.forEach(([x, z], i) => {
      dummy.rotation.set(0, 0, 0); dummy.position.set(x, 2.7, z); dummy.updateMatrix();
      poleI.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 5.45; dummy.updateMatrix();
      headI.setMatrixAt(i, dummy.matrix);
    });
    scene.add(poleI); scene.add(headI);
  }
  return { landmarks, packageSpots };
}
