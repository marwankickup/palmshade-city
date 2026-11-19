// main.js — Palmshade City boot: renderer, game state, input, camera, crimes,
// enter/exit cars, HUD, saves, screenshot staging and the main loop.
import * as THREE from 'three';
import { createCity } from './city.js';
import { Player } from './player.js';
import { Car, CAR_COLORS } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPeds } from './peds.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';
import { createCollectibles } from './collectibles.js';
import { createAudio } from './audio.js';
import { drawMinimap } from './minimap.js';
import { loadSave, storeSave } from './save.js';
import { makeRng, clamp, lerp, lerpAngle, dist2, fmtMoney } from './util.js';

const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') || 1) || 1;
const SHOT = params.get('shot');
const rng = makeRng(SEED * 7919 + 13);

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf6c489, 160, 1000);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3200);
camera.position.set(60, 20, 110);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- HUD
const $ = (id) => document.getElementById(id);
const hudEl = {
  root: $('hud'), stars: $('stars').children, money: $('money'),
  health: $('healthfill'), carbar: $('carbar'), car: $('carfill'),
  packages: $('packages'), dialogue: $('dialogue'), objective: $('objective'),
  prompt: $('prompt'), speedo: $('speedo'), crosshair: $('crosshair'),
  bustedwrap: $('bustedwrap'), bustedfill: $('bustedfill'), toast: $('toast'),
  minimap: $('minimap').getContext('2d'),
};
let dialogueTimer = 0, toastTimer = 0;
const hud = {
  say(who, line, sec = 4) {
    hudEl.dialogue.querySelector('.who').textContent = who;
    hudEl.dialogue.querySelector('.line').textContent = line;
    hudEl.dialogue.classList.remove('hidden');
    clearTimeout(dialogueTimer);
    dialogueTimer = setTimeout(() => hudEl.dialogue.classList.add('hidden'), sec * 1000);
  },
  setObjective(t) { hudEl.objective.textContent = t || ''; },
  setPrompt(html) {
    if (html) { hudEl.prompt.innerHTML = html; hudEl.prompt.classList.remove('hidden'); }
    else hudEl.prompt.classList.add('hidden');
  },
  toast(t) {
    hudEl.toast.textContent = t;
    hudEl.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hudEl.toast.classList.add('hidden'), 2600);
  },
  setPackages(n, total) { hudEl.packages.textContent = '▣ PACKAGES ' + n + '/' + total; },
};

// ---------------------------------------------------------------- game state
const game = {
  scene, camera, renderer, rng, hud,
  time: 0,
  mode: 'menu',           // menu | playing | paused | busted | wasted
  money: 120,
  cars: [],
  currentCar: null,
  lastCrimeAt: -99,
  crimeCd: {},
  frozen: false,
  shotBusted: null,
  city: null, player: null, traffic: null, peds: null, police: null,
  missions: null, collectibles: null, combat: null, audio: null,
  tracer: null,
};
window.__game = { game, ready: false, debug: {} };

game.playerPos = () => (game.currentCar ? game.currentCar.pos : game.player.pos);
game.playerInCar = () => !!game.currentCar;
game.playerCar = () => game.currentCar;
game.playerHeading = () => (game.currentCar ? game.currentCar.heading : game.player.heading);
game.playerSpeed = () => (game.currentCar ? Math.abs(game.currentCar.speed) : game.player.speedNow);
game.addMoney = (n) => { game.money = Math.max(0, game.money + n); };

game.damagePlayer = (n) => {
  if (game.mode !== 'playing' || game.frozen) return;
  game.player.damage(n, game.time);
  if (game.player.health <= 0) wasted();
};

