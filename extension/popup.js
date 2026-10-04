// Fereastra extensiei: stare conexiune, comutator pornit/oprit, ultimele prețuri citite.
const REQUEST_TIMEOUT_MS = 5000;
const STORE_NAMES = { emag: "eMAG", pcgarage: "PC Garage", altex: "Altex" };
const TIME_UNITS = [
  ["day", 86_400],
  ["hour", 3600],
  ["minute", 60],
];

const priceFormatter = new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON" });
const relativeFormatter = new Intl.RelativeTimeFormat("ro-RO", { numeric: "auto" });

const $ = (id) => document.getElementById(id);

/** Ultima adresă a aplicației web primită de la service worker. */
let webBase = "";
let togglePending = false;

/**
 * Trimite un mesaj către service worker; refuză dacă nu răspunde la timp.
 * @param {{ type: string, [key: string]: unknown }} message
 * @returns {Promise<any>}
 */
async function send(message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), REQUEST_TIMEOUT_MS);
  });
  try {
    const response = await Promise.race([chrome.runtime.sendMessage(message), timeout]);
    if (response === undefined) {
      throw new Error("fără răspuns");
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Construiește un link către aplicația web; doar http/https, altfel null.
 * @param {string} base
 * @param {string} path
 * @returns {string | null}
 */
function webLink(base, path) {
  try {
    const url = new URL(base.replace(/\/+$/, "") + path);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Formatează o sumă din bani (întreg) pentru afișare.
 * @param {number} bani
 * @returns {string}
 */
function formatPrice(bani) {
  return priceFormatter.format(bani / 100);
}

/**
 * Timpul scurs de la un moment, în română ("acum 5 minute").
 * @param {number} at milisecunde epoch
 * @param {number} [now]
 * @returns {string}
 */
function formatAgo(at, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  for (const [unit, size] of TIME_UNITS) {
    if (seconds >= size) {
      return relativeFormatter.format(-Math.floor(seconds / size), unit);
    }
  }
  return "chiar acum";
}

/**
 * Creează un element cu text sigur (textContent).
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/**
 * Arată doar una dintre secțiunile de stare.
 * @param {"loading" | "error" | "content"} name
 */
function showState(name) {
  for (const id of ["loading", "error", "content"]) {
    $(id).hidden = id !== name;
  }
}

/**
 * Mesajul de eroare al unei acțiuni (comutator, conectare); gol îl ascunde.
 * @param {string} [message]
 */
function setActionError(message) {
  $("action-error").textContent = message ?? "";
  $("action-error").hidden = !message;
}

/** @param {{ loggedIn: boolean, user: { name: string, email: string } | null }} status */
function renderConnection({ loggedIn, user }) {
  const connected = loggedIn && user !== null;
  $("avatar").textContent = connected ? (user.name || user.email).charAt(0).toUpperCase() : "?";
  $("connection-title").textContent = connected ? `Conectat ca ${user.name || user.email}` : "Nu ești conectat";
  $("connection-detail").textContent = connected
    ? (user.name ? user.email : "")
    : "Compari prețuri fără cont; prețurile se trimit doar când ești conectat.";
  $("login").hidden = connected;
}

/** @param {boolean} enabled */
function renderSwitch(enabled) {
  $("switch").setAttribute("aria-checked", String(enabled));
  $("switch-hint").textContent = enabled ? "Activ pe eMAG, PC Garage și Altex." : "Oprit pe toate magazinele.";
}

/** @param {{ at: number, store: string, title: string, price: number, changed: boolean }} entry */
function renderObservation(entry) {
  const known = Object.hasOwn(STORE_NAMES, entry.store);
  const dot = el("span", "dot");
  dot.dataset.store = known ? entry.store : "other";
  dot.setAttribute("aria-hidden", "true");

  const title = el("span", "obs-title", entry.title);
  title.title = entry.title;
  const meta = el("span", "obs-meta", `${known ? STORE_NAMES[entry.store] : entry.store} · ${formatAgo(entry.at)}`);
  const side = el("div", "obs-side");
  side.append(el("span", "obs-price", formatPrice(entry.price)));
  if (entry.changed) {
    side.append(el("span", "badge", "preț nou"));
  }

  const item = el("li", "obs");
  const main = el("div", "obs-main");
  main.append(title, meta);
  item.append(dot, main, side);
  return item;
}

/** @param {{ at: number, store: string, title: string, price: number, changed: boolean }[]} recent */
function renderRecent(recent) {
  $("recent-list").replaceChildren(...recent.map(renderObservation));
  $("recent-list").hidden = recent.length === 0;
  $("recent-empty").hidden = recent.length > 0;
}

/** @param {string} base adresa aplicației web */
function renderLinks(base) {
  for (const [id, path] of [
    ["link-search", "/cauta"],
    ["link-dashboard", "/dashboard"],
  ]) {
    const href = webLink(base, path);
    if (href) {
      $(id).href = href;
    }
    $(id).hidden = !href;
  }
}

/** @param {any} status răspunsul pretpilot:status */
function render(status) {
  webBase = status.webBase;
  renderConnection(status);
  renderSwitch(status.enabled);
  renderRecent(status.recent);
  renderLinks(status.webBase);
  showState("content");
}

async function load() {
  showState("loading");
  try {
    render(await send({ type: "pretpilot:status" }));
  } catch {
    showState("error");
  }
}

async function onToggle() {
  if (togglePending) {
    return;
  }
  const previous = $("switch").getAttribute("aria-checked") === "true";
  togglePending = true;
  $("switch").setAttribute("aria-busy", "true");
  setActionError();
  try {
    const { enabled } = await send({ type: "pretpilot:set-enabled", enabled: !previous });
    renderSwitch(enabled);
  } catch {
    setActionError("Nu am putut salva setarea. Încearcă din nou.");
  } finally {
    togglePending = false;
    $("switch").removeAttribute("aria-busy");
  }
}

async function onLogin() {
  const url = webLink(webBase, "/login");
  if (!url) {
    setActionError("Adresa aplicației web nu este validă. Verifică Setările.");
    return;
  }
  try {
    await chrome.tabs.create({ url });
    window.close();
  } catch {
    setActionError("Nu am putut deschide pagina de conectare.");
  }
}

$("retry").addEventListener("click", load);
$("switch").addEventListener("click", onToggle);
$("login").addEventListener("click", onLogin);
$("open-settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

load();
