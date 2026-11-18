// Traffic: the everyday cars of Palmshade. Each one follows the road grid — a current
// road, a direction and a right-hand lane — steering toward a look-ahead point on its
// lane, so corners come out smooth. At intersections they sometimes turn; when the car
// ahead (or the player) is in the way, they slow and stop. Cars that wander too far
// from the player quietly respawn on a road nearby, so the streets near you are
// always alive but the far side of the city costs nothing.

import { rand, pick, clamp, dist2d, wrapAngle } from './util.js';
import { ROAD_LINES, laneFor } from './city.js';
import { createCar, driveCar, CAR_COLORS } from './vehicles.js';

const CRUISE = { min: 10, max: 14.5 };
const DESPAWN_DIST = 290;
const SPAWN_MIN = 110;

export function createTraffic(scene, count = 14) {
  const cars = [];
  const brains = new Map(); // car -> { axis, dir, road, decidedFor, willTurn, turnDir, cruise }

  function placeOnRoad(car, nearPos) {
    const axis = Math.random() < 0.5 ? 'z' : 'x';
    const road = pick(ROAD_LINES);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const lane = laneFor(axis, dir, road);
    let along = rand(-245, 245);
    if (nearPos) {
      const playerAlong = axis === 'z' ? nearPos.z : nearPos.x;
      for (let tries = 0; tries < 8; tries += 1) {
        along = rand(-245, 245);
        if (Math.abs(along - playerAlong) > SPAWN_MIN) break;
      }
    }
    if (axis === 'z') car.group.position.set(lane, 0, along);
    else car.group.position.set(along, 0, lane);
    car.heading = axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    car.speed = rand(CRUISE.min, CRUISE.max) * 0.7;
    car.health = 100;
    car.group.rotation.y = car.heading;
    brains.set(car, {
      axis, dir, road,
      decidedFor: null,
      willTurn: false,
      turnDir: 1,
      cruise: rand(CRUISE.min, CRUISE.max),
    });
  }

  for (let i = 0; i < count; i += 1) {
    const car = createCar(scene, { style: pick(['sedan', 'sedan', 'pickup', 'van', 'sport']), color: pick(CAR_COLORS) });
    car.driver = 'traffic';
    placeOnRoad(car, null);
    cars.push(car);
  }

  /** Is something slow or stopped just ahead of this car, in its lane? */
  function blockedAhead(car, brain, ctx) {
    const p = car.group.position;
    const lookAhead = 7 + Math.abs(car.speed) * 0.9;
    const aheadOf = (o) => {
      const alongDiff = brain.axis === 'z' ? (o.z - p.z) * brain.dir : (o.x - p.x) * brain.dir;
      const crossDiff = brain.axis === 'z' ? Math.abs(o.x - p.x) : Math.abs(o.z - p.z);
      return alongDiff > 0 && alongDiff < lookAhead && crossDiff < 2.4;
    };
    for (const other of ctx.cars) {
      if (other !== car && aheadOf(other.group.position)) return true;
    }
    if (ctx.playerPos && !ctx.playerCar && aheadOf(ctx.playerPos)) return true;
    return false;
  }

  /**
   * One frame for all traffic. ctx: { colliders, cars (every vehicle), playerPos,
   * playerCar, onCrash }.
   */
  function update(dt, ctx) {
    for (const car of cars) {
      const brain = brains.get(car);
      const p = car.group.position;

      // Too far from the player: respawn on a road nearer by (nobody saw a thing).
      if (ctx.playerPos && dist2d(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z) > DESPAWN_DIST) {
        placeOnRoad(car, ctx.playerPos);
        continue;
      }
      if (car.health <= 0) {
        // A wreck stops being traffic: it just sits and smoulders.
        driveCar(car, dt, { throttle: 0, steer: 0, handbrake: true }, ctx);
        continue;
      }

      const along = brain.axis === 'z' ? p.z : p.x;
      const lane = laneFor(brain.axis, brain.dir, brain.road);

      // Approaching an intersection? Decide once per crossing whether to turn.
      let turnLine = null;
      for (const line of ROAD_LINES) {
        const aheadDist = (line - along) * brain.dir;
        if (aheadDist > 0 && aheadDist < 18) {
          if (brain.decidedFor !== line) {
            brain.decidedFor = line;
            brain.willTurn = Math.random() < 0.38;
            brain.turnDir = Math.random() < 0.5 ? 1 : -1;
          }
          if (brain.willTurn) turnLine = line;
        }
      }

      // Pick the look-ahead point.
      let tx;
      let tz;
      if (turnLine !== null && (turnLine - along) * brain.dir <= 4.5) {
        // Commit to the turn: the cross street becomes the road we are on.
        brain.axis = brain.axis === 'z' ? 'x' : 'z';
        brain.dir = brain.turnDir;
        brain.road = turnLine;
        brain.willTurn = false;
        const newLane = laneFor(brain.axis, brain.dir, brain.road);
        if (brain.axis === 'z') { tx = newLane; tz = p.z + brain.dir * 15; }
        else { tx = p.x + brain.dir * 15; tz = newLane; }
      } else if (turnLine !== null) {
        // Aim at the corner of our lane and the cross street.
        if (brain.axis === 'z') { tx = lane; tz = turnLine; }
        else { tx = turnLine; tz = lane; }
      } else if (brain.axis === 'z') {
        tx = lane;
        tz = p.z + brain.dir * 16;
      } else {
        tx = p.x + brain.dir * 16;
        tz = lane;
      }

      const desired = Math.atan2(tx - p.x, tz - p.z);
      const diff = wrapAngle(desired - car.heading);
      let throttle = 0.85;
      if (car.speed > brain.cruise) throttle = car.speed > brain.cruise + 3 ? -0.6 : 0.1;
      if (Math.abs(diff) > 0.9) throttle *= 0.5;
      if (blockedAhead(car, brain, ctx)) throttle = car.speed > 1.5 ? -0.85 : 0;
      driveCar(car, dt, { throttle, steer: clamp(diff * 1.7, -1, 1), handbrake: false }, ctx);
    }
  }

  return { cars, update };
}
