// missions.js — the Marisol Vega story chain: 7 missions vs the Breakwater Boys.
import * as THREE from 'three';
import { createFigure } from './player.js';
import { makePackage } from './collectibles.js';

export const MARISOL = { name: 'MARISOL VEGA', role: 'CAFÉ OWNER', initial: 'M', color: '#2a9d8f' };
export const DREY = { name: 'DREY', role: 'BREAKWATER BOYS', initial: 'D', color: '#54687f' };
export const DISPATCH = { name: 'PALMSHADE PD', role: 'DISPATCH', initial: 'PD', color: '#3f6fb5' };

const CAFE = { x: 158, z: -30 };
const MISSIONS = [
  {
    title: 'First Delivery', reward: 250,
    intro: ['Marisol: "You must be the new runner. Good — I need hands I can trust."',
      'Marisol: "Take my van and get these pastries to the kiosk on 3rd & Palm. And drive like you mean it."'],
    outro: ['Marisol: "Warm and on time. You might be useful after all."'],
    steps: [
      { type: 'talk', text: 'Talk to Marisol at Café Marisol' },
      { type: 'enterVan', text: 'Get into Marisol\'s café van' },
      { type: 'driveTo', pos: { x: -90, z: 54 }, text: 'Deliver the pastries to the kiosk on 3rd & Palm' },
    ],
  },
  {
    title: 'Package Run', reward: 300,
    intro: ['Marisol: "A courier dropped three of my packages along the beachfront. Sloppy."',
      'Marisol: "Pick them up and bring them back here. Watch for the Breakwater Boys — they watch my beach."'],
    outro: ['Marisol: "All three. The Boys are slipping."'],
    steps: [
      { type: 'talk', text: 'Talk to Marisol' },
      { type: 'collect', count: 3, spots: [{ x: 196, z: -70 }, { x: 204, z: 18 }, { x: 196, z: 108 }], text: 'Collect the dropped packages' },
      { type: 'goTo', pos: CAFE, r: 11, text: 'Return to Café Marisol' },
    ],
  },
  {
    title: 'Heat Escape', reward: 400,
    intro: ['Marisol: "There is a parcel waiting at the marina. Papers my cousin should never have signed."',
      'Marisol: "The PD watches that dock. Grab it, and if the lights find you — lose them. Do not lead them here."'],
    outro: ['Marisol: "Clean driving. My cousin sleeps easy tonight."'],
    steps: [
      { type: 'talk', text: 'Talk to Marisol' },
      { type: 'driveTo', pos: { x: 224, z: 8 }, text: 'Pick up the parcel at the marina' },
      { type: 'escape', text: 'Lose the Palmshade PD!', heat: 3 },
    ],
  },
  {
    title: 'Sunset Run', reward: 450,
    intro: ['Marisol: "Warehouse 7 needs this stock before sundown, and the buyer hates waiting."',
      'Marisol: "Eighty seconds. The clock is the only cop you cannot outrun."'],
    outro: ['Marisol: "With seconds to spare. The buyer sends his regards."'],
    steps: [
      { type: 'talk', text: 'Talk to Marisol' },
      { type: 'driveTo', pos: { x: -150, z: 124 }, time: 80, text: 'Reach Warehouse 7 — fast' },
    ],
  },
  {
    title: 'Marina Pickup', reward: 500,
    intro: ['Marisol: "A fisherman at the end of the pier holds something delicate for me."',
      'Marisol: "Walk out, take it gently, and bring it home. No noise."'],
    outro: ['Marisol: "Delicate work, done quietly. I am impressed."'],
    steps: [
      { type: 'talk', text: 'Talk to Marisol' },
      { type: 'goTo', pos: { x: 284, z: 0 }, r: 5, text: 'Walk the pier and take the package' },
      { type: 'goTo', pos: CAFE, r: 11, text: 'Bring it back to Café Marisol' },
    ],
  },
  {
    title: 'Breakwater Ambush', reward: 650,
    intro: ['Marisol: "Drey wants a meeting in the park. Alone, he says. He lies like he breathes."',
      'Marisol: "Go — but keep your sidearm ready and your eyes open."'],
    outro: ['Marisol: "You walked out of Drey\'s trap. The whole beach will hear of it."'],
    steps: [
      { type: 'talk', text: 'Talk to Marisol' },
      { type: 'goTo', pos: { x: -30, z: 30 }, r: 9, text: 'Meet the Breakwater Boys in the park' },
      { type: 'shootout', count: 3, pos: { x: -30, z: 30 }, text: 'Survive the ambush!' },
    ],
  },
  {
    title: 'Warehouse Finale', reward: 1000,
    intro: ['Marisol: "Tonight we end it. The Boys keep their whole operation in Warehouse 7."',
      'Marisol: "Clear them out, and Palmshade is ours. Then come home — dinner is on the café."'],
    outro: ['Marisol: "It is done. Palmshade breathes again — and your name runs this beach now."'],
    steps: [
      { type: 'talk', text: 'Talk to Marisol' },
      { type: 'driveTo', pos: { x: -150, z: 124 }, text: 'Drive to Warehouse 7' },
      { type: 'shootout', count: 4, pos: { x: -150, z: 118 }, text: 'Clear out the Breakwater Boys' },
      { type: 'goTo', pos: CAFE, r: 11, text: 'Return to Marisol — end of the line' },
    ],
  },
];
export const MISSION_COUNT = MISSIONS.length;

