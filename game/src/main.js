// Palmshade City — boot, game loop, state machine, input/camera, crimes,
// HUD wiring, shot staging and the window.__game debug surface.
import * as THREE from 'three';
import { buildCity, LANDMARKS, parkedSpots, pedLoops, SUN_DIR } from './city.js';
import { Player } from './player.js';
import { Car, CAR_COLORS, randomKind } from './vehicles.js';
import { TrafficSystem, steerToward } from './traffic.js';
import { PedSystem } from './peds.js';
import { PoliceSystem } from './police.js';
import { Combat } from './combat.js';
import { Collectibles, PACKAGE_REWARD } from './collectibles.js';
import { MissionSystem, MISSIONS } from './missions.js';
import { Minimap } from './minimap.js';
import { AudioEngine } from './audio.js';
import { loadSave, writeSave, clearSave, hasSave } from './save.js';
import { makeRng, clamp, dist2d, angleLerp, nearestRoadPoint } from './util.js';

const params = new URLSearchParams(location.search);
const SEED = parseInt(params.get('seed') || '1', 10) || 1;
const SHOT = params.get('shot');
const rng = makeRng(SEED * 7919 + 13);

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const els = {
  hud: $('hud'), stars: $('stars'), money: $('money'), health: $('healthfill'),
  carhud: $('carhud'), carfill: $('carfill'), banner: $('banner'), speaker: $('speaker'),
  dialogue: $('dialogue'), objective: $('objective'), bustedwrap: $('bustedwrap'),
  bustedfill: $('bustedfill'), prompt: $('prompt'), toast: $('toast'), speed: $('speed'),
  crosshair: $('crosshair'), packages: $('packages'), dmg: $('dmgflash'),
  menu: $('menu'), pause: $('pause'), busted: $('busted'), wasted: $('wasted'),
  bustedsub: $('bustedsub'), wastedsub: $('wastedsub'),
};

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf0b57e, 170, 660);
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1600);

const hemi = new THREE.HemisphereLight(0xbcd7f0, 0x8a6a4a, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb36b, 2.9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -105; sun.shadow.camera.right = 105;
sun.shadow.camera.top = 105; sun.shadow.camera.bottom = -105;
sun.shadow.camera.near = 20; sun.shadow.camera.far = 460;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.9;
scene.add(sun);
scene.add(sun.target);
const fill = new THREE.DirectionalLight(0x88a6cc, 0.35);
fill.position.set(120, 80, 140);
scene.add(fill);

// ---------- world ----------
const city = buildCity(scene, rng);
const colliders = city.colliders;
const platforms = city.platforms;

const player = new Player(scene, LANDMARKS.spawn.x, LANDMARKS.spawn.z, LANDMARKS.spawn.heading);
const traffic = new TrafficSystem(scene, rng, 12);
for (const c of traffic.cars) c.wasTraffic = true;
const pedSystem = new PedSystem(scene, rng, pedLoops(), 26);
const police = new PoliceSystem(scene, rng);
const combat = new Combat(scene);
const audio = new AudioEngine(!!SHOT);

const parkedCars = [];
{
  const spots = parkedSpots(rng);
  const chosen = spots.filter(() => rng() < 0.42).slice(0, 26);
  for (const s of chosen) {
    const car = new Car(scene, randomKind(rng), CAR_COLORS[(rng() * CAR_COLORS.length) | 0], s.x, s.z, s.heading);
    parkedCars.push(car);
  }
}
const missionCars = new Set();
function allCars() {
  const list = [...parkedCars, ...traffic.cars, ...police.cars, ...missionCars];
  if (player.car && !list.includes(player.car)) list.push(player.car);
  return list;
}

// ---------- game state ----------
const game = {
  state: SHOT ? 'playing' : 'menu',   // menu | playing | paused | busted | wasted
  money: 120,
  t: 0,
  lastDamageT: -99,
  shotCooldown: 0,
  shotThreat: null,
  shotThreatT: 0,
  frames: 0,
  formationSet: false,
};

let collectibles = null;
const dialogue = { queue: [], current: null, t: 0 };
function queueDialogue(lines) { for (const l of lines) dialogue.queue.push(l); }
let toastTimer = null;
function showToast(text, ms = 2600) {
  els.toast.textContent = text;
  els.toast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), ms);
}
function giveMoney(n) {
  game.money += n;
  showToast(`${n >= 0 ? '+' : '−'}$${Math.abs(n).toLocaleString('en-US')}`);
}

