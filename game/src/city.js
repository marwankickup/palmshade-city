// city.js — Palmshade City itself: sky, sun, ground, two districts of
// buildings, landmarks (Café Marisol, warehouse, police station, parking
// garage), the marina, beach, palms, props — plus the collider/platform lists
// every other system collides with.
import * as THREE from 'three';
import { ROAD_XS, ROAD_ZS, ROAD_W, clamp } from './util.js';

const W2C = 2048 / 590; // world units -> ground canvas px
const cx = (x) => (x + 285) * W2C;
const cz = (z) => (z + 280) * W2C;
const cw = (w) => w * W2C;

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- facades
function facadeVariant(rng, base, floors, cols) {
  const lit = [];
  const map = canvasTex(128, 256, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 128, 256);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, 128, 10);
    const ww = 128 / cols, wh = 256 / floors;
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      const isLit = rng.chance(0.42); lit.push(isLit);
      g.fillStyle = isLit ? '#ffd98a' : (rng.chance(0.5) ? '#2c3644' : '#35424f');
      g.fillRect(c * ww + 3, f * wh + 4, ww - 6, wh - 8);
      g.fillStyle = 'rgba(255,255,255,0.13)';
      g.fillRect(c * ww + 3, f * wh + 4, ww - 6, 3);
    }
  });
  const emissiveMap = canvasTex(128, 256, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 256);
    const ww = 128 / cols, wh = 256 / floors;
    let i = 0;
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      if (lit[i++]) { g.fillStyle = '#ffbe6e'; g.fillRect(c * ww + 3, f * wh + 4, ww - 6, wh - 8); }
    }
  });
  const mat = new THREE.MeshStandardMaterial({
    map, emissiveMap, emissive: new THREE.Color(0xffc37a), emissiveIntensity: 0.85, roughness: 0.9,
  });
  return mat;
}

function signTexture(text, bg, fg) {
  return canvasTex(512, 112, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 512, 112);
    g.fillStyle = fg; g.font = '900 62px "Avenir Next", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 60);
  });
}

