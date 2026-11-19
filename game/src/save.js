// save.js — localStorage persistence: money, mission progress, packages, position.

const KEY = 'palmshade-city-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && typeof s === 'object' && typeof s.money === 'number' ? s : null;
  } catch (e) { return null; }
}

export function storeSave(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
}

export function hasSave() { return loadSave() !== null; }

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}
