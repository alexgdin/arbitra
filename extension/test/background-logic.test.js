import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import {
  DEDUPE_WINDOW_MS,
  MAX_BACKOFF_MS,
  MAX_PRICE_BANI,
  RECENT_LIMIT,
  appendRecent,
  badgeText,
  countCheaperOffers,
  describeError,
  expiredSeenKeys,
  hasForeignCurrency,
  isBackingOff,
  isValidGtin,
  normalizeRecent,
  normalizeSeen,
  sanitizeCatalogItem,
  seenKey,
  senderMatchesStore,
  shouldSendIngest,
  validateObservation,
} from "../src/logic.js";
import {
  DEFAULT_SETTINGS,
  SettingsError,
  getSettings,
  normalizeSettings,
  saveSettings,
} from "../src/settings.js";
import { createFakeChrome } from "./helpers/fake-chrome.js";

const EMAG = {
  store: "emag",
  externalId: "DHDY3T3BM",
  title: "Solid State Drive (SSD) Western Digital Green SN3000 NVMe SSD, 2TB",
  url: "https://www.emag.ro/solid-state-drive-ssd-western-digital-green-sn3000-nvme-ssd-2tb-wds200t4g0e/pd/DHDY3T3BM/",
  imageUrl: "https://s13emagst.akamaized.net/products/92444/92443593/images/res_1cde.jpg?width=80&height=80",
  mpn: "WDS200T4G0E",
  price: 149_077,
  currency: "RON",
  inStock: true,
};

const ALTEX = {
  store: "altex",
  externalId: "SSDWDS200T4G0E",
  title: "Solid-State Drive (SSD) WESTERN DIGITAL Green SN3000, 2TB, PCIe Gen 4, M.2 PCIe, WDS200T4G0E",
  url: "https://altex.ro/solid-state-drive-ssd-western-digital-green-sn3000-2tb-pcie-gen-4-m-2-pcie-wds200t4g0e/cpd/SSDWDS200T4G0E/",
  ean: "718037904610",
  mpn: "WDS200T4G0E",
  price: 119_999,
  currency: "RON",
  inStock: true,
};

const PCGARAGE = {
  store: "pcgarage",
  externalId: "3202727",
  title: "SSD WD SanDisk Green SN3000 1TB PCI Express 4.0 x4 M.2 2280",
  url: "https://www.pcgarage.ro/ssd/wd-sandisk/green-sn3000-1tb-pci-express-40-x4-m2-2280/",
  mpn: "WDS100T4G0E00CPS0",
  price: 73_999,
  currency: "RON",
  inStock: true,
};

describe("isValidGtin", () => {
  test.each([
    ["718037904610", "GTIN-12 din Altex"],
    ["4006381333931", "EAN-13"],
    ["96385074", "EAN-8"],
    ["10012345678902", "GTIN-14"],
  ])("acceptă %s (%s)", (code) => {
    expect(isValidGtin(code)).toBe(true);
  });

  test.each([
    ["718037904611", "cifră de control greșită"],
    ["WDS200T4G0E", "codul de model pe care eMAG îl pune în gtin"],
    ["123456789", "9 cifre"],
    ["1234567890", "10 cifre"],
    ["12345678901", "11 cifre"],
    ["123456789012345", "15 cifre"],
    ["7180379046 0", "spațiu în cod"],
    ["", "gol"],
    ["0000000000000", "doar zerouri (substituent, nu cod real)"],
    [718_037_904_610, "număr, nu șir"],
  ])("respinge %p (%s)", (code) => {
    expect(isValidGtin(code)).toBe(false);
  });
});

