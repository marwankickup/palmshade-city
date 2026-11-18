// Combat: on-foot shooting. A click fires a ray from the camera through the crosshair;
// the nearest pedestrian, car or police interceptor along it takes the hit. Pedestrians
// drop and the crowd scatters, cars dent and spark, and every shot is a crime the
// police module hears about. A little sprite flash at the muzzle sells the shot.

import * as THREE from 'three';
import { rand } from './util.js';
import { damageCar, puff } from './vehicles.js';

export function createCombat(game) {
  // game: { scene, camera, player, peds, cars(), police, audio, onCrime(kind, x, z) }
  let cooldown = 0;
  let flashT = 0;

  const flashTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,240,190,1)');
    grad.addColorStop(0.4, 'rgba(255,180,80,0.7)');
    grad.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, opacity: 0, depthWrite: false }));
  flash.scale.set(0.9, 0.9, 1);
  flash.visible = false;
  game.scene.add(flash);

  const origin = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const centre = new THREE.Vector3();

  /** Ray vs sphere: returns the hit distance along the ray, or Infinity. */
  function raySphere(cx, cy, cz, r) {
    centre.set(cx, cy, cz).sub(origin);
    const t = centre.dot(dir);
    if (t < 0) return Infinity;
    const d2 = centre.lengthSq() - t * t;
    return d2 > r * r ? Infinity : t;
  }

  /** Fire one shot, if the gun has cooled down and the player is on foot. */
  function tryShoot() {
    if (cooldown > 0 || game.player.car) return false;
    cooldown = 0.24;
    if (game.audio) game.audio.shoot();

    game.camera.getWorldPosition(origin);
    game.camera.getWorldDirection(dir);

    // Muzzle flash at the player's shoulder, toward the aim.
    const pp = game.player.group.position;
    flash.position.set(pp.x + dir.x * 0.7, pp.y + 1.42, pp.z + dir.z * 0.7);
    flash.visible = true;
    flashT = 0.055;

    let bestT = 130;
    let hitPed = null;
    let hitCar = null;

    for (const ped of game.peds.list) {
      if (ped.state === 'down') continue;
      const p = ped.group.position;
      const t = raySphere(p.x, p.y + 1.15, p.z, 0.62);
      if (t < bestT) { bestT = t; hitPed = ped; hitCar = null; }
    }
    for (const car of game.cars()) {
      const p = car.group.position;
      const t = raySphere(p.x, 0.85, p.z, car.radius + 0.45);
      if (t < bestT) { bestT = t; hitCar = car; hitPed = null; }
    }
    // The ground caps the ray so misses still land somewhere visible.
    let groundT = Infinity;
    if (dir.y < -0.02) groundT = -origin.y / dir.y;
    if (groundT < bestT) { bestT = groundT; hitPed = null; hitCar = null; }

    const hx = origin.x + dir.x * bestT;
    const hy = origin.y + dir.y * bestT;
    const hz = origin.z + dir.z * bestT;

    // Shots panic the street, whoever they hit.
    game.peds.fleeFrom(pp.x, pp.z, 16);

    if (hitPed) {
      game.peds.knockDown(hitPed);
      game.onCrime('shootPed', hx, hz);
    } else if (hitCar) {
      damageCar(hitCar, 22);
      puff(hx, hy, hz, 0.7, false);
      game.onCrime(hitCar.isPolice ? 'shootPolice' : 'shootCar', hx, hz);
    } else if (bestT < 130) {
      puff(hx, Math.max(0.2, hy), hz, 0.55, false);
      game.onCrime('shootMiss', hx, hz);
    }
    return true;
  }

  function update(dt) {
    cooldown = Math.max(0, cooldown - dt);
    if (flashT > 0) {
      flashT -= dt;
      flash.material.opacity = Math.max(0, flashT / 0.055);
      flash.material.rotation = rand(Math.PI * 2);
      if (flashT <= 0) flash.visible = false;
    }
  }

  return { tryShoot, update };
}
