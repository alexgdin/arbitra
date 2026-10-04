// Montajul real din index.ts: ordinea middleware-urilor pe /trpc (plafonul corpului, limitatoarele, tRPC) și
// jurnalul erorilor. Modulele care cer baza de date și mediul sunt înlocuite; routerul este unul de test.

import { afterAll, describe, expect, mock, spyOn, test } from "bun:test";

import { initTRPC } from "@trpc/server";

import { MAX_TRPC_BODY_BYTES } from "./rate-limit";

const t = initTRPC.create();
const executed: string[] = [];
const record = (name: string) =>
  t.procedure
    .input((raw: unknown) => raw)
    .query(() => {
      executed.push(name);
      return name;
    });
const router = t.router({
  catalog: t.router({ search: record("catalog.search") }),
  product: t.router({
    ingestPrice: record("product.ingestPrice"),
    history: record("product.history"),
  }),
  cart: t.router({ optimize: record("cart.optimize") }),
  boom: t.procedure.query(() => {
    throw new Error('Failed query: select * from "products" where "id" = $1');
  }),
});

mock.module("./env.server", () => ({
  ENV: { CORS_ORIGIN: "http://localhost:3001" },
}));
mock.module("./services", () => ({
  db: {},
  auth: {
    handler: () => new Response("auth"),
    api: { getSession: () => Promise.resolve(null) },
  },
}));
mock.module("@my-better-t-app/api/routers/index", () => ({ appRouter: router }));

// logger() din Hono scrie câte o linie pe cerere cu console.log luat la import, deci spionul trebuie pus înainte
const log = spyOn(console, "log").mockImplementation(() => {});
const { default: app } = await import("./index");

let nextClient = 0;
// Fiecare test primește o adresă proprie, ca bugetele limitatoarelor (care trăiesc cât procesul) să nu se amestece.
function newClient() {
  nextClient += 1;
  const server = {
    requestIP: () => ({ address: `10.0.0.${nextClient}`, family: "IPv4", port: 1 }),
  };
  return (path: string, init?: RequestInit) =>
    app.fetch(new Request(`http://localhost${path}`, init), server);
}

const optimizeBatch = (size: number) =>
  `/trpc/${Array.from({ length: size }, () => "cart.optimize").join(",")}?batch=1`;

afterAll(() => {
  log.mockRestore();
});

describe("index.ts: limitele pe /trpc", () => {
  test("cart.optimize: 30 de apeluri pe minut, apoi 429 cu Retry-After în forma unei erori tRPC", async () => {
    const send = newClient();

    for (let i = 0; i < 30; i++) {
      expect((await send("/trpc/cart.optimize")).status).toBe(200);
    }
    const blocked = await send("/trpc/cart.optimize");

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(Number(blocked.headers.get("Retry-After"))).toBeLessThanOrEqual(60);
    expect(await blocked.json()).toEqual({
      error: {
        message:
          "Prea multe optimizări de coș într-un timp scurt. Încearcă din nou peste câteva secunde.",
        code: -32_029,
        data: { code: "TOO_MANY_REQUESTS", httpStatus: 429 },
      },
    });
  });

  test("cart.optimize: un apel grupat plătește câte un apel pe procedură, cu aceeași regulă ca la celelalte limite", async () => {
    const send = newClient();

    expect((await send(optimizeBatch(20))).status).toBe(200);
    expect((await send(optimizeBatch(11))).status).toBe(429);
    expect((await send(optimizeBatch(10))).status).toBe(200);
    expect((await send("/trpc/cart.optimize")).status).toBe(429);
    // celelalte două bugete nu s-au atins
    expect((await send("/trpc/catalog.search")).status).toBe(200);
    expect((await send("/trpc/product.ingestPrice")).status).toBe(200);
    // un alt client are buget propriu
    expect((await newClient()("/trpc/cart.optimize")).status).toBe(200);
  });

  test("cele trei bugete sunt separate: catalog 90, trimitere de prețuri 120, optimizare 30", async () => {
    const send = newClient();
    const statuses = async (path: string, count: number) => {
      const results: number[] = [];
      for (let i = 0; i < count; i++) {
        results.push((await send(path)).status);
      }
      return results;
    };

    expect(new Set(await statuses("/trpc/catalog.search", 90))).toEqual(new Set([200]));
    expect((await send("/trpc/catalog.search")).status).toBe(429);
    expect(new Set(await statuses("/trpc/product.ingestPrice", 120))).toEqual(new Set([200]));
    expect((await send("/trpc/product.ingestPrice")).status).toBe(429);
    expect((await send("/trpc/cart.optimize")).status).toBe(200);
  });

  test("procedurile din afara limitelor nu se numără", async () => {
    const send = newClient();

    for (let i = 0; i < 150; i++) {
      expect((await send("/trpc/product.history")).status).toBe(200);
    }
  });
});

describe("index.ts: plafonul corpului", () => {
  const oversize = () => "x".repeat(MAX_TRPC_BODY_BYTES + 1);
  const post = (path: string, body: string, headers: Record<string, string> = {}) => ({
    path,
    init: { method: "POST", body, headers },
  });

  test("o cerere prea mare primește 413 înaintea limitatoarelor și a lui tRPC", async () => {
    const send = newClient();
    executed.length = 0;

    for (let i = 0; i < 200; i++) {
      const { path, init } = post("/trpc/product.ingestPrice", oversize());
      const response = await send(path, init);
      expect(response.status).toBe(413);
    }

    // 200 de cereri refuzate nu au consumat din bugetul de 120 și nu au rulat nimic
    expect(executed).toEqual([]);
    expect((await send("/trpc/product.ingestPrice")).status).toBe(200);
    const { path, init } = post("/trpc/product.ingestPrice", oversize());
    expect(await (await send(path, init)).json()).toEqual({
      error: {
        message: "Cerere prea mare.",
        code: -32_013,
        data: { code: "PAYLOAD_TOO_LARGE", httpStatus: 413 },
      },
    });
  });

  test("Content-Length peste plafon se refuză fără să citească corpul", async () => {
    const send = newClient();

    const response = await send("/trpc/cart.optimize", {
      method: "POST",
      body: "{}",
      headers: { "content-length": String(MAX_TRPC_BODY_BYTES + 1) },
    });

    expect(response.status).toBe(413);
  });

  test("un apel obișnuit trece, iar plafonul nu se aplică în afara /trpc", async () => {
    const send = newClient();

    expect((await send("/trpc/catalog.search?input=%7B%7D")).status).toBe(200);
    expect(await (await send("/")).text()).toBe("OK");
    const auth = await send("/api/auth/sign-in/email", {
      method: "POST",
      body: oversize(),
    });
    expect(await auth.text()).toBe("auth");
  });
});

describe("index.ts: jurnalul erorilor", () => {
  test("o eroare internă ajunge în jurnal cu codul, procedura și cauza reală", async () => {
    const errors = spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await newClient()("/trpc/boom", {
        headers: { cookie: "better-auth.session_token=abc123" },
      });

      expect(response.status).toBe(500);
      expect(errors).toHaveBeenCalledWith("Eroare tRPC", {
        code: "INTERNAL_SERVER_ERROR",
        path: "boom",
        message: 'Failed query: select * from "products" where "id" = $1',
      });
      expect(JSON.stringify(errors.mock.calls)).not.toContain("abc123");
    } finally {
      errors.mockRestore();
    }
  });
});