describe("validateObservation", () => {
  test.each([
    ["eMAG", EMAG],
    ["Altex", ALTEX],
    ["PC Garage", PCGARAGE],
  ])("acceptă o observație %s și o întoarce neschimbată", (_name, observation) => {
    expect(validateObservation(observation)).toEqual(observation);
  });

  test("întoarce o copie curată, fără câmpuri necunoscute", () => {
    const result = validateObservation({
      ...ALTEX,
      cookie: "secret",
      constructor: "x",
      nested: { a: 1 },
    });

    expect(result).toEqual(ALTEX);
    expect(result).not.toHaveProperty("cookie");
    expect(result).not.toHaveProperty("nested");
  });

  test("scoate query-ul și hash-ul din URL-ul paginii", () => {
    const result = validateObservation({ ...EMAG, url: `${EMAG.url}?ref=mail&token=abc#reviews` });

    expect(result?.url).toBe(EMAG.url);
  });

  test("moneda implicită este RON, iar codul cu litere mici se ridică la majuscule", () => {
    const { currency: _omitted, ...withoutCurrency } = EMAG;

    expect(validateObservation(withoutCurrency)?.currency).toBe("RON");
    expect(validateObservation({ ...EMAG, currency: "ron" })?.currency).toBe("RON");
  });

  test("serverul primește doar RON: alte monede sunt respinse", () => {
    for (const currency of ["EUR", "eur", "USD", "HUF", "RO", "RON1", "", 1, null]) {
      expect(validateObservation({ ...EMAG, currency })).toBeNull();
    }
  });

  test("acceptă limitele prețului și le respinge pe cele din afară", () => {
    // plafonul serverului: 100.000 RON
    expect(MAX_PRICE_BANI).toBe(10_000_000);
    expect(validateObservation({ ...EMAG, price: 1 })?.price).toBe(1);
    expect(validateObservation({ ...EMAG, price: MAX_PRICE_BANI })?.price).toBe(MAX_PRICE_BANI);

    for (const price of [0, -5, 12.5, MAX_PRICE_BANI + 1, 2 ** 53, Number.NaN, Number.POSITIVE_INFINITY, "14907", null]) {
      expect(validateObservation({ ...EMAG, price })).toBeNull();
    }
  });

  test.each([
    ["null", null],
    ["șir", "emag"],
    ["listă", [EMAG]],
    ["magazin necunoscut", { ...EMAG, store: "evomag" }],
    ["magazin care nu e șir", { ...EMAG, store: ["emag"] }],
    ["externalId gol", { ...EMAG, externalId: "   " }],
    ["externalId prea lung (peste 128)", { ...EMAG, externalId: "x".repeat(129) }],
    ["externalId cu caracter de control", { ...EMAG, externalId: "DHDY\u0000T3BM" }],
    ["externalId cu tab în mijloc", { ...EMAG, externalId: "DHDY\tT3BM" }],
    ["titlu doar din caractere de control", { ...EMAG, title: "\u0000\u0001\n" }],
    ["URL cu utilizator", { ...EMAG, url: "https://evil.example@www.emag.ro/x/pd/Y/" }],
    ["URL cu utilizator și parolă", { ...EMAG, url: "https://user:pass@www.emag.ro/x/pd/Y/" }],
    ["URL cu port", { ...EMAG, url: "https://www.emag.ro:8443/x/pd/Y/" }],
    ["URL prea lung după normalizare", { ...EMAG, url: `https://www.emag.ro/${"a".repeat(2040)}` }],
    ["externalId care nu e șir", { ...EMAG, externalId: 123 }],
    ["titlu gol", { ...EMAG, title: "" }],
    ["titlu care nu e șir", { ...EMAG, title: { toString: "x" } }],
    ["inStock lipsă", { ...EMAG, inStock: undefined }],
    ["inStock ca șir", { ...EMAG, inStock: "true" }],
    ["monedă cu 2 litere", { ...EMAG, currency: "RO" }],
    ["monedă care nu e șir", { ...EMAG, currency: 1 }],
    ["URL javascript:", { ...EMAG, url: "javascript:alert(1)" }],
    ["URL data:", { ...EMAG, url: "data:text/html,x" }],
    ["URL lipsă", { ...EMAG, url: undefined }],
    ["URL de la alt magazin", { ...EMAG, url: ALTEX.url }],
    ["gazdă care doar conține domeniul", { ...EMAG, url: "https://emag.ro.evil.example/pd/X/" }],
    ["gazdă cu sufix asemănător", { ...EMAG, url: "https://notemag.ro/pd/X/" }],
  ])("respinge: %s", (_name, observation) => {
    expect(validateObservation(observation)).toBeNull();
  });

  test("trunchiază titlul prea lung la limita serverului", () => {
    const result = validateObservation({ ...EMAG, title: `  ${"a".repeat(800)}  ` });

    expect(result?.title).toHaveLength(300);
    expect(validateObservation({ ...EMAG, title: "a".repeat(300) })?.title).toHaveLength(300);
  });

  test("caracterele de control din titlu devin spații, iar capetele se taie", () => {
    const result = validateObservation({ ...EMAG, title: "\u0000SSD\u0001WD\nGreen\t2TB\u007f" });

    expect(result?.title).toBe("SSD WD Green 2TB");
  });

  test("externalId de 128 de caractere se păstrează, cu spațiile de la capete tăiate", () => {
    expect(validateObservation({ ...EMAG, externalId: "x".repeat(128) })?.externalId).toHaveLength(128);
    expect(validateObservation({ ...EMAG, externalId: ` ${"x".repeat(128)}\n` })?.externalId).toHaveLength(128);
  });

  test("adresa paginii se salvează în forma canonică a serverului: https, fără port, query și hash", () => {
    expect(validateObservation({ ...EMAG, url: "http://www.emag.ro/x/pd/Y/?a=1#b" })?.url).toBe(
      "https://www.emag.ro/x/pd/Y/"
    );
    expect(validateObservation({ ...EMAG, url: "HTTPS://WWW.EMAG.RO/X/pd/Y/" })?.url).toBe(
      "https://www.emag.ro/X/pd/Y/"
    );
    expect(validateObservation({ ...EMAG, url: "https://www.emag.ro" })?.url).toBe("https://www.emag.ro/");
  });

  test("imaginea: adresa normalizată, cel mult 2048 de caractere, fără caractere de control", () => {
    const image = (imageUrl) => validateObservation({ ...EMAG, imageUrl })?.imageUrl;

    expect(image("https://cdn.example.com/a b.jpg")).toBe("https://cdn.example.com/a%20b.jpg");
    expect(image("https://cdn.example.com/a\u0000b.jpg")).toBe("https://cdn.example.com/a%00b.jpg");
    expect(image("https://cdn.example.com/a\tb\n.jpg")).toBe("https://cdn.example.com/ab.jpg");
    expect(image(`https://cdn.example.com/${"a".repeat(2000)}`)).toHaveLength(2024);
    expect(image(`https://cdn.example.com/${"a".repeat(2100)}`)).toBeUndefined();
    expect(image(`https://cdn.example.com/${"é".repeat(1000)}`)).toBeUndefined();
    expect(image("javascript:alert(1)")).toBeUndefined();
  });

  test("elimină câmpurile opționale invalide, dar păstrează observația", () => {
    const result = validateObservation({
      ...EMAG,
      imageUrl: "javascript:alert(1)",
      ean: "WDS200T4G0E",
      mpn: "wds-200 t4g0e",
    });

    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("imageUrl");
    expect(result).not.toHaveProperty("ean");
    expect(result).not.toHaveProperty("mpn");
  });

  test("păstrează un EAN valid și respinge unul cu cifră de control greșită", () => {
    expect(validateObservation({ ...ALTEX, ean: "718037904610" })?.ean).toBe("718037904610");
    expect(validateObservation({ ...ALTEX, ean: "718037904611" })).not.toHaveProperty("ean");
  });

  test.each([
    ["6 caractere (minimul de pe server)", "ABC123", true],
    ["64 de caractere (maximul de pe server)", `${"ABC123".repeat(10)}ABCD`, true],
    ["5 caractere", "ABC12", false],
    ["65 de caractere", `${"ABC123".repeat(10)}ABCDE`, false],
    ["fără cifre", "ABCDEFG", false],
    ["fără litere", "12345678", false],
    ["litere mici", "abc123", false],
  ])("mpn: %s", (_name, mpn, kept) => {
    const result = validateObservation({ ...EMAG, mpn });

    expect(result).not.toBeNull();
    if (kept) {
      expect(result?.mpn).toBe(mpn);
    } else {
      expect(result).not.toHaveProperty("mpn");
    }
  });
});

