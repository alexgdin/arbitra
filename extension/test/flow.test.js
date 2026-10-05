// Fluxul complet, fără rețea și fără browser: extractorul real citește paginile din fixtures/,
// service worker-ul real primește observația printr-un chrome fals, iar fetch-ul este simulat.
// Se verifică contractul dintre piese: ce se trimite la API, ce se întoarce paginii, ce se memorează.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import extract from "../src/extract.js";
import { DEDUPE_WINDOW_MS } from "../src/logic.js";
import overlay from "../src/overlay.js";
import altex from "./fixtures/altex.json";
import emag from "./fixtures/emag.json";
import pcgarage from "./fixtures/pcgarage.json";
import { json, mockApi, ok, tooManyRequests, unauthorized } from "./helpers/fake-api.js";
import { EXTENSION_ID, createFakeChrome } from "./helpers/fake-chrome.js";
import { docFromFixture } from "./helpers/fake-page.js";

const API = "http://localhost:3000";
const WEB = "http://localhost:3001";
const TAB_ID = 11;

/** Ce trebuie să primească product.ingestPrice pentru fiecare pagină (identificatorii incluși). */
const EMAG_PAYLOAD = {
  store: "emag",
  externalId: "DHDY3T3BM",
  title: "Solid State Drive (SSD) Western Digital Green SN3000 NVMe SSD, 2TB",
  url: "https://www.emag.ro/solid-state-drive-ssd-western-digital-green-sn3000-nvme-ssd-2tb-wds200t4g0e/pd/DHDY3T3BM/",
  imageUrl:
    "https://s13emagst.akamaized.net/products/92444/92443593/images/res_1cde77ae7fac3c60da93cd5d891bc2ff.jpg?width=80&height=80&hash=07367DF28B712DF51405D77AFAE7C405",
  mpn: "WDS200T4G0E",
  price: 149_077,
  currency: "RON",
  inStock: true,
};

const ALTEX_PAYLOAD = {
  store: "altex",
  externalId: "SSDWDS200T4G0E",
  title: "Solid-State Drive (SSD) WESTERN DIGITAL Green SN3000, 2TB, PCIe Gen 4, M.2 PCIe, WDS200T4G0E",
  url: "https://altex.ro/solid-state-drive-ssd-western-digital-green-sn3000-2tb-pcie-gen-4-m-2-pcie-wds200t4g0e/cpd/SSDWDS200T4G0E/",
  imageUrl: "https://lcdn.altex.ro/media/catalog/product/w/d/wd_green_sn3000_nvme_ssd_01_2c0054a1.jpg",
  ean: "718037904610",
  mpn: "WDS200T4G0E",
  price: 119_999,
  currency: "RON",
  inStock: true,
};

const PCGARAGE_PAYLOAD = {
  store: "pcgarage",
  externalId: "3202727",
  title: "SSD WD SanDisk Green SN3000 1TB PCI Express 4.0 x4 M.2 2280",
  url: "https://www.pcgarage.ro/ssd/wd-sandisk/green-sn3000-1tb-pci-express-40-x4-m2-2280/",
  imageUrl:
    "https://www.pcgarage.ro/images/products/1/6151/3202727/normal/wds200t4g0e-00cps0-211020a99265e913ede088891019f249.jpg",
  mpn: "WDS100T4G0E",
  price: 73_999,
  currency: "RON",
  inStock: true,
};

const CHECKED_AT = "2026-10-04T10:00:00.000Z";

/** @param {string} store @param {number} price */
const catalogOffer = (store, price) => ({
  productId: `p-${store}`,
  store,
  price,
  inStock: true,
  url: `https://example.test/${store}`,
  lastCheckedAt: CHECKED_AT,
});

/** Același SSD de 2 TB găsit în eMAG și Altex (după codul de model, deși eMAG nu are EAN). */
const SSD_2TB = {
  key: "mpn:WDS200T4G0E",
  representativeProductId: "p-altex",
  title: "SSD WD Green SN3000 2TB",
  ean: "718037904610",
  imageUrl: null,
  currency: "RON",
  offers: [catalogOffer("altex", 119_999), catalogOffer("emag", 149_077)],
  bestOffer: { productId: "p-altex", store: "altex", price: 119_999 },
  maxPrice: 149_077,
  savings: 29_078,
  lastCheckedAt: CHECKED_AT,
};

