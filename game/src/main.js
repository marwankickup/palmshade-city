// main.js — Palmshade City: boot, state machine, input + mouse-orbit camera, crime
// witnessing, collisions, HUD wiring, save integration, ?shot= staging, __game hooks.
import * as THREE from 'three';
import { buildCity } from './city.js';
import { Player } from './player.js';
import { Car } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Peds } from './peds.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Collectibles } from './collectibles.js';
import { Missions, MISSION_DEFS } from './missions.js';
import { Minimap } from './minimap.js';
import { AudioSys } from './audio.js';
import { loadSave, writeSave } from './save.js';
import { makeRng, clamp, dist2d, angleLerp } from './util.js';

const params = new URLSearchParams(location.search);
const SEED = parseInt(params.get('seed') || '1', 10) || 1;
const SHOT = params.get('shot');
const rng = makeRng(SEED * 7919 + 13);

// ---------- renderer / scene ----------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe9a05f, 170, 780);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(150, 8, 10);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// golden-hour lights
const hemi = new THREE.HemisphereLight(0x93b8e8, 0xffd9a8, 0.95);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xffb36b, 2.6);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.left = -78; sunLight.shadow.camera.right = 78;
sunLight.shadow.camera.top = 78; sunLight.shadow.camera.bottom = -78;
sunLight.shadow.camera.near = 10; sunLight.shadow.camera.far = 320;
sunLight.shadow.bias = -0.0006;
scene.add(sunLight); scene.add(sunLight.target);
const amb = new THREE.AmbientLight(0x604a38, 0.5);
scene.add(amb);

// ---------- world ----------
const city = buildCity(scene, rng);
const { colliders, platforms, landmarks } = city;
const player = new Player(scene);
const traffic = new Traffic(scene, rng, colliders);
const peds = new Peds(scene, rng);
const police = new Police(scene, colliders);
const combat = new Combat(scene);
const collectibles = new Collectibles(scene);
const minimap = new Minimap(document.getElementById('minimap'));
const audio = new AudioSys();
let van = null;

// ---------- game state ----------
let mode = SHOT ? 'shot' : 'menu'; // menu | playing | paused | busted | wasted | shot
let money = 120;
let inCar = null;
let camYaw = Math.PI, camPitch = 0.34;
let danger = null, dangerTtl = 0;
let lastWantedShown = -1;
let saveDirty = false, saveTimer = 0;
const crimeCds = {};
const dialogueQueue = [];
let dialogueUntil = 0, bannerUntil = 0, toastUntil = 0;
let hudOverride = null;
let elapsed = 0;

// ---------- HUD helpers ----------
const $ = (id) => document.getElementById(id);
const hudEl = $('hud');
function showDialogue(who, line) { dialogueQueue.push({ who, line }); }
function showToast(msg, ms = 2600) {
  const t = $('toast'); t.textContent = msg; t.style.opacity = 1;
  toastUntil = performance.now() + ms;
}
function showBanner(text) {
  const b = $('mission-banner'); b.textContent = text; b.style.opacity = 1;
  bannerUntil = performance.now() + 2800;
}
function saveGame() {
  writeSave({
    money,
    missionIndex: missions.complete ? MISSION_DEFS.length : missions.index,
    packages: collectibles.takenIds(),
    pos: { x: Math.round(player.x * 10) / 10, z: Math.round(player.z * 10) / 10 },
  });
  saveDirty = false;
}

// ---------- missions wiring ----------
function ensureVan() {
  if (van && !van.dead) {
    van.mesh.position.set(landmarks.vanSpawn.x, 0, landmarks.vanSpawn.z);
    van.heading = landmarks.vanSpawn.heading; van.speed = 0;
    return van;
  }
  if (van) scene.remove(van.mesh);
  van = new Car(scene, 'van', 0xf5b041, landmarks.vanSpawn.x, landmarks.vanSpawn.z, landmarks.vanSpawn.heading);
  van.owned = true;
  return van;
}
const missionCtx = {
  landmarks, rng,
  dialogue: showDialogue,
  toast: showToast,
  addMoney: (n) => { money += n; audio.cash(); saveDirty = true; },
  setWanted: (n) => police.setWanted(n),
  wanted: () => police.wanted,
  playerPos: () => inCar ? { x: inCar.x, z: inCar.z } : { x: player.x, z: player.z },
  get van() { return van; },
  ensureVan,
  spawnThug: (x, z, r) => peds.spawnThug(x, z, r),
  pickupSound: () => audio.pickup(),
  save: () => saveGame(),
};
const missions = new Missions(scene, missionCtx);