const missions = new MissionSystem(scene, {
  spawnCar(kind, color, x, z, heading) {
    const car = new Car(scene, kind, color, x, z, heading);
    missionCars.add(car);
    return car;
  },
  removeCar(car) {
    if (player.car === car) exitCar(true);
    scene.remove(car.group);
    missionCars.delete(car);
    const pi = parkedCars.indexOf(car);
    if (pi >= 0) parkedCars.splice(pi, 1);
  },
  say: queueDialogue,
  toast: showToast,
  setWanted: (n) => police.reportCrime('mission', n),
  clearWanted: () => police.clearWanted(),
  giveMoney: (n) => { game.money += n; audio.reward(); },
  autosave: () => saveGame(false),
});

function rebuildCollectibles(foundIds) {
  if (collectibles) {
    for (const item of collectibles.items) collectibles.sceneRemove(item);
  }
  collectibles = new Collectibles(scene, platforms, foundIds);
  collectibles.onCollect = (item) => {
    game.money += PACKAGE_REWARD;
    audio.pickup();
    showToast(`Hidden package found! +$${PACKAGE_REWARD} (${collectibles.foundCount}/${collectibles.total})`);
    saveGame(false);
  };
}
rebuildCollectibles([]);

const minimap = new Minimap($('minimap'));

// ---------- crimes & witnessing ----------
function witnessed(x, z) {
  for (const ped of pedSystem.peds) {
    if (ped.state !== 'down' && dist2d(ped.pos.x, ped.pos.z, x, z) < 27) return true;
  }
  for (const car of traffic.cars) {
    if (dist2d(car.pos.x, car.pos.z, x, z) < 32) return true;
  }
  return false;
}

