// main.js — Palmshade City's conductor: renderer, state machine, input and
// mouse-orbit camera, crime witnessing, car interactions, HUD wiring, save
// integration, ?shot= screenshot staging and the window.__game debug hooks.

import * as THREE from 'three';
import { buildCity } from './city.js';
import { Player } from './player.js';
import { Car } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Peds } from './peds.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Collectibles, PACKAGE_REWARD } from './collectibles.js';
import { Missions, MISSIONS } from './missions.js';
import { Minimap } from './minimap.js';
import { AudioSys } from './audio.js';
import { loadSave, storeSave, hasSave } from './save.js';
import { mulberry32, clamp, angleLerp, pick } from './util.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = parseInt(params.get('seed') || '1', 10) || 1;
const $ = (id) => document.getElementById(id);

// ---------------- renderer / scene / camera ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.domElement.className = 'webgl';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1400);
camera.position.set(24, 10, 132);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------- world ----------------
const rng = mulberry32(SEED * 331 + 7);
const city = buildCity(scene, SEED);
const player = new Player(scene);
const peds = new Peds(scene, rng, 26);
const traffic = new Traffic(scene, rng, 11);
const police = new Police(scene);
const audio = new AudioSys();
if (SHOT) audio.setMuted(true);

// parked cars along the streets + the two mission vans
const parkedCars = [];
{
  const spots = [
    [-56, 92, 'sedan'], [72, 108, 'convertible'], [-96, -13, 'pickup'], [36, -27, 'sedan'],
    [-143, 33, 'van'], [97, 47, 'sedan'], [-23, -87, 'sport'], [143, -33, 'pickup'],
    [56, 88, 'sedan'], [-60, -148, 'sedan'], [116, 33, 'convertible'], [-116, 92, 'van'],
    [24, -148, 'pickup'], [160, -13, 'sedan'], [-170, 47, 'sedan'], [83, -148, 'van'],
  ];
  const cols = {
    sedan: [0xc0c6cc, 0x3f6fb5, 0x8a2f35], sport: [0xff8c1a], convertible: [0x06d6a0, 0xef476f],
    pickup: [0xb5651d, 0x5d7d99], van: [0xf2f2f2, 0x8896a3],
  };
  for (const [x, z, type] of spots) {
    const c = new Car(scene, type, pick(rng, cols[type] || [0xc0c6cc]), x, z, rng() < 0.5 ? 0 : Math.PI);
    c.parked = true;
    parkedCars.push(c);
  }
}
const missionVan = new Car(scene, 'van', 0x17a398, 14, 84, Math.PI);
missionVan.parked = true;
parkedCars.push(missionVan);
const garageVan = new Car(scene, 'van', 0xf2a65a, 56, -105, Math.PI / 2);
garageVan.parked = true;
parkedCars.push(garageVan);

// ---------------- game context ----------------
const G = {
  scene, camera, city, player, peds, traffic, police, audio,
  state: 'menu',
  money: 120,
  missionTarget: null,
  missionVan,
  objectiveText: '',
  time: 0,
};
G.collectibles = new Collectibles(scene, []);
G.missions = new Missions(scene, G);
G.combat = new Combat(scene, G);
const minimap = new Minimap($('minimap'));
police.onShootAtPlayer = (car) => G.combat.policeShot(car);