// ---------- crime ----------
function witnessed(x, z, r) {
  for (const p of peds.list) if (p.state !== 'down' && dist2d(x, z, p.pos.x, p.pos.z) < r) return true;
  for (const u of police.units) if (dist2d(x, z, u.x, u.z) < r + 16) return true;
  return false;
}
function reportCrime(type, x, z) {
  const now = elapsed;
  if (crimeCds[type] && now - crimeCds[type] < 1.4) return;
  const table = {
    theft: { r: 24, amt: 1 }, pedHit: { r: 30, amt: 1 }, carHit: { r: 28, amt: 1 },
    gunshot: { r: 30, amt: 1 }, shotPed: { r: 36, amt: 2 }, shotCar: { r: 30, amt: 1 },
  };
  const c = table[type]; if (!c) return;
  if (witnessed(x, z, c.r)) {
    crimeCds[type] = now;
    police.addWanted(c.amt);
    $('stars').classList.remove('flash'); void $('stars').offsetWidth; $('stars').classList.add('flash');
  }
}

// ---------- cars ----------
function allCars() {
  const list = [...traffic.cars, ...traffic.parked, ...police.units];
  if (van) list.push(van);
  if (stagedCars.length) list.push(...stagedCars);
  return list;
}
function nearestCar(x, z, maxD) {
  let best = null, bd = maxD;
  for (const c of allCars()) {
    if (c === inCar) continue;
    const d = dist2d(x, z, c.x, c.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function enterCar(car) {
  inCar = car; car.driver = 'player';
  player.group.visible = false;
  if (!car.owned) { reportCrime('theft', car.x, car.z); car.owned = true; }
  missions.onEnterCar(car);
  camYaw = car.heading;
}
function exitCar() {
  if (!inCar) return;
  const car = inCar; inCar = null; car.driver = car.wasTraffic ? 'ai' : null;
  if (traffic.cars.includes(car)) car.driver = 'ai';
  const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
  player.pos.set(car.x + side.x * 2.4, 0, car.z + side.z * 2.4);
  player.y = 0; player.vy = 0;
  player.heading = car.heading;
  player.group.visible = true;
  camYaw = car.heading;
}
function tryEnterNearest() {
  const c = nearestCar(player.x, player.z, 3.6);
  if (c) { enterCar(c); return true; }
  return false;
}

// ---------- shooting ----------
const shootRay = { origin: new THREE.Vector3(), dir: new THREE.Vector3() };
function doShoot() {
  if (mode !== 'playing' || inCar) return;
  audio.init(); audio.shot();
  player.aimPose();
  camera.getWorldDirection(shootRay.dir);
  shootRay.origin.copy(camera.position);
  const res = combat.shoot(shootRay.origin, shootRay.dir, { peds: peds.list, cars: allCars() });
  const gunPos = new THREE.Vector3(
    player.x + Math.sin(player.heading) * 0.45, player.y + 1.32, player.z + Math.cos(player.heading) * 0.45);
  combat.muzzle(gunPos);
  combat.tracer(gunPos, res.end);
  danger = { x: player.x, z: player.z, r: 17 }; dangerTtl = 1.4;
  if (res.kind === 'ped') {
    const wasHostile = res.target.hostile;
    peds.hurt(res.target, 34);
    combat.sparks(res.point, 4);
    if (!wasHostile) reportCrime('shotPed', player.x, player.z);
  } else if (res.kind === 'car') {
    res.target.health -= 12;
    if (res.target.health <= 0) res.target.dead = true;
    combat.sparks(res.point, 8);
    audio.hit();
    if (res.target !== van) reportCrime('shotCar', player.x, player.z);
  } else {
    reportCrime('gunshot', player.x, player.z);
  }
}

// police + thug fire at the player
function incomingFire(fromPos, hitChance, dmgPlayer, dmgCar) {
  const target = inCar
    ? new THREE.Vector3(inCar.x, 1, inCar.z)
    : new THREE.Vector3(player.x, player.y + 1.1, player.z);
  const from = new THREE.Vector3(fromPos.x, (fromPos.y || 0) + 1.15, fromPos.z);
  combat.tracer(from, target, 0xff7a5c);
  if (rng.next() < hitChance) {
    combat.sparks(target, 5);
    if (inCar) { inCar.health -= dmgCar; player.health -= dmgPlayer * 0.3; if (inCar.health <= 0) { inCar.health = 0; inCar.dead = true; } }
    else player.health -= dmgPlayer;
  }
}
police.onShootPlayer = (unit, chance) => incomingFire(unit.mesh.position, chance, 6, 5);
police.onBusted = () => {
  if (mode !== 'playing') return;
  mode = 'busted';
  const fine = 100 + police.wanted * 60;
  $('busted-detail').textContent = `The Palmshade PD hauled you in. Fine: $${fine}.`;
  $('busted-screen').classList.remove('hidden');
  $('busted-screen').dataset.fine = fine;
  audio.bustedJingle();
  document.exitPointerLock && document.exitPointerLock();
};
function respawnPlayer() {
  police.clearAll();
  if (inCar) { const c = inCar; inCar = null; c.driver = traffic.cars.includes(c) ? 'ai' : null; }
  player.group.visible = true;
  player.pos.set(landmarks.respawn.x, 0, landmarks.respawn.z);
  player.y = 0; player.vy = 0; player.health = 100; player.heading = Math.PI * 0.75;
  camYaw = player.heading;
}

// ---------- input ----------
const keys = {};
let mouseDown = false;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyE' && mode === 'playing') {
    if (inCar) exitCar();
    else if (dist2d(player.x, player.z, landmarks.marisol.x, landmarks.marisol.z) < 3.4 && missions.interact()) {
      if (missions.active) showBanner(missions.active.def.title);
    } else tryEnterNearest();
  }
  if (e.code === 'Space') {
    if (mode === 'playing' && !inCar) player.jump();
    if (mode === 'playing') e.preventDefault();
  }
  if ((e.code === 'KeyP' || e.code === 'Escape') && (mode === 'playing' || mode === 'paused')) togglePause();
  if (e.code === 'KeyM') audio.setMuted(!audio.muted);
  if (e.code === 'KeyF' && mode === 'playing') doShoot();
  if (e.code === 'Enter' && mode === 'busted') $('busted-btn').click();
  if (e.code === 'Enter' && mode === 'wasted') $('wasted-btn').click();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousedown', (e) => {
  mouseDown = true;
  if (mode === 'playing' && !inCar && e.button === 0) doShoot();
});
addEventListener('mouseup', () => { mouseDown = false; });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas && mode === 'playing') {
    camYaw -= e.movementX * 0.0026;
    camPitch = clamp(camPitch + e.movementY * 0.0021, 0.04, 1.15);
  }
});
function lockPointer() {
  try {
    const p = canvas.requestPointerLock && canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch { /* headless / unsupported */ }
}
canvas.addEventListener('click', () => { if (mode === 'playing' && document.pointerLockElement !== canvas) lockPointer(); });

function togglePause() {
  if (mode === 'playing') { mode = 'paused'; $('pause').classList.remove('hidden'); document.exitPointerLock && document.exitPointerLock(); }
  else if (mode === 'paused') { mode = 'playing'; $('pause').classList.add('hidden'); }
}

// ---------- menus ----------
function startGame(fromSave) {
  $('menu').classList.add('hidden');
  hudEl.classList.remove('hidden');
  mode = 'playing';
  audio.init();
  if (fromSave) {
    money = fromSave.money;
    collectibles.restore(fromSave.packages || []);
    if (fromSave.missionIndex >= MISSION_DEFS.length) { missions.complete = true; missions.index = 0; }
    else missions.index = fromSave.missionIndex || 0;
    if (fromSave.pos) { player.pos.set(fromSave.pos.x, 0, fromSave.pos.z); }
    showToast('Welcome back to Palmshade City');
  }
  camYaw = player.heading;
  lockPointer();
}
$('play-btn').addEventListener('click', () => startGame(null));
const existingSave = loadSave();
if (existingSave && !SHOT) $('continue-btn').classList.remove('hidden');
$('continue-btn').addEventListener('click', () => startGame(loadSave()));
$('resume-btn').addEventListener('click', togglePause);
$('restart-btn').addEventListener('click', () => location.reload());
$('busted-btn').addEventListener('click', () => {
  const fine = parseInt($('busted-screen').dataset.fine || '100', 10);
  money = Math.max(0, money - fine);
  $('busted-screen').classList.add('hidden');
  respawnPlayer();
  mode = 'playing'; saveGame();
});
$('wasted-btn').addEventListener('click', () => {
  money = Math.max(0, money - 50);
  $('wasted-screen').classList.add('hidden');
  respawnPlayer();
  player.pos.set(176, 0, -16); player.heading = Math.PI;
  mode = 'playing'; saveGame();
});

// ---------- smoke for damaged cars ----------
const smokePool = [];
function spawnSmoke(x, y, z) {
  let s = smokePool.find(o => o.ttl <= 0);
  if (!s) {
    if (smokePool.length > 90) return;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: Combat.glowTex(), color: 0x555049, transparent: true, opacity: 0, depthWrite: false }));
    scene.add(spr);
    s = { spr, ttl: 0 };
    smokePool.push(s);
  }
  s.spr.position.set(x, y, z); s.ttl = 1.15; s.max = 1.15;
  s.spr.material.opacity = 0.42; s.spr.scale.setScalar(1);
}
function updateSmoke(dt) {
  for (const s of smokePool) {
    if (s.ttl <= 0) continue;
    s.ttl -= dt;
    s.spr.position.y += dt * 2.4;
    s.spr.scale.addScalar(dt * 2.6);
    s.spr.material.opacity = Math.max(0, 0.42 * (s.ttl / s.max));
  }
}

