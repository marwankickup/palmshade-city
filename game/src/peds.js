// peds.js — pedestrians strolling block sidewalks; they flee danger and fall when hit.

import * as THREE from 'three';
import { ROAD_X, ROAD_Z, rand, choice, clamp, dist2d, angleLerp } from './util.js';

const SKIN = [0xc98a5e, 0x8a5a34, 0xe8b088, 0x6e4525];
const SHIRT = [0x3fa7d6, 0x59c785, 0xe77fb0, 0xf5d13d, 0xf0ead8, 0xff7f51, 0x8e6cc9, 0x2ec4b6];

function buildFigure(shirtColor, skinColor) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const pants = new THREE.MeshLambertMaterial({ color: choice([0x2c3e50, 0x5d4a36, 0x707880, 0x843c54]) });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.66, 0.28), shirt);
  torso.position.y = 1.16; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.32), skin);
  head.position.y = 1.68; head.castShadow = true;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.84, 0.19), pants);
  legL.geometry.translate(0, -0.42, 0); legL.position.set(-0.13, 0.84, 0);
  const legR = legL.clone(); legR.position.x = 0.13;
  g.add(torso); g.add(head); g.add(legL); g.add(legR);
  return { g, legL, legR };
}

// A rectangular sidewalk loop around a city block.
function blockLoop(bx, bz) {
  const hx = 34, hz = 34;
  return [
    { x: bx - hx, z: bz - hz }, { x: bx + hx, z: bz - hz },
    { x: bx + hx, z: bz + hz }, { x: bx - hx, z: bz + hz },
  ];
}

export class Peds {
  constructor(scene, count = 26) {
    this.list = [];
    // candidate block centres (between roads), plus the promenade
    const centres = [];
    for (let i = 0; i < ROAD_X.length - 1; i++) {
      for (let j = 0; j < ROAD_Z.length - 1; j++) {
        centres.push({ x: (ROAD_X[i] + ROAD_X[i + 1]) / 2, z: (ROAD_Z[j] + ROAD_Z[j + 1]) / 2 });
      }
    }
    for (let i = 0; i < count; i++) {
      const fig = buildFigure(choice(SHIRT), choice(SKIN));
      scene.add(fig.g);
      const onProm = i % 4 === 0;
      const ped = {
        ...fig,
        x: 0, z: 0, heading: rand(0, 6.28),
        speed: rand(1.1, 1.9),
        state: 'walk',       // walk | flee | down
        timer: 0,
        phase: rand(0, 6),
        loop: null, wp: 0,
        prom: onProm,
        dir: choice([1, -1]),
      };
      if (onProm) {
        ped.x = rand(184, 200); ped.z = rand(-190, 190);
      } else {
        const c = choice(centres);
        ped.loop = blockLoop(c.x, c.z);
        ped.wp = rand(0, 3) | 0;
        const start = ped.loop[ped.wp];
        ped.x = start.x + rand(-6, 6); ped.z = start.z + rand(-6, 6);
      }
      ped.g.position.set(ped.x, 0, ped.z);
      this.list.push(ped);
    }
  }

  // Danger event: peds near (x,z) run away.
  scare(x, z, radius = 16) {
    for (const p of this.list) {
      if (p.state === 'down') continue;
      if (dist2d(p.x, p.z, x, z) < radius) {
        p.state = 'flee';
        p.timer = rand(2.5, 4.5);
        p.fleeFrom = { x, z };
      }
    }
  }

  knockDown(ped) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.timer = rand(5, 8);
    ped.g.rotation.x = -Math.PI / 2;
    ped.g.position.y = 0.25;
  }

  update(dt, city) {
    for (const p of this.list) {
      if (p.state === 'down') {
        p.timer -= dt;
        if (p.timer <= 0) {
          p.state = 'walk';
          p.g.rotation.x = 0;
          p.g.position.y = 0;
        }
        continue;
      }
      let tx, tz, spd = p.speed;
      if (p.state === 'flee') {
        p.timer -= dt;
        const dx = p.x - p.fleeFrom.x, dz = p.z - p.fleeFrom.z;
        const d = Math.hypot(dx, dz) || 1;
        tx = p.x + (dx / d) * 10; tz = p.z + (dz / d) * 10;
        spd = 4.6;
        if (p.timer <= 0) p.state = 'walk';
      } else if (p.prom) {
        p.z += p.dir * spd * dt;
        if (p.z > 198 || p.z < -198) p.dir *= -1;
        tx = p.x; tz = p.z + p.dir * 10;
      } else {
        const target = p.loop[p.wp];
        tx = target.x; tz = target.z;
        if (dist2d(p.x, p.z, tx, tz) < 1.6) p.wp = (p.wp + 1) % p.loop.length;
      }
      const dx = tx - p.x, dz = tz - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const step = Math.min(d, spd * dt);
        let nx = p.x + (dx / d) * step;
        let nz = p.z + (dz / d) * step;
        [nx, nz] = city.collide(nx, nz, 0.4);
        p.x = nx; p.z = nz;
        p.heading = angleLerp(p.heading, Math.atan2(dx, dz), clamp(dt * 8, 0, 1));
      }
      p.phase += dt * spd * 3.4;
      const swing = Math.sin(p.phase) * 0.55;
      p.legL.rotation.x = swing;
      p.legR.rotation.x = -swing;
      p.g.position.set(p.x, Math.abs(Math.sin(p.phase)) * 0.04, p.z);
      p.g.rotation.y = p.heading;
    }
  }

  // Witness check: any standing ped within radius of a point?
  anyNear(x, z, radius) {
    for (const p of this.list) {
      if (p.state !== 'down' && dist2d(p.x, p.z, x, z) < radius) return true;
    }
    return false;
  }
}