export class Missions {
  constructor(game) {
    this.game = game;
    this.index = game.state.missionIndex || 0;
    this.stepIdx = 0;
    this.stepState = {};
    // Marisol herself, waiting on the café terrace
    const fig = createFigure({ shirt: 0x2a9d8f, pants: 0xf2e3c2, skin: 0xa8763e, hat: 0x7a2d20 });
    this.marisol = fig;
    fig.group.position.set(game.landmarks.marisol.x, 1.0, game.landmarks.marisol.z);
    fig.group.rotation.y = Math.PI / 2;
    game.scene.add(fig.group);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(game.landmarks.marisol.x, 1.06, game.landmarks.marisol.z);
    game.scene.add(ring);
    // gold objective pillar
    this.marker = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 34, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.marker.position.y = 17;
    game.scene.add(this.marker);
    this.markerRing = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 28),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    this.markerRing.rotation.x = -Math.PI / 2;
    game.scene.add(this.markerRing);
    this._enterStep();
  }
  mission() { return MISSIONS[this.index]; }
  step() { return this.mission().steps[this.stepIdx]; }
  _enterStep() {
    const st = this.step();
    this.stepState = {};
    if (!st) return;
    if (st.type === 'collect') {
      this.stepState.items = st.spots.map(s => {
        const mesh = makePackage(0x3ec6ff);
        mesh.position.set(s.x, 0.75, s.z);
        this.game.scene.add(mesh);
        return { mesh, spot: s, taken: false };
      });
      this.stepState.got = 0;
    }
    if (st.type === 'driveTo' && st.time) this.stepState.t = st.time;
    if (st.type === 'escape') {
      this.game.setWanted(st.heat || 3);
      this.game.dialogue(DISPATCH, ['Dispatch: "All units — suspect vehicle leaving the marina, code 3."']);
      this.game.sfx('siren');
    }
    if (st.type === 'shootout') {
      this.stepState.hostiles = [];
      for (let i = 0; i < st.count; i++) {
        const a = (i / st.count) * Math.PI * 2 + 0.6;
        const h = this.game.combat.spawnHostile(st.pos.x + Math.cos(a) * 13, st.pos.z + Math.sin(a) * 13);
        this.stepState.hostiles.push(h);
      }
      this.game.dialogue(DREY, ['Drey: "Wrong beach to walk on, runner."']);
      this.game.sfx('shot');
    }
  }
  _advance() {
    this.stepIdx++;
    if (this.stepIdx >= this.mission().steps.length) this._completeMission();
    else this._enterStep();
  }
  _completeMission() {
    const m = this.mission();
    const pay = Math.round(m.reward * this.game.rewardMul);
    this.game.addMoney(pay);
    this.game.state.missionsCompleted++;
    this.game.sfx('jingle');
    this.game.dialogue(MARISOL, [...m.outro, `Marisol: "Paid in full — $${pay}."`]);
    this.index++;
    if (this.index >= MISSIONS.length) {
      this.index = 0;
      this.game.state.chainFinished = true;
      this.game.rewardMul = 1.5;
      this.game.notify('Story complete! Marisol\'s chain replays at 1.5× pay.');
    }
    this.game.state.missionIndex = this.index;
    this.stepIdx = 0;
    this._enterStep();
    this.game.saveGame();
  }
  interact() {
    const st = this.step();
    if (!st || st.type !== 'talk') return false;
    const p = this.game.player.pos;
    const m = this.game.landmarks.marisol;
    if (Math.hypot(p.x - m.x, p.z - m.z) < 3.6 && Math.abs(this.game.player.y - 1.0) < 1.6) {
      this.game.dialogue(MARISOL, this.mission().intro);
      this.game.sfx('talk');
      this._advance();
      return true;
    }
    return false;
  }
  onEnterCar(car) {
    const st = this.step();
    if (st && st.type === 'enterVan' && car === this.game.vanCar) {
      this.game.dialogue(MARISOL, ['Marisol: "Gently with her. She is older than both of us."']);
      this._advance();
    }
  }
  currentTarget() {
    const st = this.step();
    if (!st) return null;
    switch (st.type) {
      case 'talk': return this.game.landmarks.marisol;
      case 'enterVan': { const p = this.game.vanCar.group.position; return { x: p.x, z: p.z }; }
      case 'driveTo': case 'goTo': return st.pos;
      case 'collect': {
        const it = (this.stepState.items || []).find(i => !i.taken);
        return it ? it.spot : null;
      }
      case 'shootout': {
        const h = (this.stepState.hostiles || []).find(h => !h.dead);
        return h ? { x: h.group.position.x, z: h.group.position.z } : st.pos;
      }
      default: return null;
    }
  }
  objectiveText() {
    const st = this.step();
    if (!st) return '';
    let base = `${this.mission().title} — ${st.text}`;
    if (st.type === 'collect') base += `  (${this.stepState.got || 0}/${st.count})`;
    if (st.type === 'driveTo' && st.time && this.stepState.t !== undefined) base += `  ⏱ ${Math.max(0, Math.ceil(this.stepState.t))}s`;
    if (st.type === 'shootout') {
      const alive = (this.stepState.hostiles || []).filter(h => !h.dead).length;
      base += `  (${alive} left)`;
    }
    if (st.type === 'escape') base += `  (heat: ${this.game.wanted}★)`;
    return base;
  }
  update(dt, t) {
    // Marisol idle sway
    this.marisol.group.rotation.y = Math.PI / 2 + Math.sin(t * 0.7) * 0.14;
    const st = this.step();
    // marker placement
    const target = this.currentTarget();
    if (target) {
      this.marker.visible = this.markerRing.visible = true;
      this.marker.position.x = target.x; this.marker.position.z = target.z;
      this.markerRing.position.set(target.x, 0.12 + Math.sin(t * 3) * 0.05, target.z);
      const s = 1 + Math.sin(t * 3) * 0.08;
      this.markerRing.scale.setScalar(s);
    } else this.marker.visible = this.markerRing.visible = false;
    if (!st || this.game.state.mode !== 'playing') return;
    const ep = this.game.entityPos();
    const near = (pos, r) => Math.hypot(ep.x - pos.x, ep.z - pos.z) < r;
    switch (st.type) {
      case 'driveTo': {
        if (st.time) {
          this.stepState.t -= dt;
          if (this.stepState.t <= 0) {
            this.stepState.t = st.time;
            this.game.dialogue(MARISOL, ['Marisol: "Too slow — the buyer nearly walked. Again, and faster."']);
            this.game.notify('Timer expired — try the run again!');
          }
        }
        if (this.game.inCar() && near(st.pos, 10)) this._advance();
        break;
      }
      case 'goTo': if (near(st.pos, st.r || 6)) this._advance(); break;
      case 'collect': {
        for (const it of this.stepState.items) {
          if (it.taken) continue;
          it.mesh.rotation.y += dt * 1.5;
          if (Math.hypot(ep.x - it.spot.x, ep.z - it.spot.z) < 2 && Math.abs(ep.y) < 2.4) {
            it.taken = true; this.game.scene.remove(it.mesh);
            this.stepState.got++;
            this.game.addMoney(25); this.game.sfx('chime');
            this.game.notify(`Package recovered (${this.stepState.got}/${st.count})`);
          }
        }
        if (this.stepState.got >= st.count) this._advance();
        break;
      }
      case 'escape': if (this.game.wanted === 0) this._advance(); break;
      case 'shootout': {
        if ((this.stepState.hostiles || []).every(h => h.dead)) this._advance();
        break;
      }
    }
  }
}
