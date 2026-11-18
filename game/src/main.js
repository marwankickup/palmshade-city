// main.js — Palmshade City: boot, the game loop, state machine
// (menu / playing / paused / busted / wasted), input, and the wiring
// between every system: city, player, cars, traffic, peds, police,
// missions, combat, audio, minimap, save.
// URL params: ?shot=cover|foot|mission|chase&seed=1 stages a scene for
// screenshots; window.__game exposes state + debug hooks for tests.
import * as THREE from 'three';
import { buildCity, makeSky, randomRoadPoint } from './city.js';
import { Player, CameraRig } from './player.js';
import { Car, spawnParkedCars } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Peds } from './peds.js';
import { Police } from './police.js';
import { Missions, CAFE } from './missions.js';
import { Combat } from './combat.js';
import { AudioSys } from './audio.js';
import { drawMinimap } from './minimap.js';
import { hasSave, saveGame, loadGame } from './save.js';

// ---------- deterministic RNG ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 7) || 7;
const rng = mulberry32(seed);
const SHOT = params.get('shot');

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'), menu: $('menu'), pause: $('pause'), end: $('endScreen'),
  stars: $('stars'), money: $('money'), healthFill: $('healthFill'), healthLabel: $('healthLabel'),
  dialogue: $('dialogue'), objective: $('objective'), prompt: $('prompt'),
  speedo: $('speedo'), speedVal: $('speedVal'), bustedWrap: $('bustedWrap'), bustedFill: $('bustedFill'),
  crosshair: $('crosshair'), toast: $('toast'), vignette: $('vignette'),
  minimap: $('minimap'), endTitle: $('endTitle'), endText: $('endText'),
  playBtn: $('playBtn'), continueBtn: $('continueBtn'), continueInfo: $('continueInfo'),
  resumeBtn: $('resumeBtn'), saveBtn: $('saveBtn'), menuBtn: $('menuBtn'), againBtn: $('againBtn'),
  pauseStats: $('pauseStats'), saveNote: $('saveNote'),
};
const mmCtx = ui.minimap.getContext('2d');

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
makeSky(scene);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(-60, 40, -60);

const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x9a7350, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb36b, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -95; sun.shadow.camera.right = 95;
sun.shadow.camera.top = 95; sun.shadow.camera.bottom = -95;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 320;
sun.shadow.bias = -0.0006;
scene.add(sun); scene.add(sun.target);

// ---------- world + systems ----------
const cityParts = buildCity(scene, rng);
const audio = new AudioSys();
if (SHOT) audio.setMuted(true);

let money = 120;
let state = 'menu'; // menu | playing | paused | busted | wasted
let time = 0;
let currentCar = null;
let menuOrbit = 0;

const player = new Player(scene, rng, CAFE.x + 4, CAFE.z + 10);
const rig = new CameraRig(camera);
rig.yaw = 2.6;

const parkedCars = spawnParkedCars(scene, rng);
const traffic = new Traffic(scene, rng);
const peds = new Peds(scene, rng, {
  onHit(ped, byPlayer) {
    if (byPlayer) {
      commitCrime(1.0, ped.pos);
      toast('Reckless driving!', '#ff9a8a');
    }
  },
});
const police = new Police(scene, rng, {
  onBusted() { if (state === 'playing') doBusted(); },
  onShootPlayer(dmg) {
    if (state !== 'playing') return;
    if (currentCar) { currentCar.damage(dmg * 1.4); flashDamage(); }
    else { player.damage(dmg); flashDamage(); if (player.dead) doWasted(); }
  },
});
const missions = new Missions(scene, {
  dialogue(lines) { queueDialogue(lines); },
  objective(text) { objectiveText = text; },
  reward(amount, title) {
    money += amount;
    toast(`+$${amount} — ${title.replace(/^M\d+ · /, '')} complete!`);
    audio.cash();
  },
  pickup() { audio.pickup(); },
  raiseWanted(n, clear = false) {
    if (clear) police.clear();
    else police.setWanted(Math.max(police.wanted, n));
  },
  autosave() { persist(); },
});
const combat = new Combat(scene, {
  onShoot() {
    audio.shot();
    commitCrime(0.8, player.pos);
    peds.scare(player.pos.x, player.pos.z, 17);
  },
  onHitPed(ped) {
    ped.state = 'down'; ped.timer = 9;
    ped.mesh.rotation.x = -Math.PI / 2; ped.mesh.position.y = 0.25;
    commitCrime(1.6, ped.pos);
  },
  onHitPolice() { commitCrime(1.2, player.pos); },
  onHitCar() { commitCrime(0.4, player.pos); },
});

