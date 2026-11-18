// missions.js — a five-mission story chain. Marisol Vega, who runs Café
// Solano on the south-west corner, keeps losing delivery gear to a rival
// crew, the Breakwater Boys. You (Rook, new in town) get it all back.
// Steps are data: goto / getin / collect / escape / timed — with gold
// marker pillars, dialogue banners and cash rewards.
import * as THREE from 'three';
import { Car, VAN_COLOR } from './vehicles.js';

export const CAFE = { x: -130, z: -118 };       // mission start marker (sidewalk by the café)
export const WAREHOUSE = { x: 112, z: 98 };     // warehouse yard, NE block

const MISSIONS = [
  {
    title: 'M1 · A Van for Marisol',
    intro: [
      'Marisol: Rook! Perfect timing. My delivery van is parked up the street — the orange one.',
      'Marisol: Drive it to my brother\'s garage by the warehouse, east side. And Rook… drive like you mean it.',
    ],
    outro: ['Marisol: She\'s back! You\'re a natural. $250, as promised.'],
    reward: 250,
    steps: [
      { type: 'getin', text: 'Get into Marisol\'s orange van', spawnVan: true },
      { type: 'goto', pos: { x: 128, z: 92 }, radius: 7, text: 'Deliver the van to the garage by the warehouse', mustBeInSpawned: true },
    ],
  },
  {
    title: 'M2 · Three Lost Crates',
    intro: [
      'Marisol: The Breakwater Boys dumped three of my crates around town to slow me down.',
      'Marisol: Corners of Solano & 3rd, the plaza on 5th, and up by Palms Row. Grab them all, then come back.',
    ],
    outro: ['Marisol: All three! The lunch rush is saved. $300.'],
    reward: 300,
    steps: [
      { type: 'collect', points: [{ x: -38, z: -70 }, { x: 44, z: 38 }, { x: -16, z: 92 }], text: 'Collect Marisol\'s crates' },
      { type: 'goto', pos: CAFE, radius: 6, text: 'Return to Café Solano' },
    ],
  },
  {
    title: 'M3 · The Wrong Suitcase',
    intro: [
      'Marisol: A courier left a suitcase on the beach by the old pier. Bring it here — no questions.',
      'Marisol: If the police take an interest… lose them at the old garage, north-west corner.',
    ],
    outro: ['Marisol: Whatever was in that case, it\'s not our problem any more. $450.'],
    reward: 450,
    steps: [
      { type: 'goto', pos: { x: 152, z: -54 }, radius: 5, text: 'Pick up the suitcase on the beach', onArriveWanted: 3 },
      { type: 'escape', pos: { x: -120, z: 120 }, text: 'Lose the heat and reach the old garage (NW corner)' },
    ],
  },
  {
    title: 'M4 · The Noodle Run',
    intro: [
      'Marisol: The Golden Wok across town needs my spice crates BEFORE their dinner rush.',
      'Marisol: You have 80 seconds once you\'re rolling. Any car. Go loud, Rook.',
    ],
    outro: ['Marisol: Still steaming! The Wok owes us both. $500.'],
    reward: 500,
    steps: [
      { type: 'timed', pos: { x: 100, z: -100 }, radius: 7, time: 80, restartPos: CAFE, text: 'Race the crates to the Golden Wok (NE)' },
    ],
  },
  {
    title: 'M5 · Warehouse Finale',
    intro: [
      'Marisol: Tonight we end it. The Breakwater Boys keep their ledger at my old warehouse.',
      'Marisol: Take it from the yard, then bring it home. Every cop in Palmshade will want a word.',
    ],
    outro: [
      'Marisol: The ledger! The Boys are done in this town.',
      'Marisol: Café Solano is yours whenever you need it, Rook. Palmshade too. ($900)',
    ],
    reward: 900,
    steps: [
      { type: 'goto', pos: WAREHOUSE, radius: 6, text: 'Go to the warehouse yard' },
      { type: 'collect', points: [{ x: 100, z: 94 }], text: 'Grab the ledger from the warehouse yard' },
      { type: 'escape', pos: CAFE, homeFree: true, text: 'Lose the heat and get back to Café Solano' },
    ],
  },
];

