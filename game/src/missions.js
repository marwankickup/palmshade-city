// missions.js — the 7-mission Marisol Vega story chain (Café Marisol vs the Breakwater Boys).
// Step engine: talk / enterVan / goto / collect / loseHeat / shootout steps, gold pillar
// marker, banner dialogue, cash rewards, autosave hooks — all via the ctx main provides.
import * as THREE from 'three';
import { makeFigure } from './player.js';
import { dist2d } from './util.js';

export const MISSION_DEFS = [
  {
    title: 'First Delivery',
    reward: 300,
    intro: [['Marisol', 'You drive? Good. My van is loaded with cafecitos for Warehouse 7.'], ['Marisol', 'Take the van, drop the cargo, come back in one piece.']],
    steps: [
      { type: 'talk', text: 'Talk to Marisol at Café Marisol' },
      { type: 'enterVan', text: 'Get in Marisol\'s van' },
      { type: 'goto', at: 'warehouseDoor', r: 9, text: 'Deliver the cargo to Warehouse 7' },
    ],
    done: 'Clean run. The Breakwater Boys keep sniffing around my café — I may need you again.',
  },
  {
    title: 'Package Run',
    reward: 400,
    intro: [['Marisol', 'Three supply crates got scattered along the beachfront. Fetch them for me.']],
    steps: [
      { type: 'talk', text: 'Talk to Marisol' },
      { type: 'collect', spots: [{ x: 176, z: 60 }, { x: 168, z: -120 }, { x: 214, z: -60 }], text: 'Collect the supply crates' },
      { type: 'goto', at: 'cafe', r: 10, text: 'Return to Café Marisol' },
    ],
    done: 'All three! You are officially my favourite driver.',
  },
  {
    title: 'Heat Escape',
    reward: 500,
    intro: [['Marisol', 'The Boys tipped off the PD about a "stolen" shipment at Warehouse 7.'], ['Marisol', 'Grab the crate, then lose the heat. Do NOT lead them here.']],
    steps: [
      { type: 'talk', text: 'Talk to Marisol' },
      { type: 'goto', at: 'warehouseDoor', r: 9, text: 'Pick up the crate at Warehouse 7', heat: 3 },
      { type: 'loseHeat', text: 'Lose the heat (wanted level to zero)' },
    ],
    done: 'Gone like a ghost. The Boys are losing their touch.',
  },
  {
    title: 'Timed Run',
    reward: 450,
    intro: [['Marisol', 'A tour group at the parking garage needs coffee NOW. Seventy-five seconds. Go!']],
    steps: [
      { type: 'talk', text: 'Talk to Marisol' },
      { type: 'goto', at: 'garage', r: 11, time: 75, text: 'Reach the parking garage fast' },
    ],
    done: 'Still warm! Here — hazard pay.',
  },
  {
    title: 'Marina Pickup',
    reward: 600,
    intro: [['Marisol', 'A fisherman at the pier end has my vanilla shipment. Collect it, bring it to Warehouse 7.']],
    steps: [
      { type: 'talk', text: 'Talk to Marisol' },
      { type: 'goto', at: 'pierEnd', r: 7, text: 'Pick up the shipment at the pier end' },
      { type: 'goto', at: 'warehouseDoor', r: 9, text: 'Drop it at Warehouse 7' },
    ],
    done: 'Smells like vanilla and victory.',
  },
  {
    title: 'Breakwater Ambush',
    reward: 700,
    intro: [['Marisol', 'The Boys are shaking down Warehouse 7 tonight.'], ['Marisol', 'Go down there and make them regret it. Bring your piece.']],
    steps: [
      { type: 'talk', text: 'Talk to Marisol' },
      { type: 'shootout', at: 'warehouseDoor', r: 26, text: 'Deal with the Breakwater Boys at Warehouse 7' },
    ],
    done: 'They ran off whimpering. Palmshade is ours again.',
  },
  {
    title: 'Settle It',
    reward: 1000,
    intro: [['Marisol', 'One last ride. Drive me to the pier — we end this feud tonight.'], ['Marisol', 'The PD will try to stop us. Do not let them.']],
    steps: [
      { type: 'talk', text: 'Talk to Marisol' },
      { type: 'goto', at: 'pierEnd', r: 8, heat: 2, text: 'Drive Marisol to the pier end' },
    ],
    done: 'It is settled. Palmshade City shines a little brighter tonight. (Chain complete — talk to Marisol to run it again.)',
  },
];