function allDrivableCars() {
  return [...parkedCars, ...missions.missionCars()];
}
function commitCrime(amount, at) {
  // crimes only raise heat when someone could see them
  let witnessed = false;
  for (const u of police.units) if (Math.hypot(u.car.pos.x - at.x, u.car.pos.z - at.z) < 75) witnessed = true;
  if (!witnessed) for (const p of peds.list) if (p.state !== 'down' && Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < 30) { witnessed = true; break; }
  if (witnessed || police.wanted > 0) police.crime(amount, time);
}

// ---------- HUD helpers ----------
let dialogueQueue = [], dialogueTimer = 0, objectiveText = '';
function queueDialogue(lines) { dialogueQueue.push(...lines); if (dialogueTimer <= 0) showNextDialogue(); }
function showNextDialogue() {
  const line = dialogueQueue.shift();
  if (line === undefined) { ui.dialogue.classList.add('hidden'); dialogueTimer = 0; return; }
  const idx = line.indexOf(':');
  ui.dialogue.innerHTML = idx > 0 ? `<b>${line.slice(0, idx + 1)}</b>${line.slice(idx + 1)}` : line;
  ui.dialogue.classList.remove('hidden');
  dialogueTimer = 4.4;
}
let toastTimer = 0;
function toast(text, color = '#8dff6e') {
  ui.toast.textContent = text;
  ui.toast.style.color = color;
  ui.toast.style.opacity = 1;
  toastTimer = 2.4;
}
let dmgFlash = 0;
function flashDamage() { dmgFlash = 0.55; }

function persist() {
  saveGame({
    money,
    missionsIdx: missions.idx,
    missionsComplete: missions.complete,
    pos: { x: Math.round(player.pos.x), z: Math.round(player.pos.z) },
  });
  refreshContinue();
}
function refreshContinue() {
  if (hasSave()) {
    const s = loadGame();
    ui.continueBtn.classList.remove('hidden');
    ui.continueInfo.textContent = s ? `$${s.money} · job ${Math.min(5, (s.missionsIdx ?? 0) + (s.missionsComplete ? 5 : 0))}/5 done` : '';
  } else ui.continueBtn.classList.add('hidden');
}

// ---------- state changes ----------
function startGame(fromSave) {
  audio.ensure(); audio.startMusic();
  if (fromSave) {
    const s = loadGame();
    if (s) {
      money = s.money ?? 120;
      missions.idx = s.missionsIdx ?? 0;
      missions.complete = !!s.missionsComplete;
      if (s.pos) { player.pos.set(s.pos.x, 0, s.pos.z); }
    }
  } else {
    money = 120; missions.idx = 0; missions.complete = false;
    player.pos.set(CAFE.x + 4, 0, CAFE.z + 10);
  }
  exitCar(true);
  player.heal();
  police.clear(); police.disposeAll();
  state = 'playing';
  ui.menu.classList.add('hidden'); ui.end.classList.add('hidden'); ui.pause.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  objectiveText = missions.complete ? 'Free roam — visit Café Solano to replay Marisol\'s jobs.' : 'Head to Café Solano (gold marker) — Marisol has work for you.';
  queueDialogue(['Marisol: Rook, over here! Café Solano, south-west corner. I\'ve got work if you\'ve got wheels.']);
}
function toMenu() {
  state = 'menu';
  exitCar(true);
  ui.pause.classList.add('hidden'); ui.end.classList.add('hidden'); ui.hud.classList.add('hidden');
  ui.menu.classList.remove('hidden');
  refreshContinue();
  if (document.pointerLockElement) document.exitPointerLock();
}
function doBusted() {
  const fine = Math.min(money, 100 + police.stars * 75);
  money -= fine;
  state = 'busted';
  ui.endTitle.textContent = 'BUSTED';
  ui.endTitle.className = 'bustedT';
  ui.endText.innerHTML = `Palmshade PD got their hands on you.<br>Fine paid: <b>$${fine}</b>. Your wheels are gone, your pride is dented — the city is still out there.`;
  ui.end.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  audio.siren(false); audio.engine(false, 0);
}
function doWasted() {
  const bill = Math.min(money, 150);
  money -= bill;
  state = 'wasted';
  ui.endTitle.textContent = 'WASTED';
  ui.endTitle.className = 'wastedT';
  ui.endText.innerHTML = `You wake up outside Palmshade General with a headache and a bill.<br>Hospital charges: <b>$${bill}</b>.`;
  ui.end.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  audio.siren(false); audio.engine(false, 0);
}
function respawn() {
  exitCar(true);
  police.clear(); police.disposeAll();
  player.heal();
  player.pos.set(CAFE.x + 6, 0, CAFE.z + 14);
  player.heading = 2.6; rig.yaw = 2.6; rig.init = false;
  ui.end.classList.add('hidden');
  state = 'playing';
}

