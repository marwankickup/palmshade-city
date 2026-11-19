// Seven-mission story chain: Marisol Vega (café owner) vs the Breakwater Boys.
// Step types: getin / goto / collect / escape, with banner dialogue, a gold
// pillar marker, cash rewards and one timed mission. Replayable when done.
import * as THREE from 'three';
import { LANDMARKS } from './city.js';
import { dist2d } from './util.js';

const CAFE = LANDMARKS.cafe;
const YARD = LANDMARKS.warehouseYard;

export const MISSIONS = [
  {
    name: 'First Run', reward: 300,
    intro: [
      ['Marisol', 'You must be the new driver. Marisol Vega — I run Café Marisol, and half this beach eats my lunches.'],
      ['Marisol', 'My van is outside. Take the catering order to the Breakwater Warehouse yard, south-west corner of town.'],
    ],
    done: 'Paid in full. You drive clean — I like that.',
    steps: [
      { type: 'getin', vehicle: 'van', color: 0xf2c14e, x: 107, z: -14, heading: 0, label: 'the delivery van' },
      { type: 'goto', x: YARD.x, z: YARD.z, r: 13, needCar: true, label: 'the warehouse yard' },
    ],
  },
  {
    name: 'Three Packages', reward: 400,
    intro: [
      ['Marisol', 'The Breakwater Boys keep "losing" my supply drops. Three packages are scattered around town.'],
      ['Marisol', 'Grab all three and bring them back to the café.'],
    ],
    done: 'All three! The Boys are losing their touch.',
    steps: [
      { type: 'collect', points: [{ x: -40, z: -98 }, { x: 48, z: 8 }, { x: 100, z: 62 }], label: 'packages' },
      { type: 'goto', x: 88, z: -35, r: 9, label: 'Café Marisol' },
    ],
  },
  {
    name: 'Borrowed Wheels', reward: 500,
    intro: [
      ['Marisol', 'See that coral sports car parked up the road? The Boys stole it from my cousin Rosa.'],
      ['Marisol', 'Take it back and park it at the warehouse yard. My crew will handle any... attention.'],
    ],
    done: 'Rosa gets her car back, and the Boys get the message.',
    steps: [
      { type: 'getin', vehicle: 'sport', color: 0xff6b5e, x: -28, z: 96, heading: Math.PI, label: "Rosa's sports car", hot: true },
      { type: 'goto', x: YARD.x, z: YARD.z, r: 13, needCar: true, label: 'the warehouse yard', clearHeat: true },
    ],
  },
  {
    name: 'Against the Clock', reward: 450, timeLimit: 95,
    intro: [
      ['Marisol', 'Lunch rush! Three of my cafés need orders before the ice melts.'],
      ['Marisol', 'Hit every gold marker before the clock runs out. Fast car, faster driver — go!'],
    ],
    done: 'Every order delivered, ice intact. Incredible.',
    steps: [
      { type: 'goto', x: 112, z: -140, r: 11, needCar: true, label: 'the north Ocean Drive drop' },
      { type: 'goto', x: -28, z: -140, r: 11, needCar: true, label: 'the north-west drop' },
      { type: 'goto', x: -98, z: 0, r: 11, needCar: true, label: 'the midtown drop' },
    ],
  },
  {
    name: 'Marina Parts', reward: 600,
    intro: [
      ['Marisol', 'My brother\'s boat parts are at the end of the marina pier. Too narrow for cars — you\'ll walk it.'],
      ['Marisol', 'Careful: the Boys have been hanging around the docks.'],
    ],
    done: 'The boat runs again. You\'re a one-person marina.',
    steps: [
      { type: 'goto', x: 224, z: 32, r: 6.5, onFoot: true, label: 'the boat parts at the pier end', setWanted: 2,
        say: [['Marisol (phone)', 'You found them? Good. Now the Boys are calling the cops — get those parts to the warehouse!']] },
      { type: 'goto', x: YARD.x, z: YARD.z, r: 13, label: 'the warehouse yard' },
    ],
  },
  {
    name: 'Convoy', reward: 800,
    intro: [
      ['Marisol', 'Big day: two vans, two deliveries, same warehouse. The Boys will be watching the roads.'],
      ['Marisol', 'One van at a time. I\'ll have the second warmed up when you\'re back.'],
    ],
    done: 'Both vans, both loads. The docks eat well tonight.',
    steps: [
      { type: 'getin', vehicle: 'van', color: 0x62b06e, x: 107, z: -14, heading: 0, label: 'the first van' },
      { type: 'goto', x: YARD.x, z: YARD.z, r: 13, needCar: true, label: 'the warehouse yard' },
      { type: 'getin', vehicle: 'van', color: 0x3f7fbf, x: 107, z: -14, heading: 0, label: 'the second van' },
      { type: 'goto', x: YARD.x, z: YARD.z, r: 13, needCar: true, label: 'the warehouse yard' },
    ],
  },
  {
    name: 'Breakwater Finale', reward: 1200,
    intro: [
      ['Marisol', 'Last job, driver. The Boys are holding my ledger in their own warehouse yard. Poetic, right?'],
      ['Marisol', 'Walk in, take it back, lose the heat, and come home to the café. Expect company.'],
    ],
    done: 'You did it. Palmshade\'s lunch is safe, and so is my business. You\'re family now, driver.',
    steps: [
      { type: 'goto', x: YARD.x, z: YARD.z, r: 13, label: 'the warehouse yard' },
      { type: 'collect', points: [{ x: -112, z: 124 }], label: 'the ledger', onFoot: true, setWanted: 3,
        say: [['Marisol (phone)', 'That\'s it! Now disappear — the whole precinct is coming!']] },
      { type: 'escape', label: 'Lose the police!' },
      { type: 'goto', x: 88, z: -35, r: 10, label: 'Café Marisol' },
    ],
  },
];

