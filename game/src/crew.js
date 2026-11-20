// crew.js — recruitable crew: Vex (café terrace) and Tito (marina dock).
// Recruited crew follow on foot, ride in the player's car, shoot at police and
// Breakwater Boys, can be downed and revived (E), and drive over for a pickup (G).
import * as THREE from 'three';
import { createFigure } from './player.js';
import { createCar } from './vehicles.js';
import { driveToward } from './traffic.js';
import { snapToRoad, angleLerp, clamp, dist2d, groundAt } from './util.js';

const DEFS = [
  {
    id: 'vex', name: 'VEX', role: 'CREW · WHEELWOMAN', initial: 'V', color: '#e14b8a',
    shirt: 0xe14b8a, pants: 0x1f2937, skin: 0x8a5a30, hat: 0x22262c,
    spot: { x: 169, z: -28 },
    line: 'Vex: "Heard you run this beach now. I drive, I shoot — I don\'t do dishes. I\'m in."',
  },
  {
    id: 'tito', name: 'TITO', role: 'CREW · HARBOUR HAND', initial: 'T', color: '#3ec6ff',
    shirt: 0x2e7fd9, pants: 0x374151, skin: 0xc98a5e, hat: 0xf2b035,
    spot: { x: 239, z: 11 },
    line: 'Tito: "Dario vouches for you, so the harbour does too. Point me at trouble."',
  },
];
const DOCK_WAIT = { x: 252, z: -4 };