ui.playBtn.addEventListener('click', () => startGame(false));
ui.continueBtn.addEventListener('click', () => startGame(true));
ui.resumeBtn.addEventListener('click', () => { state = 'playing'; ui.pause.classList.add('hidden'); });
ui.saveBtn.addEventListener('click', () => { persist(); ui.saveNote.textContent = 'Saved ✓ — money, jobs and position stored.'; });
ui.menuBtn.addEventListener('click', toMenu);
ui.againBtn.addEventListener('click', respawn);
refreshContinue();

// ---------- input ----------
const keys = {};
let dragging = false, lastMX = 0, lastMY = 0, locked = false;
addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  keys[e.code] = true;
  if (state === 'playing' && e.code === 'KeyE') toggleCar();
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (state === 'playing') openPause();
    else if (state === 'paused' && e.code === 'KeyP') { state = 'playing'; ui.pause.classList.add('hidden'); }
  }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
function openPause() {
  state = 'paused';
  ui.pauseStats.innerHTML = `Cash <b>$${money}</b> · Jobs done: <b>${missions.complete ? 5 : missions.idx}/5</b><br>Marisol is counting on you, Rook.`;
  ui.saveNote.textContent = '';
  ui.pause.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  audio.engine(false, 0); audio.siren(false);
}
const cvs = renderer.domElement;
cvs.addEventListener('mousedown', (e) => {
  if (state !== 'playing') return;
  audio.ensure();
  if (!locked && !SHOT) {
    dragging = true; lastMX = e.clientX; lastMY = e.clientY;
    cvs.requestPointerLock?.();
  } else if (!currentCar) {
    tryShoot();
  }
});
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', (e) => {
  if (state !== 'playing') return;
  if (locked) rig.addLook(e.movementX, e.movementY);
  else if (dragging) { rig.addLook(e.clientX - lastMX, e.clientY - lastMY); lastMX = e.clientX; lastMY = e.clientY; }
});
document.addEventListener('pointerlockchange', () => {
  const was = locked;
  locked = document.pointerLockElement === cvs;
  if (was && !locked && state === 'playing' && !SHOT) openPause();
});
function tryShoot() {
  if (currentCar || state !== 'playing') return;
  combat.shoot(camera, player.pos, { peds, cars: allDrivableCars(), policeCars: police.units.map((u) => u.car) });
}

