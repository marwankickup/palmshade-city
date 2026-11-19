// save.js — localStorage persistence: money, mission index, packages, position.
const KEY = 'palmshade-city-save-v1';
export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d !== 'object' || d === null) return null;
    return {
      money: d.money | 0,
      missionIndex: d.missionIndex | 0,
      packages: Array.isArray(d.packages) ? d.packages.filter(n => Number.isInteger(n)) : [],
      pos: d.pos && isFinite(d.pos.x) && isFinite(d.pos.z) ? { x: d.pos.x, z: d.pos.z } : { x: 150, z: -8 },
      finished: !!d.finished,
    };
  } catch { return null; }
}
export function writeSave(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode */ }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