const CRIMES = {
  'theft': { sev: 1, radius: 26 },
  'hit-car': { sev: 1, radius: 26 },
  'hit-ped': { sev: 2, radius: 30 },
  'gunfire': { sev: 1, radius: 34 },
  'shoot-ped': { sev: 2, radius: 34 },
  'shoot-police': { sev: 2, radius: 40 },
};
game.reportCrime = (type, x, z) => {
  const c = CRIMES[type];
  if (!c || game.mode !== 'playing') return;
  const now = game.time;
  if (game.crimeCd[type] && now - game.crimeCd[type] < 1.4) return;
  game.crimeCd[type] = now;
  // witnessed? a standing ped nearby, or any police unit
  let witnessed = false;
  for (const p of game.peds.list) {
    if (p.state !== 'down' && dist2(p.group.position.x, p.group.position.z, x, z) < c.radius) { witnessed = true; break; }
  }
  if (!witnessed) for (const u of game.police.units) {
    if (dist2(u.car.pos.x, u.car.pos.z, x, z) < 46) { witnessed = true; break; }
  }
  if (witnessed) {
    game.lastCrimeAt = now;
    game.police.addWanted(c.sev);
  }
};
game.onPedHit = (ped, car) => {
  if (car === game.currentCar || car.driver === 'player') {
    game.reportCrime('hit-ped', ped.group.position.x, ped.group.position.z);
    game.audio.crash(0.7);
  }
  game.peds.scare(ped.group.position.x, ped.group.position.z, 13);
};
game.onPedShot = (ped) => {
  game.reportCrime('shoot-ped', ped.group.position.x, ped.group.position.z);
};

// ---------------------------------------------------------------- world build
game.city = createCity(scene, rng);
game.audio = createAudio();
if (SHOT) game.audio.setMuted(true);
game.player = new Player(scene);
game.player.place(133, 44, -Math.PI / 2);

// parked cars
{
  const spots = [...game.city.parkingSpots];
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  const types = ['sedan', 'sedan', 'sport', 'convertible', 'pickup', 'van'];
  for (const s of spots.slice(0, 17)) {
    const car = new Car(scene, rng.pick(types), rng.pick(CAR_COLORS), game.city.colliders);
    car.place(s.x, s.z, s.heading);
    game.cars.push(car);
  }
}
game.traffic = createTraffic(game);
game.peds = createPeds(game);
game.police = createPolice(game);
game.combat = createCombat(game);
game.tracer = game.combat.tracer;
game.missions = createMissions(game);
game.collectibles = createCollectibles(game);
hud.setPackages(0, game.collectibles.total);

// ---------------------------------------------------------------- saves
game.saveGame = () => {
  storeSave({
    money: game.money,
    missionIndex: game.missions.index,
    chainDone: game.missions.chainDone,
    packages: game.collectibles.foundIds(),
    pos: { x: game.playerPos().x, z: game.playerPos().z },
  });
};
function applySaveData(d) {
  game.money = d.money;
  game.missions.applySave(d.missionIndex, d.chainDone);
  game.collectibles.applySave(d.packages);
  if (d.pos && d.pos.x < 168) game.player.place(d.pos.x, d.pos.z, game.player.heading);
  else game.player.place(133, 44, -Math.PI / 2);
}
function refreshContinueBtn() {
  $('continuebtn').classList.toggle('hidden', !loadSave());
}
refreshContinueBtn();

// ---------------------------------------------------------------- flow
function show(id) { for (const o of ['menu', 'pause', 'busted', 'wasted']) $(o).classList.toggle('hidden', o !== id); }
function hideOverlays() { for (const o of ['menu', 'pause', 'busted', 'wasted']) $(o).classList.add('hidden'); }

let camYaw = Math.PI / 2, camPitch = 0.34, camDist = 7;
let startedOnce = false;