// ---------- cars: enter / exit / collisions ----------
function nearestCar() {
  let best = null, bd = 3.6;
  for (const car of allDrivableCars()) {
    const d = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}
function enterCar(car) {
  currentCar = car;
  car.occupied = true;
  player.setVisible(false);
  player.pos.copy(car.pos);
  rig.yaw = car.heading; rig.init = false;
  if (!car.everEntered) {
    car.everEntered = true;
    if (!car.isPlayersOwn) { commitCrime(0.55, car.pos); }
  }
  audio.blip(320, 0.07, 0.08, 'square');
}
function exitCar(silent = false) {
  if (!currentCar) return;
  const car = currentCar;
  car.occupied = false;
  // step out on the left side of the car
  const rx = Math.cos(car.heading), rz = -Math.sin(car.heading);
  player.pos.set(car.pos.x + rx * 2.4, 0, car.pos.z + rz * 2.4);
  player.heading = car.heading;
  player.setVisible(true);
  currentCar = null;
  if (!silent) audio.blip(240, 0.07, 0.08, 'square');
  audio.engine(false, 0);
}
function toggleCar() {
  if (currentCar) { if (Math.abs(currentCar.speed) < 3) exitCar(); return; }
  const car = nearestCar();
  if (car) enterCar(car);
}
let ramCd = 0;
function carCarCollisions(dt) {
  ramCd = Math.max(0, ramCd - dt);
  if (!currentCar) return;
  const mine = currentCar;
  const others = [...allDrivableCars(), ...traffic.meshes(), ...police.units.map((u) => u.car)];
  for (const o of others) {
    if (o === mine) continue;
    const dx = mine.pos.x - o.pos.x, dz = mine.pos.z - o.pos.z;
    const d = Math.hypot(dx, dz), min = mine.radius + o.radius - 0.35;
    if (d > 0.01 && d < min) {
      const push = (min - d) / 2;
      mine.pos.x += (dx / d) * push; mine.pos.z += (dz / d) * push;
      const impact = Math.abs(mine.speed);
      if (impact > 6) {
        mine.damage((impact - 5) * 1.1);
        o.damage((impact - 5) * 0.9);
        if (ramCd <= 0) { audio.crash(Math.min(2, impact / 9)); ramCd = 0.25; flashDamage(); }
        commitCrime(o.mesh.userData.police ? 0.9 : 0.4, mine.pos);
        mine.speed *= 0.45;
      } else mine.speed *= 0.8;
    }
  }
}
function carsHitPlayer(dt) {
  if (currentCar || state !== 'playing') return;
  const movers = [...traffic.movers(), ...police.movers()];
  for (const m of movers) {
    if (Math.abs(m.speed) < 4) continue;
    const d = Math.hypot(m.x - player.pos.x, m.z - player.pos.z);
    if (d < 2.1) {
      player.damage(16);
      flashDamage();
      const dx = player.pos.x - m.x, dz = player.pos.z - m.z, dl = Math.hypot(dx, dz) || 1;
      player.pos.x += (dx / dl) * 3; player.pos.z += (dz / dl) * 3;
      audio.crash(1);
      if (player.dead) doWasted();
      break;
    }
  }
}

// ---------- per-frame update ----------
function playerFocus() {
  return currentCar ? { pos: currentCar.pos, heading: currentCar.heading, speed: currentCar.speed } : { pos: player.pos, heading: player.heading, speed: 0 };
}
function update(dt) {
  time += dt;
  const focus = playerFocus();
  // sun + shadow frustum follows the action
  sun.position.set(focus.pos.x - 70, 95, focus.pos.z - 45);
  sun.target.position.set(focus.pos.x, 0, focus.pos.z);
  cityParts.foam.position.x = 172 + Math.sin(time * 0.6) * 0.8;

  if (state === 'menu') {
    menuOrbit += dt * 0.045;
    const cx = Math.sin(menuOrbit) * 120, cz = Math.cos(menuOrbit) * 120;
    camera.position.set(cx, 46 + Math.sin(time * 0.23) * 5, cz);
    camera.lookAt(0, 4, 0);
    traffic.update(dt, [], { x: 0, z: 0 });
    peds.update(dt, { x: 9999, z: 9999 });
    return;
  }
  if (state !== 'playing') return;

  // --- player / car control
  if (currentCar) {
    const input = {
      throttle: (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0),
      steer: (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0),
      handbrake: !!keys.Space,
    };
    if (currentCar.dead) { input.throttle = 0; }
    currentCar.drive(dt, input, (impact) => { audio.crash(Math.min(2, impact / 10)); flashDamage(); });
    player.pos.copy(currentCar.pos);
    carCarCollisions(dt);
    audio.engine(true, Math.abs(currentCar.speed) / currentCar.maxSpeed);
  } else {
    const input = {
      x: (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0),
      z: (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0),
      sprint: !!(keys.ShiftLeft || keys.ShiftRight),
    };
    player.update(dt, input, rig.yaw);
    audio.engine(false, 0);
  }

  // --- world systems
  const extras = [
    ...parkedCars.map((c) => ({ x: c.pos.x, z: c.pos.z })),
    ...police.units.map((u) => ({ x: u.car.pos.x, z: u.car.pos.z })),
  ];
  if (currentCar) extras.push({ x: currentCar.pos.x, z: currentCar.pos.z });
  traffic.update(dt, extras, focus.pos);
  peds.update(dt, focus.pos);
  const hitCars = [...traffic.movers(), ...police.movers()];
  if (currentCar) hitCars.push({ x: currentCar.pos.x, z: currentCar.pos.z, speed: currentCar.speed, radius: 1.8, isPlayer: true });
  peds.hitCheck(hitCars, dt);
  carsHitPlayer(dt);

  police.update(dt, {
    playerPos: focus.pos, playerHeading: focus.heading,
    playerSpeedAbs: Math.abs(focus.speed), inCar: !!currentCar, time,
  });
  audio.siren(police.units.length > 0 && police.wanted > 0, 1);

  missions.update(dt, {
    playerPos: focus.pos, inCar: !!currentCar, carRef: currentCar, wanted: police.wanted,
  });
  combat.update(dt);

  // --- camera
  if (rigLockYaw !== null) rig.yaw = rigLockYaw;
  rig.update(dt, focus.pos, focus.heading, !!currentCar);

  // --- dialogue / toast timers
  if (dialogueTimer > 0) { dialogueTimer -= dt; if (dialogueTimer <= 0) showNextDialogue(); }
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) ui.toast.style.opacity = 0; }
  dmgFlash = Math.max(0, dmgFlash - dt);
  ui.vignette.style.opacity = dmgFlash > 0 ? Math.min(0.9, dmgFlash) : (player.health < 30 && !currentCar ? 0.35 : 0);

  updateHUD(focus);
}

