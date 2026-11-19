// peds.js — pedestrians: stroll sidewalks, flee danger, hit-and-fall. Thugs for missions.
import * as THREE from 'three';
import { makeFigure } from './player.js';
import { ROADS, clamp, dist2d, groundYAt } from './util.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0xe67e22, 0xfd79a8];
const PANTS = [0x2c3e50, 0xe8dcc0, 0x5d6d7e, 0x784212, 0x1a5276];

export class Peds {
  constructor(scene, rng) {
    this.scene = scene; this.list = [];
    for (let i = 0; i < 26; i++) {
      const vertical = rng.chance(0.5);
      const r = rng.pick(ROADS);
      const side = rng.chance(0.5) ? 10.6 : -10.6;
      const x = vertical ? r + side : rng.range(-220, 200);
      const z = vertical ? rng.range(-220, 220) : r + side;
      this.spawn(x, z, rng, false);
    }
  }
  spawn(x, z, rng, hostile) {
    const fig = makeFigure(hostile ? 0x922b21 : rng.pick(SHIRTS), rng.pick(PANTS), rng.pick([0xd9a066, 0x8d5524, 0xffdbac, 0x6b4423]));
    fig.position.set(x, 0, z);
    this.scene.add(fig);
    const ped = {
      group: fig, pos: fig.position, heading: rng.range(0, Math.PI * 2),
      state: 'walk', // walk | flee | down
      target: null, speed: rng.range(1.1, 1.8), walkPhase: rng.range(0, 6),
      hostile: !!hostile, health: 100, downTimer: 0, shootCd: rng.range(0.5, 1.5),
      rng,
    };
    fig.userData.ped = ped;
    this.list.push(ped);
    return ped;
  }
  spawnThug(x, z, rng) { return this.spawn(x, z, rng, true); }

  pickTarget(ped, rng) {
    // wander to another sidewalk point within ~70 units
    const vertical = rng.chance(0.5);
    const r = ROADS.reduce((a, b) => Math.abs(b - (vertical ? ped.pos.x : ped.pos.z)) < Math.abs(a - (vertical ? ped.pos.x : ped.pos.z)) ? b : a, ROADS[0]);
    const side = rng.chance(0.5) ? 10.6 : -10.6;
    if (vertical) ped.target = { x: r + side, z: clamp(ped.pos.z + rng.range(-70, 70), -230, 230) };
    else ped.target = { x: clamp(ped.pos.x + rng.range(-70, 70), -230, 205), z: r + side };
  }

  fall(ped) {
    if (ped.state === 'down') return;
    ped.state = 'down'; ped.downTimer = 9;
    ped.group.rotation.x = -Math.PI / 2;
    ped.group.position.y = 0.25;
  }
  hurt(ped, dmg) {
    ped.health -= dmg;
    if (ped.health <= 0 && ped.state !== 'down') this.fall(ped);
    else if (ped.state !== 'down') ped.state = 'flee';
  }

  update(dt, ctx) {
    const rng = ctx.rng;
    for (const ped of this.list) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0 && !ped.hostile) {
          // get up far from the action and stroll on
          ped.state = 'walk'; ped.health = 100; ped.group.rotation.x = 0; ped.target = null;
        }
        continue;
      }
      if (ped.hostile) {
        // thugs hold their ground and aim (facing is set by main)
        const L = ped.group.userData.limbs;
        L.armR.rotation.x = -Math.PI / 2 + 0.15;
        ped.pos.y = groundYAt(ctx.platforms, ped.pos.x, ped.pos.z, ped.pos.y || 0);
        continue;
      }
      let tx, tz, speed = ped.speed, fleeing = false;
      // danger: fast car close, gunfire, or the player aiming nearby
      const danger = ctx.danger;
      if (danger && dist2d(ped.pos.x, ped.pos.z, danger.x, danger.z) < danger.r) {
        const dx = ped.pos.x - danger.x, dz = ped.pos.z - danger.z;
        const d = Math.hypot(dx, dz) || 1;
        tx = ped.pos.x + (dx / d) * 18; tz = ped.pos.z + (dz / d) * 18;
        speed = 4.6; fleeing = true; ped.state = 'flee';
      } else {
        if (ped.state === 'flee') ped.state = 'walk';
        if (!ped.target || dist2d(ped.pos.x, ped.pos.z, ped.target.x, ped.target.z) < 1.2) this.pickTarget(ped, rng);
        tx = ped.target.x; tz = ped.target.z;
      }
      const dx = tx - ped.pos.x, dz = tz - ped.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.1) {
        const targetHeading = Math.atan2(dx, dz);
        let d = targetHeading - ped.heading;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        ped.heading += d * Math.min(1, dt * 8);
        ped.pos.x += Math.sin(ped.heading) * speed * dt;
        ped.pos.z += Math.cos(ped.heading) * speed * dt;
        ped.walkPhase += dt * (fleeing ? 12 : 7);
      }
      ped.pos.x = clamp(ped.pos.x, -236, 282);
      ped.pos.z = clamp(ped.pos.z, -236, 236);
      ped.pos.y = groundYAt(ctx.platforms, ped.pos.x, ped.pos.z, ped.pos.y || 0);
      ped.group.rotation.y = ped.heading;
      const L = ped.group.userData.limbs;
      const sw = Math.sin(ped.walkPhase) * (fleeing ? 0.8 : 0.5);
      L.legL.rotation.x = sw; L.legR.rotation.x = -sw;
      L.armL.rotation.x = -sw * 0.7; L.armR.rotation.x = sw * 0.7;
    }
  }
}
