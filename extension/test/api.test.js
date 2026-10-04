import { describe, expect, test } from "bun:test";

import {
  ApiError,
  getSession,
  healthCheck,
  normalizeBaseUrl,
  parseRetryAfter,
  trpcMutation,
  trpcQuery,
} from "../src/api.js";

const BASE = "http://localhost:3000";

/** @param {unknown} body @param {number} [status] @param {Record<string, string>} [headers] */
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Un fetch fals care înregistrează cererile și întoarce răspunsul dat. */
function mockFetch(respond) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  return { fetch: fetchImpl, calls };
}

/** Un fetch care nu răspunde niciodată și respectă anularea, ca cel real. */
function hangingFetch() {
  return mockFetch(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError"))
        );
      })
  );
}

/** @param {Promise<unknown>} promise */
async function rejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Promisiunea trebuia respinsă");
}

describe("normalizeBaseUrl", () => {
  test.each([
    ["http://localhost:3000", "http://localhost:3000"],
    ["  http://localhost:3000/  ", "http://localhost:3000"],
    ["https://api.pretpilot.ro///", "https://api.pretpilot.ro"],
    ["https://example.com/prefix/", "https://example.com/prefix"],
    ["https://example.com/?a=1#frag", "https://example.com"],
    ["HTTP://LocalHost:3000", "http://localhost:3000"],
  ])("normalizează %p", (input, expected) => {
    expect(normalizeBaseUrl(input)).toBe(expected);
  });

  test.each([
    ["", "gol"],
    ["localhost:3000", "fără schemă"],
    ["ftp://example.com", "schemă ftp"],
    ["javascript:alert(1)", "schemă javascript"],
    ["https://user:pass@example.com", "cu credențiale"],
    [null, "null"],
    [42, "număr"],
  ])("respinge %p (%s)", (input) => {
    expect(normalizeBaseUrl(input)).toBeNull();
  });
});

