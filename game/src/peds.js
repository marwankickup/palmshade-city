// peds.js — pedestrians who stroll the sidewalks, flee from danger and
// fall when hit. They are also the city's witnesses: crimes near them count.

import * as THREE from 'three';
import { buildFigure } from './player.js';
import { ROADS_X, ROADS_Z, clamp, angleLerp, pick } from './util.js';

const SHIRTS = [0xf2a65a, 0x17a398, 0x7fb5d5, 0xef476f, 0xf7ede2, 0xffd166, 0x9fd8c9, 0xd9a7c7];
const PANTS = [0x33424e, 0x5d4030, 0x27313b, 0x707880, 0x59486e];

export class Peds {
  constructor(scene, rng, count = 26) {
    this.list = [];
    this.rng = rng;
    for (let i = 0; i < count; i++) {
      const f = buildFigure({ shirt: pick(rng, SHIRTS), pants: pick(rng, PANTS), cap: pick(rng, SHIRTS) });
      const onAve = rng() < 0.5;
      const road = onAve ? pick(rng, ROADS_X) : pick(rng, ROADS_Z);
      const side = rng() < 0.5 ? -8.9 : 8.9;
      const along = -160 + rng() * 250;
      const x = onAve ? road + side : clamp(along, -185, 185);
      const z = onAve ? clamp(along, -168, 100) : road + side;
      f.group.position.set(x, 0, z);
      scene.add(f.group);
      this.list.push({
        ...f, pos: f.group.position, heading: rng() * 6.28,
        speed: 1.1 + rng() * 0.9, phase: rng() * 6.28,
        state: 'walk', timer: 2 + rng() * 6, tx: x, tz: z,
        onAve, road, side,
      });
    }
  }

  newTarget(p) {
    const rng = this.rng;
    if (p.onAve) { p.tx = p.road + p.side; p.tz = clamp(p.pos.z + (rng() - 0.5) * 160, -168, 104); }
    else { p.tz = p.road + p.side; p.tx = clamp(p.pos.x + (rng() - 0.5) * 160, -188, 188); }
    if (rng() < 0.22) { // cross to the other sidewalk or turn onto a cross street
      p.side = -p.side;
      if (rng() < 0.4) { p.onAve = !p.onAve; p.road = p.onAve ? pick(rng, ROADS_X) : pick(rng, ROADS_Z); }
    }
  }

  scare(x, z, radius = 13) {
    for (const p of this.list) {
      if (p.state === 'down') continue;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < radius) { p.state = 'flee'; p.timer = 2.6; p.fx = x; p.fz = z; }
    }
  }

  checkCarHit(car) {
    if (Math.abs(car.speed) < 3.5) return false;
    let hitAny = false;
    for (const p of this.list) {
      if (p.state === 'down') continue;
      const d = Math.hypot(p.pos.x - car.x, p.pos.z - car.z);
      if (d < 1.7) {
        p.state = 'down'; p.timer = 5;
        p.group.rotation.x = -Math.PI / 2;
        p.group.position.y = 0.25;
        hitAny = true;
      }
    }
    return hitAny;
  }

  update(dt, G) {
    for (const p of this.list) {
      if (p.state === 'down') {
        p.timer -= dt;
        if (p.timer <= 0) { p.state = 'walk'; p.group.rotation.x = 0; p.group.position.y = 0; this.newTarget(p); }
        continue;
      }
      let speed = p.speed, tx = p.tx, tz = p.tz;
      if (p.state === 'flee') {
        p.timer -= dt;
        const dx = p.pos.x - p.fx, dz = p.pos.z - p.fz;
        const dl = Math.hypot(dx, dz) || 1;
        tx = p.pos.x + (dx / dl) * 10; tz = p.pos.z + (dz / dl) * 10;
        speed = 4.4;
        if (p.timer <= 0) { p.state = 'walk'; this.newTarget(p); }
      } else if (Math.hypot(tx - p.pos.x, tz - p.pos.z) < 1.2) {
        this.newTarget(p);
        continue;
      }
      const targetHeading = Math.atan2(tx - p.pos.x, tz - p.pos.z);
      p.heading = angleLerp(p.heading, targetHeading, Math.min(1, dt * 8));
      let nx = p.pos.x + Math.sin(p.heading) * speed * dt;
      let nz = p.pos.z + Math.cos(p.heading) * speed * dt;
      const res = G.city.collideCircle(nx, nz, 0.35, p.pos.y);
      p.pos.x = clamp(res.x, -192, 192);
      p.pos.z = clamp(res.z, -176, 162);
      p.pos.y = G.city.groundAt(p.pos.x, p.pos.z, p.pos.y);
      p.group.rotation.y = p.heading;
      p.phase += dt * (p.state === 'flee' ? 13 : 8);
      const sw = Math.sin(p.phase) * 0.5;
      p.lLeg.rotation.x = sw; p.rLeg.rotation.x = -sw;
      p.lArm.rotation.x = -sw * 0.7; p.rArm.rotation.x = sw * 0.7;
    }
  }
}
