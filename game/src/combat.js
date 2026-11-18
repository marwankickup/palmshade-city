// combat.js — on-foot shooting: click to fire a hitscan shot from the
// camera through the crosshair. Tracers, muzzle flash, hit reactions:
// peds fall, cars spark and dent, Palmshade PD takes it personally.
import * as THREE from 'three';

export class Combat {
  constructor(scene, events) {
    this.scene = scene;
    this.events = events; // {onShoot(), onHitPed(ped), onHitPolice(), onHitCar(car)}
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 90;
    this.tracers = [];
    this.flashT = 0;
    this.cooldown = 0;
    // muzzle flash: a small additive sprite shown for a frame or two
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,240,180,1)');
    grad.addColorStop(0.4, 'rgba(255,160,60,0.8)');
    grad.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    this.flash.scale.set(0.9, 0.9, 1);
    this.flash.visible = false;
    scene.add(this.flash);
  }
  // targets: {peds: Peds, cars: [Car], policeCars: [Car]}
  shoot(camera, playerPos, targets) {
    if (this.cooldown > 0) return false;
    this.cooldown = 0.16;
    this.events.onShoot();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const origin = camera.position.clone();
    // muzzle flash at the player's hand
    const hand = new THREE.Vector3(playerPos.x, 1.45, playerPos.z).add(dir.clone().multiplyScalar(0.7));
    this.flash.position.copy(hand);
    this.flash.visible = true;
    this.flashT = 0.05;
    // gather hit candidates as simple spheres along the ray
    let best = null;
    const testSphere = (x, y, z, r, kind, ref) => {
      const toC = new THREE.Vector3(x - origin.x, y - origin.y, z - origin.z);
      const t = toC.dot(dir);
      if (t < 0 || t > 90) return;
      const closest = origin.clone().add(dir.clone().multiplyScalar(t));
      const d = Math.hypot(closest.x - x, closest.y - y, closest.z - z);
      if (d < r && (!best || t < best.t)) best = { t, kind, ref, point: closest };
    };
    for (const p of targets.peds.list) {
      if (p.state === 'down') continue;
      testSphere(p.pos.x, 1.1, p.pos.z, 0.75, 'ped', p);
    }
    for (const car of targets.cars) testSphere(car.pos.x, 0.9, car.pos.z, 2.1, 'car', car);
    for (const car of targets.policeCars) testSphere(car.pos.x, 0.9, car.pos.z, 2.1, 'police', car);
    const end = best ? best.point : origin.clone().add(dir.clone().multiplyScalar(60));
    this.addTracer(hand, end);
    if (best) {
      if (best.kind === 'ped') this.events.onHitPed(best.ref);
      else if (best.kind === 'police') { best.ref.damage(9); this.events.onHitPolice(); }
      else { best.ref.damage(7); this.events.onHitCar(best.ref); }
    }
    return true;
  }
  addTracer(a, b) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a3, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.07 });
  }
  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      tr.line.material.opacity = Math.max(0, tr.life / 0.07) * 0.9;
      if (tr.life <= 0) { this.scene.remove(tr.line); tr.line.geometry.dispose(); this.tracers.splice(i, 1); }
    }
  }
}