export class Missions {
  constructor(scene, ctx) {
    this.ctx = ctx;
    this.index = 0;             // next mission to run
    this.active = null;         // {def, stepIdx, collectLeft, timer, thugs}
    this.complete = false;
    // Marisol figure on the café terrace
    this.marisol = makeFigure(0xc0392b, 0x2c3e50, 0x8d5524, 0x1a1a1a);
    this.marisol.position.set(ctx.landmarks.marisol.x, 0.9, ctx.landmarks.marisol.z);
    this.marisol.rotation.y = -Math.PI / 2;
    scene.add(this.marisol);
    // gold pillar marker
    const geo = new THREE.CylinderGeometry(1.1, 1.1, 26, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
    this.pillar = new THREE.Mesh(geo, mat);
    this.pillar.visible = false;
    scene.add(this.pillar);
    const ringGeo = new THREE.RingGeometry(1.6, 2.1, 24);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.visible = false;
    scene.add(this.ring);
    // mission collect crate visual
    this.crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x145a32, emissive: 0x2ecc71, emissiveIntensity: 0.9 }));
    this.crate.visible = false; this.crate.castShadow = true;
    scene.add(this.crate);
  }

  currentDef() { return MISSION_DEFS[this.index % MISSION_DEFS.length]; }
  objectiveText() {
    if (this.active) {
      const s = this.active.def.steps[this.active.stepIdx];
      let txt = s.text;
      if (s.type === 'collect') txt += ` (${this.active.collectTotal - this.active.collectLeft}/${this.active.collectTotal})`;
      if (s.time && this.active.timer > 0) txt += ` — ${Math.ceil(this.active.timer)}s`;
      return txt;
    }
    if (this.index >= MISSION_DEFS.length && this.complete) return 'Talk to Marisol to run the chain again';
    return `Talk to Marisol — next job: ${this.currentDef().title}`;
  }
  markerPos() {
    const L = this.ctx.landmarks;
    if (!this.active) return { x: L.marisol.x, z: L.marisol.z, y: 0.9 };
    const s = this.active.def.steps[this.active.stepIdx];
    if (s.type === 'talk') return { x: L.marisol.x, z: L.marisol.z, y: 0.9 };
    if (s.type === 'enterVan' && this.ctx.van) return { x: this.ctx.van.x, z: this.ctx.van.z, y: 0 };
    if (s.type === 'collect' && this.active.collectSpots) {
      const sp = this.active.collectSpots[0];
      return sp ? { x: sp.x, z: sp.z, y: 0 } : null;
    }
    if (s.at) { const p = L[s.at]; return { x: p.x, z: p.z, y: 0 }; }
    if (s.type === 'loseHeat') return null;
    return null;
  }

  // Called by main when the player presses E near Marisol.
  interact() {
    if (this.active) return false;
    const def = this.currentDef();
    this.active = { def, stepIdx: 0, collectLeft: 0, collectTotal: 0, collectSpots: null, timer: 0, thugs: [] };
    for (const [who, line] of def.intro) this.ctx.dialogue(who, line);
    this.advance(); // step 0 is the talk itself — complete it now
    return true;
  }

  advance() {
    const a = this.active;
    if (!a) return;
    a.stepIdx++;
    if (a.stepIdx >= a.def.steps.length) { this.finishMission(); return; }
    const s = a.def.steps[a.stepIdx];
    if (s.type === 'collect') {
      a.collectSpots = [...s.spots]; a.collectLeft = s.spots.length; a.collectTotal = s.spots.length;
      this.placeCrate();
    }
    if (s.time) a.timer = s.time;
    if (s.heat) this.ctx.setWanted(s.heat);
    if (s.type === 'shootout') this.spawnThugs();
    if (s.type === 'enterVan') this.ctx.ensureVan();
  }

  placeCrate() {
    const sp = this.active && this.active.collectSpots && this.active.collectSpots[0];
    if (sp) { this.crate.position.set(sp.x, 0.6, sp.z); this.crate.visible = true; }
    else this.crate.visible = false;
  }
  spawnThugs() {
    const rng = this.ctx.rng, L = this.ctx.landmarks;
    const spots = [[172, 108], [174, 132], [186, 136]];
    this.active.thugs = spots.map(([x, z]) => this.ctx.spawnThug(x, z, rng));
    this.ctx.dialogue('Breakwater Boy', 'Wrong neighbourhood, café rat!');
  }

  finishMission() {
    const a = this.active;
    this.ctx.addMoney(a.def.reward);
    this.ctx.dialogue('Marisol', a.def.done);
    this.ctx.toast(`Mission complete: ${a.def.title} (+$${a.def.reward})`);
    this.active = null;
    this.index++;
    if (this.index >= MISSION_DEFS.length) { this.complete = true; this.index = 0; }
    this.crate.visible = false;
    this.ctx.save();
  }

  onEnterCar(car) {
    if (!this.active) return;
    const s = this.active.def.steps[this.active.stepIdx];
    if (s.type === 'enterVan' && this.ctx.van && car === this.ctx.van) this.advance();
  }

  update(dt) {
    // pillar follows the current marker
    const mp = this.markerPos();
    if (mp) {
      this.pillar.visible = true; this.ring.visible = true;
      this.pillar.position.set(mp.x, 13 + (mp.y || 0), mp.z);
      this.ring.position.set(mp.x, (mp.y || 0) + 0.15, mp.z);
      const s = 1 + Math.sin(performance.now() * 0.005) * 0.12;
      this.ring.scale.setScalar(s);
    } else { this.pillar.visible = false; this.ring.visible = false; }
    if (!this.active) return;
    const a = this.active, s = a.def.steps[a.stepIdx];
    const P = this.ctx.playerPos();
    if (s.time) {
      a.timer -= dt;
      if (a.timer <= 0) {
        this.ctx.dialogue('Marisol', 'Too slow! The moment has passed — let us try that again.');
        a.timer = s.time;
        this.ctx.toast('Out of time — try again');
      }
    }
    switch (s.type) {
      case 'goto': {
        const L = this.ctx.landmarks[s.at];
        if (dist2d(P.x, P.z, L.x, L.z) < s.r) this.advance();
        break;
      }
      case 'collect': {
        const sp = a.collectSpots[0];
        if (sp && dist2d(P.x, P.z, sp.x, sp.z) < 2.6) {
          a.collectSpots.shift(); a.collectLeft--;
          this.ctx.pickupSound();
          this.ctx.toast(`Crate collected (${a.collectTotal - a.collectLeft}/${a.collectTotal})`);
          if (a.collectLeft <= 0) { this.crate.visible = false; this.advance(); }
          else this.placeCrate();
        }
        break;
      }
      case 'loseHeat': {
        if (this.ctx.wanted() === 0) this.advance();
        break;
      }
      case 'shootout': {
        const L = this.ctx.landmarks[s.at];
        const alive = a.thugs.filter(th => th.state !== 'down');
        const nearWarehouse = dist2d(P.x, P.z, L.x, L.z) < s.r + 14;
        if (nearWarehouse && alive.length === 0) this.advance();
        else if (dist2d(P.x, P.z, this.ctx.landmarks.cafe.x, this.ctx.landmarks.cafe.z) < 10 && alive.length < a.thugs.length) {
          // escaped back to the café after dropping at least one thug
          this.advance();
        }
        break;
      }
    }
    if (this.crate.visible) this.crate.rotation.y += dt * 1.5;
  }
}
