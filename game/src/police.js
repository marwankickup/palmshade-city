// police.js — the Palmshade PD: witness-driven wanted levels, road-grid
// pursuit routing, slot-based final approach, the BUSTED meter, decay, and
// high-wanted gunfire.
import { Car } from './vehicles.js';
import { ROAD_XS, ROAD_ZS, clamp, angleDelta, dist2, gridPath } from './util.js';

const SLOTS = [
  { back: 7.5, side: -3.4 }, { back: 7.5, side: 3.4 }, { back: 11, side: 0 },
  { back: -6.5, side: -4.2 }, { back: -6.5, side: 4.2 }, { back: -10, side: 0 },
];

export function createPolice(game) {
  let wanted = 0;
  let bustedMeter = 0;
  let unseenT = 0;
  let spawnT = 0;
  const units = [];

  function spawnPoint() {
    const p = game.playerPos();
    let best = null, bestScore = -Infinity, far = null, farD = -1;
    for (let i = 0; i < 14; i++) {
      const x = game.rng.pick(ROAD_XS), z = game.rng.pick(ROAD_ZS);
      const d = dist2(x, z, p.x, p.z);
      if (d > farD) { farD = d; far = { x, z }; }
      if (d < 55) continue;
      const score = -Math.abs(d - 115) + game.rng.range(0, 12);
      if (score > bestScore) { bestScore = score; best = { x, z }; }
    }
    return best || far || { x: -240, z: -240 };
  }

  function spawnUnit() {
    const s = spawnPoint();
    const car = new Car(game.scene, 'police', 0xf2f2f2, game.city.colliders);
    car.driver = 'police';
    const p = game.playerPos();
    car.place(s.x, s.z, Math.atan2(p.x - s.x, p.z - s.z));
    game.cars.push(car);
    units.push({ car, path: [], pathI: 0, repathT: 0, stuckT: 0, lastX: s.x, lastZ: s.z, shootT: game.rng.range(0.4, 1.4) });
  }

  function removeUnit(u) {
    game.scene.remove(u.car.mesh);
    const gi = game.cars.indexOf(u.car); if (gi >= 0) game.cars.splice(gi, 1);
    const ui = units.indexOf(u); if (ui >= 0) units.splice(ui, 1);
  }

  function clearAll() {
    while (units.length) removeUnit(units[0]);
    wanted = 0; bustedMeter = 0; unseenT = 0;
  }

  function steerTo(car, tx, tz, dt, cruise) {
    const dx = tx - car.pos.x, dz = tz - car.pos.z;
    const d = Math.hypot(dx, dz);
    const desired = Math.atan2(dx, dz);
    const delta = angleDelta(car.heading, desired);
    car.input.steer = clamp(delta * 2.3, -1, 1);
    let target = cruise;
    if (Math.abs(delta) > 0.7) target = Math.min(target, 9);
    if (d < 6) target = Math.min(target, 4 + d * 0.7);
    // brake for anything directly ahead
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    let blocked = false;
    for (const other of game.cars) {
      if (other === car) continue;
      const ox = other.pos.x - car.pos.x, oz = other.pos.z - car.pos.z;
      const fwd = ox * fx + oz * fz, lat = Math.abs(ox * fz - oz * fx);
      if (fwd > 0 && fwd < 6.5 && lat < 2) { blocked = true; break; }
    }
    if (blocked) target = Math.min(target, 2);
    if (car.speed < target - 0.5) { car.input.throttle = 0.9; car.input.brake = false; }
    else if (car.speed > target + 1.5) { car.input.throttle = 0; car.input.brake = true; }
    else { car.input.throttle = 0.25; car.input.brake = false; }
    return d;
  }

  function update(dt) {
    const pp = game.playerPos();
    const target = wanted === 0 ? 0 : Math.min(6, wanted + 1);
    spawnT -= dt;
    if (units.length < target && spawnT <= 0) { spawnUnit(); spawnT = 0.9; }
    while (units.length > target) removeUnit(units[units.length - 1]);

    // is the player seen? (any unit close, or a fresh crime)
    let seen = game.time - (game.lastCrimeAt || -99) < 4;
    let nearest = Infinity;
    for (const u of units) {
      const d = dist2(u.car.pos.x, u.car.pos.z, pp.x, pp.z);
      if (d < nearest) nearest = d;
      if (d < 58) seen = true;
    }
    if (wanted > 0) {
      if (seen) unseenT = 0;
      else {
        unseenT += dt;
        if (unseenT > 15) { wanted -= 1; unseenT = 0; if (wanted === 0) bustedMeter = 0; }
      }
    }

    const pHeading = game.playerHeading();
    units.forEach((u, idx) => {
      const car = u.car;
      car.flashLights(game.time);
      const d = dist2(car.pos.x, car.pos.z, pp.x, pp.z);
      u.repathT -= dt;
      if (d > 46) {
        // route along the road grid toward the player
        if (u.repathT <= 0 || u.pathI >= u.path.length) {
          u.path = gridPath(car.pos.x, car.pos.z, pp.x, pp.z);
          u.pathI = u.path.length > 1 ? 1 : 0;
          u.repathT = 2.4;
        }
        const wp = u.path[Math.min(u.pathI, u.path.length - 1)] || pp;
        const dd = steerTo(car, wp.x, wp.z, dt, 33);
        if (dd < 8 && u.pathI < u.path.length - 1) u.pathI++;
      } else {
        // final approach: take a slot around the player
        const slot = SLOTS[idx % SLOTS.length];
        const fx = Math.sin(pHeading), fz = Math.cos(pHeading);
        const rx = -fz, rz = fx;
        const tx = pp.x - fx * slot.back + rx * slot.side;
        const tz = pp.z - fz * slot.back + rz * slot.side;
        steerTo(car, tx, tz, dt, game.playerInCar() ? 34 : 15);
      }
      // stuck recovery
      u.stuckT += dt;
      if (u.stuckT > 1.6) {
        const moved = dist2(car.pos.x, car.pos.z, u.lastX, u.lastZ);
        if (moved < 1.1 && d > 26) {
          const s = spawnPoint();
          car.place(s.x, s.z, Math.atan2(pp.x - s.x, pp.z - s.z));
          u.path = []; u.repathT = 0;
        }
        u.lastX = car.pos.x; u.lastZ = car.pos.z; u.stuckT = 0;
      }
      car.update(dt, game.time);
      // gunfire at high wanted
      if (wanted >= 4 && d < 50) {
        u.shootT -= dt;
        if (u.shootT <= 0) {
          u.shootT = game.rng.range(0.8, 1.5);
          const from = { x: car.pos.x, y: 1.3, z: car.pos.z };
          const to = { x: pp.x, y: 1.2, z: pp.z };
          if (game.tracer) game.tracer(from, to, 0xffd23e);
          if (game.rng.chance(0.42)) game.damagePlayer(game.rng.range(3.5, 7));
          if (game.audio) game.audio.shoot();
        }
      }
    });

    // BUSTED meter
    if (wanted > 0 && units.length) {
      const pSpeed = game.playerSpeed();
      let close = 0;
      for (const u of units) if (dist2(u.car.pos.x, u.car.pos.z, pp.x, pp.z) < 9.5) close++;
      if (close > 0 && pSpeed < 2.3) bustedMeter = Math.min(1, bustedMeter + dt / 2.3);
      else bustedMeter = Math.max(0, bustedMeter - dt / 1.7);
      if (bustedMeter >= 1) { game.onBusted(); }
    } else {
      bustedMeter = Math.max(0, bustedMeter - dt / 1.7);
    }
  }

  return {
    update, clearAll,
    get wanted() { return wanted; },
    get busted01() { return bustedMeter; },
    get units() { return units; },
    get nearestDist() {
      const pp = game.playerPos();
      let n = Infinity;
      for (const u of units) n = Math.min(n, dist2(u.car.pos.x, u.car.pos.z, pp.x, pp.z));
      return n;
    },
    addWanted(n) { wanted = clamp(wanted + n, 0, 5); unseenT = 0; },
    setWanted(n) { wanted = clamp(n, 0, 5); unseenT = 0; },
  };
}