export class Missions {
  constructor(scene, events) {
    this.scene = scene;
    this.events = events;
    this.idx = 0;               // next mission to run
    this.phase = 'idle';        // idle | active | done (all complete)
    this.stepIdx = 0;
    this.collected = new Set();
    this.timer = 0;
    this.timedPhase = 'go';     // go | return
    this.cars = [];             // mission-spawned cars (the van)
    this.complete = false;
    // marker visuals
    this.markerGroup = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.1, 30, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.33, side: THREE.DoubleSide, depthWrite: false }),
    );
    pillar.position.y = 15;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 3.1, 26),
      new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15;
    this.markerGroup.add(pillar, ring);
    this.markerGroup.visible = false;
    scene.add(this.markerGroup);
    this.crateGroup = new THREE.Group();
    scene.add(this.crateGroup);
    this.t = 0;
  }
  get current() { return this.phase === 'active' ? MISSIONS[this.idx] : null; }
  get step() { return this.current ? this.current.steps[this.stepIdx] : null; }
  missionCars() { return this.cars; }

  startMission(i = this.idx) {
    if (i >= MISSIONS.length) { this.idx = 0; } // replay the chain
    else this.idx = i;
    this.phase = 'active';
    this.stepIdx = 0;
    this.collected = new Set();
    this.events.dialogue(MISSIONS[this.idx].intro);
    this.setupStep();
    this.events.objective(this.step.text);
  }
  setupStep() {
    const s = this.step;
    if (!s) return;
    this.clearCrates();
    if (s.spawnVan && !this.van) {
      this.van = new Car(this.scene, 'van', VAN_COLOR, -131.6, -96, 0);
      this.cars = [this.van];
    }
    if (s.type === 'collect') {
      s.points.forEach((p, i) => {
        if (this.collected.has(i)) return;
        const crate = new THREE.Mesh(
          new THREE.BoxGeometry(0.85, 0.85, 0.85),
          new THREE.MeshLambertMaterial({ color: 0xffb52e, emissive: 0x6b4200, emissiveIntensity: 0.7 }),
        );
        crate.position.set(p.x, 0.8, p.z);
        crate.castShadow = true;
        crate.userData.idx = i;
        this.crateGroup.add(crate);
      });
    }
    if (s.type === 'timed') { this.timer = s.time; this.timedPhase = 'go'; }
    if (s.type === 'escape' && this.stepIdx > 0) { /* wanted raised by previous step */ }
  }
  clearCrates() { while (this.crateGroup.children.length) this.crateGroup.remove(this.crateGroup.children[0]); }
  currentTarget() {
    if (this.phase === 'idle') return CAFE;
    const s = this.step;
    if (!s) return null;
    if (s.type === 'getin') return this.van ? { x: this.van.pos.x, z: this.van.pos.z } : null;
    if (s.type === 'collect') {
      const p = s.points.find((pt, i) => !this.collected.has(i));
      return p || null;
    }
    if (s.type === 'timed' && this.timedPhase === 'return') return s.restartPos;
    return s.pos || null;
  }
  finishMission() {
    const m = MISSIONS[this.idx];
    this.events.dialogue(m.outro);
    this.events.reward(m.reward, m.title);
    if (this.van && this.idx !== 0) { /* keep van around as a bonus ride */ }
    this.idx++;
    this.stepIdx = 0;
    if (this.idx >= MISSIONS.length) { this.complete = true; this.phase = 'idle'; this.idx = 0; }
    else this.phase = 'idle';
    this.events.autosave();
    this.events.objective(this.complete ? 'Story complete — free roam! Visit the café to replay Marisol\'s jobs.' : 'Head to Café Solano for the next job.');
  }
  nextStep() {
    this.stepIdx++;
    if (this.stepIdx >= this.current.steps.length) { this.finishMission(); return; }
    this.setupStep();
    this.events.objective(this.step.text);
  }
  update(dt, ctx) {
    // ctx: {playerPos, inCar, carRef, wanted}
    this.t += dt;
    // marker placement + animation
    const target = this.currentTarget();
    if (target) {
      this.markerGroup.visible = true;
      this.markerGroup.position.set(target.x, 0, target.z);
      this.markerGroup.children[1].rotation.z = this.t * 1.4;
      this.markerGroup.children[0].material.opacity = 0.26 + Math.sin(this.t * 3) * 0.08;
    } else this.markerGroup.visible = false;
    for (const c of this.crateGroup.children) { c.rotation.y += dt * 1.8; c.position.y = 0.8 + Math.sin(this.t * 3 + c.userData.idx) * 0.15; }
    if (this.phase === 'idle') {
      if (ctx.playerPos && Math.hypot(ctx.playerPos.x - CAFE.x, ctx.playerPos.z - CAFE.z) < 5.5) {
        if (this.complete) { this.complete = false; this.idx = 0; } // replay the chain
        this.startMission(this.idx);
      }
      return;
    }
    const s = this.step;
    if (!s) return;
    const pp = ctx.playerPos;
    const distTo = (p) => Math.hypot(pp.x - p.x, pp.z - p.z);
    switch (s.type) {
      case 'getin':
        if (ctx.inCar && ctx.carRef === this.van) this.nextStep();
        break;
      case 'goto':
        if (distTo(s.pos) < (s.radius ?? 6)) {
          if (s.mustBeInSpawned && !(ctx.inCar && ctx.carRef === this.van)) break;
          if (s.onArriveWanted) this.events.raiseWanted(s.onArriveWanted);
          this.nextStep();
        }
        break;
      case 'collect': {
        let changed = false;
        s.points.forEach((p, i) => {
          if (!this.collected.has(i) && distTo(p) < 3.4) {
            this.collected.add(i); changed = true;
            this.events.pickup();
          }
        });
        if (changed) {
          this.clearCrates(); this.setupStep();
          const left = s.points.length - this.collected.size;
          this.events.objective(left > 0 ? `${s.text} (${this.collected.size}/${s.points.length})` : s.text);
        }
        if (this.collected.size >= s.points.length) this.nextStep();
        break;
      }
      case 'escape': {
        const home = distTo(s.pos) < 26;
        if (ctx.wanted <= 0.05 || (home && ctx.wanted < 1.5)) {
          if (s.homeFree) this.events.raiseWanted(0, true);
          this.nextStep();
        }
        break;
      }
      case 'timed': {
        if (this.timedPhase === 'go') {
          this.timer -= dt;
          this.events.objective(`${s.text} — ${Math.max(0, Math.ceil(this.timer))}s`);
          if (distTo(s.pos) < (s.radius ?? 7)) { this.nextStep(); break; }
          if (this.timer <= 0) {
            this.timedPhase = 'return';
            this.events.dialogue(['Marisol (phone): Too slow, Rook! Come back and we\'ll run it again.']);
            this.events.objective('Return to Café Solano to retry the Noodle Run');
          }
        } else if (distTo(s.restartPos) < 7) {
          this.timedPhase = 'go';
          this.timer = s.time;
          this.events.dialogue(['Marisol: Fresh crates loaded. Go!']);
          this.events.objective(s.text);
        }
        break;
      }
    }
    // M5: grabbing the ledger (collect step index 1) triggers the heat
    if (this.current && this.idx === 4 && this.stepIdx === 2 && !this._finaleRaised) {
      this._finaleRaised = true;
      this.events.raiseWanted(4);
    }
    if (this.stepIdx !== 2) this._finaleRaised = false;
  }
  // debug helpers for automated tests
  debugStart(i) { this.complete = false; this.idx = i; this.phase = 'idle'; this.startMission(i); }
  debugState() {
    return { idx: this.idx, phase: this.phase, stepIdx: this.stepIdx, complete: this.complete, stepType: this.step?.type ?? null };
  }
}
