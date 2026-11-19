// vehicles.js — car factory (6 silhouettes) + arcade driving physics.

import * as THREE from 'three';
import { mergeGeoms } from './city.js';
import { rand, choice, clamp } from './util.js';

export const CAR_COLORS = [0xe84f3d, 0xf2a03c, 0xf5d13d, 0x3fa7d6, 0x59c785, 0xe77fb0, 0xf0ead8, 0x8e6cc9, 0x2ec4b6, 0xff7f51];

const TYPES = {
  sedan:       { L: 4.4, W: 1.9, H: 0.62, cabin: [1.9, 0.5, -0.2], maxSpeed: 27, accel: 13 },
  sport:       { L: 4.2, W: 1.85, H: 0.5, cabin: [1.6, 0.42, -0.5], maxSpeed: 34, accel: 17 },
  convertible: { L: 4.3, W: 1.9, H: 0.52, cabin: null, maxSpeed: 30, accel: 15 },
  pickup:      { L: 4.7, W: 2.0, H: 0.66, cabin: [1.5, 0.62, 0.9], maxSpeed: 25, accel: 12 },
  van:         { L: 4.9, W: 2.0, H: 1.5, cabin: null, maxSpeed: 23, accel: 11 },
  police:      { L: 4.5, W: 1.95, H: 0.6, cabin: [2.0, 0.52, -0.2], maxSpeed: 32, accel: 16 },
};

const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2836 });
const tireMat = new THREE.MeshLambertMaterial({ color: 0x17181a });
const trimMat = new THREE.MeshLambertMaterial({ color: 0xd8dce0 });
const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffedb5, emissiveIntensity: 1.6 });
const tailMat = new THREE.MeshLambertMaterial({ color: 0x881111, emissive: 0xdd2222, emissiveIntensity: 1.2 });

function buildCarMeshes(type, color) {
  const t = TYPES[type];
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = [], dark = [], trim = [], heads = [], tails = [];

  if (type === 'van') {
    body.push(new THREE.BoxGeometry(t.W, t.H, t.L).translate(0, 0.35 + t.H / 2, 0));
    dark.push(new THREE.BoxGeometry(t.W * 0.92, 0.55, 0.1).translate(0, 1.45, t.L / 2 + 0.01)); // windshield
    dark.push(new THREE.BoxGeometry(t.W + 0.06, 0.3, t.L * 0.9).translate(0, 0.42, 0));       // skirt
  } else {
    body.push(new THREE.BoxGeometry(t.W, t.H, t.L).translate(0, 0.32 + t.H / 2, 0));
    if (type === 'pickup') {
      // open bed walls behind the cabin
      body.push(new THREE.BoxGeometry(t.W, 0.5, 0.12).translate(0, 1.05, -t.L / 2 + 0.06));
      body.push(new THREE.BoxGeometry(0.12, 0.5, 1.7).translate(-t.W / 2 + 0.06, 1.05, -1.15));
      body.push(new THREE.BoxGeometry(0.12, 0.5, 1.7).translate(t.W / 2 - 0.06, 1.05, -1.15));
    }
    if (t.cabin) {
      const [cl, ch, cz] = t.cabin;
      body.push(new THREE.BoxGeometry(t.W * 0.86, ch, cl).translate(0, 0.32 + t.H + ch / 2 - 0.04, cz));
      dark.push(new THREE.BoxGeometry(t.W * 0.88, ch * 0.52, cl * 0.94).translate(0, 0.32 + t.H + ch * 0.42, cz));
    } else if (type === 'convertible') {
      // low windshield + open cockpit rim
      dark.push(new THREE.BoxGeometry(t.W * 0.86, 0.34, 0.08).translate(0, 1.0, 0.75));
      body.push(new THREE.BoxGeometry(t.W * 0.88, 0.2, 1.7).translate(0, 0.9, -0.45));
    }
    if (type === 'police') {
      dark.push(new THREE.BoxGeometry(t.W + 0.04, 0.34, 1.1).translate(0, 0.62, 0.9));  // black hood band
      dark.push(new THREE.BoxGeometry(t.W + 0.04, 0.34, 0.9).translate(0, 0.62, -1.15)); // black trunk band
    }
  }
  // wheels + hubcaps
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.28, 8);
  hubGeo.rotateZ(Math.PI / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    dark.push(wheelGeo.clone().translate(sx * (t.W / 2 - 0.05), 0.36, sz * t.L * 0.31));
    trim.push(hubGeo.clone().translate(sx * (t.W / 2 - 0.05), 0.36, sz * t.L * 0.31));
  }
  // bumpers
  trim.push(new THREE.BoxGeometry(t.W * 0.98, 0.18, 0.22).translate(0, 0.42, t.L / 2 + 0.05));
  trim.push(new THREE.BoxGeometry(t.W * 0.98, 0.18, 0.22).translate(0, 0.42, -t.L / 2 - 0.05));
  // lights
  heads.push(new THREE.BoxGeometry(0.34, 0.14, 0.06).translate(-t.W * 0.32, 0.68, t.L / 2 + 0.03));
  heads.push(new THREE.BoxGeometry(0.34, 0.14, 0.06).translate(t.W * 0.32, 0.68, t.L / 2 + 0.03));
  tails.push(new THREE.BoxGeometry(0.34, 0.13, 0.06).translate(-t.W * 0.32, 0.72, -t.L / 2 - 0.03));
  tails.push(new THREE.BoxGeometry(0.34, 0.13, 0.06).translate(t.W * 0.32, 0.72, -t.L / 2 - 0.03));

  const add = (geoms, mat) => {
    if (!geoms.length) return null;
    const m = new THREE.Mesh(mergeGeoms(geoms), mat);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  add(body, bodyMat);
  add(dark, tireMat === glassMat ? glassMat : new THREE.MeshLambertMaterial({ color: 0x1c2836 }));
  add(trim, trimMat);
  add(heads, headMat);
  add(tails, tailMat);

  let lightbar = null;
  if (type === 'police') {
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x222222 }));
    barBase.position.set(0, 1.52, -0.2);
    g.add(barBase);
    const redMat = new THREE.MeshLambertMaterial({ color: 0x550000, emissive: 0xff2222, emissiveIntensity: 0.4 });
    const blueMat = new THREE.MeshLambertMaterial({ color: 0x000055, emissive: 0x2266ff, emissiveIntensity: 2.2 });
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.34), redMat);
    red.position.set(-0.33, 1.64, -0.2);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.34), blueMat);
    blue.position.set(0.33, 1.64, -0.2);
    g.add(red); g.add(blue);
    lightbar = { redMat, blueMat };
  }
  return { group: g, lightbar };
}

