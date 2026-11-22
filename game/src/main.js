// main.js — Palmshade City: boot, game state, camera, input, crimes, HUD, staging.
import * as THREE from 'three';
import { buildCity, updateCity, landmarks, packageSpots } from './city.js';
import { Player } from './player.js';
import { createCar, cars, spawnParkedCars, flashLights, setExplosionHandler } from './vehicles.js';
import { createBoat } from './boats.js';
import { Traffic } from './traffic.js';
import { Peds } from './peds.js';
import { Police } from './police.js';
import { Missions, MARISOL, DARIO } from './missions.js';
import { Activities } from './activities.js';
import { Combat } from './combat.js';
import { Crew } from './crew.js';
import { Garage, BAY as GARAGE_BAY } from './garage.js';
import { Collectibles } from './collectibles.js';
import { Minimap } from './minimap.js';
import { loadSave, writeSave } from './save.js';
import { audio } from './audio.js';
import { clamp, wrapAngle, angleLerp, dist2d } from './util.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const STATIONS = [
  { name: '☉ ONDA 96.4 — Coral Drive', track: '“Neon Tide” — The Shorelines' },
  { name: 'BRISA 101.1 — Sunset FM', track: '“Golden Hour Static” — Mar Azul' },
  { name: 'NOCTURNA 88.7 — After Dark', track: '“Salt & Smoke” — DJ Faros' },
];
const RANKS = ['RUNNER', 'COURIER', 'WHEELMAN', 'FIXER', 'SHOT CALLER', 'KINGPIN'];

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.domElement.className = 'game';
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 1600);
camera.position.set(120, 16, 30);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
buildCity(scene);

// ---------- game object ----------
const G = {
  state: { mode: 'menu', money: 0, missionsCompleted: 0, missionIndex: 0, chainFinished: false, packages: new Set() },
  wanted: 0, bustedMeter: 0, rewardMul: 1, time: 0, timeScale: 1,
  currentCar: null, lastCrimeT: -99, crimeCd: {}, fireT: 0, weapon: 2,
  station: 0, rpT: 0, saveT: 0, camYaw: -2.2, camPitch: 0.32, mouseSeen: -99,
  dlgQueue: [], dlgT: 0, notifyT: 0, started: false, shotSpeedo: null, _carDead: false,
  // v9: garage profile, district standing, stats, camera shake
  upgrades: { engine: 0, armor: 0, nitro: 0 },
  standing: { beach: 0, centro: 0, west: 0 },
  stats: { carjacks: 0 },
  shake: 0,
  scene, landmarks,
};
G.inCar = () => !!G.currentCar;
G.inBoat = () => !!G.currentCar && G.currentCar.type === 'boat';
G.entityPos = () => G.currentCar
  ? { x: G.currentCar.group.position.x, y: 0, z: G.currentCar.group.position.z }
  : { x: player.pos.x, y: player.y, z: player.pos.z };
G.entitySpeed = () => G.currentCar ? G.currentCar.speed : player.speedNow;
G.addMoney = n => { G.state.money += n; };
G.setWanted = n => { G.wanted = clamp(n, 0, 5); G.lastCrimeT = G.time; };
G.dialogue = (speaker, lines) => { for (const text of lines) G.dlgQueue.push({ speaker, text }); };
G.notify = text => { const el = $('notify'); el.textContent = text; el.classList.remove('hidden'); G.notifyT = 2.8; };
G.sfx = name => {
  if (name === 'chime') audio.chime();
  else if (name === 'jingle') audio.jingle();
  else if (name === 'shot') audio.shot();
  else if (name === 'talk') audio.uiClick();
  else if (name === 'siren') audio.setSiren(true);
};
G.saveGame = () => {
  if (!missions) return;
  writeSave({
    money: G.state.money, missionIndex: missions.index,
    packages: [...G.state.packages], pos: { x: player.pos.x, z: player.pos.z },
    finished: G.state.chainFinished,
    upgrades: G.upgrades, standing: G.standing, stats: G.stats,
    crew: crew ? crew.recruitedNames() : [],
  });
};
// districts: Brisa Beach (east shore), Centro (middle), Westside (warehouse side)
G.districtAt = x => x >= 120 ? 'beach' : x <= -60 ? 'west' : 'centro';
G.earnStanding = (x, z, n) => {
  const d = G.districtAt(x);
  G.standing[d] = clamp(G.standing[d] + n, 0, 100);
};
G.applyUpgrades = car => {
  if (!car || car.type === 'boat') return;
  const u = G.upgrades;
  car.topMul = 1 + 0.08 * u.engine;
  car.accMul = 1 + 0.09 * u.engine;
  car.armorMul = 1 / (1 + 0.5 * u.armor);
  car.nitroLvl = u.nitro;
};

// ---------- world actors ----------
const player = new Player(scene);
G.player = player;
const vanCar = createCar(scene, 'van', landmarks.vanSpawn.x, landmarks.vanSpawn.z, landmarks.vanSpawn.heading, 0xd9a441);
vanCar.driver = 'mission';
G.vanCar = vanCar;
const boat = createBoat(scene, landmarks.boatDock.x, landmarks.boatDock.z, Math.PI / 2);
G.boat = boat;
spawnParkedCars(scene);
const traffic = new Traffic(scene, 13);
const peds = new Peds(scene, 34);
const police = new Police(scene);
const combat = new Combat(scene);
G.combat = combat;
const crew = new Crew(G, peds, combat, police);
G.crew = crew;
const garage = new Garage(G);
G.garage = garage;
// explosions: splash damage, chain reactions, crew caught in the blast,
// and the player is thrown clear of their own burning ride
setExplosionHandler(car => {
  const p = car.group.position;
  G.shake = Math.max(G.shake, 0.7);
  audio.crash(1);
  for (const other of cars) {
    if (other === car || other.exploded) continue;
    const o = other.group.position;
    const d = dist2d(o.x, o.z, p.x, p.z);
    if (d < 8) {
      other.hurt(58 * (1 - d / 10));
      other.spin += (Math.random() < 0.5 ? -1 : 1) * 1.4;
      if (other.driver === 'traffic') other.driver = 'parked'; // driver bails
    }
  }
  for (const ped of peds.list) {
    if (ped.state !== 'down' && dist2d(ped.group.position.x, ped.group.position.z, p.x, p.z) < 6) peds.hit(ped);
  }
  crew.damageNear({ x: p.x, z: p.z }, 6.5, 42);
  if (car === G.currentCar && G.inCar()) {
    player.damage(38);
    audio.hurt();
    exitCar();
    G.notify('💥 Your ride blew up!');
  }
  if (car.driver === 'traffic') car.driver = 'parked';
});
const minimap = new Minimap($('minimap'));
const activities = new Activities(G, peds);
G.activities = activities;
let missions = null, collectibles = null;

