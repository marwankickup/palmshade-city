// police.js — Palmshade PD: pursuit units with callsigns + roles, BFS road routing,
// surround slots, roadblocks at high wanted, and the AIR-1 helicopter with spotlight.
import * as THREE from 'three';
import { roadPath, snapToRoad, nearestIntersection, wrapAngle, clamp, dist2d } from './util.js';
import { createCar, removeCar, flashLights } from './vehicles.js';
import { driveToward } from './traffic.js';

const PREFIXES = ['PALM', 'MARLIN', 'GULL', 'CORAL', 'DUNE', 'PIER', 'BAY', 'WAVE'];
export class Police {
  constructor(scene) {
    this.scene = scene;
    this.units = [];       // {car, callsign, role, path, wi, repathT, mode, stuckT, lastX, lastZ, shootT, blockT}
    this.seq = 0;
    this.blockTimer = 14;
    this.heli = null; this.heliAngle = 0; this.heliForced = false; this.heliActive = false;
    this.time = 0;
  }
  _callsign() {
    this.seq++;
    return PREFIXES[this.seq % PREFIXES.length] + '-' + (2 + (this.seq * 5) % 17);
  }
  _spawnPos(playerPos) {
    let best = null, bestScore = -Infinity, fallback = null, fbDist = -1;
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 58 + Math.random() * 36;
      const cand = snapToRoad(playerPos.x + Math.cos(a) * r, playerPos.z + Math.sin(a) * r);
      const d = dist2d(cand.x, cand.z, playerPos.x, playerPos.z);
      if (d > fbDist) { fbDist = d; fallback = cand; }
      if (d < 55 || d > 96) continue;
      const route = Math.abs(cand.x - playerPos.x) + Math.abs(cand.z - playerPos.z);
      const score = -route + Math.random() * 8;
      if (score > bestScore) { bestScore = score; best = cand; }
    }
    return best || fallback || { x: playerPos.x + 70, z: playerPos.z };
  }
  spawnUnit(playerPos, mode = 'pursuit') {
    const s = this._spawnPos(playerPos);
    const ni = nearestIntersection(s.x, s.z);
    const heading = Math.abs(ni.x - s.x) < Math.abs(ni.z - s.z) ? (Math.random() < 0.5 ? 0 : Math.PI) : (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const car = createCar(this.scene, 'police', s.x, s.z, heading);
    car.driver = 'police';
    const u = {
      car, callsign: this._callsign(), role: 'PURSUIT', mode,
      path: null, wi: 0, repathT: Math.random(), stuckT: 0,
      lastX: s.x, lastZ: s.z, shootT: 1 + Math.random(), blockT: 0,
    };
    this.units.push(u);
    return u;
  }
  spawnRoadblock(playerPos, playerHeading) {
    const fx = Math.sin(playerHeading), fz = Math.cos(playerHeading);
    const ahead = snapToRoad(playerPos.x + fx * 54, playerPos.z + fz * 54);
    const rx = fz, rz = -fx; // right vector
    for (const off of [-2.6, 2.6]) {
      const u = this.spawnUnit(playerPos, 'block');
      const x = ahead.x + rx * off, z = ahead.z + rz * off;
      u.car.group.position.set(x, 0, z);
      u.car.heading = playerHeading + Math.PI / 2 + (off > 0 ? 0.5 : -0.5);
      u.car.group.rotation.y = u.car.heading;
      u.car.speed = 0; u.role = 'ROADBLOCK'; u.blockT = 30;
    }
  }
  ensure(wanted, playerPos) {
    const want = wanted <= 0 ? 0 : Math.min(2 + wanted, 6);
    const pursuit = this.units.filter(u => u.mode === 'pursuit');
    while (pursuit.length < want) pursuit.push(this.spawnUnit(playerPos));
    while (pursuit.length > want) {
      const u = pursuit.pop();
      removeCar(this.scene, u.car);
      this.units.splice(this.units.indexOf(u), 1);
    }
  }
  clearAll() {
    for (const u of this.units) removeCar(this.scene, u.car);
    this.units = [];
    this.heliActive = false;
    if (this.heli) this.heli.group.visible = false;
  }
  nearestDist(playerPos) {
    let d = Infinity;
    for (const u of this.units) d = Math.min(d, dist2d(u.car.group.position.x, u.car.group.position.z, playerPos.x, playerPos.z));
    return d;
  }
  countNear(playerPos, r) {
    let n = 0;
    for (const u of this.units) if (dist2d(u.car.group.position.x, u.car.group.position.z, playerPos.x, playerPos.z) < r) n++;
    return n;
  }
  panelList(playerPos) {
    const out = [];
    for (const u of this.units) {
      out.push({ callsign: u.callsign, role: u.role, dist: dist2d(u.car.group.position.x, u.car.group.position.z, playerPos.x, playerPos.z) });
    }
    if (this.heliActive && this.heli) {
      out.push({ callsign: 'AIR-1', role: 'AIR UNIT', dist: dist2d(this.heli.group.position.x, this.heli.group.position.z, playerPos.x, playerPos.z) });
    }
    out.sort((a, b) => a.dist - b.dist);
    return out.slice(0, 5);
  }
  _buildHeli() {
    const g = new THREE.Group();
    const bodyM = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.4, metalness: 0.5 });
    const glassM = new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.1, metalness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.9, 4.6), bodyM); body.castShadow = true; g.add(body);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.3, 1.4), glassM); nose.position.set(0, -0.1, 2.6); g.add(nose);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 4.4), bodyM); tail.position.set(0, 0.25, -4.2); g.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 0.8), bodyM); fin.position.set(0, 0.7, -6.2); g.add(fin);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.4, 4.64), new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.4 }));
    stripe.position.y = -0.5; g.add(stripe);
    for (const sx of [-1, 1]) {
      const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.6, 6), bodyM);
      skid.rotation.x = Math.PI / 2; skid.position.set(sx * 1.05, -1.35, 0); g.add(skid);
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), bodyM);
      strut.position.set(sx * 1.0, -1.05, 0.9); g.add(strut);
      const strut2 = strut.clone(); strut2.position.z = -0.9; g.add(strut2);
    }
    const rotor = new THREE.Group(); rotor.position.y = 1.25;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.06, 0.55), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
    const blade2 = blade.clone(); blade2.rotation.y = Math.PI / 2;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(5.3, 24),
      new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    rotor.add(blade); rotor.add(blade2); rotor.add(disc); g.add(rotor);
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5, 0.3), bodyM);
    tailRotor.position.set(0.3, 0.7, -6.2); g.add(tailRotor);
    // spotlight: real light + visible cone + ground glow
    const spot = new THREE.SpotLight(0xfff0c0, 900, 110, 0.3, 0.65, 1.2);
    g.add(spot); g.add(spot.target);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(6.5, 30, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffeeb8, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    cone.position.y = -15.5; g.add(cone);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(6.2, 20),
      new THREE.MeshBasicMaterial({ color: 0xffeeb8, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2;
    this.scene.add(glow);
    g.visible = false;
    this.scene.add(g);
    this.heli = { group: g, rotor, tailRotor, spot, cone, glow };
  }
  setHeliForced(f, playerPos) {
    this.heliForced = f;
    if (f && playerPos) this._updateHeli(0.016, playerPos, true);
  }
  _updateHeli(dt, playerPos, snap = false) {
    if (!this.heli) this._buildHeli();
    const h = this.heli;
    h.group.visible = true; this.heliActive = true;
    this.heliAngle += dt * 0.32;
    const r = 15;
    const hx = playerPos.x + Math.cos(this.heliAngle) * r;
    const hz = playerPos.z + Math.sin(this.heliAngle) * r;
    if (snap) h.group.position.set(hx, 27, hz);
    else {
      h.group.position.x += (hx - h.group.position.x) * Math.min(1, dt * 1.6);
      h.group.position.z += (hz - h.group.position.z) * Math.min(1, dt * 1.6);
      h.group.position.y += (27 - h.group.position.y) * Math.min(1, dt * 1.6);
    }
    h.group.lookAt(playerPos.x, 0, playerPos.z);
    h.rotor.rotation.y += dt * 28;
    h.tailRotor.rotation.x += dt * 32;
    h.spot.target.position.set(playerPos.x - h.group.position.x, -27, playerPos.z - h.group.position.z);
    h.glow.position.set(playerPos.x, 0.15, playerPos.z);
  }
  update(dt, ctx) {
    this.time += dt;
    const { playerPos, playerHeading, playerSpeed, inCar, wanted, onShoot } = ctx;
    // roadblocks
    if (wanted >= 4 && inCar && playerSpeed > 9) {
      this.blockTimer -= dt;
      if (this.blockTimer <= 0) { this.blockTimer = 19 + Math.random() * 9; this.spawnRoadblock(playerPos, playerHeading); }
    } else this.blockTimer = Math.max(this.blockTimer, 6);
    const pursuitIdx = { n: 0 };
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i], car = u.car, p = car.group.position;
      if (car.driver === 'player') { this.units.splice(i, 1); continue; } // player stole this unit
      flashLights(car, this.time + i);
      if (u.mode === 'block') {
        u.role = 'ROADBLOCK';
        u.blockT -= dt;
        car.update(dt, 0, 0);
        if (u.blockT <= 0 || dist2d(p.x, p.z, playerPos.x, playerPos.z) > 110) {
          removeCar(this.scene, car); this.units.splice(i, 1);
        }
        continue;
      }
      const d = dist2d(p.x, p.z, playerPos.x, playerPos.z);
      // role for the response panel
      u.role = (d < 13 && car.speed > Math.abs(playerSpeed) + 2) ? 'RAMMING' : 'PURSUIT';
      // stuck detection → respawn near the player (a unit holding its surround
      // slot next to the player is doing its job, not stuck)
      if (d > 11 && Math.hypot(p.x - u.lastX, p.z - u.lastZ) < 0.4 && car.speed < 1.2) u.stuckT += dt; else u.stuckT = 0;
      u.lastX = p.x; u.lastZ = p.z;
      if (u.stuckT > 3.5) {
        const s = this._spawnPos(playerPos);
        p.set(s.x, 0, s.z); car.speed = 0; u.path = null; u.stuckT = 0;
      }
      if (d > 27) {
        // route mode: BFS road path toward the player
        u.repathT -= dt;
        const pi = nearestIntersection(playerPos.x, playerPos.z);
        if (!u.path || u.wi >= u.path.length || (u._pi && (u._pi.i !== pi.i || u._pi.j !== pi.j))) {
          const np = roadPath({ x: p.x, z: p.z }, { x: playerPos.x, z: playerPos.z });
          // resume at the waypoint nearest the car — resetting to index 0 would
          // send the unit back to its own intersection and stall the pursuit
          let bestI = 0, bd = Infinity;
          np.forEach((w, idx) => { const dd = dist2d(w.x, w.z, p.x, p.z); if (dd < bd) { bd = dd; bestI = idx; } });
          u.path = np; u.wi = bestI; u.repathT = 1.4; u._pi = pi;
        }
        const wp = u.path[Math.min(u.wi, u.path.length - 1)];
        const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
        const reached = driveToward(car, wp.x + fz * 2.5, wp.z - fx * 2.5, dt, 1);
        if (reached < 5) u.wi++;
      } else {
        // chase mode: surround slots around the player
        const idx = pursuitIdx.n++;
        const ang = idx * (Math.PI * 2 / Math.max(3, this.units.length));
        const sx = playerPos.x + Math.cos(ang) * 7.6, sz = playerPos.z + Math.sin(ang) * 7.6;
        const dd = driveToward(car, sx, sz, dt, d > 15 ? 1 : 0.55);
        if (dd < 2.2) car.update(dt, -0.4, 0); // settle onto the slot
      }
      // police gunfire at high wanted
      if (wanted >= 4 && d < 34 && onShoot) {
        u.shootT -= dt;
        if (u.shootT <= 0) { u.shootT = 1.05 + Math.random() * 0.5; onShoot(u); }
      }
    }
    // helicopter
    if (wanted >= 4 || this.heliForced) this._updateHeli(dt, playerPos);
    else if (this.heli) { this.heli.group.visible = false; this.heli.glow.visible = false; this.heliActive = false; }
    if (this.heliActive && this.heli) this.heli.glow.visible = true;
  }
}
