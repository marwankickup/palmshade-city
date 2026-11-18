// police.js — the wanted system: crimes raise stars, Palmshade PD
// spawns on the road grid and pursues with slot-based steering (units
// take positions around the player instead of stacking). Units route
// along the road grid to reach the player, then close in freely. The
// busted meter fills when a unit is close and the player is slow, and
// stars decay when the player breaks line of sight for a while.
import * as THREE from 'three';
import { Car, createPoliceMesh } from './vehicles.js';
import { randomRoadPoint, nearestRoadCoord } from './city.js';

const MAX_UNITS = 5;
// slot offsets around the player (in player-heading space): behind L/R, sides, front
const SLOTS = [
  { back: 9, side: -4 }, { back: 9, side: 4 }, { back: 16, side: 0 },
  { back: 2, side: -9 }, { back: 2, side: 9 }, { back: -12, side: 0 },
];

// waypoints that keep a unit on the road grid until the final approach
function roadPath(from, to) {
  const zR = nearestRoadCoord(from.z), xR = nearestRoadCoord(from.x);
  const onHorizontal = Math.abs(from.z - zR) <= Math.abs(from.x - xR);
  const qx = nearestRoadCoord(to.x), qz = nearestRoadCoord(to.z);
  const pts = [];
  if (onHorizontal) {
    pts.push({ x: qx, z: from.z });
    pts.push({ x: qx, z: qz });
  } else {
    pts.push({ x: from.x, z: qz });
    pts.push({ x: qx, z: qz });
  }
  // closest point of the player's road cross to the player, then free approach
  const a = { x: to.x, z: qz }, b = { x: qx, z: to.z };
  pts.push(Math.hypot(a.x - to.x, a.z - to.z) <= Math.hypot(b.x - to.x, b.z - to.z) ? a : b);
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 4);
}

class PoliceCar {
  constructor(scene, rng) {
    this.car = new Car(scene, 'sedan', 0xf4f6f8, 0, 0, 0);
    // swap in the police mesh (light bar etc.), keep the Car physics shell.
    // IMPORTANT: Car.pos aliases its mesh position — re-link it to the new
    // mesh or the car will steer in place and never actually drive.
    scene.remove(this.car.mesh);
    this.car.mesh = createPoliceMesh();
    this.car.mesh.position.copy(this.car.pos);
    this.car.pos = this.car.mesh.position;
    this.car.mesh.userData.police = true;
    scene.add(this.car.mesh);
    this.rng = rng;
    this.slot = 0;
    this.path = [];
    this.pathIdx = 0;
    this.repathT = 0;
    this.stuckT = 0;
    this.lastX = 0; this.lastZ = 0;
  }
  placeNear(rng, target) {
    for (let i = 0; i < 10; i++) {
      const p = randomRoadPoint(rng);
      const d = Math.hypot(p.x - target.x, p.z - target.z);
      if (d > 55 && d < 110) {
        this.car.pos.set(p.x, 0, p.z);
        this.car.heading = rng() * Math.PI * 2;
        this.car.speed = 0;
        this.car.mesh.position.copy(this.car.pos);
        this.path = []; this.pathIdx = 0;
        return;
      }
    }
    this.car.pos.set(target.x + 70, 0, target.z + 40);
    this.car.mesh.position.copy(this.car.pos);
    this.path = []; this.pathIdx = 0;
  }
}

export class Police {
  constructor(scene, rng, events) {
    this.scene = scene;
    this.rng = rng;
    this.events = events; // {onBusted(), onShootPlayer(dmg)}
    this.wanted = 0;         // 0..5 float; stars shown = ceil
    this.units = [];
    this.busted = 0;         // 0..1
    this.lastCrimeT = -99;
    this.time = 0;
    this.hiddenT = 0;        // time since any unit saw the player
    this.flashT = 0;
    this.shootCd = 0;
  }
  get stars() { return Math.ceil(this.wanted); }
  crime(amount, now) {
    this.wanted = Math.min(5, this.wanted + amount);
    this.lastCrimeT = now;
    this.hiddenT = 0;
  }
  setWanted(n) { this.wanted = Math.max(0, Math.min(5, n)); this.hiddenT = 0; }
  clear() { this.wanted = 0; this.busted = 0; }
  desiredUnits() { return this.wanted <= 0 ? 0 : Math.min(MAX_UNITS, Math.ceil(this.wanted) + (this.wanted >= 2 ? 1 : 0)); }

