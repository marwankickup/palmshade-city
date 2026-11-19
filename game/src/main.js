// main.js — Palmshade City: boot, game loop, state machine, input, camera, crimes, HUD.

import * as THREE from 'three';
import { buildCity } from './city.js';
import { Player } from './player.js';
import { Car, spawnParkedCars } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Peds } from './peds.js';
import { Police } from './police.js';
import { Combat, Particles } from './combat.js';
import { Collectibles } from './collectibles.js';
import { Missions } from './missions.js';
import { Minimap } from './minimap.js';
import { AudioEngine } from './audio.js';
import { loadSave, writeSave, hasSave } from './save.js';
import { setSeed, clamp, lerp, dist2d, angleLerp, angleDiff } from './util.js';

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '1', 10);
const shotName = params.get('shot');
setSeed(seed * 7919 + 13);

// ---------- renderer / scene ----------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 2400);
camera.position.set(150, 30, 60);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- world ----------
const city = buildCity(scene);
const L = city.landmarks;
const audio = new AudioEngine(!!shotName);
const particles = new Particles(scene);

const player = new Player(scene, 188, -18);
player.heading = -Math.PI / 2;
const parkedCars = spawnParkedCars(scene, city);
const traffic = new Traffic(scene, 10);
const peds = new Peds(scene, 26);

// Marisol NPC (simple figure, distinct dress)
const marisol = (() => {
  const g = new THREE.Group();
  const dress = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.05, 8), new THREE.MeshLambertMaterial({ color: 0xe84f7d }));
  dress.position.y = 0.85; dress.castShadow = true;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.26), new THREE.MeshLambertMaterial({ color: 0xf2e4cc }));
  torso.position.y = 1.55;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.32), new THREE.MeshLambertMaterial({ color: 0x8a5a34 }));
  head.position.y = 1.95;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.36), new THREE.MeshLambertMaterial({ color: 0x2a1a12 }));
  hair.position.y = 2.14;
  g.add(dress); g.add(torso); g.add(head); g.add(hair);
  g.position.set(L.marisol.x, 0, L.marisol.z);
  scene.add(g);
  return g;
})();

// ---------- game state ----------
let state = 'menu';           // menu | playing | paused | busted | wasted
let money = 120;
let playerCar = null;
let stateTimer = 0;
let lastDamageAt = -99;
let elapsed = 0;
const SPAWN = { x: 188, z: -18 };

function allCars() {
  const out = [...parkedCars];
  for (const t of traffic.cars) out.push(t.car);
  for (const u of police.units) out.push(u.car);
  return out;
}
function findTaggedCar(tag) {
  for (const c of allCars()) if (c.missionTag === tag) return c;
  return null;
}

// ---------- dialogue / toast ----------
const el = (id) => document.getElementById(id);
const dialogue = { lines: [], idx: 0, timer: 0, cb: null, active: false };
function showDialogue(lines, cb) {
  dialogue.lines = lines || [];
  dialogue.idx = 0;
  dialogue.timer = 0;
  dialogue.cb = cb || null;
  dialogue.active = dialogue.lines.length > 0;
  renderDialogue();
}
function renderDialogue() {
  if (!dialogue.active) { el('banner').classList.add('hidden'); return; }
  const [name, text] = dialogue.lines[dialogue.idx];
  el('bannerName').textContent = name;
  el('bannerText').textContent = text;
  el('banner').classList.remove('hidden');
}
function advanceDialogue() {
  if (!dialogue.active) return;
  dialogue.idx++;
  dialogue.timer = 0;
  if (dialogue.idx >= dialogue.lines.length) {
    dialogue.active = false;
    renderDialogue();
    const cb = dialogue.cb; dialogue.cb = null;
    if (cb) cb();
  } else renderDialogue();
}
let toastTimer = 0;
function banner(text) {
  el('toast').textContent = text;
  el('toast').classList.remove('hidden');
  toastTimer = 3.6;
}

