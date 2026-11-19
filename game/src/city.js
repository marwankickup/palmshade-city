// Procedural golden-hour coastal city: two districts (downtown towers with rooftop
// clutter, beachfront low-rise with awnings), painted ground, beach, marina with
// bobbing boats, street/beach props, gradient sky with sun disc and clouds.
// Exports the physical world: colliders, walkable platforms, landmarks, spawn data.
import * as THREE from 'three';
import { V_ROADS, H_ROADS, ROAD_W, BLOCK, BEACH_X, WATER_X, aabb, clamp } from './util.js';

export const SUN_DIR = new THREE.Vector3(-0.62, 0.34, -0.42).normalize();

const PASTELS = [0xf6c390, 0xf2a65a, 0xe8e3d9, 0xa8d5ba, 0xf4e1c1, 0xef9a9a, 0x9fc6e8, 0xf7d08a, 0xd5a8c6, 0xb5d99c];

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// ---- facade textures: window grid + emissive lit windows ----
const facadeCache = new Map();
function facadeMaterial(rng, baseColor, floors, cols) {
  const key = `${baseColor}-${floors}-${cols}`;
  if (facadeCache.has(key)) return facadeCache.get(key);
  const h = Math.min(512, 40 + floors * 26);
  const [mc, m] = canvas(256, h);
  const [ec, e] = canvas(256, h);
  const base = `#${baseColor.toString(16).padStart(6, '0')}`;
  m.fillStyle = base; m.fillRect(0, 0, 256, h);
  // subtle vertical weathering
  for (let i = 0; i < 40; i++) {
    m.fillStyle = `rgba(0,0,0,${0.02 + rng() * 0.04})`;
    m.fillRect(rng() * 256, 0, 2 + rng() * 8, h);
  }
  m.fillStyle = 'rgba(255,255,255,0.16)'; m.fillRect(0, 0, 256, 10);
  e.fillStyle = '#000'; e.fillRect(0, 0, 256, h);
  const mx = 20, my = 16, gw = (256 - mx * 2) / cols, gh = (h - my * 2) / floors;
  for (let r = 0; r < floors; r++) {
    for (let c = 0; c < cols; c++) {
      const x = mx + c * gw + gw * 0.22, y = my + r * gh + gh * 0.2;
      const w = gw * 0.56, hh = gh * 0.55;
      const lit = rng() < 0.38;
      m.fillStyle = lit ? '#5a4632' : (rng() < 0.5 ? '#2c3e50' : '#3d556b');
      m.fillRect(x, y, w, hh);
      m.fillStyle = 'rgba(255,255,255,0.25)';
      m.fillRect(x, y, w, 2);
      if (lit) { e.fillStyle = '#ffc978'; e.fillRect(x, y, w, hh); }
    }
  }
  const map = new THREE.CanvasTexture(mc);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissiveMap = new THREE.CanvasTexture(ec);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({
    map, emissiveMap, emissive: 0xffb45e, emissiveIntensity: 0.9, roughness: 0.92,
  });
  facadeCache.set(key, mat);
  return mat;
}

const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a7f72, roughness: 1 });
const darkRoofMat = new THREE.MeshStandardMaterial({ color: 0x5d564e, roughness: 1 });

function signTexture(text, bg, fg = '#ffffff') {
  const [c, g] = canvas(512, 96);
  g.fillStyle = bg; g.fillRect(0, 0, 512, 96);
  g.fillStyle = fg;
  g.font = 'bold 44px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const platforms = [];
  const dyn = { boats: [], clouds: [], water: null, foam: null };
  const root = new THREE.Group();
  scene.add(root);

  buildSky(scene, rng, dyn);
  buildGround(root);
  const water = buildOcean(root, dyn);
  dyn.water = water;
  buildBuildings(root, rng, colliders, platforms);
  buildMarina(root, rng, colliders, platforms, dyn);
  buildBeachProps(root, rng, colliders);
  buildStreetProps(root, rng, colliders);
  buildPalmsAndLights(root, rng, colliders);

  return {
    colliders, platforms,
    update(dt, t) {
      for (const b of dyn.boats) {
        b.position.y = b.userData.baseY + Math.sin(t * 0.8 + b.userData.phase) * 0.16;
        b.rotation.z = Math.sin(t * 0.6 + b.userData.phase) * 0.035;
        b.rotation.x = Math.cos(t * 0.5 + b.userData.phase) * 0.02;
      }
      for (const c of dyn.clouds) {
        c.position.x += dt * 0.7;
        if (c.position.x > 420) c.position.x = -420;
      }
      if (dyn.water) {
        const m = dyn.water.material;
        m.color.setHSL(0.52 + Math.sin(t * 0.13) * 0.012, 0.62, 0.27 + Math.sin(t * 0.21) * 0.015);
      }
      if (dyn.foam) {
        dyn.foam.material.opacity = 0.28 + Math.sin(t * 0.9) * 0.12;
        dyn.foam.position.x = WATER_X + 1 + Math.sin(t * 0.45) * 1.2;
      }
    },
  };
}

