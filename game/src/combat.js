// combat.js — hitscan shooting: tracers, muzzle flash, sparks, and hostile gunmen.
import * as THREE from 'three';
import { createFigure } from './player.js';

function glowTexture(inner = 'rgba(255,240,200,1)', outer = 'rgba(255,180,60,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 80;
    this.targets = [];   // {group, kind, ref}
    this.effects = [];   // {obj, life, max, kind, vel?}
    this.hostiles = [];
    this.flashTex = glowTexture();
    this.sparkTex = glowTexture('rgba(255,220,150,1)', 'rgba(255,140,40,0)');
  }
  register(group, kind, ref) {
    group.userData.combatRef = { kind, ref };
    this.targets.push(group);
  }
  unregister(group) {
    const i = this.targets.indexOf(group); if (i >= 0) this.targets.splice(i, 1);
  }
  _tracer(a, b, color = 0xffe9a8) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    this.scene.add(line);
    this.effects.push({ obj: line, life: 0, max: 0.07, kind: 'fade' });
  }
  _flash(pos, scale = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.copy(pos); s.scale.setScalar(0.9 * scale);
    this.scene.add(s);
    this.effects.push({ obj: s, life: 0, max: 0.055, kind: 'fade' });
  }
  _sparks(pos, n = 7) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.position.copy(pos); s.scale.setScalar(0.28);
      this.scene.add(s);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4.5, (Math.random() - 0.5) * 5);
      this.effects.push({ obj: s, life: 0, max: 0.32, kind: 'spark', vel });
    }
  }
  // Player fires from the camera centre. callbacks: {ped, car, hostile, miss}
  // ndc: optional aim offset (SMG spread) in normalized device coords.
  tryShoot(camera, muzzlePos, cb, ndc = null) {
    this.raycaster.setFromCamera(ndc || { x: 0, y: 0 }, camera);
    const hits = this.raycaster.intersectObjects(this.targets, true);
    let end = null, found = null;
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.combatRef) o = o.parent;
      if (o) { found = o.userData.combatRef; end = h.point; break; }
    }
    if (!end) end = this.raycaster.ray.at(70, new THREE.Vector3());
    this._flash(muzzlePos, 1);
    this._tracer(muzzlePos, end);
    if (found) {
      this._sparks(end, found.kind === 'car' ? 9 : 6);
      if (found.kind === 'ped') cb.ped(found.ref, end);
      else if (found.kind === 'car') cb.car(found.ref, end);
      else if (found.kind === 'hostile') cb.hostile(found.ref, end);
    } else cb.miss(end);
    return found;
  }
  spawnHostile(x, z) {
    const fig = createFigure({ shirt: 0x2b2f36, pants: 0x1d2126, skin: 0xa8763e, hat: 0x22262c });
    fig.group.position.set(x, 0, z);
    this.scene.add(fig.group);
    const h = { fig, group: fig.group, health: 100, shootT: 1 + Math.random() * 0.8, strafe: Math.random() < 0.5 ? 1 : -1, walkT: Math.random() * 6, dead: false };
    this.register(fig.group, 'hostile', h);
    this.hostiles.push(h);
    return h;
  }
  damageHostile(h, dmg) {
    h.health -= dmg;
    if (h.health <= 0 && !h.dead) { h.dead = true; this.unregister(h.group); }
  }
  hostilesAlive() { return this.hostiles.filter(h => !h.dead).length; }
  clearHostiles() {
    for (const h of this.hostiles) { this.scene.remove(h.group); this.unregister(h.group); }
    this.hostiles = [];
  }
  update(dt, ctx) {
    // effects
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]; e.life += dt;
      const k = 1 - e.life / e.max;
      if (e.obj.material) e.obj.material.opacity = Math.max(0, k) * (e.kind === 'fade' ? 0.95 : 1);
      if (e.kind === 'spark') {
        e.vel.y -= 12 * dt;
        e.obj.position.addScaledVector(e.vel, dt);
      }
      if (e.life >= e.max) { this.scene.remove(e.obj); this.effects.splice(i, 1); }
    }
    if (!ctx) return;
    const { playerPos, onPlayerShot } = ctx;
    for (const h of this.hostiles) {
      const q = h.group.position;
      if (h.dead) { h.fig.group.rotation.x = Math.min(Math.PI / 2, h.fig.group.rotation.x + dt * 6); continue; }
      const dx = playerPos.x - q.x, dz = playerPos.z - q.z;
      const d = Math.hypot(dx, dz) || 1;
      // keep 10-17 units, strafe sideways
      let mx = 0, mz = 0;
      if (d > 17) { mx = dx / d; mz = dz / d; }
      else if (d < 9) { mx = -dx / d; mz = -dz / d; }
      mx += (-dz / d) * h.strafe * 0.55; mz += (dx / d) * h.strafe * 0.55;
      const ml = Math.hypot(mx, mz) || 1;
      q.x += mx / ml * 2.6 * dt; q.z += mz / ml * 2.6 * dt;
      h.fig.group.rotation.y = Math.atan2(dx, dz);
      h.walkT += dt * 6;
      const sw = Math.sin(h.walkT) * 0.5;
      h.fig.legL.rotation.x = sw; h.fig.legR.rotation.x = -sw;
      if (Math.random() < dt * 0.14) h.strafe *= -1;
      // shooting
      h.shootT -= dt;
      if (h.shootT <= 0 && d < 32) {
        h.shootT = 1.3 + Math.random() * 0.7;
        const from = new THREE.Vector3(q.x, 1.45, q.z);
        const to = new THREE.Vector3(playerPos.x + (Math.random() - 0.5) * 1.6, 1.2, playerPos.z + (Math.random() - 0.5) * 1.6);
        this._flash(from, 0.8);
        this._tracer(from, to, 0xff9a7a);
        if (Math.random() < 0.5) { this._sparks(to, 3); onPlayerShot(4 + Math.random() * 3); }
      }
    }
  }
}