// ---------- crimes & witnessing ----------
function witnessed(x, z) {
  if (peds.anyNear(x, z, 27)) return true;
  for (const t of traffic.cars) if (dist2d(t.car.pos.x, t.car.pos.z, x, z) < 30) return true;
  for (const u of police.units) if (dist2d(u.car.pos.x, u.car.pos.z, x, z) < 62) return true;
  return false;
}
const CRIME_POINTS = { gunshot: 0.6, shootCar: 0.8, shootPed: 1.2, steal: 1.0, hitPed: 1.0, hitCar: 0.4, hitPolice: 0.9 };
function onCrime(type, x, z) {
  if (type === 'gunshot' || type === 'shootPed') peds.scare(x, z, 16);
  if (!witnessed(x, z)) return;
  police.reportCrime(CRIME_POINTS[type] || 0.5);
}

// ---------- police ----------
const police = new Police(scene, {
  city, audio,
  onBusted: () => doBusted(),
  onPoliceShot: (from, to, hit) => {
    combat.tracerFromTo(from, to);
    if (hit && state === 'playing') {
      player.health -= 4 + Math.random() * 5;
      lastDamageAt = elapsed;
      if (player.health <= 0) doWasted();
    }
  },
});

// ---------- combat / collectibles / missions ----------
const combat = new Combat(scene, {
  camera, player, peds, police, audio, particles,
  allCars, onCrime,
});
const collectibles = new Collectibles(scene, []);
function onCollect(pkg) {
  money += 150;
  audio.pickup();
  banner(`Hidden package found — +$150 (${collectibles.foundCount()}/10)`);
  particles.burst(pkg.x, pkg.y + 1, pkg.z, 14, [0.4, 1, 0.9], 4, 0.7);
  autosave();
}
function spawnMissionCar(spec, tag) {
  const car = new Car(scene, spec.type, spec.color, spec.x, spec.z, spec.heading);
  car.missionTag = tag;
  car.parked = true;
  parkedCars.push(car);
  return car;
}
function ensureCafeVan() {
  let van = findTaggedCar('cafeVan');
  if (!van) van = spawnMissionCar({ type: 'van', color: 0xf2a03c, x: 148, z: -52, heading: Math.PI / 2 }, 'cafeVan');
  if (van !== playerCar) {
    van.pos.set(148, 0, -52);
    van.heading = Math.PI / 2;
    van.speed = 0;
    van.hp = Math.max(van.hp, 70);
    van.syncMesh();
  }
  return van;
}
let objectiveText = '';
function setObjective(txt) {
  if (txt === objectiveText) return;
  objectiveText = txt;
  el('objtext').textContent = txt;
  el('objective').classList.toggle('hidden', !txt);
}
const missions = new Missions(scene, {
  landmarks: L, police, audio,
  showDialogue, setObjective, banner,
  addMoney: (n) => { money += n; },
  autosave: () => autosave(),
  spawnMissionCar, ensureCafeVan, findTaggedCar,
  getPlayerPos: () => player.pos,
  getPlayerCar: () => playerCar,
  isDriving: () => !!playerCar,
  groundYAt: (x, z) => city.groundHeightAt(x, z, 60),
});

// ---------- save ----------
function gatherSave() {
  return {
    money, missionIndex: missions.index,
    packages: collectibles.foundIds(),
    pos: [Math.round(player.pos.x * 10) / 10, Math.round(player.pos.z * 10) / 10],
    finishedStory: missions.finishedStory,
  };
}
function autosave() { if (state === 'playing') writeSave(gatherSave()); }
function applySave(s) {
  money = s.money;
  missions.setProgress(s.missionIndex, s.finishedStory);
  collectibles.setFound(s.packages);
  if (s.pos) {
    player.pos.set(s.pos[0], 0, s.pos[1]);
    player.y = city.groundHeightAt(s.pos[0], s.pos[1], 0);
  }
}