// ---------- sky, sun disc, clouds ----------
function buildSky(scene, rng, dyn) {
  const [c, g] = canvas(64, 512);
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#2f5d8a');
  grad.addColorStop(0.38, '#6ea3cf');
  grad.addColorStop(0.55, '#cfe3ee');
  grad.addColorStop(0.66, '#f7c873');
  grad.addColorStop(0.73, '#ff9e5e');
  grad.addColorStop(0.8, '#c97a45');
  grad.addColorStop(1.0, '#7a4a2e');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(680, 24, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  // sun disc + glow, low in the west
  const sunPos = SUN_DIR.clone().multiplyScalar(640);
  sunPos.y = Math.max(sunPos.y, 60);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }),
  );
  disc.position.copy(sunPos);
  disc.lookAt(0, 40, 0);
  scene.add(disc);
  const [gc, gg] = canvas(128, 128);
  const rg = gg.createRadialGradient(64, 64, 4, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,214,140,0.85)');
  rg.addColorStop(1, 'rgba(255,160,80,0)');
  gg.fillStyle = rg; gg.fillRect(0, 0, 128, 128);
  const glowTex = new THREE.CanvasTexture(gc);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, fog: false, depthWrite: false, transparent: true }));
  glow.position.copy(sunPos);
  glow.scale.setScalar(240);
  scene.add(glow);

  // billboard clouds: soft warm blobs
  const [cc, cg] = canvas(256, 128);
  for (let i = 0; i < 26; i++) {
    const x = 30 + rng() * 196, y = 44 + rng() * 40, r = 14 + rng() * 26;
    const blob = cg.createRadialGradient(x, y, 2, x, y, r);
    blob.addColorStop(0, 'rgba(255,244,230,0.55)');
    blob.addColorStop(1, 'rgba(255,220,190,0)');
    cg.fillStyle = blob;
    cg.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const cloudTex = new THREE.CanvasTexture(cc);
  for (let i = 0; i < 8; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.85 });
    const cloud = new THREE.Mesh(new THREE.PlaneGeometry(150 + rng() * 130, 42 + rng() * 30), mat);
    cloud.position.set(-380 + rng() * 760, 120 + rng() * 90, -320 + rng() * 560);
    cloud.lookAt(0, 60, 0);
    scene.add(cloud);
    dyn.clouds.push(cloud);
  }
}

// ---------- painted ground ----------
function buildGround(root) {
  const W = 410, H = 380, OX = -220, OZ = -190; // ground plane ends at x=190 so the ocean shows
  const [c, g] = canvas(2048, 1620);
  const sx = 2048 / W, sz = 1620 / H;
  const X = (x) => (x - OX) * sx, Z = (z) => (z - OZ) * sz;
  const rect = (x, z, w, d, fill) => { g.fillStyle = fill; g.fillRect(X(x), Z(z), w * sx, d * sz); };

  rect(OX, OZ, W, H, '#7d9b57');                       // park-green base (west strip)
  rect(-182, OZ, 308, H, '#98917f');                    // city ground
  // beach sand
  const sandGrad = g.createLinearGradient(X(BEACH_X), 0, X(WATER_X + 14), 0);
  sandGrad.addColorStop(0, '#e8cd92');
  sandGrad.addColorStop(1, '#f6e7ba');
  g.fillStyle = sandGrad;
  g.fillRect(X(BEACH_X), 0, (WATER_X + 14 - BEACH_X) * sx, 1620);
  rect(WATER_X + 8, OZ, 60, H, '#c9b183');              // wet sand under shallows
  // promenade tiles along Ocean Drive
  rect(119, OZ, 7, H, '#d8c6a5');
  g.strokeStyle = 'rgba(120,100,70,0.35)'; g.lineWidth = 1;
  for (let z = OZ; z < OZ + H; z += 6) { g.beginPath(); g.moveTo(X(119), Z(z)); g.lineTo(X(126), Z(z)); g.stroke(); }

  // blocks: sidewalk border + pavement inner
  const blockCentersX = [-133, -63, 7, 77];
  const blockCentersZ = [-105, -35, 35, 105];
  for (const bx of blockCentersX) for (const bz of blockCentersZ) {
    rect(bx - BLOCK / 2 - 2.5, bz - BLOCK / 2 - 2.5, BLOCK + 5, BLOCK + 5, '#c9c0b2');
    rect(bx - BLOCK / 2, bz - BLOCK / 2, BLOCK, BLOCK, '#a89f8f');
  }
  // roads (east-west roads stop at the promenade — no asphalt on the beach)
  for (const x of V_ROADS) rect(x - ROAD_W / 2, OZ, ROAD_W, H, '#3c3f45');
  for (const z of H_ROADS) rect(-182, z - ROAD_W / 2, 308, ROAD_W, '#3c3f45');
  // center dashes
  g.fillStyle = '#e8d44d';
  for (const x of V_ROADS) for (let z = OZ + 4; z < OZ + H - 4; z += 9) {
    if (H_ROADS.some((hz) => Math.abs(z - hz) < 10)) continue;
    g.fillRect(X(x) - 1.5, Z(z), 3, 4.4 * sz);
  }
  for (const z of H_ROADS) for (let x = -178; x < 122; x += 9) {
    if (V_ROADS.some((vx) => Math.abs(x - vx) < 10)) continue;
    g.fillRect(X(x), Z(z) - 1.5, 4.4 * sx, 3);
  }
  // crosswalks at intersections
  g.fillStyle = 'rgba(240,240,235,0.85)';
  for (const x of V_ROADS) for (const z of H_ROADS) {
    for (let i = -2; i <= 2; i++) {
      g.fillRect(X(x + i * 2.6) - 2, Z(z - ROAD_W / 2 - 3.4), 4, 3 * sz);       // north
      g.fillRect(X(x + i * 2.6) - 2, Z(z + ROAD_W / 2 + 0.4), 4, 3 * sz);       // south
      g.fillRect(X(x - ROAD_W / 2 - 3.4), Z(z + i * 2.6) - 2, 3 * sx, 4);       // west
      g.fillRect(X(x + ROAD_W / 2 + 0.4), Z(z + i * 2.6) - 2, 3 * sx, 4);       // east
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(OX + W / 2, 0, OZ + H / 2);
  ground.receiveShadow = true;
  root.add(ground);
}

// ---------- ocean ----------
function buildOcean(root, dyn) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x2e7f9a, roughness: 0.32, metalness: 0.08, transparent: true, opacity: 0.94 });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(260, 380), mat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(WATER_X + 128, -0.18, 0);
  ocean.receiveShadow = true;
  root.add(ocean);
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 380),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(WATER_X + 1, 0.02, 0);
  root.add(foam);
  dyn.foam = foam;
  return ocean;
}

