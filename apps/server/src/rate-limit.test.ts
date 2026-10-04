import { describe, expect, spyOn, test } from "bun:test";

import { trpcServer } from "@hono/trpc-server";
import { TRPCError, initTRPC } from "@trpc/server";
import { TRPC_ERROR_CODES_BY_KEY } from "@trpc/server/rpc";
import { type Context, Hono } from "hono";

import {
  MAX_TRPC_BATCH_SIZE,
  MAX_TRPC_BODY_BYTES,
  countTrpcNamespaceCalls,
  countTrpcProcedureCalls,
  createRateLimiter,
  logTrpcError,
  trpcBodyLimit,
  trpcRateLimit,
} from "./rate-limit";

function clock(start = 1_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe("createRateLimiter", () => {
  test("allows requests up to the limit and blocks the rest", () => {
    const time = clock();
    const limiter = createRateLimiter({
      limit: 3,
      windowMs: 60_000,
      now: time.now,
    });

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a")).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  test("reports the time left until the window ends, rounded up", () => {
    const time = clock();
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      now: time.now,
    });

    limiter.check("a");
    time.advance(20_500);

    expect(limiter.check("a")).toEqual({ allowed: false, retryAfterSeconds: 40 });

    time.advance(39_000);
    expect(limiter.check("a").retryAfterSeconds).toBe(1);
  });

  test("starts a new window once the previous one has ended", () => {
    const time = clock();
    const limiter = createRateLimiter({
      limit: 2,
      windowMs: 60_000,
      now: time.now,
    });

    limiter.check("a");
    limiter.check("a");
    expect(limiter.check("a").allowed).toBe(false);

    time.advance(59_999);
    expect(limiter.check("a").allowed).toBe(false);

    time.advance(1);
    expect(limiter.check("a")).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });

  test("does not extend the window when requests are blocked", () => {
    const time = clock();
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 10_000,
      now: time.now,
    });

    limiter.check("a");
    for (let i = 0; i < 5; i++) {
      time.advance(1000);
      expect(limiter.check("a").allowed).toBe(false);
    }

    time.advance(5000);
    expect(limiter.check("a").allowed).toBe(true);
  });

  test("keeps a separate count per key", () => {
    const time = clock();
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      now: time.now,
    });

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(false);
    expect(limiter.check("c").allowed).toBe(true);
  });

  test("drops expired windows so the map does not grow forever", () => {
    const time = clock();
    const limiter = createRateLimiter({
      limit: 5,
      windowMs: 60_000,
      now: time.now,
    });

    for (let i = 0; i < 100; i++) {
      limiter.check(`client-${i}`);
    }
    expect(limiter.size).toBe(100);

    time.advance(60_000);
    limiter.check("fresh");

    expect(limiter.size).toBe(1);
  });

  test("keeps windows that are still running when it cleans up", () => {
    const time = clock();
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      now: time.now,
    });

    limiter.check("old");
    time.advance(30_000);
    limiter.check("recent");
    time.advance(30_000);
    limiter.check("trigger");

    expect(limiter.size).toBe(2);
    expect(limiter.check("recent").allowed).toBe(false);
    expect(limiter.check("old").allowed).toBe(true);
  });

  test("charges a request by its cost, so a batched call cannot slip past the limit", () => {
    const time = clock();
    const limiter = createRateLimiter({
      limit: 10,
      windowMs: 60_000,
      now: time.now,
    });

    expect(limiter.check("a", 6).allowed).toBe(true);
    expect(limiter.check("a", 5).allowed).toBe(false);
    expect(limiter.check("a", 4).allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b", 11).allowed).toBe(false);
  });

  test("caps the number of tracked keys, evicting the window that expires first", () => {
    const time = clock();
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      maxKeys: 3,
      now: time.now,
    });

    for (let i = 0; i < 100; i++) {
      limiter.check(`client-${i}`);
      time.advance(1);
    }
    expect(limiter.size).toBe(3);

    expect(limiter.check("client-99").allowed).toBe(false);
    expect(limiter.check("client-98").allowed).toBe(false);
    expect(limiter.check("client-0").allowed).toBe(true);
    expect(limiter.size).toBe(3);
  });

  test("uses the real clock by default", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });
});

// Adresa completă, cum o dă serverul (c.req.url).
const at = (path: string) => `http://localhost${path}`;

