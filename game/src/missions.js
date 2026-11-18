// Missions: a five-job story chain for Marisol Vega, whose delivery vans keep going
// missing in Palmshade City. Each job is a short list of stages — get in the van,
// drive to the marker, collect the drops, outrun the heat — run by a small state
// machine. A pillar of gold light marks the current target; the banner carries the
// objective and the cast's dialogue. Finish the chain and it offers itself again
// from the top; free roam never stops either way.

import * as THREE from 'three';
import { dist2d } from './util.js';
import { POINTS } from './city.js';
import { createCar } from './vehicles.js';

const CHAIN = [
  {
    id: 'm1',
    title: 'First Errand',
    giver: 'Marisol Vega',
    reward: 250,
    startPos: POINTS.cafe,
    removeCarOnComplete: true,
    intro: [
      ['Marisol', "You must be my new driver. The van's parked by my café — take it to the depot across town."],
      ['Marisol', 'And hey. Welcome to Palmshade.'],
    ],
    stages: [
      {
        type: 'getin',
        spawnCar: { style: 'van', color: 0xffb340, x: -216.5, z: -12, heading: 0 },
        objective: "Get into Marisol's delivery van",
      },
      {
        type: 'gotoCar',
        pos: POINTS.depot,
        radius: 11,
        objective: 'Deliver the van to the depot (east side)',
        dialogue: [['Marisol', 'Depot closes at sundown. No pressure. Some pressure.']],
      },
    ],
  },
  {
    id: 'm2',
    title: 'Three Drops',
    giver: 'Marisol Vega',
    reward: 300,
    startPos: POINTS.depot,
    intro: [
      ['Marisol', 'Three drops today, all corners. Drive through the gold markers, keep the change.'],
    ],
    stages: [
      {
        type: 'collect',
        points: [
          { x: 0, z: -74 },
          { x: 148, z: 74 },
          { x: -74, z: 148 },
        ],
        radius: 6.5,
        objective: 'Make the drops',
      },
    ],
  },
  {
    id: 'm3',
    title: 'Hot Van',
    giver: 'Marisol Vega',
    reward: 450,
    startPos: POINTS.depot,
    removeCarOnComplete: true,
    intro: [
      ['Marisol', "This one's... warm. Don't ask what's in the back. Get it to the promenade, fast."],
    ],
    stages: [
      {
        type: 'getin',
        spawnCar: { style: 'van', color: 0xfd79a8, x: 225.5, z: 96, heading: Math.PI },
        objective: 'Take the marked van',
      },
      {
        type: 'escape',
        pos: { x: -231, z: 148 },
        radius: 11,
        setWanted: 2,
        objective: 'Reach the promenade drop-off — the PD wants this van',
        dialogue: [['Marisol', 'Whatever happens, the van gets there. You? Also get there.']],
      },
    ],
  },
  {
    id: 'm4',
    title: 'Sunset Run',
    giver: 'Rico Vega',
    reward: 400,
    startPos: POINTS.hideout,
    timeLimit: 110,
    intro: [
      ['Rico', "Cousin says you can drive. Prove it: four corners of the city before the light goes. Clock's running."],
    ],
    stages: [
      {
        type: 'collect',
        ordered: true,
        points: [
          { x: 74, z: 0 },
          { x: 0, z: 74 },
          { x: -148, z: 0 },
          { x: 0, z: -148 },
        ],
        radius: 9,
        objective: 'Hit every checkpoint',
      },
    ],
  },
  {
    id: 'm5',
    title: 'The Big Take-Back',
    giver: 'Marisol Vega',
    reward: 800,
    startPos: POINTS.cafe,
    intro: [
      ['Marisol', 'Last job. My missing cargo is sitting in the south warehouse yard. Take it back for me.'],
      ['Marisol', 'If the PD shows up — and they will — you run to my cousin\'s garage.'],
    ],
    stages: [
      {
        type: 'goto',
        pos: POINTS.warehouse,
        radius: 10,
        objective: 'Head to the warehouse on the south shore',
      },
      {
        type: 'goto',
        pos: { x: 122, z: -247 },
        radius: 4.5,
        requireFoot: true,
        objective: 'Grab the package (on foot)',
        dialogue: [['Marisol', "That's it — the gold crate. Grab it and go!"]],
      },
      {
        type: 'escape',
        pos: POINTS.hideout,
        radius: 11,
        setWanted: 3,
        objective: 'Escape to the hideout garage',
      },
    ],
  },
];