describe("hasForeignCurrency", () => {
  test.each([
    ["EUR", "EUR"],
    ["eur", "eur"],
    ["USD", "USD"],
    ["HUF", "HUF"],
  ])("%s este o monedă străină", (_name, currency) => {
    expect(hasForeignCurrency({ ...EMAG, currency })).toBe(true);
    expect(validateObservation({ ...EMAG, currency })).toBeNull();
  });

  test.each([
    ["RON", "RON"],
    ["ron", "ron"],
    ["lipsă", undefined],
    ["2 litere", "RO"],
    ["număr", 978],
    ["null", null],
  ])("nu este monedă străină: %s", (_name, currency) => {
    expect(hasForeignCurrency({ ...EMAG, currency })).toBe(false);
  });

  test("o valoare care nu e observație nu are monedă străină", () => {
    for (const raw of [null, undefined, "EUR", ["EUR"], 5]) {
      expect(hasForeignCurrency(raw)).toBe(false);
    }
  });
});

describe("pauza după 429 (isBackingOff)", () => {
  const NOW = 1_800_000_000_000;

  test("fără pauză salvată sau cu una încheiată, nu se așteaptă", () => {
    expect(isBackingOff(null, NOW)).toBe(false);
    expect(isBackingOff(NOW - 1, NOW)).toBe(false);
    expect(isBackingOff(NOW, NOW)).toBe(false);
  });

  test("până la momentul salvat se așteaptă", () => {
    expect(isBackingOff(NOW + 1, NOW)).toBe(true);
    expect(isBackingOff(NOW + 60_000, NOW)).toBe(true);
    expect(isBackingOff(NOW + MAX_BACKOFF_MS, NOW)).toBe(true);
  });

  test("o pauză mai îndepărtată decât maximul (ceas mutat, valoare stricată) nu ține extensia oprită", () => {
    expect(MAX_BACKOFF_MS).toBe(10 * 60 * 1000);
    expect(isBackingOff(NOW + MAX_BACKOFF_MS + 1, NOW)).toBe(false);
    expect(isBackingOff(Number.MAX_SAFE_INTEGER, NOW)).toBe(false);
  });
});