// ---------- enter / exit cars ----------
function nearestEnterableCar() {
  let best = null, bd = 3.6;
  for (const car of allCars()) {
    if (car.occupiedBy === 'police') continue;
    if (car.occupiedBy === 'traffic' && Math.abs(car.speed) > 2.5) continue;
    if (car.dead) continue;
    const d = dist2d(player.pos.x, player.pos.z, car.pos.x, car.pos.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

function enterCar(car) {
  player.mode = 'car';
  player.car = car;
  car.occupiedBy = 'player';
  car.input.throttle = 0; car.input.steer = 0;
  player.setVisible(false);
  audio.door();
  if (!car.stolen) {
    car.stolen = true;
    const hot = missions.step && missions.step.hot && missions.rt.car === car;
    if (hot || witnessed(car.pos.x, car.pos.z)) police.reportCrime('theft');
  }
}

function exitCar(silent = false) {
  const car = player.car;
  if (!car) return;
  player.mode = 'foot';
  player.car = null;
  car.occupiedBy = null;
  car.input.throttle = 0; car.input.steer = 0; car.input.brake = false;
  const rx = -Math.cos(car.heading), rz = Math.sin(car.heading);
  player.teleport(car.pos.x + rx * 2.4, car.pos.z + rz * 2.4, car.heading);
  player.pos.y = 0;
  player.setVisible(true);
  if (!silent) audio.door();
}

// ---------- damage / busted / wasted ----------
function damagePlayer(amount) {
  if (game.state !== 'playing') return;
  game.lastDamageT = game.t;
  els.dmg.style.opacity = 0.9;
  setTimeout(() => { els.dmg.style.opacity = 0; }, 130);
  if (player.mode === 'car' && player.car) {
    player.car.damage(amount * 1.6);
    amount *= 0.35;
  }
  if (player.takeDamage(amount)) doWasted();
}
police.onShootPlayer = (dmg) => { audio.shot(); damagePlayer(dmg); };
police.onBusted = () => {
  if (game.state !== 'playing') return;
  const fine = Math.min(game.money, 100 + 60 * police.wanted);
  game.money -= fine;
  els.bustedsub.textContent = `Palmshade PD got you. Fine: $${fine.toLocaleString('en-US')}.`;
  game.state = 'busted';
  els.busted.classList.remove('hidden');
  audio.bustedSting();
  document.exitPointerLock?.();
};
function doWasted() {
  if (game.state !== 'playing') return;
  const fee = Math.min(game.money, 75);
  game.money -= fee;
  els.wastedsub.textContent = `St. Coral Hospital patched you up. Bill: $${fee.toLocaleString('en-US')}.`;
  game.state = 'wasted';
  els.wasted.classList.remove('hidden');
  audio.wastedSting();
  document.exitPointerLock?.();
}
function respawnAt(x, z) {
  if (player.mode === 'car') exitCar(true);
  police.clearWanted();
  player.health = 100;
  player.teleport(x, z, 0);
  game.state = 'playing';
  els.busted.classList.add('hidden');
  els.wasted.classList.add('hidden');
}

// ---------- save / load ----------
function saveGame(manual) {
  writeSave({
    money: game.money,
    missionIndex: missions.active ? missions.activeIndex : missions.index,
    completedAll: missions.completedAll,
    packages: collectibles.foundIds(),
    pos: { x: Math.round(player.pos.x), z: Math.round(player.pos.z) },
  });
  if (manual) showToast('Game saved');
}
function startGame(continueSave) {
  const data = continueSave ? loadSave() : null;
  if (data) {
    game.money = data.money;
    missions.index = clamp(data.missionIndex || 0, 0, MISSIONS.length);
    missions.completedAll = !!data.completedAll;
    rebuildCollectibles(data.packages || []);
    player.teleport(data.pos?.x ?? LANDMARKS.spawn.x, data.pos?.z ?? LANDMARKS.spawn.z, LANDMARKS.spawn.heading);
  } else {
    game.money = 120;
    missions.index = 0;
    missions.completedAll = false;
    rebuildCollectibles([]);
    player.teleport(LANDMARKS.spawn.x, LANDMARKS.spawn.z, LANDMARKS.spawn.heading);
  }
  player.health = 100;
  police.clearWanted();
  game.state = 'playing';
  els.menu.classList.add('hidden');
  els.hud.classList.remove('hidden');
  audio.start();
  if (!data) queueDialogue([['Marisol', 'Morning, driver. Come see me at Café Marisol — east side, by the beach. I have work for you.']]);
}

// ---------- input ----------
const keys = new Set();
let pointerLocked = false;
let camYaw = LANDMARKS.spawn.heading;
let camPitch = 0.34;
let camYawOffset = 0;
let camPitchOffset = 0;
let mouseDown = false;

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
  if (game.state === 'playing') {
    if (e.code === 'KeyE') {
      if (player.mode === 'foot') { const c = nearestEnterableCar(); if (c) enterCar(c); }
      else if (Math.abs(player.car.speed) < 2) exitCar();
    }
    if (e.code === 'KeyF' && player.mode === 'foot' && missions.canTalk(player.pos)) missions.startNext();
    if (e.code === 'KeyP') openPause();
  } else if (game.state === 'paused' && (e.code === 'KeyP' || e.code === 'Escape')) {
    closePause();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

renderer.domElement.addEventListener('mousedown', (e) => {
  if (game.state !== 'playing' || e.button !== 0) return;
  audio.start();
  if (!pointerLocked && !SHOT) {
    renderer.domElement.requestPointerLock?.();
    return;
  }
  mouseDown = true;
  tryShoot();
});
window.addEventListener('mouseup', () => { mouseDown = false; });
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  if (!pointerLocked && game.state === 'playing' && !SHOT && game.frames > 10) openPause();
});
window.addEventListener('mousemove', (e) => {
  if (!pointerLocked || game.state !== 'playing') return;
  camYawOffset += e.movementX * 0.0031;
  camPitchOffset = clamp(camPitchOffset + e.movementY * 0.0024, -0.22, 0.55);
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function openPause() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  els.pause.classList.remove('hidden');
  document.exitPointerLock?.();
}
function closePause() {
  game.state = 'playing';
  els.pause.classList.add('hidden');
}
$('btn-resume').addEventListener('click', closePause);
$('btn-save').addEventListener('click', () => saveGame(true));
$('btn-restart').addEventListener('click', () => location.reload());
$('btn-play').addEventListener('click', () => { clearSave(); startGame(false); });
$('btn-continue').addEventListener('click', () => startGame(true));
$('btn-busted-ok').addEventListener('click', () => respawnAt(LANDMARKS.policeStation.x, LANDMARKS.policeStation.z));
$('btn-wasted-ok').addEventListener('click', () => respawnAt(LANDMARKS.hospital.x, LANDMARKS.hospital.z));
if (hasSave()) $('btn-continue').classList.remove('hidden');

// ---------- shooting ----------
function shootTargets() {
  const targets = [];
  for (const ped of pedSystem.peds) {
    targets.push({ x: ped.pos.x, y: ped.pos.y + 1.15, z: ped.pos.z, r: 0.85, kind: 'ped', ref: ped });
  }
  for (const car of allCars()) {
    targets.push({ x: car.pos.x, y: 0.85, z: car.pos.z, r: 2.15, kind: 'car', ref: car });
  }
  return targets;
}

function tryShoot() {
  if (game.state !== 'playing' || player.mode !== 'foot' || game.shotCooldown > 0) return;
  game.shotCooldown = 0.22;
  audio.start();
  audio.shot();
  const origin = camera.position.clone();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const muzzle = player.pos.clone().add(new THREE.Vector3(0, 1.45, 0));
  const hit = combat.fire(origin, dir, shootTargets(), muzzle);
  game.shotThreat = { x: player.pos.x, z: player.pos.z };
  game.shotThreatT = 1.6;
  const seen = witnessed(player.pos.x, player.pos.z);
  if (hit) {
    if (hit.kind === 'ped') {
      hit.ref.fall();
      if (seen) police.reportCrime('shotHit');
    } else if (hit.kind === 'car') {
      hit.ref.damage(9);
      if (hit.ref.occupiedBy === 'police') police.reportCrime('shotHit');
      else if (seen) police.reportCrime('shotHit');
    }
  } else if (seen) {
    police.reportCrime('shot');
  }
}

// ---------- per-frame update ----------
let crimeT = 0;
let lastWantedShown = -1;
let lastMoneyShown = null;
let lastPackagesShown = '';

function updatePlayerInput(dt) {
  if (player.mode === 'car' && player.car) {
    const car = player.car;
    car.input.throttle = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + (keys.has('KeyS') || keys.has('ArrowDown') ? -1 : 0);
    car.input.steer = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    car.input.brake = keys.has('Space');
    const impact = car.update(dt, colliders, game.t);
    if (impact > 0.22) audio.crash(impact);
    player.group.position.copy(car.pos);
    return;
  }
  // on foot: camera-relative wish direction
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  const rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
  let wx = 0, wz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) { wx += fx; wz += fz; }
  if (keys.has('KeyS') || keys.has('ArrowDown')) { wx -= fx; wz -= fz; }
  if (keys.has('KeyD') || keys.has('ArrowRight')) { wx += rx; wz += rz; }
  if (keys.has('KeyA') || keys.has('ArrowLeft')) { wx -= rx; wz -= rz; }
  player.update(dt, wx, wz, keys.has('ShiftLeft') || keys.has('ShiftRight'), colliders, platforms);
}

function updateCarCarCollisions() {
  const cars = allCars();
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      const minD = 3.1;
      if (d === 0 || d >= minD) continue;
      const push = (minD - d) / 2;
      const nx = dx / d, nz = dz / d;
      a.pos.x -= nx * push; a.pos.z -= nz * push;
      b.pos.x += nx * push; b.pos.z += nz * push;
      const avx = a.forwardX() * a.speed, avz = a.forwardZ() * a.speed;
      const bvx = b.forwardX() * b.speed, bvz = b.forwardZ() * b.speed;
      const closing = (avx - bvx) * nx + (avz - bvz) * nz;
      if (closing > 4.5) {
        a.damage(closing * 0.55);
        b.damage(closing * 0.55);
        if (a === player.car || b === player.car) {
          audio.crash(clamp(closing / 12, 0.3, 1));
          const other = a === player.car ? b : a;
          if (Math.abs(player.car.speed) > Math.abs(other.speed) + 2 && crimeT <= 0) {
            crimeT = 1.6;
            if (witnessed(player.pos.x, player.pos.z)) police.reportCrime('hitCar');
          }
        }
        a.speed *= 0.55; b.speed *= 0.55;
      }
    }
  }
}