function buildMarisol(scene) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x8a5a3b, roughness: 0.85 });
  const dress = new THREE.MeshStandardMaterial({ color: 0xd95f4b, roughness: 0.9 });
  const mk = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  mk(new THREE.ConeGeometry(0.42, 1.1, 8), dress, 0, 0.55, 0);
  mk(new THREE.BoxGeometry(0.55, 0.55, 0.3), dress, 0, 1.3, 0);
  mk(new THREE.BoxGeometry(0.38, 0.4, 0.38), skin, 0, 1.78, 0);
  mk(new THREE.SphereGeometry(0.24, 8, 6), new THREE.MeshStandardMaterial({ color: 0x2c1c10, roughness: 1 }), 0, 2.02, 0);
  g.position.set(LANDMARKS.marisol.x, 0, LANDMARKS.marisol.z);
  g.rotation.y = Math.PI / 2; // face the street
  scene.add(g);
  return g;
}

export class MissionSystem {
  constructor(scene, hooks) {
    this.hooks = hooks;
    this.index = 0;              // next mission to run
    this.active = null;          // current mission def
    this.activeIndex = -1;
    this.stepIdx = 0;
    this.rt = { car: null, collectIdx: 0 };
    this.timeLeft = null;
    this.completedAll = false;
    this.replay = false;
    buildMarisol(scene);
    // gold pillar marker
    this.marker = new THREE.Group();
    const pillarMat = new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 42, 12, 1, true), pillarMat);
    pillar.position.y = 21;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 42, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe98a, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    core.position.y = 21;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.16, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd94d }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.25;
    this.marker.add(pillar, core, this.ring);
    this.marker.visible = false;
    scene.add(this.marker);
  }

  get step() { return this.active ? this.active.steps[this.stepIdx] : null; }

  canTalk(playerPos) {
    return !this.active && dist2d(playerPos.x, playerPos.z, LANDMARKS.marisol.x, LANDMARKS.marisol.z) < 4.2;
  }

  startNext() {
    if (this.active) return;
    if (this.index >= MISSIONS.length) { this.index = 0; this.replay = true; }
    this.startMission(this.index);
  }

  startMission(i) {
    this.active = MISSIONS[i];
    this.activeIndex = i;
    this.stepIdx = 0;
    this.rt = { car: null, collectIdx: 0 };
    this.timeLeft = this.active.timeLimit || null;
    this.hooks.say(this.active.intro);
    this.hooks.toast(`Mission: ${this.active.name}`);
    this._initStep();
  }

  _initStep() {
    const step = this.step;
    if (!step) return;
    if (step.type === 'getin' && !this.rt.car) {
      this.rt.car = this.hooks.spawnCar(step.vehicle, step.color, step.x, step.z, step.heading);
      this.rt.car.missionVehicle = true;
    }
    // note: step.say / step.setWanted fire on step COMPLETION (arrival, pickup),
    // see _advanceStep — e.g. the marina ambush triggers when the parts are grabbed.
  }

  _cleanupCars() {
    if (this.rt.car) {
      this.hooks.removeCar(this.rt.car);
      this.rt.car = null;
    }
  }

  _fail(reason) {
    this.hooks.say([['Marisol', reason]]);
    this._cleanupCars();
    const idx = this.activeIndex;
    this.active = null;
    this.startMission(idx);
  }

  _completeMission() {
    const reward = this.replay ? Math.round(this.active.reward / 2) : this.active.reward;
    this.hooks.giveMoney(reward);
    this.hooks.say([['Marisol', this.active.done], ['Mission complete', `+ $${reward} — ${this.active.name}`]]);
    this._cleanupCars();
    this.active = null;
    this.index = this.activeIndex + 1;
    if (this.index >= MISSIONS.length) this.completedAll = true;
    this.hooks.autosave();
  }

  _advanceStep() {
    const step = this.step;
    if (step) {
      if (step.say) this.hooks.say(step.say);
      if (step.setWanted) this.hooks.setWanted(step.setWanted);
      if (step.clearHeat) this.hooks.clearWanted();
    }
    this.stepIdx++;
    this.rt.collectIdx = 0;
    if (this.stepIdx >= this.active.steps.length) this._completeMission();
    else this._initStep();
  }

  markerTarget() {
    const step = this.step;
    if (!step) return null;
    if (step.type === 'getin') return this.rt.car ? { x: this.rt.car.pos.x, z: this.rt.car.pos.z } : { x: step.x, z: step.z };
    if (step.type === 'goto') return { x: step.x, z: step.z };
    if (step.type === 'collect') {
      const p = step.points[this.rt.collectIdx];
      return p ? { x: p.x, z: p.z } : null;
    }
    return null;
  }

  objectiveText() {
    const step = this.step;
    if (!step) return '';
    const time = this.timeLeft !== null ? ` — ${Math.ceil(this.timeLeft)}s left` : '';
    switch (step.type) {
      case 'getin': return `Get in ${step.label}${time}`;
      case 'goto': return `${step.onFoot ? 'Walk' : step.needCar ? 'Drive' : 'Go'} to ${step.label}${time}`;
      case 'collect': return `Collect ${step.label} (${this.rt.collectIdx}/${step.points.length})${time}`;
      case 'escape': return step.label;
      default: return '';
    }
  }

  update(dt, game) {
    // marker follows the current target, ring pulses
    const target = this.markerTarget();
    if (target) {
      this.marker.visible = true;
      this.marker.position.set(target.x, 0, target.z);
      const s = 1 + Math.sin(game.t * 3.2) * 0.15;
      this.ring.scale.set(s, s, 1);
    } else {
      this.marker.visible = false;
    }
    if (!this.active) return;

    // timed mission countdown
    if (this.timeLeft !== null) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this._fail('Out of time! The ice melted... let\'s run it again.');
        return;
      }
    }
    // wrecked mission vehicle = fail
    const step = this.step;
    if (this.rt.car && this.rt.car.dead && (step.type === 'getin' || (step.type === 'goto' && step.needCar))) {
      this._fail('The vehicle was wrecked! Let\'s try that again.');
      return;
    }
    if (!step) return;
    const p = game.player;
    switch (step.type) {
      case 'getin':
        if (p.mode === 'car' && p.car === this.rt.car) this._advanceStep();
        break;
      case 'goto': {
        if (step.needCar && p.mode !== 'car') break;
        if (step.onFoot && p.mode !== 'foot') break;
        if (dist2d(p.pos.x, p.pos.z, step.x, step.z) < step.r) this._advanceStep();
        break;
      }
      case 'collect': {
        if (step.onFoot && p.mode !== 'foot') break;
        const pt = step.points[this.rt.collectIdx];
        if (pt && dist2d(p.pos.x, p.pos.z, pt.x, pt.z) < 4.2) {
          this.rt.collectIdx++;
          this.hooks.toast(`Collected (${this.rt.collectIdx}/${step.points.length})`);
          if (this.rt.collectIdx >= step.points.length) this._advanceStep();
        }
        break;
      }
      case 'escape':
        if (game.wanted === 0) this._advanceStep();
        break;
    }
  }
}
