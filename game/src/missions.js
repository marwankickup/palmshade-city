// missions.js — a 7-mission story chain: Marisol Vega of Café Marisol vs
// the Breakwater Boys. A generic step engine (talk / getin / goto / collect /
// escape / timed / hold) drives gold pillar markers, banner dialogue, cash
// rewards and autosaves. The chain is replayable once finished.

import * as THREE from 'three';
import { buildFigure } from './player.js';

const L = {
  cafe: { x: 0, z: 110.5 }, dock: { x: 130, z: -90 }, garage: { x: 60, z: -92 },
  marina: { x: 122, z: 168 }, pierEnd: { x: 122, z: 205 }, wh: { x: 122, z: -97 },
  plaza: { x: 0, z: 70 },
};

export const MISSIONS = [
  {
    title: 'First Delivery',
    intro: [['Marisol', 'My café van is loaded with tonight\'s catch. The Breakwater Boys keep "losing" my deliveries — get it to their warehouse dock and prove we deliver on time.']],
    steps: [
      { type: 'getin', text: 'Get in Marisol\'s delivery van', at: L.plaza },
      { type: 'goto', text: 'Deliver the van to the warehouse dock', at: L.dock, r: 10 },
    ],
    reward: 250,
    outro: [['Marisol', 'Right on time. Maybe you\'re exactly who this café needed.']],
  },
  {
    title: 'Beach Run',
    intro: [['Marisol', 'Three crates of plantains washed off a truck along the beach. Grab them before the tide — or the Boys — do.']],
    steps: [
      { type: 'collect', text: 'Collect the washed-up crates (0/3)', points: [{ x: -60, z: 148 }, { x: 84, z: 146 }, { x: -140, z: 142 }], r: 3.2 },
      { type: 'talk', text: 'Bring the crates back to Marisol', at: L.cafe, r: 3.4 },
    ],
    reward: 300,
    outro: [['Marisol', 'Plantain night is saved. The regulars send their love.']],
  },
  {
    title: 'Hot Van',
    intro: [['Marisol', 'That van at the parking garage? It "belongs" to the Boys now — take it back and park it at the marina. Quietly, if you can.']],
    steps: [
      { type: 'getin', text: 'Take the van at the parking garage', at: L.garage, anyVan: true },
      { type: 'goto', text: 'Park the van at the marina', at: L.marina, r: 10 },
    ],
    reward: 350,
    outro: [['Marisol', 'Right under their noses. Beautiful.']],
  },
  {
    title: 'Escape Artist',
    intro: [['Marisol', 'The Boys tipped off the PD that my warehouse delivery was "stolen goods". Head there, let them see you — then lose them.']],
    steps: [
      { type: 'goto', text: 'Show yourself at the warehouse', at: L.wh, r: 11, heat: 3 },
      { type: 'escape', text: 'Lose the police!' },
    ],
    reward: 400,
    outro: [['Marisol', 'Gone like sea mist. They\'ll think twice now.']],
  },
  {
    title: 'Timed Tuna',
    intro: [['Marisol', 'A sushi chef at the pier end is paying double for this tuna — but only if it lands in 75 seconds. Fly, but don\'t wreck it.']],
    steps: [
      { type: 'getin', text: 'Get in the delivery van', at: L.plaza },
      { type: 'timed', text: 'Reach the pier end — fast!', at: L.pierEnd, r: 9, time: 75 },
    ],
    reward: 450,
    outro: [['Marisol', 'Double pay, just like he promised. You\'re a natural.']],
  },
  {
    title: 'Marina Parts',
    intro: [['Marisol', 'My cousin\'s boat engine died. Pick up the spare parts at the marina office and drop them at the garage.']],
    steps: [
      { type: 'goto', text: 'Pick up the parts at the marina', at: L.marina, r: 8 },
      { type: 'goto', text: 'Drop the parts at the parking garage', at: L.garage, r: 10 },
    ],
    reward: 500,
    outro: [['Marisol', 'The boat roars again. One more favour and this town owes you.']],
  },
  {
    title: 'Warehouse Finale',
    intro: [['Marisol', 'Tonight we end it. Hold the warehouse yard while my people move the real stock out the back — two minutes of heat, then vanish.']],
    steps: [
      { type: 'goto', text: 'Get to the warehouse yard', at: L.wh, r: 12 },
      { type: 'hold', text: 'Hold the yard! (0s)', at: L.wh, r: 16, time: 45, heat: 3 },
      { type: 'escape', text: 'Now vanish — lose the police!' },
    ],
    reward: 900,
    outro: [['Marisol', 'It\'s over. Palmshade eats free at my café forever — and so do you, partner.']],
  },
];