// ---------- buildings ----------
function addBuilding(root, colliders, rng, x, z, w, d, h, color, opts = {}) {
  const floors = Math.max(2, Math.round(h / 3.1));
  const cols = Math.max(2, Math.round(w / 4.4));
  const side = facadeMaterial(rng, color, floors, cols);
  const mats = [side, side, opts.roofMat || roofMat, roofMat, side, side];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  if (!opts.noCollider) colliders.push(aabb(x, z, w, d, 0.15));
  if (opts.roofPlatform) {
    // walkable roof slab (for the scaffold-reached package perch)
  }
  return mesh;
}

function rooftopClutter(root, rng, x, z, w, d, h) {
  const g = new THREE.Group();
  const acMat = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.7, metalness: 0.3 });
  const n = 1 + (rng() * 3 | 0);
  for (let i = 0; i < n; i++) {
    const ac = new THREE.Mesh(new THREE.BoxGeometry(1.8 + rng() * 1.6, 1 + rng() * 0.8, 1.6 + rng() * 1.4), acMat);
    ac.position.set(x + (rng() - 0.5) * (w - 6), h + ac.geometry.parameters.height / 2, z + (rng() - 0.5) * (d - 6));
    ac.castShadow = true;
    g.add(ac);
  }
  if (rng() < 0.55) {
    // water tower
    const tw = new THREE.Group();
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x9a6a48, roughness: 0.9 });
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 3.2, 10), tankMat);
    tank.position.y = 3.4; tank.castShadow = true;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2, 1.4, 10), darkRoofMat);
    cone.position.y = 5.7;
    tw.add(tank, cone);
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2), darkRoofMat);
      leg.position.set(Math.cos(i * Math.PI / 2 + 0.78) * 1.2, 1, Math.sin(i * Math.PI / 2 + 0.78) * 1.2);
      tw.add(leg);
    }
    tw.position.set(x + (rng() - 0.5) * (w - 10), h, z + (rng() - 0.5) * (d - 10));
    g.add(tw);
  }
  if (rng() < 0.5) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 5 + rng() * 3, 5),
      new THREE.MeshStandardMaterial({ color: 0x444444 }));
    ant.position.set(x + (rng() - 0.5) * w * 0.6, h + 3, z + (rng() - 0.5) * d * 0.6);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff4444 }));
    tip.position.set(ant.position.x, h + 6 + 1.5, ant.position.z);
    g.add(ant, tip);
  }
  root.add(g);
}

