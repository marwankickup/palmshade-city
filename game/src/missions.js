// missions.js — Marisol Vega vs the Breakwater Boys: a 7-mission story chain.
// Steps: goto / getin / drive / collect / escape, gold pillar markers, banner dialogue.

import * as THREE from 'three';
import { dist2d } from './util.js';

function buildMissions(L) {
  return [
    {
      title: 'First Delivery', reward: 250,
      intro: [
        ['Marisol Vega', 'You must be the new driver everyone talks about. I run Café Marisol — best cortadito on the beach.'],
        ['Marisol Vega', 'The Breakwater Boys keep "losing" my deliveries. Take my van and get these beans to Warehouse 7.'],
      ],
      steps: [
        { type: 'getin', tag: 'cafeVan', label: 'Get in Marisol\'s van' },
        { type: 'drive', x: L.warehouse.x, z: L.warehouse.z, label: 'Deliver the beans to Warehouse 7', radius: 10 },
      ],
      outro: [['Marisol Vega', 'Fast and clean. Maybe there is hope for this beach yet.']],
    },
    {
      title: 'Beach Run', reward: 300,
      intro: [
        ['Marisol Vega', 'Those boys scattered my supply crates all over the beach. Four of them.'],
        ['Marisol Vega', 'Pick them up and bring yourself back to the café. Watch the lifeguards — they gossip.'],
      ],
      steps: [
        { type: 'collect', label: 'Recover Marisol\'s crates', points: [
          { x: 220, z: 16 }, { x: 222, z: -44 }, { x: 220, z: 96 }, { x: 212, z: -124 },
        ] },
        { type: 'goto', x: L.cafe.x, z: L.cafe.z, label: 'Return to Café Marisol', radius: 9 },
      ],
      outro: [['Marisol Vega', 'All four! The Boys are losing their touch.']],
    },
    {
      title: 'Hot Goods', reward: 450,
      intro: [
        ['Marisol Vega', 'A van is waiting in the parking garage — do not ask what is inside.'],
        ['Marisol Vega', 'If the police get curious, lose them first, THEN deliver to Warehouse 7.'],
      ],
      steps: [
        { type: 'goto', x: L.garage.x, z: L.garage.z, label: 'Go to the parking garage', radius: 12 },
        { type: 'getin', tag: 'm3van', label: 'Take the unmarked van', spawn: { type: 'van', color: 0x8a8f96, x: -30, z: -12, heading: 0 } },
        { type: 'escape', label: 'Lose the police!', setWanted: 2, onStart: [['Radio', 'All units — grey van leaving the garage, move in!']] },
        { type: 'drive', x: L.warehouse.x, z: L.warehouse.z, label: 'Deliver to Warehouse 7', radius: 10 },
      ],
      outro: [['Marisol Vega', 'You drive like the tide — impossible to hold. Good work.']],
    },
    {
      title: 'Against the Clock', reward: 400, timeLimit: 150,
      intro: [
        ['Marisol Vega', 'A yacht chef at the marina needs my rum cakes, and a critic is downtown in 2 minutes.'],
        ['Marisol Vega', 'Marina first, then the downtown overlook. Do NOT be late, querido.'],
      ],
      steps: [
        { type: 'getin', tag: 'cafeVan', label: 'Get in Marisol\'s van', respawnVan: true },
        { type: 'drive', x: 202, z: 16, label: 'Race to the marina', radius: 12 },
        { type: 'drive', x: -222, z: -142, label: 'Race to the downtown overlook', radius: 11 },
      ],
      outro: [['Marisol Vega', 'With minutes to spare! The critic writes five stars, I can feel it.']],
    },
    {
      title: 'Marina Pickup', reward: 500,
      intro: [
        ['Marisol Vega', 'A fisherman at the end of the pier holds a package for me. On foot — the pier is narrow.'],
        ['Marisol Vega', 'Bring it back here. And if anyone asks — you were never there.'],
      ],
      steps: [
        { type: 'goto', x: L.pierEnd.x, z: L.pierEnd.z, label: 'Walk to the end of the pier', radius: 3.5, foot: true },
        { type: 'goto', x: L.cafe.x, z: L.cafe.z, label: 'Bring the package to Marisol', radius: 9, setWanted: 1,
          onStart: [['???', 'Hey! That crate is Breakwater property! I am calling the cops!']] },
      ],
      outro: [['Marisol Vega', 'Perfect. Whatever they told you about me — only half is true.']],
    },
    {
      title: 'Two Vans', reward: 600,
      intro: [
        ['Marisol Vega', 'Big night: two vans, two drops. First van waits at Warehouse 7 — take it to the marina depot.'],
        ['Marisol Vega', 'Then swap to the second van and bring it back to the warehouse. Simple, no?'],
      ],
      steps: [
        { type: 'getin', tag: 'm6vanA', label: 'Take the van at Warehouse 7', spawn: { type: 'van', color: 0x3fa7d6, x: -184, z: 160, heading: Math.PI / 2 } },
        { type: 'drive', x: 178, z: 62, label: 'Drive it to the marina depot', radius: 10 },
        { type: 'getin', tag: 'm6vanB', label: 'Swap to the second van', spawn: { type: 'van', color: 0x59c785, x: 178, z: 44, heading: Math.PI } },
        { type: 'drive', x: L.warehouse.x, z: L.warehouse.z, label: 'Bring it back to Warehouse 7', radius: 10 },
      ],
      outro: [['Marisol Vega', 'Flawless. The Boys could never.']],
    },
    {
      title: 'Warehouse Finale', reward: 1000,
      intro: [
        ['Marisol Vega', 'Tonight we end it. The Breakwater Boys stored everything they stole in Warehouse 7\'s yard.'],
        ['Marisol Vega', 'Take my van, grab the three marked crates on foot, shake the police, and come home.'],
      ],
      steps: [
        { type: 'getin', tag: 'cafeVan', label: 'Get in Marisol\'s van', respawnVan: true },
        { type: 'drive', x: L.warehouse.x, z: L.warehouse.z, label: 'Drive to Warehouse 7', radius: 10 },
        { type: 'collect', label: 'Grab the stolen crates', setWanted: 3, points: [
          { x: -184, z: 156 }, { x: -208, z: 146 }, { x: -194, z: 166 },
        ], onStart: [['Breakwater Boy', 'Hey! Hands off our crates!']] },
        { type: 'escape', label: 'Lose the police!' },
        { type: 'goto', x: L.cafe.x, z: L.cafe.z, label: 'Return to Marisol', radius: 9 },
      ],
      outro: [
        ['Marisol Vega', 'It is done. Palmshade is ours again, querido.'],
        ['Marisol Vega', 'The café is yours too — come by any time. The Boys will not trouble us again.'],
      ],
    },
  ];
}