export class Missions {
  constructor(scene, G) {
    this.G = G;
    this.index = 0;         // next mission to offer
    this.active = null;     // { def, stepIdx, collectGot:Set, timer, holdT }
    this.doneAll = false;
    // gold pillar marker
    const geo = new THREE.CylinderGeometry(1.1, 1.1, 34, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffc21f, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.marker = new THREE.Mesh(geo, mat);
    this.marker.visible = false;
    scene.add(this.marker);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 34, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffdf6b, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.marker.add(core);
    // Marisol NPC on the café terrace
    const fig = buildFigure({ shirt: 0xf2a65a, pants: 0xf7ede2, skin: 0xb97a56, cap: 0x17a398 });
    this.npc = fig.group;
    this.npc.position.set(3, 0.9, 110.5);
    this.npc.rotation.y = Math.PI;
    scene.add(this.npc);
    // physical crates for the Beach Run collection step (shown only then)
    this.collectCrates = [];
    const crateGeo = new THREE.BoxGeometry(0.85, 0.85, 0.85);
    const crateMat = new THREE.MeshLambertMaterial({ color: 0xd9a441, emissive: 0xffd60a, emissiveIntensity: 0.22 });
    for (const m of MISSIONS) for (const s of m.steps) {
      if (s.type !== 'collect') continue;
      for (const pt of s.points) {
        const c = new THREE.Mesh(crateGeo, crateMat);
        c.position.set(pt.x, 0.45, pt.z);
        c.castShadow = true;
        c.visible = false;
        scene.add(c);
        this.collectCrates.push(c);
      }
    }
  }

  refreshCollectCrates() {
    const s = this.currentStep;
    const show = !!(s && s.type === 'collect');
    this.collectCrates.forEach((c, i) => {
      c.visible = show && !(this.active && this.active.collectGot.has(i));
    });
  }

  get currentStep() {
    if (!this.active) return null;
    return this.active.def.steps[this.active.stepIdx];
  }

  setMarker(x, z, y = 0) {
    if (x === null) { this.marker.visible = false; this.G.missionTarget = null; return; }
    this.marker.visible = true;
    this.marker.position.set(x, y + 17, z);
    this.G.missionTarget = { x, z };
  }

  // Called when the player presses E near Marisol with no active mission.
  tryStart() {
    if (this.active || this.doneAll) return false;
    const def = MISSIONS[this.index];
    this.active = { def, stepIdx: 0, collectGot: new Set(), timer: 0, holdT: 0 };
    for (const [who, line] of def.intro) this.G.showDialogue(who, line);
    this.applyStepEntry();
    this.G.audio.click();
    return true;
  }

  applyStepEntry() {
    const s = this.currentStep;
    if (!s) return;
    const G = this.G;
    if (s.heat) G.police.setWanted(Math.max(G.police.wanted, s.heat));
    if (s.type === 'timed') this.active.timer = s.time;
    if (s.type === 'hold') this.active.holdT = 0;
    if (s.type === 'collect') this.refreshCollectMarkers();
    else if (s.type === 'getin' && !s.anyVan && G.missionVan) this.setMarker(G.missionVan.x, G.missionVan.z);
    else if (s.at) this.setMarker(s.at.x, s.at.z);
    else this.setMarker(null);
    this.refreshCollectCrates();
    G.setObjective(s.text);
  }

  refreshCollectMarkers() {
    // marker shows the nearest un-collected crate
    const s = this.currentStep;
    const p = this.G.player;
    let best = null, bd = Infinity;
    s.points.forEach((pt, i) => {
      if (this.active.collectGot.has(i)) return;
      const d = Math.hypot(p.x - pt.x, p.z - pt.z);
      if (d < bd) { bd = d; best = pt; }
    });
    if (best) this.setMarker(best.x, best.z);
  }

  // main tells missions when the player enters a vehicle
  onEnterVehicle(car) {
    const s = this.currentStep;
    if (!s || s.type !== 'getin') return;
    if (s.anyVan) { if (car.type === 'van') this.advance(); }
    else if (car === this.G.missionVan) this.advance();
  }

  advance() {
    const G = this.G;
    this.active.stepIdx++;
    if (this.active.stepIdx >= this.active.def.steps.length) {
      const def = this.active.def;
      this.active = null;
      this.index++;
      if (this.index >= MISSIONS.length) { this.doneAll = true; this.index = 0; }
      this.setMarker(null);
      G.setObjective('');
      for (const [who, line] of def.outro) G.showDialogue(who, line);
      G.addMoney(def.reward, true);
      G.showBanner('MISSION COMPLETE', def.title + '  ·  +$' + def.reward);
      G.saveGame();
      return;
    }
    this.applyStepEntry();
  }

  fail(reason) {
    const G = this.G;
    this.active = null;
    this.setMarker(null);
    G.setObjective('');
    G.showBanner('MISSION FAILED', reason + ' — talk to Marisol to try again');
  }

  playerNearMarisol() {
    const p = this.G.player;
    return !p.inVehicle && Math.hypot(p.x - 3, p.z - 110.5) < 3.6 && Math.abs(p.pos.y - 0.9) < 1.6;
  }

  update(dt) {
    const G = this.G, p = G.player;
    // idle marker over Marisol when a mission is available
    if (!this.active && !this.doneAll && G.state === 'playing') {
      this.setMarker(3, 110.5, 0.9);
      G.missionTarget = { x: 3, z: 110.5 };
    }
    if (!this.active) return;
    const s = this.currentStep;
    if (!s) return;
    const pp = p.inVehicle ? p.inVehicle.pos : p.pos;
    switch (s.type) {
      case 'talk': {
        if (!p.inVehicle && Math.hypot(p.x - s.at.x, p.z - s.at.z) < (s.r || 3.4)) this.advance();
        break;
      }
      case 'goto': {
        if (Math.hypot(pp.x - s.at.x, pp.z - s.at.z) < (s.r || 9)) this.advance();
        break;
      }
      case 'timed': {
        this.active.timer -= dt;
        G.setObjective(s.text + '  ·  ' + Math.max(0, Math.ceil(this.active.timer)) + 's');
        if (Math.hypot(pp.x - s.at.x, pp.z - s.at.z) < (s.r || 9)) this.advance();
        else if (this.active.timer <= 0) this.fail('Out of time');
        break;
      }
      case 'collect': {
        if (!p.inVehicle) {
          s.points.forEach((pt, i) => {
            if (this.active.collectGot.has(i)) return;
            if (Math.hypot(p.x - pt.x, p.z - pt.z) < s.r) {
              this.active.collectGot.add(i);
              G.addMoney(40);
              G.audio.pickup();
              G.setObjective('Collect the washed-up crates (' + this.active.collectGot.size + '/3)');
              this.refreshCollectMarkers();
              this.refreshCollectCrates();
            }
          });
          if (this.active.collectGot.size >= s.points.length) this.advance();
        }
        break;
      }
      case 'escape': {
        if (G.police.wanted === 0) this.advance();
        break;
      }
      case 'hold': {
        const inside = Math.hypot(pp.x - s.at.x, pp.z - s.at.z) < s.r;
        if (inside) {
          this.active.holdT += dt;
          G.setObjective('Hold the yard! (' + Math.floor(this.active.holdT) + 's / ' + s.time + 's)');
          if (this.active.holdT >= s.time) this.advance();
        }
        break;
      }
    }
  }
}
