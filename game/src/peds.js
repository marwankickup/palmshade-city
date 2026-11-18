// Pedestrians: Palmshade's walkers. Simple box figures in bright holiday clothes who
// stroll the sidewalks and the promenade, wander from block to block, dive out of the
// way of trouble (gunfire, a car bearing down on them) and go down when a car actually
// reaches them — then get up a few seconds later, because this is a cheerful city.

import * as THREE from 'three';
import { rand, pick, clamp, dist2d } from './util.js';
import { ROAD_LINES, ROAD_W } from './city.js';

const SHIRTS = [0xff6b6b, 0xfeca57, 0x48dbfb, 0x1dd1a1, 0xf368e0, 0xff9f43, 0x54a0ff, 0x5f27cd, 0xffffff, 0xff8fa3];
const PANTS = [0x2d4059, 0x8395a7, 0xf1f2f6, 0x576574, 0x222f3e, 0xc8d6e5];

function makeFigure() {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pick(SHIRTS) });
  const pants = new THREE.MeshLambertMaterial({ color: pick(PANTS) });
  const skin = new THREE.MeshLambertMaterial({ color: pick([0xc68863, 0x8d5524, 0xffdbac, 0x6b4423]) });

  function part(geo, material, x, y, z) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    group.add(m);
    return m;
  }
  const legGeo = new THREE.BoxGeometry(0.2, 0.78, 0.24);
  legGeo.translate(0, -0.39, 0);
  const legL = new THREE.Group();
  legL.position.set(-0.13, 0.8, 0);
  legL.add(new THREE.Mesh(legGeo, pants));
  const legR = new THREE.Group();
  legR.position.set(0.13, 0.8, 0);
  legR.add(new THREE.Mesh(legGeo, pants));
  group.add(legL, legR);
  part(new THREE.BoxGeometry(0.56, 0.66, 0.3), shirt, 0, 1.14, 0);
  part(new THREE.BoxGeometry(0.38, 0.4, 0.36), skin, 0, 1.68, 0);
  if (Math.random() < 0.5) part(new THREE.BoxGeometry(0.42, 0.1, 0.4), shirt, 0, 1.92, 0); // sun hat
  const s = rand(0.92, 1.04);
  group.scale.set(s, s, s);
  return { group, legL, legR };
}

const SIDE = ROAD_W / 2 + 1.7;