export class Crew {
  constructor(game, peds, combat, police) {
    this.game = game;
    this.peds = peds;
    this.combat = combat;
    this.police = police;
    this.members = DEFS.map(d => {
      const fig = createFigure({ shirt: d.shirt, pants: d.pants, skin: d.skin, hat: d.hat });
      fig.group.position.set(d.spot.x, groundAt(d.spot.x, d.spot.z, 0), d.spot.z);
      fig.group.rotation.y = Math.PI / 2;
      game.scene.add(fig.group);
      return {
        ...d, fig, group: fig.group, health: 100, recruited: false,
        state: 'idle', shootT: 1 + Math.random(), downT: 0, walkT: Math.random() * 6,
        rideCar: null,
      };
    });
    this.car = null;          // the crew's own sedan, used for G pickups
    this.pickupActive = false;
    this._panelSig = '';
  }
  // ---------- queries used by main ----------
  member(id) { return this.members.find(m => m.id === id); }
  recruitedNames() { return this.members.filter(m => m.recruited).map(m => m.id); }
  nearestRecruitable(pos, r = 3.4) {
    return this.members.find(m => !m.recruited && dist2d(m.group.position.x, m.group.position.z, pos.x, pos.z) < r) || null;
  }
  nearestDowned(pos, r = 3.4) {
    return this.members.find(m => m.recruited && m.state === 'down' && dist2d(m.group.position.x, m.group.position.z, pos.x, pos.z) < r) || null;
  }
  nearestOnFoot(pos, r = 6) {
    let best = null, bd = r;
    for (const m of this.members) {
      if (!m.recruited || m.state !== 'follow') continue;
      const d = dist2d(m.group.position.x, m.group.position.z, pos.x, pos.z);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }
  debug() {
    return this.members.map(m => ({
      id: m.id, recruited: m.recruited, state: m.state, health: Math.round(m.health),
      x: Math.round(m.group.position.x * 10) / 10, z: Math.round(m.group.position.z * 10) / 10,
    }));
  }
  // ---------- actions ----------
  recruit(m) {
    m.recruited = true;
    m.state = 'follow';
    this.game.dialogue({ name: m.name, role: m.role, initial: m.initial, color: m.color }, [m.line]);
    this.game.sfx('chime');
    this.game.notify(`🤝 ${m.name} joined your crew!`);
    this.game.saveGame();
  }
  recruitAll() { for (const m of this.members) if (!m.recruited) { m.recruited = true; m.state = 'follow'; } }
  restore(ids) {
    for (const id of ids || []) {
      const m = this.member(id);
      if (m) { m.recruited = true; m.state = 'follow'; }
    }
  }
  revive(m) {
    m.state = 'follow';
    m.health = 60;
    m.fig.group.rotation.x = 0;
    this.game.notify(`${m.name} is back on their feet.`);
    this.game.sfx('chime');
  }
  damage(m, n) {
    if (!m || !m.recruited || m.state === 'down') return;
    m.health -= n;
    if (m.health <= 0) {
      m.health = 0;
      m.state = 'down';
      m.downT = 25;
      m.fig.group.rotation.x = -Math.PI / 2;
      m.fig.group.position.y = 0.25;
      this.game.notify(`💥 ${m.name} is down! Get close and press E to revive.`);
    }
  }
  damageNear(pos, r, n) {
    for (const m of this.members) {
      if (!m.recruited || m.state === 'down' || m.state === 'car' || m.state === 'arrive') continue;
      const p = m.group.position;
      if (dist2d(p.x, p.z, pos.x, pos.z) < r) this.damage(m, n);
    }
  }
  callPickup() {
    const G = this.game;
    if (G.inCar()) { G.notify('Your crew rides with you already.'); return false; }
    const away = this.members.filter(m => m.recruited && m.state !== 'down' &&
      dist2d(m.group.position.x, m.group.position.z, G.player.pos.x, G.player.pos.z) > 22);
    if (!away.length) { G.notify('Your crew is right here.'); return false; }
    if (!this.car) {
      this.car = createCar(G.scene, 'sedan', G.player.pos.x + 40, G.player.pos.z, 0, 0x2ea6a0);
      this.car.driver = 'crew';
    }
    const cp = this.car.group.position;
    if (dist2d(cp.x, cp.z, G.player.pos.x, G.player.pos.z) > 34) {
      const s = snapToRoad(G.player.pos.x + 30, G.player.pos.z + 18);
      this.car.group.position.set(s.x, 0, s.z);
      this.car.speed = 0;
    }
    for (const m of away) { m.state = 'arrive'; m.fig.group.visible = false; }
    this.pickupActive = true;
    G.notify('🚗 Crew pickup on its way — hold your position!');
    return true;
  }
  // screenshot staging: both recruited, flanking the hero car
  stageAt(hero) {
    this.recruitAll();
    const hp = hero.group.position;
    const spots = [[-2.5, 0.6], [2.5, 0.6]];
    this.members.forEach((m, i) => {
      m.state = 'idle';
      m.fig.group.visible = true;
      m.fig.group.rotation.x = 0;
      m.fig.group.position.set(hp.x + spots[i][0], 0, hp.z + spots[i][1]);
      m.fig.group.rotation.y = Math.PI + (i === 0 ? -0.35 : 0.35);
    });
  }
  // ---------- per-frame ----------
  _walkAnim(m, dt, speed) {
    m.walkT += dt * speed * 1.55;
    const sw = Math.sin(m.walkT) * 0.6;
    m.fig.legL.rotation.x = sw; m.fig.legR.rotation.x = -sw;
    m.fig.armL.rotation.x = -sw * 0.8; m.fig.armR.rotation.x = sw * 0.8;
  }
  _moveToward(m, tx, tz, dt, speed) {
    const p = m.group.position;
    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.4) return d;
    const step = Math.min(d, speed * dt);
    p.x += dx / d * step; p.z += dz / d * step;
    const target = Math.atan2(dx, dz);
    m.fig.group.rotation.y = angleLerp(m.fig.group.rotation.y, target, Math.min(1, dt * 10));
    this._walkAnim(m, dt, speed);
    return d;
  }
  _shoot(m, dt) {
    const G = this.game;
    m.shootT -= dt;
    if (m.shootT > 0) return;
    const from = m.state === 'car' && m.rideCar
      ? m.rideCar.group.position.clone().add(new THREE.Vector3(0, 1.15, 0))
      : m.group.position.clone().add(new THREE.Vector3(0, 1.4, 0));
    let targetPos = null, policeCar = null, hostile = null;
    if (G.wanted > 0) {
      let bd = 42;
      for (const u of this.police.units) {
        const p = u.car.group.position;
        const d = dist2d(p.x, p.z, from.x, from.z);
        if (d < bd) { bd = d; policeCar = u.car; targetPos = p; }
      }
    }
    if (!targetPos) {
      let bd = 32;
      for (const h of this.combat.hostiles) {
        if (h.dead) continue;
        const p = h.group.position;
        const d = dist2d(p.x, p.z, from.x, from.z);
        if (d < bd) { bd = d; hostile = h; targetPos = p; }
      }
    }
    if (!targetPos) return;
    m.shootT = 1.05 + Math.random() * 0.35;
    const to = targetPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 1.0, (Math.random() - 0.5) * 0.8));
    this.combat._flash(from, 0.8);
    this.combat._tracer(from, to, 0xffd9a0);
    G.sfx('shot');
    if (policeCar) policeCar.hurt(5);
    else if (hostile) this.combat.damageHostile(hostile, 11);
    if (m.state === 'follow') m.fig.group.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
  }
  update(dt) {
    const G = this.game;
    if (G.state.mode !== 'playing') return;
    const pp = G.player.pos;
    const playerCar = G.currentCar;
    // pickup car run
    if (this.pickupActive && this.car) {
      const cp = this.car.group.position;
      const d = dist2d(cp.x, cp.z, pp.x, pp.z);
      if (d > 90) {
        const s = snapToRoad(pp.x + 30, pp.z + 18);
        cp.set(s.x, 0, s.z); this.car.speed = 0;
      }
      if (d < 7) {
        this.car.update(dt, 0, 0);
        for (const m of this.members) {
          if (m.state !== 'arrive') continue;
          m.state = 'follow';
          m.fig.group.visible = true;
          m.fig.group.position.set(cp.x + 2.2, 0, cp.z + 1);
        }
        this.pickupActive = false;
        G.notify('Crew pickup arrived.');
      } else driveToward(this.car, pp.x, pp.z, dt, 0.95);
    } else if (this.car && this.car.driver === 'crew') this.car.update(dt, 0, 0);
    for (const m of this.members) {
      if (!m.recruited) continue;
      const p = m.group.position;
      if (m.state === 'down') {
        m.downT -= dt;
        if (m.downT <= 0) { m.state = 'follow'; m.health = 40; m.fig.group.rotation.x = 0; m.fig.group.position.y = 0; G.notify(`${m.name} shook it off and got up.`); }
        continue;
      }
      if (m.state === 'arrive') continue; // riding in the pickup car
      if (m.state === 'car') {
        if (!playerCar || m.rideCar !== playerCar) {
          // player got out (or swapped cars): crew piles out at the door
          const base = m.rideCar ? m.rideCar.group.position : pp;
          p.set(base.x + 2.3, 0, base.z + 0.8);
          m.fig.group.visible = true;
          m.rideCar = null;
          m.state = 'follow';
        } else {
          p.copy(playerCar.group.position);
          this._shoot(m, dt);
          continue;
        }
      }
      // on foot from here
      if (G.inBoat()) {
        // crew won't swim: they wait on the dock until the player lands
        this._moveToward(m, DOCK_WAIT.x, DOCK_WAIT.z, dt, 5.4);
        continue;
      }
      if (playerCar) {
        const cp = playerCar.group.position;
        const d = dist2d(p.x, p.z, cp.x, cp.z);
        if (d < 4.6 && Math.abs(playerCar.speed) < 6) {
          m.state = 'car'; m.rideCar = playerCar;
          m.fig.group.visible = false;
          continue;
        }
        this._moveToward(m, cp.x, cp.z, dt, d > 12 ? 9.6 : 6.4);
        continue;
      }
      const d = dist2d(p.x, p.z, pp.x, pp.z);
      if (d > 80) { // left far behind: they catch up off-screen
        p.set(pp.x + (Math.random() - 0.5) * 6, 0, pp.z + (Math.random() - 0.5) * 6);
        continue;
      }
      if (d > 3.1) this._moveToward(m, pp.x, pp.z, dt, d > 12 ? 9.4 : 5.4);
      this._shoot(m, dt);
    }
  }
  // ---------- HUD ----------
  renderPanel() {
    const el = document.getElementById('crewPanel');
    const list = document.getElementById('crewList');
    if (!el || !list) return;
    const rec = this.members.filter(m => m.recruited);
    if (!rec.length) { el.classList.add('hidden'); this._panelSig = ''; return; }
    el.classList.remove('hidden');
    const sig = rec.map(m => m.id + Math.round(m.health / 5) + m.state).join('|');
    if (sig === this._panelSig) return;
    this._panelSig = sig;
    list.innerHTML = rec.map(m => `
      <div class="crew-row">
        <span class="crew-tile" style="background:${m.color}">${m.initial}</span>
        <div class="crew-info">
          <div class="crew-name">${m.name}${m.state === 'down' ? ' · <b style="color:#ff5f4a">DOWN</b>' : m.state === 'car' ? ' · RIDING' : m.state === 'arrive' ? ' · PICKUP' : ''}</div>
          <div class="bar crew-bar"><div style="width:${clamp(m.health, 0, 100)}%;background:linear-gradient(90deg,#e14b8a,#ffb35c)"></div></div>
        </div>
      </div>`).join('');
  }
}