describe("countTrpcNamespaceCalls", () => {
  const count = (path: string) => countTrpcNamespaceCalls(at(path), "catalog");

  test("counts a single call to the namespace", () => {
    expect(count("/trpc/catalog.search")).toBe(1);
    expect(count("/trpc/catalog.compare")).toBe(1);
  });

  test("counts batched calls, wherever the catalog procedure is", () => {
    expect(count("/trpc/catalog.search,product.history")).toBe(1);
    expect(count("/trpc/product.history,catalog.compare")).toBe(1);
  });

  test("counts every repeated call, so batching cannot multiply the limit", () => {
    expect(count("/trpc/catalog.search,catalog.search,catalog.search")).toBe(3);
    expect(
      count("/trpc/catalog.search,product.history,catalog.compare,cart.list")
    ).toBe(2);
  });

  test("counts encoded paths", () => {
    expect(count("/trpc/product.history%2Ccatalog.compare")).toBe(1);
    expect(count("/trpc/catalog%2Esearch")).toBe(1);
    expect(count("/trpc/catalog.search%2Ccatalog.search")).toBe(2);
  });

  test("counts paths with dot segments, which tRPC resolves but Hono does not", () => {
    expect(count("/trpc/./catalog.search")).toBe(1);
    expect(count("/trpc/x/../catalog.search")).toBe(1);
    expect(count("/trpc/%2e/catalog.search")).toBe(1);
    expect(count("/trpc/%2E%2E/trpc/catalog.search")).toBe(1);
    expect(count("/trpc/./catalog.search,catalog.compare")).toBe(2);
    expect(count("/trpc/x/%2e%2E/catalog.search%2Ccatalog.search")).toBe(2);
  });

  test("counts what tRPC resolves even when the resolved path loses the /trpc prefix", () => {
    // tRPC taie lungimea endpoint-ului fără să verifice prefixul: "/abcd/catalog.search" rezolvă tot catalog.search
    expect(count("/trpc/../abcd/catalog.search")).toBe(1);
    expect(count("/trpc/../abcd/catalog.search,catalog.search")).toBe(2);
  });

  test("counts a path with a trailing slash", () => {
    expect(count("/trpc/catalog.search/")).toBe(1);
  });

  test("ignores other procedures and namespaces with a similar name", () => {
    expect(count("/trpc/product.history")).toBe(0);
    expect(count("/trpc/cart.list,broker.getSettings")).toBe(0);
    expect(count("/trpc/catalogs.list")).toBe(0);
    expect(count("/trpc/product.catalog.list")).toBe(0);
  });

  test("ignores an empty procedure path", () => {
    expect(count("/")).toBe(0);
    expect(count("/trpc")).toBe(0);
    expect(count("/trpc/")).toBe(0);
  });

  test("falls back to the raw path when it is not valid percent-encoding, without throwing", () => {
    expect(count("/trpc/catalog.search%zz")).toBe(1);
    expect(count("/trpc/catalog.search%")).toBe(1);
    expect(count("/trpc/%E0%A4%A,catalog.search")).toBe(1);
    expect(count("/trpc/product.list%zz")).toBe(0);
    expect(count("/trpc/%zz.catalog.search")).toBe(0);
  });

  test("does not throw on a value that is not a URL", () => {
    expect(countTrpcNamespaceCalls("not a url", "catalog")).toBe(0);
    expect(countTrpcNamespaceCalls("", "catalog")).toBe(0);
  });
});