describe("senderMatchesStore", () => {
  test.each([
    ["https://www.emag.ro/ceva/pd/X/", "emag", true],
    ["https://emag.ro/ceva", "emag", true],
    ["https://altex.ro/x/cpd/Y/", "altex", true],
    ["https://www.altex.ro/x", "altex", true],
    ["https://www.pcgarage.ro/ssd/a/b/", "pcgarage", true],
    ["https://www.emag.ro/x", "altex", false],
    ["http://www.emag.ro/x", "emag", false],
    ["https://evil.example/www.emag.ro", "emag", false],
    ["chrome-extension://abc/popup.html", "emag", false],
    [undefined, "emag", false],
  ])("%s pentru %s -> %p", (url, store, expected) => {
    expect(senderMatchesStore(url, store)).toBe(expected);
  });
});

describe("deduplicare", () => {
  const T0 = 1_750_000_000_000;
  const seen = { price: 149_077, at: T0 };

  test("cheia conține magazinul și identificatorul", () => {
    expect(seenKey(EMAG)).toBe("seen:emag:DHDY3T3BM");
  });

  test("trimite când produsul nu a mai fost trimis", () => {
    expect(shouldSendIngest(null, EMAG, T0)).toBe(true);
  });

  test("nu trimite când prețul este același și au trecut sub 6 ore", () => {
    expect(shouldSendIngest(seen, EMAG, T0 + 1)).toBe(false);
    expect(shouldSendIngest(seen, EMAG, T0 + DEDUPE_WINDOW_MS - 1)).toBe(false);
  });

  test("trimite din nou la 6 ore sau mai mult, chiar cu același preț", () => {
    expect(shouldSendIngest(seen, EMAG, T0 + DEDUPE_WINDOW_MS)).toBe(true);
    expect(shouldSendIngest(seen, EMAG, T0 + DEDUPE_WINDOW_MS * 3)).toBe(true);
  });

  test("trimite imediat când prețul s-a schimbat", () => {
    expect(shouldSendIngest(seen, { price: 139_900 }, T0 + 1000)).toBe(true);
  });

  test("trimite când ora salvată este în viitor (ceas mutat)", () => {
    expect(shouldSendIngest(seen, EMAG, T0 - 60_000)).toBe(true);
  });

  test("normalizeSeen acceptă doar { price, at } valide", () => {
    expect(normalizeSeen({ price: 100, at: 5, extra: 1 })).toEqual({ price: 100, at: 5 });
    expect(normalizeSeen({ price: 1.5, at: 5 })).toBeNull();
    expect(normalizeSeen({ price: 100 })).toBeNull();
    expect(normalizeSeen("x")).toBeNull();
    expect(normalizeSeen(null)).toBeNull();
  });

  test("expiredSeenKeys alege doar intrările seen: expirate sau stricate", () => {
    const entries = {
      "seen:emag:fresh": { price: 100, at: T0 - 1000 },
      "seen:emag:stale": { price: 100, at: T0 - DEDUPE_WINDOW_MS },
      "seen:altex:broken": { price: "x" },
      "seen:altex:future": { price: 100, at: T0 + 5000 },
      settings: { enabled: true },
      recent: [],
      seenPrunedAt: 1,
    };

    expect(expiredSeenKeys(entries, T0).sort()).toEqual([
      "seen:altex:broken",
      "seen:altex:future",
      "seen:emag:stale",
    ]);
  });
});

