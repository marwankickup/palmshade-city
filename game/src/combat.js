// combat.js — on-foot shooting: hitscan rays from the camera centre with a
// tracer, muzzle flash and impact sparks. Witnessed gunfire raises wanted.

import * as THREE from 'three';

export class Combat {
  constructor(scene, G) {
    this.scene = scene;
    this.G = G;
    this.ray = new THREE.Raycaster();
    this.tracers = []; // { mesh, life }
    this.sparks = [];  // { points, vel, life }
    this.flashT = 0;
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    scene.add(this.flash);
  }

  spawnTracer(from, to, color = 0xffe08a) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.5) return;
    const geo = new THREE.BoxGeometry(0.035, 0.035, len);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(from).addScaledVector(dir, 0.5);
    m.lookAt(to);
    this.scene.add(m);
    this.tracers.push({ mesh: m, life: 0.09 });
  }

  spawnSparks(at, n = 7) {
    const pos = new Float32Array(n * 3);
    const vel = [];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = at.x; pos[i * 3 + 1] = at.y; pos[i * 3 + 2] = at.z;
      vel.push(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.6, (Math.random() - 0.5) * 3));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffc46b, size: 0.14, transparent: true, opacity: 1, depthWrite: false,
    }));
    this.scene.add(pts);
    this.sparks.push({ points: pts, vel, life: 0.4 });
  }

  shoot() {
    const G = this.G;
    if (G.player.inVehicle || G.player.dead) return;
    const cam = G.camera;
    this.ray.setFromCamera({ x: 0, y: 0 }, cam);
    this.ray.far = 70;
    const targets = [];
    for (const p of G.peds.list) if (p.state !== 'down') targets.push(p.group);
    for (const u of G.police.units) targets.push(u.car.group);
    for (const c of G.traffic.cars) targets.push(c.group);
    const hits = this.ray.intersectObjects(targets, true);
    const origin = G.player.pos.clone(); origin.y += 1.45;
    const f = { x: Math.sin(G.player.heading), z: Math.cos(G.player.heading) };
    const muzzle = origin.clone(); muzzle.x += f.x * 0.5; muzzle.z += f.z * 0.5;
    let end;
    if (hits.length) {
      end = hits[0].point;
      const obj = hits[0].object;
      // walk up to find the owning group
      let root = obj;
      while (root.parent && root.parent !== this.scene) root = root.parent;
      const ped = G.peds.list.find(p => p.group === root);
      if (ped) {
        ped.state = 'down'; ped.timer = 6;
        ped.group.rotation.x = -Math.PI / 2; ped.group.position.y = 0.25;
        G.reportCrime('hitPed', ped.pos.x, ped.pos.z);
      } else {
        const car = [...G.traffic.cars, ...G.police.units.map(u => u.car)].find(c => c.group === root);
        if (car) { car.damage(9); if (car.type !== 'police') G.reportCrime('hitCar', car.x, car.z); }
      }
    } else {
      end = this.ray.ray.at(55, new THREE.Vector3());
    }
    this.spawnTracer(muzzle, end);
    this.spawnSparks(end, hits.length ? 8 : 3);
    this.flash.position.copy(muzzle);
    this.flash.lookAt(cam.position);
    this.flash.material.opacity = 0.95;
    this.flashT = 0.05;
    G.audio.shot();
    G.peds.scare(G.player.x, G.player.z, 15);
    G.reportCrime('gunfire', G.player.x, G.player.z);
    G.player.parts.rArm.rotation.x = -1.2; // recoil kick
  }

  // A police unit fires at the player (called by police.js at wanted >= 4).
  policeShot(unitCar) {
    const G = this.G;
    const from = unitCar.pos.clone(); from.y += 1.1;
    const target = (G.player.inVehicle ? G.player.inVehicle.pos : G.player.pos).clone();
    target.y += 1.1;
    target.x += (Math.random() - 0.5) * 1.6;
    target.z += (Math.random() - 0.5) * 1.6;
    this.spawnTracer(from, target, 0xff6b5e);
    if (Math.random() < 0.55) G.damagePlayer(3 + Math.random() * 4);
    G.audio.shot();
  }

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.09);
      if (t.life <= 0) { this.scene.remove(t.mesh); t.mesh.geometry.dispose(); this.tracers.splice(i, 1); }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      const arr = s.points.geometry.attributes.position.array;
      for (let j = 0; j < s.vel.length; j++) {
        s.vel[j].y -= 6 * dt;
        arr[j * 3] += s.vel[j].x * dt;
        arr[j * 3 + 1] += s.vel[j].y * dt;
        arr[j * 3 + 2] += s.vel[j].z * dt;
      }
      s.points.geometry.attributes.position.needsUpdate = true;
      s.points.material.opacity = Math.max(0, s.life / 0.4);
      if (s.life <= 0) { this.scene.remove(s.points); this.sparks.splice(i, 1); }
    }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.material.opacity = 0; }
  }
}