// ---------- enter / exit cars ----------
function nearestCar(maxD) {
  let best = null, bd = maxD;
  for (const c of allCars()) {
    if (c === playerCar) continue;
    const d = dist2d(player.pos.x, player.pos.z, c.pos.x, c.pos.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function enterCar(car) {
  if (!car) return;
  const wasTraffic = car.driver === 'traffic';
  if (wasTraffic) traffic.claim(car);
  const wasParked = car.parked;
  car.parked = false;
  car.driver = 'player';
  playerCar = car;
  player.group.visible = false;
  if (wasParked || wasTraffic) onCrime('steal', car.pos.x, car.pos.z);
  audio.click();
}
function exitCar() {
  if (!playerCar) return;
  const car = playerCar;
  playerCar = null;
  car.driver = null;
  car.parked = true;
  if (!parkedCars.includes(car)) parkedCars.push(car);
  // step out on the left side of the car
  const side = { x: -Math.cos(car.heading), z: Math.sin(car.heading) };
  let nx = car.pos.x + side.x * 2.4, nz = car.pos.z + side.z * 2.4;
  [nx, nz] = city.collide(nx, nz, 0.45);
  player.pos.set(nx, car.pos.y, nz);
  player.y = city.groundHeightAt(nx, nz, 0);
  player.heading = car.heading;
  player.group.visible = true;
  audio.click();
}

// ---------- busted / wasted ----------
function doBusted() {
  if (state !== 'playing') return;
  state = 'busted';
  stateTimer = 2.8;
  const fine = Math.min(money, 100 + police.stars * 60);
  money -= fine;
  el('bustedSub').textContent = `The Palmshade PD got you. Fine: $${fine}.`;
  el('bustedOv').classList.remove('hidden');
  audio.bustedJingle();
  document.exitPointerLock && document.exitPointerLock();
}
function doWasted() {
  if (state !== 'playing') return;
  state = 'wasted';
  stateTimer = 2.8;
  money = Math.max(0, money - 75);
  el('wastedOv').classList.remove('hidden');
  document.exitPointerLock && document.exitPointerLock();
}
function respawnAt(point) {
  if (playerCar) {
    const car = playerCar;
    playerCar = null;
    car.driver = null; car.parked = true;
    if (!parkedCars.includes(car)) parkedCars.push(car);
  }
  player.pos.set(point.x, 0, point.z);
  player.y = 0;
  player.health = 100;
  player.group.visible = true;
  police.clear();
  state = 'playing';
  el('bustedOv').classList.add('hidden');
  el('wastedOv').classList.add('hidden');
}

// ---------- input ----------
const keys = {};
let mouseDown = false;
let camYaw = Math.PI / 2, camPitch = 0.34;
const camPosSmooth = new THREE.Vector3(150, 30, 60);

addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.code === 'KeyE' && !e.repeat) onKeyE();
  if (e.code === 'KeyP' && !e.repeat) {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  }
  keys[e.code] = true;
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousedown', () => {
  audio.unlock();
  if (state === 'playing' && !shotName) {
    if (document.pointerLockElement !== canvas) { try { canvas.requestPointerLock(); } catch (err) {} }
    else if (dialogue.active) advanceDialogue();
    else mouseDown = true;
  }
});
addEventListener('mouseup', () => { mouseDown = false; player.setAiming(false); });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || state !== 'playing') return;
  camYaw -= e.movementX * 0.0026;
  camPitch = clamp(camPitch + e.movementY * 0.0022, 0.04, 1.15);
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && state === 'playing' && !shotName) pauseGame();
});