// ---------- crimes & wanted ----------
function witnessed(x, z, r = 30) {
  if (peds.witness(x, z, r)) return true;
  for (const u of traffic.units) {
    const p = u.car.group.position;
    if (dist2d(p.x, p.z, x, z) < r * 0.8) return true;
  }
  return police.nearestDist({ x, z }) < 46;
}
function crime(kind, x, z) {
  const cd = { theft: 4, hitCar: 2.5, hitPed: 3, shot: 1.2 }[kind] || 2;
  if (G.time - (G.crimeCd[kind] || -99) < cd) return;
  const radius = kind === 'shot' ? 44 : 30;
  if (!witnessed(x, z, radius)) return;
  G.crimeCd[kind] = G.time;
  const stars = kind === 'hitPed' ? 2 : 1;
  G.wanted = clamp(G.wanted + stars, 0, 5);
  G.lastCrimeT = G.time;
  police.ensure(G.wanted, G.entityPos());
  if (G.wanted >= 3) G.notify('The Palmshade PD is on you!');
}

// ---------- interaction ----------
function nearestCar(maxD = 3.6) {
  let best = null, bd = maxD;
  for (const c of cars) {
    if (c === G.currentCar) continue;
    const p = c.group.position;
    const d = dist2d(p.x, p.z, player.pos.x, player.pos.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function enterCar(car) {
  G.currentCar = car;
  G._carDead = false;
  if (car.driver === 'traffic') {
    // CARJACKING: the driver is dumped at the kerb and runs for it
    peds.ejectDriver(car.group.position.x, car.group.position.z);
    G.stats.carjacks++;
    G.notify('🚗 Carjacked!');
    crime('theft', car.group.position.x, car.group.position.z);
    G.saveGame();
  } else if (car.driver === 'parked') { crime('theft', car.group.position.x, car.group.position.z); }
  if (car.driver !== 'mission') car.driver = 'player';
  G.applyUpgrades(car);
  player.group.visible = false;
  audio.setEngine(true, 0);
  if (missions) missions.onEnterCar(car);
}
function exitCar() {
  const car = G.currentCar; if (!car) return;
  const p = car.group.position;
  if (car.type === 'boat') {
    // step off onto the marina dock, never into the water
    player.teleport(250, 0, -Math.PI / 2);
    G.notify('Back on dry land.');
  } else {
    const rx = Math.cos(car.heading), rz = -Math.sin(car.heading);
    player.teleport(p.x + rx * 2.4, p.z + rz * 2.4, car.heading);
  }
  player.group.visible = true;
  if (car.driver === 'player') car.driver = car.type === 'boat' ? 'boat' : 'parked';
  G.currentCar = null;
  audio.setEngine(false, 0);
}
function doInteract() {
  if (G.state.mode !== 'playing') return;
  if (G.inCar()) {
    // at the Palmshade Customs bay, E opens the upgrade shop instead of exiting
    if (!G.inBoat() && garage.near(G.currentCar.group.position)) { garage.open(); return; }
    exitCar(); return;
  }
  const downed = crew.nearestDowned(player.pos);
  if (downed) { crew.revive(downed); return; }
  const recruit = crew.nearestRecruitable(player.pos);
  if (recruit) { crew.recruit(recruit); return; }
  if (missions && missions.interact()) return;
  const bp = boat.group.position;
  if (dist2d(bp.x, bp.z, player.pos.x, player.pos.z) < 7.5) { enterCar(boat); return; }
  const c = nearestCar();
  if (c) enterCar(c);
}

// ---------- busted / wasted ----------
function respawnAtPD() {
  if (G.inCar()) { const c = G.currentCar; G.currentCar = null; if (c.driver === 'player') c.driver = 'parked'; }
  player.group.visible = true;
  player.teleport(landmarks.respawn.x, landmarks.respawn.z, landmarks.respawn.heading);
  player.health = player.maxHealth; player.dead = false;
  G.wanted = 0; G.bustedMeter = 0;
  police.clearAll();
  audio.setEngine(false, 0); audio.setSiren(false);
}
function doBusted() {
  const fine = Math.min(G.state.money, 150 + G.wanted * 75);
  G.state.money -= fine;
  G.state.mode = 'busted';
  $('bustedText').textContent = `The Palmshade PD got you — $${fine} in fines and fees. Marisol will hear about this.`;
  $('bustedScreen').classList.remove('hidden');
  audio.busted(); audio.setSiren(false); audio.setEngine(false, 0);
  if (document.exitPointerLock) document.exitPointerLock();
}
function doWasted() {
  const fee = Math.min(G.state.money, 200);
  G.state.money -= fee;
  G.state.mode = 'wasted';
  $('wastedText').textContent = `You wake up outside Palmshade PD, $${fee} lighter. The beach keeps spinning for a while.`;
  $('wastedScreen').classList.remove('hidden');
  audio.setEngine(false, 0); audio.setSiren(false);
  if (document.exitPointerLock) document.exitPointerLock();
}

// ---------- start / save ----------
function startGame(fromSave) {
  const save = fromSave ? loadSave() : null;
  if (save) {
    G.state.money = save.money;
    G.state.missionIndex = save.missionIndex;
    G.state.chainFinished = save.finished;
    G.state.missionsCompleted = save.finished ? 10 : save.missionIndex;
    G.rewardMul = save.finished ? 1.5 : 1;
    G.state.packages = new Set(save.packages);
    G.upgrades = save.upgrades;
    G.standing = save.standing;
    G.stats = save.stats;
    crew.restore(save.crew);
  }
  if (!missions) missions = new Missions(G);
  if (!collectibles) {
    collectibles = new Collectibles(scene, packageSpots, [...G.state.packages], id => {
      G.state.packages.add(id);
      G.addMoney(100);
      G.earnStanding(packageSpots[id].x, packageSpots[id].z, 4);
      G.notify(`📦 Package ${G.state.packages.size}/20 — +$100`);
      audio.chime();
      G.saveGame();
    });
  }
  if (save && save.pos) player.teleport(save.pos.x, save.pos.z);
  G.state.mode = 'playing'; G.started = true;
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  audio.unlock();
  if (save) G.notify('Welcome back to Palmshade City');
}
let lastCollectedId = 0;
$('btnPlay').onclick = () => { audio.uiClick(); startGame(false); };
$('btnContinue').onclick = () => { audio.uiClick(); startGame(true); };
if (loadSave()) $('btnContinue').classList.remove('hidden');
$('btnResume').onclick = () => { $('pauseMenu').classList.add('hidden'); G.state.mode = 'playing'; };
$('btnRespawn').onclick = () => { $('pauseMenu').classList.add('hidden'); respawnAtPD(); G.state.mode = 'playing'; };
$('btnBustedOk').onclick = () => { $('bustedScreen').classList.add('hidden'); respawnAtPD(); G.state.mode = 'playing'; };
$('btnWastedOk').onclick = () => { $('wastedScreen').classList.add('hidden'); respawnAtPD(); G.state.mode = 'playing'; };
function pauseGame() {
  if (G.state.mode !== 'playing') return;
  G.state.mode = 'paused';
  $('stand-beach').style.width = G.standing.beach + '%';
  $('stand-centro').style.width = G.standing.centro + '%';
  $('stand-west').style.width = G.standing.west + '%';
  $('pauseStats').textContent = `Carjacks: ${G.stats.carjacks} · Missions done: ${G.state.missionsCompleted} · Packages: ${G.state.packages.size}/20 · Crew: ${crew.recruitedNames().length}/2`;
  $('pauseMenu').classList.remove('hidden');
  G.saveGame();
  if (document.exitPointerLock) document.exitPointerLock();
}

// ---------- input ----------
const keys = new Set();
let mouseDown = false, lastMX = 0, lastMY = 0;
addEventListener('keydown', e => {
  if (e.repeat) return;
  keys.add(e.code);
  audio.unlock();
  if (G.state.mode === 'playing') {
    if (e.code === 'KeyE') doInteract();
    if (e.code === 'KeyG' && !G.inCar()) crew.callPickup();
    if (e.code === 'KeyP' || e.code === 'Escape') pauseGame();
    if (e.code === 'KeyR' && G.inCar()) cycleStation();
    if (e.code === 'Digit1') setWeapon(1);
    if (e.code === 'Digit2') setWeapon(2);
    if (e.code === 'Digit3') setWeapon(3);
  } else if (G.state.mode === 'garage' && (e.code === 'Escape' || e.code === 'KeyE')) {
    garage.close();
  } else if (G.state.mode === 'paused' && (e.code === 'KeyP' || e.code === 'Escape')) {
    $('pauseMenu').classList.add('hidden'); G.state.mode = 'playing';
  }
});
addEventListener('keyup', e => keys.delete(e.code));
renderer.domElement.addEventListener('mousedown', e => {
  mouseDown = true; lastMX = e.clientX; lastMY = e.clientY;
  audio.unlock();
  if (G.state.mode === 'playing' && !document.pointerLockElement) {
    if (renderer.domElement.requestPointerLock) renderer.domElement.requestPointerLock();
  }
});
addEventListener('mouseup', () => mouseDown = false);
addEventListener('mousemove', e => {
  if (G.state.mode !== 'playing') return;
  let dx = 0, dy = 0;
  if (document.pointerLockElement) { dx = e.movementX; dy = e.movementY; }
  else if (mouseDown) { dx = e.clientX - lastMX; dy = e.clientY - lastMY; lastMX = e.clientX; lastMY = e.clientY; }
  else return;
  G.camYaw -= dx * 0.0032;
  G.camPitch = clamp(G.camPitch + dy * 0.0028, -0.12, 0.95);
  G.mouseSeen = G.time;
});
function setWeapon(n) {
  G.weapon = n;
  document.querySelectorAll('.ws').forEach(el => {
    el.classList.toggle('active', +el.dataset.slot === n);
  });
}
function cycleStation() {
  G.station = (G.station + 1) % STATIONS.length;
  audio.setStation(G.station);
  const s = STATIONS[G.station];
  $('radioStation').textContent = s.name;
  $('radioTrack').textContent = s.track;
  G.notify('📻 ' + s.name);
}

// ---------- shooting ----------
function shoot() {
  const smg = G.weapon === 3;
  const dir = camera.getWorldDirection(new THREE.Vector3());
  const muzzle = camera.position.clone().addScaledVector(dir, 1.1);
  muzzle.y -= 0.12;
  audio.shot();
  const ep = G.entityPos();
  peds.scare(ep.x, ep.z, 30);
  combat.targets.length = 0;
  for (const p of peds.list) combat.register(p.group, 'ped', p);
  for (const c of cars) combat.register(c.group, 'car', c);
  for (const h of combat.hostiles) if (!h.dead) combat.register(h.group, 'hostile', h);
  const ndc = smg ? { x: (Math.random() - 0.5) * 0.085, y: (Math.random() - 0.5) * 0.085 } : null;
  combat.tryShoot(camera, muzzle, {
    ped: (ped) => { peds.hit(ped, 100); crime('hitPed', ep.x, ep.z); },
    car: (car) => {
      car.hurt(smg ? 8 : 14);
      if (car.type === 'police') { G.wanted = clamp(G.wanted + 1, 0, 5); G.lastCrimeT = G.time; police.ensure(G.wanted, ep); }
      else crime('shot', ep.x, ep.z);
    },
    hostile: (h) => { combat.damageHostile(h, smg ? 17 : 34); if (h.dead) G.notify('Breakwater Boy down'); },
    miss: () => crime('shot', ep.x, ep.z),
  }, ndc);
}

// ---------- HUD ----------
function renderResponsePanel() {
  const list = police.panelList(G.entityPos());
  const el = $('responseList');
  if (!list.length) el.innerHTML = '<div class="rp-none">No units responding</div>';
  else el.innerHTML = list.map(u => {
    const cls = u.role === 'RAM' ? 'ramming' : u.role === 'PIT' ? 'pit' : u.role === 'ROADBLOCK' ? 'roadblock' : u.role === 'AIR UNIT' ? 'air' : 'pursuit';
    return `<div class="rp-row"><span class="rp-call">${u.callsign}</span><span class="chip ${cls}">${u.role}</span><span class="rp-dist">${Math.round(u.dist)}m</span></div>`;
  }).join('');
  const threat = $('rpThreat');
  threat.textContent = G.wanted === 0 ? 'CLEAR' : G.wanted <= 2 ? 'TRACKING' : G.wanted === 3 ? 'PURSUIT' : 'FULL RESPONSE';
  threat.style.color = G.wanted === 0 ? '#7ddf7d' : G.wanted <= 2 ? '#ffd23e' : '#ff5f4a';
}
let lastStars = -1;
function updateHUD(dt) {
  $('money').textContent = '$' + G.state.money;
  if (G.wanted !== lastStars) {
    lastStars = G.wanted;
    $('stars').innerHTML = '★'.repeat(G.wanted) + '<span class="off">' + '★'.repeat(5 - G.wanted) + '</span>';
  }
  $('packages').textContent = `📦 ${G.state.packages.size} / 20 packages`;
  $('healthFill').style.width = clamp(player.health, 0, 100) + '%';
  $('vehicleWrap').style.display = G.inCar() ? '' : 'none';
  if (G.inCar()) $('vehicleFill').style.width = clamp(G.currentCar.health, 0, 100) + '%';
  const done = G.state.missionsCompleted;
  $('respectRank').textContent = RANKS[Math.min(done, 5)];
  $('respectFill').style.width = clamp((done * 10 + G.state.packages.size) / 120 * 100, 0, 100) + '%';
  $('speedVal').textContent = G.shotSpeedo !== null ? G.shotSpeedo : Math.round(Math.abs(G.entitySpeed()) * 2.24);
  if (missions) {
    $('missionTitle').textContent = missions.mission().title + (G.state.chainFinished ? ' · REPLAY ×1.5' : '');
    $('objectiveText').textContent = missions.objectiveText();
  }
  $('radioCard').classList.toggle('muted', !G.inCar());
  let prompt = '';
  if (G.state.mode === 'playing' && !SHOT) {
    if (G.inCar()) {
      if (!G.inBoat() && garage.near(G.currentCar.group.position)) prompt = '<b>E</b> — Palmshade Customs · upgrades & repair';
      else if (Math.abs(G.currentCar.speed) < 2.5) prompt = G.inBoat() ? '<b>E</b> — Step off at the dock' : '<b>E</b> — Exit vehicle';
    }
    else if (crew.nearestDowned(player.pos)) prompt = `<b>E</b> — Revive ${crew.nearestDowned(player.pos).name}`;
    else if (crew.nearestRecruitable(player.pos)) prompt = `<b>E</b> — Recruit ${crew.nearestRecruitable(player.pos).name} to your crew`;
    else if (missions && missions.step() && missions.step().type === 'talk' && missions.talkTarget() &&
      dist2d(player.pos.x, player.pos.z, missions.talkTarget().x, missions.talkTarget().z) < 3.6) {
      prompt = missions.step().who === 'dario' ? '<b>E</b> — Talk to Captain Dario' : '<b>E</b> — Talk to Marisol';
    }
    else if (dist2d(boat.group.position.x, boat.group.position.z, player.pos.x, player.pos.z) < 7.5) prompt = '<b>E</b> — Board the “Brisa”';
    else { const c = nearestCar(); if (c) prompt = `<b>E</b> — Enter ${c.type}`; }
  }
  const pr = $('prompt');
  if (prompt) { pr.innerHTML = prompt; pr.classList.remove('hidden'); } else pr.classList.add('hidden');
  const bw = $('bustedWrap');
  if (G.bustedMeter > 0.02 && G.state.mode === 'playing') {
    bw.classList.remove('hidden');
    $('bustedFill').style.width = (G.bustedMeter * 100) + '%';
  } else bw.classList.add('hidden');
  const dlg = $('dialogue');
  if (G.dlgT > 0) {
    G.dlgT -= dt;
    if (G.dlgT <= 0) dlg.classList.add('hidden');
  } else if (G.dlgQueue.length) {
    const { speaker, text } = G.dlgQueue.shift();
    $('dlgPortrait').textContent = speaker.initial;
    $('dlgPortrait').style.background = speaker.color;
    $('dlgName').innerHTML = `${speaker.name} <span>· ${speaker.role}</span>`;
    $('dlgText').textContent = text.replace(/^[^:]{1,24}:\s*/, '');
    dlg.classList.remove('hidden');
    G.dlgT = 2.4 + text.length * 0.03;
  }
  if (G.notifyT > 0) { G.notifyT -= dt; if (G.notifyT <= 0) $('notify').classList.add('hidden'); }
  G.rpT -= dt;
  if (G.rpT <= 0) { G.rpT = 0.25; renderResponsePanel(); crew.renderPanel(); }
}

// ---------- per-frame updates ----------
function updatePlaying(dt) {
  const ep = G.entityPos();
  if (G.inCar()) {
    const car = G.currentCar;
    const throttle = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + (keys.has('KeyS') || keys.has('ArrowDown') ? -1 : 0);
    const steer = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) + (keys.has('KeyA') || keys.has('ArrowLeft') ? -1 : 0);
    car.boosting = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && G.upgrades.nitro > 0;
    car.update(dt, throttle, steer);
    if (keys.has('Space')) car.speed -= car.speed * 2.6 * dt;
    player.group.position.copy(car.group.position);
    if (G.time - G.mouseSeen > 2.5 && Math.abs(car.speed) > 3) {
      G.camYaw = angleLerp(G.camYaw, car.heading, Math.min(1, dt * 1.6));
    }
    audio.setEngine(true, Math.abs(car.speed) / car.spec.maxSpeed);
  } else {
    const f = { x: Math.sin(G.camYaw), z: Math.cos(G.camYaw) };
    const r = { x: f.z, z: -f.x };
    let mx = 0, mz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) { mx += f.x; mz += f.z; }
    if (keys.has('KeyS') || keys.has('ArrowDown')) { mx -= f.x; mz -= f.z; }
    if (keys.has('KeyD') || keys.has('ArrowRight')) { mx += r.x; mz += r.z; }
    if (keys.has('KeyA') || keys.has('ArrowLeft')) { mx -= r.x; mz -= r.z; }
    player.update(dt, mx, mz, keys.has('ShiftLeft') || keys.has('ShiftRight'));
    audio.setEngine(false, 0);
    if (mouseDown && G.weapon >= 2) {
      G.fireT -= dt;
      if (G.fireT <= 0) { G.fireT = G.weapon === 3 ? 0.085 : 0.17; shoot(); }
    } else G.fireT = 0;
  }
  $('crosshair').classList.toggle('hidden', !(G.weapon >= 2 && !G.inCar()));
  const dangers = cars.filter(c => Math.abs(c.speed) > 6).map(c => ({ x: c.group.position.x, z: c.group.position.z, speed: c.speed }));
  traffic.update(dt, ep, cars);
  peds.update(dt, dangers);
  for (const c of cars) {
    if ((c.driver === 'parked' || c.driver === 'mission') && c !== G.currentCar) c.update(dt, 0, 0);
    if (c.type === 'police' && c.driver === 'parked') flashLights(c, G.time);
  }
  police.update(dt, {
    playerPos: G.entityPos(), playerHeading: G.inCar() ? G.currentCar.heading : player.heading,
    playerSpeed: G.entitySpeed(), inCar: G.inCar(), wanted: G.wanted,
    playerCar: G.currentCar,
    onSpike: () => {
      if (G.currentCar) {
        G.currentCar.tiresFlat = 6;
        G.notify('🛞 Spike strip — tires shredded!');
        audio.crash(0.5);
      }
    },
    onShoot: () => {
      // a crew member on foot nearby sometimes catches the round instead
      const m = crew.nearestOnFoot(G.entityPos(), 6);
      if (m && Math.random() < 0.3) { crew.damage(m, 6); return; }
      if (G.inCar()) {
        G.currentCar.hurt(5);
        if (G.currentCar.health <= 0 && !G._carDead) { G._carDead = true; G.notify('Your ride is wrecked!'); }
      } else { player.damage(4.5); audio.hurt(); }
    },
  });
  if (G.wanted > 0) police.ensure(G.wanted, G.entityPos());
  audio.setSiren(G.wanted > 0 && police.nearestDist(G.entityPos()) < 55);
  if (missions) missions.update(dt, G.time);
  activities.update(dt, G.time);
  crew.update(dt);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 1.5);
  if (G.currentCar !== boat) boat.update(dt, 0, 0);
  if (collectibles) collectibles.update(dt, ep.x, G.inCar() ? 0 : player.y, ep.z, G.time);
  combat.update(dt, {
    playerPos: { x: player.pos.x, z: player.pos.z },
    onPlayerShot: dmg => { if (!G.inCar()) { player.damage(dmg); audio.hurt(); } },
  });
  if (G.inCar()) {
    const car = G.currentCar, cp = car.group.position;
    if (Math.abs(car.speed) > 3.5) {
      for (const ped of peds.list) {
        const q = ped.group.position;
        if (ped.state !== 'down' && dist2d(cp.x, cp.z, q.x, q.z) < 1.9) {
          peds.hit(ped, 30); car.speed *= 0.5; audio.crash(0.5);
          crime('hitPed', cp.x, cp.z);
        }
      }
      for (const other of cars) {
        if (other === car || other.hitCooldown > 0) continue;
        const o = other.group.position;
        if (dist2d(cp.x, cp.z, o.x, o.z) < (car.radius + other.radius) * 0.72) {
          other.hitCooldown = 1.6; car.hitCooldown = 1.6;
          other.hurt(9); car.hurt(6);
          other.speed = car.speed * 0.35; car.speed *= 0.35;
          audio.crash(0.8);
          crime('hitCar', cp.x, cp.z);
        }
      }
    }
  }
  const spd = Math.abs(G.entitySpeed());
  const near = police.countNear(G.entityPos(), 13);
  if (G.wanted > 0 && near > 0 && spd < 3.2) G.bustedMeter += dt * (near >= 2 ? 0.8 : 0.5);
  else G.bustedMeter = Math.max(0, G.bustedMeter - dt * 0.25);
  if (G.bustedMeter >= 1) { doBusted(); return; }
  if (G.wanted > 0 && G.time - G.lastCrimeT > 16 && police.nearestDist(G.entityPos()) > 55) {
    G.setWanted(G.wanted - 1);
    if (G.wanted === 0) { police.clearAll(); G.notify('You lost the heat.'); }
  }
  if (player.dead) { doWasted(); return; }
  G.saveT -= dt;
  if (G.saveT <= 0) { G.saveT = 12; G.saveGame(); }
}

