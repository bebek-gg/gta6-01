// save.js — localStorage saves for SOLMAR: cash, armour, the loft, story
// progress and where Milo stands. Everything is guarded; a missing or
// corrupt save just means a fresh start.
const SAVE_KEY = 'solmar-save-v1';

export function createSave(G) {
  function saveGame() {
    try {
      const data = {
        cash: G.world.cash,
        armor: G.world.armor,
        loft: G.world.safehouse2Owned,
        index: G.missions.index,
        storyDone: G.missions.storyDone,
        earned: G.totalEarned || 0,
        x: G.world.playerX,
        z: G.world.playerZ,
        station: G.audio ? G.audio.stationIndex : 0,
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  function loadGame() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return false;
      if (typeof data.cash === 'number') G.world.cash = data.cash;
      if (typeof data.armor === 'number') G.world.armor = data.armor;
      if (data.loft === true) G.world.safehouse2Owned = true;
      if (typeof data.index === 'number') G.missions.index = Math.max(0, Math.min(12, data.index));
      if (data.storyDone === true) G.missions.storyDone = true;
      if (typeof data.earned === 'number') G.totalEarned = data.earned;
      if (typeof data.x === 'number' && typeof data.z === 'number') {
        G.player.setPosition(data.x, data.z, 0);
      }
      if (typeof data.station === 'number' && G.audio) G.audio.setStation(data.station);
      return true;
    } catch (e) {
      return false;
    }
  }

  return { saveGame, loadGame };
}
