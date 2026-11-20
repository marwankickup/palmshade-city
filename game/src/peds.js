// peds.js — ~26 pedestrians: stroll sidewalks, flee danger, fall when hit.
import * as THREE from 'three';
import { mulberry32, angleLerp, dist2d, ROADS } from './util.js';

const rng = mulberry32(20261119);

const SHIRTS = [0xff6b81, 0xffd23e, 0x4ecdc4, 0xf7fff7, 0xff9f45, 0xa78bfa, 0x60a5fa, 0xf472b6, 0x34d399, 0xfb923c];
const SKINS = [0xf2c79b, 0xd9a066, 0xa06a3b, 0x7c4a21, 0xffe0bd];
const PANTS = [0x2b3a55, 0x5b3a29, 0x374151, 0x8a5a44, 0x1f2937];

function makeFigure() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: SKIRTS_PICK(SKINS), roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: SKIRTS_PICK(SHIRTS), roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: SKIRTS_PICK(PANTS), roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), shirt);
  torso.position.y = 1.12; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), skin);
  head.position.y = 1.62; head.castShadow = true; g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.78, 0.2), pants);
  legL.position.set(-0.12, 0.42, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.12; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.6, 0.15), shirt);
  armL.position.set(-0.32, 1.14, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.32; g.add(armR);
  g.userData.parts = { legL, legR, armL, armR, torso };
  return g;
}
function SKIRTS_PICK(arr) { return arr[(rng() * arr.length) | 0]; }

export class Peds {
  constructor(scene, count = 26) {
    this.scene = scene;
    this.list = [];
    for (let i = 0; i < count; i++) {
      const fig = makeFigure();
      scene.add(fig);
      const ped = {
        fig, group: fig, x: 0, z: 0, y: 0, heading: rng() * Math.PI * 2,
        speed: 1.1 + rng() * 0.7, state: 'stroll', timer: 2 + rng() * 5,
        phase: rng() * 9, downT: 0, fleeT: 0, tx: 0, tz: 0,
      };
      this.respawn(ped);
      this.list.push(ped);
    }
  }
  respawn(ped) {
    const c = ROADS[(rng() * ROADS.length) | 0];
    const side = rng() < 0.5 ? -1 : 1;
    if (rng() < 0.5) { ped.x = c + side * 9.4; ped.z = -280 + rng() * 560; }
    else { ped.x = -280 + rng() * 560; ped.z = c + side * 9.4; }
    ped.tx = ped.x; ped.tz = ped.z;
    ped.state = 'stroll'; ped.downT = 0; ped.fleeT = 0;
    ped.fig.rotation.set(0, ped.heading, 0);
    ped.fig.position.set(ped.x, 0, ped.z);
  }
  pickTarget(ped) {
    const along = (rng() - 0.5) * 90;
    if (rng() < 0.5) { ped.tx = Math.max(-288, Math.min(288, ped.x + along)); ped.tz = ped.z; }
    else { ped.tx = ped.x; ped.tz = Math.max(-288, Math.min(288, ped.z + along)); }
  }
  scare(x, z, r = 26) {
    for (const ped of this.list) {
      if (ped.state === 'down') continue;
      if (dist2d(ped.x, ped.z, x, z) < r) {
        ped.state = 'flee'; ped.fleeT = 2.2;
        ped.heading = Math.atan2(ped.x - x, ped.z - z);
      }
    }
  }
  witness(x, z, r) {
    for (const ped of this.list) {
      if (ped.state !== 'down' && dist2d(ped.x, ped.z, x, z) < r) return true;
    }
    return false;
  }
  // Carjacking: the driver of a stolen traffic car is dumped at the kerb and runs.
  ejectDriver(x, z) {
    let best = null, bd = -1;
    for (const ped of this.list) {
      if (ped.state === 'down' || ped.state === 'gone') continue;
      const d = dist2d(ped.x, ped.z, x, z);
      if (d > bd) { bd = d; best = ped; }
    }
    if (!best) return null;
    best.x = x + 2.1; best.z = z + 0.6;
    best.tx = best.x; best.tz = best.z;
    best.state = 'flee'; best.fleeT = 2.8;
    best.heading = Math.atan2(best.x - x, best.z - z);
    best.fig.position.set(best.x, 0, best.z);
    best.fig.rotation.set(0, best.heading, 0);
    return best;
  }
  hit(ped) {
    if (ped.state === 'down') return;
    ped.state = 'down'; ped.downT = 4;
    ped.fig.rotation.x = -Math.PI / 2;
    ped.fig.position.y = 0.25;
  }
  update(dt, dangers = []) {
    for (const ped of this.list) {
      if (ped.state === 'gone') continue; // riding in a taxi — hidden until dropped off
      if (ped.state === 'down') {
        ped.downT -= dt;
        if (ped.downT <= 0) { ped.fig.rotation.x = 0; ped.fig.position.y = 0; this.respawn(ped); }
        continue;
      }
      for (const d of dangers) {
        if (Math.abs(d.speed) > 9 && dist2d(ped.x, ped.z, d.x, d.z) < 9) {
          ped.state = 'flee'; ped.fleeT = 1.4;
          ped.heading = Math.atan2(ped.x - d.x, ped.z - d.z);
        }
      }
      let sp = ped.speed;
      if (ped.state === 'flee') {
        sp = 4.6;
        ped.fleeT -= dt;
        if (ped.fleeT <= 0) ped.state = 'stroll';
      } else {
        ped.timer -= dt;
        if (ped.timer <= 0 || dist2d(ped.x, ped.z, ped.tx, ped.tz) < 1.2) {
          this.pickTarget(ped);
          ped.timer = 4 + rng() * 6;
        }
        const want = Math.atan2(ped.tx - ped.x, ped.tz - ped.z);
        ped.heading = angleLerp(ped.heading, want, Math.min(1, dt * 4));
      }
      ped.x += Math.sin(ped.heading) * sp * dt;
      ped.z += Math.cos(ped.heading) * sp * dt;
      ped.x = Math.max(-292, Math.min(292, ped.x));
      ped.z = Math.max(-292, Math.min(292, ped.z));
      ped.phase += dt * sp * 3.4;
      const p = ped.fig.userData.parts;
      const s = Math.sin(ped.phase) * (ped.state === 'flee' ? 0.75 : 0.5);
      p.legL.rotation.x = s; p.legR.rotation.x = -s;
      p.armL.rotation.x = -s * 0.8; p.armR.rotation.x = s * 0.8;
      ped.fig.position.set(ped.x, 0, ped.z);
      ped.fig.rotation.y = ped.heading;
    }
  }
}