describe("countTrpcProcedureCalls", () => {
  const count = (path: string) =>
    countTrpcProcedureCalls(at(path), "product.ingestPrice");

  test("counts a single call", () => {
    expect(count("/trpc/product.ingestPrice")).toBe(1);
  });

  test("counts every call in a batch, wherever it is and however often it repeats", () => {
    expect(count("/trpc/catalog.search,product.ingestPrice")).toBe(1);
    expect(
      count(
        "/trpc/product.ingestPrice,product.history,product.ingestPrice,product.ingestPrice"
      )
    ).toBe(3);
  });

  test("matches the whole procedure name only", () => {
    expect(count("/trpc/product.ingestPrice2")).toBe(0);
    expect(count("/trpc/product.ingestPriceX")).toBe(0);
    expect(count("/trpc/xproduct.ingestPrice")).toBe(0);
    expect(count("/trpc/product.ingest")).toBe(0);
    expect(count("/trpc/product.ingestprice")).toBe(0);
    expect(count("/trpc/product.history")).toBe(0);
  });

  test("counts encoded paths, dot segments and a trailing slash", () => {
    expect(count("/trpc/product%2EingestPrice")).toBe(1);
    expect(count("/trpc/product.history%2Cproduct.ingestPrice")).toBe(1);
    expect(count("/trpc/./product.ingestPrice")).toBe(1);
    expect(count("/trpc/x/../product.ingestPrice")).toBe(1);
    expect(count("/trpc/%2e/product.ingestPrice")).toBe(1);
    expect(count("/trpc/../abcd/product.ingestPrice")).toBe(1);
    expect(count("/trpc/product.ingestPrice/")).toBe(1);
  });

  test("does not throw on malformed encodings", () => {
    expect(count("/trpc/product.ingestPrice%zz")).toBe(0);
    expect(count("/trpc/product.ingestPrice%zz,product.ingestPrice")).toBe(1);
    expect(countTrpcProcedureCalls("not a url", "product.ingestPrice")).toBe(0);
  });
});

// O cerere cu adresa exact cum a sosit, fără normalizarea pe care o face `new Request`: un server poate da
// aplicației adresa nenormalizată, iar tRPC o normalizează abia singur cu `new URL`.
function rawRequest(url: string): Request {
  return {
    url,
    method: "GET",
    headers: new Headers(),
    signal: new AbortController().signal,
  } as unknown as Request;
}

describe("trpcRateLimit", () => {
  function setup(limit: number) {
    const time = clock();
    const catalogLimiter = createRateLimiter({
      limit,
      windowMs: 60_000,
      now: time.now,
    });
    const ingestLimiter = createRateLimiter({
      limit,
      windowMs: 60_000,
      now: time.now,
    });
    const clientKey = (c: Context) => c.req.header("x-client") ?? "anonymous";

    const app = new Hono();
    app.use(
      "/trpc/*",
      trpcRateLimit({
        limiter: catalogLimiter,
        countCalls: (url) => countTrpcNamespaceCalls(url, "catalog"),
        message: "Prea multe căutări.",
        clientKey,
      })
    );
    app.use(
      "/trpc/*",
      trpcRateLimit({
        limiter: ingestLimiter,
        countCalls: (url) => countTrpcProcedureCalls(url, "product.ingestPrice"),
        message: "Prea multe prețuri.",
        clientKey,
      })
    );
    app.all("/trpc/*", (c) => c.text("ok"));

    const status = async (path: string, client = "a") => {
      const request = new Request(at(path), { headers: { "x-client": client } });
      return (await app.request(request)).status;
    };
    return { app, time, status };
  }

  test("answers 429 in the shape of a tRPC error, with Retry-After and a Romanian message", async () => {
    const { app, time } = setup(2);
    const call = () => app.request(at("/trpc/catalog.search"));

    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    time.advance(20_000);
    const blocked = await call();

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("40");
    expect(await blocked.json()).toEqual({
      error: {
        message: "Prea multe căutări.",
        code: -32_029,
        data: { code: "TOO_MANY_REQUESTS", httpStatus: 429 },
      },
    });
  });

  test("uses the message of the limiter that blocked the request", async () => {
    const { app } = setup(1);
    const ingest = () => app.request(at("/trpc/product.ingestPrice"));

    await ingest();
    const blocked = await ingest();

    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({
      error: { message: "Prea multe prețuri." },
    });
  });

  test("charges a batch one call per matching procedure", async () => {
    const { status } = setup(3);

    expect(await status("/trpc/catalog.search,catalog.search,product.history")).toBe(200);
    expect(await status("/trpc/catalog.search,catalog.search")).toBe(429);
    expect(await status("/trpc/catalog.search")).toBe(200);
    expect(await status("/trpc/catalog.search")).toBe(429);
  });

  test("keeps the catalog and the ingest budgets apart", async () => {
    const { status } = setup(1);

    expect(await status("/trpc/product.ingestPrice")).toBe(200);
    expect(await status("/trpc/product.ingestPrice")).toBe(429);
    expect(await status("/trpc/catalog.search")).toBe(200);
    expect(await status("/trpc/catalog.search")).toBe(429);
  });

  test("does not touch procedures outside both limits", async () => {
    const { status } = setup(1);

    for (let i = 0; i < 5; i++) {
      expect(await status("/trpc/product.history")).toBe(200);
      expect(await status("/trpc/cart.list,broker.getSettings")).toBe(200);
    }
  });

  test("keeps a separate budget per client", async () => {
    const { status } = setup(1);

    expect(await status("/trpc/catalog.search", "a")).toBe(200);
    expect(await status("/trpc/catalog.search", "a")).toBe(429);
    expect(await status("/trpc/catalog.search", "b")).toBe(200);
  });

  test("a new window opens once the previous one has ended", async () => {
    const { status, time } = setup(1);

    await status("/trpc/product.ingestPrice");
    expect(await status("/trpc/product.ingestPrice")).toBe(429);
    time.advance(60_000);
    expect(await status("/trpc/product.ingestPrice")).toBe(200);
  });

  test("limits a request whose path Hono and tRPC read differently", async () => {
    const { app } = setup(1);
    const send = async (url: string) => (await app.fetch(rawRequest(url))).status;

    // Hono ar vedea "/trpc/./catalog.search" și ar lăsa cererea să treacă; tRPC o rezolvă ca "catalog.search"
    expect(await send(at("/trpc/./catalog.search"))).toBe(200);
    expect(await send(at("/trpc/x/../catalog.search"))).toBe(429);
    expect(await send(at("/trpc/%2e/catalog.search"))).toBe(429);
    expect(await send(at("/trpc/../abcd/catalog.search"))).toBe(429);
    expect(await send(at("/trpc/./product.ingestPrice"))).toBe(200);
    expect(await send(at("/trpc/%2e/product.ingestPrice"))).toBe(429);
  });
});