function updatePedHits() {
  for (const car of allCars()) {
    if (Math.abs(car.speed) < 4.5) continue;
    for (const ped of pedSystem.peds) {
      if (ped.state === 'down') continue;
      if (dist2d(ped.pos.x, ped.pos.z, car.pos.x, car.pos.z) < 1.8) {
        ped.fall();
        audio.crash(0.35);
        if (car === player.car && crimeT <= 0) {
          crimeT = 1.6;
          if (witnessed(player.pos.x, player.pos.z)) police.reportCrime('hitPed');
        }
      }
    }
  }
}

function updateCamera(dt) {
  const inCar = player.mode === 'car' && player.car;
  const subject = inCar ? player.car : player;
  const subjectPos = subject.pos;
  const subjectHeading = inCar ? player.car.heading : player.heading;
  const moving = inCar ? Math.abs(player.car.speed) > 1 : player.speedNow > 0.2;
  if (moving && !SHOT) camYawOffset *= Math.exp(-1.1 * dt);
  camPitchOffset *= Math.exp(-0.7 * dt);
  const targetYaw = subjectHeading + camYawOffset;
  camYaw = angleLerp(camYaw, targetYaw, 1 - Math.exp(-5 * dt));
  camPitch = clamp(0.34 + camPitchOffset, 0.05, 1.0);
  const dist = inCar ? 11 : 7.6;
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  const horiz = dist * Math.cos(camPitch);
  const tx = subjectPos.x, ty = subjectPos.y + (inCar ? 1.8 : 1.8), tz = subjectPos.z;
  camera.position.set(tx - fx * horiz, Math.max(0.7, ty + dist * Math.sin(camPitch)), tz - fz * horiz);
  camera.lookAt(tx + fx * 3.5, ty + 0.3, tz + fz * 3.5);
  // sun + shadow frustum follow the player
  sun.position.set(subjectPos.x + SUN_DIR.x * 190, SUN_DIR.y * 190 + 40, subjectPos.z + SUN_DIR.z * 190);
  sun.target.position.set(subjectPos.x, 0, subjectPos.z);
}

