// Starea locală a extensiei în chrome.storage.local: deduplicarea trimiterilor ("seen:..."),
// lista produselor recente și pauza după un 429 ("backoffUntil"). Funcțiile nu aruncă: o eroare de
// storage nu trebuie să strice comparația prețurilor, deci se loghează și se continuă.

import {
  appendRecent,
  expiredSeenKeys,
  normalizeRecent,
  normalizeSeen,
  seenKey,
} from "./logic.js";

const RECENT_KEY = "recent";
const PRUNE_KEY = "seenPrunedAt";
const BACKOFF_KEY = "backoffUntil";
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

/** @param {string} action @param {unknown} error */
function warnStorage(action, error) {
  console.warn(`Arbitra: nu am putut ${action} în storage`, error);
}

/**
 * Ultima trimitere reușită pentru produs.
 * @param {Parameters<typeof seenKey>[0]} observation
 * @returns {Promise<import("./logic.js").SeenRecord | null>}
 */
export async function readSeen(observation) {
  try {
    const key = seenKey(observation);
    const stored = await chrome.storage.local.get(key);
    return normalizeSeen(stored[key]);
  } catch (error) {
    warnStorage("citi deduplicarea", error);
    return null;
  }
}

/**
 * @param {Parameters<typeof seenKey>[0] & { price: number }} observation
 * @param {number} now
 */
export async function writeSeen(observation, now) {
  try {
    await chrome.storage.local.set({
      [seenKey(observation)]: { price: observation.price, at: now },
    });
  } catch (error) {
    warnStorage("salva deduplicarea", error);
  }
}

/** @returns {Promise<import("./logic.js").RecentEntry[]>} */
export async function readRecent() {
  try {
    const stored = await chrome.storage.local.get(RECENT_KEY);
    return normalizeRecent(stored[RECENT_KEY]);
  } catch (error) {
    warnStorage("citi produsele recente", error);
    return [];
  }
}

/** @param {import("./logic.js").RecentEntry} entry */
export async function pushRecent(entry) {
  try {
    const recent = await readRecent();
    await chrome.storage.local.set({ [RECENT_KEY]: appendRecent(recent, entry) });
  } catch (error) {
    warnStorage("salva produsele recente", error);
  }
}

/**
 * Până când a cerut serverul să nu mai trimitem cereri (după un 429).
 * @returns {Promise<number | null>} milisecunde epoch sau null când nu există o pauză
 */
export async function readBackoffUntil() {
  try {
    const stored = await chrome.storage.local.get(BACKOFF_KEY);
    const until = stored[BACKOFF_KEY];
    return typeof until === "number" && Number.isFinite(until) ? until : null;
  } catch (error) {
    warnStorage("citi pauza după 429", error);
    return null;
  }
}

/** @param {number} until milisecunde epoch */
export async function writeBackoffUntil(until) {
  try {
    await chrome.storage.local.set({ [BACKOFF_KEY]: until });
  } catch (error) {
    warnStorage("salva pauza după 429", error);
  }
}

export async function clearBackoff() {
  try {
    await chrome.storage.local.remove(BACKOFF_KEY);
  } catch (error) {
    warnStorage("șterge pauza după 429", error);
  }
}

/**
 * Șterge intrările "seen:" expirate, cel mult o dată pe oră (nu avem permisiunea "alarms").
 * @param {number} now
 */
export async function pruneSeen(now) {
  try {
    const stored = await chrome.storage.local.get(PRUNE_KEY);
    const elapsed = now - Number(stored[PRUNE_KEY]);
    if (elapsed >= 0 && elapsed < PRUNE_INTERVAL_MS) {
      return;
    }
    const expired = expiredSeenKeys(await chrome.storage.local.get(null), now);
    if (expired.length > 0) {
      await chrome.storage.local.remove(expired);
    }
    await chrome.storage.local.set({ [PRUNE_KEY]: now });
  } catch (error) {
    warnStorage("curăța deduplicarea", error);
  }
}
