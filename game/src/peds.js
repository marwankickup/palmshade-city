// peds.js — pedestrians: stylized figures strolling the sidewalks, fleeing
// danger, and going down when a car clips them. Also exports the figure
// builder the missions use for Marisol.
import * as THREE from 'three';
import { ROAD_XS, ROAD_ZS, clamp, lerpAngle, dist2 } from './util.js';

export function buildFigure({ shirt = 0xe2603f, pants = 0x2c3e50, skin = 0xc98a5e, hair = 0x2a1c10, dress = false } = {}) {
  const g = new THREE.Group();
  const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const shirtM = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 });
  const pantsM = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const hairM = new THREE.MeshStandardMaterial({ color: hair, roughness: 1 });
  const mk = (w, h, d, mat, x, y, z, pivotTop = false) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (pivotTop) geo.translate(0, -h / 2, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m); return m;
  };
  const torso = mk(0.6, 0.72, 0.33, shirtM, 0, 1.06, 0);
  if (dress) mk(0.66, 0.5, 0.4, shirtM, 0, 0.62, 0);
  const head = mk(0.4, 0.42, 0.4, skinM, 0, 1.66, 0);
  mk(0.44, 0.14, 0.44, hairM, 0, 1.9, 0);
  const armL = mk(0.16, 0.64, 0.16, shirtM, -0.39, 1.36, 0, true);
  const armR = mk(0.16, 0.64, 0.16, shirtM, 0.39, 1.36, 0, true);
  const legL = mk(0.2, 0.72, 0.2, pantsM, -0.15, 0.72, 0, true);
  const legR = mk(0.2, 0.72, 0.2, pantsM, 0.15, 0.72, 0, true);
  return { group: g, armL, armR, legL, legR, torso, head };
}

const SHIRTS = [0x3f7fbf, 0xf2b13c, 0x3fae8a, 0xef7fb0, 0xe8e2d4, 0x8a5fb0, 0xe2603f, 0x7fb069, 0x4a6fa5, 0xd8544a];
const PANTS = [0x2c3e50, 0x5d4a36, 0x34495e, 0x6e5636, 0x22303c, 0x71584a];

export function createPeds(game) {
  const rng = game.rng;
  const list = [];

  function sidewalkLoop() {
    // a rectangle loop around one block, on the sidewalk
    const xi = rng.int(0, ROAD_XS.length - 2), zi = rng.int(0, ROAD_ZS.length - 2);
    const inset = 10.6;
    const x0 = ROAD_XS[xi] + inset, x1 = ROAD_XS[xi + 1] - inset;
    const z0 = ROAD_ZS[zi] + inset, z1 = ROAD_ZS[zi + 1] - inset;
    return [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
  }
  function promenadeLoop() {
    const z = rng.range(-230, 230);
    return [{ x: 136, z }, { x: 136, z: z + rng.range(40, 120) }, { x: 152, z: z + rng.range(40, 120) }, { x: 152, z }];
  }

  for (let i = 0; i < 26; i++) {
    const fig = buildFigure({ shirt: rng.pick(SHIRTS), pants: rng.pick(PANTS), dress: rng.chance(0.3) });
    game.scene.add(fig.group);
    const loop = i % 5 === 4 ? promenadeLoop() : sidewalkLoop();
    const start = loop[0];
    fig.group.position.set(start.x + rng.range(-2, 2), 0, start.z + rng.range(-2, 2));
    list.push({
      ...fig, loop, wp: 1, speed: rng.range(1.15, 1.85), phase: rng.range(0, 6),
      state: 'walk', fleeT: 0, downT: 0, threat: null, heading: 0,
    });
  }

  function scare(x, z, radius = 16) {
    for (const p of list) {
      if (p.state === 'down') continue;
      if (dist2(p.group.position.x, p.group.position.z, x, z) < radius) {
        p.state = 'flee'; p.fleeT = 3; p.threat = { x, z };
      }
    }
  }

  function update(dt) {
    const t = game.time;
    for (const p of list) {
      const pos = p.group.position;
      if (p.state === 'down') {
        p.downT -= dt;
        if (p.downT <= 0) { p.state = 'walk'; p.group.rotation.x = 0; pos.y = 0; }
        continue;
      }
      // run over?
      let hitBy = null;
      for (const car of game.cars) {
        if (Math.abs(car.speed) < 3) continue;
        if (dist2(pos.x, pos.z, car.pos.x, car.pos.z) < 1.6) { hitBy = car; break; }
      }
      if (hitBy) {
        p.state = 'down'; p.downT = 6;
        p.group.rotation.x = -Math.PI / 2;
        pos.y = 0.22;
        game.onPedHit(p, hitBy);
        continue;
      }
      let tx, tz, spd = p.speed;
      if (p.state === 'flee') {
        p.fleeT -= dt;
        if (p.fleeT <= 0 || !p.threat) { p.state = 'walk'; }
        const dx = pos.x - (p.threat ? p.threat.x : pos.x), dz = pos.z - (p.threat ? p.threat.z : pos.z);
        const l = Math.hypot(dx, dz) || 1;
        tx = pos.x + (dx / l) * 10; tz = pos.z + (dz / l) * 10;
        spd = 5.6;
      } else {
        const target = p.loop[p.wp];
        tx = target.x; tz = target.z;
        if (dist2(pos.x, pos.z, tx, tz) < 1.2) { p.wp = (p.wp + 1) % p.loop.length; continue; }
      }
      const dx = tx - pos.x, dz = tz - pos.z;
      const l = Math.hypot(dx, dz) || 1;
      pos.x += (dx / l) * spd * dt;
      pos.z += (dz / l) * spd * dt;
      pos.x = clamp(pos.x, -262, 262); pos.z = clamp(pos.z, -262, 262);
      p.heading = lerpAngle(p.heading, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt));
      p.group.rotation.y = p.heading;
      p.phase += dt * spd * 3.4;
      const sw = 0.5 * clamp(spd / 2, 0.4, 1.6);
      p.legL.rotation.x = Math.sin(p.phase) * sw;
      p.legR.rotation.x = -Math.sin(p.phase) * sw;
      p.armL.rotation.x = -Math.sin(p.phase) * sw * 0.7;
      p.armR.rotation.x = Math.sin(p.phase) * sw * 0.7;
      void t;
    }
  }

  function nearest(x, z, r) {
    let best = null, bd = r;
    for (const p of list) {
      const d = dist2(p.group.position.x, p.group.position.z, x, z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  return { list, update, scare, nearest };
}
