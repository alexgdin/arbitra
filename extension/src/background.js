// Service worker: primește observațiile de pe paginile magazinelor, trimite prețul la API
// (doar utilizatorii conectați contribuie) și caută același produs în celelalte magazine.

import { getSession, healthCheck, normalizeBaseUrl, trpcMutation, trpcQuery } from "./api.js";
import {
  badgeText,
  countCheaperOffers,
  describeError,
  hasForeignCurrency,
  isBackingOff,
  sanitizeCatalogItem,
  senderMatchesStore,
  shouldSendIngest,
  validateObservation,
} from "./logic.js";
import { DEFAULT_SETTINGS, getSettings, saveSettings } from "./settings.js";
import {
  clearBackoff,
  pruneSeen,
  pushRecent,
  readBackoffUntil,
  readRecent,
  readSeen,
  writeBackoffUntil,
  writeSeen,
} from "./store.js";

/** @typedef {import("./logic.js").Observation} Observation */
/** @typedef {import("./logic.js").CatalogItem} CatalogItem */
/** @typedef {import("./settings.js").Settings} Settings */

const BADGE_COLOR = "#0f766e";
const BADGE_TEXT_COLOR = "#ffffff";

/** Erorile după care nici interogarea nu mai are șanse: serverul nu răspunde sau ne-a cerut să așteptăm. */
const STOP_CODES = new Set(["NETWORK", "TIMEOUT", "RATE_LIMITED"]);

/**
 * Pune numărul ofertelor mai ieftine pe insigna extensiei, doar pentru fila respectivă.
 * @param {number | undefined} tabId
 * @param {number} count
 */
async function setBadge(tabId, count) {
  if (tabId === undefined) {
    return;
  }
  try {
    await chrome.action.setBadgeText({ tabId, text: badgeText(count) });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
    await chrome.action.setBadgeTextColor({ tabId, color: BADGE_TEXT_COLOR });
  } catch {
    // fila s-a închis între timp
  }
}

/**
 * Trimite prețul la API, dacă este nevoie și dacă utilizatorul este conectat.
 * @param {Settings} settings
 * @param {Observation} observation
 * @param {number} now
 * @returns {Promise<{ ingested: { changed: boolean, previousPrice: number | null } | null, error: any }>}
 */
async function contribute(settings, observation, now) {
  const seen = await readSeen(observation);
  if (!shouldSendIngest(seen, observation, now)) {
    return { ingested: null, error: null };
  }

  let result;
  try {
    result = await trpcMutation(settings.apiBase, "product.ingestPrice", observation);
  } catch (error) {
    return { ingested: null, error };
  }

  const changed = result?.changed === true;
  const previousPrice = Number.isSafeInteger(result?.previousPrice) ? result.previousPrice : null;
  await writeSeen(observation, now);
  await pushRecent({
    at: now,
    store: observation.store,
    title: observation.title,
    price: observation.price,
    changed,
  });
  return { ingested: { changed, previousPrice }, error: null };
}

/**
 * Caută același produs în celelalte magazine (interogare publică).
 * @param {Settings} settings
 * @param {Observation} observation
 * @param {any} ingestError
 * @returns {Promise<{ item: CatalogItem | null, error: any }>}
 */
async function lookup(settings, observation, ingestError) {
  // dacă serverul nu răspunde, a doua cerere ar aștepta degeaba încă 8 secunde, iar după un 429 ar fi respinsă
  if (ingestError && STOP_CODES.has(ingestError.code)) {
    return { item: null, error: ingestError };
  }
  try {
    const raw = await trpcQuery(settings.apiBase, "catalog.lookup", {
      store: observation.store,
      externalId: observation.externalId,
    });
    const item = sanitizeCatalogItem(raw);
    if (raw !== null && item === null) {
      return { item: null, error: { code: "BAD_RESPONSE" } };
    }
    return { item, error: null };
  } catch (error) {
    return { item: null, error };
  }
}

/**
 * @param {Settings} settings
 * @param {{
 *   state: "ok" | "logged-out" | "disabled" | "ignored" | "error",
 *   ingested?: { changed: boolean, previousPrice: number | null } | null,
 *   item?: CatalogItem | null,
 *   error?: string,
 * }} parts
 */
function observeResponse(settings, { state, ingested = null, item = null, error }) {
  return {
    ok: state !== "error",
    state,
    ingested,
    item,
    webUrl: settings.webBase,
    ...(error ? { error } : {}),
  };
}

/**
 * @param {{ observation?: unknown }} message
 * @param {chrome.runtime.MessageSender} sender
 */
