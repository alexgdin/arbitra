// Setările extensiei, păstrate în chrome.storage.local sub cheia "settings".

import { normalizeBaseUrl } from "./api.js";

/** @typedef {{ apiBase: string, webBase: string, enabled: boolean }} Settings */

export const SETTINGS_KEY = "settings";

/** @type {Readonly<Settings>} */
export const DEFAULT_SETTINGS = Object.freeze({
  apiBase: "http://localhost:3000",
  webBase: "http://localhost:3001",
  enabled: true,
});

export class SettingsError extends Error {
  /**
   * @param {keyof Settings} field câmpul respins
   * @param {string} message
   */
  constructor(field, message) {
    super(message);
    this.name = "SettingsError";
    this.field = field;
  }
}

/**
 * Completează cu valorile implicite tot ce lipsește sau nu este valid.
 * @param {unknown} raw valoarea citită din storage
 * @returns {Settings}
 */
export function normalizeSettings(raw) {
  /** @type {Record<string, unknown>} */
  const source = raw !== null && typeof raw === "object" ? raw : {};
  return {
    apiBase: normalizeBaseUrl(source.apiBase) ?? DEFAULT_SETTINGS.apiBase,
    webBase: normalizeBaseUrl(source.webBase) ?? DEFAULT_SETTINGS.webBase,
    enabled: typeof source.enabled === "boolean" ? source.enabled : DEFAULT_SETTINGS.enabled,
  };
}

/** @returns {Promise<Settings>} */
export async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(stored[SETTINGS_KEY]);
}

/**
 * Salvează doar câmpurile primite; adresele invalide sunt respinse cu SettingsError.
 * @param {Partial<Settings>} partial
 * @returns {Promise<Settings>} setările rezultate
 */
export async function saveSettings(partial) {
  const next = await getSettings();

  if (partial.apiBase !== undefined) {
    const apiBase = normalizeBaseUrl(partial.apiBase);
    if (!apiBase) {
      throw new SettingsError("apiBase", "Adresa API trebuie să înceapă cu http:// sau https://.");
    }
    next.apiBase = apiBase;
  }
  if (partial.webBase !== undefined) {
    const webBase = normalizeBaseUrl(partial.webBase);
    if (!webBase) {
      throw new SettingsError(
        "webBase",
        "Adresa aplicației web trebuie să înceapă cu http:// sau https://."
      );
    }
    next.webBase = webBase;
  }
  if (partial.enabled !== undefined) {
    if (typeof partial.enabled !== "boolean") {
      throw new SettingsError("enabled", "Valoarea pentru activare trebuie să fie true sau false.");
    }
    next.enabled = partial.enabled;
  }

  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}