function updateHUD(focus) {
  const stars = police.stars;
  ui.stars.innerHTML = '★'.repeat(stars) + `<span class="off">${'★'.repeat(5 - stars)}</span>`;
  ui.money.textContent = `$${money}`;
  const inCar = !!currentCar;
  const hp = inCar ? currentCar.health : player.health;
  ui.healthFill.style.width = `${Math.max(0, hp)}%`;
  ui.healthLabel.textContent = inCar ? (currentCar.dead ? 'CAR — WRECKED' : 'CAR HEALTH') : 'HEALTH';
  // objective + distance
  const target = missions.currentTarget();
  if (objectiveText) {
    let dist = '';
    if (target) dist = ` <span class="dist">${Math.round(Math.hypot(target.x - focus.pos.x, target.z - focus.pos.z))}m</span>`;
    ui.objective.innerHTML = objectiveText + dist;
    ui.objective.classList.remove('hidden');
  } else ui.objective.classList.add('hidden');
  // context prompt
  let prompt = '';
  if (inCar) {
    if (currentCar.dead) prompt = 'This car is wrecked — press <span class="key">E</span> and find another';
    else if (Math.abs(currentCar.speed) < 3) prompt = 'Press <span class="key">E</span> to step out';
  } else {
    const car = nearestCar();
    if (car) prompt = `Press <span class="key">E</span> to ${car.everEntered ? 'drive' : 'steal'} the ${car.style}`;
  }
  if (prompt) { ui.prompt.innerHTML = prompt; ui.prompt.classList.remove('hidden'); }
  else ui.prompt.classList.add('hidden');
  // speedo + crosshair
  ui.speedo.classList.toggle('hidden', !inCar);
  if (inCar) ui.speedVal.textContent = Math.round(Math.abs(currentCar.speed) * 2.4);
  ui.crosshair.classList.toggle('hidden', inCar);
  // busted meter
  const b = police.busted;
  ui.bustedWrap.classList.toggle('hidden', !(b > 0.03 && police.wanted > 0));
  ui.bustedFill.style.width = `${b * 100}%`;
  // minimap
  drawMinimap(ui.minimap, mmCtx, {
    player: { x: focus.pos.x, z: focus.pos.z, heading: focus.heading },
    traffic: traffic.movers(), police: police.units.map((u) => ({ x: u.car.pos.x, z: u.car.pos.z })),
    marker: target, t: time,
  });
}

