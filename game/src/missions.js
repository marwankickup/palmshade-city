// missions.js — Marisol Vega's 7-mission story chain: deliveries, a package
// run, a showroom sprint, a police escape, a marina pickup, a convoy and the
// warehouse finale. Gold pillar markers, banner dialogue, cash rewards.
import * as THREE from 'three';
import { Car } from './vehicles.js';
import { buildFigure } from './peds.js';
import { dist2 } from './util.js';

export function createMissions(game) {
  const L = game.city.landmarks;
  const scene = game.scene;

  // Marisol herself, waiting on the café terrace
  const marisol = buildFigure({ shirt: 0x0f766e, pants: 0xf2ead8, skin: 0x8a5a34, hair: 0x14100c, dress: true });
  marisol.group.position.set(L.cafe.marisol.x, 0.35, L.cafe.marisol.z);
  marisol.group.rotation.y = Math.PI / 2; // face the promenade
  scene.add(marisol.group);

  // gold pillar marker + ground ring
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 34, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc93e, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  pillar.position.y = 17;
  const markerGroup = new THREE.Group();
  markerGroup.add(pillar);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.3, 28),
    new THREE.MeshBasicMaterial({ color: 0xffc93e, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12;
  markerGroup.add(ring);
  markerGroup.visible = false;
  scene.add(markerGroup);

  const MISSIONS = [
    {
      title: 'First Delivery', reward: 300,
      steps: [
        { type: 'talk', say: [['Marisol', 'You must be the new driver. I am Marisol — Café Marisol, best cortadito on the coast.'], ['Marisol', 'The Breakwater Boys keep "losing" my deliveries. Take my van and prove you can move a box across town.']] },
        { type: 'getin', spawn: { type: 'van', color: 0xf2b13c, x: 103, z: 18, heading: 0 }, say: [['Marisol', 'The yellow van, by the kerb. She is old but honest.']] },
        { type: 'goto', x: L.warehouse.front.x, z: L.warehouse.front.z, needCar: true, label: 'Deliver the van to the warehouse', say: [['Marisol', 'Warehouse up north, by the old docks road. Do not scratch her.']] },
      ],
      done: 'Clean run. The Boys will hear about this — good.',
    },
    {
      title: 'Coffee Run', reward: 250,
      steps: [
        { type: 'talk', say: [['Marisol', 'Three cafés on the strip take my beans. Their runners quit — scared of the Boys. You are the runner now.']] },
        { type: 'collect', points: [{ x: 130.6, z: -60 }, { x: 66, z: 130.6 }, { x: -34, z: -69.4 }], label: 'Drop the bean sacks', say: [['Marisol', 'Three drops. Follow the gold pillars.']] },
        { type: 'goto', x: L.cafe.front.x, z: L.cafe.front.z, label: 'Return to Café Marisol' },
      ],
      done: 'Every café stocked. You are earning your keep, driver.',
    },
    {
      title: 'Showroom Shine', reward: 400,
      steps: [
        { type: 'talk', say: [['Marisol', 'A collector at the marina wants my cousin’s show car — it sits in the parking garage. He pays cash, today only.']] },
        { type: 'getin', spawn: { type: 'sport', color: 0xd8544a, x: -90, z: -84, heading: Math.PI / 2 }, say: [['Marisol', 'Red sports car, ground floor of the garage. Treat her like glass.']] },
        { type: 'goto', x: L.marina.shore.x, z: L.marina.shore.z, needCar: true, time: 80, label: 'Deliver the show car to the marina', say: [['Marisol', 'He waits by the marina. Clock is ticking!']] },
      ],
      done: 'Sold! The collector sends his thanks — and his cash.',
    },
    {
      title: 'Heat Wave', reward: 450,
      steps: [
        { type: 'talk', say: [['Marisol', 'The Boys hid a crate of mine behind the warehouse. Take it back — but if the PD see you, lose them before you come home.']] },
        { type: 'goto', x: -52, z: -206, label: 'Pick up the crate behind the warehouse', say: [['Marisol', 'West side of the warehouse. Quick hands.']] },
        { type: 'escape', x: L.garage.entry.x, z: L.garage.entry.z, label: 'Lose the heat, then reach the garage safehouse', say: [['Marisol', 'Sirens! Break their sight, then the old garage — go!']] },
      ],
      done: 'My crate, home safe. The Boys are furious. Perfect.',
    },
    {
      title: 'Marina Run', reward: 350,
      steps: [
        { type: 'talk', say: [['Marisol', 'Boat parts for my brother’s trawler wait at the end of the pier. Legs, driver — the pier is walkers only.']] },
        { type: 'goto', x: L.marina.pierEnd.x, z: L.marina.pierEnd.z, label: 'Collect the parts at the pier end', say: [['Marisol', 'End of the pier. Mind the gulls.']] },
        { type: 'goto', x: L.garage.entry.x, z: L.garage.entry.z, label: 'Bring the parts to the garage' },
      ],
      done: 'The trawler sails at dawn. You did that.',
    },
    {
      title: 'Convoy', reward: 500,
      steps: [
        { type: 'talk', say: [['Marisol', 'Two vans, two drops, one morning. Van one goes to the warehouse — van two waits there for the marina run.']] },
        { type: 'getin', spawn: { type: 'van', color: 0x3f7fbf, x: 103, z: 18, heading: 0 }, say: [['Marisol', 'Blue van first. Warehouse.']] },
        { type: 'goto', x: L.warehouse.front.x, z: L.warehouse.front.z, needCar: true, label: 'Van one: deliver to the warehouse' },
        { type: 'getin', spawn: { type: 'van', color: 0x3fae8a, x: -16, z: -184, heading: Math.PI }, say: [['Marisol', 'Green van, by the warehouse door. Marina next.']] },
        { type: 'goto', x: L.marina.shore.x, z: L.marina.shore.z, needCar: true, label: 'Van two: deliver to the marina' },
      ],
      done: 'A convoy of two, both home. The strip is talking about you.',
    },
    {
      title: 'The Final Order', reward: 800,
      steps: [
        { type: 'talk', say: [['Marisol', 'The big one. Warehouse, then marina, then home — the Boys will try to spoil it, and the PD are jumpy today.']] },
        { type: 'goto', x: L.warehouse.front.x, z: L.warehouse.front.z, time: 65, label: 'Final order: reach the warehouse', say: [['Marisol', 'Warehouse first. Fast!']] },
        { type: 'goto', x: L.marina.shore.x, z: L.marina.shore.z, time: 65, label: 'Then the marina', say: [['Marisol', 'Marina! And driver — the PD are watching the coast road.']] },
        { type: 'goto', x: L.cafe.front.x, z: L.cafe.front.z, label: 'Bring it home to Café Marisol' },
      ],
      done: 'It is over — the bay is ours again. Palmshade remembers its friends, driver.',
    },
  ];

  let index = 0;          // next/current mission
  let stepIndex = 0;
  let active = false;
  let chainDone = false;
  let missionCar = null;
  let stepTime = 0;
  let collectIdx = 0;
  let sayT = 0;

  function say(lines) {
    if (!lines || !lines.length) return;
    let delay = 0;
    for (const [who, line] of lines) {
      setTimeout(() => game.hud.say(who, line, 4.2), delay * 1000);
      delay += 4.4;
    }
    sayT = delay;
  }

  function currentStep() { return active ? MISSIONS[index].steps[stepIndex] : null; }

  function stepTarget(step) {
    if (!step) return null;
    switch (step.type) {
      case 'talk': return { x: L.cafe.marisol.x, z: L.cafe.marisol.z };
      case 'getin': return missionCar ? { x: missionCar.pos.x, z: missionCar.pos.z } : { x: step.spawn.x, z: step.spawn.z };
      case 'goto': case 'escape': return { x: step.x, z: step.z };
      case 'collect': return step.points[Math.min(collectIdx, step.points.length - 1)];
      default: return null;
    }
  }

  function spawnMissionCar(step) {
    if (missionCar) { // retire the previous mission vehicle
      missionCar.isMissionCar = false;
      missionCar = null;
    }
    const s = step.spawn;
    const car = new Car(scene, s.type, s.color, game.city.colliders);
    car.isMissionCar = true;
    car.place(s.x, s.z, s.heading);
    game.cars.push(car);
    missionCar = car;
  }

  function beginStep() {
    const step = currentStep();
    if (!step) return;
    collectIdx = 0;
    stepTime = step.time || 0;
    if (step.type === 'getin') spawnMissionCar(step);
    if (step.type === 'escape') game.police.setWanted(3);
    if (index === 6 && stepIndex === 2) game.police.setWanted(Math.max(game.police.wanted, 2));
    say(step.say);
  }

  function startMission(i) {
    index = i;
    stepIndex = 0;
    active = true;
    game.hud.toast('Mission: ' + MISSIONS[i].title);
    beginStep();
  }

  function completeMission() {
    const m = MISSIONS[index];
    game.addMoney(m.reward);
    game.audio.reward();
    game.hud.say('Marisol', m.done, 5);
    game.hud.toast('Mission complete! +$' + m.reward);
    active = false;
    if (missionCar) { missionCar.isMissionCar = false; missionCar = null; }
    index += 1;
    if (index >= MISSIONS.length) { index = 0; chainDone = true; game.hud.toast('Story complete! Talk to Marisol to replay.'); }
    game.saveGame();
  }

  function failMission(reason) {
    game.hud.say('Marisol', reason || 'That went sideways. Come back and we try again.', 4.5);
    active = false;
    if (missionCar) { missionCar.isMissionCar = false; missionCar = null; }
    markerGroup.visible = false;
    game.hud.setObjective('');
  }

  function advance() {
    stepIndex += 1;
    if (stepIndex >= MISSIONS[index].steps.length) completeMission();
    else beginStep();
  }

  function objectiveText(step) {
    if (!step) return '';
    const m = MISSIONS[index];
    switch (step.type) {
      case 'talk': return 'Talk to Marisol at Café Marisol';
      case 'getin': return 'Get in the ' + (step.spawn.type === 'van' ? 'van' : 'car') + ' — ' + m.title;
      case 'goto': return (step.label || 'Reach the marker') + (step.time ? ' — ' + Math.ceil(stepTime) + 's' : '');
      case 'collect': return (step.label || 'Collect') + ' — ' + collectIdx + '/' + step.points.length;
      case 'escape': return game.police.wanted > 0 ? 'Lose the heat! (wanted ★' + game.police.wanted + ')' : 'Reach the garage safehouse';
      default: return m.title;
    }
  }

  function update(dt) {
    // Marisol idle sway
    marisol.group.rotation.y = Math.PI / 2 + Math.sin(game.time * 0.7) * 0.14;
    const pp = game.player.pos;
    const nearMarisol = !game.playerInCar() && dist2(pp.x, pp.z, L.cafe.marisol.x, L.cafe.marisol.z) < 3.2;

    if (!active) {
      markerGroup.visible = true;
      markerGroup.position.set(L.cafe.marisol.x, pp.y > 1 ? 0 : 0, L.cafe.marisol.z);
      markerGroup.position.y = 0;
      game.hud.setObjective(chainDone ? 'Free roam — talk to Marisol to replay the story' : 'Talk to Marisol at Café Marisol');
      if (nearMarisol) game.hud.setPrompt('<b>E</b> — Talk to Marisol');
      return;
    }
    const step = currentStep();
    if (!step) return;
    const target = stepTarget(step);
    if (target) {
      markerGroup.visible = true;
      markerGroup.position.set(target.x, 0, target.z);
      ring.scale.setScalar(1 + Math.sin(game.time * 4) * 0.12);
    } else markerGroup.visible = false;
    game.hud.setObjective(objectiveText(step));

    const inCar = game.playerInCar();
    const pTarget = inCar ? game.playerCar().pos : pp;
    switch (step.type) {
      case 'talk':
        if (nearMarisol) game.hud.setPrompt('<b>E</b> — Talk to Marisol');
        break;
      case 'getin':
        if (missionCar && missionCar.health <= 5) { spawnMissionCar(step); game.hud.toast('Vehicle replaced — the show must go on.'); }
        if (inCar && game.playerCar() === missionCar) advance();
        break;
      case 'goto': {
        if (step.time) {
          stepTime -= dt;
          if (stepTime <= 0) { failMission('Out of time! The order went cold. Come back to the café.'); return; }
        }
        const ok = step.needCar ? inCar : true;
        const r = inCar ? 8 : 3.4;
        if (ok && dist2(pTarget.x, pTarget.z, step.x, step.z) < r) advance();
        break;
      }
      case 'collect': {
        const pt = step.points[collectIdx];
        const r = inCar ? 7 : 3.2;
        if (dist2(pTarget.x, pTarget.z, pt.x, pt.z) < r) {
          collectIdx += 1;
          game.audio.pickup();
          game.addMoney(40);
          game.hud.toast('Delivered! +$40 (' + collectIdx + '/' + step.points.length + ')');
          if (collectIdx >= step.points.length) advance();
        }
        break;
      }
      case 'escape': {
        if (game.police.wanted === 0 && dist2(pTarget.x, pTarget.z, step.x, step.z) < 9) advance();
        break;
      }
    }
  }

  // E pressed while on foot near Marisol (called by main)
  function tryInteract() {
    const pp = game.player.pos;
    if (game.playerInCar()) return false;
    if (dist2(pp.x, pp.z, L.cafe.marisol.x, L.cafe.marisol.z) >= 3.2) return false;
    if (!active) {
      startMission(index);
      if (currentStep() && currentStep().type === 'talk') advance(); // the talk is this interaction
      return true;
    }
    if (currentStep() && currentStep().type === 'talk') { advance(); return true; }
    return false;
  }

  return {
    update, tryInteract, startMission,
    get active() { return active; },
    get index() { return index; },
    get chainDone() { return chainDone; },
    get markerPos() {
      if (!active) return { x: L.cafe.marisol.x, z: L.cafe.marisol.z };
      return stepTarget(currentStep());
    },
    applySave(idx, done) {
      index = Math.min(idx, MISSIONS.length - 1);
      chainDone = !!done;
      if (chainDone) index = 0;
    },
    debug: {
      startMission: (i) => startMission(i),
      setStep: (n) => { if (active) { stepIndex = Math.min(n, MISSIONS[index].steps.length - 1); beginStep(); } },
      state: () => ({ active, index, stepIndex, chainDone }),
      missionCar: () => missionCar,
    },
  };
}