const PAGES = [
  { name: "eMAG", fixture: emag, payload: EMAG_PAYLOAD, item: SSD_2TB, badge: "1" },
  { name: "Altex", fixture: altex, payload: ALTEX_PAYLOAD, item: SSD_2TB, badge: "" },
  // alt produs (1 TB): nu este cunoscut în alte magazine
  { name: "PC Garage", fixture: pcgarage, payload: PCGARAGE_PAYLOAD, item: null, badge: "" },
];

const OBSERVE_KEYS = ["error", "ingested", "item", "ok", "state", "webUrl"];
const CATALOG_ITEM_KEYS = [
  "bestOffer",
  "currency",
  "ean",
  "imageUrl",
  "key",
  "lastCheckedAt",
  "maxPrice",
  "offers",
  "representativeProductId",
  "savings",
  "title",
];
const CATALOG_OFFER_KEYS = ["inStock", "lastCheckedAt", "price", "productId", "store", "url"];

const fake = createFakeChrome();
const savedGlobals = {};
const GLOBALS = [
  "chrome",
  "fetch",
  "document",
  "window",
  "location",
  "PretPilotExtract",
  "PretPilotOverlay",
  "setTimeout",
  "clearTimeout",
];
let contentLoads = 0;

/** Observația extrasă de extractorul real dintr-o pagină capturată. */
function extractFrom(fixture) {
  const observation = extract.extractObservation(docFromFixture(fixture), fixture.href);
  expect(observation).not.toBeNull();
  return observation;
}

/** Trimite observația ca un content script al paginii ei. */
function observe(observation) {
  return fake.sendMessage(
    { type: "pretpilot:observe", observation },
    { id: EXTENSION_ID, tab: { id: TAB_ID }, url: observation.url }
  );
}

/** Copie a paginii capturate, cu alt preț în ofertă. */
function withPrice(fixture, price) {
  const copy = structuredClone(fixture);
  const product = copy.ldBlocks.find((block) => block["@type"] === "Product");
  product.offers.price = price;
  copy.domPriceText = "";
  return copy;
}

/** Copie a paginii capturate, cu altă monedă în ofertă. */
function withCurrency(fixture, priceCurrency) {
  const copy = structuredClone(fixture);
  const product = copy.ldBlocks.find((block) => block["@type"] === "Product");
  product.offers.priceCurrency = priceCurrency;
  return copy;
}

/** Contractul răspunsului la pretpilot:observe, verificat câmp cu câmp. */
function expectObserveContract(response) {
  expect(Object.keys(response).every((key) => OBSERVE_KEYS.includes(key))).toBe(true);
  expect(typeof response.ok).toBe("boolean");
  expect(["ok", "logged-out", "disabled", "ignored", "error"]).toContain(response.state);
  expect(response.ok).toBe(response.state !== "error");
  expect(typeof response.webUrl).toBe("string");

  if (response.ingested !== null) {
    expect(Object.keys(response.ingested).sort()).toEqual(["changed", "previousPrice"]);
    expect(typeof response.ingested.changed).toBe("boolean");
    expect(response.ingested.previousPrice === null || Number.isInteger(response.ingested.previousPrice)).toBe(true);
  }
  if (response.item !== null) {
    expect(Object.keys(response.item).sort()).toEqual(CATALOG_ITEM_KEYS);
    for (const offer of response.item.offers) {
      expect(Object.keys(offer).sort()).toEqual(CATALOG_OFFER_KEYS);
    }
  }
  if (response.error !== undefined) {
    expect(typeof response.error).toBe("string");
  }
}

beforeAll(async () => {
  // service worker-ul își înregistrează listener-ul la import, deci chrome-ul fals trebuie să existe deja
  savedGlobals.chrome = globalThis.chrome;
  globalThis.chrome = fake.chrome;
  await import("../src/background.js?flow");
});

beforeEach(() => {
  for (const name of GLOBALS) {
    savedGlobals[name] = globalThis[name];
  }
  globalThis.chrome = fake.chrome;
  fake.data.clear();
  fake.badges.clear();
});

afterEach(() => {
  for (const name of GLOBALS) {
    if (savedGlobals[name] === undefined) {
      delete globalThis[name];
    } else {
      globalThis[name] = savedGlobals[name];
    }
  }
  delete fake.chrome.runtime.sendMessage;
});

afterAll(() => {
  globalThis.chrome = savedGlobals.chrome;
});