function awning(root, rng, x, z, w, rotY, color) {
  const [c, g] = canvas(128, 32);
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : `#${color.toString(16).padStart(6, '0')}`; g.fillRect(i * 16, 0, 16, 32); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, 2.6),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  m.position.set(x, 3.1, z);
  m.rotation.y = rotY;
  m.rotation.x = rotY === 0 ? 0.28 : 0;
  if (rotY !== 0) m.rotation.z = 0.28 * Math.sign(rotY);
  m.castShadow = true;
  root.add(m);
}

function buildBuildings(root, rng, colliders, platforms) {
  const blockX = [-133, -63, 7, 77];
  const blockZ = [-105, -35, 35, 105];
  for (const bx of blockX) {
    for (const bz of blockZ) {
      // special blocks are built by landmark builders below
      if (bx === -133 && bz === 105) continue;  // warehouse
      if (bx === -63 && bz === -105) continue;  // police station
      if (bx === 7 && bz === -105) continue;    // hospital
      if (bx === 77 && bz === -35) continue;    // café Marisol
      if (bx === -63 && bz === 35) continue;    // parking garage
      const district = bx <= -63 ? 'downtown' : bx === 7 ? 'mid' : 'beach';
      if (district === 'downtown') {
        if (rng() < 0.5) {
          const w = 30 + rng() * 10, d = 30 + rng() * 10, h = 30 + rng() * 22;
          addBuilding(root, colliders, rng, bx, bz, w, d, h, PASTELS[(rng() * PASTELS.length) | 0]);
          rooftopClutter(root, rng, bx, bz, w, d, h);
        } else {
          for (const [ox, oz] of [[-14, -14], [14, 14]]) {
            const w = 22 + rng() * 6, d = 22 + rng() * 6, h = 21 + rng() * 15;
            addBuilding(root, colliders, rng, bx + ox, bz + oz, w, d, h, PASTELS[(rng() * PASTELS.length) | 0]);
            rooftopClutter(root, rng, bx + ox, bz + oz, w, d, h);
          }
        }
      } else if (district === 'mid') {
        const spots = [[-14, -14], [14, -14], [0, 15]];
        for (const [ox, oz] of spots) {
          if (rng() < 0.18) continue;
          const w = 18 + rng() * 8, d = 16 + rng() * 8, h = 12 + rng() * 12;
          addBuilding(root, colliders, rng, bx + ox, bz + oz, w, d, h, PASTELS[(rng() * PASTELS.length) | 0]);
          if (h > 17) rooftopClutter(root, rng, bx + ox, bz + oz, w, d, h);
        }
      } else {
        // beachfront low-rise: 4 small buildings with awnings
        const spots = [[-14, -14], [14, -14], [-14, 14], [14, 14]];
        for (const [ox, oz] of spots) {
          const w = 17 + rng() * 6, d = 15 + rng() * 6, h = 7 + rng() * 6;
          const color = PASTELS[(rng() * PASTELS.length) | 0];
          addBuilding(root, colliders, rng, bx + ox, bz + oz, w, d, h, color);
          if (rng() < 0.8) awning(root, rng, bx + ox + (ox < 0 ? w / 2 + 0.8 : -w / 2 - 0.8), bz + oz, d * 0.8, Math.PI / 2, 0xe2574c);
          if (rng() < 0.8) awning(root, rng, bx + ox, bz + oz + (oz < 0 ? d / 2 + 0.8 : -d / 2 - 0.8), w * 0.8, 0, 0x2e86ab);
        }
        // scaffold-reached rooftop perch on the (77,105) block's NW building is
        // handled by collectible crate stairs in buildStreetProps (visual only here)
      }
    }
  }

  // ---- warehouse (Breakwater Warehouse), block (-133, 105) ----
  {
    const wh = addBuilding(root, colliders, rng, -133, 105, 46, 32, 11, 0xb08968, { roofMat: darkRoofMat });
    wh.material = wh.material; // keep facade
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(30, 5.6),
      new THREE.MeshBasicMaterial({ map: signTexture('BREAKWATER WAREHOUSE', '#5d4a36') }));
    sign.position.set(-133, 8.6, 105 - 16.2);
    sign.rotation.y = Math.PI;
    root.add(sign);
    // loading dock crates in the yard (south side)
    const crateMat = new THREE.MeshStandardMaterial({ color: 0xa9805a, roughness: 0.95 });
    for (let i = 0; i < 7; i++) {
      const s = 1.6 + rng() * 1.4;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
      crate.position.set(-152 + rng() * 38, s / 2, 128 + rng() * 6);
      crate.castShadow = true;
      root.add(crate);
      colliders.push(aabb(crate.position.x, crate.position.z, s, s, 0.1));
    }
  }

  // ---- police station, block (-63,-105) ----
  {
    addBuilding(root, colliders, rng, -63, -112, 34, 20, 12, 0xdfe6ee);
    addBuilding(root, colliders, rng, -63, -88, 20, 12, 7, 0xcfd8e2);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(20, 3.8),
      new THREE.MeshBasicMaterial({ map: signTexture('PALMSHADE PD', '#274156') }));
    sign.position.set(-63, 9.5, -122.2);
    sign.rotation.y = Math.PI;
    root.add(sign);
  }

  // ---- hospital, block (7,-105) ----
  {
    addBuilding(root, colliders, rng, 7, -108, 36, 26, 16, 0xf2f2f0);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(22, 4.2),
      new THREE.MeshBasicMaterial({ map: signTexture('ST. CORAL HOSPITAL', '#e8e8e8', '#d23b3b') }));
    sign.position.set(7, 13, -121.2);
    sign.rotation.y = Math.PI;
    root.add(sign);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(1, 4.6, 0.4), new THREE.MeshBasicMaterial({ color: 0xd23b3b }));
    cross.position.set(7, 18.6, -108);
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1, 0.4), cross.material);
    cross2.position.copy(cross.position);
    root.add(cross, cross2);
  }

  // ---- Café Marisol, block (77,-35): low building + terrace + crate steps ----
  {
    addBuilding(root, colliders, rng, 70, -35, 24, 20, 6.5, 0xf6c390);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 3),
      new THREE.MeshBasicMaterial({ map: signTexture('CAFÉ MARISOL', '#a34a28') }));
    sign.position.set(82.2, 5, -35);
    sign.rotation.y = Math.PI / 2;
    root.add(sign);
    awning(root, rng, 83, -35, 17, Math.PI / 2, 0xe2574c);
    // terrace platform east of the café (walkable, y=1.2)
    const terrMat = new THREE.MeshStandardMaterial({ color: 0xc9a06a, roughness: 0.9 });
    const terr = new THREE.Mesh(new THREE.BoxGeometry(12, 1.2, 16), terrMat);
    terr.position.set(90, 0.6, -35);
    terr.receiveShadow = true; terr.castShadow = true;
    root.add(terr);
    platforms.push({ minX: 84, maxX: 96, minZ: -43, maxZ: -27, top: 1.2 });
    // crate steps up to the terrace (west side)
    const crateMat = new THREE.MeshStandardMaterial({ color: 0xa9805a, roughness: 0.95 });
    const step1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 2.2), crateMat);
    step1.position.set(82.6, 0.3, -35);
    root.add(step1);
    platforms.push({ minX: 81.5, maxX: 83.7, minZ: -36.1, maxZ: -33.9, top: 0.6 });
    // terrace tables + umbrellas
    for (const [tx, tz] of [[88, -40], [92, -31], [88, -30]]) {
      const table = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 10),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
      table.position.set(tx, 1.75, tz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), darkRoofMat);
      pole.position.set(tx, 1.9, tz);
      const umb = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.6, 8),
        new THREE.MeshStandardMaterial({ color: 0xe2574c, roughness: 0.8 }));
      umb.position.set(tx, 2.75, tz);
      umb.castShadow = true;
      root.add(table, pole, umb);
    }
  }

  // ---- parking garage, block (-63, 35): two open slabs on columns ----
  {
    const slabMat = new THREE.MeshStandardMaterial({ color: 0xb5aa99, roughness: 0.95 });
    const colMat = new THREE.MeshStandardMaterial({ color: 0x9a9184, roughness: 0.95 });
    for (const y of [3.4, 6.6]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(42, 0.5, 42), slabMat);
      slab.position.set(-63, y, 35);
      slab.castShadow = true; slab.receiveShadow = true;
      root.add(slab);
    }
    for (const cx of [-82, -63, -44]) for (const cz of [16, 35, 54]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(1.2, 6.6, 1.2), colMat);
      col.position.set(cx, 3.3, cz);
      col.castShadow = true;
      root.add(col);
      colliders.push(aabb(cx, cz, 1.2, 1.2, 0.15));
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6),
      new THREE.MeshBasicMaterial({ map: signTexture('PARKING', '#6b6257') }));
    sign.position.set(-63, 5.6, 56.4);
    root.add(sign);
  }

  // ---- rooftop perch + crate staircase at beachfront block (77,105) ----
  {
    // perch slab attached to the east face of the NW building area
    const perchMat = new THREE.MeshStandardMaterial({ color: 0xb9a888, roughness: 0.95 });
    const perch = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 5), perchMat);
    perch.position.set(97.5, 7.8, 91);
    perch.castShadow = true;
    root.add(perch);
    platforms.push({ minX: 95, maxX: 100, minZ: 88.5, maxZ: 93.5, top: 8.0 });
    const crateMat = new THREE.MeshStandardMaterial({ color: 0xa9805a, roughness: 0.95 });
    // staircase of crate platforms climbing from ground to the perch
    const steps = [
      { x: 97.5, z: 99, top: 1.3 }, { x: 97.5, z: 96.6, top: 2.6 },
      { x: 97.5, z: 94.2, top: 3.9 }, { x: 99.5, z: 92.5, top: 5.2 },
      { x: 99.5, z: 90.5, top: 6.5 },
    ];
    for (const s of steps) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, s.top, 2.4), crateMat);
      box.position.set(s.x, s.top / 2, s.z);
      box.castShadow = true;
      root.add(box);
      platforms.push({ minX: s.x - 1.2, maxX: s.x + 1.2, minZ: s.z - 1.2, maxZ: s.z + 1.2, top: s.top });
    }
  }
}