function updateHUD() {
  if (police.wanted !== lastWantedShown) {
    lastWantedShown = police.wanted;
    els.stars.innerHTML = '★'.repeat(police.wanted) + `<span class="off">${'★'.repeat(5 - police.wanted)}</span>`;
  }
  const moneyStr = `$${game.money.toLocaleString('en-US')}`;
  if (moneyStr !== lastMoneyShown) { lastMoneyShown = moneyStr; els.money.textContent = moneyStr; }
  els.health.style.width = `${clamp(player.health, 0, 100)}%`;
  const inCar = player.mode === 'car' && player.car;
  els.carhud.classList.toggle('hidden', !inCar);
  if (inCar) els.carfill.style.width = `${clamp(player.car.health, 0, 100)}%`;
  els.speed.classList.toggle('hidden', !inCar);
  if (inCar) els.speed.innerHTML = `${Math.round(Math.abs(player.car.speed) * 2.2)}<small>MPH</small>`;
  els.crosshair.classList.toggle('hidden', player.mode !== 'foot');
  const pkgStr = `Packages ${collectibles.foundCount}/${collectibles.total}`;
  if (pkgStr !== lastPackagesShown) { lastPackagesShown = pkgStr; els.packages.textContent = pkgStr; }
  // objective line
  let obj = '';
  if (missions.active) obj = missions.objectiveText();
  else if (!missions.completedAll) obj = 'Talk to Marisol at Café Marisol';
  els.objective.textContent = obj;
  els.objective.classList.toggle('hidden', !obj);
  // busted meter
  const bm = police.bustedMeter;
  els.bustedwrap.classList.toggle('hidden', bm <= 0.01);
  els.bustedfill.style.width = `${bm * 100}%`;
  // contextual prompt
  let prompt = '';
  if (player.mode === 'foot' && missions.canTalk(player.pos)) prompt = '<b>F</b> Talk to Marisol';
  else if (player.mode === 'foot' && nearestEnterableCar()) prompt = '<b>E</b> Enter vehicle';
  else if (inCar && Math.abs(player.car.speed) < 2) prompt = '<b>E</b> Exit vehicle';
  els.prompt.innerHTML = prompt;
  els.prompt.classList.toggle('hidden', !prompt);
}

function updateDialogue(dt) {
  if (!dialogue.current) {
    if (dialogue.queue.length) {
      dialogue.current = dialogue.queue.shift();
      dialogue.t = 4.4;
      els.speaker.textContent = dialogue.current[0];
      els.dialogue.textContent = dialogue.current[1];
      els.banner.classList.remove('hidden');
    } else {
      els.banner.classList.add('hidden');
    }
    return;
  }
  dialogue.t -= dt;
  if (dialogue.t <= 0) dialogue.current = null;
}