export class Missions {
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx; // { landmarks, police, audio, showDialogue, setObjective, addMoney, autosave, spawnMissionCar, ensureCafeVan, getPlayerPos, getPlayerCar, banner }
    this.defs = buildMissions(ctx.landmarks);
    this.index = 0;              // next mission to run
    this.active = null;          // runtime mission state
    this.finishedStory = false;
    // gold pillar marker
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffc93c, transparent: true, opacity: 0.34,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.marker = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 30, 10, 1, true), beamMat);
    beam.position.y = 15;
    this.markerCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.8),
      new THREE.MeshLambertMaterial({ color: 0xffc93c, emissive: 0xcc8f10, emissiveIntensity: 1.2 }));
    this.markerCore.position.y = 2.2;
    this.marker.add(beam); this.marker.add(this.markerCore);
    scene.add(this.marker);
    // collect-crate visuals (reused)
    this.crateGrp = new THREE.Group();
    scene.add(this.crateGrp);
    this.crates = [];
  }

  setProgress(index, finishedStory) {
    this.index = Math.min(index, this.defs.length - 1);
    if (finishedStory) { this.finishedStory = true; this.index = index % this.defs.length; }
  }

  get available() { return !this.active; }

  // Where the player should head right now (for HUD distance + minimap).
  currentTarget() {
    if (this.active) {
      const step = this.active.def.steps[this.active.stepIdx];
      if (!step) return null;
      if (step.type === 'goto' || step.type === 'drive') return { x: step.x, z: step.z };
      if (step.type === 'getin') {
        const car = this.ctx.findTaggedCar(step.tag);
        return car ? { x: car.pos.x, z: car.pos.z } : null;
      }
      if (step.type === 'collect') {
        const left = this.crates.filter(c => !c.taken);
        if (left.length) {
          const p = this.ctx.getPlayerPos();
          left.sort((a, b) => dist2d(p.x, p.z, a.x, a.z) - dist2d(p.x, p.z, b.x, b.z));
          return { x: left[0].x, z: left[0].z };
        }
        return null;
      }
      if (step.type === 'escape') return null;
      return null;
    }
    // idle: point at Marisol
    const m = this.ctx.landmarks.marisol;
    return { x: m.x, z: m.z };
  }

  canInteract() {
    if (this.active) return false;
    const p = this.ctx.getPlayerPos();
    const m = this.ctx.landmarks.marisol;
    return dist2d(p.x, p.z, m.x, m.z) < 3.4 && !this.ctx.isDriving();
  }

  interact() {
    if (this.canInteract()) this.start(this.index);
  }

  start(idx) {
    const def = this.defs[idx];
    this.active = {
      def, idx, stepIdx: -1, timeLeft: def.timeLimit || null, collectLeft: 0,
    };
    this.ctx.showDialogue(def.intro, () => {});
    this._nextStep();
  }

  _clearCrates() {
    for (const c of this.crates) this.crateGrp.remove(c.mesh);
    this.crates = [];
  }

  _nextStep() {
    const a = this.active;
    if (!a) return;
    a.stepIdx++;
    this._clearCrates();
    if (a.stepIdx >= a.def.steps.length) { this._complete(); return; }
    const step = a.def.steps[a.stepIdx];
    if (step.setWanted) this.ctx.police.setWanted(step.setWanted);
    if (step.onStart) this.ctx.showDialogue(step.onStart, () => {});
    if (step.spawn && !this.ctx.findTaggedCar(step.tag)) {
      this.ctx.spawnMissionCar(step.spawn, step.tag);
    }
    if (step.respawnVan) this.ctx.ensureCafeVan();
    if (step.type === 'collect') {
      const mat = new THREE.MeshLambertMaterial({ color: 0xffc93c, emissive: 0x99700a, emissiveIntensity: 0.8 });
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0xffc93c, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      for (const pt of step.points) {
        const grp = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.85), mat);
        box.position.y = 0.6; box.castShadow = true;
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 6.5, 8, 1, true), beamMat);
        beam.position.y = 3.4;
        grp.add(box); grp.add(beam);
        grp.position.set(pt.x, 0, pt.z);
        this.crateGrp.add(grp);
        this.crates.push({ x: pt.x, z: pt.z, mesh: grp, taken: false });
      }
      a.collectLeft = step.points.length;
    }
    this.ctx.setObjective(this._objectiveText());
  }

  _objectiveText() {
    const a = this.active;
    if (!a) return '';
    const step = a.def.steps[a.stepIdx];
    if (!step) return '';
    let txt = step.label;
    if (step.type === 'collect') txt += ` (${a.def.steps[a.stepIdx].points.length - a.collectLeft}/${a.def.steps[a.stepIdx].points.length})`;
    if (a.timeLeft !== null) txt += ` — ${Math.ceil(a.timeLeft)}s`;
    return txt;
  }

  _complete() {
    const a = this.active;
    const def = a.def;
    this.active = null;
    this.ctx.addMoney(def.reward);
    this.ctx.audio.reward();
    this.ctx.showDialogue(def.outro, () => {});
    this.ctx.banner(`Mission complete: ${def.title}  +$${def.reward}`);
    if (a.idx === this.defs.length - 1 && !this.finishedStory) {
      this.finishedStory = true;
      this.index = 0;
    } else {
      this.index = (a.idx + 1) % this.defs.length;
    }
    this.ctx.setObjective('');
    this.ctx.autosave();
  }

  fail(reason) {
    if (!this.active) return;
    this.active = null;
    this._clearCrates();
    this.ctx.banner(`Mission failed — ${reason}. See Marisol to try again.`);
    this.ctx.setObjective('');
  }

  update(dt) {
    const t = performance.now() / 1000;
    // marker placement
    const target = this.currentTarget();
    if (target && (this.active || true)) {
      this.marker.visible = true;
      const gy = this.ctx.groundYAt(target.x, target.z);
      this.marker.position.set(target.x, gy, target.z);
      this.markerCore.rotation.y = t * 2;
      this.markerCore.position.y = 2.2 + Math.sin(t * 2.4) * 0.3;
    } else {
      this.marker.visible = false;
    }
    if (!this.active) {
      this.ctx.setObjective(this.finishedStory ? 'Free roam — see Marisol to replay a job' : 'See Marisol at Café Marisol for work');
      return;
    }
    const a = this.active;
    const step = a.def.steps[a.stepIdx];
    if (!step) return;
    if (a.timeLeft !== null) {
      a.timeLeft -= dt;
      if (a.timeLeft <= 0) { this.fail('out of time'); return; }
      if ((a.timeLeft * 2 | 0) !== ((a.timeLeft + dt) * 2 | 0)) this.ctx.setObjective(this._objectiveText());
    }
    const p = this.ctx.getPlayerPos();
    const driving = this.ctx.isDriving();
    const playerCar = this.ctx.getPlayerCar();
    switch (step.type) {
      case 'goto': {
        const r = step.radius || 6;
        if (dist2d(p.x, p.z, step.x, step.z) < r && (!step.foot || !driving)) this._nextStep();
        break;
      }
      case 'drive': {
        if (driving && dist2d(p.x, p.z, step.x, step.z) < (step.radius || 9)) this._nextStep();
        break;
      }
      case 'getin': {
        if (driving && playerCar && playerCar.missionTag === step.tag) this._nextStep();
        break;
      }
      case 'collect': {
        if (!driving) {
          for (const c of this.crates) {
            if (!c.taken && dist2d(p.x, p.z, c.x, c.z) < 1.8) {
              c.taken = true;
              this.crateGrp.remove(c.mesh);
              a.collectLeft--;
              this.ctx.audio.pickup();
              this.ctx.setObjective(this._objectiveText());
              if (a.collectLeft <= 0) { this._nextStep(); }
            }
          }
        }
        break;
      }
      case 'escape': {
        if (this.ctx.police.wanted <= 0.01) this._nextStep();
        break;
      }
    }
  }

  debugInfo() {
    if (!this.active) return { active: false, index: this.index, finishedStory: this.finishedStory };
    return {
      active: true, index: this.active.idx, title: this.active.def.title,
      stepIdx: this.active.stepIdx,
      stepType: this.active.def.steps[this.active.stepIdx]?.type,
      collectLeft: this.active.collectLeft,
    };
  }
}
