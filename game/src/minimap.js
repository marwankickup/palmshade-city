// The minimap: a small north-up canvas in the corner of the HUD, redrawn each frame.
// Roads and the shoreline come from the same layout constants as the 3D city; dots are
// traffic (pale), police (blinking red/blue) and the mission marker (pulsing gold),
// with a white arrow for the player.

import { ROAD_LINES, ROAD_W, CITY_EDGE, SAND_X } from './city.js';

// World rectangle the map covers: a little sea to the west, a little sprawl east.
const MIN_X = -345;
const MAX_X = 292;
const MIN_Z = -278;
const MAX_Z = 278;

export function createMinimap(canvas, game) {
  // game: { playerPos(), playerHeading(), trafficCars, policeCars, markerPos() }
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const sx = W / (MAX_X - MIN_X);
  const sz = H / (MAX_Z - MIN_Z);
  const mx = (x) => (x - MIN_X) * sx;
  const mz = (z) => (z - MIN_Z) * sz;

  function draw(now) {
    // Sea, then land, then the sand strip.
    ctx.fillStyle = '#1d6a8a';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#272d36';
    ctx.fillRect(mx(-CITY_EDGE), 0, (MAX_X + CITY_EDGE) * sx, H);
    ctx.fillStyle = '#d9be82';
    ctx.fillRect(mx(SAND_X), 0, (-CITY_EDGE - SAND_X) * sx, H);

    // Roads.
    ctx.strokeStyle = '#596270';
    ctx.lineWidth = Math.max(2, ROAD_W * sx * 0.8);
    ctx.beginPath();
    for (const line of ROAD_LINES) {
      ctx.moveTo(mx(line), mz(-CITY_EDGE));
      ctx.lineTo(mx(line), mz(CITY_EDGE));
      ctx.moveTo(mx(-CITY_EDGE), mz(line));
      ctx.lineTo(mx(CITY_EDGE), mz(line));
    }
    ctx.stroke();

    // Mission marker: a pulsing gold ring.
    const marker = game.markerPos();
    if (marker) {
      const pulse = 3.5 + Math.sin(now * 0.006) * 1.4;
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.arc(mx(marker.x), mz(marker.z), 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,210,62,0.75)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(mx(marker.x), mz(marker.z), pulse + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Traffic.
    ctx.fillStyle = '#dfe6ea';
    for (const car of game.trafficCars) {
      const p = car.group.position;
      ctx.fillRect(mx(p.x) - 1.4, mz(p.z) - 1.4, 2.8, 2.8);
    }

    // Police, blinking.
    ctx.fillStyle = Math.floor(now / 280) % 2 === 0 ? '#ff4040' : '#4d7cff';
    for (const car of game.policeCars) {
      const p = car.group.position;
      ctx.beginPath();
      ctx.arc(mx(p.x), mz(p.z), 2.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // The player: a white arrow pointing the way they face.
    const pp = game.playerPos();
    const h = game.playerHeading();
    ctx.save();
    ctx.translate(mx(pp.x), mz(pp.z));
    ctx.rotate(Math.atan2(Math.sin(h), -Math.cos(h)));
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.2, 5);
    ctx.lineTo(0, 2.6);
    ctx.lineTo(-4.2, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  return { draw };
}