// ---------- staged screenshot scenes ----------
const stagedCars = [];
let stagedPolice = [];
function stageCar(type, color, x, z, heading, opts = {}) {
  const c = new Car(scene, type, color, x, z, heading);
  c.speed = opts.speed || 0; c.lightsOn = !!opts.lights;
  stagedCars.push(c);
  if (opts.lights) stagedPolice.push(c);
  return c;
}
function setCam(x, y, z, tx, ty, tz) {
  camera.position.set(x, y, z); camera.lookAt(tx, ty, tz);
}
function stageShot(name) {
  $('menu').classList.add('hidden');
  hudEl.classList.remove('hidden');
  if (name === 'cover') {
    const hero = stageCar('sport', 0xe74c3c, 2.5, 26, Math.PI + 0.1, { speed: 24 });
    stageCar('interceptor', 0x15181d, 0.2, 36.5, Math.PI, { lights: true });
    stageCar('interceptor', 0x15181d, 5.8, 39.5, Math.PI - 0.05, { lights: true });
    player.group.visible = false;
    hudOverride = { wanted: 3, money: 1250, speed: 66, objective: 'Outrun the Palmshade PD!' };
    setCam(11.5, 2.6, 44.5, 1.0, 1.0, 21);
  } else if (name === 'foot') {
    player.pos.set(172.5, 0, -16); player.heading = Math.PI;
    player.group.position.copy(player.pos); player.group.rotation.y = Math.PI;
    hudOverride = { wanted: 0, money: 120, objective: 'Talk to Marisol at Café Marisol' };
    setCam(175.5, 2.4, -7.5, 171.5, 1.3, -34);
  } else if (name === 'mission') {
    ensureVan(); van.mesh.position.set(168, 0, 104); van.heading = -0.5; van.mesh.rotation.y = -0.5;
    player.pos.set(164.5, 0, 100); player.heading = 2.6;
    player.group.position.copy(player.pos); player.group.rotation.y = 2.6;
    missions.pillar.visible = true; missions.ring.visible = true;
    missions.pillar.position.set(landmarks.warehouseDoor.x, 13, landmarks.warehouseDoor.z);
    missions.ring.position.set(landmarks.warehouseDoor.x, 0.15, landmarks.warehouseDoor.z);
    showDialogue('Marisol', 'Drop the cargo at Warehouse 7 — follow the gold marker, and watch for the Boys.');
    hudOverride = { wanted: 0, money: 570, objective: 'Deliver the cargo to Warehouse 7' };
    setCam(156, 3.6, 90, 174, 1.6, 116);
  } else if (name === 'chase') {
    const hero = stageCar('sedan', 0x2e5f8a, 26, 3.2, -Math.PI / 2, { speed: 20 });
    stageCar('interceptor', 0x15181d, 35, -3.6, -Math.PI / 2, { lights: true });
    stageCar('interceptor', 0x15181d, 16.5, -4.6, -Math.PI / 2 + 0.35, { lights: true });
    stageCar('interceptor', 0x15181d, 37, 4.4, -Math.PI / 2 - 0.1, { lights: true });
    player.group.visible = false;
    hudOverride = { wanted: 5, money: 890, speed: 52, busted: 0.35, objective: 'Lose the heat!' };
    setCam(39, 3.1, 13.5, 24, 1, -1);
  } else if (name === 'beach') {
    player.pos.set(258, 0.9, 12); player.group.position.set(258, 0.9, 12); player.heading = -Math.PI / 2;
    player.group.rotation.y = -Math.PI / 2;
    hudOverride = { wanted: 0, money: 1640, objective: 'Free roam — Palmshade is yours' };
    setCam(266, 4.6, 36, 150, 4, -30);
  }
}
if (SHOT) {
  stageShot(SHOT);
  const foci = { cover: [2, 26], foot: [172, -30], mission: [170, 108], chase: [26, 0], beach: [235, 10] };
  const f = foci[SHOT] || [0, 0];
  sunLight.position.set(f[0] - 70, 85, f[1] - 30);
  sunLight.target.position.set(f[0], 0, f[1]);
}

