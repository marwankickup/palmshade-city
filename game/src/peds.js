// peds.js — pedestrians: stylised low-poly figures that stroll the
// sidewalks, flee danger and fall when hit. Also exports makeFigure(),
// the shared character builder the player uses.
import * as THREE from 'three';
import { collideAABBs, clampToWorld, randomSidewalkPoint, BLOCKS } from './city.js';

const SKIN = [0xf2c49b, 0xc68863, 0x8a5a3b, 0xffe0bd];
const SHIRTS = [0xe84f3d, 0x2a9db5, 0xf2b544, 0x7ec850, 0xe87fb0, 0xf2f2f2, 0xff7f2a, 0x5b7fe8];
const PANTS = [0x2c3550, 0x5a4632, 0xe8e0cc, 0x37474f, 0x7a4a56];

export function makeFigure(rng, opts = {}) {
  const g = new THREE.Group();
  const skin = opts.skin ?? SKIN[Math.floor(rng() * SKIN.length)];
  const shirt = opts.shirt ?? SHIRTS[Math.floor(rng() * SHIRTS.length)];
  const pants = opts.pants ?? PANTS[Math.floor(rng() * PANTS.length)];
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const legGeo = new THREE.BoxGeometry(0.21, 0.78, 0.24);
  const armGeo = new THREE.BoxGeometry(0.17, 0.68, 0.2);
  const mkLimb = (geo, color, x, y, z) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const m = new THREE.Mesh(geo, mat(color));
    m.position.y = -geo.parameters.height / 2 + 0.04;
    m.castShadow = true;
    pivot.add(m);
    g.add(pivot);
    return pivot;
  };
  const legL = mkLimb(legGeo, pants, -0.13, 0.82, 0);
  const legR = mkLimb(legGeo, pants, 0.13, 0.82, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.3), mat(shirt));
  torso.position.y = 1.16; torso.castShadow = true;
  g.add(torso);
  const armL = mkLimb(armGeo, shirt, -0.37, 1.44, 0);
  const armR = mkLimb(armGeo, shirt, 0.37, 1.44, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.34), mat(skin));
  head.position.y = 1.72; head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.12, 0.37), mat([0x2b1c10, 0x59391c, 0xd8b25a, 0x111111][Math.floor(rng() * 4)]));
  hair.position.y = 1.94;
  g.add(hair);
  g.userData.limbs = { legL, legR, armL, armR };
  return g;
}

export function animateFigure(fig, phase, amount) {
  const { legL, legR, armL, armR } = fig.userData.limbs;
  const s = Math.sin(phase) * amount;
  legL.rotation.x = s; legR.rotation.x = -s;
  armL.rotation.x = -s * 0.8; armR.rotation.x = s * 0.8;
}

const PED_COUNT = 26;

export class Peds {
  constructor(scene, rng, events) {
    this.rng = rng;
    this.events = events; // {onHit(ped, byPlayer)}
    this.list = [];
    for (let i = 0; i < PED_COUNT; i++) {
      const p = randomSidewalkPoint(rng);
      const mesh = makeFigure(rng);
      mesh.position.set(p.x, 0, p.z);
      scene.add(mesh);
      this.list.push({
        mesh, pos: mesh.position,
        heading: rng() * Math.PI * 2,
        speed: 1.6 + rng() * 1.1,
        target: randomSidewalkPoint(rng),
        phase: rng() * 9,
        state: 'walk', // walk | flee | down
        fleeFrom: null, timer: 0,
      });
    }
  }
  scare(x, z, radius = 16) {
    for (const p of this.list) {
      if (p.state === 'down') continue;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < radius) { p.state = 'flee'; p.fleeFrom = { x, z }; p.timer = 2.2 + this.rng() * 1.5; }
    }
  }
  hitCheck(cars, dt) {
    // cars: [{x,z,speed,radius,isPlayer}]
    for (const p of this.list) {
      if (p.state === 'down') continue;
      for (const c of cars) {
        if (Math.abs(c.speed) < 3.5) continue;
        const d = Math.hypot(p.pos.x - c.x, p.pos.z - c.z);
        if (d < (c.radius ?? 1.7) + 0.45) {
          p.state = 'down'; p.timer = 9;
          p.mesh.rotation.x = -Math.PI / 2;
          p.mesh.position.y = 0.25;
          this.events.onHit(p, c.isPlayer);
          break;
        }
      }
    }
  }
  update(dt, playerPos) {
    for (const p of this.list) {
      if (p.state === 'down') {
        p.timer -= dt;
        if (p.timer <= 0) { // get up far from player and stroll on
          if (Math.hypot(p.pos.x - playerPos.x, p.pos.z - playerPos.z) < 30) { p.timer = 3; continue; }
          p.state = 'walk'; p.mesh.rotation.x = 0; p.mesh.position.y = 0;
          p.target = randomSidewalkPoint(this.rng);
        }
        continue;
      }
      let speed = p.speed, tx, tz;
      if (p.state === 'flee') {
        p.timer -= dt;
        const dx = p.pos.x - p.fleeFrom.x, dz = p.pos.z - p.fleeFrom.z;
        const d = Math.hypot(dx, dz) || 1;
        tx = p.pos.x + (dx / d) * 10; tz = p.pos.z + (dz / d) * 10;
        speed = 4.6;
        if (p.timer <= 0) { p.state = 'walk'; p.target = randomSidewalkPoint(this.rng); }
      } else {
        tx = p.target.x; tz = p.target.z;
        if (Math.hypot(tx - p.pos.x, tz - p.pos.z) < 1.6) p.target = randomSidewalkPoint(this.rng);
      }
      const dx = tx - p.pos.x, dz = tz - p.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const targetHeading = Math.atan2(dx, dz);
      let diff = targetHeading - p.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.heading += diff * Math.min(1, dt * 5);
      p.pos.x += Math.sin(p.heading) * speed * dt;
      p.pos.z += Math.cos(p.heading) * speed * dt;
      collideAABBs(p.pos, 0.45);
      clampToWorld(p.pos);
      p.mesh.rotation.y = p.heading;
      p.phase += dt * speed * 3.4;
      animateFigure(p.mesh, p.phase, p.state === 'flee' ? 0.75 : 0.5);
    }
  }
  positions() { return this.list; }
}
export { BLOCKS };
