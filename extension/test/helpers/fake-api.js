// API-ul Arbitra simulat: un `fetch` fals care răspunde per procedură tRPC, fără rețea.

/** @param {unknown} body @param {number} [status] @param {Record<string, string>} [headers] */
export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

export const ok = (data) => json({ result: { data } });

export const unauthorized = () =>
  json({ error: { message: "UNAUTHORIZED", code: -32001, data: { code: "UNAUTHORIZED", httpStatus: 401 } } }, 401);

/** Răspunsul limitatorului serverului: 429 în forma unei erori tRPC, cu Retry-After când e dat. */
export const tooManyRequests = (retryAfter) =>
  json(
    { error: { message: "Prea multe prețuri.", code: -32_029, data: { code: "TOO_MANY_REQUESTS", httpStatus: 429 } } },
    429,
    retryAfter === undefined ? {} : { "retry-after": String(retryAfter) }
  );

/**
 * Instalează un fetch fals cu răspunsuri per procedură; ce nu e dat primește o eroare de rețea.
 * @param {Record<string, () => Response | Promise<Response>>} routes cheie: "POST product.ingestPrice"
 * @returns {{ key: string, url: string, init: RequestInit, input: unknown, body: unknown }[]} cererile primite
 */
export function mockApi(routes) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const { pathname } = new URL(url);
    const procedure = pathname.replace(/^\/trpc\//, "").replace(/^\/api\/auth\//, "auth:");
    const key = `${init?.method ?? "GET"} ${procedure}`;
    const parsed = new URL(url);
    calls.push({
      key,
      url,
      init,
      input: parsed.searchParams.has("input") ? JSON.parse(parsed.searchParams.get("input")) : undefined,
      body: init?.body ? JSON.parse(init.body) : undefined,
    });
    const route = routes[key];
    if (!route) {
      throw new TypeError("Failed to fetch");
    }
    return route();
  };
  return calls;
}