// ---------- HUD update ----------
const starsEl = $('stars');
function updateHUD() {
  const wanted = hudOverride ? hudOverride.wanted : police.wanted;
  if (wanted !== lastWantedShown) {
    lastWantedShown = wanted;
    starsEl.innerHTML = [1, 2, 3, 4, 5].map(i => `<span class="${i <= wanted ? 'on' : ''}">★</span>`).join('');
  }
  $('money').textContent = `$${hudOverride ? hudOverride.money : money}`;
  const taken = collectibles.takenIds().length;
  $('packages').textContent = `📦 ${taken} / 10 packages`;
  $('health-fill').style.width = `${clamp(player.health, 0, 100)}%`;
  if (inCar) {
    $('car-row').classList.remove('hidden');
    $('car-fill').style.width = `${clamp(inCar.health, 0, 100)}%`;
    $('speedo').classList.remove('hidden');
    $('speedo').querySelector('.num').textContent = Math.round(Math.abs(inCar.speed) * 2.237);
    $('crosshair').classList.add('hidden');
  } else {
    $('car-row').classList.add('hidden');
    if (hudOverride && hudOverride.speed) {
      $('speedo').classList.remove('hidden');
      $('speedo').querySelector('.num').textContent = hudOverride.speed;
    } else $('speedo').classList.add('hidden');
    $('crosshair').classList.toggle('hidden', mode !== 'playing');
  }
  const obj = hudOverride ? hudOverride.objective : missions.objectiveText();
  if (obj && $('objective').textContent !== obj) $('objective').textContent = obj;
  const meter = hudOverride && hudOverride.busted !== undefined ? hudOverride.busted : police.bustedMeter;
  $('busted-wrap').classList.toggle('hidden', !(meter > 0.02 && (mode === 'playing' || mode === 'shot')));
  $('busted-fill').style.width = `${Math.round(meter * 100)}%`;
  // dialogue queue
  const now = performance.now();
  const dlg = $('dialogue');
  if (now > dialogueUntil && dialogueQueue.length) {
    const d = dialogueQueue.shift();
    dlg.querySelector('.who').textContent = d.who;
    dlg.querySelector('.line').textContent = d.line;
    dlg.style.opacity = 1;
    dialogueUntil = now + 3400;
  } else if (now > dialogueUntil) dlg.style.opacity = 0;
  if (now > bannerUntil) $('mission-banner').style.opacity = 0;
  if (now > toastUntil) $('toast').style.opacity = 0;
  // context prompt
  const prompt = $('prompt');
  if (mode === 'playing') {
    let html = '';
    if (inCar) html = '<b>E</b> Exit vehicle';
    else if (dist2d(player.x, player.z, landmarks.marisol.x, landmarks.marisol.z) < 3.4 && !missions.active) html = '<b>E</b> Talk to Marisol';
    else {
      const c = nearestCar(player.x, player.z, 3.6);
      if (c) html = c.owned ? '<b>E</b> Enter vehicle' : '<b>E</b> Steal vehicle';
    }
    if (html) { prompt.innerHTML = html; prompt.classList.remove('hidden'); }
    else prompt.classList.add('hidden');
  } else prompt.classList.add('hidden');
}

