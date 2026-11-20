// activities.js — free-roam side activities: street races (checkpoint loop,
// timer, saved best) and taxi fares (flag a ped, drive them, get paid).
import * as THREE from 'three';

const RACE_START = { x: 180, z: -120 };
const RACE_CPS = [
  { x: 180, z: -60 }, { x: 120, z: -120 }, { x: 0, z: -120 }, { x: -120, z: -60 },
  { x: -120, z: 60 }, { x: 0, z: 120 }, { x: 120, z: 120 }, { x: 180, z: 60 },
];
const BEST_KEY = 'palmshade-race-best';

function pillar(color) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 30, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.position.y = 15;
  return m;
}
function ring(color, r = 3.4) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.55, r, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

export class Activities {
  constructor(game, peds) {
    this.game = game;
    this.peds = peds;
    this.el = document.getElementById('activityPanel');
    this.elText = document.getElementById('activityText');
    // race visuals
    this.racePillar = pillar(0x3ec6ff); this.racePillar.visible = false; game.scene.add(this.racePillar);
    this.raceRing = ring(0x3ec6ff, 4.2); game.scene.add(this.raceRing);
    this.raceRing.position.set(RACE_START.x, 0.14, RACE_START.z);
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 4),
      new THREE.MeshBasicMaterial({ color: 0x3ec6ff }));
    this.arrow.rotation.x = Math.PI; this.arrow.visible = false; game.scene.add(this.arrow);
    // taxi visuals
    this.taxiPillar = pillar(0xffd23e); this.taxiPillar.visible = false; game.scene.add(this.taxiPillar);
    this.taxiSign = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.42, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    this.taxiSign.visible = false; game.scene.add(this.taxiSign);
    // state
    this.race = { active: false, cp: 0, t: 0, best: this._loadBest() };
    this.taxi = { phase: 'idle', ped: null, dest: null, wait: 6, dist: 0 };
    this.panelT = 0;
  }
  _loadBest() {
    try { const v = parseFloat(localStorage.getItem(BEST_KEY)); return isFinite(v) && v > 0 ? v : null; }
    catch { return null; }
  }
  _saveBest(v) {
    this.race.best = v;
    try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* ignore */ }
  }
  _panel(html) {
    if (html) { this.elText.innerHTML = html; this.el.classList.remove('hidden'); }
    else this.el.classList.add('hidden');
  }
  _fmt(t) {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, '0')}`;
  }
  blips() {
    const out = [];
    if (this.race.active) {
      const cp = RACE_CPS[this.race.cp];
      if (cp) out.push({ x: cp.x, z: cp.z, color: '#3ec6ff', r: 3.6 });
    } else out.push({ x: RACE_START.x, z: RACE_START.z, color: '#3ec6ff', r: 2.6 });
    if (this.taxi.phase === 'pickup' && this.taxi.ped) out.push({ x: this.taxi.ped.x, z: this.taxi.ped.z, color: '#ffd23e', r: 3.2 });
    if (this.taxi.phase === 'dropoff' && this.taxi.dest) out.push({ x: this.taxi.dest.x, z: this.taxi.dest.z, color: '#7ddf7d', r: 3.2 });
    return out;
  }
  target() {
    if (this.race.active) return RACE_CPS[this.race.cp] || null;
    if (this.taxi.phase === 'dropoff') return this.taxi.dest;
    if (this.taxi.phase === 'pickup' && this.taxi.ped) return { x: this.taxi.ped.x, z: this.taxi.ped.z };
    return null;
  }
  // Used by the screenshot staging: a race mid-run, frozen for the camera.
  stageRace(heroCar) {
    this.race.active = true; this.race.cp = 2; this.race.t = 47.3;
    const cp = RACE_CPS[this.race.cp];
    this.racePillar.visible = true;
    this.racePillar.position.set(cp.x, 15, cp.z);
    this.arrow.visible = true;
    this.arrow.position.set(cp.x, 6.4, cp.z);
    this.raceRing.visible = false;
    this._panel(`🏁 <b>STREET RACE</b> · CP 3/${RACE_CPS.length} · ⏱ ${this._fmt(this.race.t)}${this.race.best ? ` · BEST ${this._fmt(this.race.best)}` : ''}`);
    if (heroCar) heroCar.speed = 17;
  }
  _startRace() {
    this.race.active = true; this.race.cp = 0; this.race.t = 0;
    this.raceRing.visible = false;
    this.game.notify('🏁 Street race — follow the blue pillars!');
    this.game.sfx('chime');
  }
  _endRace(finished) {
    this.race.active = false;
    this.racePillar.visible = false; this.arrow.visible = false;
    this.raceRing.visible = true;
    this._panel(null);
    if (finished) {
      const t = this.race.t;
      let msg = `🏁 Finished in ${this._fmt(t)}!`;
      if (!this.race.best || t < this.race.best) { this._saveBest(t); msg += ' New best time!'; }
      const pay = 150;
      this.game.addMoney(pay);
      if (this.game.earnStanding) this.game.earnStanding(RACE_START.x, RACE_START.z, 3);
      this.game.notify(`${msg} +$${pay}`);
      this.game.sfx('jingle');
    }
  }
  _flagPed() {
    const ep = this.game.entityPos();
    let best = null, bd = Infinity;
    for (const ped of this.peds.list) {
      if (ped.state !== 'stroll') continue;
      if (Math.abs(ped.x) > 205 || Math.abs(ped.z) > 205) continue; // keep fares in the city
      const d = Math.hypot(ped.x - ep.x, ped.z - ep.z);
      if (d > 30 && d < bd) { bd = d; best = ped; }
    }
    if (!best) return;
    this.taxi.ped = best;
    this.taxi.phase = 'pickup';
    this.taxiSign.visible = true;
  }
  _taxiCancel(silent) {
    const ped = this.taxi.ped;
    if (ped) {
      ped.fig.visible = true;
      this.peds.respawn(ped);
    }
    this.taxi = { phase: 'idle', ped: null, dest: null, wait: 14, dist: 0 };
    this.taxiSign.visible = false;
    this.taxiPillar.visible = false;
    if (!silent) this.game.notify('Fare cancelled.');
  }
  update(dt, t) {
    const G = this.game;
    const ep = G.entityPos();
    const inCar = G.inCar() && !G.inBoat();
    const speed = Math.abs(G.entitySpeed());
    // ---------- street race ----------
    if (!this.race.active) {
      this.raceRing.position.y = 0.14 + Math.sin(t * 3) * 0.05;
      if (inCar && Math.hypot(ep.x - RACE_START.x, ep.z - RACE_START.z) < 7.5) this._startRace();
    } else {
      this.race.t += dt;
      const cp = RACE_CPS[this.race.cp];
      if (cp) {
        this.racePillar.visible = true;
        this.racePillar.position.set(cp.x, 15, cp.z);
        this.arrow.visible = true;
        this.arrow.position.set(cp.x, 6.4 + Math.sin(t * 3.2) * 0.5, cp.z);
        if (inCar && Math.hypot(ep.x - cp.x, ep.z - cp.z) < 13) {
          this.race.cp++;
          G.sfx('chime');
          if (this.race.cp >= RACE_CPS.length) this._endRace(true);
          else G.notify(`Checkpoint ${this.race.cp}/${RACE_CPS.length}`);
        }
      }
      if (!inCar) this._endRace(false); // stepped out — race over
    }
    // ---------- taxi ----------
    const tx = this.taxi;
    if (tx.phase === 'idle') {
      tx.wait -= dt;
      if (tx.wait <= 0) this._flagPed();
    } else if (tx.phase === 'pickup' && tx.ped) {
      const ped = tx.ped;
      this.taxiSign.position.set(ped.x, 2.6 + Math.sin(t * 4) * 0.12, ped.z);
      if (ped.state === 'down' || ped.state === 'gone') { this._taxiCancel(true); }
      else if (inCar && speed < 2.5 && Math.hypot(ep.x - ped.x, ep.z - ped.z) < 6) {
        // passenger boards
        ped.state = 'gone'; ped.fig.visible = false;
        this.taxiSign.visible = false;
        const dests = [
          { x: 180, z: 120 }, { x: -120, z: -120 }, { x: 60, z: 180 }, { x: -180, z: 60 },
          { x: 120, z: -180 }, { x: -60, z: -180 }, { x: 250, z: 0 }, { x: 150, z: -30 },
        ];
        let dest = dests[(Math.random() * dests.length) | 0];
        if (Math.hypot(dest.x - ep.x, dest.z - ep.z) < 120) dest = dests[(dests.indexOf(dest) + 3) % dests.length];
        tx.dest = dest;
        tx.dist = Math.hypot(dest.x - ep.x, dest.z - ep.z);
        tx.phase = 'dropoff';
        this.taxiPillar.visible = true;
        this.taxiPillar.position.set(dest.x, 15, dest.z);
        G.notify('🚕 Fare aboard — follow the gold pillar!');
        G.sfx('chime');
      }
    } else if (tx.phase === 'dropoff' && tx.dest) {
      if (!inCar) this._taxiCancel(false);
      else if (Math.hypot(ep.x - tx.dest.x, ep.z - tx.dest.z) < 9.5 && speed < 3) {
        const pay = 40 + Math.round(tx.dist / 3);
        G.addMoney(pay);
        if (G.earnStanding) G.earnStanding(tx.dest.x, tx.dest.z, 3);
        G.notify(`🚕 Fare paid — +$${pay}. Thanks for riding Palmshade Cabs!`);
        G.sfx('jingle');
        const ped = tx.ped;
        if (ped) { ped.fig.visible = true; this.peds.respawn(ped); }
        this.taxi = { phase: 'idle', ped: null, dest: null, wait: 18, dist: 0 };
        this.taxiPillar.visible = false;
      }
    }
    // ---------- activity panel (throttled) ----------
    this.panelT -= dt;
    if (this.panelT <= 0) {
      this.panelT = 0.25;
      if (this.race.active) {
        this._panel(`🏁 <b>STREET RACE</b> · CP ${Math.min(this.race.cp + 1, RACE_CPS.length)}/${RACE_CPS.length} · ⏱ ${this._fmt(this.race.t)}${this.race.best ? ` · BEST ${this._fmt(this.race.best)}` : ''}`);
      } else if (this.taxi.phase === 'dropoff' && this.taxi.dest) {
        const d = Math.round(Math.hypot(ep.x - this.taxi.dest.x, ep.z - this.taxi.dest.z));
        this._panel(`🚕 <b>TAXI</b> · drop-off ${d}m away · fare ≈ $${40 + Math.round(this.taxi.dist / 3)}`);
      } else this._panel(null);
    }
  }
}