// Calea cu tRPC adevărat: limitatorul trebuie să numere cel puțin fiecare procedură pe care o execută tRPC.
describe("the limiter reads the same procedures as tRPC", () => {
  const executed: string[] = [];
  const t = initTRPC.create();
  const record = (name: string) =>
    t.procedure.query(() => {
      executed.push(name);
      return name;
    });
  const router = t.router({
    catalog: t.router({
      search: record("catalog.search"),
      compare: record("catalog.compare"),
    }),
    product: t.router({
      ingestPrice: record("product.ingestPrice"),
      history: record("product.history"),
    }),
    ping: record("ping"),
  });
  const app = new Hono();
  app.use(
    "/trpc/*",
    trpcServer({ endpoint: "/trpc", router, maxBatchSize: MAX_TRPC_BATCH_SIZE })
  );

  async function run(path: string) {
    executed.length = 0;
    const response = await app.fetch(rawRequest(at(path)));
    return { response, executed: [...executed] };
  }

  const cases: [string, string[]][] = [
    ["/trpc/catalog.search", ["catalog.search"]],
    ["/trpc/./catalog.search", ["catalog.search"]],
    ["/trpc/x/../catalog.search", ["catalog.search"]],
    ["/trpc/%2e/catalog.search", ["catalog.search"]],
    ["/trpc/../abcd/catalog.search", ["catalog.search"]],
    ["/trpc/catalog.search/", ["catalog.search"]],
    ["/trpc/catalog%2Esearch", ["catalog.search"]],
    ["/trpc/./product.ingestPrice", ["product.ingestPrice"]],
    ["/trpc/product.ingestPrice/", ["product.ingestPrice"]],
    [
      "/trpc/catalog.search,product.ingestPrice?batch=1",
      ["catalog.search", "product.ingestPrice"],
    ],
    [
      "/trpc/catalog.search%2Cproduct.ingestPrice?batch=1",
      ["catalog.search", "product.ingestPrice"],
    ],
    [
      "/trpc/./catalog.search,catalog.compare,product.ingestPrice,product.ingestPrice?batch=1",
      [
        "catalog.search",
        "catalog.compare",
        "product.ingestPrice",
        "product.ingestPrice",
      ],
    ],
    [
      "/trpc/../abcd/catalog.search,catalog.search,product.ingestPrice?batch=1",
      ["catalog.search", "catalog.search", "product.ingestPrice"],
    ],
    // fără batch=1, o virgulă nu desparte procedurile: tRPC nu execută nimic, limitatorul poate număra în plus
    ["/trpc/catalog.search,catalog.search", []],
    // codificare invalidă: tRPC o respinge
    ["/trpc/catalog.search%zz", []],
  ];

  for (const [path, expected] of cases) {
    test(`${path}`, async () => {
      const result = await run(path);
      expect(result.executed.toSorted()).toEqual(expected.toSorted());

      for (const name of new Set(expected)) {
        const times = expected.filter((item) => item === name).length;
        expect(countTrpcProcedureCalls(at(path), name)).toBeGreaterThanOrEqual(times);
      }
      const catalogCalls = expected.filter((name) => name.startsWith("catalog.")).length;
      expect(countTrpcNamespaceCalls(at(path), "catalog")).toBeGreaterThanOrEqual(
        catalogCalls
      );
    });
  }

  const batch = (size: number) =>
    `/trpc/${Array.from({ length: size }, () => "ping").join(",")}?batch=1`;

  test(`a batch of ${MAX_TRPC_BATCH_SIZE} calls runs`, async () => {
    const result = await run(batch(MAX_TRPC_BATCH_SIZE));

    expect(result.response.status).toBe(200);
    expect(result.executed).toHaveLength(MAX_TRPC_BATCH_SIZE);
  });

  test(`a batch of ${MAX_TRPC_BATCH_SIZE + 1} calls is refused with BAD_REQUEST and runs nothing`, async () => {
    const result = await run(batch(MAX_TRPC_BATCH_SIZE + 1));

    expect(result.response.status).toBe(400);
    expect(result.executed).toEqual([]);
    expect(JSON.stringify(await result.response.json())).toContain("BAD_REQUEST");
  });
});