// ---------- per-frame update ----------
const clock = new THREE.Clock();
let frames = 0;
function focusPos() {
  if (inCar) return { x: inCar.x, z: inCar.z, y: 0 };
  return { x: player.x, z: player.z, y: player.y };
}

function update(dt) {
  elapsed += dt;
  const t = elapsed;
  city.update(dt, t);
  collectibles.update(t);
  combat.update(dt);
  updateSmoke(dt);
  if (dangerTtl > 0) { dangerTtl -= dt; if (dangerTtl <= 0) danger = null; }

  if (mode === 'menu') {
    const a = t * 0.05;
    camera.position.set(178 + Math.cos(a) * 30, 8.5, -48 + Math.sin(a) * 30);
    camera.lookAt(188, 2.5, -48);
    sunLight.position.set(178 - 70, 85, -48 - 30);
    sunLight.target.position.set(178, 0, -48);
    // idle world life
    traffic.update(dt, t, { focus: { x: 170, z: -40 }, allCars: allCars(), playerOnFoot: false, rng });
    peds.update(dt, { rng, danger: null, platforms });
    return;
  }
  if (mode === 'shot') {
    for (const c of stagedPolice) {
      const lm = c.mesh.userData.lightMats;
      if (lm) {
        const on = Math.sin(t * 11) > 0;
        lm.redMat.emissiveIntensity = on ? 3.4 : 0.25;
        lm.blueMat.emissiveIntensity = on ? 0.25 : 3.4;
      }
    }
    if (SHOT === 'mission') { missions.pillar.visible = true; missions.ring.visible = true; }
    const fp = stagedCars.length
      ? { x: stagedCars[0].x, z: stagedCars[0].z, heading: stagedCars[0].heading }
      : { x: player.x, z: player.z, heading: player.heading };
    minimap.draw({
      player: fp, traffic: traffic.cars, police: stagedPolice, peds: peds.list,
      marker: SHOT === 'mission' ? landmarks.warehouseDoor : missions.markerPos(),
      packages: collectibles.remaining().map(p => ({ x: p.x, z: p.z })),
    });
    sunLight.position.set(fp.x - 70, 85, fp.z - 30);
    sunLight.target.position.set(fp.x, 0, fp.z);
    return;
  }
  if (mode !== 'playing') return;

  // --- player / car control ---
  const focus = focusPos();
  if (inCar) {
    const throttle = (keys.KeyW || keys.ArrowUp ? 1 : 0) + (keys.KeyS || keys.ArrowDown ? -1 : 0);
    const steer = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    const brake = !!keys.Space;
    const impact = inCar.update(dt, { throttle, steer, brake }, colliders, t);
    if (impact > 11) {
      audio.crash();
      player.health -= (impact - 11) * 0.5;
      // hitting another car at speed is a crime
      for (const o of allCars()) {
        if (o !== inCar && dist2d(inCar.x, inCar.z, o.x, o.z) < 4.4) { reportCrime('carHit', inCar.x, inCar.z); break; }
      }
    }
    if (Math.abs(inCar.speed) > 15) danger = { x: inCar.x, z: inCar.z, r: 9 };
    else if (!dangerTtl) danger = null;
    if (inCar.dead) { showToast('Your ride is wrecked!'); exitCar(); }
  } else {
    const fwd = { x: Math.sin(camYaw), z: Math.cos(camYaw) };
    const right = { x: -Math.cos(camYaw), z: Math.sin(camYaw) };
    const mv = { x: 0, z: 0 };
    const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    mv.x = fwd.x * f + right.x * r; mv.z = fwd.z * f + right.z * r;
    const len = Math.hypot(mv.x, mv.z);
    if (len > 0) { mv.x /= len; mv.z /= len; }
    player.update(dt, mv, !!(keys.ShiftLeft || keys.ShiftRight), platforms, colliders);
    // package pickup
    const got = collectibles.tryCollect(player.x, player.y, player.z);
    if (got) {
      money += 150; audio.pickup();
      showToast(`Hidden package found! +$150 (${collectibles.takenIds().length}/10)`);
      saveDirty = true;
    }
    if (player.health < 100) player.health = Math.min(100, player.health + dt * 1.1);
  }

  // --- world systems ---
  missions.update(dt);
  traffic.update(dt, t, { focus, allCars: allCars(), playerOnFoot: !inCar, rng });
  peds.update(dt, { rng, danger, platforms });
  const nearestPolice = police.update(dt, t, {
    playerPos: focus, playerSpeed: inCar ? inCar.speed : player.speedNow,
    onFoot: !inCar, playerHeading: inCar ? inCar.heading : player.heading,
    playerCar: inCar, rng, onRam: () => audio.crash(),
  });

  // car vs car soft collisions
  const cars = allCars();
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    const dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.01 && d < 3.1) {
      const push = (3.1 - d) / 2, nx = dx / d, nz = dz / d;
      if (!a.parked && a !== inCar) { a.mesh.position.x -= nx * push; a.mesh.position.z -= nz * push; }
      if (!b.parked && b !== inCar) { b.mesh.position.x += nx * push; b.mesh.position.z += nz * push; }
      if (a === inCar || b === inCar) {
        const other = a === inCar ? b : a;
        const rel = Math.abs(inCar.speed);
        if (rel > 8) { other.health -= (rel - 8) * 0.7; if (other.health <= 0) other.dead = true; }
      }
    }
  }
  // car vs ped
  for (const car of cars) {
    if (car.parked || Math.abs(car.speed) < 4) continue;
    for (const ped of peds.list) {
      if (ped.state === 'down') continue;
      if (dist2d(car.x, car.z, ped.pos.x, ped.pos.z) < 1.8) {
        peds.fall(ped);
        audio.crash();
        if (car === inCar) { reportCrime('pedHit', car.x, car.z); player.health -= 1; }
      }
    }
  }
  // thugs shoot back
  for (const ped of peds.list) {
    if (!ped.hostile || ped.state === 'down') continue;
    const d = dist2d(ped.pos.x, ped.pos.z, focus.x, focus.z);
    if (d < 30) {
      ped.heading = Math.atan2(focus.x - ped.pos.x, focus.z - ped.pos.z);
      ped.group.rotation.y = ped.heading;
      ped.shootCd -= dt;
      if (ped.shootCd <= 0) {
        ped.shootCd = rng.range(0.9, 1.7);
        incomingFire(ped.pos, 0.42, 5, 4);
      }
    }
  }
  // smoke from wrecks
  for (const car of cars) {
    if (car.health < 45 && car.health > 0 && rng.chance(dt * 9)) spawnSmoke(car.x + rng.range(-0.5, 0.5), 1.1, car.z + rng.range(-0.5, 0.5));
    else if (car.dead && rng.chance(dt * 14)) spawnSmoke(car.x, 1.2, car.z);
  }
  // wasted?
  if (player.health <= 0 && mode === 'playing') {
    mode = 'wasted';
    $('wasted-screen').classList.remove('hidden');
    document.exitPointerLock && document.exitPointerLock();
  }
  // autosave
  if (saveDirty) { saveTimer += dt; if (saveTimer > 4) { saveTimer = 0; saveGame(); } }
  // audio
  audio.update(dt, {
    inCar: !!inCar,
    speedNorm: inCar ? Math.abs(inCar.speed) / inCar.cfg.maxSpeed : 0,
    siren: police.wanted > 0 && nearestPolice < 48 ? 1 - nearestPolice / 48 : 0,
  });

  // --- camera ---
  const targetHeading = inCar ? inCar.heading : player.heading;
  if (document.pointerLockElement !== canvas) camYaw = angleLerp(camYaw, targetHeading, Math.min(1, dt * 3.2));
  const dist = inCar ? 10.5 : 6.8;
  const fx = focus.x, fz = focus.z;
  const cx = fx - Math.sin(camYaw) * Math.cos(camPitch) * dist;
  const cz = fz - Math.cos(camYaw) * Math.cos(camPitch) * dist;
  const cy = (focus.y || 0) + 1.7 + Math.sin(camPitch) * dist;
  camera.position.set(cx, Math.max(cy, (focus.y || 0) + 0.7), cz);
  camera.lookAt(fx, (focus.y || 0) + 1.8, fz);
  // shadow frustum follows the action
  sunLight.position.set(fx - 70, 85, fz - 30);
  sunLight.target.position.set(fx, 0, fz);
  // minimap
  minimap.draw({
    player: { x: fx, z: fz, heading: inCar ? inCar.heading : player.heading },
    traffic: traffic.cars, police: police.units, peds: peds.list,
    marker: missions.markerPos(), packages: collectibles.remaining().map(p => ({ x: p.x, z: p.z })),
  });
}