describe("observă -> trimite -> caută", () => {
  test.each(PAGES)("$name: ingestPrice o dată cu datele exacte, apoi lookup", async ({ fixture, payload, item, badge }) => {
    const calls = mockApi({
      "POST product.ingestPrice": () => ok({ productId: "p-1", changed: true, previousPrice: null }),
      "GET catalog.lookup": () => ok(item),
    });

    const observation = extractFrom(fixture);
    expect(observation).toEqual(payload);
    const response = await observe(observation);

    expect(calls.map((call) => call.key)).toEqual(["POST product.ingestPrice", "GET catalog.lookup"]);

    const [ingest, lookup] = calls;
    expect(ingest.url).toBe(`${API}/trpc/product.ingestPrice`);
    expect(ingest.init.method).toBe("POST");
    expect(ingest.init.headers).toEqual({ "content-type": "application/json" });
    expect(ingest.init.credentials).toBe("include");
    expect(ingest.body).toEqual(payload);
    // exact aceleași câmpuri: fără ean pe eMAG (codul "gtin" de acolo este codul de model) și PC Garage
    expect(Object.keys(ingest.body).sort()).toEqual(Object.keys(payload).sort());

    const lookupInput = { store: payload.store, externalId: payload.externalId };
    expect(lookup.url).toBe(`${API}/trpc/catalog.lookup?input=${encodeURIComponent(JSON.stringify(lookupInput))}`);
    expect(lookup.init.method).toBe("GET");
    expect(lookup.init.credentials).toBe("include");

    expectObserveContract(response);
    expect(response).toEqual({
      ok: true,
      state: "ok",
      ingested: { changed: true, previousPrice: null },
      item,
      webUrl: WEB,
    });
    expect(fake.badges.get(TAB_ID)?.text).toBe(badge);
  });

  test("eMAG și Altex trimit același cod de model, PC Garage altul", async () => {
    const calls = mockApi({
      "POST product.ingestPrice": () => ok({ productId: "p", changed: true, previousPrice: null }),
      "GET catalog.lookup": () => ok(null),
    });

    for (const { fixture } of PAGES) {
      await observe(extractFrom(fixture));
    }

    const [emagBody, altexBody, pcgarageBody] = calls.filter((call) => call.key === "POST product.ingestPrice").map((call) => call.body);
    expect(emagBody.mpn).toBe(altexBody.mpn);
    expect(pcgarageBody.mpn).not.toBe(altexBody.mpn);
    expect(altexBody.ean).toBe("718037904610");
    expect(emagBody).not.toHaveProperty("ean");
  });

  test("memorează trimiterea și produsul pentru popup", async () => {
    mockApi({
      "POST product.ingestPrice": () => ok({ productId: "p", changed: true, previousPrice: 155_000 }),
      "GET catalog.lookup": () => ok(SSD_2TB),
    });

    await observe(extractFrom(emag));

    expect(fake.data.get("seen:emag:DHDY3T3BM")).toMatchObject({ price: 149_077 });
    const { recent } = await fake.sendMessage(
      { type: "pretpilot:status" },
      { id: EXTENSION_ID, url: `chrome-extension://${EXTENSION_ID}/popup.html` }
    );
    expect(recent).toEqual([
      { at: expect.any(Number), store: "emag", title: EMAG_PAYLOAD.title, price: 149_077, changed: true },
    ]);
  });
});

describe("deduplicarea trimiterilor", () => {
  const routes = () => ({
    "POST product.ingestPrice": () => ok({ productId: "p-1", changed: false, previousPrice: 149_077 }),
    "GET catalog.lookup": () => ok(SSD_2TB),
  });

  test("a doua observație în 6 ore nu mai face POST, dar caută din nou", async () => {
    const calls = mockApi(routes());
    const observation = extractFrom(emag);

    await observe(observation);
    const second = await observe(observation);

    expect(calls.filter((call) => call.key === "POST product.ingestPrice")).toHaveLength(1);
    expect(calls.filter((call) => call.key === "GET catalog.lookup")).toHaveLength(2);
    expectObserveContract(second);
    expect(second).toEqual({ ok: true, state: "ok", ingested: null, item: SSD_2TB, webUrl: WEB });
  });

  test("preț schimbat pe pagină: trimite din nou, cu prețul nou", async () => {
    const calls = mockApi(routes());

    await observe(extractFrom(emag));
    const cheaper = await observe(extractFrom(withPrice(emag, "1450.00")));

    const posts = calls.filter((call) => call.key === "POST product.ingestPrice");
    expect(posts.map((call) => call.body.price)).toEqual([149_077, 145_000]);
    expectObserveContract(cheaper);
    expect(cheaper.ingested).toEqual({ changed: false, previousPrice: 149_077 });
  });

  test("după 6 ore trimite din nou chiar cu același preț", async () => {
    const calls = mockApi(routes());
    const observation = extractFrom(emag);

    await observe(observation);
    fake.data.set("seen:emag:DHDY3T3BM", { price: 149_077, at: Date.now() - DEDUPE_WINDOW_MS - 1000 });
    await observe(observation);

    expect(calls.filter((call) => call.key === "POST product.ingestPrice")).toHaveLength(2);
  });
});