// ---------- marina ----------
function buildMarina(root, rng, colliders, platforms, dyn) {
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x9a744e, roughness: 0.95 });
  // pier deck: x 176..234, z 24..40, top y=0.9
  const deck = new THREE.Mesh(new THREE.BoxGeometry(58, 0.5, 16), woodMat);
  deck.position.set(205, 0.65, 32);
  deck.castShadow = true; deck.receiveShadow = true;
  root.add(deck);
  platforms.push({ minX: 176, maxX: 234, minZ: 24, maxZ: 40, top: 0.9 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x6e5136, roughness: 1 });
  for (let x = 180; x <= 232; x += 10) {
    for (const z of [25.5, 38.5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.2, 7), postMat);
      post.position.set(x, -0.2, z);
      root.add(post);
    }
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.3),
    new THREE.MeshBasicMaterial({ map: signTexture('PALMSHADE MARINA', '#274156') }));
  sign.position.set(180, 3.4, 32);
  sign.rotation.y = -Math.PI / 2;
  root.add(sign);
  for (const sx of [178.6, 181.4]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.6, 6), postMat);
    p.position.set(sx, 1.8, 32);
    root.add(p);
  }
  // dock crates + barrels on the pier
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xa9805a, roughness: 0.95 });
  for (let i = 0; i < 5; i++) {
    const s = 1.1 + rng() * 0.7;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
    crate.position.set(186 + rng() * 40, 0.9 + s / 2, 26.5 + rng() * 2);
    crate.castShadow = true;
    root.add(crate);
  }
  // boats bobbing alongside the pier
  const boatColors = [0xf2f2f0, 0x3f7fbf, 0xd95f4b, 0xf2c14e, 0x62b06e];
  const boatSpots = [
    { x: 192, z: 15 }, { x: 208, z: 14 }, { x: 222, z: 16 },
    { x: 196, z: 49 }, { x: 214, z: 50 },
  ];
  boatSpots.forEach((spot, i) => {
    const boat = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: boatColors[i % boatColors.length], roughness: 0.5 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.3, 2.6), hullMat);
    hull.position.y = 0.55;
    const bow = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 2), hullMat);
    bow.position.set(3.9, 0.5, 0);
    bow.rotation.z = 0.25;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
    cabin.position.set(-0.6, 1.7, 0);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5, roughness: 0.4 }));
    mast.position.set(1.2, 3.6, 0);
    boat.add(hull, bow, cabin, mast);
    boat.position.set(spot.x, 0, spot.z);
    boat.rotation.y = (rng() - 0.5) * 0.3 + (spot.z < 32 ? 0 : Math.PI);
    boat.userData.baseY = 0;
    boat.userData.phase = rng() * Math.PI * 2;
    root.add(boat);
    dyn.boats.push(boat);
  });
}