/** Spawn `count` pedestrians on sidewalks all over the city. */
export function createPeds(scene, count = 26) {
  const list = [];

  function spawnPed() {
    const { group, legL, legR } = makeFigure();
    scene.add(group);
    const ped = {
      group,
      legL,
      legR,
      axis: 'z',
      dir: 1,
      cross: 0, // fixed coordinate on the cross axis (the sidewalk line)
      speed: rand(1.1, 1.8),
      state: 'walk', // walk | flee | down
      stateT: 0,
      fleeFrom: null,
      phase: rand(10),
      dead: false,
    };
    resetPed(ped, true);
    list.push(ped);
    return ped;
  }

  /** Put a ped on a random sidewalk (or the promenade), anywhere in the city. */
  function resetPed(ped, anywhere = false) {
    const onPromenade = Math.random() < 0.18;
    if (onPromenade) {
      ped.axis = 'z';
      ped.dir = Math.random() < 0.5 ? 1 : -1;
      ped.cross = -238 + rand(-3, 3);
      ped.group.position.set(ped.cross, 0, rand(-250, 250));
    } else {
      ped.axis = Math.random() < 0.5 ? 'z' : 'x';
      const line = pick(ROAD_LINES);
      const sideSign = Math.random() < 0.5 ? 1 : -1;
      ped.dir = Math.random() < 0.5 ? 1 : -1;
      ped.cross = line + sideSign * SIDE;
      const along = anywhere ? rand(-252, 252) : rand(-252, 252);
      if (ped.axis === 'z') ped.group.position.set(ped.cross, 0, along);
      else ped.group.position.set(along, 0, ped.cross);
    }
    ped.state = 'walk';
    ped.stateT = 0;
    ped.group.rotation.set(0, 0, 0);
  }

  for (let i = 0; i < count; i += 1) spawnPed();

  /** Send every ped near a point running away from it (gunshots, chaos). */
  function fleeFrom(x, z, radius = 15) {
    for (const ped of list) {
      if (ped.state === 'down') continue;
      const p = ped.group.position;
      if (dist2d(p.x, p.z, x, z) < radius) {
        ped.state = 'flee';
        ped.stateT = rand(1.6, 3);
        ped.fleeFrom = { x, z };
      }
    }
  }

  /** Knock a ped down (they get up again after a while). */
  function knockDown(ped) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.stateT = rand(4, 7);
    ped.group.rotation.x = -Math.PI / 2;
    ped.group.position.y = 0.25;
  }

  /**
   * One frame. ctx: { cars, playerPos, onPedHit(ped, car) } — cars is every vehicle;
   * a ped a moving car reaches goes down and reports through onPedHit.
   */
  function update(dt, ctx) {
    for (const ped of list) {
      const p = ped.group.position;
      ped.stateT -= dt;

      if (ped.state === 'down') {
        if (ped.stateT <= 0) {
          ped.state = 'walk';
          ped.group.rotation.x = 0;
          ped.group.position.y = 0;
        }
        continue;
      }

      // Cars are the real danger: dive away or get clipped.
      let threatCar = null;
      for (const car of ctx.cars) {
        if (Math.abs(car.speed) < 3.5) continue;
        const cp = car.group.position;
        if (dist2d(p.x, p.z, cp.x, cp.z) < 2.1) {
          knockDown(ped);
          if (ctx.onPedHit) ctx.onPedHit(ped, car);
          threatCar = null;
          break;
        }
        // A fast car coming straight at them, close: run.
        if (Math.abs(car.speed) > 9 && dist2d(p.x, p.z, cp.x, cp.z) < 9) threatCar = car;
      }
      if (ped.state === 'down') continue;
      if (threatCar && ped.state !== 'flee') {
        ped.state = 'flee';
        ped.stateT = 1.6;
        ped.fleeFrom = { x: threatCar.group.position.x, z: threatCar.group.position.z };
      }

      let vx = 0;
      let vz = 0;
      let speed = ped.speed;
      if (ped.state === 'flee') {
        const dx = p.x - (ped.fleeFrom ? ped.fleeFrom.x : p.x);
        const dz = p.z - (ped.fleeFrom ? ped.fleeFrom.z : p.z);
        const len = Math.hypot(dx, dz) || 1;
        vx = (dx / len) * 3.4;
        vz = (dz / len) * 3.4;
        speed = 3.4;
        if (ped.stateT <= 0) ped.state = 'walk';
      } else {
        // Stroll along the current sidewalk. The along-coordinate crossing a cross
        // street's centreline is the corner: sometimes turn onto that street's
        // sidewalk (swap axis, new fixed cross = that street ± sidewalk offset).
        const along = ped.axis === 'z' ? p.z : p.x;
        for (const line of ROAD_LINES) {
          if (Math.abs(along - line) < speed * dt && Math.random() < 0.35) {
            ped.axis = ped.axis === 'z' ? 'x' : 'z';
            ped.dir = Math.random() < 0.5 ? 1 : -1;
            ped.cross = line + (Math.random() < 0.5 ? SIDE : -SIDE);
            if (ped.axis === 'z') p.x = ped.cross;
            else p.z = ped.cross;
            break;
          }
        }
        if (ped.axis === 'z') vz = ped.dir * speed;
        else vx = ped.dir * speed;
      }

      p.x += vx * dt;
      p.z += vz * dt;
      p.x = clamp(p.x, -300, 262);
      p.z = clamp(p.z, -262, 262);
      // Keep fleeing/walking peds out of the buildings when they cut across a block.
      if (ped.state === 'flee') {
        for (const box of ctx.colliders || []) {
          if (p.x > box.minX - 0.4 && p.x < box.maxX + 0.4 && p.z > box.minZ - 0.4 && p.z < box.maxZ + 0.4) {
            p.x -= vx * dt * 1.6;
            p.z -= vz * dt * 1.6;
            break;
          }
        }
      }
      p.y = ctx.groundHeightAt ? ctx.groundHeightAt(p.x, p.z) : 0;

      const heading = Math.atan2(vx, vz);
      if (vx !== 0 || vz !== 0) ped.group.rotation.y = heading;
      ped.phase += dt * speed * 2.6;
      const swing = Math.sin(ped.phase) * (ped.state === 'flee' ? 0.75 : 0.45);
      ped.legL.rotation.x = swing;
      ped.legR.rotation.x = -swing;
    }
  }

  return { list, update, fleeFrom, knockDown, resetPed };
}