describe("countCheaperOffers", () => {
  const offer = (store, price, inStock = true) => ({
    productId: `${store}-${price}`,
    store,
    price,
    inStock,
    url: "https://example.com",
    lastCheckedAt: null,
  });
  const item = (...offers) => ({ offers });

  test("0 când nu există produs în catalog", () => {
    expect(countCheaperOffers(null, EMAG)).toBe(0);
  });

  test("numără ofertele mai ieftine din alte magazine", () => {
    const result = countCheaperOffers(
      item(offer("altex", 119_999), offer("pcgarage", 139_900), offer("emag", 100_000)),
      EMAG
    );

    expect(result).toBe(2); // oferta eMAG este chiar pagina curentă
  });

  test("ignoră ofertele scumpe, egale, fără stoc sau fără preț", () => {
    const result = countCheaperOffers(
      item(
        offer("altex", 149_077), // același preț
        offer("pcgarage", 150_000), // mai scump
        offer("altex", 100_000, false), // fără stoc
        offer("pcgarage", null) // preț necunoscut
      ),
      EMAG
    );

    expect(result).toBe(0);
  });
});

describe("insigna și mesajele", () => {
  test.each([
    [0, ""],
    [-1, ""],
    [1, "1"],
    [12, "12"],
    [99, "99"],
    [100, "99+"],
  ])("badgeText(%p) -> %p", (count, expected) => {
    expect(badgeText(count)).toBe(expected);
  });

  test("describeError întoarce mesaje în română", () => {
    expect(describeError({ code: "UNAUTHORIZED" })).toBe("Nu ești conectat în Arbitra.");
    expect(describeError({ code: "RATE_LIMITED" })).toBe("Prea multe cereri, încerc din nou în câteva minute.");
    expect(describeError({ code: "NETWORK" })).toContain("Nu mă pot conecta");
    expect(describeError({ code: "TIMEOUT" })).toContain("nu a răspuns la timp");
    expect(describeError({ code: "BAD_RESPONSE" })).toContain("răspuns neașteptat");
    expect(describeError({ code: "SERVER", httpStatus: 503 })).toBe("Eroare de server (HTTP 503).");
    expect(describeError({ code: "SERVER", httpStatus: null })).toBe("Eroare de server.");
    expect(describeError(new Error("x"))).toBe("A apărut o eroare neașteptată.");
    expect(describeError(null)).toBe("A apărut o eroare neașteptată.");
  });
});

describe("produse recente", () => {
  const entry = (n, overrides = {}) => ({
    at: n,
    store: "emag",
    title: `Produs ${n}`,
    price: 1000 + n,
    changed: false,
    ...overrides,
  });

  test("cele mai noi sunt primele și lista are cel mult 5 intrări", () => {
    let recent = [];
    for (let n = 1; n <= 8; n++) {
      recent = appendRecent(recent, entry(n));
    }

    expect(recent).toHaveLength(RECENT_LIMIT);
    expect(recent.map((item) => item.at)).toEqual([8, 7, 6, 5, 4]);
  });

  test("același produs apare o singură dată, cu datele cele mai noi", () => {
    const recent = appendRecent([entry(1), entry(2)], entry(3, { title: "Produs 1", price: 5, changed: true }));

    expect(recent.map((item) => item.title)).toEqual(["Produs 1", "Produs 2"]);
    expect(recent[0]).toMatchObject({ price: 5, changed: true });
  });

  test("același titlu în alt magazin este alt produs", () => {
    const recent = appendRecent([entry(1)], entry(2, { store: "altex", title: "Produs 1" }));

    expect(recent).toHaveLength(2);
  });

  test("normalizeRecent ignoră intrările stricate și tăiază la 5", () => {
    const raw = [entry(1), { at: "x" }, null, "text", entry(2), entry(3), entry(4), entry(5), entry(6), entry(7)];

    const result = normalizeRecent(raw);

    expect(result).toHaveLength(RECENT_LIMIT);
    expect(result.map((item) => item.at)).toEqual([1, 2, 3, 4, 5]);
    expect(normalizeRecent("nimic")).toEqual([]);
    expect(normalizeRecent(undefined)).toEqual([]);
  });

  test("normalizeRecent păstrează doar câmpurile cunoscute", () => {
    const [result] = normalizeRecent([{ ...entry(1), secret: "x" }]);

    expect(result).toEqual(entry(1));
  });
});