function update(dt) {
  game.t += dt;
  game.frames++;
  crimeT -= dt;
  game.shotCooldown -= dt;
  if (mouseDown) tryShoot();

  updatePlayerInput(dt);

  // traffic + police (they step their own cars)
  const carsSnapshot = allCars();
  traffic.update(dt, { playerPos: player.pos, allCars: carsSnapshot, colliders, peds: pedSystem.peds, t: game.t });
  const policeInfo = police.update(dt, { player, playerCar: player.car, colliders, t: game.t });
  // parked / mission / abandoned cars still need physics
  for (const car of carsSnapshot) {
    if (car.occupiedBy === 'traffic' || car.occupiedBy === 'police' || car === player.car) continue;
    car.update(dt, colliders, game.t);
  }
  updateCarCarCollisions();
  updatePedHits();

  // pedestrian threats: fast cars + recent gunfire
  const threats = [];
  if (player.mode === 'car' && player.car && Math.abs(player.car.speed) > 7) threats.push({ x: player.car.pos.x, z: player.car.pos.z });
  for (const c of police.cars) if (Math.abs(c.speed) > 7) threats.push({ x: c.pos.x, z: c.pos.z });
  if (game.shotThreatT > 0) { game.shotThreatT -= dt; if (game.shotThreat) threats.push(game.shotThreat); }
  pedSystem.update(dt, threats);

  missions.update(dt, { player, wanted: police.wanted, t: game.t });
  collectibles.update(dt, game.t, player);
  combat.update(dt);
  city.update(dt, game.t);

  // health regen after a quiet spell
  if (game.t - game.lastDamageT > 6 && player.health > 0) {
    player.health = Math.min(100, player.health + 2.4 * dt);
  }
  // audio beds
  audio.setEngine(player.mode === 'car', player.car ? player.car.speedRatio : 0);
  audio.setSiren(police.cars.length && policeInfo.nearest < 85 ? clamp(1.15 - policeInfo.nearest / 85, 0.1, 1) : 0);

  // shot-mode auto-drive + chase formation pinning
  if (SHOT && game.autoDriveCar) {
    const car = game.autoDriveCar;
    if (player.car === car) {
      const ahead = { x: car.pos.x + car.forwardX() * 26, z: car.pos.z + car.forwardZ() * 26 };
      const np = nearestRoadPoint(ahead.x, ahead.z);
      const tx = Math.abs(np.x - ahead.x) < Math.abs(np.z - ahead.z) ? np.x : ahead.x;
      const tz = Math.abs(np.x - ahead.x) < Math.abs(np.z - ahead.z) ? ahead.z : np.z;
      steerToward(car, tx, tz, 0.72, 0, dt);
    }
  }
  if (SHOT === 'chase' && game.frames < 400) police.bustedMeter = Math.max(police.bustedMeter, 0.55);
  if (SHOT && game.frames > (game.shotReadyFrame || 55) && !window.__shotReady) window.__shotReady = true;

  updateDialogue(dt);
  updateCamera(dt);
  minimap.draw({
    player, playerCar: player.car, trafficCars: traffic.cars, policeCars: police.cars,
    marker: missions.markerTarget(), packages: collectibles.remainingPositions(), t: game.t,
  });
  updateHUD();
}

function menuUpdate(dt) {
  game.t += dt;
  traffic.update(dt, { playerPos: { x: 90, z: -20 }, allCars: allCars(), colliders, peds: pedSystem.peds, t: game.t });
  pedSystem.update(dt, []);
  city.update(dt, game.t);
  // slow cinematic orbit over the café & beachfront
  const cx = 60, cz = -10, r = 95;
  const a = game.t * 0.045;
  camera.position.set(cx + Math.sin(a) * r, 26 + Math.sin(game.t * 0.11) * 5, cz + Math.cos(a) * r);
  camera.lookAt(40, 4, -10);
  sun.position.set(cx + SUN_DIR.x * 190, SUN_DIR.y * 190 + 40, cz + SUN_DIR.z * 190);
  sun.target.position.set(cx, 0, cz);
}