// ---------- camera ----------
function updateCamera() {
  if (G.state.mode === 'menu') {
    const t = G.time * 0.07;
    camera.position.set(150 + Math.cos(t) * 55, 17 + Math.sin(G.time * 0.16) * 3, -25 + Math.sin(t) * 55);
    camera.lookAt(150, 3, -28);
    return;
  }
  if (SHOT && G.shotCam) {
    camera.position.copy(G.shotCam.pos);
    camera.lookAt(G.shotCam.look);
    return;
  }
  const ep = G.entityPos();
  const dist = G.inCar() ? 10.5 : 7.2;
  const fx = Math.sin(G.camYaw) * Math.cos(G.camPitch);
  const fy = Math.sin(G.camPitch);
  const fz = Math.cos(G.camYaw) * Math.cos(G.camPitch);
  const ty = ep.y + (G.inCar() ? 2.1 : 1.7);
  camera.position.set(ep.x - fx * dist, Math.max(0.7, ty - fy * dist + 1.2), ep.z - fz * dist);
  if (G.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * G.shake * 0.9;
    camera.position.y += (Math.random() - 0.5) * G.shake * 0.6;
  }
  camera.lookAt(ep.x + fx * 6, ty + 0.4, ep.z + fz * 6);
}

// ---------- shot staging ----------
function stageShot(name) {
  startGame(false);
  traffic.enabled = false;
  audio.setMuted(true);
  // a lived-in profile for the HUD: cash, tuning, standing
  G.state.money = 2450;
  G.upgrades = { engine: 2, armor: 1, nitro: 1 };
  G.standing = { beach: 64, centro: 38, west: 21 };
  // ---- shot-only lighting: bright golden-hour grade, no black silhouettes ----
  renderer.toneMappingExposure = 1.34;
  scene.traverse(o => {
    if (o.isHemisphereLight) o.intensity = 1.35;
    else if (o.isDirectionalLight) o.intensity *= 1.15;
  });
  scene.add(new THREE.AmbientLight(0xffd9a8, 0.55));
  const bounce = new THREE.DirectionalLight(0xffe7c4, 0.75); // warm fill off the ocean side
  bounce.position.set(420, 150, 80);
  scene.add(bounce); scene.add(bounce.target);
  const heroAt = (car, x, z, h) => { car.group.position.set(x, 0, z); car.heading = h; car.group.rotation.y = h; return car; };
  const extraCar = (type, x, z, h, color) => { heroAt(createCar(scene, type, x, z, h, color), x, z, h).driver = 'parked'; };
  const placePed = (i, x, z, h) => {
    const p = peds.list[i]; if (!p) return;
    p.x = x; p.z = z; p.tx = x; p.tz = z; p.state = 'stroll';
    p.fig.position.set(x, 0, z); p.fig.rotation.set(0, h, 0);
  };
  if (name === 'cover') {
    // Beachfront boulevard (x=180), hero northbound, police flanking close.
    const hero = heroAt(createCar(scene, 'sport', 180, -18, Math.PI, 0xd23b2e), 180, -18, Math.PI);
    hero.driver = 'player'; G.currentCar = hero; player.group.visible = false;
    heroAt(createCar(scene, 'police', 175.6, -15.9, Math.PI - 0.22), 175.6, -15.9, Math.PI - 0.22).driver = 'parked';
    heroAt(createCar(scene, 'police', 184.6, -16.3, Math.PI + 0.18), 184.6, -16.3, Math.PI + 0.18).driver = 'parked';
    extraCar('sedan', 186.5, -48, 0, 0x2ea6a0);
    extraCar('sport', 174.5, -64, Math.PI, 0xf2b035);
    extraCar('pickup', 186.5, -82, 0, 0x7a4fd0);
    extraCar('convertible', 186.5, 6, 0, 0x53a06b);
    extraCar('van', 174.5, -100, Math.PI, 0xe8e4da);
    placePed(3, 190.5, -52, -Math.PI / 2);
    placePed(4, 170.5, -58, 0.9);
    placePed(5, 190.5, 2, Math.PI / 2);
    placePed(0, 190.5, -27, -Math.PI / 2);
    placePed(1, 190.5, -11, Math.PI / 2);
    placePed(2, 170.5, -36, 0.4);
    crew.stageAt(hero); // Vex & Tito flanking the hero car
    G.wanted = 3; G.shotSpeedo = 66;
    const pu1 = police.spawnUnit({ x: 180, z: -18 }); pu1.callsign = 'PIT-1'; pu1.pit = true; pu1.role = 'PIT';
    const pu2 = police.spawnUnit({ x: 180, z: -18 }); pu2.role = 'PURSUIT';
    police.setHeliForced(true, { x: 180, z: -18 });
    if (police.heli) { police.heli.group.position.set(190, 17, -34); police.heli.group.lookAt(180, 0, -18); }
    G.shotCam = { pos: new THREE.Vector3(177.4, 2.5, -12.6), look: new THREE.Vector3(180.2, 1.0, -18.4) };
  } else if (name === 'foot') {
    player.teleport(170.5, -20, -1.2);
    extraCar('sedan', 186, -28, 0.05, 0x3f9be0);
    extraCar('sport', 180.5, -42, Math.PI, 0xe14b8a);
    extraCar('pickup', 186.5, -58, 0, 0x7a4fd0);
    extraCar('convertible', 174.5, -6, Math.PI, 0x53a06b);
    extraCar('van', 186.5, 8, 0, 0xe8e4da);
    placePed(0, 173.5, -24.5, 2.6);
    placePed(1, 168.2, -15.2, -0.6);
    placePed(2, 172.8, -12.8, 3.0);
    placePed(3, 190, -26, -Math.PI / 2);
    placePed(4, 190.5, -44, -Math.PI / 2);
    placePed(5, 169.5, -32, 1.1);
    placePed(6, 190.5, -8, Math.PI / 2);
    placePed(7, 171.5, -48, -0.4);
    G.shotCam = { pos: new THREE.Vector3(175.6, 2.0, -16.2), look: new THREE.Vector3(169.6, 1.25, -20.8) };
  } else if (name === 'mission') {
    vanCar.group.position.set(169, 0, -43); vanCar.heading = 0.35; vanCar.group.rotation.y = 0.35;
    G.currentCar = vanCar; player.group.visible = false;
    if (missions) { missions.stepIdx = 2; missions._enterStep(); }
    G.dialogue(MARISOL, ['Marisol: "Take my van and get these pastries to the kiosk on 3rd & Palm. And drive like you mean it."']);
    extraCar('sedan', 186, -52, 0, 0x2ea6a0);
    placePed(0, 160, -33, 0.8);
    placePed(1, 164.5, -27.5, -2.2);
    placePed(2, 190, -44, -Math.PI / 2);
    G.shotCam = { pos: new THREE.Vector3(177.5, 2.5, -51.5), look: new THREE.Vector3(168, 1.2, -42) };
  } else if (name === 'garage') {
    // Inside Palmshade Customs: hero car on the bay, upgrade menu open, cash up.
    const hero = heroAt(createCar(scene, 'sport', GARAGE_BAY.x, GARAGE_BAY.z, -Math.PI / 2, 0xd23b2e), GARAGE_BAY.x, GARAGE_BAY.z, -Math.PI / 2);
    hero.driver = 'player'; G.currentCar = hero; player.group.visible = false;
    G.applyUpgrades(hero);
    extraCar('sedan', 82, 84, Math.PI / 2, 0x2ea6a0);
    extraCar('pickup', 98, 96, -Math.PI / 2, 0x7a4fd0);
    garage.open();
    G.shotCam = { pos: new THREE.Vector3(99.5, 2.6, 99), look: new THREE.Vector3(88, 1.1, 85) };
  } else if (name === 'boat') {
    // The Brisa at speed off the marina, city skyline behind her.
    boat.group.position.set(301, -0.12, 39);
    boat.heading = -2.25; boat.group.rotation.y = -2.25;
    boat.driver = 'player'; G.currentCar = boat; player.group.visible = false;
    boat.speed = 13;
    for (let i = 0; i < 7; i++) boat.update(0.13, 1, 0); // lay a foam wake behind her
    if (missions) { missions.index = 7; missions.stepIdx = 2; missions._enterStep(); }
    G.dialogue(DARIO, ['Dario: "Easy on the throttle past the pier — run it out past the south buoy, and bring my Brisa home."']);
    placePed(0, 240, -14, Math.PI / 2);
    placePed(1, 238, 12, -0.5);
    placePed(2, 246, 26, -1.2);
    placePed(3, 232, -28, 0.6);
    G.shotSpeedo = 21;
    G.shotCam = { pos: new THREE.Vector3(308, 4.2, 46), look: new THREE.Vector3(289, 0.7, 29) };
  } else if (name === 'race') {
    // Street race mid-run on the north straight: rival alongside, CP pillar ahead.
    const hero = heroAt(createCar(scene, 'sport', 34, -116.8, -Math.PI / 2, 0xd23b2e), 34, -116.8, -Math.PI / 2);
    hero.driver = 'player'; G.currentCar = hero; player.group.visible = false;
    heroAt(createCar(scene, 'sport', 39.5, -123.4, -Math.PI / 2, 0x22262c), 39.5, -123.4, -Math.PI / 2).driver = 'parked';
    extraCar('sedan', 12, -110.5, -Math.PI / 2, 0x2ea6a0);
    extraCar('pickup', -28, -110.5, -Math.PI / 2, 0x7a4fd0);
    placePed(0, 26, -108.5, Math.PI);
    placePed(1, 44, -131, 0.3);
    activities.stageRace(hero);
    G.shotSpeedo = 58;
    G.shotCam = { pos: new THREE.Vector3(49, 4.6, -107.5), look: new THREE.Vector3(8, 1.1, -119.5) };
  } else if (name === 'chase') {
    // Dusk on the boulevard: boxed-in hero, roadblock ahead, heli overhead.
    const hero = heroAt(createCar(scene, 'sedan', 180, 36, Math.PI, 0x2e7fd9), 180, 36, Math.PI);
    hero.driver = 'player'; G.currentCar = hero; player.group.visible = false;
    heroAt(createCar(scene, 'police', 175.6, 34.6, Math.PI - 0.1), 175.6, 34.6, Math.PI - 0.1).driver = 'parked';
    heroAt(createCar(scene, 'police', 183.4, 43.8, Math.PI + 0.3), 183.4, 43.8, Math.PI + 0.3).driver = 'parked';
    heroAt(createCar(scene, 'police', 185.2, 28.5, Math.PI + 0.5), 185.2, 28.5, Math.PI + 0.5).driver = 'parked';
    // the roadblock: two interceptors parked sideways across the road ahead
    heroAt(createCar(scene, 'police', 176.6, 14.5, Math.PI / 2 + 0.14), 176.6, 14.5, Math.PI / 2 + 0.14).driver = 'parked';
    heroAt(createCar(scene, 'police', 183.8, 14.0, Math.PI / 2 - 0.12), 183.8, 14.0, Math.PI / 2 - 0.12).driver = 'parked';
    // a PIT unit cocked into the hero's rear quarter, mid-maneuver
    heroAt(createCar(scene, 'police', 184.9, 30.8, Math.PI + 0.8), 184.9, 30.8, Math.PI + 0.8).driver = 'parked';
    // a traffic sedan already burning at the roadside — flames up, about to blow
    const burn = heroAt(createCar(scene, 'sedan', 172.6, 26.5, 0.9, 0x94503c), 172.6, 26.5, 0.9);
    burn.driver = 'parked'; burn.health = 0;
    for (let i = 0; i < 16; i++) burn.update(0.07, 0, 0); // get the fire well alight (burnT ≈ 1.1s)
    for (const sp of burn.fire) sp.scale.multiplyScalar(1.8); // fat flames for the camera
    extraCar('convertible', 186.5, 4, 0, 0xf2b035);
    placePed(0, 190.5, 30, -Math.PI / 2);
    placePed(1, 170.5, 44, Math.PI);
    G.wanted = 5; G.bustedMeter = 0.45; G.shotSpeedo = 41;
    const cu1 = police.spawnUnit({ x: 180, z: 36 }); cu1.callsign = 'PIT-1'; cu1.pit = true; cu1.role = 'PIT';
    const cu2 = police.spawnUnit({ x: 180, z: 36 }); cu2.callsign = 'PIT-2'; cu2.pit = true; cu2.role = 'PIT';
    const cu3 = police.spawnUnit({ x: 180, z: 36 }); cu3.role = 'RAM';
    police.setHeliForced(true, { x: 180, z: 36 });
    if (police.heli) { police.heli.group.position.set(172, 17, 22); police.heli.group.lookAt(180, 0, 36); }
    // v11: bright daylight grade — keep the golden-hour exposure from above,
    // no dusk dimming, so the police action reads clearly in full sun
    renderer.toneMappingExposure = 1.34;
    G.shotCam = { pos: new THREE.Vector3(176.2, 2.8, 43.2), look: new THREE.Vector3(180.2, 1.05, 35.4) };
  } else { // beach
    player.teleport(234, -18, Math.PI / 3);
    G.shotCam = { pos: new THREE.Vector3(230, 3.4, -36), look: new THREE.Vector3(268, 0.5, 8) };
  }
  if (missions) {
    const t = missions.currentTarget();
    if (t) {
      missions.marker.position.set(t.x, 17, t.z);
      missions.markerRing.position.set(t.x, 0.12, t.z);
    }
  }
  for (const c of cars) if (c.type === 'police') flashLights(c, 1.3);
  updateHUD(0);
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let frames = 0;
function animate() {
  requestAnimationFrame(animate);
  const rawDt = Math.min(clock.getDelta(), 0.05);
  const dt = rawDt * G.timeScale;
  G.time += dt;
  if (G.state.mode === 'playing' && !SHOT) updatePlaying(dt);
  if (G.state.mode === 'playing' || G.state.mode === 'menu' || SHOT) updateCity(dt, G.time);
  updateCamera();
  if (G.started) {
    updateHUD(rawDt);
    minimap.draw(rawDt, {
      player: { x: G.entityPos().x, z: G.entityPos().z, heading: G.inCar() ? G.currentCar.heading : player.heading },
      traffic: traffic.units.map(u => u.car), police: police.units.map(u => u.car),
      target: missions ? missions.currentTarget() : null,
      extras: activities.blips(),
      packages: collectibles ? collectibles.remaining() : [],
    });
  }
  audio.update(rawDt);
  frames++;
  if (SHOT && frames === 6) G.shotReadyFlag = true;
  renderer.render(scene, camera);
}
if (SHOT) stageShot(SHOT);
animate();

// ---------- debug / E2E hooks ----------
window.__game = {
  ready: () => !!G.shotReadyFlag || G.started,
  shotReady: () => !!G.shotReadyFlag,
  start: cont => startGame(!!cont),
  state: () => ({
    mode: G.state.mode, money: G.state.money, wanted: G.wanted,
    missionIndex: missions ? missions.index : -1,
    stepIdx: missions ? missions.stepIdx : -1,
    stepType: missions && missions.step() ? missions.step().type : null,
    objective: missions ? missions.objectiveText() : '',
    packages: G.state.packages.size, missionsCompleted: G.state.missionsCompleted,
    inCar: G.inCar(), inBoat: G.inBoat(), health: player.health, bustedMeter: Math.round(G.bustedMeter * 100) / 100,
    boatPos: { x: boat.group.position.x, z: boat.group.position.z },
    race: { active: activities.race.active, cp: activities.race.cp, t: Math.round(activities.race.t * 10) / 10, best: activities.race.best },
    taxi: activities.taxi.phase,
    taxiPed: activities.taxi.ped ? { x: Math.round(activities.taxi.ped.x), z: Math.round(activities.taxi.ped.z) } : null,
    weapon: G.weapon,
    pedCount: peds.list.length, trafficCount: traffic.units.length,
    upgrades: { ...G.upgrades },
    standing: { ...G.standing },
    district: G.districtAt(G.entityPos().x),
    carjacks: G.stats.carjacks,
    crew: crew.debug(),
    garageOpen: garage.openFlag,
    tiresFlat: G.currentCar ? Math.round(G.currentCar.tiresFlat * 10) / 10 : 0,
    carHealth: G.currentCar ? Math.round(G.currentCar.health) : -1,
    carSpin: G.currentCar ? Math.round(G.currentCar.spin * 100) / 100 : 0,
    explodedCars: cars.filter(c => c.exploded).length,
    burningCars: cars.filter(c => c.health <= 0 && !c.exploded).length,
    nitroFuel: G.currentCar ? Math.round(G.currentCar.nitroFuel * 100) / 100 : -1,
    policeRoles: police.panelList(G.entityPos()),
    policeCount: police.units.length,
    nearestPolice: (() => { const d = police.nearestDist(G.entityPos()); return d === Infinity ? -1 : Math.round(d); })(),
    pos: G.entityPos(), playerY: player.y,
    heli: police.heliActive,
  }),
  teleport: (x, z) => {
    if (G.inCar()) { G.currentCar.group.position.set(x, 0, z); G.currentCar.speed = 0; player.group.position.set(x, 0, z); }
    else player.teleport(x, z);
  },
  interact: () => doInteract(),
  enterNearestCar: () => { const c = nearestCar(6); if (c) enterCar(c); return !!c; },
  setWanted: n => { G.setWanted(n); police.ensure(G.wanted, G.entityPos()); },
  addMoney: n => G.addMoney(n),
  setTimeScale: s => { G.timeScale = s; },
  forceBusted: () => { G.bustedMeter = 1; },
  damagePlayer: n => player.damage(n),
  setMission: i => { if (missions) { missions.index = i; missions.stepIdx = 0; missions._enterStep(); } },
  advanceStep: () => { if (missions) missions._advance(); },
  startRace: () => activities._startRace(),
  recruitAll: () => crew.recruitAll(),
  callPickup: () => crew.callPickup(),
  crewDamage: (id, n) => { const m = crew.member(id); if (m) crew.damage(m, n); },
  openGarage: () => garage.open(),
  closeGarage: () => garage.close(),
  buyUpgrade: id => garage.buy(id),
  setTraffic: b => { traffic.enabled = !!b; },
  trafficPos: () => traffic.units.length ? { x: traffic.units[0].car.group.position.x, z: traffic.units[0].car.group.position.z } : null,
  burnNearestCar: () => { const c = nearestCar(9); if (c) { c.health = 0; } return !!c; },
  damageNearestCar: n => { const c = nearestCar(9); if (c) { c.health = n; } return !!c; },
  spikeHere: () => police.debugSpikeAt(G.entityPos()),
  setCarHealth: n => { if (G.currentCar) G.currentCar.health = n; },
  version: 'palmshade-city-11',
};
