// save.js — localStorage persistence: money, mission progress, packages, position.
const KEY = 'palmshade-city-save-v3';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d !== 'object' || d === null) return null;
    return {
      money: Number(d.money) || 0,
      missionIndex: Number(d.missionIndex) || 0,
      chainDone: !!d.chainDone,
      packages: Array.isArray(d.packages) ? d.packages.filter((n) => Number.isInteger(n)) : [],
      pos: d.pos && Number.isFinite(d.pos.x) && Number.isFinite(d.pos.z) ? d.pos : null,
    };
  } catch { return null; }
}

export function storeSave(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode */ }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