// Un lot de apeluri product.ingestPrice, ca extensia: corpul este {"0": {...}, "1": {...}}.
const ingestInput = (n: number) => ({
  store: "emag",
  externalId: `DHDY3T3B${n}`,
  title: "Solid State Drive (SSD) Western Digital Green SN3000 NVMe SSD, 2TB",
  url: "https://www.emag.ro/solid-state-drive-ssd-western-digital-green-sn3000-nvme-ssd-2tb-wds200t4g0e/pd/DHDY3T3BM/",
  imageUrl:
    "https://s13emagst.akamaized.net/products/92444/92443593/images/res_1cde77ae7fac3c60da93cd5d891bc2ff.jpg",
  mpn: "WDS200T4G0E",
  price: 149_077,
  currency: "RON",
  inStock: true,
});
const batchBody = (inputs: unknown[]) =>
  JSON.stringify(Object.fromEntries(inputs.map((input, index) => [index, input])));
const batchPath = (size: number) =>
  `/trpc/${Array.from({ length: size }, () => "product.ingestPrice").join(",")}?batch=1`;

// POST cu corpul dat; `duplex` cere Bun când corpul este un flux.
function post(
  path: string,
  body: string | ReadableStream<Uint8Array>,
  headers: Record<string, string> = {}
) {
  return new Request(at(path), {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
    duplex: "half",
  } as RequestInit);
}

// Un flux fără Content-Length din `chunks` bucăți de `chunkBytes` octeți (spații, adică JSON valid);
// `state.pulled` numără bucățile pe care consumatorul le-a cerut efectiv.
function chunkedBody(chunkBytes: number, chunks: number) {
  const state = { pulled: 0 };
  const chunk = new Uint8Array(chunkBytes).fill(32);
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (state.pulled === chunks) {
          controller.close();
          return;
        }
        state.pulled += 1;
        controller.enqueue(chunk);
      },
    },
    { highWaterMark: 0 }
  );
  return { stream, state };
}

