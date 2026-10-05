import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";

import { DEDUPE_WINDOW_MS } from "../src/logic.js";
import { pruneSeen } from "../src/store.js";
import { json, mockApi, ok, tooManyRequests, unauthorized } from "./helpers/fake-api.js";
import { EXTENSION_ID, createFakeChrome } from "./helpers/fake-chrome.js";

// service worker-ul își înregistrează listener-ul la import, deci chrome-ul fals trebuie să existe înainte
const fake = createFakeChrome();
const originalChrome = globalThis.chrome;
const originalFetch = globalThis.fetch;
globalThis.chrome = fake.chrome;
await import("../src/background.js");

const API = "http://localhost:3000";
const TAB_ID = 7;

const OBSERVATION = {
  store: "emag",
  externalId: "DHDY3T3BM",
  title: "Solid State Drive (SSD) Western Digital Green SN3000 NVMe SSD, 2TB",
  url: "https://www.emag.ro/solid-state-drive-ssd-western-digital-green-sn3000-nvme-ssd-2tb-wds200t4g0e/pd/DHDY3T3BM/",
  mpn: "WDS200T4G0E",
  price: 149_077,
  currency: "RON",
  inStock: true,
};

const PAGE_SENDER = { id: EXTENSION_ID, tab: { id: TAB_ID }, url: OBSERVATION.url };
const POPUP_SENDER = { id: EXTENSION_ID, url: `chrome-extension://${EXTENSION_ID}/popup.html` };
const OPTIONS_SENDER = {
  id: EXTENSION_ID,
  tab: { id: 99 },
  url: `chrome-extension://${EXTENSION_ID}/options.html`,
};

const CATALOG_ITEM = {
  key: "ean:718037904610",
  representativeProductId: "p-altex",
  title: "SSD WD Green SN3000 2TB",
  ean: "718037904610",
  imageUrl: null,
  currency: "RON",
  offers: [
    {
      productId: "p-altex",
      store: "altex",
      price: 119_999,
      inStock: true,
      url: "https://altex.ro/ssd/cpd/SSDWDS200T4G0E/",
      lastCheckedAt: "2026-10-04T10:00:00.000Z",
    },
    {
      productId: "p-emag",
      store: "emag",
      price: 149_077,
      inStock: true,
      url: OBSERVATION.url,
      lastCheckedAt: "2026-10-04T10:00:00.000Z",
    },
  ],
  bestOffer: { productId: "p-altex", store: "altex", price: 119_999 },
  maxPrice: 149_077,
  savings: 29_078,
  lastCheckedAt: "2026-10-04T10:00:00.000Z",
};

const serverError = () =>
  json({ error: { message: "Boom", code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } } }, 500);

const observe = (observation = OBSERVATION, sender = PAGE_SENDER) =>
  fake.sendMessage({ type: "pretpilot:observe", observation }, sender);

const seenEntry = () => fake.data.get("seen:emag:DHDY3T3BM");

