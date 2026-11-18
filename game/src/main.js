// Palmshade City — main. Boots three.js, builds the city and every system (player,
// vehicles, traffic, pedestrians, police, missions, combat, audio, minimap, save),
// then runs the loop and the state machine: menu -> playing <-> paused, with busted
// and wasted as the two ways a spree ends. It also stages the deterministic
// screenshot scenes behind ?shot=cover|foot|mission|chase&seed=n.
//
// Heading convention used across the game: a heading h faces (sin h, cos h) on the
// ground plane, and a camera yaw works the same way — the camera sits at
// target - forward * distance and looks along forward.

import * as THREE from 'three';
import { setSeed, clamp, lerp, angleLerp, pick, rand, formatMoney } from './util.js';
import { buildCity, POINTS, ROAD_LINES } from './city.js';
import { createPlayer } from './player.js';
import { createCar, driveCar, steerToward, initSmoke, updateSmoke, puff } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPeds } from './peds.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';
import { createAudio } from './audio.js';
import { createMinimap } from './minimap.js';
import { loadSave, writeSave, hasSave } from './save.js';

// --------------------------------------------------------------------------- boot
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number.parseInt(params.get('seed') || '1', 10) || 1;
setSeed(SEED * 7919 + 13);

const $ = (id) => document.getElementById(id);
const hudEl = $('hud');
const menuEl = $('menu');
const pauseEl = $('pause');
const bustedEl = $('busted');
const wastedEl = $('wasted');
const starsEl = [...$('stars').children];
const moneyEl = $('money');
const healthFill = $('health-fill');
const carRow = $('car-row');
const carFill = $('car-fill');
const speedEl = $('speed');
const bustedWrap = $('busted-wrap');
const bustedFill = $('busted-fill');
const bannerEl = $('banner');
const bannerTitle = $('banner-title');
const bannerSub = $('banner-sub');
const objectiveEl = $('objective');
const dialogueEl = $('dialogue');
const dialogueWho = $('dialogue-who');
const dialogueLine = $('dialogue-line');
const promptEl = $('prompt');
const crosshairEl = $('crosshair');
const vignetteEl = $('vignette');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.domElement.classList.add('webgl');
document.body.appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);
camera.position.set(-160, 60, -160);
camera.lookAt(0, 0, 0);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --------------------------------------------------------------------------- world
const audio = createAudio();
const city = buildCity(scene);
initSmoke(scene);
const player = createPlayer(scene);
player.place(-232, -2, -2.97, 0);

