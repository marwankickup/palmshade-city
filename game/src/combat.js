// combat.js — on-foot shooting: hitscan with tracer, muzzle flash and sparks,
// plus the shared tracer pool the police gunfire uses too.
import * as THREE from 'three';
import { dist2 } from './util.js';

export function createCombat(game) {
  const scene = game.scene;
  const tracers = [];
  const sparks = [];
  let cooldown = 0;

  function getTracer() {
    for (const t of tracers) if (t.life <= 0) return t;
    if (tracers.length >= 28) return tracers[0];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffe9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    line.frustumCulled = false;
    scene.add(line);
    const t = { line, life: 0 };
    tracers.push(t);
    return t;
  }
  function tracer(from, to, color = 0xffe9a0) {
    const t = getTracer();
    const a = t.line.geometry.attributes.position.array;
    a[0] = from.x; a[1] = from.y; a[2] = from.z;
    a[3] = to.x; a[4] = to.y; a[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.life = 0.09;
    t.line.material.opacity = 0.95;
  }
  function spark(x, y, z) {
    let s = sparks.find((s2) => s2.life <= 0);
    if (!s) {
      if (sparks.length >= 16) s = sparks[0];
      else {
        const mat = new THREE.SpriteMaterial({ color: 0xffc46e, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
        const spr = new THREE.Sprite(mat);
        spr.scale.setScalar(0.7);
        scene.add(spr);
        s = { spr, life: 0 };
        sparks.push(s);
      }
    }
    s.spr.position.set(x, y, z);
    s.life = 0.13;
    s.spr.material.opacity = 1;
  }

  // ray vs the world: returns {point, ped, car} for the nearest hit within 70 m
  function raycast(origin, dir) {
    let bestT = 70, best = null;
    // peds (cylinders r=0.55 around their position, height 1.8)
    for (const p of game.peds.list) {
      if (p.state === 'down') continue;
      const c = p.group.position;
      const ox = c.x - origin.x, oz = c.z - origin.z;
      const along = ox * dir.x + oz * dir.z;
      if (along < 0.5 || along > bestT) continue;
      const px = origin.x + dir.x * along, pz = origin.z + dir.z * along;
      if (Math.hypot(c.x - px, c.z - pz) < 0.62 && origin.y > c.y - 0.2 && origin.y < c.y + 2.1) {
        bestT = along; best = { ped: p, t: along };
      }
    }
    // cars (sphere r=2.3 at centre, y ~0.9)
    for (const car of game.cars) {
      const c = car.pos;
      const ox = c.x - origin.x, oy = 0.9 - origin.y, oz = c.z - origin.z;
      const along = ox * dir.x + oy * dir.y + oz * dir.z;
      if (along < 0.5 || along > bestT) continue;
      const px = origin.x + dir.x * along, py = origin.y + dir.y * along, pz = origin.z + dir.z * along;
      if (Math.hypot(c.x - px, 0.9 - py, c.z - pz) < 2.3) { bestT = along; best = { car, t: along }; }
    }
    // buildings: march the ray against collider AABBs (2D, up to 16 m tall)
    for (let t = 1; t < bestT; t += 0.9) {
      const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
      if (y < 0) { bestT = t; best = { ground: true, t }; break; }
      if (y > 17) continue;
      let inside = false;
      for (const b of game.city.colliders) {
        if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) { inside = true; break; }
      }
      if (inside) { bestT = t; best = { wall: true, t }; break; }
    }
    const point = {
      x: origin.x + dir.x * bestT, y: Math.max(0.05, origin.y + dir.y * bestT), z: origin.z + dir.z * bestT,
    };
    return { point, hit: best, t: bestT };
  }

  function tryShoot() {
    if (cooldown > 0 || game.playerInCar()) return;
    cooldown = 0.24;
    const cam = game.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const pp = game.player.pos;
    const origin = { x: pp.x, y: pp.y + 1.5, z: pp.z };
    const muzzle = {
      x: pp.x + Math.sin(game.player.heading) * 0.55,
      y: pp.y + 1.38,
      z: pp.z + Math.cos(game.player.heading) * 0.55,
    };
    const res = raycast(origin, dir);
    tracer(muzzle, res.point);
    spark(res.point.x, res.point.y, res.point.z);
    game.player.gunArm = 0.3;
    game.audio.shoot();
    game.peds.scare(pp.x, pp.z, 18);
    if (res.hit && res.hit.ped) {
      const p = res.hit.ped;
      p.state = 'down'; p.downT = 6;
      p.group.rotation.x = -Math.PI / 2;
      p.group.position.y = 0.22;
      game.onPedShot(p);
    } else if (res.hit && res.hit.car) {
      res.hit.car.damage(7);
      if (res.hit.car.driver === 'police') game.reportCrime('shoot-police', pp.x, pp.z);
    }
    game.reportCrime('gunfire', pp.x, pp.z);
    void dist2;
  }

  function update(dt) {
    cooldown = Math.max(0, cooldown - dt);
    for (const t of tracers) {
      if (t.life > 0) { t.life -= dt; t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.95; }
      else t.line.material.opacity = 0;
    }
    for (const s of sparks) {
      if (s.life > 0) { s.life -= dt; s.spr.material.opacity = Math.max(0, s.life / 0.13); }
      else s.spr.material.opacity = 0;
    }
  }

  return { tryShoot, update, tracer };
}