function startGame(continueSave) {
  if (game.currentCar) exitCar();
  game.police.clearAll();
  if (continueSave) {
    const d = loadSave();
    if (d) applySaveData(d);
  } else {
    game.money = 120;
    game.missions.applySave(0, false);
    game.collectibles.reset();
    game.player.place(133, 44, -Math.PI / 2);
    game.player.health = 100;
  }
  game.mode = 'playing';
  startedOnce = true;
  hideOverlays();
  hudEl.root.classList.remove('hidden');
  camYaw = game.player.heading + Math.PI;
  game.audio.init();
  if (!continueSave) hud.say('Marisol', 'Driver! Come to Café Marisol — I have work for you.', 5);
}
function pauseGame() {
  if (game.mode !== 'playing') return;
  game.mode = 'paused';
  show('pause');
  if (document.pointerLockElement) document.exitPointerLock();
}
function resumeGame() {
  if (game.mode !== 'paused') return;
  game.mode = 'playing';
  hideOverlays();
}
function quitToMenu() {
  if (game.currentCar) exitCar();
  game.mode = 'menu';
  show('menu');
  hudEl.root.classList.add('hidden');
  refreshContinueBtn();
}
function onBusted() {
  if (game.mode !== 'playing') return;
  const fine = Math.min(game.money, 100 + 50 * game.police.wanted);
  game.money -= fine;
  game.police.clearAll();
  game.mode = 'busted';
  $('bustedtext').textContent = 'The Palmshade PD got you. Fine: ' + fmtMoney(fine) + '.';
  show('busted');
  game.audio.busted();
  if (document.pointerLockElement) document.exitPointerLock();
}
game.onBusted = onBusted;
function wasted() {
  if (game.mode !== 'playing') return;
  const bill = Math.min(game.money, 150);
  game.money -= bill;
  game.police.clearAll();
  game.mode = 'wasted';
  $('wastedtext').textContent = 'You wake up outside Palmshade General. Hospital bill: ' + fmtMoney(bill) + '.';
  show('wasted');
  if (document.pointerLockElement) document.exitPointerLock();
}
function respawn(atPolice) {
  if (game.currentCar) exitCar();
  const L = game.city.landmarks;
  if (atPolice) game.player.place(L.police.respawn.x, L.police.respawn.z, Math.PI);
  else game.player.place(30, -128, 0);
  game.player.health = 100;
  game.mode = 'playing';
  hideOverlays();
  camYaw = game.player.heading + Math.PI;
}

$('playbtn').addEventListener('click', () => { game.audio.init(); game.audio.click(); startGame(false); });
$('continuebtn').addEventListener('click', () => { game.audio.init(); game.audio.click(); startGame(true); });
$('resumebtn').addEventListener('click', resumeGame);
$('savebtn').addEventListener('click', () => { game.saveGame(); hud.toast('Game saved.'); refreshContinueBtn(); });
$('quitbtn').addEventListener('click', quitToMenu);
$('bustedbtn').addEventListener('click', () => respawn(true));
$('wastedbtn').addEventListener('click', () => respawn(false));

// ---------------------------------------------------------------- input
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (game.mode === 'playing') {
    if (e.code === 'KeyP') pauseGame();
    else if (e.code === 'KeyE') interact();
  } else if (game.mode === 'paused' && (e.code === 'KeyP' || e.code === 'Enter')) resumeGame();
  else if (game.mode === 'menu' && e.code === 'Enter') startGame(false);
  if (!SHOT) game.audio.init();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('click', () => {
  if (game.mode === 'playing' && !SHOT && !document.pointerLockElement) {
    try {
      const p = canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { canvas.requestPointerLock(); } catch { /* noop */ } });
    } catch { /* headless / unsupported */ }
  }
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && game.mode === 'playing' && !SHOT && startedOnce) pauseGame();
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas && game.mode === 'playing') {
    camYaw -= e.movementX * 0.0026;
    camPitch = clamp(camPitch + e.movementY * 0.0022, -0.08, 1.1);
  }
});
canvas.addEventListener('mousedown', (e) => {
  if (game.mode === 'playing' && e.button === 0 && document.pointerLockElement === canvas) {
    game.combat.tryShoot();
  }
});
window.addEventListener('wheel', (e) => {
  if (game.mode === 'playing') camDist = clamp(camDist + Math.sign(e.deltaY) * 1.2, 4, 13);
}, { passive: true });