G.witnessed = (x, z, r = 30) => {
  for (const p of peds.list) if (p.state !== 'down' && Math.hypot(p.pos.x - x, p.pos.z - z) < r) return true;
  for (const u of police.units) if (Math.hypot(u.car.x - x, u.car.z - z) < 80) return true;
  for (const c of traffic.cars) if (Math.hypot(c.x - x, c.z - z) < 24) return true;
  return false;
};
G.reportCrime = (kind, x, z, force = false) => {
  if (kind === 'gunfire' || kind === 'hitPed') peds.scare(x, z, 14);
  police.reportCrime(kind, force || G.witnessed(x, z));
};
G.addMoney = (n, jingle = false) => {
  G.money += n;
  if (jingle) audio.reward();
  updateHUD();
};
G.damagePlayer = (n) => {
  if (G.state !== 'playing' || player.dead) return;
  if (player.inVehicle) {
    player.inVehicle.damage(n * 1.4);
    if (player.inVehicle.health <= 25) player.health -= n * 0.25;
  } else {
    player.health -= n;
  }
  if (player.health <= 0) { player.health = 0; onWasted(); }
};
G.onPackage = () => {
  G.addMoney(PACKAGE_REWARD);
  audio.pickup();
  showBanner('PACKAGE FOUND', G.collectibles.count + ' / ' + G.collectibles.total + '  ·  +$' + PACKAGE_REWARD);
  G.saveGame();
};
G.saveGame = () => {
  storeSave({
    money: G.money,
    missionIndex: G.missions.index,
    doneAll: G.missions.doneAll,
    packages: [...G.collectibles.found],
    pos: [Math.round(player.x * 10) / 10, Math.round(player.z * 10) / 10],
  });
};

// ---------------- HUD ----------------
const dialogueQueue = [];
let dialogueTimer = 0, bannerTimer = 0;
G.showDialogue = (who, line) => { dialogueQueue.push({ who, line }); };
G.setObjective = (text) => {
  G.objectiveText = text;
  const el = $('objective');
  el.textContent = text;
  el.style.display = text ? 'block' : 'none';
};
function showBanner(big, small) {
  const b = $('banner');
  b.querySelector('.big').textContent = big;
  b.querySelector('.small').textContent = small || '';
  b.style.display = 'block';
  bannerTimer = 2.6;
}
G.showBanner = showBanner;
function setPrompt(html) {
  const el = $('prompt');
  if (!html) { el.style.display = 'none'; return; }
  el.innerHTML = html;
  el.style.display = 'block';
}
function updateHUD() {
  const stars = $('stars').children;
  for (let i = 0; i < 5; i++) stars[i].className = i < police.wanted ? 'on' : 'off';
  $('money').textContent = '$' + G.money;
  $('packages').textContent = '📦 ' + G.collectibles.count + ' / ' + G.collectibles.total + ' packages';
  $('healthfill').style.width = clamp(player.health, 0, 100) + '%';
  const inCar = !!player.inVehicle;
  $('carbar').style.display = inCar ? 'block' : 'none';
  $('speedo').style.display = inCar ? 'block' : 'none';
  if (inCar) {
    $('carfill').style.width = clamp(player.inVehicle.health, 0, 100) + '%';
    $('speedo').querySelector('.num').textContent = Math.round(Math.abs(player.inVehicle.speed) * 2.24);
  }
  $('bustedwrap').style.display = police.bustedMeter > 0.02 && G.state === 'playing' ? 'block' : 'none';
  $('bustedfill').style.width = (police.bustedMeter * 100) + '%';
  $('crosshair').style.display = !inCar && G.state === 'playing' ? 'block' : 'none';
}