export function createMissions(game) {
  // game: { scene, player, playerPos(), police, addMoney(n), setObjective(t),
  //         banner(title, sub), say(who, line), audio, forceExitCar(), onMissionComplete(),
  //         extraCars (array this module fills) }
  let chainIndex = 0;
  let active = null; // { def, stageIdx, entered, car, remaining, timerLeft, packageMeshes }
  let lastObjective = '';
  let shotMarkerPos = null;

  // ---- the gold marker -----------------------------------------------------
  const markerGroup = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.7, 36, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc93e, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 18;
  markerGroup.add(pillar);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.1, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.25;
  markerGroup.add(ring);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.85),
    new THREE.MeshBasicMaterial({ color: 0xffd23e }),
  );
  gem.position.y = 3.4;
  markerGroup.add(gem);
  markerGroup.visible = false;
  game.scene.add(markerGroup);

  function setObjective(text) {
    if (text !== lastObjective) {
      lastObjective = text;
      game.setObjective(text);
    }
  }

  function currentOffer() {
    if (active) return null;
    if (chainIndex < CHAIN.length) return CHAIN[chainIndex];
    return CHAIN[0]; // chain finished: offer a replay from the top
  }

  function startMission(index) {
    const def = CHAIN[index];
    chainIndex = index;
    active = {
      def,
      stageIdx: 0,
      entered: false,
      car: null,
      remaining: [],
      timerLeft: def.timeLimit || 0,
      packageMeshes: [],
    };
    game.banner(def.title, `A job for ${def.giver} — $${def.reward}`);
    for (const [who, line] of def.intro) game.say(who, line);
    if (game.audio) game.audio.blip();
  }

  function cleanupMissionCar() {
    if (active && active.car) {
      const car = active.car;
      if (game.player.car === car) game.forceExitCar();
      game.scene.remove(car.group);
      const i = game.extraCars.indexOf(car);
      if (i >= 0) game.extraCars.splice(i, 1);
      active.car = null;
    }
    if (active) {
      for (const m of active.packageMeshes) game.scene.remove(m);
      active.packageMeshes = [];
    }
  }

  function failMission(reason) {
    if (!active) return;
    game.banner('Job failed', reason);
    if (game.audio) game.audio.sting();
    cleanupMissionCar();
    if (active.def.stages.some((s) => s.setWanted)) game.police.clearHeat();
    active = null;
  }

  function completeMission() {
    const def = active.def;
    cleanupMissionCar();
    active = null;
    chainIndex = def === CHAIN[CHAIN.length - 1] && chainIndex === CHAIN.length - 1 ? CHAIN.length : chainIndex + 1;
    game.addMoney(def.reward);
    if (game.audio) game.audio.cash();
    if (chainIndex >= CHAIN.length) {
      game.banner('Story complete!', `Marisol's vans are rolling again. Final job paid $${def.reward} — free roam, or run it all again from the café.`);
    } else {
      game.banner('Job done!', `$${def.reward} wired to you. Next job: ${CHAIN[chainIndex].title}.`);
    }
    game.onMissionComplete();
  }

  function enterStage() {
    const stage = active.def.stages[active.stageIdx];
    active.entered = true;
    if (stage.dialogue) for (const [who, line] of stage.dialogue) game.say(who, line);
    if (stage.setWanted) game.police.setHeat(stage.setWanted);
    if (stage.type === 'getin' && stage.spawnCar) {
      const car = createCar(game.scene, stage.spawnCar);
      car.isMissionCar = true;
      car.claimed = true; // doing a job is not theft
      active.car = car;
      game.extraCars.push(car);
    }
    if (stage.type === 'collect') {
      active.remaining = stage.points.map((p) => ({ ...p }));
      if (!stage.ordered) {
        // Visible gold crates for unordered drops; ordered checkpoints ride the pillar alone.
        for (const p of active.remaining) {
          const crate = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.95),
            new THREE.MeshBasicMaterial({ color: 0xffd23e }),
          );
          crate.position.set(p.x, 1.3, p.z);
          game.scene.add(crate);
          active.packageMeshes.push(crate);
          p.mesh = crate;
        }
      }
    }
  }

  /** Where the gold pillar stands right now, or null. */
  function markerPos() {
    if (shotMarkerPos) return shotMarkerPos;
    if (!active) {
      const offer = currentOffer();
      return offer ? offer.startPos : null;
    }
    const stage = active.def.stages[active.stageIdx];
    if (!stage) return null;
    if (stage.type === 'getin') return active.car ? active.car.group.position : stage.spawnCar;
    if (stage.type === 'collect') {
      if (!active.remaining.length) return null;
      if (stage.ordered) return active.remaining[0];
      const pp = game.playerPos();
      let best = active.remaining[0];
      let bd = Infinity;
      for (const p of active.remaining) {
        const d = dist2d(pp.x, pp.z, p.x, p.z);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    }
    return stage.pos;
  }

  function stageComplete() {
    if (!active) return;
    const stage = active.def.stages[active.stageIdx];
    if (stage.type === 'escape') game.police.clearHeat();
    active.stageIdx += 1;
    active.entered = false;
    if (active.stageIdx >= active.def.stages.length) completeMission();
  }

  /** One frame. */
  function update(dt, elapsed) {
    // Marker visuals follow the current target.
    const mp = markerPos();
    if (mp) {
      markerGroup.visible = true;
      markerGroup.position.set(mp.x, 0, mp.z);
      gem.rotation.y += dt * 2.4;
      gem.position.y = 3.4 + Math.sin(elapsed * 2.2) * 0.35;
      ring.scale.setScalar(1 + Math.sin(elapsed * 3) * 0.08);
    } else {
      markerGroup.visible = false;
    }
    if (active) {
      for (const m of active.packageMeshes) m.rotation.y += dt * 1.8;
    }

    if (!active) {
      const offer = currentOffer();
      if (offer) {
        setObjective(chainIndex >= CHAIN.length
          ? `Free roam — replay Marisol's jobs from the café marker`
          : `New job: ${offer.title} — head to the gold marker`);
        const pp = game.playerPos();
        if (dist2d(pp.x, pp.z, offer.startPos.x, offer.startPos.z) < 7) {
          startMission(chainIndex >= CHAIN.length ? 0 : chainIndex);
        }
      } else {
        setObjective('Free roam');
      }
      return;
    }

    const def = active.def;
    if (!active.entered) enterStage();
    const stage = def.stages[active.stageIdx];
    if (!stage) return;

    // Mission timer.
    if (def.timeLimit) {
      active.timerLeft -= dt;
      if (active.timerLeft <= 0) {
        failMission('Out of time. The job is still there if you want it.');
        return;
      }
    }

    const pp = game.playerPos();
    let objective = stage.objective;
    if (stage.type === 'collect') {
      objective = `${stage.objective} — ${active.remaining.length} to go`;
    }
    if (def.timeLimit) objective += ` · ${Math.ceil(active.timerLeft)}s`;
    setObjective(objective);

    if (stage.type === 'getin') {
      if (game.player.car && game.player.car === active.car) stageComplete();
    } else if (stage.type === 'collect') {
      for (let i = active.remaining.length - 1; i >= 0; i -= 1) {
        const p = active.remaining[i];
        if (dist2d(pp.x, pp.z, p.x, p.z) < stage.radius) {
          if (p.mesh) {
            game.scene.remove(p.mesh);
            const mi = active.packageMeshes.indexOf(p.mesh);
            if (mi >= 0) active.packageMeshes.splice(mi, 1);
          }
          active.remaining.splice(i, 1);
          if (game.audio) game.audio.blip();
          game.banner('Drop made', active.remaining.length ? `${active.remaining.length} to go.` : 'All drops done.');
        }
      }
      if (!active.remaining.length) stageComplete();
    } else {
      // goto / gotoCar / escape
      const inCar = !!game.player.car;
      const carOk = stage.type !== 'gotoCar' || game.player.car === active.car;
      const footOk = !stage.requireFoot || !inCar;
      if (carOk && footOk && dist2d(pp.x, pp.z, stage.pos.x, stage.pos.z) < stage.radius) {
        stageComplete();
      }
    }
  }

  return {
    update,
    markerPos,
    startMission,
    extraCars: game.extraCars,
    get chainIndex() { return chainIndex; },
    setChainIndex(n) { chainIndex = Math.max(0, Math.min(CHAIN.length, n)); },
    get active() { return active; },
    get chainLength() { return CHAIN.length; },
    /** Screenshot staging: park the gold pillar somewhere photogenic. */
    debugMarker(pos) { shotMarkerPos = pos; },
  };
}
