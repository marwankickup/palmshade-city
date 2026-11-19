// minimap.js — the live canvas minimap: water, sand, the road grid, traffic,
// police, mission and package blips around the player.
import { ROAD_XS, ROAD_ZS } from './util.js';

export function drawMinimap(ctx, game) {
  const S = 176, C = S / 2, VIEW = 135; // metres visible across
  const scale = S / (VIEW * 2);
  const pp = game.playerPos();
  const X = (wx) => C + (wx - pp.x) * scale;
  const Y = (wz) => C + (wz - pp.z) * scale;

  ctx.fillStyle = '#49663f';
  ctx.fillRect(0, 0, S, S);
  // sand + water (east)
  ctx.fillStyle = '#d9b87e';
  ctx.fillRect(X(146), 0, Math.max(0, S - X(146)), S);
  ctx.fillStyle = '#2e6d8a';
  ctx.fillRect(X(176), 0, Math.max(0, S - X(176)), S);
  // roads
  ctx.strokeStyle = '#3c3a38';
  ctx.lineWidth = Math.max(2, 16 * scale);
  ctx.beginPath();
  for (const rx of ROAD_XS) { ctx.moveTo(X(rx), Y(-264)); ctx.lineTo(X(rx), Y(264)); }
  for (const rz of ROAD_ZS) { ctx.moveTo(X(-264), Y(rz)); ctx.lineTo(X(132), Y(rz)); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const rx of ROAD_XS) { ctx.moveTo(X(rx), Y(-264)); ctx.lineTo(X(rx), Y(264)); }
  for (const rz of ROAD_ZS) { ctx.moveTo(X(-264), Y(rz)); ctx.lineTo(X(132), Y(rz)); }
  ctx.stroke();

  const dot = (x, z, r, color) => {
    const mx = X(x), my = Y(z);
    if (mx < -6 || my < -6 || mx > S + 6 || my > S + 6) return;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(mx, my, r, 0, 7); ctx.fill();
  };
  // packages (nearby only)
  if (game.collectibles) {
    for (const sp of game.collectibles.markerPositions()) {
      if (Math.abs(sp.x - pp.x) < 60 && Math.abs(sp.z - pp.z) < 60) dot(sp.x, sp.z, 2.4, '#ffb84d');
    }
  }
  // cars
  for (const car of game.cars) {
    if (car.driver === 'traffic') dot(car.pos.x, car.pos.z, 2, '#e8e8e8');
    else if (car.driver === 'police') dot(car.pos.x, car.pos.z, 3, Math.floor(game.time * 2.6) % 2 ? '#ff4444' : '#4488ff');
  }
  // mission marker
  const mk = game.missions && game.missions.markerPos;
  if (mk) {
    const mx = X(mk.x), my = Y(mk.z);
    ctx.fillStyle = '#ffd23e';
    ctx.save();
    ctx.translate(Math.max(8, Math.min(S - 8, mx)), Math.max(8, Math.min(S - 8, my)));
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-4.5, -4.5, 9, 9);
    ctx.restore();
  }
  // player arrow
  const h = game.playerHeading();
  ctx.save();
  ctx.translate(C, C);
  ctx.rotate(Math.PI - h);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#222';
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(4.6, 5); ctx.lineTo(0, 2.4); ctx.lineTo(-4.6, 5);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