// ---------- beach props ----------
function buildBeachProps(root, rng, colliders) {
  const umbColors = [0xe2574c, 0x2e86ab, 0xf2c14e, 0x62b06e, 0xef9a9a];
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.6 });
  for (let i = 0; i < 14; i++) {
    const x = 138 + rng() * 30, z = -160 + rng() * 320;
    if (Math.abs(z - 32) < 14) continue; // keep the marina approach clear
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 6), poleMat);
    pole.position.set(x, 1.15, z);
    const umb = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: umbColors[i % umbColors.length], roughness: 0.85 }));
    umb.position.set(x, 2.35, z);
    umb.castShadow = true;
    root.add(pole, umb);
    const towel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.8),
      new THREE.MeshStandardMaterial({ color: umbColors[(i + 2) % umbColors.length], roughness: 1 }));
    towel.position.set(x + 1.6, 0.03, z + 0.6);
    towel.rotation.y = rng() * 1.2;
    root.add(towel);
  }
  // volleyball net
  {
    const netMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const net = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.1), netMat);
    net.position.set(152, 1.15, 62);
    net.rotation.y = Math.PI / 2;
    root.add(net);
    for (const dz of [-4.5, 4.5]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.3, 6), poleMat);
      p.position.set(152, 1.15, 62 + dz);
      root.add(p);
      colliders.push(aabb(152, 62 + dz, 0.3, 0.3));
    }
  }
  // lifeguard stand
  {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.8 });
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 2), mat);
    cabin.position.y = 3;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.15, 2.6),
      new THREE.MeshStandardMaterial({ color: 0xd95f4b, roughness: 0.8 }));
    roof.position.y = 4;
    g.add(cabin, roof);
    for (const [lx, lz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), mat);
      leg.position.set(lx, 1.2, lz);
      g.add(leg);
    }
    g.position.set(163, 0, -24);
    g.traverse((o) => { o.castShadow = true; });
    root.add(g);
    colliders.push(aabb(163, -24, 2.2, 2.2));
  }
}