describe("trpcBodyLimit", () => {
  function setup() {
    const received: unknown[] = [];
    const t = initTRPC.create();
    const router = t.router({
      ping: t.procedure.query(() => "pong"),
      product: t.router({
        ingestPrice: t.procedure
          .input((raw: unknown) => raw as Record<string, unknown>)
          .mutation(({ input }) => {
            received.push(input);
            return { changed: true };
          }),
      }),
    });
    const app = new Hono();
    app.use("/trpc/*", trpcBodyLimit());
    app.use(
      "/trpc/*",
      trpcServer({ endpoint: "/trpc", router, maxBatchSize: MAX_TRPC_BATCH_SIZE })
    );
    return { app, received };
  }

  const tooLarge = {
    error: {
      message: "Cerere prea mare.",
      code: TRPC_ERROR_CODES_BY_KEY.PAYLOAD_TOO_LARGE,
      data: { code: "PAYLOAD_TOO_LARGE", httpStatus: 413 },
    },
  };

  test("answers 413 in the shape of a tRPC error when Content-Length is over the cap, without reading the body", async () => {
    const { app, received } = setup();
    const { stream, state } = chunkedBody(1024, 1000);

    const response = await app.fetch(
      post("/trpc/product.ingestPrice", stream, {
        "content-length": String(MAX_TRPC_BODY_BYTES + 1),
      })
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual(tooLarge);
    expect(state.pulled).toBe(0);
    expect(received).toEqual([]);
  });

  test("enforces the cap on the streamed bytes when there is no Content-Length, and stops reading", async () => {
    const { app, received } = setup();
    // 100 MiB în bucăți de 64 KiB
    const { stream, state } = chunkedBody(64 * 1024, 1600);

    const response = await app.fetch(post("/trpc/product.ingestPrice", stream));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual(tooLarge);
    // cele 4 bucăți de 64 KiB încap, a 5-a trece de plafon; restul fluxului nu se mai citește
    expect(state.pulled).toBeLessThanOrEqual(6);
    expect(received).toEqual([]);
  });

  test("an oversize body is refused before any JSON parsing", async () => {
    const { app, received } = setup();
    const parse = spyOn(JSON, "parse");

    try {
      const response = await app.fetch(
        post("/trpc/product.ingestPrice", "[".repeat(MAX_TRPC_BODY_BYTES + 1))
      );

      expect(response.status).toBe(413);
      expect(parse).not.toHaveBeenCalled();
      expect(received).toEqual([]);
    } finally {
      parse.mockRestore();
    }
  });

  test("a body of exactly the cap passes, one byte more does not (with and without Content-Length)", async () => {
    const { app, received } = setup();
    const padded = (bytes: number) => {
      const body = batchBody([ingestInput(0)]);
      return body + " ".repeat(bytes - body.length);
    };
    const path = batchPath(1);

    const exact = padded(MAX_TRPC_BODY_BYTES);
    expect((await app.fetch(post(path, exact))).status).toBe(200);
    expect(
      (await app.fetch(post(path, exact, { "content-length": String(exact.length) }))).status
    ).toBe(200);
    expect(received).toHaveLength(2);

    const over = padded(MAX_TRPC_BODY_BYTES + 1);
    expect((await app.fetch(post(path, over))).status).toBe(413);
    expect(
      (await app.fetch(post(path, over, { "content-length": String(over.length) }))).status
    ).toBe(413);
    expect(received).toHaveLength(2);
  });

  test("a normal batch of 20 price observations passes and every call runs", async () => {
    const { app, received } = setup();
    const inputs = Array.from({ length: MAX_TRPC_BATCH_SIZE }, (_, n) => ingestInput(n));

    const response = await app.fetch(post(batchPath(inputs.length), batchBody(inputs)));

    expect(response.status).toBe(200);
    expect(received).toEqual(inputs);
    const results = (await response.json()) as { result: { data: unknown } }[];
    expect(results.map((item) => item.result.data)).toEqual(
      inputs.map(() => ({ changed: true }))
    );
  });

  test("even a batch of 20 observations with every field at its maximum fits with room to spare", async () => {
    const { app, received } = setup();
    const worst = {
      ...ingestInput(0),
      externalId: "x".repeat(128),
      title: "t".repeat(300),
      url: `https://www.emag.ro/${"a".repeat(2000)}`,
      imageUrl: `https://cdn.example.com/${"b".repeat(2000)}`,
      ean: "1".repeat(64),
      mpn: "M".repeat(128),
    };
    const body = batchBody(Array.from({ length: MAX_TRPC_BATCH_SIZE }, () => worst));

    expect(Buffer.byteLength(body)).toBeLessThan(MAX_TRPC_BODY_BYTES / 2);
    expect((await app.fetch(post(batchPath(MAX_TRPC_BATCH_SIZE), body))).status).toBe(200);
    expect(received).toHaveLength(MAX_TRPC_BATCH_SIZE);
  });

  test("a small streamed body without Content-Length still reaches tRPC", async () => {
    const { app, received } = setup();
    const bytes = new TextEncoder().encode(batchBody([ingestInput(1)]));
    const half = Math.floor(bytes.length / 2);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, half));
        controller.enqueue(bytes.slice(half));
        controller.close();
      },
    });

    const response = await app.fetch(post(batchPath(1), stream));

    expect(response.status).toBe(200);
    expect(received).toEqual([ingestInput(1)]);
  });

  test("requests without a body are not touched", async () => {
    const { app } = setup();

    const response = await app.request(at("/trpc/ping"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: { data: "pong" } });
  });

  test("an oversize request does not use up the rate-limit budget", async () => {
    const time = clock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: time.now });
    const app = new Hono();
    app.use("/trpc/*", trpcBodyLimit());
    app.use(
      "/trpc/*",
      trpcRateLimit({
        limiter,
        countCalls: (url) => countTrpcProcedureCalls(url, "product.ingestPrice"),
        message: "Prea multe prețuri.",
        clientKey: () => "a",
      })
    );
    app.all("/trpc/*", (c) => c.text("ok"));
    const send = async (body: string) =>
      (await app.fetch(post("/trpc/product.ingestPrice", body))).status;

    for (let i = 0; i < 3; i++) {
      expect(await send("x".repeat(MAX_TRPC_BODY_BYTES + 1))).toBe(413);
    }
    expect(await send("{}")).toBe(200);
    expect(await send("{}")).toBe(429);
  });
});