async function handleObserve(message, sender) {
  const settings = await getSettings();
  const tabId = sender.tab?.id;

  if (!settings.enabled) {
    await setBadge(tabId, 0);
    return observeResponse(settings, { state: "disabled" });
  }

  const observation = validateObservation(message.observation);
  if (!observation && hasForeignCurrency(message.observation)) {
    // serverul primește doar RON: observația se ignoră în liniște, fără stare de eroare
    await setBadge(tabId, 0);
    return observeResponse(settings, { state: "ignored" });
  }
  if (!observation || !senderMatchesStore(sender.url, observation.store)) {
    return observeResponse(settings, { state: "error", error: "Observația primită nu este validă." });
  }

  const now = Date.now();
  const backoffUntil = await readBackoffUntil();
  if (isBackingOff(backoffUntil, now)) {
    // serverul a răspuns 429 și pauza cerută nu s-a încheiat: nicio cerere, nici trimitere, nici căutare
    await setBadge(tabId, 0);
    return observeResponse(settings, { state: "error", error: describeError({ code: "RATE_LIMITED" }) });
  }

  const contribution = await contribute(settings, observation, now);
  const found = await lookup(settings, observation, contribution.error);
  void pruneSeen(now);

  const limited = [contribution.error, found.error].find((error) => error?.code === "RATE_LIMITED");
  if (limited) {
    await writeBackoffUntil(now + limited.retryAfterSeconds * 1000);
  } else if (backoffUntil !== null && !found.error) {
    // un răspuns bun după pauză: nu mai are rost să ținem minte o pauză încheiată
    await clearBackoff();
  }

  if (found.error) {
    await setBadge(tabId, 0);
    return observeResponse(settings, { state: "error", error: describeError(found.error) });
  }

  await setBadge(tabId, countCheaperOffers(found.item, observation));
  const loggedOut = contribution.error?.code === "UNAUTHORIZED";
  return observeResponse(settings, {
    state: loggedOut ? "logged-out" : "ok",
    ingested: contribution.ingested,
    item: found.item,
  });
}

async function handleStatus() {
  const [settings, recent] = await Promise.all([getSettings(), readRecent()]);
  const user = await getSession(settings.apiBase).catch(() => null);
  return {
    enabled: settings.enabled,
    loggedIn: user !== null,
    user,
    apiBase: settings.apiBase,
    webBase: settings.webBase,
    recent,
  };
}

/** @param {{ enabled?: unknown }} message */
async function handleSetEnabled(message) {
  const settings = await saveSettings({ enabled: message.enabled === true });
  return { enabled: settings.enabled };
}

/**
 * Mesaj despre lipsa conexiunii, cu indiciu când extensia nu are acces la adresă.
 * @param {string} apiBase
 * @param {any} error
 */
async function connectionFailureMessage(apiBase, error) {
  if (error?.code === "NETWORK") {
    const origins = [`${new URL(apiBase).origin}/*`];
    const allowed = await chrome.permissions.contains({ origins }).catch(() => true);
    if (!allowed) {
      return (
        "Extensia nu are acces la această adresă. " +
        "Salvează adresa în setări și acordă permisiunea cerută."
      );
    }
  }
  return describeError(error);
}

/** @param {{ apiBase?: unknown }} message */
async function handleTestConnection(message) {
  const apiBase = normalizeBaseUrl(message.apiBase);
  if (!apiBase) {
    return {
      ok: false,
      message: "Adresa nu este validă. Folosește un URL care începe cu http:// sau https://.",
    };
  }
  try {
    await healthCheck(apiBase);
    return { ok: true, message: "Conexiunea cu serverul PretPilot funcționează." };
  } catch (error) {
    return { ok: false, message: await connectionFailureMessage(apiBase, error) };
  }
}

/**
 * Observațiile vin doar din content scripts (pagini web); restul mesajelor doar din
 * paginile extensiei (popup, setări), niciodată dintr-o pagină web.
 * @param {chrome.runtime.MessageSender} sender
 */
function isFromWebPage(sender) {
  return sender.tab !== undefined && !sender.url?.startsWith(chrome.runtime.getURL(""));
}

/**
 * @typedef {{
 *   fromWebPage: boolean,
 *   run: (message: any, sender: chrome.runtime.MessageSender) => Promise<unknown>,
 *   fallback: (message: any, error: unknown) => unknown,
 * }} Handler
 */

/** @type {Record<string, Handler>} */
const HANDLERS = {
  "pretpilot:observe": {
    fromWebPage: true,
    run: handleObserve,
    fallback: (_message, error) => ({
      ok: false,
      state: "error",
      ingested: null,
      item: null,
      webUrl: DEFAULT_SETTINGS.webBase,
      error: describeError(error),
    }),
  },
  "pretpilot:status": {
    fromWebPage: false,
    run: handleStatus,
    fallback: () => ({
      enabled: DEFAULT_SETTINGS.enabled,
      loggedIn: false,
      user: null,
      apiBase: DEFAULT_SETTINGS.apiBase,
      webBase: DEFAULT_SETTINGS.webBase,
      recent: [],
    }),
  },
  "pretpilot:set-enabled": {
    fromWebPage: false,
    run: handleSetEnabled,
    fallback: () => ({ enabled: DEFAULT_SETTINGS.enabled }),
  },
  "pretpilot:test-connection": {
    fromWebPage: false,
    run: handleTestConnection,
    fallback: (_message, error) => ({ ok: false, message: describeError(error) }),
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = typeof message?.type === "string" ? message.type : "";
  if (!Object.hasOwn(HANDLERS, type)) {
    return false;
  }
  const handler = HANDLERS[type];
  if (handler.fromWebPage !== isFromWebPage(sender)) {
    sendResponse(handler.fallback(message, null));
    return false;
  }

  handler.run(message, sender).then(sendResponse, (error) => {
    console.warn("PretPilot: eroare la procesarea mesajului", type, error);
    sendResponse(handler.fallback(message, error));
  });
  return true;
});
