// Pagina de setări: adresele API și web, permisiunea de origine, testul conexiunii.
import { DEFAULT_SETTINGS, getSettings, saveSettings } from "./src/settings.js";

const FIELDS = [
  { key: "apiBase", id: "api" },
  { key: "webBase", id: "web" },
];
const TEST_TIMEOUT_MS = 15_000;

const $ = (id) => document.getElementById(id);

let busy = false;

/**
 * Validează o adresă de bază (doar http/https, fără parametri); gol înseamnă valoarea implicită.
 * @param {string} raw
 * @param {string} fallback
 * @returns {{ value: string, error?: undefined } | { error: string, value?: undefined }}
 */
function parseBaseUrl(raw, fallback) {
  const text = raw.trim();
  if (text === "") {
    return { value: fallback };
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    return { error: "Adresa nu este validă. Exemplu: https://arbitra.ro" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: "Adresa trebuie să înceapă cu http:// sau https://." };
  }
  if (url.username || url.password || url.search || url.hash) {
    return { error: "Adresa nu trebuie să conțină utilizator, parametri sau #." };
  }
  return { value: url.origin + url.pathname.replace(/\/+$/, "") };
}

/**
 * Cere acces la serverul API dacă nu e cel implicit și nu a fost deja acordat.
 * @param {string} apiBase
 * @returns {Promise<boolean>}
 */
async function ensureAccess(apiBase) {
  const { origin } = new URL(apiBase);
  if (origin === new URL(DEFAULT_SETTINGS.apiBase).origin) {
    return true;
  }
  const request = { origins: [`${origin}/*`] };
  return (await chrome.permissions.contains(request)) || chrome.permissions.request(request);
}

/**
 * Trimite un mesaj către service worker; refuză dacă nu răspunde la timp.
 * @param {{ type: string, [key: string]: unknown }} message
 * @returns {Promise<any>}
 */
async function send(message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), TEST_TIMEOUT_MS);
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
 * Rezultatul acțiunii curente, anunțat de cititoarele de ecran (aria-live).
 * @param {string} message
 * @param {"ok" | "error" | "info"} kind
 */
function setResult(message, kind) {
  $("result").dataset.kind = kind;
  $("result").textContent = message;
}

/**
 * Citește și validează un câmp; arată eroarea lui. Întoarce adresa sau null.
 * @param {{ key: keyof typeof DEFAULT_SETTINGS, id: string }} field
 * @returns {string | null}
 */
function readField({ key, id }) {
  const input = $(`${id}-base`);
  const result = parseBaseUrl(input.value, DEFAULT_SETTINGS[key]);
  $(`${id}-error`).textContent = result.error ?? "";
  $(`${id}-error`).hidden = result.error === undefined;
  input.setAttribute("aria-invalid", String(result.error !== undefined));
  return result.error === undefined ? result.value : null;
}

/** Citește ambele câmpuri; la eroare mută focusul pe primul câmp greșit. */
function readFields() {
  const [apiBase, webBase] = FIELDS.map(readField);
  if (apiBase === null || webBase === null) {
    $(apiBase === null ? "api-base" : "web-base").focus();
    return null;
  }
  return { apiBase, webBase };
}

/** @param {{ apiBase: string, webBase: string }} values */
function fillFields(values) {
  for (const { key, id } of FIELDS) {
    $(`${id}-base`).value = values[key];
    $(`${id}-error`).hidden = true;
    $(`${id}-base`).setAttribute("aria-invalid", "false");
  }
  const web = parseBaseUrl(values.webBase, DEFAULT_SETTINGS.webBase);
  $("web-link").href = web.value ?? DEFAULT_SETTINGS.webBase;
  $("web-link").hidden = false;
}

async function save() {
  const values = readFields();
  if (!values) {
    return;
  }
  if (!(await ensureAccess(values.apiBase))) {
    setResult(
      `Fără acordul tău, extensia nu poate comunica cu ${new URL(values.apiBase).origin}. Setările nu au fost salvate.`,
      "error",
    );
    return;
  }
  await saveSettings(values);
  fillFields(values);
  setResult("Setările au fost salvate.", "ok");
}

async function testConnection() {
  const apiBase = readField(FIELDS[0]);
  if (apiBase === null) {
    $("api-base").focus();
    return;
  }
  if (!(await ensureAccess(apiBase))) {
    setResult("Fără acordul tău, extensia nu poate testa conexiunea la acest server.", "error");
    return;
  }
  setResult("Se testează conexiunea…", "info");
  try {
    const { ok, message } = await send({ type: "pretpilot:test-connection", apiBase });
    setResult(message, ok ? "ok" : "error");
  } catch {
    setResult("Extensia nu a răspuns. Încearcă din nou.", "error");
  }
}

async function resetDefaults() {
  await saveSettings({ apiBase: DEFAULT_SETTINGS.apiBase, webBase: DEFAULT_SETTINGS.webBase });
  fillFields(DEFAULT_SETTINGS);
  setResult("Valorile implicite au fost restabilite.", "ok");
}

/**
 * Învelește o acțiune: ignoră click-urile cât timp rulează alta și afișează erorile neașteptate.
 * @param {() => Promise<void>} action
 * @returns {(event: Event) => Promise<void>}
 */
function guarded(action) {
  return async (event) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    busy = true;
    $("form").setAttribute("aria-busy", "true");
    try {
      await action();
    } catch {
      setResult("Ceva nu a mers. Încearcă din nou.", "error");
    } finally {
      busy = false;
      $("form").removeAttribute("aria-busy");
    }
  };
}

for (const { key, id } of FIELDS) {
  $(`${id}-base`).placeholder = DEFAULT_SETTINGS[key];
}
$("form").addEventListener("submit", guarded(save));
$("test").addEventListener("click", guarded(testConnection));
$("reset").addEventListener("click", guarded(resetDefaults));
getSettings()
  .then(fillFields)
  .catch(() => setResult("Nu am putut citi setările salvate.", "error"));
