// save.js — localStorage save/load for cash, story progress, rank and bests.
// v2 adds bestCash (most cash ever held) and bestStars (highest wanted
// level reached); v1 saves (no v field) migrate on load, keeping the cash
// they hold as the starting best. v3 adds safehouse2Owned (the Coral Loft).
const KEY = 'solmar-save-v1';
const VERSION = 3;

export function saveGame(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      v: VERSION,
      cash: state.cash,
      missionIndex: state.missionIndex,
      storyDone: state.storyDone,
      playerX: state.playerX, playerZ: state.playerZ,
      armed: state.armed,
      bestCash: state.bestCash || 0,
      bestStars: Math.max(0, Math.min(5, state.bestStars || 0)),
      safehouse2Owned: !!state.safehouse2Owned,
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
    // migrate a v1 save: no version field and no bests yet — the cash it
    // holds becomes the starting best, and the heat record starts at zero
    if (typeof d.v !== 'number') {
      d.v = 1;
      d.bestCash = d.cash;
      d.bestStars = 0;
    }
    if (typeof d.bestCash !== 'number') d.bestCash = d.cash;
    if (typeof d.bestStars !== 'number') d.bestStars = 0;
    d.bestStars = Math.max(0, Math.min(5, d.bestStars));
    // v3: the Coral Loft purchase; older saves never owned it
    if (typeof d.safehouse2Owned !== 'boolean') d.safehouse2Owned = false;
    // savedAt stamps the Continue button; a save without one is just old
    if (typeof d.savedAt !== 'number') d.savedAt = 0;
    return d;
  } catch (e) { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* no storage */ }
}