// ---------- street props ----------
function buildStreetProps(root, rng, colliders) {
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x7a5c3e, roughness: 0.95 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.6, metalness: 0.4 });
  const binMat = new THREE.MeshStandardMaterial({ color: 0x39584a, roughness: 0.8 });
  const hydMat = new THREE.MeshStandardMaterial({ color: 0xd23b3b, roughness: 0.6 });
  const benchGeo = new THREE.BoxGeometry(2, 0.12, 0.6);
  const binGeo = new THREE.CylinderGeometry(0.42, 0.38, 0.95, 8);
  const hydGeo = new THREE.CylinderGeometry(0.2, 0.24, 0.7, 8);

  const spots = [];
  // promenade benches facing the ocean
  for (let z = -150; z <= 150; z += 30) spots.push({ x: 121.5, z, kind: 'bench', rot: Math.PI / 2 });
  // bins + hydrants scattered on sidewalks
  for (const bx of [-133, -63, 7, 77]) for (const bz of [-105, -35, 35, 105]) {
    spots.push({ x: bx + (rng() - 0.5) * 50, z: bz - 30.5, kind: rng() < 0.5 ? 'bin' : 'hydrant' });
    spots.push({ x: bx - 30.5, z: bz + (rng() - 0.5) * 50, kind: rng() < 0.5 ? 'hydrant' : 'bin' });
  }
  for (const s of spots) {
    if (s.kind === 'bench') {
      const b = new THREE.Mesh(benchGeo, benchMat);
      b.position.set(s.x, 0.45, s.z);
      b.rotation.y = s.rot || 0;
      b.castShadow = true;
      root.add(b);
      colliders.push(aabb(s.x, s.z, 0.7, 2, 0.05));
    } else if (s.kind === 'bin') {
      const b = new THREE.Mesh(binGeo, binMat);
      b.position.set(s.x, 0.48, s.z);
      root.add(b);
      colliders.push(aabb(s.x, s.z, 0.8, 0.8, 0.05));
    } else {
      const h = new THREE.Mesh(hydGeo, hydMat);
      h.position.set(s.x, 0.35, s.z);
      root.add(h);
      colliders.push(aabb(s.x, s.z, 0.5, 0.5, 0.05));
    }
  }
  // bus stops: shelter + sign on Ocean Drive and downtown
  for (const [x, z, rot] of [[104.5, -70, 0], [104.5, 70, 0], [-91, 0, Math.PI / 2], [-21, -108, 0]]) {
    const g = new THREE.Group();
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x2e86ab, roughness: 0.6 }));
    roof.position.y = 2.5;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.9, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xbfe3ef, transparent: true, opacity: 0.35, roughness: 0.2 }));
    glass.position.set(0, 1.25, -0.7);
    const bench = new THREE.Mesh(benchGeo, benchMat);
    bench.position.set(0, 0.45, -0.3);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 6), metalMat);
    pole.position.set(2.6, 1.4, 0);
    const signM = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7),
      new THREE.MeshBasicMaterial({ map: signTexture('BUS', '#2e86ab'), side: THREE.DoubleSide }));
    signM.position.set(2.6, 2.9, 0);
    g.add(roof, glass, bench, pole, signM);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    g.traverse((o) => { o.castShadow = true; });
    root.add(g);
    colliders.push(aabb(x, z, rot === 0 ? 4.4 : 1.6, rot === 0 ? 1.6 : 4.4, 0.05));
  }
}