describe("utilizator deconectat", () => {
  test.each(PAGES)("$name: 401 la trimitere, comparația merge, starea este logged-out", async ({ fixture, item }) => {
    const calls = mockApi({
      "POST product.ingestPrice": unauthorized,
      "GET catalog.lookup": () => ok(item),
    });

    const response = await observe(extractFrom(fixture));

    expect(calls.map((call) => call.key)).toEqual(["POST product.ingestPrice", "GET catalog.lookup"]);
    expectObserveContract(response);
    expect(response).toEqual({ ok: true, state: "logged-out", ingested: null, item, webUrl: WEB });
    expect(response).not.toHaveProperty("error");
    // fără cont nu se memorează nimic, ca prețul să fie trimis imediat după conectare
    expect([...fake.data.keys()].filter((key) => key.startsWith("seen:") || key === "recent")).toEqual([]);
  });

  test("după conectare, următoarea observație trimite prețul", async () => {
    let loggedIn = false;
    const calls = mockApi({
      "POST product.ingestPrice": () =>
        loggedIn ? ok({ productId: "p-1", changed: true, previousPrice: null }) : unauthorized(),
      "GET catalog.lookup": () => ok(SSD_2TB),
    });
    const observation = extractFrom(emag);

    expect((await observe(observation)).state).toBe("logged-out");
    loggedIn = true;
    const response = await observe(observation);

    expect(calls.filter((call) => call.key === "POST product.ingestPrice")).toHaveLength(2);
    expect(response).toMatchObject({ state: "ok", ingested: { changed: true, previousPrice: null } });
  });
});

describe("căi de eroare", () => {
  test("extensia oprită: nicio cerere", async () => {
    fake.data.set("settings", { enabled: false });
    const calls = mockApi({});

    const response = await observe(extractFrom(emag));

    expectObserveContract(response);
    expect(response).toEqual({ ok: true, state: "disabled", ingested: null, item: null, webUrl: WEB });
    expect(calls).toHaveLength(0);
  });

  test("serverul nu răspunde: eroare în română, fără a doua cerere", async () => {
    const calls = mockApi({});

    const response = await observe(extractFrom(altex));

    expectObserveContract(response);
    expect(response).toMatchObject({ ok: false, state: "error", ingested: null, item: null });
    expect(response.error).toBe("Nu mă pot conecta la serverul Arbitra.");
    expect(calls).toHaveLength(1);
  });

  test("lookup cu eroare de server: eroare, dar prețul trimis rămâne memorat", async () => {
    mockApi({
      "POST product.ingestPrice": () => ok({ productId: "p", changed: true, previousPrice: null }),
      "GET catalog.lookup": () =>
        json({ error: { message: "x", code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } } }, 500),
    });

    const response = await observe(extractFrom(pcgarage));

    expectObserveContract(response);
    expect(response).toMatchObject({ ok: false, state: "error", item: null });
    expect(fake.data.has("seen:pcgarage:3202727")).toBe(true);
  });
});