// ---------------------------------------------------------------- city
export function createCity(scene, rng) {
  const colliders = [];
  const platforms = [];
  const boats = [];
  const beacons = [];
  const group = new THREE.Group();
  scene.add(group);
  const addBox = (parent, w, h, d, mat, x, y, z, shadow = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (shadow) { m.castShadow = true; m.receiveShadow = true; }
    parent.add(m); return m;
  };
  const collide = (x, z, w, d, pad = 0) =>
    colliders.push({ minX: x - w / 2 - pad, maxX: x + w / 2 + pad, minZ: z - d / 2 - pad, maxZ: z + d / 2 + pad });

  // ----- sky, sun, clouds
  const skyTex = canvasTex(16, 512, (g) => {
    // canvas top = zenith, canvas middle (v=0.5) = horizon: the golden band
    // must sit at the middle, not the bottom.
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0.0, '#26548f'); gr.addColorStop(0.3, '#6ea3d6');
    gr.addColorStop(0.44, '#eeb96f'); gr.addColorStop(0.5, '#ffb066');
    gr.addColorStop(0.57, '#e88a52'); gr.addColorStop(0.78, '#7a4c38');
    gr.addColorStop(1.0, '#4a2e26');
    g.fillStyle = gr; g.fillRect(0, 0, 16, 512);
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 24, 14),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10;
  group.add(sky);

  const sunDir = new THREE.Vector3(-0.58, 0.48, -0.4).normalize();
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(52, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe6a8, fog: false }));
  sunDisc.position.copy(sunDir).multiplyScalar(1300);
  sunDisc.lookAt(0, 0, 0);
  group.add(sunDisc);
  const glowTex = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,214,150,0.85)'); gr.addColorStop(1, 'rgba(255,160,80,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, fog: false, depthWrite: false, transparent: true }));
  sunGlow.position.copy(sunDir).multiplyScalar(1280);
  sunGlow.scale.setScalar(620);
  group.add(sunGlow);

  const cloudTex = canvasTex(256, 128, (g) => {
    for (const [x, y, r] of [[70, 78, 42], [128, 66, 55], [186, 80, 40], [104, 84, 46], [156, 86, 44]]) {
      const gr = g.createRadialGradient(x, y, 4, x, y, r);
      gr.addColorStop(0, 'rgba(255,244,230,0.75)'); gr.addColorStop(1, 'rgba(255,220,190,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  });
  const clouds = [];
  for (let i = 0; i < 11; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.8, fog: false, depthWrite: false }));
    s.position.set(rng.range(-900, 900), rng.range(150, 260), rng.range(-900, 900));
    s.scale.set(rng.range(220, 380), rng.range(60, 95), 1);
    clouds.push(s); group.add(s);
  }

  // ----- lights
  const hemi = new THREE.HemisphereLight(0xffe0b8, 0x63503c, 1.25);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0xff9a5c, 0.55); // warm bounce off the sea
  fill.position.set(220, 130, 180);
  scene.add(fill);
  const sun = new THREE.DirectionalLight(0xffb066, 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
  sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 520;
  sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);

  // ----- ground (one big painted canvas)
  const groundTex = canvasTex(2048, 2048, (g) => {
    g.fillStyle = '#877b6c'; g.fillRect(0, 0, 2048, 2048);            // city base
    g.fillStyle = '#e6c88d'; g.fillRect(cx(146), 0, cw(160), 2048);   // sand
    g.fillStyle = '#d9b87e'; g.fillRect(cx(168), 0, cw(14), 2048);    // wet sand
    // blocks + sidewalks
    for (let xi = 0; xi < ROAD_XS.length - 1; xi++) for (let zi = 0; zi < ROAD_ZS.length - 1; zi++) {
      const x0 = ROAD_XS[xi] + ROAD_W / 2, x1 = ROAD_XS[xi + 1] - ROAD_W / 2;
      const z0 = ROAD_ZS[zi] + ROAD_W / 2, z1 = ROAD_ZS[zi + 1] - ROAD_W / 2;
      g.fillStyle = '#b3a48d'; g.fillRect(cx(x0 - 3), cz(z0 - 3), cw(x1 - x0 + 6), cw(z1 - z0 + 6));
      g.fillStyle = ['#8f8271', '#968876', '#8a7c69'][rng.int(0, 2)];
      g.fillRect(cx(x0), cz(z0), cw(x1 - x0), cw(z1 - z0));
    }
    // roads
    g.fillStyle = '#35322f';
    for (const rx of ROAD_XS) g.fillRect(cx(rx - 8), cz(-266), cw(16), cw(532));
    for (const rz of ROAD_ZS) g.fillRect(cx(-266), cz(rz - 8), cw(396), cw(16));
    // promenade between boulevard and sand
    g.fillStyle = '#c9b894'; g.fillRect(cx(128), cz(-266), cw(18), cw(532));
    // lane dashes
    g.fillStyle = '#d9c26a';
    for (const rx of ROAD_XS) for (let z = -262; z < 262; z += 13) {
      if (ROAD_ZS.some((rz) => Math.abs(z - rz) < 12)) continue;
      g.fillRect(cx(rx - 0.4), cz(z), cw(0.8), cw(5.5));
    }
    for (const rz of ROAD_ZS) for (let x = -262; x < 128; x += 13) {
      if (ROAD_XS.some((rx) => Math.abs(x - rx) < 12)) continue;
      g.fillRect(cx(x), cz(rz - 0.4), cw(5.5), cw(0.8));
    }
    // crosswalks
    g.fillStyle = 'rgba(235,235,230,0.75)';
    for (const rx of ROAD_XS) for (const rz of ROAD_ZS) {
      for (let s = -6; s <= 6; s += 3) {
        g.fillRect(cx(rx + s - 1), cz(rz - 12.5), cw(2), cw(3.4));
        g.fillRect(cx(rx + s - 1), cz(rz + 9.1), cw(2), cw(3.4));
        if (rx < 120) { g.fillRect(cx(rx - 12.5), cz(rz + s - 1), cw(3.4), cw(2)); }
        g.fillRect(cx(rx + 9.1), cz(rz + s - 1), cw(3.4), cw(2));
      }
    }
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(590, 560),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(10, 0, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // ----- water + foam line
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x2f7d9d, transparent: true, opacity: 0.94, roughness: 0.32, metalness: 0.08,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 580), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(374, 0.07, 0);
  group.add(water);
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false });
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(7, 580), foamMat);
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(176, 0.1, 0);
  group.add(foam);

  // ----- buildings
  const facadeMats = [];
  const bases = ['#e8b4a0', '#f2d5a0', '#a8c8d8', '#f0e0c0', '#d89aa8', '#b5d0a8', '#e6c39a', '#c4b5d9'];
  for (let i = 0; i < 8; i++) facadeMats.push(facadeVariant(rng, bases[i], 10, 5));
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x6e5b49, roughness: 1 });
  const concMat = new THREE.MeshStandardMaterial({ color: 0x9a8f7d, roughness: 1 });

  function building(x, z, w, h, d, mat) {
    const mats = [mat, mat, roofMat, roofMat, mat, mat];
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
    m.position.set(x, h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    collide(x, z, w, d);
    // rooftop dressing on taller blocks
    if (h > 16) {
      if (rng.chance(0.45)) { // water tower
        const g2 = new THREE.Group();
        const wood = new THREE.MeshStandardMaterial({ color: 0x8a6844, roughness: 1 });
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 2.8, 10), wood);
        tank.position.y = 3.4; tank.castShadow = true; g2.add(tank);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.3, 10), roofMat);
        cone.position.y = 5.4; g2.add(cone);
        for (const [lx, lz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.2, 0.28), wood);
          leg.position.set(lx, 1.1, lz); g2.add(leg);
        }
        g2.position.set(x + rng.range(-w / 4, w / 4), h, z + rng.range(-d / 4, d / 4));
        group.add(g2);
      }
      if (rng.chance(0.6)) addBox(group, rng.range(1.6, 3), 1.1, rng.range(1.6, 2.6), concMat, x + rng.range(-w / 3, w / 3), h + 0.55, z + rng.range(-d / 3, d / 3));
      if (rng.chance(0.3)) { // antenna + beacon
        const ax = x + rng.range(-w / 3, w / 3), az = z + rng.range(-d / 3, d / 3);
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 6, 5), concMat);
        ant.position.set(ax, h + 3, az); group.add(ant);
        const bm = new THREE.MeshBasicMaterial({ color: 0xff4444 });
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), bm);
        tip.position.set(ax, h + 6.1, az); group.add(tip);
        beacons.push(bm);
      }
    }
    return m;
  }

  const skipBlocks = new Set(['5,4', '3,0', '1,5', '2,2']);
  let crateRoofSpot = null;
  for (let xi = 0; xi < ROAD_XS.length - 1; xi++) for (let zi = 0; zi < ROAD_ZS.length - 1; zi++) {
    if (skipBlocks.has(xi + ',' + zi)) continue;
    const x0 = ROAD_XS[xi] + ROAD_W / 2 + 3.5, x1 = ROAD_XS[xi + 1] - ROAD_W / 2 - 3.5;
    const z0 = ROAD_ZS[zi] + ROAD_W / 2 + 3.5, z1 = ROAD_ZS[zi + 1] - ROAD_W / 2 - 3.5;
    const ccx = (x0 + x1) / 2, ccz = (z0 + z1) / 2;
    const downtown = ccx < -60, beach = ccx > 30;
    if (xi === 4 && zi === 5) {
      // the crate-stair building: low, flat roof, west-side crate staircase
      const bw = 17, bd = 14, bh = 4.6, bx = 32, bz = 92;
      building(bx, bz, bw, bh, bd, facadeMats[3]);
      platforms.push({ minX: bx - bw / 2, maxX: bx + bw / 2, minZ: bz - bd / 2, maxZ: bz + bd / 2, h: bh });
      const crateMat = new THREE.MeshStandardMaterial({ color: 0xa8793f, roughness: 1 });
      const stepH = 0.55;
      for (let s = 0; s < 8; s++) {
        const h = stepH * (s + 1);
        const px = bx - bw / 2 - 1.6, pz = 106 - s * 3.1; // ascending staircase toward the roof
        addBox(group, 3, h, 3, crateMat, px, h / 2, pz);
        platforms.push({ minX: px - 1.5, maxX: px + 1.5, minZ: pz - 1.5, maxZ: pz + 1.5, h });
      }
      crateRoofSpot = { x: bx, z: bz, y: bh };
      building(14, 74, 10, 8, 9, facadeMats[5]);
      continue;
    }
    const cells = downtown ? 2 : 4;
    for (let c = 0; c < cells; c++) {
      if (cells > 1 && rng.chance(0.22)) continue;
      const sub = cells === 2
        ? { x: x0 + (x1 - x0) * (c === 0 ? 0.26 : 0.74), z: ccz, w: (x1 - x0) * 0.42, d: (z1 - z0) * 0.8 }
        : { x: x0 + (x1 - x0) * (c % 2 === 0 ? 0.27 : 0.73), z: z0 + (z1 - z0) * (c < 2 ? 0.27 : 0.73), w: (x1 - x0) * 0.4, d: (z1 - z0) * 0.4 };
      const h = downtown ? rng.range(26, 64) : beach ? rng.range(7, 15) : rng.range(12, 30);
      const b = building(sub.x, sub.z, sub.w * rng.range(0.8, 1), h, sub.d * rng.range(0.8, 1), rng.pick(facadeMats));
      if (beach && rng.chance(0.7)) { // awning on the street side
        const awn = addBox(group, sub.w * 0.7, 0.18, 2.6,
          new THREE.MeshStandardMaterial({ color: rng.pick([0xe2603f, 0x3f9e8a, 0xe8a13c]), roughness: 0.8 }),
          sub.x, 3.1, sub.z + sub.d / 2 + 1.1);
        awn.rotation.x = 0.32;
      }
      void b;
    }
  }

  // ----- landmarks
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6844, roughness: 1 });
  // Café Marisol (block x 60..120, z 0..60)
  const cafeMat = facadeVariant(rng, '#f7e3c2', 2, 6);
  building(94, 32, 24, 7, 15, cafeMat);
  const cafeSign = new THREE.Mesh(new THREE.PlaneGeometry(15, 3.3),
    new THREE.MeshBasicMaterial({ map: signTexture('CAFÉ MARISOL', '#173f35', '#ffd9a0') }));
  cafeSign.position.set(106.2, 5.2, 32); cafeSign.rotation.y = Math.PI / 2;
  group.add(cafeSign);
  // terrace platform + tables + umbrellas
  const terrace = addBox(group, 13, 0.35, 17, new THREE.MeshStandardMaterial({ color: 0xcbb894, roughness: 1 }), 112.5, 0.175, 32);
  terrace.castShadow = false;
  platforms.push({ minX: 106, maxX: 119, minZ: 23.5, maxZ: 40.5, h: 0.35 });
  for (const [tx, tz] of [[110, 26], [114, 26], [110, 38], [114, 38]]) {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.09, 10),
      new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.7 }));
    top.position.set(tx, 1.0, tz); top.castShadow = true; group.add(top);
    addBox(group, 0.12, 1.0, 0.12, concMat, tx, 0.5, tz);
    const umb = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: 0xe2603f, roughness: 0.85 }));
    umb.position.set(tx, 2.5, tz); umb.castShadow = true; group.add(umb);
    addBox(group, 0.07, 1.6, 0.07, concMat, tx, 1.7, tz);
  }

  // Warehouse (north)
  const corrTex = canvasTex(128, 128, (g) => {
    g.fillStyle = '#7d7468'; g.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 8) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, 0, 3, 128); g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x + 4, 0, 2, 128); }
  });
  const corrMat = new THREE.MeshStandardMaterial({ map: corrTex, roughness: 0.95 });
  const wh = new THREE.Mesh(new THREE.BoxGeometry(42, 14, 30),
    [corrMat, corrMat, roofMat, roofMat, corrMat, corrMat]);
  wh.position.set(-30, 7, -206); wh.castShadow = true; wh.receiveShadow = true;
  group.add(wh); collide(-30, -206, 42, 30);
  addBox(group, 12, 8, 0.4, new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.8 }), -30, 4, -190.8);

  // Police station
  const polMat = facadeVariant(rng, '#cfd8de', 3, 6);
  building(-150, 94, 26, 12, 18, polMat);
  const polSign = new THREE.Mesh(new THREE.PlaneGeometry(13, 2.9),
    new THREE.MeshBasicMaterial({ map: signTexture('POLICE', '#1c3f6e', '#ffffff') }));
  polSign.position.set(-150, 8.6, 84.8); polSign.rotation.y = Math.PI;
  group.add(polSign);
  addBox(group, 26.4, 1.1, 18.4, new THREE.MeshStandardMaterial({ color: 0x2b5ea8, roughness: 0.8 }), -150, 10.6, 94);

  // Parking garage (open slabs + pillars)
  const slabMat = new THREE.MeshStandardMaterial({ color: 0xa79c88, roughness: 1 });
  for (const sy of [0.05, 3.6, 6.95]) {
    const slab = addBox(group, 36, sy === 0.05 ? 0.1 : 0.5, 27, slabMat, -90, sy, -90);
    slab.castShadow = sy > 1;
    if (sy === 0.05) platforms.push({ minX: -108, maxX: -72, minZ: -103.5, maxZ: -76.5, h: 0.1 });
  }
  for (const px of [-106, -90, -74]) for (const pz of [-101.5, -78.5]) {
    addBox(group, 1.1, 7.2, 1.1, slabMat, px, 3.6, pz);
    collide(px, pz, 1.1, 1.1);
  }
  addBox(group, 36, 7.2, 0.8, slabMat, -90, 3.6, -103.9); collide(-90, -103.9, 36, 0.8);

  // Marina pier + boats
  const pier = addBox(group, 66, 0.45, 6, woodMat, 209, 0.28, 120);
  pier.castShadow = false;
  platforms.push({ minX: 176, maxX: 242, minZ: 117, maxZ: 123, h: 0.5 });
  for (let px = 180; px <= 240; px += 10) for (const pz of [117.6, 122.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 6), woodMat);
    post.position.set(px, 0, pz); group.add(post);
  }
  function boat(x, z, hullColor, sail) {
    const g2 = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.0, 2.1),
      new THREE.MeshStandardMaterial({ color: hullColor, roughness: 0.6 }));
    hull.position.y = 0.35; hull.castShadow = true; g2.add(hull);
    const bow = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.4),
      hull.material);
    bow.position.set(3.4, 0.35, 0); bow.rotation.y = 0.6; g2.add(bow);
    if (sail) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6.4, 5), concMat);
      mast.position.set(0.2, 3.8, 0); g2.add(mast);
      const sailMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.6),
        new THREE.MeshStandardMaterial({ color: 0xfdf6e8, side: THREE.DoubleSide, roughness: 0.9 }));
      sailMesh.position.set(1.6, 3.4, 0); sailMesh.rotation.y = Math.PI / 2; g2.add(sailMesh);
    } else {
      addBox(g2, 2.2, 0.9, 1.5, new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.7 }), -0.6, 1.25, 0);
    }
    g2.position.set(x, 0.1, z);
    g2.rotation.y = rng.range(-0.4, 0.4);
    group.add(g2);
    boats.push({ g: g2, phase: rng.range(0, 6), y: 0.1 });
    return g2;
  }
  boat(192, 104, 0xe8e2d4, true); boat(204, 138, 0x3f7fbf, false);
  boat(216, 104, 0xd8544a, true); boat(228, 142, 0xf0ead8, false);
  boat(246, 88, 0x3fae8a, true); boat(258, 160, 0xe8e2d4, false);

  // ----- palms (instanced trunks + hand-built crown geometry)
  const palmPos = [];
  for (let z = -252; z <= 252; z += 17) {
    palmPos.push([128.5, z + rng.range(-3, 3)]); palmPos.push([111.5, z + 8 + rng.range(-3, 3)]);
  }
  for (let i = 0; i < 42; i++) palmPos.push([rng.range(140, 168), rng.range(-255, 255)]);
  for (const [px, pz] of [[104, 14], [104, 50], [118, 14], [118, 50], [-30, -168], [-44, -168]]) palmPos.push([px, pz]);
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 5.4, 6);
  trunkGeo.translate(0, 2.7, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmPos.length);
  // crown: 7 drooping fronds as hand-built quads
  const crownPos = [], crownIdx = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    const base = crownPos.length / 3;
    const w = 0.34;
    crownPos.push(-dz * w, 0, dx * w, dz * w, 0, -dx * w, dx * 3.1, -1.15, dz * 3.1, dx * 1.7, -0.28, dz * 1.7);
    crownIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const crownGeo = new THREE.BufferGeometry();
  crownGeo.setAttribute('position', new THREE.Float32BufferAttribute(crownPos, 3));
  crownGeo.setIndex(crownIdx);
  crownGeo.computeVertexNormals();
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x3f9e4d, roughness: 0.9, side: THREE.DoubleSide });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, palmPos.length);
  const dummy = new THREE.Object3D();
  palmPos.forEach(([px, pz], i) => {
    const h = rng.range(0.8, 1.35), tilt = rng.range(0, 0.16), ta = rng.range(0, Math.PI * 2);
    dummy.position.set(px, 0, pz);
    dummy.rotation.set(Math.cos(ta) * tilt, 0, Math.sin(ta) * tilt);
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    const top = new THREE.Vector3(0, 5.4 * h, 0).applyEuler(dummy.rotation).add(dummy.position);
    dummy.position.copy(top);
    dummy.scale.setScalar(rng.range(0.85, 1.2));
    dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);
  });
  trunks.castShadow = true; crowns.castShadow = true;
  group.add(trunks); group.add(crowns);

  // ----- streetlights (instanced)
  const lightSpots = [];
  for (const rx of ROAD_XS) for (let z = -240; z <= 240; z += 40) lightSpots.push([rx + 9.6, z + 20]);
  for (const rz of ROAD_ZS) for (let x = -220; x <= 110; x += 40) lightSpots.push([x + 20, rz + 9.6]);
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.6, 5); poleGeo.translate(0, 2.8, 0);
  const poles = new THREE.InstancedMesh(poleGeo, concMat, lightSpots.length);
  const lampGeo = new THREE.SphereGeometry(0.3, 8, 6); lampGeo.translate(0, 5.6, 0);
  const lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), lightSpots.length);
  lightSpots.forEach(([px, pz], i) => {
    dummy.position.set(px, 0, pz); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
    dummy.updateMatrix(); poles.setMatrixAt(i, dummy.matrix); lamps.setMatrixAt(i, dummy.matrix);
  });
  group.add(poles); group.add(lamps);

  // ----- street & beach props
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x7a5c38, roughness: 1 });
  function bench(x, z, ry) {
    const g2 = new THREE.Group();
    addBox(g2, 2.2, 0.09, 0.55, benchMat, 0, 0.48, 0);
    addBox(g2, 2.2, 0.5, 0.09, benchMat, 0, 0.85, -0.26);
    addBox(g2, 0.12, 0.48, 0.5, concMat, -0.95, 0.24, 0);
    addBox(g2, 0.12, 0.48, 0.5, concMat, 0.95, 0.24, 0);
    g2.position.set(x, 0, z); g2.rotation.y = ry;
    group.add(g2); collide(x, z, 2.2, 0.7);
  }
  function hydrant(x, z) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.75, 8),
      new THREE.MeshStandardMaterial({ color: 0xd83a2e, roughness: 0.6 }));
    m.position.set(x, 0.38, z); m.castShadow = true; group.add(m);
  }
  function bin(x, z) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.95, 9),
      new THREE.MeshStandardMaterial({ color: 0x3a4a42, roughness: 0.9 }));
    m.position.set(x, 0.48, z); m.castShadow = true; group.add(m);
  }
  for (let i = 0; i < 26; i++) {
    const rx = rng.pick(ROAD_XS), rz = rng.range(-250, 250);
    bench(rx + rng.pick([-10.6, 10.6]), rz, rng.chance(0.5) ? 0 : Math.PI / 2);
  }
  for (let i = 0; i < 18; i++) hydrant(rng.pick(ROAD_XS) + rng.pick([-10.4, 10.4]), rng.range(-250, 250));
  for (let i = 0; i < 18; i++) bin(rng.pick(ROAD_XS) + rng.pick([-10.4, 10.4]), rng.range(-250, 250));
  for (const [bx, bz] of [[-52, 68], [68, -52], [8, 128]]) { // bus stops
    addBox(group, 0.14, 2.6, 0.14, concMat, bx - 1.8, 1.3, bz);
    addBox(group, 0.14, 2.6, 0.14, concMat, bx + 1.8, 1.3, bz);
    addBox(group, 4.4, 0.14, 1.6, new THREE.MeshStandardMaterial({ color: 0x2b5ea8, roughness: 0.7 }), bx, 2.65, bz);
    bench(bx, bz + 0.3, 0);
  }
  // beach props
  const umbCols = [0xe2603f, 0x3f9ecf, 0xf2cf4a, 0xef7fb0, 0x3fae8a];
  for (let i = 0; i < 12; i++) {
    const ux = rng.range(148, 168), uz = rng.range(-240, 240);
    addBox(group, 0.07, 2.3, 0.07, concMat, ux, 1.15, uz);
    const umb = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.8, 8),
      new THREE.MeshStandardMaterial({ color: rng.pick(umbCols), roughness: 0.85 }));
    umb.position.set(ux, 2.5, uz); umb.castShadow = true; group.add(umb);
    addBox(group, 1.9, 0.06, 0.9, new THREE.MeshStandardMaterial({ color: rng.pick(umbCols), roughness: 1 }), ux + rng.range(-1, 1), 0.04, uz + rng.range(0.8, 1.6), false);
  }
  // lifeguard stand
  const lg = new THREE.Group();
  for (const [lx, lz] of [[-0.9, -0.7], [0.9, -0.7], [-0.9, 0.7], [0.9, 0.7]])
    addBox(lg, 0.16, 2.2, 0.16, woodMat, lx, 1.1, lz);
  addBox(lg, 2.4, 0.16, 1.9, woodMat, 0, 2.25, 0);
  addBox(lg, 2.2, 1.5, 1.7, new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.8 }), 0, 3.1, 0);
  addBox(lg, 2.7, 0.14, 2.2, new THREE.MeshStandardMaterial({ color: 0xd8544a, roughness: 0.8 }), 0, 4.0, 0);
  lg.position.set(152, 0, 44); group.add(lg); collide(152, 44, 2.4, 2);
  // volleyball net
  addBox(group, 0.12, 2.4, 0.12, concMat, 156, 1.2, -44);
  addBox(group, 0.12, 2.4, 0.12, concMat, 156, 1.2, -36);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
  net.position.set(156, 1.7, -40); net.rotation.y = Math.PI / 2; group.add(net);

  // ----- parking spots (for parked cars)
  const parkingSpots = [];
  for (const rx of [-180, -60, 0, 60]) for (const z of [-150, -90, -30, 30, 90, 150, 210]) {
    if (rng.chance(0.45)) continue;
    parkingSpots.push({ x: rx + rng.pick([-11.2, 11.2]), z: z + rng.range(-6, 6), heading: rng.chance(0.5) ? 0 : Math.PI });
  }
  for (const rz of [-120, 60, 180]) for (const x of [-200, -140, -80, -20, 40]) {
    if (rng.chance(0.5)) continue;
    parkingSpots.push({ x: x + rng.range(-6, 6), z: rz + rng.pick([-11.2, 11.2]), heading: rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2 });
  }
  parkingSpots.push({ x: -98, z: -84, heading: Math.PI / 2 }, { x: -98, z: -94, heading: Math.PI / 2 },
    { x: -82, z: -84, heading: -Math.PI / 2 }, { x: 104, z: 14, heading: 0 }, { x: 104, z: 48, heading: Math.PI });

  const landmarks = {
    cafe: { x: 94, z: 32, front: { x: 108, z: 32 }, marisol: { x: 110, z: 27 } },
    warehouse: { x: -30, z: -206, front: { x: -30, z: -186 } },
    police: { x: -150, z: 94, respawn: { x: -150, z: 74 } },
    garage: { x: -90, z: -90, entry: { x: -90, z: -72 } },
    marina: { pierEnd: { x: 234, z: 120 }, shore: { x: 166, z: 120 } },
    hospital: { x: 30, z: -150 },
  };
  const spots = {
    cafeTerrace: { x: 114, z: 32, y: 0.35 },
    pierEnd: { x: 236, z: 120, y: 0.5 },
    crateRoof: { x: crateRoofSpot.x, z: crateRoofSpot.z, y: crateRoofSpot.y },
  };

  return {
    colliders, platforms, landmarks, spots, parkingSpots, sun, sunDir,
    update(t) {
      waterMat.color.setHSL(0.535, 0.58, 0.34 + Math.sin(t * 0.45) * 0.025);
      water.position.y = 0.07 + Math.sin(t * 0.7) * 0.03;
      foamMat.opacity = 0.22 + Math.sin(t * 0.9) * 0.1;
      foam.position.x = 176 + Math.sin(t * 0.5) * 1.2;
      for (const b of boats) {
        b.g.position.y = b.y + Math.sin(t * 0.85 + b.phase) * 0.11;
        b.g.rotation.z = Math.sin(t * 0.7 + b.phase) * 0.03;
        b.g.rotation.x = Math.cos(t * 0.6 + b.phase) * 0.02;
      }
      for (const c of clouds) { c.position.x += 0.012; if (c.position.x > 1000) c.position.x = -1000; }
      const blink = (Math.sin(t * 2.4) > 0.4) ? 1 : 0.12;
      for (const bm of beacons) bm.color.setRGB(blink, 0.15 * blink, 0.15 * blink);
    },
  };
}