function onKeyE() {
  if (state !== 'playing') return;
  if (dialogue.active) { advanceDialogue(); return; }
  if (playerCar) { exitCar(); return; }
  if (missions.canInteract()) { missions.interact(); return; }
  const car = nearestCar(3.6);
  if (car) enterCar(car);
}
function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  el('pause').classList.remove('hidden');
  document.exitPointerLock && document.exitPointerLock();
}
function resumeGame() {
  state = 'playing';
  el('pause').classList.add('hidden');
  if (!shotName) { try { canvas.requestPointerLock(); } catch (err) {} }
}
function startGame(fromSave) {
  if (!fromSave) {
    money = 120;
    missions.setProgress(0, false);
    collectibles.setFound([]);
    police.clear();
    if (playerCar) exitCar();
    player.pos.set(SPAWN.x, 0, SPAWN.z);
    player.y = 0;
    player.health = 100;
    player.heading = -Math.PI / 2;
    camYaw = Math.PI / 2;
  }
  state = 'playing';
  el('menu').classList.add('hidden');
  el('pause').classList.add('hidden');
  el('hud').classList.remove('hidden');
  audio.unlock();
  if (!shotName) { try { canvas.requestPointerLock(); } catch (err) {} }
}

el('btnPlay').addEventListener('click', () => startGame(false));
el('btnContinue').addEventListener('click', () => {
  const s = loadSave();
  if (s) applySave(s);
  startGame(true);
});
el('btnResume').addEventListener('click', resumeGame);
el('btnSave').addEventListener('click', () => { writeSave(gatherSave()); banner('Game saved'); });
el('btnMenu').addEventListener('click', () => {
  state = 'menu';
  el('pause').classList.add('hidden');
  el('hud').classList.add('hidden');
  el('menu').classList.remove('hidden');
  if (hasSave()) el('btnContinue').classList.remove('hidden');
});
if (hasSave()) el('btnContinue').classList.remove('hidden');

// ---------- per-frame game update ----------
function playerInfoForPolice() {
  return {
    x: player.pos.x, z: player.pos.z,
    speed: playerCar ? Math.abs(playerCar.speed) : player.speed,
    onFoot: !playerCar,
  };
}