describe("limita serverului (429)", () => {
  test("429 la trimitere: eroare prietenoasă, o singură cerere, iar observațiile următoare nu mai pleacă", async () => {
    const calls = mockApi({
      "POST product.ingestPrice": () => tooManyRequests(120),
      "GET catalog.lookup": () => ok(SSD_2TB),
    });
    const observation = extractFrom(emag);

    const first = await observe(observation);
    const second = await observe(extractFrom(altex));

    expectObserveContract(first);
    expect(first).toMatchObject({ ok: false, state: "error", item: null });
    expect(first.error).toBe("Prea multe cereri, încerc din nou în câteva minute.");
    expect(second).toMatchObject({ ok: false, state: "error", error: first.error });
    expect(calls.map((call) => call.key)).toEqual(["POST product.ingestPrice"]);
    expect(fake.data.get("backoffUntil")).toBeGreaterThan(Date.now() + 100_000);
  });

  test("după pauză, observația trece din nou și pauza se șterge", async () => {
    const calls = mockApi({
      "POST product.ingestPrice": () => ok({ productId: "p", changed: true, previousPrice: null }),
      "GET catalog.lookup": () => ok(SSD_2TB),
    });
    fake.data.set("backoffUntil", Date.now() - 1);

    const response = await observe(extractFrom(emag));

    expectObserveContract(response);
    expect(response.state).toBe("ok");
    expect(calls).toHaveLength(2);
    expect(fake.data.has("backoffUntil")).toBe(false);
  });
});

describe("altă monedă decât RON", () => {
  test("pagina în EUR: observația se ignoră în liniște, fără cereri și fără eroare", async () => {
    const calls = mockApi({});
    const eur = withCurrency(emag, "EUR");

    const response = await observe(extractFrom(eur));

    expectObserveContract(response);
    expect(response).toEqual({ ok: true, state: "ignored", ingested: null, item: null, webUrl: WEB });
    expect(calls).toHaveLength(0);
  });
});

describe("pagină -> content script -> service worker -> panou", () => {
  /** Încarcă content.js proaspăt, pe o pagină falsă dintr-un fixture, cu extractorul și service worker-ul reale. */
  async function openPage(fixture) {
    const rendered = [];
    const sender = { id: EXTENSION_ID, tab: { id: TAB_ID }, url: fixture.href };
    fake.chrome.runtime.sendMessage = (message) => fake.sendMessage(message, sender);

    globalThis.location = { href: fixture.href };
    globalThis.document = { ...docFromFixture(fixture), addEventListener() {} };
    globalThis.window = { addEventListener() {}, navigation: { addEventListener() {} } };
    globalThis.PretPilotExtract = extract;
    // panoul real desenează în DOM; aici se păstrează doar ce ar afișa
    globalThis.PretPilotOverlay = {
      render: (view) => rendered.push(overlay.buildViewModel(view)),
      remove() {},
    };
    // verificările periodice ale paginii nu trebuie să ruleze în test
    globalThis.setTimeout = () => 1;
    globalThis.clearTimeout = () => {};

    contentLoads += 1;
    await import(`../src/content.js?flow=${contentLoads}`);
    for (let attempt = 0; attempt < 100 && rendered.length === 0; attempt += 1) {
      await Bun.sleep(5);
    }
    return rendered;
  }

  test("eMAG: panoul arată oferta mai ieftină de la Altex", async () => {
    const calls = mockApi({
      "POST product.ingestPrice": () => ok({ productId: "p-1", changed: true, previousPrice: null }),
      "GET catalog.lookup": () => ok(SSD_2TB),
    });

    const rendered = await openPage(emag);

    expect(calls.map((call) => call.key)).toEqual(["POST product.ingestPrice", "GET catalog.lookup"]);
    expect(rendered).toHaveLength(1);
    const [model] = rendered;
    expect(model).toMatchObject({ state: "ok", cheaperCount: 1, isCheapest: false, showLoginHint: false });
    expect(model.rows).toHaveLength(1);
    expect(model.rows[0]).toMatchObject({ storeName: "Altex", tone: "better", comparable: true });
    expect(model.rows[0].diffText.replaceAll(" ", " ")).toBe("-290,78 RON");
    // linkurile duc către rutele existente în aplicația web
    expect(model.searchHref).toBe(`${WEB}/cauta?q=${encodeURIComponent(EMAG_PAYLOAD.title)}`);
    expect(model.loginHref).toBe(`${WEB}/login`);
    expect(fake.badges.get(TAB_ID)?.text).toBe("1");
  });

  test("Altex, deconectat: panoul arată comparația și invitația de conectare", async () => {
    mockApi({
      "POST product.ingestPrice": unauthorized,
      "GET catalog.lookup": () => ok(SSD_2TB),
    });

    const [model] = await openPage(altex);

    expect(model).toMatchObject({ state: "logged-out", showLoginHint: true, cheaperCount: 0, isCheapest: true });
    expect(model.rows.map((row) => row.storeName)).toEqual(["eMAG"]);
  });
});