const parkedCars = [];
function spawnParkedCars() {
  for (let i = 0; i < 16; i += 1) {
    const axis = Math.random() < 0.5 ? 'z' : 'x';
    const line = pick(ROAD_LINES);
    let along = rand(-245, 245);
    if (ROAD_LINES.some((l) => Math.abs(along - l) < 13)) along += 27;
    const side = Math.random() < 0.5 ? 5.3 : -5.3;
    const heading = axis === 'z' ? (Math.random() < 0.5 ? 0 : Math.PI) : (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const car = createCar(scene, {
      style: pick(['sedan', 'sedan', 'pickup', 'van', 'sport']),
      x: axis === 'z' ? line + side : along,
      z: axis === 'z' ? along : line + side,
      heading,
      parked: true,
    });
    parkedCars.push(car);
  }
}
spawnParkedCars();

const traffic = createTraffic(scene, 14);
const peds = createPeds(scene, 26);

// --------------------------------------------------------------------------- state
let state = 'menu'; // menu | playing | paused | busted | wasted
let money = 120;
let elapsed = 0;
let camYaw = -2.97;
let camPitch = -0.16;
let mouseIdleT = 0;
let locked = false;
let invulnerable = false;
let damageFlash = 0;
let crashHeatT = 0;
let bannerUntil = -1;
let menuCamAngle = 0.6;
const dialogueQueue = [];
let dialogueCurrent = null;
let dialogueUntil = 0;

const shotMode = !!SHOT;
let pilot = null; // screenshot autopilot: { kind:'lane', axis, dir, lane, throttle } | { kind:'to', x, z, throttle }
let shotReverse = false; // staged scenes only: put the camera in front of the car, looking back at the chase

function focusPos() {
  return player.car ? player.car.group.position : player.group.position;
}
function allCars() {
  return [...parkedCars, ...traffic.cars, ...police.cars, ...missions.extraCars];
}

// --------------------------------------------------------------------------- HUD helpers
function banner(title, sub = '') {
  bannerTitle.textContent = title;
  bannerSub.textContent = sub;
  bannerEl.classList.add('show');
  bannerUntil = elapsed + 3.8;
}
function say(who, line) {
  dialogueQueue.push({ who, line });
}
function setObjective(text) {
  objectiveEl.textContent = text;
}
function addMoney(n) {
  money += n;
}

// --------------------------------------------------------------------------- crimes & consequences
function hurtPlayer(n) {
  if (invulnerable || state !== 'playing') return;
  damageFlash = Math.min(0.85, damageFlash + 0.38);
  if (player.hurt(n)) doWasted();
}

function handleCrash(car, other, impact, x, z) {
  audio.crash(impact);
  puff(x, 0.9, z, clamp(impact / 8, 0.6, 1.9), false);
  const playerInvolved = car.driver === 'player' || (other && other.driver === 'player');
  if (!playerInvolved || state !== 'playing') return;
  if (impact > 10.5) hurtPlayer((impact - 10.5) * 0.9);
  if (impact > 6.5 && crashHeatT <= 0) {
    police.addHeat(0.45);
    crashHeatT = 1.6;
  }
}

function onCrime(kind) {
  const heat = { shootPed: 1.5, shootPolice: 1.2, shootCar: 0.6, shootMiss: 0.3 }[kind] || 0;
  if (heat) police.addHeat(heat);
}

function onPedHit(ped, car) {
  if (car.driver !== 'player' || state !== 'playing') return;
  police.addHeat(1.1);
  audio.crash(5);
  damageFlash = Math.min(0.6, damageFlash + 0.2);
}

// --------------------------------------------------------------------------- systems that need the game object
const police = createPolice({
  scene,
  playerPos: () => focusPos(),
  playerCar: () => player.car,
  playerOnFoot: () => !player.car,
  playerSpeed: () => player.speedNow,
  hurtPlayer,
  onBusted: () => doBusted(),
  audio,
});

const missions = createMissions({
  scene,
  player,
  playerPos: () => focusPos(),
  police,
  addMoney,
  setObjective,
  banner,
  say,
  audio,
  forceExitCar: () => exitCar(),
  onMissionComplete: () => saveGame(),
  extraCars: [],
});

const combat = createCombat({
  scene,
  camera,
  player,
  peds,
  cars: () => allCars(),
  police,
  audio,
  onCrime,
});

const minimap = createMinimap($('minimap'), {
  playerPos: () => focusPos(),
  playerHeading: () => (player.car ? player.car.heading : player.heading),
  trafficCars: traffic.cars,
  policeCars: police.cars,
  markerPos: () => missions.markerPos(),
});

// --------------------------------------------------------------------------- cars: getting in and out
function nearestCar(maxDist) {
  const pp = player.group.position;
  let best = null;
  let bd = maxDist;
  for (const car of allCars()) {
    const p = car.group.position;
    const d = Math.hypot(p.x - pp.x, p.z - pp.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

function enterCar(car) {
  player.car = car;
  car.driver = 'player';
  player.group.visible = false;
  if (!car.claimed) {
    car.claimed = true;
    if (!car.isMissionCar) {
      police.addHeat(0.85);
      banner('Stolen!', 'That car was not yours — the PD has your description.');
      audio.blip();
    }
  }
  camYaw = car.heading;
  camPitch = -0.12;
  mouseIdleT = 0;
}

function exitCar() {
  const car = player.car;
  if (!car) return;
  car.driver = null;
  player.car = null;
  const h = car.heading;
  const ex = car.group.position.x - Math.cos(h) * 2.7; // step out to the car's right
  const ez = car.group.position.z + Math.sin(h) * 2.7;
  player.group.visible = true;
  player.place(ex, ez, h, city.groundHeightAt(ex, ez));
  camYaw = h;
}

function toggleCar() {
  if (player.car) exitCar();
  else {
    const car = nearestCar(4.6);
    if (car) enterCar(car);
  }
}

// --------------------------------------------------------------------------- busted / wasted / save
function leaveCarBehind() {
  if (player.car) {
    player.car.driver = null;
    player.car = null;
  }
  player.group.visible = true;
}

function doBusted() {
  if (state !== 'playing' || invulnerable) return;
  state = 'busted';
  const fine = 60 + police.stars() * 70;
  money = Math.max(0, money - fine);
  $('busted-text').textContent = `The Palmshade PD finally cornered you. The fine is ${formatMoney(fine)} — and they kept the car keys warm for you.`;
  bustedEl.classList.remove('hidden');
  audio.sting();
  audio.setEngine(false, 0);
  audio.setSiren(0);
  if (document.pointerLockElement) document.exitPointerLock();
}

function respawnBusted() {
  police.clearHeat();
  leaveCarBehind();
  player.place(POINTS.policeStation.x, POINTS.policeStation.z, 0.8, 0);
  player.healFull();
  bustedEl.classList.add('hidden');
  state = 'playing';
  lockPointer();
}

function doWasted() {
  if (state !== 'playing' || invulnerable) return;
  state = 'wasted';
  const fee = Math.min(150, money);
  money -= fee;
  $('wasted-text').textContent = `You wake up on the kerb outside Palmshade General, ${formatMoney(fee)} lighter and not one bit wiser.`;
  wastedEl.classList.remove('hidden');
  audio.sting();
  audio.setEngine(false, 0);
  audio.setSiren(0);
  if (document.pointerLockElement) document.exitPointerLock();
}

function respawnWasted() {
  police.clearHeat();
  leaveCarBehind();
  player.place(48, -213, 2.6, city.groundHeightAt(48, -213));
  player.healFull();
  wastedEl.classList.add('hidden');
  state = 'playing';
  lockPointer();
}

function saveGame() {
  writeSave({
    money,
    chainIndex: missions.chainIndex,
    player: { x: player.group.position.x, z: player.group.position.z, heading: player.heading },
    car: player.car
      ? { style: player.car.style, x: player.car.group.position.x, z: player.car.group.position.z, heading: player.car.heading, health: player.car.health }
      : null,
  });
  banner('Saved', 'Your Palmshade story is on record.');
}

function applySave(data) {
  money = typeof data.money === 'number' ? data.money : 120;
  missions.setChainIndex(data.chainIndex || 0);
  if (data.player) player.place(data.player.x, data.player.z, data.player.heading || 0, city.groundHeightAt(data.player.x, data.player.z));
  if (data.car) {
    const car = createCar(scene, { style: data.car.style, x: data.car.x, z: data.car.z, heading: data.car.heading });
    car.claimed = true;
    car.health = typeof data.car.health === 'number' ? data.car.health : 100;
    parkedCars.push(car);
  }
}

// --------------------------------------------------------------------------- flow: menu / pause
function lockPointer() {
  if (shotMode) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {
    /* the browser will let the player click to lock instead */
  }
}

function startGame(useSave) {
  audio.unlock();
  audio.setMusic(true);
  if (useSave) {
    const data = loadSave();
    if (data) applySave(data);
  } else {
    money = 120;
    missions.setChainIndex(0);
    player.place(-232, -2, -2.97, 0);
    camYaw = -2.97;
  }
  menuEl.classList.add('hidden');
  pauseEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  state = 'playing';
  banner('Welcome to Palmshade', useSave ? 'Back to work — Marisol is waiting.' : 'Find the gold marker by the café to start working for Marisol.');
  lockPointer();
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  pauseEl.classList.remove('hidden');
  audio.setEngine(false, 0);
  audio.setSiren(0);
  if (document.pointerLockElement) document.exitPointerLock();
}

function resumeGame() {
  if (state !== 'paused') return;
  pauseEl.classList.add('hidden');
  state = 'playing';
  lockPointer();
}

function quitToMenu() {
  pauseEl.classList.add('hidden');
  hudEl.classList.add('hidden');
  menuEl.classList.remove('hidden');
  $('btn-continue').classList.toggle('hidden', !hasSave());
  state = 'menu';
}

$('btn-play').addEventListener('click', () => startGame(false));
$('btn-continue').addEventListener('click', () => startGame(true));
$('btn-resume').addEventListener('click', resumeGame);
$('btn-save').addEventListener('click', saveGame);
$('btn-quit').addEventListener('click', quitToMenu);
$('btn-busted-ok').addEventListener('click', respawnBusted);
$('btn-wasted-ok').addEventListener('click', respawnWasted);
$('btn-continue').classList.toggle('hidden', !hasSave());

// --------------------------------------------------------------------------- input
const keys = {};
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  audio.unlock();
  if (e.repeat) return;
  if (e.code === 'KeyM') audio.setMuted(!audio.isMuted());
  if (state === 'playing') {
    if (e.code === 'KeyE') toggleCar();
    if (e.code === 'KeyP') pauseGame();
  } else if (state === 'paused' && (e.code === 'KeyP' || e.code === 'Enter')) {
    resumeGame();
  } else if (state === 'busted' && e.code === 'Enter') {
    respawnBusted();
  } else if (state === 'wasted' && e.code === 'Enter') {
    respawnWasted();
  } else if (state === 'menu' && e.code === 'Enter') {
    startGame(hasSave());
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && state === 'playing' && !shotMode) pauseGame();
});
window.addEventListener('mousemove', (e) => {
  if (!locked || state !== 'playing') return;
  camYaw -= e.movementX * 0.0023;
  camPitch = clamp(camPitch - e.movementY * 0.0021, -0.55, 0.8);
  mouseIdleT = 0;
});
canvas.addEventListener('mousedown', () => {
  audio.unlock();
  if (state !== 'playing') return;
  if (!locked && !shotMode) lockPointer();
  else if (locked && !player.car) combat.tryShoot();
});

const key = (code) => !!keys[code];
function footInput() {
  return {
    x: (key('KeyD') || key('ArrowRight') ? 1 : 0) - (key('KeyA') || key('ArrowLeft') ? 1 : 0),
    z: (key('KeyW') || key('ArrowUp') ? 1 : 0) - (key('KeyS') || key('ArrowDown') ? 1 : 0),
    sprint: key('ShiftLeft') || key('ShiftRight'),
  };
}
function carInput() {
  return {
    throttle: (key('KeyW') || key('ArrowUp') ? 1 : 0) - (key('KeyS') || key('ArrowDown') ? 1 : 0),
    steer: (key('KeyD') || key('ArrowRight') ? 1 : 0) - (key('KeyA') || key('ArrowLeft') ? 1 : 0),
    handbrake: key('Space'),
  };
}
function pilotInput() {
  const car = player.car;
  if (!car || !pilot) return { throttle: 0, steer: 0, handbrake: false };
  const p = car.group.position;
  if (pilot.kind === 'lane') {
    const tx = pilot.axis === 'z' ? pilot.lane : p.x + pilot.dir * 30;
    const tz = pilot.axis === 'z' ? p.z + pilot.dir * 30 : pilot.lane;
    return steerToward(car, tx, tz, { throttle: pilot.throttle });
  }
  if (pilot.kind === 'route') {
    // Follow waypoints, then creep up to the final one and stop.
    while (pilot.points.length > 1 && Math.hypot(p.x - pilot.points[0].x, p.z - pilot.points[0].z) < 9) {
      pilot.points.shift();
    }
    const target = pilot.points[0];
    const last = pilot.points.length === 1;
    return steerToward(car, target.x, target.z, {
      throttle: pilot.throttle,
      slowFor: last ? 15 : 0,
      stopAt: last ? 5.5 : 0,
    });
  }
  return steerToward(car, pilot.x, pilot.z, { throttle: pilot.throttle, slowFor: 16, stopAt: 7 });
}

// --------------------------------------------------------------------------- camera & HUD
const camTarget = new THREE.Vector3();
const camDesired = new THREE.Vector3();

function updateCamera(dt) {
  const focus = focusPos();
  const inCar = !!player.car;
  camTarget.set(focus.x, focus.y + (inCar ? 1.5 : 1.7), focus.z);
  if (inCar && mouseIdleT > 1.4 && (carInput().throttle !== 0 || shotMode)) {
    camYaw = angleLerp(camYaw, player.car.heading, dt * 1.7);
    camPitch = lerp(camPitch, -0.12, dt * 1.5);
  }
  const dist = inCar ? (shotMode ? 13.5 : 10.5) : 6.8;
  const fx = Math.sin(camYaw) * Math.cos(camPitch);
  const fy = Math.sin(camPitch);
  const fz = Math.cos(camYaw) * Math.cos(camPitch);
  const side = shotReverse ? 1 : -1; // reverse: camera ahead of the car, looking back
  camDesired.set(camTarget.x + side * fx * dist, camTarget.y - fy * dist, camTarget.z + side * fz * dist);
  camDesired.y = Math.max(0.55, camDesired.y);
  if (shotMode) camera.position.copy(camDesired); // staged scenes: always perfectly framed
  else camera.position.lerp(camDesired, 1 - Math.exp(-dt * (inCar ? 4.5 : 7)));
  camera.lookAt(camTarget.x - side * fx * 3, camTarget.y + fy * 3 + 0.15, camTarget.z - side * fz * 3);
  const targetFov = inCar ? 62 + (Math.abs(player.car.speed) / player.car.topSpeed) * 10 : 60;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov = lerp(camera.fov, targetFov, clamp(dt * 3, 0, 1));
    camera.updateProjectionMatrix();
  }
}

let lastStars = -1;
let lastMoney = -1;
function updateHUD(policeInfo) {
  const s = police.stars();
  if (s !== lastStars) {
    lastStars = s;
    starsEl.forEach((el, i) => el.classList.toggle('on', i < s));
  }
  if (money !== lastMoney) {
    lastMoney = money;
    moneyEl.textContent = formatMoney(money);
  }
  healthFill.style.width = `${player.health}%`;
  if (player.car) {
    carRow.classList.remove('hidden');
    carFill.style.width = `${player.car.health}%`;
    speedEl.innerHTML = `${Math.round(Math.abs(player.car.speed) * 3.6)} <small>km/h</small>`;
  } else {
    carRow.classList.add('hidden');
    speedEl.textContent = '';
  }
  const b = shotMode ? 0 : (policeInfo ? policeInfo.busted01 : 0);
  bustedWrap.classList.toggle('show', b > 0.02);
  bustedFill.style.width = `${Math.round(b * 100)}%`;
  crosshairEl.classList.toggle('show', state === 'playing' && !player.car);

  // Damage vignette: a flash on hits, a slow pulse on low health.
  damageFlash = Math.max(0, damageFlash - 0.022);
  let v = damageFlash;
  if (player.health < 30 && state === 'playing') v = Math.max(v, 0.22 + Math.sin(elapsed * 6) * 0.08);
  vignetteEl.style.opacity = v.toFixed(2);

  // Context prompt.
  let prompt = '';
  if (state === 'playing' && !shotMode) {
    if (player.car) {
      if (Math.abs(player.car.speed) < 2.5) prompt = '<b>E</b> — get out';
    } else {
      const car = nearestCar(4.6);
      if (car) prompt = `<b>E</b> — get in the ${car.isPolice ? 'interceptor' : car.style}`;
      else if (!locked && !shotMode) prompt = 'Click to grab the mouse';
    }
  }
  if (prompt) {
    if (promptEl.innerHTML !== prompt) promptEl.innerHTML = prompt;
    promptEl.classList.add('show');
  } else {
    promptEl.classList.remove('show');
  }

  // Banner and dialogue lifetimes.
  if (bannerUntil > 0 && elapsed > bannerUntil) {
    bannerEl.classList.remove('show');
    bannerUntil = -1;
  }
  if (!dialogueCurrent && dialogueQueue.length) {
    dialogueCurrent = dialogueQueue.shift();
    dialogueWho.textContent = `${dialogueCurrent.who}: `;
    dialogueLine.textContent = dialogueCurrent.line;
    dialogueEl.classList.add('show');
    dialogueUntil = elapsed + 4.4;
  } else if (dialogueCurrent && elapsed > dialogueUntil) {
    dialogueCurrent = null;
    dialogueEl.classList.remove('show');
  }
}

// --------------------------------------------------------------------------- the loop
const ORIGIN = new THREE.Vector3(0, 0, 0);
const clock = new THREE.Clock();

function update(dt) {
  elapsed += dt;
  mouseIdleT += dt;
  crashHeatT -= dt;
  const focus = focusPos();

  if (state === 'menu') {
    menuCamAngle += dt * 0.045;
    camera.position.set(Math.cos(menuCamAngle) * 150, 54, Math.sin(menuCamAngle) * 150);
    camera.lookAt(0, 4, 0);
    const carsNow = allCars();
    const world = { colliders: city.colliders, cars: carsNow, onCrash: () => {} };
    traffic.update(dt, { ...world, playerPos: ORIGIN, playerCar: null });
    peds.update(dt, { cars: carsNow, playerPos: ORIGIN, colliders: city.colliders, groundHeightAt: city.groundHeightAt, onPedHit: () => {} });
    updateSmoke(dt, carsNow);
    city.update(dt, ORIGIN);
    audio.update();
    return;
  }
  if (state !== 'playing') {
    city.update(dt, focus);
    return;
  }

  const carsNow = allCars();
  const world = { colliders: city.colliders, cars: carsNow, onCrash: handleCrash };

  if (player.car) {
    const input = shotMode && pilot ? pilotInput() : carInput();
    driveCar(player.car, dt, input, world);
    player.group.position.copy(player.car.group.position);
  } else {
    player.update(dt, footInput(), camYaw, { colliders: city.colliders, groundHeightAt: city.groundHeightAt });
  }

  traffic.update(dt, { ...world, playerPos: focus, playerCar: player.car });
  const policeInfo = police.update(dt, world);
  peds.update(dt, { cars: carsNow, playerPos: focus, colliders: city.colliders, groundHeightAt: city.groundHeightAt, onPedHit });
  missions.update(dt, elapsed);
  combat.update(dt);
  updateSmoke(dt, carsNow);
  city.update(dt, focus);
  updateCamera(dt);
  updateHUD(policeInfo);
  minimap.draw(performance.now());

  audio.setEngine(!!player.car, player.car ? Math.abs(player.car.speed) / player.car.topSpeed : 0);
  audio.setSiren(police.stars() > 0 && policeInfo.nearestCopDist < 70 ? clamp(1.1 - policeInfo.nearestCopDist / 65, 0, 1) : 0);
  audio.update();
}

function frame() {
  const dt = clamp(clock.getDelta(), 0, 0.05);
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// --------------------------------------------------------------------------- screenshot scenes
function stageShot(name) {
  invulnerable = true;
  money = 1250;
  menuEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  state = 'playing';

  if (name === 'foot') {
    player.place(-8.5, 20, 2.74, city.groundHeightAt(-8.5, 20));
    camYaw = 2.74;
    camPitch = -0.1;
    missions.debugMarker({ x: -2, z: -8 });
    for (let i = 0; i < 45; i += 1) update(1 / 30);
    return;
  }

  if (name === 'mission') {
    missions.startMission(0);
    const car = createCar(scene, { style: 'sedan', color: 0x2e86de, x: -168, z: -3.5, heading: -Math.PI / 2 });
    car.claimed = true;
    parkedCars.push(car);
    enterCar(car);
    pilot = { kind: 'route', points: [{ x: -206, z: -3.5 }, { x: -213, z: -12 }], throttle: 0.7 };
    camYaw = -Math.PI / 2;
    camPitch = -0.12;
    for (let i = 0; i < 200; i += 1) update(1 / 30);
    car.health = 100;
    return;
  }

  if (name === 'chase') {
    shotReverse = true;
    const car = createCar(scene, { style: 'sport', color: 0x2e86de, x: 90, z: -3.5, heading: -Math.PI / 2 });
    car.claimed = true;
    parkedCars.push(car);
    enterCar(car);
    pilot = { kind: 'lane', axis: 'x', dir: -1, lane: -3.5, throttle: 0.8 };
    police.setHeat(5);
    police.spawnAt(126, -3.5);
    police.spawnAt(132, 3.5);
    police.spawnAt(152, -11);
    police.spawnAt(66, 5.5);
    camYaw = -Math.PI / 2;
    camPitch = -0.22;
    for (let i = 0; i < 80; i += 1) update(1 / 30);
    car.health = 100;
    return;
  }

  // 'cover' (and anything else): golden-hour boulevard drive with the PD behind.
  shotReverse = true;
  const car = createCar(scene, { style: 'sport', color: 0xd64541, x: -225.5, z: 30, heading: 0 });
  car.claimed = true;
  parkedCars.push(car);
  enterCar(car);
  pilot = { kind: 'lane', axis: 'z', dir: 1, lane: -225.5, throttle: 0.55 };
  police.setHeat(3);
  police.spawnAt(-224, -2);
  police.spawnAt(-227, -16);
  camYaw = 0;
  camPitch = -0.16;
  for (let i = 0; i < 80; i += 1) update(1 / 30);
  car.health = 100;
}

if (shotMode) stageShot(SHOT);
requestAnimationFrame(frame);

// Hooks for automated checks and curious players.
window.__game = {
  version: 'palmshade-city-1.0',
  start: (useSave = false) => startGame(useSave),
  // Small dev hooks, used by the automated end-to-end checks (and available to
  // anyone poking at the console): teleport the focus, work the car door, set heat.
  debug: {
    teleport(x, z) {
      const focus = focusPos();
      focus.x = x;
      focus.z = z;
      if (!player.car) player.group.position.y = city.groundHeightAt(x, z);
    },
    pressE: () => toggleCar(),
    setHeat: (n) => police.setHeat(n),
    clearHeat: () => police.clearHeat(),
  },
  getState: () => ({
    state,
    money,
    stars: police.stars(),
    heat: Math.round(police.heat * 100) / 100,
    chainIndex: missions.chainIndex,
    missionActive: !!missions.active,
    health: player.health,
    inCar: !!player.car,
    carSpeed: player.car ? Math.round(player.car.speed * 10) / 10 : 0,
    playerPos: { x: Math.round(focusPos().x), z: Math.round(focusPos().z) },
    traffic: traffic.cars.length,
    policeCars: police.cars.length,
    peds: peds.list.length,
  }),
};
