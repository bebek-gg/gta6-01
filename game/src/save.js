// save.js — localStorage save/load for cash, story progress and rank.
const KEY = 'solmar-save-v1';

export function saveGame(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      cash: state.cash,
      missionIndex: state.missionIndex,
      storyDone: state.storyDone,
      playerX: state.playerX, playerZ: state.playerZ,
      armed: state.armed,
      savedAt: Date.now(),
    }));
    return true;
  } catch (e) { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (typeof d.cash !== 'number' || typeof d.missionIndex !== 'number') return null;
    return d;
  } catch (e) { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* no storage */ }
}