function nearestCar(maxD) {
  const pp = game.player.pos;
  let best = null, bd = maxD;
  for (const car of game.cars) {
    const d = dist2(pp.x, pp.z, car.pos.x, car.pos.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}
function interact() {
  if (game.currentCar) { exitCar(); return; }
  if (game.missions.tryInteract()) return;
  const car = nearestCar(3.6);
  if (car) enterCar(car);
}
function enterCar(car) {
  if (car.driver === 'traffic') {
    const ti = game.traffic.cars.indexOf(car);
    if (ti >= 0) game.traffic.cars.splice(ti, 1);
  }
  const wasPolice = car.driver === 'police';
  if (wasPolice) {
    const ui = game.police.units.findIndex((u) => u.car === car);
    if (ui >= 0) game.police.units.splice(ui, 1);
  }
  car.driver = 'player';
  car.input.throttle = 0; car.input.steer = 0;
  game.currentCar = car;
  game.player.group.visible = false;
  camYaw = car.heading + Math.PI;
  camDist = 10.5;
  if (!car.isMissionCar && !car.wasStolen) {
    car.wasStolen = true;
    game.reportCrime('theft', car.pos.x, car.pos.z);
    if (wasPolice) game.police.addWanted(1);
  }
}
function exitCar() {
  const car = game.currentCar;
  if (!car) return;
  car.driver = null;
  car.input.throttle = 0; car.input.steer = 0; car.input.brake = true;
  game.currentCar = null;
  const rx = Math.cos(car.heading), rz = -Math.sin(car.heading);
  game.player.place(car.pos.x + rx * 2.4, car.pos.z + rz * 2.4, car.heading);
  game.player.group.visible = true;
  camDist = 7;
}

// ---------------------------------------------------------------- per-frame
function updatePlayerCar(dt) {
  const car = game.currentCar;
  const fwd = (keys.KeyW || keys.ArrowUp) ? 1 : 0;
  const back = (keys.KeyS || keys.ArrowDown) ? 1 : 0;
  car.input.throttle = fwd - back;
  car.input.steer = ((keys.KeyA || keys.ArrowLeft) ? 1 : 0) + ((keys.KeyD || keys.ArrowRight) ? -1 : 0);
  car.input.brake = back > 0 && car.speed > 1;
  car.input.handbrake = !!keys.Space;
  if ((keys.ShiftLeft || keys.ShiftRight) && car.input.throttle > 0) car.input.throttle = Math.min(1, car.input.throttle * 1.35);
  const impact = car.update(dt, game.time);
  if (impact > 9) {
    game.audio.crash(clamp(impact / 22, 0.3, 1));
    if (impact > 12) game.reportCrime('hit-car', car.pos.x, car.pos.z);
  }
  game.player.group.position.copy(car.pos);
  game.audio.engine(clamp(Math.abs(car.speed) / car.spec.topSpeed, 0, 1), true);
}

function carSeparation() {
  const cars = game.cars;
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 3.4 || d < 0.001) continue;
    const rel = Math.abs(a.speed - b.speed);
    const push = (3.4 - d) / 2;
    const nx = dx / d, nz = dz / d;
    if (a.driver) { a.pos.x -= nx * push; a.pos.z -= nz * push; }
    if (b.driver) { b.pos.x += nx * push; b.pos.z += nz * push; }
    if ((a === game.currentCar || b === game.currentCar) && rel > 5.5) {
      const other = a === game.currentCar ? b : a;
      if (!other.contactT || game.time - other.contactT > 0.9) {
        other.contactT = game.time;
        game.audio.crash(clamp(rel / 20, 0.3, 1));
        other.damage(rel * 0.8);
        game.reportCrime('hit-car', other.pos.x, other.pos.z);
      }
    }
  }
}

function updateCamera(dt) {
  if (game.frozen) return;
  if (game.mode === 'menu') {
    const t = performance.now() * 0.00005;
    camera.position.set(60 + Math.cos(t) * 58, 17, 30 + Math.sin(t) * 58);
    camera.lookAt(70, 3, 30);
    return;
  }
  const target = game.playerPos();
  const inCar = !!game.currentCar;
  if (inCar) {
    const behind = game.currentCar.heading + Math.PI;
    camYaw = lerpAngle(camYaw, behind, 1 - Math.exp(-2.2 * dt));
    camPitch = lerp(camPitch, 0.3, 1 - Math.exp(-2 * dt));
  }
  const dist = inCar ? 10.5 : camDist;
  const cxp = target.x + Math.sin(camYaw) * Math.cos(camPitch) * dist;
  const czp = target.z + Math.cos(camYaw) * Math.cos(camPitch) * dist;
  const cyp = (target.y || 0) + 1.7 + Math.sin(camPitch) * dist;
  camera.position.set(cxp, Math.max(cyp, 0.7), czp);
  camera.lookAt(target.x, (target.y || 0) + 1.7, target.z);
}