function updateGame(dt) {
  // dialogue timer
  if (dialogue.active) {
    dialogue.timer += dt;
    if (dialogue.timer > 3.6) advanceDialogue();
  }
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) el('toast').classList.add('hidden'); }

  if (playerCar) {
    // ----- driving -----
    const car = playerCar;
    const throttle = (keys.KeyW ? 1 : 0) + (keys.KeyS ? -1 : 0);
    let steer = (keys.KeyA ? 1 : 0) + (keys.KeyD ? -1 : 0);
    if (keys.Space) { car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 18 * dt); steer *= 1.6; }
    const speedBefore = Math.abs(car.speed);
    car.drive(dt, throttle, steer);
    let [cx, cz] = city.collide(car.pos.x, car.pos.z, 1.55);
    const corr = Math.hypot(cx - car.pos.x, cz - car.pos.z);
    car.pos.x = clamp(cx, -276, 233);
    car.pos.z = clamp(cz, -206, 206);
    if (corr > 0.3 && speedBefore > 7) {
      car.hp -= (speedBefore - 5) * 1.4;
      audio.crash(speedBefore > 14);
      const f = car.forward();
      particles.burst(car.pos.x + f.x * 2, 0.8, car.pos.z + f.z * 2, 8, [1, 0.75, 0.3], 4, 0.4);
      car.speed *= 0.45;
    }
    if (car.hp < 45 && Math.random() < dt * 9) {
      const f = car.forward();
      particles.smoke(car.pos.x + f.x * 1.6, 1.0, car.pos.z + f.z * 1.6);
    }
    player.pos.set(car.pos.x, 0, car.pos.z);
    audio.setEngine(clamp(Math.abs(car.speed) / car.spec.maxSpeed, 0, 1), true);
  } else {
    // ----- on foot -----
    const f = { x: -Math.sin(camYaw), z: -Math.cos(camYaw) };
    const r = { x: -f.z, z: f.x };
    let mx = 0, mz = 0;
    if (keys.KeyW) { mx += f.x; mz += f.z; }
    if (keys.KeyS) { mx -= f.x; mz -= f.z; }
    if (keys.KeyD) { mx += r.x; mz += r.z; }
    if (keys.KeyA) { mx -= r.x; mz -= r.z; }
    const len = Math.hypot(mx, mz);
    const moveDir = len > 0.01 ? { x: mx / len, z: mz / len } : null;
    player.update(dt, moveDir, !!(keys.ShiftLeft || keys.ShiftRight), city);
    // shooting
    if (mouseDown && document.pointerLockElement === canvas && !dialogue.active) {
      player.heading = Math.atan2(f.x, f.z);
      player.setAiming(true);
      combat.fire();
    }
    audio.setEngine(0, false);
  }

  // ----- car vs car + car vs ped -----
  const moving = allCars().filter(c => Math.abs(c.speed) > 0.5);
  const everyCar = allCars();
  for (const m of moving) {
    if (shotName) {
      // shot scenes: no shoving matches — only the hero car can knock a ped down
      if (m === stagedCar && Math.abs(m.speed) > 4) {
        for (const p of peds.list) {
          if (p.state !== 'down' && dist2d(m.pos.x, m.pos.z, p.x, p.z) < 1.7) peds.knockDown(p);
        }
      }
      continue;
    }
    for (const o of everyCar) {
      if (o === m) continue;
      const d = dist2d(m.pos.x, m.pos.z, o.pos.x, o.pos.z);
      if (d < 3.05 && d > 0.001) {
        const push = (3.05 - d) / 2;
        const dx = (m.pos.x - o.pos.x) / d, dz = (m.pos.z - o.pos.z) / d;
        m.pos.x += dx * push; m.pos.z += dz * push;
        if (Math.abs(o.speed) > 0.5 || o === playerCar) { o.pos.x -= dx * push; o.pos.z -= dz * push; }
        if (m === playerCar && Math.abs(m.speed) > 6) {
          audio.crash(Math.abs(m.speed) > 13);
          m.hp -= 4; o.hp -= 5;
          onCrime(o.isPolice ? 'hitPolice' : 'hitCar', m.pos.x, m.pos.z);
          m.speed *= 0.6;
        }
      }
    }
    if (Math.abs(m.speed) > 4) {
      for (const p of peds.list) {
        if (p.state !== 'down' && dist2d(m.pos.x, m.pos.z, p.x, p.z) < 1.7) {
          peds.knockDown(p);
          if (m === playerCar) { onCrime('hitPed', m.pos.x, m.pos.z); audio.crash(false); }
          m.speed *= 0.78;
        }
      }
    }
  }

  // ----- systems -----
  const obstacles = [...traffic.cars.map(t => t.car), ...police.units.map(u => u.car)];
  obstacles.push(playerCar || { pos: player.pos });
  if (!shotName) traffic.update(dt, player.pos, obstacles); // frozen backdrop in shot scenes
  peds.update(dt, city);
  police.update(dt, playerInfoForPolice(), obstacles);
  missions.update(dt);
  collectibles.update(dt, elapsed, player.pos, player.y, !playerCar, onCollect);
  combat.update(dt);
  particles.update(dt);

  // health regen
  if (player.health > 0 && player.health < 100 && elapsed - lastDamageAt > 6) {
    player.health = Math.min(100, player.health + 3 * dt);
  }
  // Marisol faces the player when near
  const md = dist2d(player.pos.x, player.pos.z, L.marisol.x, L.marisol.z);
  if (md < 12) marisol.rotation.y = Math.atan2(player.pos.x - L.marisol.x, player.pos.z - L.marisol.z);

  updateHUD();
}

