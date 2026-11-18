// The Palmshade PD: a wanted system (heat, shown as 0-5 stars) and the interceptors
// that come with it. Crimes reported by the other systems add heat; police cars spawn
// on nearby roads and pursue, ramming a fleeing car or cornering a runner on foot.
// Stay out of sight and the heat cools off. Get cornered while slow or on foot and
// the busted meter fills — when it tops out, you wake up outside the station, poorer.

import { rand, clamp, dist2d } from './util.js';
import { ROAD_LINES } from './city.js';
import { createCar, driveCar, steerToward, damageCar, puff } from './vehicles.js';

const MAX_COPS = 6;

export function createPolice(game) {
  // game: { scene, playerPos(), playerCar(), playerOnFoot(), hurtPlayer(n), damagePlayerCar(n), onBusted(), audio }
  let heat = 0;
  let sightT = 99; // seconds since a cop last had eyes on the player
  let bustedMeter = 0;
  let spawnT = 0;
  let shootT = 1.5;
  const cars = [];

  const stars = () => (heat <= 0.05 ? 0 : Math.ceil(heat));

  function nearestLine(v) {
    let best = ROAD_LINES[0];
    for (const l of ROAD_LINES) if (Math.abs(l - v) < Math.abs(best - v)) best = l;
    return best;
  }

  /** Put a fresh interceptor on the street at a chosen spot, facing the player. */
  function spawnAt(x, z) {
    const pp = game.playerPos();
    const car = createCar(game.scene, { style: 'police', x, z, heading: Math.atan2(pp.x - x, pp.z - z) });
    car.driver = 'police';
    cars.push(car);
    return car;
  }

  function spawnCop() {
    const pp = game.playerPos();
    const angle = rand(Math.PI * 2);
    const dist = rand(78, 115);
    let x = clamp(pp.x + Math.cos(angle) * dist, -252, 252);
    let z = clamp(pp.z + Math.sin(angle) * dist, -252, 252);
    if (Math.random() < 0.5) x = nearestLine(x);
    else z = nearestLine(z);
    return spawnAt(x, z);
  }

  function removeCop(car) {
    game.scene.remove(car.group);
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
  }

  function addHeat(n) {
    heat = clamp(heat + n, 0, 5);
    if (n > 0) sightT = 0; // a fresh crime is a witnessed crime
  }

  function setHeat(n) {
    heat = clamp(n, 0, 5);
    sightT = 0;
  }

  function clearHeat() {
    heat = 0;
    bustedMeter = 0;
  }

  /**
   * One frame. Returns { busted01, nearestCopDist, stars } for the HUD and audio.
   * world is the shared driveCar world ({ colliders, cars, onCrash }).
   */
  function update(dt, world) {
    const pp = game.playerPos();
    const s = stars();

    // --- spawn / release ------------------------------------------------------
    const desired = s > 0 ? Math.min(1 + s, MAX_COPS) : 0;
    spawnT -= dt;
    if (cars.length < desired && spawnT <= 0) {
      spawnCop();
      spawnT = 1.1;
    }
    for (let i = cars.length - 1; i >= 0; i -= 1) {
      const d = dist2d(cars[i].group.position.x, cars[i].group.position.z, pp.x, pp.z);
      if ((s === 0 && d > 85) || d > 320) removeCop(cars[i]);
    }

    // --- eyes on the player? ----------------------------------------------------
    let nearest = Infinity;
    for (const cop of cars) {
      const d = dist2d(cop.group.position.x, cop.group.position.z, pp.x, pp.z);
      if (d < nearest) nearest = d;
    }
    if (nearest < 58) sightT = 0;
    else sightT += dt;
    if (sightT > 7 && heat > 0) {
      heat = Math.max(0, heat - dt * 0.075);
      if (heat < 0.05) heat = 0;
    }

    // --- pursuit ----------------------------------------------------------------
    const onFoot = game.playerOnFoot();
    const pCar = game.playerCar();
    // Pursuit slots around the target (in the target's frame: x = right, z = ahead),
    // so the pack surrounds a runner instead of stacking onto one point.
    const SLOTS = [[-5, -7], [5, -7], [-6, 0], [6, 0], [-9, -14], [9, -14]];
    const pHeading = pCar ? pCar.heading : 0;
    const pSin = Math.sin(pHeading);
    const pCos = Math.cos(pHeading);
    let slotIndex = 0;
    for (const cop of cars) {
      if (cop.health <= 0) {
        driveCar(cop, dt, { throttle: 0, steer: 0, handbrake: true }, world);
        continue;
      }
      if (s === 0) {
        // Heat is gone: break off and drive away from the player.
        const away = steerToward(cop, pp.x + (cop.group.position.x - pp.x) * 3, pp.z + (cop.group.position.z - pp.z) * 3, { throttle: 0.7 });
        driveCar(cop, dt, away, world);
        continue;
      }
      // Aim at this cop's slot beside/behind the target; when really close, ram home.
      const lead = pCar ? clamp(Math.abs(pCar.speed) * 0.35, 0, 9) : 0;
      let tx = pp.x + (pCar ? pSin * lead : 0);
      let tz = pp.z + (pCar ? pCos * lead : 0);
      const dSelf = dist2d(cop.group.position.x, cop.group.position.z, pp.x, pp.z);
      if (pCar && dSelf > 9) {
        const [ox, oz] = SLOTS[slotIndex % SLOTS.length];
        tx += -pCos * ox + pSin * oz; // slot offset rotated into the target's frame
        tz += pSin * ox + pCos * oz;
      }
      slotIndex += 1;
      const input = steerToward(cop, tx, tz, {
        throttle: 1,
        slowFor: onFoot ? 10 : 0,
        stopAt: onFoot ? 3.1 : 0,
      });
      driveCar(cop, dt, input, world);

      // Light bar: alternate red and blue, faster when close.
      if (cop.lights) {
        cop.lights.phase += dt * (nearest < 25 ? 11 : 8);
        const on = Math.sin(cop.lights.phase) > 0;
        cop.lights.red.emissiveIntensity = on ? 3.2 : 0.1;
        cop.lights.blue.emissiveIntensity = on ? 0.1 : 3.2;
      }
    }

    // --- busted meter -------------------------------------------------------------
    const playerSlow = onFoot ? game.playerSpeed() < 2.2 : Math.abs(pCar ? pCar.speed : 0) < 1.4;
    const bustRange = onFoot ? 3.6 : 7;
    if (s > 0 && playerSlow && nearest < bustRange) {
      bustedMeter += dt / 2.3;
      if (bustedMeter >= 1) {
        bustedMeter = 0;
        game.onBusted();
      }
    } else {
      bustedMeter = Math.max(0, bustedMeter - dt * 0.8);
    }

    // --- gunfire at high heat -------------------------------------------------------
    if (s >= 4 && nearest < 34) {
      shootT -= dt;
      if (shootT <= 0) {
        shootT = rand(1.1, 1.7);
        if (game.audio) game.audio.shoot();
        if (pCar) {
          damageCar(pCar, rand(2.5, 5));
          puff(pCar.group.position.x, 1, pCar.group.position.z, 0.8, false);
        } else {
          game.hurtPlayer(rand(3, 7));
        }
      }
    } else {
      shootT = Math.max(shootT, 0.6);
    }

    return { busted01: bustedMeter, nearestCopDist: nearest, stars: s };
  }

  return {
    cars,
    update,
    addHeat,
    setHeat,
    clearHeat,
    spawnAt,
    stars,
    get heat() { return heat; },
    get busted01() { return bustedMeter; },
  };
}
