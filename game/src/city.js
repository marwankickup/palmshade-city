// Palmshade City itself: a procedural coastal grid built with three.js. Seven avenues each
// way make 36 blocks of pastel art-deco buildings with lit windows; the west edge is a
// palm-lined promenade, then sand, then the ocean. Golden-hour sun, warm fog, a gradient
// sky dome. Everything is generated from the shared seed, so the city is the same on
// every visit. Colliders (building footprints) and road data are exported for the
// player, traffic and police modules.

import * as THREE from 'three';
import { rand, randi, pick, chance, clamp } from './util.js';

export const PITCH = 74; // distance between road centrelines
export const ROAD_W = 14; // asphalt width
export const ROAD_LINES = [-222, -148, -74, 0, 74, 148, 222];
export const BLOCK_CENTERS = [-185, -111, -37, 37, 111, 185];
export const CITY_EDGE = 259;
export const SAND_X = -308; // waterline: sand ends and ocean begins here (west edge)
export const SLAB_TOP = 0.12; // sidewalk slabs sit this high

/** Places the story and the respawn logic care about. */
export const POINTS = {
  cafe: { x: -238, z: -37 }, // Marisol's café on the promenade
  depot: { x: 238, z: 111 }, // the delivery depot, east side
  warehouse: { x: 122, z: -238 }, // the warehouse on the south shore road
  hideout: { x: -37, z: 238 }, // Marisol's cousin's garage, south edge
  hospital: { x: 48, z: -222 }, // wasted respawn
  policeStation: { x: -200, z: 196 }, // busted respawn
};

/** The traffic lane centre for a car on a road: axis 'z' travels along a vertical road
 *  whose centreline is x = roadCenter; axis 'x' along a horizontal road at z = roadCenter.
 *  Palmshade drives on the right. */
export function laneFor(axis, dir, roadCenter) {
  if (axis === 'z') return dir > 0 ? roadCenter - 3.5 : roadCenter + 3.5;
  return dir > 0 ? roadCenter + 3.5 : roadCenter - 3.5;
}

const PASTEL = [0xf7d9b0, 0xf4a988, 0x9fd8c9, 0xa8c6e8, 0xf6e3a1, 0xe8a2c0, 0xcfe8a8, 0xf9f1e4, 0xffc4a3, 0xb5d8f0];

/** One building facade: a colour canvas (walls + windows) and a matching emissive canvas
 *  (only the lit windows), so blocks glow gently at golden hour. */
function makeFacade(baseColor, rows, cols) {
  const w = 256;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  const base = new THREE.Color(baseColor);
  g.fillStyle = `#${base.getHexString()}`;
  g.fillRect(0, 0, w, h);
  // Slight vertical shading so walls are not perfectly flat.
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(1, 'rgba(60,30,10,0.16)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // Deco band near the top and a darker storey at street level.
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(0, 10, w, 5);
  g.fillStyle = 'rgba(70,40,20,0.25)';
  g.fillRect(0, h - 26, w, 26);

  const lit = document.createElement('canvas');
  lit.width = w;
  lit.height = h;
  const lg = lit.getContext('2d');
  lg.fillStyle = '#000000';
  lg.fillRect(0, 0, w, h);

  const cellW = w / cols;
  const cellH = (h - 40) / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = c * cellW + cellW * 0.24;
      const y = 22 + r * cellH + cellH * 0.2;
      const ww = cellW * 0.52;
      const hh = cellH * 0.58;
      const isLit = chance(0.42);
      if (isLit) {
        g.fillStyle = pick(['#ffd98f', '#ffe9b8', '#ffc978']);
        g.fillRect(x, y, ww, hh);
        lg.fillStyle = '#ffbe6e';
        lg.fillRect(x, y, ww, hh);
      } else {
        g.fillStyle = 'rgba(38,52,72,0.85)';
        g.fillRect(x, y, ww, hh);
      }
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x, y, ww, 2);
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const emissiveMap = new THREE.CanvasTexture(lit);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap };
}

function makeRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#3b4149';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 380; i += 1) {
    g.fillStyle = `rgba(${randi(140, 210)},${randi(140, 200)},${randi(130, 180)},0.05)`;
    g.fillRect(rand(128), rand(128), 2, 2);
  }
  // Edge lines and a dashed centre line (one dash per tile, tiles repeat along the road).
  g.fillStyle = 'rgba(240,240,230,0.75)';
  g.fillRect(5, 0, 3, 128);
  g.fillRect(120, 0, 3, 128);
  g.fillStyle = 'rgba(255,209,102,0.9)';
  g.fillRect(62, 6, 4, 56);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makePavementTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#a8a49b';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i += 1) {
    g.fillStyle = `rgba(70,60,50,${rand(0.02, 0.07)})`;
    g.fillRect(rand(128), rand(128), 3, 3);
  }
  g.strokeStyle = 'rgba(80,74,66,0.55)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeOceanTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#3d9db8');
  grad.addColorStop(1, '#2b7d9c');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i += 1) {
    g.fillStyle = `rgba(255,255,255,${rand(0.04, 0.12)})`;
    g.fillRect(rand(256), rand(256), rand(14, 46), 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 22);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildSky(scene) {
  const skyGeo = new THREE.SphereGeometry(1500, 24, 14);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x39648f) },
      horizonColor: { value: new THREE.Color(0xffc384) },
      lowColor: { value: new THREE.Color(0xe8906b) },
      sunDir: { value: new THREE.Vector3(-0.62, 0.3, 0.28).normalize() },
      sunColor: { value: new THREE.Color(0xffdf9e) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 lowColor;
      uniform vec3 sunDir; uniform vec3 sunColor;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 col = h > 0.0
          ? mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.5))
          : mix(horizonColor, lowColor, clamp(-h * 3.0, 0.0, 1.0));
        float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += sunColor * (pow(d, 220.0) * 1.4 + pow(d, 10.0) * 0.22);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10;
  scene.add(sky);
  return sky;
}

