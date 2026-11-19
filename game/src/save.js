// save.js — localStorage persistence: money, mission progress, packages, position.

const KEY = 'palmshade_city_save_v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      money: data.money | 0,
      missionIndex: data.missionIndex | 0,
      packages: Array.isArray(data.packages) ? data.packages : [],
      pos: Array.isArray(data.pos) ? data.pos : null,
      finishedStory: !!data.finishedStory,
    };
  } catch (e) {
    return null;
  }
}

export function writeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      money: state.money | 0,
      missionIndex: state.missionIndex | 0,
      packages: state.packages,
      pos: state.pos,
      finishedStory: !!state.finishedStory,
    }));
  } catch (e) { /* storage unavailable — play session-only */ }
}

export function hasSave() {
  try { return localStorage.getItem(KEY) !== null; } catch (e) { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}
