// boats.js — the drivable marina runabout: car-like interface, water physics,
// gentle bobbing, slower wide turns and a foam wake. Lives outside cars[].
import * as THREE from 'three';
import { clamp, collide, WATER_X } from './util.js';

function foamTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(240,250,255,0.85)'); gr.addColorStop(1, 'rgba(240,250,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
let _foamTex = null;

export function createBoat(scene, x, z, heading = -Math.PI / 2) {
  if (!_foamTex) _foamTex = foamTexture();
  const group = new THREE.Group();
  const hullM = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.35, metalness: 0.25 });
  const trimM = new THREE.MeshStandardMaterial({ color: 0xd23b2e, roughness: 0.4 });
  const darkM = new THREE.MeshStandardMaterial({ color: 0x1c2f42, roughness: 0.15, metalness: 0.6 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.85, 7.6), hullM);
  hull.position.y = 0.28; hull.castShadow = true; group.add(hull);
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.85, 3, 1), hullM);
  bow.rotation.y = Math.PI; bow.scale.set(1, 1, 1.9); bow.position.set(0, 0.28, 4.4); bow.castShadow = true; group.add(bow);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.64, 0.22, 7.0), trimM);
  stripe.position.y = 0.52; group.add(stripe);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 4.6), darkM);
  deck.position.set(0, 0.76, -0.7); group.add(deck);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 0.1), darkM);
  shield.position.set(0, 1.12, 1.15); shield.rotation.x = -0.25; group.add(shield);
  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.4), new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.5, metalness: 0.4 }));
  motor.position.set(0, 0.55, -4.05); motor.castShadow = true; group.add(motor);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.5), trimM);
  seat.position.set(0, 0.85, -1.7); group.add(seat);
  group.position.set(x, -0.12, z); group.rotation.y = heading;
  scene.add(group);
  const boat = {
    group, type: 'boat', isBoat: true,
    spec: { maxSpeed: 21, accel: 8.5 },
    speed: 0, heading, health: 100, driver: 'boat',
    radius: 3.4, hitCooldown: 0, dead: false, lightMats: null,
    wake: [], wakeT: 0, bobPhase: Math.random() * 6,
    update(dt, throttle, steer) {
      const s = this.spec;
      if (throttle > 0) this.speed += s.accel * throttle * dt * (1 - Math.max(0, this.speed) / (s.maxSpeed * 1.1));
      else if (throttle < 0) this.speed += (this.speed > 0.5 ? -13 : -5.5) * dt * -throttle;
      else this.speed -= this.speed * 0.55 * dt;
      if (Math.abs(this.speed) < 0.03 && throttle === 0) this.speed = 0;
      this.speed = clamp(this.speed, -6, s.maxSpeed);
      // wide, slow turns — more authority at low speed, rudder feel
      const auth = clamp(Math.abs(this.speed) / 7, 0.12, 1) * 0.5;
      if (this.speed !== 0) this.heading += steer * auth * dt * Math.sign(this.speed);
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const p = this.group.position;
      p.x += fx * this.speed * dt;
      p.z += fz * this.speed * dt;
      collide(p, 2.1, -0.4, 0.4); // pier posts + dock edge push back
      if (p.x < WATER_X - 1.5) { p.x = WATER_X - 1.5; this.speed *= 0.5; } // stay off the sand
      if (p.x > 400) { p.x = 400; this.speed *= 0.5; }
      p.z = clamp(p.z, -322, 322);
      // bob + pitch/roll with speed
      this.bobPhase += dt * 1.7;
      p.y = -0.12 + Math.sin(this.bobPhase) * 0.07 - Math.abs(this.speed) * 0.006;
      this.group.rotation.y = this.heading;
      this.group.rotation.z = Math.sin(this.bobPhase * 0.8) * 0.02 - steer * clamp(Math.abs(this.speed) / s.maxSpeed, 0, 1) * 0.05;
      this.group.rotation.x = clamp(-this.speed * 0.004, -0.06, 0.05) + Math.cos(this.bobPhase * 0.6) * 0.012;
      // foam wake
      if (Math.abs(this.speed) > 3) {
        this.wakeT -= dt;
        if (this.wakeT <= 0) {
          this.wakeT = 0.07;
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: _foamTex, transparent: true, opacity: 0.7, depthWrite: false }));
          sp.position.set(p.x - fx * 4.2, 0.06, p.z - fz * 4.2);
          sp.scale.setScalar(1.6); sp.userData.life = 0;
          this.group.parent.add(sp); this.wake.push(sp);
        }
      }
      for (let i = this.wake.length - 1; i >= 0; i--) {
        const sp = this.wake[i]; sp.userData.life += dt;
        sp.scale.setScalar(1.6 + sp.userData.life * 3.4);
        sp.material.opacity = 0.7 * (1 - sp.userData.life / 1.5);
        if (sp.userData.life > 1.5) { sp.parent.remove(sp); this.wake.splice(i, 1); }
      }
      if (this.hitCooldown > 0) this.hitCooldown -= dt;
    },
  };
  return boat;
}