let timeScale = 1; // test hook: run extra fixed substeps per frame on slow renderers
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const steps = Math.max(1, Math.min(10, Math.round(timeScale)));
  for (let i = 0; i < steps; i++) update(dt);
  updateHUD();
  renderer.render(scene, camera);
  frames++;
  if (SHOT && frames === 10) window.__shotReady = true;
  if (mode !== 'shot' && frames === 8) window.__gameReady = true;
}
renderer.setAnimationLoop(loop);

// ---------- debug / test hooks ----------
window.__game = {
  version: 'palmshade-1',
  timeScale: (k) => { timeScale = k; },
  mode: () => mode,
  start: (cont) => startGame(cont ? loadSave() : null),
  state: () => ({
    money, wanted: police.wanted, missionIndex: missions.index, missionActive: !!missions.active,
    missionComplete: missions.complete, packages: collectibles.takenIds().length,
    inCar: !!inCar, health: Math.round(player.health),
    player: { x: Math.round(player.x * 10) / 10, z: Math.round(player.z * 10) / 10 },
    police: police.units.length, bustedMeter: Math.round(police.bustedMeter * 100) / 100,
    objective: missions.objectiveText(),
  }),
  teleport: (x, z) => {
    if (inCar) { inCar.mesh.position.set(x, 0, z); inCar.speed = 0; }
    else { player.pos.set(x, 0, z); player.y = 0; player.vy = 0; }
  },
  talk: () => { const ok = missions.interact(); if (ok && missions.active) showBanner(missions.active.def.title); return ok; },
  enterCar: () => inCar ? true : tryEnterNearest(),
  exitCar: () => { exitCar(); return !inCar; },
  setWanted: (n) => police.setWanted(n),
  shoot: () => doShoot(),
  hurt: (n) => { player.health -= n; },
  heal: () => { player.health = 100; },
  respawn: () => { respawnPlayer(); mode = 'playing'; },
  pause: () => { if (mode === 'playing') togglePause(); },
  resume: () => { if (mode === 'paused') togglePause(); },
  save: () => saveGame(),
  vanPos: () => van ? { x: van.x, z: van.z } : null,
  driveVanTo: (x, z) => { if (van) { van.mesh.position.set(x, 0, z); } if (inCar === van) { /* stay in */ } },
};