// ---------- shot staging ----------
function stageShot(name) {
  els.menu.classList.add('hidden');
  els.hud.classList.remove('hidden');
  const spawnIn = (car, speed) => {
    car.stolen = true;
    parkedCars.push(car);
    enterCar(car);
    car.speed = speed;
    return car;
  };
  if (name === 'cover') {
    const car = new Car(scene, 'sport', 0xd94f3d, -28, 55, Math.PI);
    game.autoDriveCar = spawnIn(car, 18);
    police.reportCrime('mission', 3);
    game.coverFormation = true;
    game.shotReadyFrame = 16;
    camYaw = Math.PI;
    camYawOffset = 0.55; // three-quarter rear camera so the pursuit reads in frame
  } else if (name === 'foot') {
    missions.startMission(0);
    player.teleport(99, 4, Math.atan2(107 - 99, -14 - 4));
    camYaw = player.heading;
  } else if (name === 'mission') {
    missions.startMission(0);
    const van = missions.rt.car;
    van.pos.set(-28, 0, 66);
    van.heading = Math.atan2(-133 - -28, 130 - 66);
    van.syncTransform();
    van.stolen = true;
    parkedCars.push(van);
    missionCars.delete(van);
    enterCar(van);
    van.speed = 12;
    camYaw = van.heading;
  } else if (name === 'chase') {
    const car = new Car(scene, 'sedan', 0x3f7fbf, -98, 8, 0);
    spawnIn(car, 6);
    police.reportCrime('mission', 5);
    game.chaseFormation = true;
    camYaw = 0;
  } else if (name === 'beach') {
    player.teleport(218, 32, Math.atan2(84 - 218, -35 - 32));
    camYaw = player.heading;
  }
  game.state = 'playing';
}

// shot formations: once the pursuit units exist, drop them into frame
function applyChaseFormation() {
  if (game.formationSet) return;
  if (game.coverFormation && player.car && police.cars.length >= 2) {
    const car = player.car;
    const fx = car.forwardX(), fz = car.forwardZ();
    const rx = -Math.cos(car.heading), rz = Math.sin(car.heading);
    const spots = [
      { back: 7, side: 4.5 }, { back: 13, side: -3.5 },
    ];
    police.cars.slice(0, 2).forEach((pc, i) => {
      pc.pos.set(car.pos.x - fx * spots[i].back + rx * spots[i].side, 0, car.pos.z - fz * spots[i].back + rz * spots[i].side);
      pc.heading = car.heading;
      pc.speed = 17;
      pc.syncTransform();
    });
    game.formationSet = true;
    return;
  }
  if (!game.chaseFormation) return;
  if (police.cars.length < 4) return;
  const spots = [
    { x: -98, z: -14, h: Math.PI }, { x: -89, z: -19, h: Math.PI * 0.85 },
    { x: -98, z: 22, h: 0 }, { x: -106, z: 26, h: 0 },
  ];
  police.cars.slice(0, 4).forEach((car, i) => {
    car.pos.set(spots[i].x, 0, spots[i].z);
    car.heading = spots[i].h;
    car.speed = 5;
    car.syncTransform();
  });
  game.formationSet = true;
}

// ---------- debug surface ----------
window.__game = {
  get state() { return game.state; },
  get money() { return game.money; },
  player, police, missions, traffic, pedSystem, collectibles: () => collectibles,
  get playerCar() { return player.car; },
  allCars,
  giveMoney(n) { game.money += n; },
  setMoney(n) { game.money = n; },
  teleport(x, z) { if (player.mode === 'car') exitCar(true); player.teleport(x, z); },
  setWanted(n) { police.clearWanted(); if (n > 0) police.reportCrime('debug', n); },
  startMission(i) { missions.startMission(i); },
  talk() { if (missions.canTalk(player.pos)) missions.startNext(); },
  enterNearest() { const c = nearestEnterableCar(); if (c) enterCar(c); return !!c; },
  exitCar() { exitCar(); },
  shoot() { tryShoot(); },
  damage(n) { damagePlayer(n); },
  save() { saveGame(false); },
  startGame,
  stageShot,
};

// ---------- boot ----------
if (SHOT) {
  stageShot(SHOT);
} else {
  els.hud.classList.add('hidden');
}

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (game.state === 'playing') {
    applyChaseFormation();
    update(dt);
  } else if (game.state === 'menu') {
    menuUpdate(dt);
  }
  renderer.render(scene, camera);
}
loop();
window.__gameReady = true;