/** Build the whole city into the scene. Returns the data the game systems need. */
export function buildCity(scene) {
  scene.fog = new THREE.Fog(0xf2b183, 160, 1150);
  const sky = buildSky(scene);

  // ---- light: low warm sun over the ocean, soft sky fill -------------------
  const hemi = new THREE.HemisphereLight(0x9db8dd, 0x97795a, 0.85);
  scene.add(hemi);
  const sunDir = new THREE.Vector3(-0.62, 0.3, 0.28).normalize();
  const sun = new THREE.DirectionalLight(0xffb066, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -110;
  sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110;
  sun.shadow.camera.bottom = -110;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0007;
  scene.add(sun);
  scene.add(sun.target);

  // ---- ground ---------------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 2600),
    new THREE.MeshLambertMaterial({ color: 0x8a7f72 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  ground.receiveShadow = true;
  scene.add(ground);

  // Promenade between the boulevard and the sand.
  const pavementTex = makePavementTexture();
  pavementTex.repeat.set(3, 60);
  const promenade = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 700),
    new THREE.MeshLambertMaterial({ map: pavementTex }),
  );
  promenade.rotation.x = -Math.PI / 2;
  promenade.position.set(-244, 0.01, 0);
  promenade.receiveShadow = true;
  scene.add(promenade);

  // Sand and sea.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(52, 760),
    new THREE.MeshLambertMaterial({ color: 0xe8d09c }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(-282, 0.02, 0);
  sand.receiveShadow = true;
  scene.add(sand);

  const oceanTex = makeOceanTexture();
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 1900),
    new THREE.MeshLambertMaterial({ map: oceanTex, transparent: true, opacity: 0.96 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(SAND_X - 745, -0.35, 0);
  scene.add(ocean);
  // A pale foam line where the water meets the sand.
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 760),
    new THREE.MeshBasicMaterial({ color: 0xfdf6e0, transparent: true, opacity: 0.5 }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(SAND_X + 1, 0.03, 0);
  scene.add(foam);

  // ---- roads ------------------------------------------------------------------
  const roadTex = makeRoadTexture();
  const ROAD_LEN = CITY_EDGE * 2 + 96;
  roadTex.repeat.set(1, ROAD_LEN / 16);
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const roadGeo = new THREE.PlaneGeometry(ROAD_W, ROAD_LEN);
  roadGeo.rotateX(-Math.PI / 2);
  for (const line of ROAD_LINES) {
    const v = new THREE.Mesh(roadGeo, roadMat);
    v.position.set(line, 0.02, 0);
    v.receiveShadow = true;
    scene.add(v);
    const h = new THREE.Mesh(roadGeo, roadMat);
    h.rotation.y = Math.PI / 2;
    h.position.set(0, 0.03, line);
    h.receiveShadow = true;
    scene.add(h);
  }
  const crossingMat = new THREE.MeshLambertMaterial({ color: 0x3b4149 });
  const crossingGeo = new THREE.PlaneGeometry(ROAD_W, ROAD_W);
  crossingGeo.rotateX(-Math.PI / 2);
  for (const x of ROAD_LINES) {
    for (const z of ROAD_LINES) {
      const m = new THREE.Mesh(crossingGeo, crossingMat);
      m.position.set(x, 0.04, z);
      m.receiveShadow = true;
      scene.add(m);
    }
  }

  // ---- blocks: sidewalk slabs and buildings ------------------------------------
  const colliders = [];
  const slabAreas = [];
  const slabTex = makePavementTexture();
  slabTex.repeat.set(5, 5);
  const slabMat = new THREE.MeshLambertMaterial({ map: slabTex });
  const slabGeo = new THREE.BoxGeometry(62, SLAB_TOP * 2, 62);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6f5b4c });
  const tankMat = new THREE.MeshLambertMaterial({ color: 0x7a4a35 });
  const tankGeo = new THREE.BoxGeometry(2.4, 2.8, 2.4);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);

  const facades = [];
  for (let i = 0; i < 12; i += 1) {
    const { map, emissiveMap } = makeFacade(pick(PASTEL), pick([8, 11, 14]), 6);
    const mat = new THREE.MeshLambertMaterial({
      map,
      emissive: new THREE.Color(0xffc27a),
      emissiveMap,
      emissiveIntensity: 0.55,
    });
    facades.push(mat);
  }

  const capGeo = new THREE.BoxGeometry(1, 0.35, 1);
  function addBuilding(cx, cz, w, d, h) {
    const facade = pick(facades);
    const mesh = new THREE.Mesh(boxGeo, facade);
    mesh.scale.set(w, h, d);
    mesh.position.set(cx, SLAB_TOP, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    // A dark roof cap, slightly proud of the walls: reads as a parapet from above
    // and keeps the facade texture off the roof.
    const cap = new THREE.Mesh(capGeo, roofMat);
    cap.scale.set(w + 0.6, 1, d + 0.6);
    cap.position.set(cx, SLAB_TOP + h + 0.17, cz);
    cap.castShadow = true;
    scene.add(cap);
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    if (chance(0.35)) {
      const tank = new THREE.Mesh(tankGeo, tankMat);
      tank.position.set(cx + rand(-w / 4, w / 4), SLAB_TOP + h + 1.4, cz + rand(-d / 4, d / 4));
      tank.castShadow = true;
      scene.add(tank);
    }
  }

  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.position.set(bx, 0, bz);
      slab.receiveShadow = true;
      scene.add(slab);
      slabAreas.push({ cx: bx, cz: bz, half: 31 });

      const centreBoost = clamp(1 - Math.hypot(bx, bz) / 340, 0, 1) * rand(16, 36);
      const pattern = pick(['tower', 'quad', 'pair', 'quad']);
      if (pattern === 'tower') {
        const w = rand(26, 38);
        addBuilding(bx, bz, w, rand(26, 38), (rand(13, 24) + centreBoost) * 1.45);
      } else if (pattern === 'pair') {
        addBuilding(bx - 15, bz, rand(20, 25), rand(24, 30), rand(10, 20) + centreBoost);
        addBuilding(bx + 15, bz, rand(20, 25), rand(24, 30), rand(10, 20) + centreBoost);
      } else {
        for (const ox of [-15, 15]) {
          for (const oz of [-15, 15]) {
            addBuilding(bx + ox, bz + oz, rand(19, 25), rand(19, 25), rand(9, 19) + centreBoost * rand(0.5, 1));
          }
        }
      }
    }
  }

  // ---- palms (instanced) --------------------------------------------------------
  const palmSpots = [];
  for (let z = -252; z <= 252; z += 14) {
    if (ROAD_LINES.some((l) => Math.abs(z - l) < 10)) continue;
    palmSpots.push({ x: -238 + rand(-1.5, 1.5), z: z + rand(-3, 3) });
  }
  for (let z = -250; z <= 250; z += 19) {
    palmSpots.push({ x: -288 + rand(-7, 7), z: z + rand(-4, 4) });
  }
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      if (chance(0.4)) palmSpots.push({ x: bx + pick([-29, 29]), z: bz + pick([-29, 29]) });
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.24, 5, 5);
  trunkGeo.translate(0, 2.5, 0);
  const canopyGeo = new THREE.ConeGeometry(3.1, 0.95, 7);
  canopyGeo.translate(0, 5.6, 0);
  const skirtGeo = new THREE.ConeGeometry(3.5, 1.6, 7);
  skirtGeo.rotateX(Math.PI);
  skirtGeo.translate(0, 5.15, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b4a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
  const leafMat2 = new THREE.MeshLambertMaterial({ color: 0x2f8a42 });
  const dummy = new THREE.Object3D();
  function fillInstances(geo, mat) {
    const inst = new THREE.InstancedMesh(geo, mat, palmSpots.length);
    palmSpots.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(rand(-0.05, 0.05), rand(Math.PI * 2), rand(-0.05, 0.05));
      const s = rand(0.85, 1.3);
      dummy.scale.set(s, s * rand(0.9, 1.15), s);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.castShadow = true;
    scene.add(inst);
    return inst;
  }
  fillInstances(trunkGeo, trunkMat);
  fillInstances(canopyGeo, leafMat);
  fillInstances(skirtGeo, leafMat2);

  // ---- street lights (instanced) --------------------------------------------------
  const lampSpots = [];
  for (const line of ROAD_LINES) {
    for (let t = -222; t <= 222; t += PITCH) {
      const side = (Math.round(t / PITCH) + Math.round(line / PITCH)) % 2 === 0 ? 1 : -1;
      lampSpots.push({ x: line + side * 8.6, z: t + 37 });
      lampSpots.push({ x: t + 37, z: line + side * 8.6 });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.11, 5.6, 5);
  poleGeo.translate(0, 2.8, 0);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x4a4f55 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const headGeo = new THREE.SphereGeometry(0.24, 8, 6);
  headGeo.translate(0, 5.65, 0);
  const headMat = new THREE.MeshLambertMaterial({
    color: 0x665533,
    emissive: new THREE.Color(0xffd9a0),
    emissiveIntensity: 0.9,
  });
  const heads = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
  lampSpots.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    heads.setMatrixAt(i, dummy.matrix);
  });
  scene.add(poles);
  scene.add(heads);

  // ---- beach dressing: umbrellas and a lifeguard stand ------------------------------
  const umbrellaCols = [0xff5e78, 0xffb340, 0x3ec1d3, 0xff7b54, 0xa06cd5];
  const poleGeoB = new THREE.CylinderGeometry(0.05, 0.05, 2.3, 5);
  for (let i = 0; i < 12; i += 1) {
    const ux = rand(-296, -272);
    const uz = rand(-240, 240);
    const pole = new THREE.Mesh(poleGeoB, trunkMat);
    pole.position.set(ux, 1.15, uz);
    scene.add(pole);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(2.1, 0.7, 8),
      new THREE.MeshLambertMaterial({ color: pick(umbrellaCols) }),
    );
    top.position.set(ux, 2.35, uz);
    top.castShadow = true;
    scene.add(top);
    if (chance(0.7)) {
      const towel = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.05, 2),
        new THREE.MeshLambertMaterial({ color: pick(umbrellaCols) }),
      );
      towel.position.set(ux + rand(1.5, 3), 0.06, uz + rand(-1, 1));
      towel.rotation.y = rand(Math.PI);
      scene.add(towel);
    }
  }
  const standMat = new THREE.MeshLambertMaterial({ color: 0xf3ead8 });
  const stand = new THREE.Group();
  for (const [lx, lz] of [[-1, -0.8], [1, -0.8], [-1, 0.8], [1, 0.8]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), standMat);
    leg.position.set(lx, 1.3, lz);
    stand.add(leg);
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.16, 2.2), standMat);
  deck.position.y = 2.6;
  stand.add(deck);
  const hut = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 1.8), new THREE.MeshLambertMaterial({ color: 0xff5e78 }));
  hut.position.y = 3.35;
  stand.add(hut);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2, 0.7, 4), standMat);
  roof.position.y = 4.35;
  roof.rotation.y = Math.PI / 4;
  stand.add(roof);
  stand.position.set(-284, 0, 14);
  stand.traverse((m) => { m.castShadow = true; });
  scene.add(stand);

  /** Ground height for walkers: slab tops in the blocks, street level elsewhere. */
  function groundHeightAt(x, z) {
    for (const s of slabAreas) {
      if (Math.abs(x - s.cx) <= s.half && Math.abs(z - s.cz) <= s.half) return SLAB_TOP;
    }
    return 0;
  }

  let elapsed = 0;
  /** Per-frame: drift the sea, and keep the sun (and its shadows) centred on the action. */
  function update(dt, focus) {
    elapsed += dt;
    oceanTex.offset.x = (elapsed * 0.008) % 1;
    oceanTex.offset.y = Math.sin(elapsed * 0.25) * 0.01;
    foam.material.opacity = 0.35 + Math.sin(elapsed * 0.9) * 0.15;
    if (focus) {
      sun.position.copy(focus).addScaledVector(sunDir, 300);
      sun.target.position.copy(focus);
      sun.target.updateMatrixWorld();
      sky.position.set(focus.x, 0, focus.z);
    }
  }

  return {
    colliders,
    groundHeightAt,
    update,
    sun,
    points: POINTS,
  };
}
