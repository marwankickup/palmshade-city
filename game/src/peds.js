// Pedestrians: stylized figures strolling block-perimeter sidewalk loops and the
// beach promenade. They flee danger and fall when hit by a car.
import * as THREE from 'three';
import { dist2d } from './util.js';

const SHIRTS = [0xef9a9a, 0x9fc6e8, 0xf7d08a, 0xa8d5ba, 0xf4e1c1, 0xd5a8c6, 0xff7847, 0x62b06e, 0xe8e3d9, 0x2e86ab];
const SKINS = [0xc68863, 0x8a5a3b, 0xe8b48f, 0x6e4426, 0xd9a06b];

function buildFigure(rng) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: SKINS[(rng() * SKINS.length) | 0], roughness: 0.85 });
  const shirt = new THREE.MeshStandardMaterial({ color: SHIRTS[(rng() * SHIRTS.length) | 0], roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: [0x2c4a6e, 0x5d4a36, 0x39584a, 0x707880][(rng() * 4) | 0], roughness: 0.95 });
  const mk = (geo, mat, x, y, z, parent = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const legL = new THREE.Group(); legL.position.set(-0.13, 0.8, 0); g.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.13, 0.8, 0); g.add(legR);
  mk(new THREE.BoxGeometry(0.19, 0.8, 0.22), pants, 0, -0.4, 0, legL);
  mk(new THREE.BoxGeometry(0.19, 0.8, 0.22), pants, 0, -0.4, 0, legR);
  mk(new THREE.BoxGeometry(0.58, 0.68, 0.32), shirt, 0, 1.14, 0);
  mk(new THREE.BoxGeometry(0.38, 0.4, 0.38), skin, 0, 1.72, 0);
  if (rng() < 0.5) mk(new THREE.BoxGeometry(0.44, 0.14, 0.44), shirt, 0, 1.95, 0); // hat
  return { group: g, legL, legR };
}

export class Ped {
  constructor(scene, rng, loop) {
    const { group, legL, legR } = buildFigure(rng);
    this.group = group;
    this.legL = legL; this.legR = legR;
    this.loop = loop;
    this.seg = (rng() * loop.length) | 0;
    this.segT = rng();
    this.dir = rng() < 0.5 ? 1 : -1;
    this.speed = 1.1 + rng() * 0.8;
    this.state = 'walk';       // 'walk' | 'flee' | 'down'
    this.stateT = 0;
    this.fleeX = 0; this.fleeZ = 0;
    this._phase = rng() * 6;
    scene.add(group);
    this._placeOnLoop();
  }

  get pos() { return this.group.position; }

  _loopPoint(seg, t) {
    const a = this.loop[seg];
    const b = this.loop[(seg + 1) % this.loop.length];
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, len: Math.hypot(b.x - a.x, b.z - a.z) };
  }

  _placeOnLoop() {
    const p = this._loopPoint(this.seg, this.segT);
    this.pos.set(p.x, 0, p.z);
  }

  fall() {
    if (this.state === 'down') return;
    this.state = 'down';
    this.stateT = 3.6;
    this.group.rotation.x = -Math.PI / 2;
    this.group.position.y = 0.25;
  }

  update(dt, threats) {
    this.stateT -= dt;
    if (this.state === 'down') {
      if (this.stateT <= 0) {
        this.state = 'walk';
        this.group.rotation.x = 0;
        this.group.position.y = 0;
        this._placeOnLoop();
      }
      return;
    }
    // danger check
    let threat = null;
    for (const th of threats) {
      if (dist2d(this.pos.x, this.pos.z, th.x, th.z) < 11) { threat = th; break; }
    }
    if (threat) {
      this.state = 'flee';
      this.stateT = 1.6;
      const dx = this.pos.x - threat.x, dz = this.pos.z - threat.z;
      const d = Math.hypot(dx, dz) || 1;
      this.fleeX = dx / d; this.fleeZ = dz / d;
    }
    if (this.state === 'flee') {
      if (this.stateT <= 0 && !threat) {
        this.state = 'walk';
        // rejoin the loop at the nearest segment point
        let best = { d: Infinity, seg: 0, t: 0 };
        for (let s = 0; s < this.loop.length; s++) {
          for (let tt = 0; tt <= 1.001; tt += 0.1) {
            const p = this._loopPoint(s, tt);
            const d = dist2d(this.pos.x, this.pos.z, p.x, p.z);
            if (d < best.d) best = { d, seg: s, t: tt };
          }
        }
        this.seg = best.seg; this.segT = best.t;
      } else {
        this.pos.x += this.fleeX * 4.4 * dt;
        this.pos.z += this.fleeZ * 4.4 * dt;
        this.group.rotation.y = Math.atan2(this.fleeX, this.fleeZ);
        this._animate(dt, 11);
        return;
      }
    }
    // stroll the loop
    let remaining = this.speed * dt;
    while (remaining > 0) {
      const p = this._loopPoint(this.seg, this.segT);
      const segLeft = p.len * (this.dir > 0 ? 1 - this.segT : this.segT);
      if (remaining < segLeft) {
        this.segT += (remaining / p.len) * this.dir;
        remaining = 0;
      } else {
        remaining -= segLeft;
        if (this.dir > 0) { this.seg = (this.seg + 1) % this.loop.length; this.segT = 0; }
        else { this.seg = (this.seg - 1 + this.loop.length) % this.loop.length; this.segT = 1; }
      }
    }
    const p = this._loopPoint(this.seg, this.segT);
    const ahead = this._loopPoint(this.seg, this.segT + 0.02 * this.dir);
    this.pos.set(p.x, 0, p.z);
    this.group.rotation.y = Math.atan2(ahead.x - p.x, ahead.z - p.z);
    this._animate(dt, 7);
  }

  _animate(dt, rate) {
    this._phase += dt * rate;
    const swing = Math.sin(this._phase) * 0.5;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
  }
}

export class PedSystem {
  constructor(scene, rng, loops, count = 26) {
    this.peds = [];
    for (let i = 0; i < count; i++) {
      const loop = loops[(rng() * loops.length) | 0];
      this.peds.push(new Ped(scene, rng, loop));
    }
  }
  update(dt, threats) {
    for (const ped of this.peds) ped.update(dt, threats);
  }
}