beforeEach(() => {
  fake.data.clear();
  fake.badges.clear();
  fake.permission.granted = true;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

afterAll(() => {
  globalThis.chrome = originalChrome;
});

describe("pretpilot:observe", () => {
  test("dezactivat: nu face nicio cerere și curăță insigna", async () => {
    fake.data.set("settings", { enabled: false });
    const calls = mockApi({});

    const response = await observe();

    expect(response).toEqual({ ok: true, state: "disabled", ingested: null, item: null, webUrl: "http://localhost:3001" });
    expect(calls).toHaveLength(0);
    expect(fake.badges.get(TAB_ID)?.text).toBe("");
  });

  test("conectat: trimite prețul, caută produsul și pune insigna", async () => {
    const calls = mockApi({
      "POST product.ingestPrice": () => ok({ productId: "p-emag", changed: true, previousPrice: 155_000 }),
      "GET catalog.lookup": () => ok(CATALOG_ITEM),
    });
    const before = Date.now();

    const response = await observe();

    expect(response.ok).toBe(true);
    expect(response.state).toBe("ok");
    expect(response.ingested).toEqual({ changed: true, previousPrice: 155_000 });
    expect(response.item).toEqual(CATALOG_ITEM);
    expect(response.webUrl).toBe("http://localhost:3001");
    expect(response).not.toHaveProperty("error");

    // ordinea contează: întâi trimiterea, apoi căutarea
    expect(calls.map((call) => call.key)).toEqual(["POST product.ingestPrice", "GET catalog.lookup"]);
    expect(calls[0].body).toEqual(OBSERVATION);
    expect(calls[0].init.credentials).toBe("include");
    expect(calls[1].input).toEqual({ store: "emag", externalId: "DHDY3T3BM" });

    expect(fake.badges.get(TAB_ID)).toEqual({ text: "1", color: "#0f766e", textColor: "#ffffff" });
    expect(seenEntry().price).toBe(149_077);
    expect(seenEntry().at).toBeGreaterThanOrEqual(before);
    const [recent] = (await fake.sendMessage({ type: "pretpilot:status" }, POPUP_SENDER)).recent;
    expect(recent).toMatchObject({ store: "emag", title: OBSERVATION.title, price: 149_077, changed: true });
  });

  test("același preț în fereastra de 6 ore: nu mai trimite, dar caută din nou", async () => {
    fake.data.set("seen:emag:DHDY3T3BM", { price: 149_077, at: Date.now() - 60_000 });
    const calls = mockApi({ "GET catalog.lookup": () => ok(CATALOG_ITEM) });

    const response = await observe();

    expect(calls.map((call) => call.key)).toEqual(["GET catalog.lookup"]);
    expect(response).toMatchObject({ ok: true, state: "ok", ingested: null });
    expect(response.item).toEqual(CATALOG_ITEM);
  });

  test("preț schimbat: trimite din nou", async () => {
    fake.data.set("seen:emag:DHDY3T3BM", { price: 150_000, at: Date.now() - 60_000 });
    const calls = mockApi({
      "POST product.ingestPrice": () => ok({ productId: "p", changed: true, previousPrice: 150_000 }),
      "GET catalog.lookup": () => ok(null),
    });

    await observe();

    expect(calls.map((call) => call.key)).toEqual(["POST product.ingestPrice", "GET catalog.lookup"]);
    expect(seenEntry().price).toBe(149_077);
  });

  test("după 6 ore trimite din nou chiar cu același preț", async () => {
    fake.data.set("seen:emag:DHDY3T3BM", { price: 149_077, at: Date.now() - DEDUPE_WINDOW_MS - 1000 });
    const calls = mockApi({
      "POST product.ingestPrice": () => ok({ productId: "p", changed: false, previousPrice: 149_077 }),
      "GET catalog.lookup": () => ok(null),
    });

    const response = await observe();

    expect(calls.map((call) => call.key)).toContain("POST product.ingestPrice");
    expect(response.ingested).toEqual({ changed: false, previousPrice: 149_077 });
  });

  test("produs necunoscut: item null, fără insignă", async () => {
    mockApi({
      "POST product.ingestPrice": () => ok({ productId: "p", changed: true, previousPrice: null }),
      "GET catalog.lookup": () => ok(null),
    });

    const response = await observe();

    expect(response).toMatchObject({ ok: true, state: "ok", item: null });
    expect(fake.badges.get(TAB_ID)?.text).toBe("");
  });

  test("deconectat: starea logged-out, comparația merge, nimic nu se memorează", async () => {
    mockApi({
      "POST product.ingestPrice": unauthorized,
      "GET catalog.lookup": () => ok(CATALOG_ITEM),
    });

    const response = await observe();

    expect(response).toMatchObject({ ok: true, state: "logged-out", ingested: null });
    expect(response.item).toEqual(CATALOG_ITEM);
    expect(fake.badges.get(TAB_ID)?.text).toBe("1");
    expect(seenEntry()).toBeUndefined();
    expect(fake.data.has("recent")).toBe(false);
  });

  test("trimiterea eșuează cu 500 dar căutarea merge: starea rămâne ok", async () => {
    mockApi({
      "POST product.ingestPrice": serverError,
      "GET catalog.lookup": () => ok(CATALOG_ITEM),
    });

    const response = await observe();

    expect(response).toMatchObject({ ok: true, state: "ok", ingested: null });
    expect(response.item).toEqual(CATALOG_ITEM);
    expect(seenEntry()).toBeUndefined();
  });

  test("serverul nu răspunde: eroare, iar căutarea nu mai este încercată", async () => {
    const calls = mockApi({});

    const response = await observe();

    expect(calls).toHaveLength(1);
    expect(response).toMatchObject({ ok: false, state: "error", ingested: null, item: null });
    expect(response.error).toContain("Nu mă pot conecta");
    expect(fake.badges.get(TAB_ID)?.text).toBe("");
  });

  test("trimiterea reușește dar căutarea eșuează: eroare, dar prețul rămâne memorat", async () => {
    mockApi({
      "POST product.ingestPrice": () => ok({ productId: "p", changed: true, previousPrice: null }),
      "GET catalog.lookup": serverError,
    });

    const response = await observe();

    expect(response).toMatchObject({ ok: false, state: "error", item: null });
    expect(response.error).toBe("Eroare de server (HTTP 500).");
    expect(seenEntry()).toBeDefined();
  });

  test("răspuns de căutare cu formă greșită este eroare", async () => {
    mockApi({
      "POST product.ingestPrice": () => ok({ productId: "p", changed: true, previousPrice: null }),
      "GET catalog.lookup": () => ok({ nu: "un catalog" }),
    });

    const response = await observe();

    expect(response).toMatchObject({ ok: false, state: "error" });
    expect(response.error).toContain("răspuns neașteptat");
  });

  test.each([
    ["preț cu zecimale", { ...OBSERVATION, price: 1490.77 }],
    ["magazin necunoscut", { ...OBSERVATION, store: "evomag" }],
    ["URL javascript:", { ...OBSERVATION, url: "javascript:alert(1)" }],
    ["null", null],
  ])("observație invalidă (%s): eroare fără cereri", async (_name, observation) => {
    const calls = mockApi({});

    const response = await observe(observation);

    expect(response).toMatchObject({ ok: false, state: "error", item: null });
    expect(response.error).toBe("Observația primită nu este validă.");
    expect(calls).toHaveLength(0);
  });

  test("expeditor de pe alt domeniu decât magazinul observației este respins", async () => {
    const calls = mockApi({});

    const response = await observe(OBSERVATION, { ...PAGE_SENDER, url: "https://www.altex.ro/x/cpd/Y/" });

    expect(response).toMatchObject({ ok: false, state: "error" });
    expect(calls).toHaveLength(0);
  });

  test("o pagină a extensiei nu poate trimite observații", async () => {
    const calls = mockApi({});

    const response = await observe(OBSERVATION, POPUP_SENDER);

    expect(response).toMatchObject({ ok: false, state: "error" });
    expect(calls).toHaveLength(0);
  });

  test("setări personalizate: folosește adresele configurate", async () => {
    fake.data.set("settings", { apiBase: "https://api.pretpilot.ro/", webBase: "https://pretpilot.ro/", enabled: true });
    const calls = mockApi({
      "POST product.ingestPrice": () => ok({ productId: "p", changed: false, previousPrice: null }),
      "GET catalog.lookup": () => ok(null),
    });

    const response = await observe();

    expect(calls[0].url).toStartWith("https://api.pretpilot.ro/trpc/product.ingestPrice");
    expect(response.webUrl).toBe("https://pretpilot.ro");
  });

  test("insigna numără doar ofertele în stoc și mai ieftine din alte magazine", async () => {
    const cheaper = { ...CATALOG_ITEM.offers[0] };
    mockApi({
      "POST product.ingestPrice": () => ok({ productId: "p", changed: false, previousPrice: null }),
      "GET catalog.lookup": () =>
        ok({
          ...CATALOG_ITEM,
          offers: [
            cheaper,
            { ...cheaper, productId: "x1", price: 130_000 },
            { ...cheaper, productId: "x2", price: 100_000, inStock: false },
            { ...cheaper, productId: "x3", price: 160_000 },
            CATALOG_ITEM.offers[1],
          ],
        }),
    });

    await observe();

    expect(fake.badges.get(TAB_ID)?.text).toBe("2");
  });
});

describe("pretpilot:observe: moneda", () => {
  test.each(["EUR", "USD", "eur"])("%s: observația se ignoră în liniște, fără cereri și fără eroare", async (currency) => {
    const calls = mockApi({});
    fake.badges.set(TAB_ID, { text: "3", color: "", textColor: "" });

    const response = await observe({ ...OBSERVATION, currency });

    expect(response).toEqual({ ok: true, state: "ignored", ingested: null, item: null, webUrl: "http://localhost:3001" });
    expect(response).not.toHaveProperty("error");
    expect(calls).toHaveLength(0);
    expect(fake.badges.get(TAB_ID)?.text).toBe("");
    expect(seenEntry()).toBeUndefined();
  });

  test("o monedă fără sens (nu are 3 litere) rămâne eroare de observație invalidă", async () => {
    mockApi({});

    const response = await observe({ ...OBSERVATION, currency: "RO" });

    expect(response).toMatchObject({ ok: false, state: "error", error: "Observația primită nu este validă." });
  });
});

describe("pretpilot:observe: 429 și Retry-After", () => {
  const BACKOFF_MESSAGE = "Prea multe cereri, încerc din nou în câteva minute.";
  const backoffUntil = () => fake.data.get("backoffUntil");

  test("429 la trimitere: eroare prietenoasă, fără căutare, pauza se salvează după Retry-After", async () => {
    const calls = mockApi({
      "POST product.ingestPrice": () => tooManyRequests(90),
      "GET catalog.lookup": () => ok(CATALOG_ITEM),
    });
    const before = Date.now();

    const response = await observe();

    expect(response).toMatchObject({ ok: false, state: "error", ingested: null, item: null, error: BACKOFF_MESSAGE });
    expect(calls.map((call) => call.key)).toEqual(["POST product.ingestPrice"]);
    expect(backoffUntil()).toBeGreaterThanOrEqual(before + 90_000);
    expect(backoffUntil()).toBeLessThanOrEqual(Date.now() + 90_000);
    expect(seenEntry()).toBeUndefined();
    expect(fake.data.has("recent")).toBe(false);
    expect(fake.badges.get(TAB_ID)?.text).toBe("");
  });

  test("429 la căutare: eroare, pauza se salvează, dar prețul trimis rămâne memorat", async () => {
    mockApi({
      "POST product.ingestPrice": () => ok({ productId: "p", changed: true, previousPrice: null }),
      "GET catalog.lookup": () => tooManyRequests(30),
    });
    const before = Date.now();

    const response = await observe();

    expect(response).toMatchObject({ ok: false, state: "error", error: BACKOFF_MESSAGE });
    expect(backoffUntil()).toBeGreaterThanOrEqual(before + 30_000);
    expect(seenEntry()).toBeDefined();
  });

  test("până trece pauza, nicio cerere nu pleacă (nici trimitere, nici căutare), iar mesajul rămâne", async () => {
    fake.data.set("backoffUntil", Date.now() + 60_000);
    const calls = mockApi({
      "POST product.ingestPrice": () => ok({ productId: "p", changed: true, previousPrice: null }),
      "GET catalog.lookup": () => ok(CATALOG_ITEM),
    });

    const first = await observe();
    const second = await observe();

    expect(calls).toHaveLength(0);
    for (const response of [first, second]) {
      expect(response).toEqual({
        ok: false,
        state: "error",
        ingested: null,
        item: null,
        webUrl: "http://localhost:3001",
        error: BACKOFF_MESSAGE,
      });
    }
    expect(seenEntry()).toBeUndefined();
    expect(fake.badges.get(TAB_ID)?.text).toBe("");
  });

  test("după pauză cererile se reiau, iar pauza salvată se șterge după un răspuns bun", async () => {
    fake.data.set("backoffUntil", Date.now() - 1000);
    const calls = mockApi({
      "POST product.ingestPrice": () => ok({ productId: "p", changed: true, previousPrice: null }),
      "GET catalog.lookup": () => ok(CATALOG_ITEM),
    });

    const response = await observe();

    expect(response).toMatchObject({ ok: true, state: "ok" });
    expect(calls.map((call) => call.key)).toEqual(["POST product.ingestPrice", "GET catalog.lookup"]);
    expect(fake.data.has("backoffUntil")).toBe(false);
  });

  test("un nou 429 după pauză o prelungește", async () => {
    fake.data.set("backoffUntil", Date.now() - 1000);
    mockApi({ "POST product.ingestPrice": () => tooManyRequests(120) });
    const before = Date.now();

    const response = await observe();

    expect(response.error).toBe(BACKOFF_MESSAGE);
    expect(backoffUntil()).toBeGreaterThanOrEqual(before + 120_000);
  });

  test("fără Retry-After pauza este de 60 de secunde, iar o valoare mare se taie la 10 minute", async () => {
    mockApi({ "POST product.ingestPrice": () => tooManyRequests() });
    let before = Date.now();
    await observe();
    expect(backoffUntil()).toBeGreaterThanOrEqual(before + 60_000);
    expect(backoffUntil()).toBeLessThanOrEqual(Date.now() + 60_000);

    fake.data.clear();
    mockApi({ "POST product.ingestPrice": () => tooManyRequests(86_400) });
    before = Date.now();
    await observe();
    expect(backoffUntil()).toBeGreaterThanOrEqual(before + 600_000);
    expect(backoffUntil()).toBeLessThanOrEqual(Date.now() + 600_000);
  });

  test("o pauză stricată sau prea îndepărtată nu oprește extensia", async () => {
    for (const stored of [Date.now() + 24 * 60 * 60 * 1000, "mâine", Number.NaN, null]) {
      fake.data.set("backoffUntil", stored);
      const calls = mockApi({
        "POST product.ingestPrice": () => ok({ productId: "p", changed: false, previousPrice: null }),
        "GET catalog.lookup": () => ok(null),
      });

      const response = await observe();

      expect(response.ok).toBe(true);
      expect(calls).toHaveLength(2);
      fake.data.delete("seen:emag:DHDY3T3BM");
    }
  });

  test("extensia oprită rămâne oprită, nu arată eroarea de pauză", async () => {
    fake.data.set("settings", { enabled: false });
    fake.data.set("backoffUntil", Date.now() + 60_000);
    mockApi({});

    expect((await observe()).state).toBe("disabled");
  });

  test("o observație invalidă primește tot eroarea de observație, nu cea de pauză", async () => {
    fake.data.set("backoffUntil", Date.now() + 60_000);
    mockApi({});

    expect((await observe({ ...OBSERVATION, price: 0 })).error).toBe("Observația primită nu este validă.");
  });

  test("fereastra extensiei și testul de conexiune nu sunt oprite de pauză", async () => {
    fake.data.set("backoffUntil", Date.now() + 60_000);
    const calls = mockApi({ "GET healthCheck": () => ok("OK"), "GET auth:get-session": () => json(null) });

    const connection = await fake.sendMessage({ type: "pretpilot:test-connection", apiBase: API }, OPTIONS_SENDER);
    const status = await fake.sendMessage({ type: "pretpilot:status" }, POPUP_SENDER);

    expect(connection.ok).toBe(true);
    expect(status.loggedIn).toBe(false);
    expect(calls).toHaveLength(2);
  });

  test("429 la testul de conexiune are tot mesajul prietenos", async () => {
    mockApi({ "GET healthCheck": () => tooManyRequests(10) });

    const response = await fake.sendMessage({ type: "pretpilot:test-connection", apiBase: API }, OPTIONS_SENDER);

    expect(response).toEqual({ ok: false, message: BACKOFF_MESSAGE });
  });
});

describe("pretpilot:status", () => {
  test("conectat: utilizatorul și ultimele produse trimise", async () => {
    fake.data.set("recent", [{ at: 5, store: "altex", title: "SSD", price: 119_999, changed: true }]);
    const calls = mockApi({
      "GET auth:get-session": () => json({ session: { id: "s" }, user: { id: "u", name: "Ana", email: "ana@example.com" } }),
    });

    const response = await fake.sendMessage({ type: "pretpilot:status" }, POPUP_SENDER);

    expect(response).toEqual({
      enabled: true,
      loggedIn: true,
      user: { name: "Ana", email: "ana@example.com" },
      apiBase: API,
      webBase: "http://localhost:3001",
      recent: [{ at: 5, store: "altex", title: "SSD", price: 119_999, changed: true }],
    });
    expect(calls[0].init.credentials).toBe("include");
  });

  test("deconectat sau cu serverul căzut: loggedIn false", async () => {
    mockApi({ "GET auth:get-session": () => json(null) });
    expect(await fake.sendMessage({ type: "pretpilot:status" }, POPUP_SENDER)).toMatchObject({
      loggedIn: false,
      user: null,
    });

    mockApi({});
    expect(await fake.sendMessage({ type: "pretpilot:status" }, OPTIONS_SENDER)).toMatchObject({
      loggedIn: false,
      user: null,
      recent: [],
    });
  });

  test("un content script nu poate cere starea", async () => {
    const calls = mockApi({});

    const response = await fake.sendMessage({ type: "pretpilot:status" }, PAGE_SENDER);

    expect(response).toMatchObject({ loggedIn: false, user: null, recent: [] });
    expect(calls).toHaveLength(0);
  });
});

describe("pretpilot:set-enabled", () => {
  test("salvează valoarea și observațiile următoare sunt dezactivate", async () => {
    const calls = mockApi({});

    expect(await fake.sendMessage({ type: "pretpilot:set-enabled", enabled: false }, POPUP_SENDER)).toEqual({
      enabled: false,
    });
    expect(fake.data.get("settings")).toMatchObject({ enabled: false });
    expect((await observe()).state).toBe("disabled");
    expect(calls).toHaveLength(0);

    expect(await fake.sendMessage({ type: "pretpilot:set-enabled", enabled: true }, POPUP_SENDER)).toEqual({
      enabled: true,
    });
  });

  test("păstrează adresele deja salvate", async () => {
    fake.data.set("settings", { apiBase: "https://api.pretpilot.ro", webBase: "https://pretpilot.ro", enabled: true });

    await fake.sendMessage({ type: "pretpilot:set-enabled", enabled: false }, POPUP_SENDER);

    expect(fake.data.get("settings")).toEqual({
      apiBase: "https://api.pretpilot.ro",
      webBase: "https://pretpilot.ro",
      enabled: false,
    });
  });

  test("un content script nu poate opri extensia", async () => {
    await fake.sendMessage({ type: "pretpilot:set-enabled", enabled: false }, PAGE_SENDER);

    expect(fake.data.has("settings")).toBe(false);
  });
});

describe("pretpilot:test-connection", () => {
  const testConnection = (apiBase) =>
    fake.sendMessage({ type: "pretpilot:test-connection", apiBase }, OPTIONS_SENDER);

  test("server în funcțiune", async () => {
    const calls = mockApi({ "GET healthCheck": () => ok("OK") });

    const response = await testConnection("http://localhost:3000/");

    expect(response).toEqual({ ok: true, message: "Conexiunea cu serverul Arbitra funcționează." });
    expect(calls[0].url).toBe(`${API}/trpc/healthCheck`);
  });

  test("adresă invalidă: mesaj fără cerere", async () => {
    const calls = mockApi({});

    const response = await testConnection("localhost:3000");

    expect(response.ok).toBe(false);
    expect(response.message).toContain("http://");
    expect(calls).toHaveLength(0);
  });

  test("server căzut", async () => {
    mockApi({});

    expect(await testConnection(API)).toEqual({ ok: false, message: "Nu mă pot conecta la serverul Arbitra." });
  });

  test("server căzut pe o adresă fără permisiune: indiciu despre permisiune", async () => {
    fake.permission.granted = false;
    mockApi({});

    const response = await testConnection("https://api.pretpilot.ro");

    expect(response.ok).toBe(false);
    expect(response.message).toContain("permisiunea");
  });

  test("alt server care răspunde altfel, sau cu eroare", async () => {
    mockApi({ "GET healthCheck": () => ok("altceva") });
    expect((await testConnection(API)).message).toContain("răspuns neașteptat");

    mockApi({ "GET healthCheck": serverError });
    expect((await testConnection(API)).message).toBe("Eroare de server (HTTP 500).");
  });
});

describe("mesaje necunoscute", () => {
  test("listener-ul nu răspunde la tipuri străine", async () => {
    expect(await fake.sendMessage({ type: "altceva" }, POPUP_SENDER)).toBeUndefined();
    expect(await fake.sendMessage(null, POPUP_SENDER)).toBeUndefined();
    expect(await fake.sendMessage({ type: "toString" }, POPUP_SENDER)).toBeUndefined();
  });
});

describe("curățarea deduplicării", () => {
  const NOW = 1_800_000_000_000;

  test("șterge intrările seen: expirate și păstrează restul", async () => {
    fake.data.set("seen:emag:old", { price: 100, at: NOW - DEDUPE_WINDOW_MS - 1 });
    fake.data.set("seen:emag:new", { price: 100, at: NOW - 1000 });
    fake.data.set("settings", { enabled: true });

    await pruneSeen(NOW);

    expect([...fake.data.keys()].sort()).toEqual(["seen:emag:new", "seenPrunedAt", "settings"]);
  });

  test("rulează cel mult o dată pe oră", async () => {
    fake.data.set("seenPrunedAt", NOW - 60_000);
    fake.data.set("seen:emag:old", { price: 100, at: NOW - DEDUPE_WINDOW_MS - 1 });

    await pruneSeen(NOW);

    expect(fake.data.has("seen:emag:old")).toBe(true);

    await pruneSeen(NOW + 61 * 60 * 1000);

    expect(fake.data.has("seen:emag:old")).toBe(false);
  });
});
