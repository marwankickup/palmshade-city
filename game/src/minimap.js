// minimap.js — the HUD minimap: road grid, beach, and live blips for
// the player, traffic, police and the current mission marker.
import { ROADS, HALF, BEACH_X, OCEAN_X } from './city.js';

const EXT = HALF + 46; // world half-extent shown

export function drawMinimap(canvas, ctx2d, view) {
  // view: {player:{x,z,heading}, traffic:[{x,z}], police:[{x,z}], marker:{x,z}|null, t}
  const S = canvas.width;
  const g = ctx2d;
  const px = (x) => ((x + EXT) / (EXT * 2)) * S;
  const pz = (z) => ((z + EXT) / (EXT * 2)) * S;
  // water + land
  g.fillStyle = '#17394d'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#2c4a3a';
  g.fillRect(px(-HALF - 8), pz(-HALF - 8), px(HALF + 8) - px(-HALF - 8), pz(HALF + 8) - pz(-HALF - 8));
  g.fillStyle = '#e8d194';
  g.fillRect(px(BEACH_X), 0, px(OCEAN_X) - px(BEACH_X), S);
  g.fillStyle = '#1f9db4';
  g.fillRect(px(OCEAN_X), 0, S - px(OCEAN_X), S);
  // blocks (centres at -108 + 54i)
  g.fillStyle = '#3d5c46';
  const blockPx = (40 / (EXT * 2)) * S;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    g.fillRect(px(-108 + i * 54) - blockPx / 2, pz(-108 + j * 54) - blockPx / 2, blockPx, blockPx);
  }
  // roads
  g.strokeStyle = '#9aa3ad';
  g.lineWidth = Math.max(1.4, S * 0.008);
  for (const r of ROADS) {
    g.beginPath(); g.moveTo(px(r), pz(-HALF)); g.lineTo(px(r), pz(HALF)); g.stroke();
    g.beginPath(); g.moveTo(px(-HALF), pz(r)); g.lineTo(px(HALF), pz(r)); g.stroke();
  }
  const dot = (x, z, color, r) => { g.fillStyle = color; g.beginPath(); g.arc(px(x), pz(z), r, 0, Math.PI * 2); g.fill(); };
  for (const c of view.traffic) dot(c.x, c.z, '#e8e8e8', 1.6);
  const blink = Math.sin(view.t * 7) > 0;
  for (const c of view.police) dot(c.x, c.z, blink ? '#ff4444' : '#4488ff', 2.6);
  if (view.marker) {
    const pulse = 3.4 + Math.sin(view.t * 5) * 1.1;
    dot(view.marker.x, view.marker.z, '#ffd94d', pulse);
    g.strokeStyle = '#ffd94d'; g.lineWidth = 1.2;
    g.beginPath(); g.arc(px(view.marker.x), pz(view.marker.z), pulse + 3.4, 0, Math.PI * 2); g.stroke();
  }
  // player arrow
  const { x, z, heading } = view.player;
  g.save();
  g.translate(px(x), pz(z));
  g.rotate(Math.PI - heading); // world forward (sin h, cos h) drawn on canvas (x right, z down)
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#12222e'; g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, -6); g.lineTo(4.4, 5); g.lineTo(0, 2.4); g.lineTo(-4.4, 5);
  g.closePath(); g.fill(); g.stroke();
  g.restore();
}
