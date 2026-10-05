// Client HTTP pentru API-ul Arbitra (tRPC 11 fără transformer), folosit de service worker.
// Funcțiile primesc opțional un `fetch` injectat, ca să poată fi testate fără rețea.

/** @typedef {"UNAUTHORIZED" | "RATE_LIMITED" | "NETWORK" | "TIMEOUT" | "BAD_RESPONSE" | "SERVER"} ApiErrorCode */
/** @typedef {{ fetch?: typeof fetch, timeoutMs?: number }} RequestOptions */

const REQUEST_TIMEOUT_MS = 8000;
// Pauza după un 429: cât cere serverul prin Retry-After (în secunde), cel mult 10 minute; 60 de secunde când
// antetul lipsește sau nu e un număr de secunde (o dată calendaristică HTTP nu se citește).
const DEFAULT_RETRY_AFTER_SECONDS = 60;
const MAX_RETRY_AFTER_SECONDS = 10 * 60;

const PROCEDURE_PATH = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$/;

export class ApiError extends Error {
  /**
   * @param {ApiErrorCode} code
   * @param {string} message
   * @param {number | null} [httpStatus]
   * @param {number | null} [retryAfterSeconds] doar la RATE_LIMITED: după cât timp se poate încerca din nou
   */
  constructor(code, message, httpStatus = null, retryAfterSeconds = null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Secundele de așteptat după un 429, din antetul Retry-After.
 * @param {string | null | undefined} header
 * @returns {number} între 1 și 600; 60 când antetul lipsește, nu e un număr întreg sau e zero
 */
export function parseRetryAfter(header) {
  const seconds = typeof header === "string" && /^\s*\d{1,9}\s*$/.test(header) ? Number(header) : 0;
  return seconds >= 1 ? Math.min(seconds, MAX_RETRY_AFTER_SECONDS) : DEFAULT_RETRY_AFTER_SECONDS;
}

/**
 * Curăță adresa unui server: doar http/https, fără credențiale, query, hash sau "/" final.
 * @param {unknown} value
 * @returns {string | null} adresa normalizată sau null când nu este validă
 */
export function normalizeBaseUrl(value) {
  if (typeof value !== "string") {
    return null;
  }
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  if (url.username || url.password) {
    return null;
  }
  return url.origin + url.pathname.replace(/\/+$/, "");
}

/** @param {unknown} value */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Parsare JSON protejată: un corp gol este valid și înseamnă null.
 * @param {string} text
 * @returns {{ valid: boolean, value: unknown }}
 */
function parseJson(text) {
  if (text.trim() === "") {
    return { valid: true, value: null };
  }
  try {
    return { valid: true, value: JSON.parse(text) };
  } catch {
    return { valid: false, value: null };
  }
}

/**
 * Trimite o cerere cu cookie-uri și timeout și întoarce corpul parsat.
 * @param {string} apiBase
 * @param {string} route cale și query, începând cu "/"
 * @param {RequestInit} init
 * @param {RequestOptions} options
 * @returns {Promise<{ status: number, ok: boolean, valid: boolean, value: unknown, retryAfter: string | null }>}
 */
async function request(apiBase, route, init, options) {
  const base = normalizeBaseUrl(apiBase);
  if (!base) {
    throw new ApiError("NETWORK", "Adresa API nu este validă.");
  }

  const doFetch = options.fetch ?? globalThis.fetch;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? REQUEST_TIMEOUT_MS);

  try {
    const response = await doFetch(base + route, {
      ...init,
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      status: response.status,
      ok: response.ok,
      retryAfter: response.headers.get("retry-after"),
      ...parseJson(text),
    };
  } catch {
    if (timedOut) {
      throw new ApiError("TIMEOUT", "Serverul nu a răspuns la timp.");
    }
    throw new ApiError("NETWORK", "Nu mă pot conecta la server.");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Transformă un răspuns tRPC de eroare în ApiError.
 * @param {{ status: number, valid: boolean, value: unknown, retryAfter: string | null }} response
 */
function toApiError({ status, valid, value, retryAfter }) {
  const error = valid && isRecord(value) && isRecord(value.error) ? value.error : null;
  const data = error && isRecord(error.data) ? error.data : null;
  const httpStatus = data && Number.isInteger(data.httpStatus) ? data.httpStatus : status;
  const message = error && typeof error.message === "string" ? error.message : `HTTP ${status}`;

  if (data?.code === "UNAUTHORIZED" || httpStatus === 401) {
    return new ApiError("UNAUTHORIZED", message, httpStatus);
  }
  // limitatorul serverului răspunde 429 în forma unei erori tRPC (TOO_MANY_REQUESTS), cu Retry-After
  if (data?.code === "TOO_MANY_REQUESTS" || httpStatus === 429) {
    return new ApiError("RATE_LIMITED", message, httpStatus, parseRetryAfter(retryAfter));
  }
  return new ApiError("SERVER", message, httpStatus);
}

/**
 * Extrage `result.data` dintr-un răspuns tRPC sau aruncă ApiError.
 * @param {{ status: number, ok: boolean, valid: boolean, value: unknown, retryAfter: string | null }} response
 */
function unwrapTrpc(response) {
  const { status, ok, valid, value } = response;
  if (!ok || (valid && isRecord(value) && "error" in value)) {
    throw toApiError(response);
  }
  if (!valid || !isRecord(value) || !isRecord(value.result) || !("data" in value.result)) {
    throw new ApiError("BAD_RESPONSE", "Serverul a trimis un răspuns neașteptat.", status);
  }
  return value.result.data;
}

/** @param {string} path */
function assertProcedurePath(path) {
  if (!PROCEDURE_PATH.test(path)) {
    throw new TypeError(`Procedură tRPC invalidă: ${path}`);
  }
}

/**
 * Interogare tRPC (GET); inputul merge JSON în parametrul `input`.
 * @param {string} apiBase
 * @param {string} path de exemplu "catalog.lookup"
 * @param {unknown} [input]
 * @param {RequestOptions} [options]
 * @returns {Promise<any>} conținutul `result.data`
 */
export async function trpcQuery(apiBase, path, input, options = {}) {
  assertProcedurePath(path);
  const query = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const response = await request(apiBase, `/trpc/${path}${query}`, { method: "GET" }, options);
  return unwrapTrpc(response);
}

/**
 * Mutație tRPC (POST) cu inputul ca JSON în corp.
 * @param {string} apiBase
 * @param {string} path de exemplu "product.ingestPrice"
 * @param {unknown} [input]
 * @param {RequestOptions} [options]
 * @returns {Promise<any>} conținutul `result.data`
 */
export async function trpcMutation(apiBase, path, input, options = {}) {
  assertProcedurePath(path);
  const init = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: input === undefined ? undefined : JSON.stringify(input),
  };
  const response = await request(apiBase, `/trpc/${path}`, init, options);
  return unwrapTrpc(response);
}

/**
 * Verifică sesiunea Better Auth. Întoarce utilizatorul sau null când nu este conectat.
 * @param {string} apiBase
 * @param {RequestOptions} [options]
 * @returns {Promise<{ name: string, email: string } | null>}
 */
export async function getSession(apiBase, options = {}) {
  const response = await request(apiBase, "/api/auth/get-session", { method: "GET" }, options);
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw toApiError(response);
  }
  if (!response.valid) {
    throw new ApiError("BAD_RESPONSE", "Serverul a trimis un răspuns neașteptat.", response.status);
  }
  const user = isRecord(response.value) ? response.value.user : null;
  if (!isRecord(user)) {
    return null;
  }
  return {
    name: typeof user.name === "string" ? user.name : "",
    email: typeof user.email === "string" ? user.email : "",
  };
}

/**
 * Verifică dacă serverul Arbitra răspunde (procedura publică healthCheck).
 * @param {string} apiBase
 * @param {RequestOptions} [options]
 * @returns {Promise<true>}
 */
export async function healthCheck(apiBase, options = {}) {
  const data = await trpcQuery(apiBase, "healthCheck", undefined, options);
  if (data !== "OK") {
    throw new ApiError("BAD_RESPONSE", "Serverul nu este un server Arbitra.");
  }
  return true;
}