// ---------- HUD ----------
const hudCache = { stars: -1, money: -1, packages: -1, objDist: '' };
function updateHUD() {
  const stars = police.stars;
  if (stars !== hudCache.stars) {
    hudCache.stars = stars;
    let html = '';
    for (let i = 1; i <= 5; i++) html += i <= stars ? '★' : '<span class="off">★</span>';
    el('wanted').innerHTML = html;
  }
  if (money !== hudCache.money) {
    hudCache.money = money;
    el('money').textContent = '$' + money;
  }
  el('healthfill').style.width = clamp(player.health, 0, 100) + '%';
  el('vig').style.boxShadow = player.health < 45
    ? `inset 0 0 120px rgba(190,20,20,${(1 - player.health / 45) * 0.55})` : 'inset 0 0 120px rgba(180,20,20,0)';
  if (playerCar) {
    el('carbar').classList.remove('hidden');
    el('carfill').style.width = clamp(playerCar.hp, 0, 100) + '%';
    el('speedo').classList.remove('hidden');
    el('speedo').querySelector('.num').textContent = Math.round(Math.abs(playerCar.speed) * 3.6);
  } else {
    el('carbar').classList.add('hidden');
    el('speedo').classList.add('hidden');
  }
  el('crosshair').classList.toggle('hidden', !!playerCar);
  const pc = collectibles.foundCount();
  if (pc !== hudCache.packages) {
    hudCache.packages = pc;
    el('packages').textContent = `Packages ${pc}/10`;
  }
  // busted meter
  const bm = police.bustedMeter;
  el('bustedwrap').classList.toggle('hidden', bm <= 0.02);
  el('bustedfill').style.width = (bm * 100) + '%';
  // objective distance
  const target = missions.currentTarget();
  if (target && objectiveText) {
    const d = Math.round(dist2d(player.pos.x, player.pos.z, target.x, target.z)) + 'm';
    if (d !== hudCache.objDist) { hudCache.objDist = d; el('objdist').textContent = '· ' + d; }
  } else el('objdist').textContent = '';
  // context prompt
  let prompt = '';
  if (!dialogue.active) {
    if (playerCar) prompt = '';
    else if (missions.canInteract()) prompt = '<b>E</b> Talk to Marisol';
    else if (nearestCar(3.6)) prompt = '<b>E</b> Enter vehicle';
  }
  const promptEl = el('prompt');
  if (prompt) { promptEl.innerHTML = prompt; promptEl.classList.remove('hidden'); }
  else promptEl.classList.add('hidden');
}

// ---------- camera ----------
let shotCam = null;
function updateCamera(dt) {
  if (shotCam) {
    const s = shotCam.subject();
    const a = s.heading + shotCam.angleOff;
    camera.position.set(
      s.x - Math.sin(a) * shotCam.dist,
      (s.y || 0) + shotCam.h,
      s.z - Math.cos(a) * shotCam.dist
    );
    camera.lookAt(
      s.x + Math.sin(s.heading) * shotCam.lookFwd, 1.4,
      s.z + Math.cos(s.heading) * shotCam.lookFwd
    );
    return;
  }
  if (state === 'menu') {
    const t = elapsed * 0.045;
    camera.position.set(150 + Math.sin(t) * 62, 17 + Math.sin(elapsed * 0.13) * 3, -6 + Math.cos(t) * 62);
    camera.lookAt(118, 3, -26);
    return;
  }
  const target = playerCar ? playerCar.pos : player.pos;
  if (playerCar && Math.abs(playerCar.speed) > 2) {
    camYaw = angleLerp(camYaw, playerCar.heading + Math.PI, clamp(dt * 2.4, 0, 1));
  }
  const dist = playerCar ? 10.5 : 7.4;
  const flat = Math.cos(camPitch) * dist;
  const desired = new THREE.Vector3(
    target.x + Math.sin(camYaw) * flat,
    target.y + 1.7 + Math.sin(camPitch) * dist,
    target.z + Math.cos(camYaw) * flat
  );
  desired.y = Math.max(desired.y, city.groundHeightAt(desired.x, desired.z, 0) + 0.8);
  camPosSmooth.lerp(desired, clamp(dt * 11, 0, 1));
  camera.position.copy(camPosSmooth);
  const look = new THREE.Vector3(target.x, target.y + 1.6, target.z);
  if (playerCar) {
    const f = playerCar.forward();
    look.x += f.x * 3.5; look.z += f.z * 3.5;
  }
  camera.lookAt(look);
  // sun shadow frustum follows the action
  const focus = playerCar ? playerCar.pos : player.pos;
  city.sun.position.set(focus.x + city.sunDir.x * 260, city.sunDir.y * 260, focus.z + city.sunDir.z * 260);
  city.sun.target.position.set(focus.x, 0, focus.z);
}