describe("trpcQuery", () => {
  test("construiește URL-ul cu inputul codat și trimite cookie-uri", async () => {
    const input = { store: "emag", externalId: "ID cu spațiu/&=?ă" };
    const { fetch, calls } = mockFetch(() => json({ result: { data: { found: true } } }));

    const data = await trpcQuery(BASE, "catalog.lookup", input, { fetch });

    expect(data).toEqual({ found: true });
    expect(calls).toHaveLength(1);
    const [{ url, init }] = calls;
    expect(url).toBe(`${BASE}/trpc/catalog.lookup?input=${encodeURIComponent(JSON.stringify(input))}`);
    expect(new URL(url).searchParams.get("input")).toBe(JSON.stringify(input));
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeUndefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test("normalizează adresa de bază (spații și slash final)", async () => {
    const { fetch, calls } = mockFetch(() => json({ result: { data: 1 } }));

    await trpcQuery(" http://localhost:3000/ ", "healthCheck", undefined, { fetch });

    expect(calls[0].url).toBe(`${BASE}/trpc/healthCheck`);
  });

  test("întoarce null când procedura întoarce null", async () => {
    const { fetch } = mockFetch(() => json({ result: { data: null } }));

    expect(await trpcQuery(BASE, "catalog.lookup", {}, { fetch })).toBeNull();
  });

  test("timeout-ul implicit este de 8 secunde", async () => {
    const realSetTimeout = globalThis.setTimeout;
    const delays = [];
    globalThis.setTimeout = (callback, ms) => {
      delays.push(ms);
      return realSetTimeout(callback, ms);
    };
    const { fetch } = mockFetch(() => json({ result: { data: 1 } }));

    try {
      await trpcQuery(BASE, "healthCheck", undefined, { fetch });
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }

    expect(delays).toEqual([8000]);
  });

  test("respinge o procedură cu cale invalidă, fără cerere", async () => {
    const { fetch, calls } = mockFetch(() => json({ result: { data: 1 } }));

    const error = await rejection(trpcQuery(BASE, "../admin?x=1", {}, { fetch }));

    expect(error).toBeInstanceOf(TypeError);
    expect(calls).toHaveLength(0);
  });

  test("respinge o adresă de bază invalidă fără cerere", async () => {
    const { fetch, calls } = mockFetch(() => json({ result: { data: 1 } }));

    const error = await rejection(trpcQuery("ftp://localhost", "healthCheck", undefined, { fetch }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("NETWORK");
    expect(calls).toHaveLength(0);
  });
});

describe("trpcMutation", () => {
  test("trimite POST cu JSON în corp și cookie-uri", async () => {
    const input = { store: "altex", price: 119_999 };
    const { fetch, calls } = mockFetch(() =>
      json({ result: { data: { productId: "p1", changed: true, previousPrice: null } } })
    );

    const data = await trpcMutation(BASE, "product.ingestPrice", input, { fetch });

    expect(data).toEqual({ productId: "p1", changed: true, previousPrice: null });
    const [{ url, init }] = calls;
    expect(url).toBe(`${BASE}/trpc/product.ingestPrice`);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(input);
  });
});

describe("maparea erorilor", () => {
  test("401 cu cod tRPC UNAUTHORIZED devine UNAUTHORIZED", async () => {
    const { fetch } = mockFetch(() =>
      json(
        {
          error: {
            message: "UNAUTHORIZED",
            code: -32001,
            data: { code: "UNAUTHORIZED", httpStatus: 401 },
          },
        },
        401
      )
    );

    const error = await rejection(trpcMutation(BASE, "product.ingestPrice", {}, { fetch }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.httpStatus).toBe(401);
    expect(error.message).toBe("UNAUTHORIZED");
  });

  test("401 fără corp JSON devine tot UNAUTHORIZED", async () => {
    const { fetch } = mockFetch(() => new Response("", { status: 401 }));

    const error = await rejection(trpcMutation(BASE, "product.ingestPrice", {}, { fetch }));

    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.httpStatus).toBe(401);
  });

  test("eroare tRPC cu stare 200 este tratată ca eroare", async () => {
    const { fetch } = mockFetch(() =>
      json({ error: { message: "Nu", code: -32001, data: { code: "UNAUTHORIZED", httpStatus: 401 } } })
    );

    const error = await rejection(trpcQuery(BASE, "x.y", {}, { fetch }));

    expect(error.code).toBe("UNAUTHORIZED");
  });

  test("500 devine SERVER cu mesajul și starea HTTP", async () => {
    const { fetch } = mockFetch(() =>
      json(
        {
          error: {
            message: "Boom",
            code: -32603,
            data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
          },
        },
        500
      )
    );

    const error = await rejection(trpcQuery(BASE, "catalog.lookup", {}, { fetch }));

    expect(error.code).toBe("SERVER");
    expect(error.httpStatus).toBe(500);
    expect(error.message).toBe("Boom");
  });

  test("validarea respinsă (400) devine SERVER", async () => {
    const { fetch } = mockFetch(() =>
      json(
        { error: { message: "Invalid input", code: -32600, data: { code: "BAD_REQUEST", httpStatus: 400 } } },
        400
      )
    );

    const error = await rejection(trpcMutation(BASE, "product.ingestPrice", {}, { fetch }));

    expect(error.code).toBe("SERVER");
    expect(error.httpStatus).toBe(400);
  });

  const TOO_MANY = {
    error: {
      message: "Prea multe prețuri.",
      code: -32_029,
      data: { code: "TOO_MANY_REQUESTS", httpStatus: 429 },
    },
  };

  test("429 de la limitatorul serverului devine RATE_LIMITED cu secundele din Retry-After", async () => {
    const { fetch } = mockFetch(() => json(TOO_MANY, 429, { "retry-after": "45" }));

    const error = await rejection(trpcMutation(BASE, "product.ingestPrice", {}, { fetch }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.httpStatus).toBe(429);
    expect(error.retryAfterSeconds).toBe(45);
    expect(error.message).toBe("Prea multe prețuri.");
  });

  test("429 la interogări și la sesiune este tot RATE_LIMITED", async () => {
    const query = mockFetch(() => json(TOO_MANY, 429, { "retry-after": "10" }));
    const session = mockFetch(() => new Response("", { status: 429, headers: { "retry-after": "20" } }));

    const queryError = await rejection(trpcQuery(BASE, "catalog.lookup", {}, query));
    const sessionError = await rejection(getSession(BASE, session));

    expect([queryError.code, queryError.retryAfterSeconds]).toEqual(["RATE_LIMITED", 10]);
    expect([sessionError.code, sessionError.retryAfterSeconds]).toEqual(["RATE_LIMITED", 20]);
  });

  test("codul tRPC TOO_MANY_REQUESTS este RATE_LIMITED și fără stare 429, iar un 429 fără corp la fel", async () => {
    const trpc = mockFetch(() => json(TOO_MANY, 200));
    const bare = mockFetch(() => new Response("slow down", { status: 429 }));

    expect((await rejection(trpcQuery(BASE, "x.y", {}, trpc))).code).toBe("RATE_LIMITED");
    const error = await rejection(trpcQuery(BASE, "x.y", {}, bare));
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.httpStatus).toBe(429);
    expect(error.retryAfterSeconds).toBe(60);
  });

  test("Retry-After lipsă dă 60 de secunde, iar o valoare mare se taie la 10 minute", async () => {
    const missing = mockFetch(() => json(TOO_MANY, 429));
    const huge = mockFetch(() => json(TOO_MANY, 429, { "retry-after": "86400" }));

    expect((await rejection(trpcQuery(BASE, "x.y", {}, missing))).retryAfterSeconds).toBe(60);
    expect((await rejection(trpcQuery(BASE, "x.y", {}, huge))).retryAfterSeconds).toBe(600);
  });

  test("alte erori nu au secunde de așteptare", async () => {
    const { fetch } = mockFetch(() => new Response("", { status: 500 }));

    expect((await rejection(trpcQuery(BASE, "x.y", {}, { fetch }))).retryAfterSeconds).toBeNull();
  });

  test("o pagină HTML de la un proxy (502) devine SERVER", async () => {
    const { fetch } = mockFetch(() => new Response("<html>Bad gateway</html>", { status: 502 }));

    const error = await rejection(trpcQuery(BASE, "catalog.lookup", {}, { fetch }));

    expect(error.code).toBe("SERVER");
    expect(error.httpStatus).toBe(502);
  });

  test("fetch care eșuează devine NETWORK", async () => {
    const { fetch } = mockFetch(() => {
      throw new TypeError("Failed to fetch");
    });

    const error = await rejection(trpcQuery(BASE, "catalog.lookup", {}, { fetch }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("NETWORK");
    expect(error.httpStatus).toBeNull();
  });

  test("lipsa răspunsului în timp util devine TIMEOUT", async () => {
    const { fetch } = hangingFetch();

    const error = await rejection(trpcQuery(BASE, "catalog.lookup", {}, { fetch, timeoutMs: 20 }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("TIMEOUT");
  });

  test.each([
    ["corp care nu este JSON", () => new Response("not json", { status: 200 })],
    ["corp gol", () => new Response("", { status: 200 })],
    ["JSON fără result", () => json({ hello: "world" })],
    ["result fără data", () => json({ result: {} })],
    ["JSON care nu este obiect", () => json([1, 2, 3])],
  ])("%s cu stare 200 devine BAD_RESPONSE", async (_name, respond) => {
    const { fetch } = mockFetch(respond);

    const error = await rejection(trpcQuery(BASE, "catalog.lookup", {}, { fetch }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("BAD_RESPONSE");
  });
});

describe("parseRetryAfter", () => {
  test.each([
    ["1", 1],
    ["30", 30],
    [" 45 ", 45],
    ["600", 600],
    ["601", 600],
    ["99999", 600],
    ["999999999", 600],
  ])("%p -> %p secunde", (header, expected) => {
    expect(parseRetryAfter(header)).toBe(expected);
  });

  test.each([
    [null, "lipsă"],
    [undefined, "nedefinit"],
    ["", "gol"],
    ["0", "zero"],
    ["-5", "negativ"],
    ["1.5", "zecimal"],
    ["abc", "text"],
    ["30s", "cu sufix"],
    ["Wed, 21 Oct 2026 07:28:00 GMT", "dată HTTP"],
    ["1234567890", "mai mult de 9 cifre"],
    [30, "număr, nu șir"],
  ])("%p (%s) -> 60 de secunde", (header) => {
    expect(parseRetryAfter(header)).toBe(60);
  });
});

describe("getSession", () => {
  test("întoarce utilizatorul conectat și cere cookie-uri", async () => {
    const { fetch, calls } = mockFetch(() =>
      json({ session: { id: "s" }, user: { id: "u", name: "Ana", email: "ana@example.com" } })
    );

    const user = await getSession(BASE, { fetch });

    expect(user).toEqual({ name: "Ana", email: "ana@example.com" });
    expect(calls[0].url).toBe(`${BASE}/api/auth/get-session`);
    expect(calls[0].init.credentials).toBe("include");
  });

  test.each([
    ["null", () => json(null)],
    ["corp gol", () => new Response("", { status: 200 })],
    ["fără user", () => json({ session: null })],
    ["401", () => new Response("", { status: 401 })],
  ])("întoarce null pentru %s", async (_name, respond) => {
    const { fetch } = mockFetch(respond);

    expect(await getSession(BASE, { fetch })).toBeNull();
  });

  test("câmpuri lipsă din user devin șiruri goale", async () => {
    const { fetch } = mockFetch(() => json({ user: { id: "u" } }));

    expect(await getSession(BASE, { fetch })).toEqual({ name: "", email: "" });
  });

  test("500 devine SERVER, corp invalid devine BAD_RESPONSE", async () => {
    const server = mockFetch(() => new Response("oops", { status: 500 }));
    const garbage = mockFetch(() => new Response("{nope", { status: 200 }));

    expect((await rejection(getSession(BASE, server))).code).toBe("SERVER");
    expect((await rejection(getSession(BASE, garbage))).code).toBe("BAD_RESPONSE");
  });

  test("rețeaua căzută devine NETWORK", async () => {
    const { fetch } = mockFetch(() => {
      throw new TypeError("Failed to fetch");
    });

    expect((await rejection(getSession(BASE, { fetch }))).code).toBe("NETWORK");
  });
});

describe("healthCheck", () => {
  test("întoarce true când serverul răspunde OK", async () => {
    const { fetch, calls } = mockFetch(() => json({ result: { data: "OK" } }));

    expect(await healthCheck(BASE, { fetch })).toBe(true);
    expect(calls[0].url).toBe(`${BASE}/trpc/healthCheck`);
  });

  test("un alt răspuns înseamnă că nu este un server PretPilot", async () => {
    const { fetch } = mockFetch(() => json({ result: { data: "altceva" } }));

    expect((await rejection(healthCheck(BASE, { fetch }))).code).toBe("BAD_RESPONSE");
  });

  test("propagă timeout-ul", async () => {
    const { fetch } = hangingFetch();

    expect((await rejection(healthCheck(BASE, { fetch, timeoutMs: 20 }))).code).toBe("TIMEOUT");
  });
});