let carId = 0;
export class Car {
  constructor(scene, type, color, x, z, heading) {
    this.id = carId++;
    this.type = type;
    this.spec = TYPES[type];
    this.isPolice = type === 'police';
    const { group, lightbar } = buildCarMeshes(type, color);
    this.group = group;
    this.lightbar = lightbar;
    this.heading = heading || 0;
    this.speed = 0;
    this.hp = 100;
    this.radius = 1.55;
    this.parked = false;
    this.driver = null;      // null | 'player' | 'traffic' | 'police' | 'mission'
    this.dead = false;
    group.position.set(x, 0, z);
    group.rotation.y = this.heading;
    scene.add(group);
  }
  get pos() { return this.group.position; }
  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }
  syncMesh() { this.group.rotation.y = this.heading; }
  // Arcade drive: throttle -1..1, steer -1..1. Returns distance moved.
  drive(dt, throttle, steer) {
    const s = this.spec;
    if (throttle > 0) this.speed += s.accel * throttle * dt;
    else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= 26 * dt;               // brake
      else this.speed += s.accel * 0.55 * throttle * dt;          // reverse
    }
    // drag + rolling resistance
    this.speed -= this.speed * 0.55 * dt;
    if (throttle === 0) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 3.2 * dt);
    this.speed = clamp(this.speed, -9, s.maxSpeed);
    const spd = Math.abs(this.speed);
    if (spd > 0.05) {
      const grip = clamp(spd / 6, 0.25, 1);
      const turn = steer * 1.65 * grip * dt * (this.speed >= 0 ? 1 : -1) * clamp(spd / 10, 0.3, 1);
      this.heading += turn;
    }
    const f = this.forward();
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    this.syncMesh();
    return this.speed * dt;
  }
  flashLightbar(t) {
    if (!this.lightbar) return;
    const phase = Math.floor(t * 4) % 2;
    this.lightbar.redMat.emissiveIntensity = phase === 0 ? 2.6 : 0.25;
    this.lightbar.blueMat.emissiveIntensity = phase === 0 ? 0.25 : 2.6;
  }
}

export function randomCarType() {
  return choice(['sedan', 'sedan', 'sport', 'convertible', 'pickup', 'van']);
}

// Parked cars: on parking-lot spots from the city + along street edges.
export function spawnParkedCars(scene, city) {
  const cars = [];
  for (const spot of city.parkingSpots) {
    const car = new Car(scene, randomCarType(), choice(CAR_COLORS), spot.x, spot.z, spot.heading + rand(-0.05, 0.05));
    car.parked = true;
    cars.push(car);
  }
  // street parking along the beachfront avenue and downtown streets
  const streetSpots = [];
  for (let z = -190; z <= 190; z += 17) streetSpots.push({ x: 163.4, z, heading: 0 });
  for (let z = -180; z <= 180; z += 21) streetSpots.push({ x: -76.6, z, heading: Math.PI });
  for (let x = -210; x <= 150; x += 23) streetSpots.push({ x, z: -76.6, heading: Math.PI / 2 });
  for (const s of streetSpots) {
    if (Math.random() < 0.45) continue;
    const car = new Car(scene, randomCarType(), choice(CAR_COLORS), s.x + rand(-0.4, 0.4), s.z + rand(-0.4, 0.4), s.heading);
    car.parked = true;
    cars.push(car);
  }
  // two café vans (mission vehicles respawn here)
  const van = new Car(scene, 'van', 0xf2a03c, 148, -52, Math.PI / 2);
  van.parked = true; van.missionTag = 'cafeVan';
  cars.push(van);
  return cars;
}