// ---------------- state flow ----------------
let started = false;
function showOverlay(id) {
  for (const o of ['menu', 'pause', 'busted', 'wasted']) $(o).style.display = o === id ? 'flex' : 'none';
  $('hud').style.display = id ? 'none' : 'block';
}
function startGame(fromSave) {
  started = true;
  if (fromSave) {
    const s = loadSave();
    if (s) {
      G.money = s.money;
      G.missions.index = s.missionIndex || 0;
      G.missions.doneAll = !!s.doneAll;
      for (const id of s.packages || []) {
        G.collectibles.found.add(id);
        const it = G.collectibles.items[id];
        if (it) it.grp.visible = false;
      }
      if (s.pos) player.placeAt(s.pos[0], s.pos[1], Math.PI);
    }
  } else {
    player.placeAt(0, 92, 0); // face south: Café Marisol, its gold pillar and the sea
    camYaw = 0;
  }
  player.health = 100;
  player.dead = false;
  G.state = 'playing';
  showOverlay(null);
  updateHUD();
  if (!fromSave) showBanner('PALMSHADE CITY', 'Talk to Marisol at Café Marisol — follow the gold pillar');
}
function respawnAtStation() {
  exitVehicle(true);
  police.clear();
  player.health = 100;
  player.dead = false;
  player.group.visible = true;
  player.placeAt(city.landmarks.pdRespawn.x, city.landmarks.pdRespawn.z, Math.PI);
  camYaw = Math.PI;
}
function onBusted() {
  if (G.state !== 'playing') return;
  G.state = 'busted';
  const fine = Math.min(G.money, 120 + police.wanted * 40);
  G.money -= fine;
  $('busted-fine').textContent = 'The Palmshade PD fined you $' + fine + ' and sent you back to the station.';
  audio.bustedJingle();
  if (document.exitPointerLock) document.exitPointerLock();
  showOverlay('busted');
  updateHUD();
}
G.onBusted = onBusted;
function onWasted() {
  if (G.state !== 'playing') return;
  player.dead = true;
  G.state = 'wasted';
  const fine = Math.min(G.money, 100);
  G.money -= fine;
  $('wasted-fine').textContent = 'You woke up outside the police station, $' + fine + ' lighter.';
  if (document.exitPointerLock) document.exitPointerLock();
  showOverlay('wasted');
  updateHUD();
}
function pauseGame() {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  if (document.exitPointerLock) document.exitPointerLock();
  showOverlay('pause');
}
function resumeGame() {
  if (G.state !== 'paused') return;
  G.state = 'playing';
  showOverlay(null);
}

$('btn-play').onclick = () => { audio.start(); audio.click(); startGame(false); };
$('btn-continue').onclick = () => { audio.start(); audio.click(); startGame(true); };
$('btn-resume').onclick = () => { audio.click(); resumeGame(); };
$('btn-save').onclick = () => { audio.click(); G.saveGame(); showBanner('SAVED', 'Progress stored in this browser'); resumeGame(); };
$('btn-tomenu').onclick = () => { audio.click(); G.state = 'menu'; showOverlay('menu'); refreshContinue(); };
$('btn-busted-ok').onclick = () => { audio.click(); respawnAtStation(); G.state = 'playing'; showOverlay(null); updateHUD(); };
$('btn-wasted-ok').onclick = () => { audio.click(); respawnAtStation(); G.state = 'playing'; showOverlay(null); updateHUD(); };
function refreshContinue() { $('btn-continue').style.display = hasSave() ? 'block' : 'none'; }
refreshContinue();

// ---------------- input ----------------
const input = { f: false, b: false, l: false, r: false, sprint: false, handbrake: false };
const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'handbrake' };
let camYaw = Math.PI, camPitch = 0.34, mouseIdle = 0;
addEventListener('keydown', (e) => {
  audio.start();
  const k = KEYMAP[e.code];
  if (k) { input[k] = true; if (e.code === 'Space') e.preventDefault(); }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (G.state === 'playing') pauseGame();
    else if (G.state === 'paused') resumeGame();
  }
  if (e.code === 'KeyE' && G.state === 'playing') interact();
});
addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) input[k] = false; });
renderer.domElement.addEventListener('click', () => {
  audio.start();
  if (G.state === 'playing' && !SHOT) renderer.domElement.requestPointerLock();
});
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === renderer.domElement) {
    camYaw -= e.movementX * 0.0031;
    camPitch = clamp(camPitch + e.movementY * 0.0028, -0.06, 1.15);
    mouseIdle = 0;
  }
});
addEventListener('mousedown', () => {
  audio.start();
  if (G.state === 'playing' && !player.inVehicle && (document.pointerLockElement === renderer.domElement || SHOT)) {
    G.combat.shoot();
  }
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && G.state === 'playing' && !SHOT && started) pauseGame();
});