// ---------- shot staging (screenshots) ----------
let stagedCar = null, stagedSpeed = 0, frames = 0, formation = null;
function stageShot(name) {
  el('menu').classList.add('hidden');
  el('hud').classList.remove('hidden');
  state = 'playing';
  money = 1250;
  const subjectOf = (obj) => () => ({ x: obj.pos.x, z: obj.pos.z, y: obj.pos.y || 0, heading: obj.heading });
  if (name === 'cover' || name === 'chase') {
    // clear the hero's avenue corridor (road + sidewalks) of traffic and parked
    // cars so nothing photobombs the run
    let park = 0;
    const corridor = [...traffic.cars.map(t => t.car), ...parkedCars];
    for (const c of corridor) {
      if (Math.abs(c.pos.z + 70) < 25 && c.pos.x > -40 && c.pos.x < 140) {
        c.pos.set(-255 + (park++) * 8, 0, 96);
        c.heading = Math.PI / 2;
        c.syncMesh();
      }
    }
  }
  if (name === 'cover') {
    const car = new Car(scene, 'sport', 0xe84f3d, 26, -70, Math.PI / 2);
    parkedCars.push(car);
    enterCar(car);
    car.speed = 23; stagedCar = car; stagedSpeed = 23;
    police.setWanted(3);
    police.stageUnit(10, -74, Math.PI / 2);
    police.stageUnit(16, -66, Math.PI / 2);
    formation = [
      { u: police.units[0], fwd: -8.5, side: -3.5 },
      { u: police.units[1], fwd: -7.5, side: 4 },
    ];
    shotCam = { subject: subjectOf(car), angleOff: Math.PI / 2 - 0.35, dist: 10.5, h: 2.0, lookFwd: -2 };
  } else if (name === 'foot') {
    player.pos.set(190, 0, -16);
    player.heading = -Math.PI / 2;
    shotCam = { subject: subjectOf(player), angleOff: 0.3, dist: 6.5, h: 1.9, lookFwd: 3 };
  } else if (name === 'mission') {
    missions.start(0);
    const van = ensureCafeVan();
    van.pos.set(34, 0, 10); van.heading = -Math.PI / 2; van.syncMesh();
    enterCar(van);
    van.speed = 15; stagedCar = van; stagedSpeed = 15;
    shotCam = { subject: subjectOf(van), angleOff: Math.PI - 0.6, dist: 9.5, h: 2.3, lookFwd: 5 };
  } else if (name === 'chase') {
    const car = new Car(scene, 'sedan', 0x3fa7d6, 30, -70, Math.PI / 2);
    parkedCars.push(car);
    enterCar(car);
    car.speed = 20; stagedCar = car; stagedSpeed = 20;
    police.setWanted(5);
    police.stageUnit(20, -75, Math.PI / 2);
    police.stageUnit(22, -64.5, Math.PI / 2);
    police.stageUnit(58, -64, Math.PI / 2);
    formation = [
      { u: police.units[0], fwd: -10.5, side: -4.5 },
      { u: police.units[1], fwd: -9, side: 5 },
      { u: police.units[2], fwd: 3, side: 8 },
    ];
    shotCam = { subject: subjectOf(car), angleOff: -0.85, dist: 13.5, h: 3.0, lookFwd: 3 };
  } else if (name === 'beach') {
    player.pos.set(216, 0, 12);
    player.heading = Math.PI / 2;
    shotCam = { subject: subjectOf(player), angleOff: Math.PI, dist: 7.5, h: 2.0, lookFwd: 1 };
  }
}