function refreshHud() {
  const w = game.police.wanted;
  for (let i = 0; i < 5; i++) hudEl.stars[i].className = i < w ? 'on' : 'off';
  hudEl.money.textContent = fmtMoney(game.money);
  hudEl.health.style.width = clamp(game.player.health, 0, 100) + '%';
  const inCar = !!game.currentCar;
  hudEl.carbar.style.display = inCar ? '' : 'none';
  if (inCar) hudEl.car.style.width = clamp(game.currentCar.health, 0, 100) + '%';
  hudEl.speedo.classList.toggle('hidden', !inCar);
  if (inCar) hudEl.speedo.querySelector('.num').textContent = Math.round(game.currentCar.speedKmh);
  hudEl.crosshair.classList.toggle('hidden', inCar || game.mode !== 'playing');
  const b = game.shotBusted !== null ? game.shotBusted : game.police.busted01;
  hudEl.bustedwrap.classList.toggle('hidden', !(b > 0.02 && game.mode === 'playing'));
  hudEl.bustedfill.style.width = (b * 100).toFixed(0) + '%';
  const nd = game.police.nearestDist;
  game.audio.siren(w > 0 && nd < 70, clamp(1 - nd / 70, 0, 1));
  if (!inCar) game.audio.engine(0, false);
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let frames = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  frames++;
  if (game.mode !== 'paused') game.time += dt;
  const t = game.time;

  const pp = game.playerPos();
  game.city.sun.position.set(pp.x + game.city.sunDir.x * 260, game.city.sunDir.y * 260, pp.z + game.city.sunDir.z * 260);
  game.city.sun.target.position.set(pp.x, 0, pp.z);
  game.city.update(t);

  if (game.frozen) {
    for (const car of game.cars) if (car.type === 'police') car.flashLights(t);
    renderer.render(scene, camera);
    if (SHOT && frames > 40 && !window.__game.ready) window.__game.ready = true;
    return;
  }

  if (game.mode === 'playing') {
    hud.setPrompt('');
    if (game.currentCar) updatePlayerCar(dt);
    else {
      game.player.canRegen = t - game.player.lastDamageAt > 6;
      game.player.update(dt, {
        f: !!(keys.KeyW || keys.ArrowUp), b: !!(keys.KeyS || keys.ArrowDown),
        l: !!(keys.KeyA || keys.ArrowLeft), r: !!(keys.KeyD || keys.ArrowRight),
        sprint: !!(keys.ShiftLeft || keys.ShiftRight),
      }, camYaw, game.city.colliders, game.city.platforms);
      for (const car of game.cars) {
        const d = dist2(game.player.pos.x, game.player.pos.z, car.pos.x, car.pos.z);
        if (d < 2.1 && d > 0.001) {
          const push = 2.1 - d;
          game.player.pos.x += ((game.player.pos.x - car.pos.x) / d) * push;
          game.player.pos.z += ((game.player.pos.z - car.pos.z) / d) * push;
        }
      }
      if (nearestCar(3.6)) hud.setPrompt('<b>E</b> — Enter vehicle');
    }
    game.traffic.update(dt);
    game.police.update(dt);
    game.peds.update(dt);
    game.missions.update(dt);
    game.collectibles.update(dt);
    game.combat.update(dt);
    carSeparation();
    refreshHud();
    drawMinimap(hudEl.minimap, game);
  } else if (game.mode === 'menu') {
    game.peds.update(dt);
  }
  updateCamera(dt);
  renderer.render(scene, camera);
  if (SHOT && !game.frozen && frames > 40 && !window.__game.ready) window.__game.ready = true;
}