// ---------------- interactions ----------------
function allEnterableCars() {
  return [...parkedCars, ...traffic.cars];
}
function nearestCar(maxD = 3.6) {
  let best = null, bd = maxD;
  for (const c of allEnterableCars()) {
    const d = Math.hypot(c.x - player.x, c.z - player.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function enterVehicle(car) {
  player.inVehicle = car;
  player.group.visible = false;
  const ti = traffic.cars.indexOf(car);
  if (ti >= 0) { traffic.cars.splice(ti, 1); parkedCars.push(car); }
  car.onCrash = (sev) => {
    audio.crash(sev);
    if (sev > 0.4) { G.damagePlayer(sev * 5); G.reportCrime('hitCar', car.x, car.z); }
    peds.scare(car.x, car.z, 12);
  };
  if (!car.stolenOnce) {
    car.stolenOnce = true;
    if (car !== missionVan) G.reportCrime('theft', car.x, car.z);
  }
  G.missions.onEnterVehicle(car);
  camYaw = car.heading;
  updateHUD();
}
function exitVehicle(silent = false) {
  const car = player.inVehicle;
  if (!car) return;
  player.inVehicle = null;
  car.onCrash = null;
  const sx = car.x + Math.cos(car.heading) * 2.1, sz = car.z - Math.sin(car.heading) * 2.1;
  const res = city.collideCircle(sx, sz, 0.38, 0);
  player.placeAt(res.x, res.z, car.heading);
  player.group.visible = true;
  if (!silent) updateHUD();
}
function interact() {
  if (player.inVehicle) { exitVehicle(); return; }
  if (G.missions.playerNearMarisol() && G.missions.tryStart()) return;
  const car = nearestCar();
  if (car) enterVehicle(car);
}

// ---------------- camera ----------------
let shotCam = null;
function updateCamera(dt) {
  if (shotCam) {
    camera.position.copy(shotCam.pos);
    camera.lookAt(shotCam.look);
    return;
  }
  if (G.state === 'menu') {
    const t = G.time * 0.05;
    camera.position.set(Math.sin(t) * 34, 10 + Math.sin(G.time * 0.13) * 2, 118 + Math.cos(t) * 10);
    camera.lookAt(0, 2, 96);
    return;
  }
  const focus = player.inVehicle ? player.inVehicle.pos : player.pos;
  const dist = player.inVehicle ? 9.5 : 6.8;
  if (player.inVehicle && mouseIdle > 1.6) {
    camYaw = angleLerp(camYaw, player.inVehicle.heading, Math.min(1, dt * 2.2));
    camPitch += (0.3 - camPitch) * Math.min(1, dt * 1.6);
  }
  const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
  const cx = focus.x - Math.sin(camYaw) * cp * dist;
  const cz = focus.z - Math.cos(camYaw) * cp * dist;
  let cy = focus.y + 1.7 + sp * dist;
  const gy = city.groundAt(cx, cz, 0);
  if (cy < gy + 0.7) cy = gy + 0.7;
  camera.position.set(cx, cy, cz);
  camera.lookAt(focus.x, focus.y + 1.6, focus.z);
}

// ---------------- per-frame world updates ----------------
function updateWorld(dt) {
  const t = G.time;
  city.update(dt, t);
  const focus = player.inVehicle ? player.inVehicle.pos : player.pos;
  city.setSunTarget(focus.x, focus.z);

  if (player.inVehicle) {
    const car = player.inVehicle;
    const control = {
      throttle: (input.f ? 1 : 0) + (input.b ? -1 : 0),
      steer: (input.l ? -1 : 0) + (input.r ? 1 : 0),
      handbrake: input.handbrake,
    };
    if (!SHOT) car.update(dt, control, city); // staged scenes hold their pose
    player.pos.set(car.x, 0, car.z);
    player.heading = car.heading;
    if (!SHOT && peds.checkCarHit(car)) { G.reportCrime('hitPed', car.x, car.z); audio.crash(0.7); }
    for (const o of [...traffic.cars, ...parkedCars, ...police.units.map(u => u.car)]) {
      if (o === car) continue;
      const d = Math.hypot(o.x - car.x, o.z - car.z);
      if (d < 2.9 && d > 0.01) {
        const rel = Math.abs(car.speed - o.speed);
        const push = (2.9 - d) / 2;
        const nx = (car.x - o.x) / d, nz = (car.z - o.z) / d;
        car.pos.x += nx * push; car.pos.z += nz * push;
        if (rel > 6) {
          o.damage(rel * 0.8); car.damage(rel * 0.5);
          audio.crash(Math.min(1, rel / 22));
          G.reportCrime('hitCar', car.x, car.z);
        }
        car.speed *= 0.55;
      }
    }
  } else {
    player.update(dt, input, city, camYaw);
  }
  for (const c of parkedCars) if (c !== player.inVehicle) c.update(dt, { throttle: 0, steer: 0 }, city);
  traffic.update(dt, G);
  for (const c of traffic.cars) if (peds.checkCarHit(c)) peds.scare(c.x, c.z, 10);
  peds.update(dt, G);
  police.update(dt, G, t);
  G.missions.update(dt);
  G.collectibles.update(dt, t, G);
  G.combat.update(dt);

  if (player.inVehicle) audio.setEngine(player.inVehicle.speed / player.inVehicle.spec.maxSpeed, true);
  else audio.setEngine(0, false);
  audio.setSiren(police.wanted > 0 && police.units.length > 0, police.nearestUnitDist(focus.x, focus.z));
  audio.update(dt);

  if (G.state === 'playing') {
    if (player.inVehicle) setPrompt('<b>E</b> Exit vehicle');
    else if (G.missions.playerNearMarisol() && !G.missions.active && !G.missions.doneAll)
      setPrompt('<b>E</b> Talk to Marisol');
    else if (nearestCar()) setPrompt('<b>E</b> Enter vehicle');
    else setPrompt(null);
  } else setPrompt(null);

  if (dialogueQueue.length && dialogueTimer <= 0) {
    const d = dialogueQueue.shift();
    $('dialogue').querySelector('.who').textContent = d.who.toUpperCase();
    $('dialogue').querySelector('.line').textContent = d.line;
    $('dialogue').style.display = 'block';
    dialogueTimer = 4.2;
  }
  if (dialogueTimer > 0) { dialogueTimer -= dt; if (dialogueTimer <= 0) $('dialogue').style.display = 'none'; }
  if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) $('banner').style.display = 'none'; }

  minimap.draw(G, t);
  updateHUD();
}

// ---------------- screenshot staging ----------------
function stageShot(name) {
  G.state = 'playing';
  started = true;
  showOverlay(null);
  traffic.frozen = true;
  police.staged = true;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  if (name === 'cover') {
    const hero = new Car(scene, 'sport', 0xd92323, 30, 16, Math.PI);
    hero.speed = 26;
    parkedCars.push(hero);
    player.inVehicle = hero;
    player.group.visible = false;
    police.setWanted(3);
    police.stageUnit(26.2, 25.5, Math.PI - 0.15);
    police.stageUnit(34.4, 27.5, Math.PI + 0.12);
    shotCam = { pos: V3(23.5, 5.2, 34.5), look: V3(30.5, 1.0, 10) };
  } else if (name === 'foot') {
    player.placeAt(6, 96, 0);
    camYaw = 0;
    const p0 = peds.list[0], p1 = peds.list[1];
    if (p0) { p0.pos.set(1.5, 0, 101); p0.heading = Math.PI; }
    if (p1) { p1.pos.set(11, 0, 103); p1.heading = Math.PI * 0.8; }
    shotCam = { pos: V3(7.5, 2.7, 86.5), look: V3(3.5, 1.5, 102) };
  } else if (name === 'mission') {
    G.missions.active = { def: MISSIONS[0], stepIdx: 1, collectGot: new Set(), timer: 0, holdT: 0 };
    G.missions.applyStepEntry();
    missionVan.pos.set(96, 0, -52);
    missionVan.heading = Math.atan2(130 - 96, -90 + 52);
    missionVan.group.rotation.y = missionVan.heading;
    missionVan.speed = 14;
    player.inVehicle = missionVan;
    player.group.visible = false;
    G.showDialogue('Marisol', 'That\'s the van — take it to the warehouse dock, and don\'t scratch it.');
    shotCam = { pos: V3(84, 4.2, -38), look: V3(104, 1.2, -64) };
  } else if (name === 'chase') {
    const hero = new Car(scene, 'sedan', 0x3f6fb5, -30, -16, Math.PI);
    hero.speed = 3;
    parkedCars.push(hero);
    player.inVehicle = hero;
    player.group.visible = false;
    police.setWanted(5);
    police.stageUnit(-36, -27, Math.PI + 0.35);
    police.stageUnit(-24, -28, Math.PI - 0.35);
    police.stageUnit(-30.5, -3.5, Math.PI);
    police.bustedMeter = 0.45;
    shotCam = { pos: V3(-42, 4.4, -31), look: V3(-28.5, 1, -16) };
  } else if (name === 'beach') {
    player.placeAt(121, 199, -0.6);
    player.pos.y = 0.5;
    camYaw = -0.6;
    shotCam = { pos: V3(127, 3.2, 186), look: V3(104, 4.2, 216) };
  }
  updateHUD();
}

// ---------------- debug hooks ----------------
window.__game = {
  G, player, police, traffic, peds,
  ready: false,
  debug: {
    state: () => ({
      state: G.state, money: G.money, wanted: police.wanted,
      bustedMeter: Math.round(police.bustedMeter * 100) / 100,
      missionIndex: G.missions.index, doneAll: G.missions.doneAll,
      activeMission: G.missions.active ? G.missions.active.def.title : null,
      activeStep: G.missions.active ? G.missions.active.stepIdx : -1,
      objective: G.objectiveText,
      packages: G.collectibles.count, health: Math.round(player.health),
      inVehicle: !!player.inVehicle,
      playerPos: [Math.round(player.x * 10) / 10, Math.round(player.z * 10) / 10],
      policeUnits: police.units.length,
      nearestPolice: Math.round(police.nearestUnitDist(player.x, player.z)),
      hasSave: hasSave(),
    }),
    play: () => startGame(false),
    continueGame: () => startGame(true),
    teleport: (x, z) => {
      if (player.inVehicle) { player.inVehicle.pos.set(x, 0, z); player.inVehicle.speed = 0; }
      else { player.placeAt(x, z, player.heading); player.pos.y = city.groundAt(x, z, 999); }
    },
    setWanted: (n) => police.setWanted(n),
    setCamYaw: (v) => { camYaw = v; },
    startMission: () => G.missions.tryStart(),
    enterNearestCar: () => { const c = nearestCar(6); if (c) { enterVehicle(c); return c.type; } return null; },
    exitCar: () => exitVehicle(),
    setBusted: (v) => { police.bustedMeter = v; },
    shoot: () => G.combat.shoot(),
    interact: () => interact(),
    pause: () => pauseGame(),
    resume: () => resumeGame(),
    save: () => G.saveGame(),
    damage: (n) => G.damagePlayer(n),
  },
};

// ---------------- boot + loop ----------------
if (SHOT) stageShot(SHOT);
else { G.state = 'menu'; showOverlay('menu'); }

const clock = new THREE.Clock();
let frames = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  G.time += dt;
  mouseIdle += dt;
  if (G.state === 'playing' || SHOT) updateWorld(dt);
  else { city.update(dt, G.time); city.setSunTarget(0, 100); }
  updateCamera(dt);
  renderer.render(scene, camera);
  frames++;
  if (frames > 40) window.__game.ready = true;
}
animate();