  update(dt, ctx) {
    // ctx: {playerPos, playerHeading, playerSpeed, playerSpeedAbs, inCar, time}
    this.time = ctx.time;
    const target = ctx.playerPos;
    // --- spawn / despawn units
    const want = this.desiredUnits();
    while (this.units.length < want) {
      const u = new PoliceCar(this.scene, this.rng);
      u.placeNear(this.rng, target);
      u.slot = this.units.length;
      this.units.push(u);
    }
    while (this.units.length > want) {
      const u = this.units.pop();
      u.car.dispose(this.scene);
    }
    // --- sight + decay
    let anySee = false;
    for (const u of this.units) {
      const d = Math.hypot(u.car.pos.x - target.x, u.car.pos.z - target.z);
      if (d < 65) anySee = true;
    }
    if (anySee) this.hiddenT = 0; else this.hiddenT += dt;
    if (this.wanted > 0 && this.hiddenT > 6 && ctx.time - this.lastCrimeT > 8) {
      this.wanted = Math.max(0, this.wanted - dt * 0.11);
      if (this.wanted === 0) this.busted = 0;
    }
    // --- pursuit
    const fx = Math.sin(ctx.playerHeading), fz = Math.cos(ctx.playerHeading);
    const rx = fz, rz = -fx; // right vector in player-heading space
    this.flashT += dt * 6;
    let closeUnits = 0;
    this.units.forEach((u, i) => {
      const slot = SLOTS[i % SLOTS.length];
      const slotPos = {
        x: target.x - fx * slot.back + rx * slot.side,
        z: target.z - fz * slot.back + rz * slot.side,
      };
      const distPlayer = Math.hypot(target.x - u.car.pos.x, target.z - u.car.pos.z);
      if (distPlayer < 10) closeUnits++;
      // route along roads until the path runs out, then home on the slot
      u.repathT -= dt;
      if (u.repathT <= 0 || u.pathIdx >= u.path.length) {
        if (distPlayer > 16) { u.path = roadPath(u.car.pos, slotPos); u.pathIdx = 0; }
        else { u.path = []; u.pathIdx = 0; }
        u.repathT = 1.4;
      }
      let tx = slotPos.x, tz = slotPos.z, onPath = false;
      if (u.pathIdx < u.path.length) {
        const wp = u.path[u.pathIdx];
        tx = wp.x; tz = wp.z; onPath = true;
        if (Math.hypot(tx - u.car.pos.x, tz - u.car.pos.z) < 5.5) u.pathIdx++;
      }
      const dx = tx - u.car.pos.x, dz = tz - u.car.pos.z;
      const dist = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, dz);
      let diff = desired - u.car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const maxTurn = 2.3 * dt;
      u.car.heading += Math.max(-maxTurn, Math.min(maxTurn, diff));
      const topSpeed = onPath ? 33 : 30 + this.stars * 1.1;
      let targetSpeed = dist > 13 ? topSpeed : Math.max(ctx.playerSpeedAbs + 2, 9);
      if (!onPath && dist < 3.5) targetSpeed = 0; // arrived at the slot: hold position
      if (Math.abs(diff) > 2.3) targetSpeed = -7; // reverse out of a bad angle
      u.car.speed += Math.max(-32 * dt, Math.min(12 * dt, targetSpeed - u.car.speed));
      const f = u.car.forward;
      u.car.pos.x += f.x * u.car.speed * dt;
      u.car.pos.z += f.z * u.car.speed * dt;
      u.car.integrate(dt, null);
      // stuck detection: commanded to drive but barely displaced → respawn nearer
      const moved = Math.hypot(u.car.pos.x - u.lastX, u.car.pos.z - u.lastZ);
      if (Math.abs(u.car.speed) > 5 && distPlayer > 22) {
        u.stuckT += dt;
        if (u.stuckT > 1.2) {
          if (moved < 1.2) { u.placeNear(this.rng, target); }
          u.stuckT = 0; u.lastX = u.car.pos.x; u.lastZ = u.car.pos.z;
        }
      } else { u.stuckT = 0; u.lastX = u.car.pos.x; u.lastZ = u.car.pos.z; }
      // light bar flash
      const bar = u.car.mesh.userData.lightBar;
      if (bar) {
        const ph = Math.sin(this.flashT + i * 1.7) > 0;
        bar.red.material.color.setHex(ph ? 0xff2222 : 0x661111);
        bar.blue.material.color.setHex(ph ? 0x113366 : 0x2266ff);
      }
      // shooting at high wanted
      if (this.stars >= 4 && distPlayer < 26 && distPlayer > 6) {
        this.shootCd -= dt;
        if (this.shootCd <= 0) {
          this.shootCd = 0.9 + this.rng() * 0.7;
          this.events.onShootPlayer(2.5 + this.rng() * 2.5);
        }
      }
    });
    // --- busted meter
    const slow = ctx.playerSpeedAbs < 2.2;
    if (this.wanted > 0 && closeUnits > 0 && slow) {
      this.busted += dt / 2.6;
    } else {
      this.busted = Math.max(0, this.busted - dt / 3.5);
    }
    if (this.busted >= 1) {
      this.busted = 0;
      this.events.onBusted();
    }
    return { anySee, closeUnits };
  }
  movers() {
    return this.units.map((u) => ({ x: u.car.pos.x, z: u.car.pos.z, speed: u.car.speed, radius: 1.8, isPlayer: false, car: u.car, police: true }));
  }
  disposeAll() {
    for (const u of this.units) u.car.dispose(this.scene);
    this.units = [];
  }
}