describe("sanitizeCatalogItem", () => {
  const raw = {
    key: "ean:718037904610",
    representativeProductId: "p1",
    title: "SSD WD Green",
    ean: "718037904610",
    imageUrl: "https://lcdn.altex.ro/x.jpg",
    currency: "RON",
    offers: [
      {
        productId: "p1",
        store: "altex",
        price: 119_999,
        inStock: true,
        url: "https://altex.ro/x/cpd/Y/",
        lastCheckedAt: "2026-10-04T10:00:00.000Z",
      },
      { productId: "p2", store: "emag", price: 149_077, inStock: false, url: "https://www.emag.ro/x/pd/Z/", lastCheckedAt: null },
    ],
    bestOffer: { productId: "p1", store: "altex", price: 119_999 },
    maxPrice: 149_077,
    savings: 29_078,
    lastCheckedAt: "2026-10-04T10:00:00.000Z",
  };

  test("un CatalogItem valid trece neschimbat", () => {
    expect(sanitizeCatalogItem(raw)).toEqual(raw);
  });

  test.each([
    ["null", null],
    ["șir", "x"],
    ["fără offers", { key: "k" }],
    ["offers care nu e listă", { offers: {} }],
  ])("întoarce null pentru %s", (_name, value) => {
    expect(sanitizeCatalogItem(value)).toBeNull();
  });

  test("scoate ofertele stricate și curăță câmpurile", () => {
    const result = sanitizeCatalogItem({
      offers: [
        null,
        { store: "" },
        { productId: "p", store: "altex", price: 12.5, inStock: "da", url: "javascript:alert(1)" },
        { productId: "q", store: "emag", price: -4, inStock: true, url: "https://www.emag.ro/x" },
      ],
      currency: "ro",
      imageUrl: "javascript:x",
      bestOffer: { store: "altex", price: "mult" },
      maxPrice: "mult",
      savings: -3,
    });

    expect(result?.offers).toEqual([
      { productId: "p", store: "altex", price: null, inStock: false, url: "", lastCheckedAt: null },
      { productId: "q", store: "emag", price: null, inStock: true, url: "https://www.emag.ro/x", lastCheckedAt: null },
    ]);
    expect(result).toMatchObject({
      currency: "RON",
      imageUrl: null,
      bestOffer: null,
      maxPrice: null,
      savings: 0,
      ean: null,
      lastCheckedAt: null,
    });
  });
});

describe("setări", () => {
  const original = globalThis.chrome;
  /** @type {ReturnType<typeof createFakeChrome>} */
  let fake;

  beforeEach(() => {
    fake = createFakeChrome();
    globalThis.chrome = fake.chrome;
  });

  afterAll(() => {
    globalThis.chrome = original;
  });

  test("normalizeSettings completează valorile implicite", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ apiBase: "nu e url", webBase: 5, enabled: "da" })).toEqual(DEFAULT_SETTINGS);
  });

  test("normalizeSettings curăță adresele și păstrează enabled", () => {
    expect(
      normalizeSettings({ apiBase: " https://api.pretpilot.ro/ ", webBase: "https://pretpilot.ro/", enabled: false })
    ).toEqual({ apiBase: "https://api.pretpilot.ro", webBase: "https://pretpilot.ro", enabled: false });
  });

  test("getSettings întoarce valorile implicite când storage-ul este gol", async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  test("saveSettings combină cu ce există și salvează sub cheia settings", async () => {
    await saveSettings({ apiBase: "https://api.pretpilot.ro/" });
    const result = await saveSettings({ enabled: false });

    expect(result).toEqual({
      apiBase: "https://api.pretpilot.ro",
      webBase: DEFAULT_SETTINGS.webBase,
      enabled: false,
    });
    expect(fake.data.get("settings")).toEqual(result);
    expect(await getSettings()).toEqual(result);
  });

  test("saveSettings respinge adresele invalide fără să scrie nimic", async () => {
    const error = await saveSettings({ apiBase: "ftp://x" }).catch((e) => e);

    expect(error).toBeInstanceOf(SettingsError);
    expect(error.field).toBe("apiBase");
    expect(fake.data.has("settings")).toBe(false);
    expect((await saveSettings({ webBase: "javascript:1" }).catch((e) => e)).field).toBe("webBase");
    expect((await saveSettings({ enabled: "da" }).catch((e) => e)).field).toBe("enabled");
  });
});