// ---------- debug hooks ----------
window.__game = {
  get state() { return state; },
  get money() { return money; },
  get wanted() { return police.wanted; },
  get stars() { return police.stars; },
  get playerCar() { return playerCar; },
  player, police, missions, collectibles, traffic, peds, combat,
  debug: {
    teleport(x, z) { player.pos.set(x, 0, z); player.y = city.groundHeightAt(x, z, 0); },
    setWanted(n) { police.setWanted(n); },
    startMission() { missions.start(missions.index); },
    interact() { missions.interact(); },
    canInteract() { return missions.canInteract(); },
    enterNearest() { const c = nearestCar(7); if (c) { enterCar(c); return true; } return false; },
    enterCar(car) { enterCar(car); },
    exitCar() { exitCar(); },
    completeStep() { if (missions.active) missions._nextStep(); },
    missionInfo() { return missions.debugInfo(); },
    giveMoney(n) { money += n; },
    setHealth(n) { player.health = n; },
    saveNow() { writeSave(gatherSave()); },
    play() { startGame(false); },
    continueGame() { const s = loadSave(); if (s) applySave(s); startGame(true); },
    findTaggedCar,
    bustedMeter() { return police.bustedMeter; },
    stageBusted() { police.setWanted(2); police.stageUnit(player.pos.x + 6, player.pos.z + 4, 0); },
  },
  ready: true,
};

// ---------- main loop ----------
const minimap = new Minimap(document.getElementById('minimap'));
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  elapsed += dt;
  frames++;
  if (state === 'playing') {
    if (stagedCar) {
      // shot scenes: the hero car cruises straight ahead
      const f = stagedCar.forward();
      stagedCar.pos.x += f.x * stagedSpeed * dt;
      stagedCar.pos.z += f.z * stagedSpeed * dt;
      const [cx, cz] = city.collide(stagedCar.pos.x, stagedCar.pos.z, 1.55);
      stagedCar.pos.x = cx; stagedCar.pos.z = cz;
      stagedCar.speed = stagedSpeed;
      stagedCar.syncMesh();
      player.pos.set(stagedCar.pos.x, 0, stagedCar.pos.z);
    }
    updateGame(dt);
    if (formation && stagedCar) {
      // shot scenes: hold the police in a chase formation around the hero car
      const f = stagedCar.forward();
      const rx = -f.z, rz = f.x; // right vector
      for (const m of formation) {
        m.u.car.pos.x = stagedCar.pos.x + f.x * m.fwd + rx * m.side;
        m.u.car.pos.z = stagedCar.pos.z + f.z * m.fwd + rz * m.side;
        m.u.car.heading = stagedCar.heading;
        m.u.car.syncMesh();
        m.u.car.flashLightbar(elapsed);
      }
    }
  } else if (state === 'busted' || state === 'wasted') {
    stateTimer -= dt;
    particles.update(dt);
    if (stateTimer <= 0) respawnAt(state === 'busted' ? L.policeStation : L.hospital);
  } else if (state === 'menu') {
    traffic.update(dt, player.pos, []);
    peds.update(dt, city);
    particles.update(dt);
  }
  city.update(dt, now / 1000);
  updateCamera(dt);
  if (state === 'playing' || state === 'menu') {
    if (frames % 2 === 0) {
      minimap.draw({
        player: { x: player.pos.x, z: player.pos.z, heading: playerCar ? playerCar.heading : player.heading },
        traffic: traffic.cars, police: police.units,
        target: missions.currentTarget(), packages: collectibles.packages,
      });
    }
  }
  renderer.render(scene, camera);
  if (shotName === 'chase' && frames === 48) police.bustedMeter = 0.5; // late-set so it survives to the shot
  if (shotName && frames === 55) window.__shotReady = true;
}

if (shotName) stageShot(shotName);
requestAnimationFrame(frame);