describe("logTrpcError", () => {
  function setup() {
    const t = initTRPC.create();
    const router = t.router({
      product: t.router({
        ingestPrice: t.procedure
          .input((raw: unknown) => raw as Record<string, unknown>)
          .mutation(() => {
            throw new Error('Failed query: insert into "products" ("id") values ($1)');
          }),
        history: t.procedure.query(() => {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid input" });
        }),
      }),
      private: t.procedure.query(() => {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
      }),
    });
    const app = new Hono();
    app.use("/trpc/*", trpcServer({ endpoint: "/trpc", router, onError: logTrpcError }));
    return app;
  }

  test("logs the real cause of an internal error with its code and procedure, and nothing from the request", async () => {
    const errors = spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await setup().fetch(
        post("/trpc/product.ingestPrice", JSON.stringify({ secretField: "hunter2" }), {
          cookie: "better-auth.session_token=abc123",
          authorization: "Bearer topsecret",
        })
      );

      expect(response.status).toBe(500);
      expect(errors).toHaveBeenCalledTimes(1);
      expect(errors.mock.calls[0]).toEqual([
        "Eroare tRPC",
        {
          code: "INTERNAL_SERVER_ERROR",
          path: "product.ingestPrice",
          message: 'Failed query: insert into "products" ("id") values ($1)',
        },
      ]);
      const logged = JSON.stringify(errors.mock.calls);
      for (const secret of ["hunter2", "abc123", "topsecret"]) {
        expect(logged).not.toContain(secret);
      }
    } finally {
      errors.mockRestore();
    }
  });

  test("client errors are not logged", async () => {
    const errors = spyOn(console, "error").mockImplementation(() => {});

    try {
      const app = setup();
      expect((await app.request(at("/trpc/product.history"))).status).toBe(400);
      expect((await app.request(at("/trpc/private"))).status).toBe(401);
      expect((await app.request(at("/trpc/missing"))).status).toBe(404);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  test("falls back to a placeholder when tRPC has no procedure path", () => {
    const errors = spyOn(console, "error").mockImplementation(() => {});

    try {
      logTrpcError({
        error: new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "boom" }),
        path: undefined,
      });

      expect(errors.mock.calls[0]).toEqual([
        "Eroare tRPC",
        { code: "INTERNAL_SERVER_ERROR", path: "necunoscută", message: "boom" },
      ]);
    } finally {
      errors.mockRestore();
    }
  });
});

describe("the web client batches at most as many calls as the server accepts", () => {
  test("httpBatchLink maxItems in apps/web is MAX_TRPC_BATCH_SIZE", async () => {
    const source = await Bun.file(
      new URL("../../web/src/utils/trpc.ts", import.meta.url)
    ).text();
    const [, maxItems] = /maxItems:\s*(\d+)/.exec(source) ?? [];

    expect(Number(maxItems)).toBe(MAX_TRPC_BATCH_SIZE);
  });
});