// ---------- palms + streetlights (instanced) ----------
function buildPalmsAndLights(root, rng, colliders) {
  const palmSpots = [];
  for (let z = -168; z <= 168; z += 13) {
    palmSpots.push({ x: 118.5, z: z + (rng() - 0.5) * 4 });
    if (rng() < 0.7) palmSpots.push({ x: 133 + rng() * 8, z: z + 6 });
  }
  for (const bx of [-133, -63, 7, 77]) for (const bz of [-105, -35, 35, 105]) {
    const n = 2 + (rng() * 3 | 0);
    for (let i = 0; i < n; i++) {
      const edge = rng();
      const px = bx + (edge < 0.5 ? (rng() < 0.5 ? -30 : 30) : (rng() - 0.5) * 56);
      const pz = bz + (edge < 0.5 ? (rng() - 0.5) * 56 : (rng() < 0.5 ? -30 : 30));
      palmSpots.push({ x: px, z: pz });
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.24, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x9a7a52, roughness: 1 });
  const frondGeo = new THREE.ConeGeometry(2.5, 1.15, 8);
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x5da24a, roughness: 0.95, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length);
  trunks.castShadow = true;
  const dummy = new THREE.Object3D();
  palmSpots.forEach((p, i) => {
    const h = 5.5 + rng() * 3.2;
    const lean = (rng() - 0.5) * 0.22, leanZ = (rng() - 0.5) * 0.22;
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(lean, rng() * Math.PI, leanZ);
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    // fronds sit at the trunk tip (accounting for lean)
    dummy.position.set(p.x - Math.sin(leanZ) * h * 0.9, h * Math.cos(lean) - 0.35, p.z + Math.sin(lean) * h * 0.9);
    dummy.rotation.set(Math.PI + lean * 0.4, 0, leanZ * 0.4);
    dummy.scale.set(1 + rng() * 0.4, 0.8, 1 + rng() * 0.4);
    dummy.updateMatrix();
    fronds.setMatrixAt(i, dummy.matrix);
    colliders.push(aabb(p.x, p.z, 0.5, 0.5));
  });
  root.add(trunks, fronds);

  // streetlights along every road
  const lightSpots = [];
  for (const x of V_ROADS) for (let z = -160; z <= 160; z += 36) lightSpots.push({ x: x + ((((z / 36) | 0) % 2) ? 6.4 : -6.4), z });
  for (const z of H_ROADS) for (let x = -160; x <= 104; x += 36) lightSpots.push({ x, z: z + ((((x / 36) | 0) % 2) ? 6.4 : -6.4) });
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 5.6, 6);
  poleGeo.translate(0, 2.8, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.6, metalness: 0.5 });
  const lampGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lightSpots.length);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lightSpots.length);
  lightSpots.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p.x, 5.65, p.z);
    dummy.updateMatrix();
    lamps.setMatrixAt(i, dummy.matrix);
  });
  root.add(poles, lamps);
}

// ---------- shared world data for other modules ----------
export const LANDMARKS = {
  spawn: { x: 100, z: -18, heading: -Math.PI / 2 },
  cafe: { x: 84, z: -35 },
  marisol: { x: 87, z: -27 },
  warehouse: { x: -133, z: 84 },
  warehouseYard: { x: -133, z: 130 },
  policeStation: { x: -63, z: -80 },
  hospital: { x: 7, z: -84 },
  garage: { x: -63, z: 35 },
  marina: { x: 228, z: 32 },
  pierBase: { x: 182, z: 32 },
};

export function parkedSpots(rng) {
  const spots = [];
  for (const x of V_ROADS) {
    for (let z = -158; z <= 158; z += 17) {
      if (H_ROADS.some((hz) => Math.abs(z - hz) < 13)) continue;
      if (rng() < 0.45) spots.push({ x: x - 5.4, z, heading: Math.PI });
      if (rng() < 0.45) spots.push({ x: x + 5.4, z, heading: 0 });
    }
  }
  for (const z of H_ROADS) {
    for (let x = -158; x <= 100; x += 17) {
      if (V_ROADS.some((vx) => Math.abs(x - vx) < 13)) continue;
      if (rng() < 0.4) spots.push({ x, z: z - 5.4, heading: Math.PI / 2 });
      if (rng() < 0.4) spots.push({ x, z: z + 5.4, heading: -Math.PI / 2 });
    }
  }
  return spots;
}

export function pedLoops() {
  const loops = [];
  for (const bx of [-133, -63, 7, 77]) for (const bz of [-105, -35, 35, 105]) {
    const o = BLOCK / 2 + 1.6;
    loops.push([
      { x: bx - o, z: bz - o }, { x: bx + o, z: bz - o },
      { x: bx + o, z: bz + o }, { x: bx - o, z: bz + o },
    ]);
  }
  // promenade loop along the beach
  loops.push([
    { x: 122, z: -165 }, { x: 122, z: 165 },
    { x: 131, z: 165 }, { x: 131, z: -165 },
  ]);
  return loops;
}

export const PACKAGE_SPOTS = [
  { x: 93, z: -35, label: 'café terrace' },        // on the terrace platform (y 1.2)
  { x: 228, z: 32, label: 'end of the pier' },     // pier deck (y 0.9)
  { x: -80, z: 50, label: 'parking garage' },      // garage ground floor corner
  { x: 97.5, z: 91, label: 'rooftop perch' },      // scaffold perch (y 8)
  { x: -152, z: 92, label: 'behind the warehouse' },
  { x: 150, z: -152, label: 'north beach' },
  { x: 160, z: 82, label: 'south beach' },
  { x: -118, z: -18, label: 'downtown alley' },
  { x: 20, z: -124, label: 'behind the hospital' },
  { x: 184, z: 46, label: 'marina shore' },
];

export { clamp };