// ---------- shot staging + debug hooks ----------
let rigLockYaw = null; // shot mode: keep the staged camera angle against the rig's ease
function stageShot(name) {
  state = 'playing';
  ui.menu.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  const step = (n, fn) => { for (let i = 0; i < n; i++) fn(1 / 30); };
  if (name === 'foot') {
    player.pos.set(-120, 0, -98);
    player.update(0.1, { x: 0, z: 0, sprint: false }, 0); // settle out of any building
    player.heading = Math.atan2(CAFE.x - player.pos.x, CAFE.z - player.pos.z);
    rig.yaw = player.heading; rig.pitch = 0.38; rig.init = false;
    objectiveText = 'Head to Café Solano (gold marker) — Marisol has work for you.';
    // a few peds stroll the same sidewalk
    const spots = [[-117, -104], [-115, -95], [-123, -110]];
    peds.list.slice(0, 3).forEach((p, i) => { p.pos.set(spots[i][0], 0, spots[i][1]); p.target = { x: spots[i][0] - 6, z: spots[i][1] - 8 }; });
    step(40, (dt) => { traffic.update(dt, [], player.pos); peds.update(dt, player.pos); missions.update(dt, { playerPos: player.pos, inCar: false, carRef: null, wanted: 0 }); });
    rig.update(0.5, player.pos, player.heading, false);
  } else if (name === 'mission') {
    missions.debugStart(0);
    const van = missions.missionCars()[0];
    van.pos.set(131.6, 0, 72); van.heading = 0; van.mesh.position.copy(van.pos); van.mesh.rotation.y = 0;
    van.everEntered = true;
    enterCar(van);
    objectiveText = 'Deliver the van to the garage by the warehouse';
    step(30, (dt) => { traffic.update(dt, [], van.pos); peds.update(dt, van.pos); });
    rig.yaw = van.heading; rig.init = false;
    rig.update(0.5, van.pos, van.heading, true);
  } else if (name === 'cover' || name === 'chase') {
    const car = new Car(scene, name === 'cover' ? 'sport' : 'sedan', name === 'cover' ? 0xe84f3d : 0x2a9db5, 84.4, 30, Math.PI);
    parkedCars.push(car);
    car.everEntered = true;
    enterCar(car);
    car.speed = 21;
    police.setWanted(name === 'cover' ? 3 : 5);
    step(50, (dt) => {
      police.update(dt, { playerPos: car.pos, playerHeading: car.heading, playerSpeedAbs: 21, inCar: true, time: dt * 50 });
      traffic.update(dt, [], car.pos); peds.update(dt, car.pos);
    });
    // arrange the pursuit so units read on camera: one ahead, the rest
    // fanned out behind-left / behind-right (player faces -z, at z=30)
    const offs = [[84.4, 4], [76, 35], [95, 37], [84.4, 55], [73, 28]];
    police.units.forEach((u, i) => {
      const [ox, oz] = offs[i % offs.length];
      u.car.pos.set(ox, 0, oz); u.car.heading = Math.PI; u.car.speed = 20;
      u.car.mesh.position.copy(u.car.pos); u.car.mesh.rotation.y = Math.PI;
    });
    if (name === 'chase') police.busted = 0.45;
    objectiveText = name === 'cover' ? 'Palmshade PD is on your tail — lose them!' : 'Lose the heat and reach the old garage (NW corner)';
    rigLockYaw = car.heading + 0.52;
    rig.yaw = rigLockYaw; rig.init = false;
    rig.update(0.5, car.pos, car.heading, true);
    rig.yaw = rigLockYaw;
    // re-snap the camera to the angled composition (rig.update eased it back)
    rig.smooth.set(
      car.pos.x - Math.sin(rigLockYaw) * Math.cos(rig.pitch) * rig.dist,
      Math.sin(rig.pitch) * rig.dist + 1.6,
      car.pos.z - Math.cos(rigLockYaw) * Math.cos(rig.pitch) * rig.dist,
    );
    camera.position.copy(rig.smooth);
    camera.lookAt(car.pos.x, 1.7, car.pos.z);
  }
  updateHUD(playerFocus());
}

const debug = {
  startGame: (fromSave = false) => startGame(fromSave),
  state: () => ({
    state, money, time,
    wanted: police.wanted, stars: police.stars, units: police.units.length, busted: police.busted,
    inCar: !!currentCar, carHealth: currentCar?.health ?? null,
    player: { x: player.pos.x, z: player.pos.z, health: player.health },
    mission: missions.debugState(),
    hasSave: hasSave(),
  }),
  teleport(x, z) { const f = playerFocus(); f.pos.set(x, 0, z); if (currentCar) { currentCar.mesh.position.copy(currentCar.pos); } rig.init = false; },
  startMission(i) { missions.debugStart(i); },
  setWanted(n) { police.setWanted(n); },
  enterNearest() { const c = nearestCar(); if (c) { enterCar(c); return true; } return false; },
  exitCar: () => exitCar(),
  shoot: () => tryShoot(),
  pressE: () => toggleCar(),
  save: () => persist(),
  damagePlayer(n) { player.damage(n); if (player.dead) doWasted(); },
  setCarSpeed(n) { if (currentCar) currentCar.speed = n; },
  missionCars: () => missions.missionCars().map((c) => ({ x: c.pos.x, z: c.pos.z, style: c.style })),
  parkedNear(x, z, r) { return parkedCars.filter((c) => Math.hypot(c.pos.x - x, c.pos.z - z) < r).length; },
};
window.__game = { debug, ready: false };

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- main loop ----------
const clock = new THREE.Clock();
let frames = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  if (state !== 'paused' && state !== 'busted' && state !== 'wasted') update(dt);
  else if (state === 'paused') { /* frozen */ }
  renderer.render(scene, camera);
  frames++;
  if (SHOT && frames === 6) window.__game.ready = true;
}
if (SHOT) stageShot(SHOT);
loop();