// ---------------------------------------------------------------- shots
function stageShot(name) {
  startGame(false);
  startedOnce = false; // shot mode: pointer-lock loss must not pause
  const freezeCam = (x, y, z, lx, ly, lz) => {
    camera.position.set(x, y, z);
    camera.lookAt(lx, ly, lz);
  };
  const spawnCar = (type, color, x, z, heading) => {
    const car = new Car(scene, type, color, game.city.colliders);
    car.place(x, z, heading);
    game.cars.push(car);
    return car;
  };
  const stagePolice = (x, z, heading) => {
    const car = spawnCar('police', 0xf2f2f2, x, z, heading);
    car.driver = 'police';
    return car;
  };

  if (name === 'cover') {
    const car = spawnCar('sport', 0xd8544a, -117.6, 14, Math.PI);
    enterCar(car);
    car.speed = 23;
    game.police.setWanted(3);
    stagePolice(-117.6, 27, Math.PI);
    stagePolice(-122.4, 33, Math.PI);
    spawnCar('sedan', 0x3f7fbf, -122.4, -34, 0);
    freezeCam(-113, 3.0, -6, -120, 1.3, 14);
  } else if (name === 'foot') {
    game.player.place(127, 27, -Math.PI / 2 + 0.25);
    game.peds.list.slice(0, 4).forEach((p, i) => {
      p.group.position.set(130 + i * 2.2, 0, 16 + i * 5);
    });
    freezeCam(136, 2.8, 34.5, 110, 1.8, 26.5);
  } else if (name === 'mission') {
    game.missions.debug.startMission(0);
    game.missions.debug.setStep(2);
    const van = spawnCar('van', 0xf2b13c, 62.4, -148, Math.PI);
    van.isMissionCar = true;
    enterCar(van);
    freezeCam(64, 3.2, -130, 61, 1.3, -152);
  } else if (name === 'chase') {
    const car = spawnCar('sedan', 0x3f7fbf, -60, 60, Math.PI / 2);
    enterCar(car);
    car.speed = 9;
    game.police.setWanted(5);
    stagePolice(-51, 54.5, Math.PI / 2 + 0.5);
    stagePolice(-51, 65.5, Math.PI / 2 - 0.5);
    stagePolice(-69.5, 53, Math.PI / 2 + 2.6);
    stagePolice(-69.5, 67, Math.PI / 2 - 2.6);
    game.shotBusted = 0.55;
    freezeCam(-42, 4.6, 42, -61, 1.2, 61);
  } else if (name === 'beach') {
    game.player.place(224, 120, Math.PI / 2);
    game.player.group.position.y = 0.5;
    freezeCam(206, 2.6, 111, 234, 1.2, 123);
  }
  game.missions.update(0.016);
  if (name === 'cover') game.hud.setObjective('Outrun the Palmshade PD!');
  else if (name === 'chase') game.hud.setObjective('Lose the heat — do not get busted!');
  game.collectibles.update(0.016);
  refreshHud();
  drawMinimap(hudEl.minimap, game);
  game.frozen = true;
}

// ---------------------------------------------------------------- debug hooks
Object.assign(window.__game.debug, {
  start: () => startGame(false),
  continueGame: () => startGame(true),
  state: () => ({
    mode: game.mode, money: game.money, wanted: game.police.wanted,
    inCar: !!game.currentCar, health: game.player.health,
    mission: game.missions.debug.state(), packages: game.collectibles.count,
    pos: { x: game.playerPos().x, z: game.playerPos().z },
    carHealth: game.currentCar ? game.currentCar.health : null,
  }),
  setWanted: (n) => game.police.setWanted(n),
  teleport: (x, z) => {
    if (game.currentCar) game.currentCar.place(x, z, game.currentCar.heading);
    else game.player.place(x, z, game.player.heading);
  },
  enterNearest: () => { const c = nearestCar(7); if (c) { enterCar(c); return true; } return false; },
  exitCar: () => exitCar(),
  interact: () => interact(),
  startMission: (i) => game.missions.debug.startMission(i),
  setMissionStep: (n) => game.missions.debug.setStep(n),
  missionCar: () => game.missions.debug.missionCar(),
  giveCash: (n) => game.addMoney(n),
  save: () => game.saveGame(),
  shoot: () => game.combat.tryShoot(),
  bustedNow: () => onBusted(),
  damage: (n) => game.damagePlayer(n),
  collectAt: (i) => {
    const sp = game.collectibles.spotAt(i);
    if (!sp) return false;
    if (game.currentCar) exitCar();
    game.player.place(sp.x, sp.z, game.player.heading);
    game.player.group.position.y = sp.y;
    game.collectibles.update(0.05);
    return true;
  },
  packagesFound: () => game.collectibles.foundIds(),
});

if (SHOT) stageShot(SHOT);
loop();
