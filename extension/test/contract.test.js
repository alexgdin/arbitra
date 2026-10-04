// Contractul dintre extractor și service worker: tot ce produce extract.js pe paginile
// reale trebuie să treacă neschimbat prin validarea din background (altfel se pierd câmpuri).

import { describe, expect, test } from "bun:test";

import extract from "../src/extract.js";
import { validateObservation } from "../src/logic.js";
import vectors from "./fixtures/model-code-vectors.json";

/** Document fals cu un singur bloc JSON-LD, ca pe paginile magazinelor. */
function pageWith(product) {
  const blocks = [JSON.stringify({ "@context": "https://schema.org", ...product })];
  return {
    querySelectorAll: (selector) =>
      selector === 'script[type="application/ld+json"]' ? blocks.map((textContent) => ({ textContent })) : [],
    querySelector: () => null,
  };
}

const PAGES = [
  {
    name: "PC Garage",
    url: "https://www.pcgarage.ro/ssd/wd-sandisk/green-sn3000-1tb-pci-express-40-x4-m2-2280/",
    product: {
      "@type": "Product",
      name: "SSD WD SanDisk Green SN3000 1TB PCI Express 4.0 x4 M.2 2280",
      sku: "3202727",
      mpn: "WDS100T4G0E-00CPS0",
      brand: "WD SanDisk",
      image:
        "https://www.pcgarage.ro/images/products/1/6151/3202727/normal/wds200t4g0e-00cps0-211020a99265e913ede088891019f249.jpg",
      offers: {
        "@type": "Offer",
        price: 739.99,
        priceCurrency: "RON",
        availability: "http://schema.org/InStock",
      },
    },
    expected: { store: "pcgarage", externalId: "3202727", price: 73_999, inStock: true },
  },
  {
    name: "eMAG",
    url: "https://www.emag.ro/solid-state-drive-ssd-western-digital-green-sn3000-nvme-ssd-2tb-wds200t4g0e/pd/DHDY3T3BM/",
    product: {
      "@type": "Product",
      name: "Solid State Drive (SSD) Western Digital Green SN3000 NVMe SSD, 2TB",
      sku: "DHDY3T3BM",
      mpn: "WDS200T4G0E",
      gtin: "WDS200T4G0E",
      brand: "WD",
      image:
        "https://s13emagst.akamaized.net/products/92444/92443593/images/res_1cde77ae7fac3c60da93cd5d891bc2ff.jpg?width=80&amp;height=80&amp;hash=07367DF28B712DF51405D77AFAE7C405",
      offers: {
        "@type": "Offer",
        price: "1490.77",
        priceCurrency: "RON",
        availability: "http://schema.org/InStock",
        seller: "evomag",
      },
    },
    expected: { store: "emag", externalId: "DHDY3T3BM", price: 149_077, inStock: true, mpn: "WDS200T4G0E" },
  },
  {
    name: "Altex",
    url: "https://altex.ro/solid-state-drive-ssd-western-digital-green-sn3000-2tb-pcie-gen-4-m-2-pcie-wds200t4g0e/cpd/SSDWDS200T4G0E/",
    product: {
      "@type": "Product",
      name: "Solid-State Drive (SSD) WESTERN DIGITAL Green SN3000, 2TB, PCIe Gen 4, M.2 PCIe, WDS200T4G0E",
      sku: "SSDWDS200T4G0E",
      gtin: "718037904610",
      brand: "WD",
      image: "https://lcdn.altex.ro/media/catalog/product/w/d/wd_green_sn3000_nvme_ssd_01_2c0054a1.jpg",
      offers: { "@type": "Offer", price: 1199.99, priceCurrency: "RON", availability: "https://schema.org/InStock" },
    },
    expected: {
      store: "altex",
      externalId: "SSDWDS200T4G0E",
      price: 119_999,
      inStock: true,
      ean: "718037904610",
      mpn: "WDS200T4G0E",
    },
  },
];

describe("extractor -> validarea din service worker", () => {
  test.each(PAGES)("$name: observația extrasă trece neschimbată", ({ url, product, expected }) => {
    const observation = extract.extractObservation(pageWith(product), url);

    expect(observation).toMatchObject(expected);
    expect(validateObservation(observation)).toEqual(observation);
  });

  test("același produs pe eMAG și Altex are același cod de model", () => {
    const [, emag, altex] = PAGES.map(({ url, product }) => extract.extractObservation(pageWith(product), url));

    expect(emag.mpn).toBe(altex.mpn);
    expect(emag.ean).toBeUndefined(); // "gtin" din eMAG este codul de model, nu un EAN
  });

  test("orice cod de model valid din vectori trece neschimbat prin validare", () => {
    const [, emag] = PAGES;
    for (const { input, output } of vectors) {
      const observation = extract.extractObservation(
        pageWith({ ...emag.product, mpn: input }),
        emag.url,
      );

      // mpn invalid: observația rămâne, cu codul din titlu (sau fără)
      expect(validateObservation(observation)?.mpn).toBe(observation.mpn);
      if (output !== null) {
        expect(observation.mpn).toBe(output);
      }
    }
  });
});

// Copia regulilor serverului pentru product.ingestPrice: ingestPriceInput din packages/api/src/routers/product.ts
// (câmpuri, limite, linkul canonic din store-config.ts) și plafonul prețului din packages/api/src/schemas.ts.
// Limitele sunt scrise aici, ca testul să nu ceară pachetele serverului; ce trece de ele primește BAD_REQUEST și
// observația se pierde. O observație pe care validateObservation o lasă să treacă nu are voie să încalce nicio regulă.
const SERVER_RULES = {
  stores: { emag: "emag.ro", pcgarage: "pcgarage.ro", altex: "altex.ro" },
  maxExternalId: 128,
  maxTitle: 300,
  maxUrl: 2048,
  maxPrice: 10_000_000,
  currency: "RON",
};
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Regulile din SERVER_RULES aplicate unei observații; lista câmpurilor care ar fi respinse. */
function serverIssues(input) {
  const issues = [];
  const domain = SERVER_RULES.stores[input.store];
  if (domain === undefined) {
    issues.push("store");
  }

  const externalId = typeof input.externalId === "string" ? input.externalId.trim() : "";
  if (!externalId || externalId.length > SERVER_RULES.maxExternalId || CONTROL_CHARS.test(externalId)) {
    issues.push("externalId");
  }

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > SERVER_RULES.maxTitle || CONTROL_CHARS.test(title)) {
    issues.push("title");
  }

  // linkul produsului: https, fără utilizator, parolă, port sau caractere de control, pe domeniul magazinului
  const url = typeof input.url === "string" && URL.canParse(input.url.trim()) ? new URL(input.url.trim()) : null;
  const canonical = url ? `https://${url.hostname}${url.pathname}` : "";
  if (
    typeof input.url !== "string" ||
    input.url.length > SERVER_RULES.maxUrl ||
    CONTROL_CHARS.test(input.url.trim()) ||
    !url ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    canonical.length > SERVER_RULES.maxUrl ||
    !(url.hostname === domain || url.hostname.endsWith(`.${domain}`))
  ) {
    issues.push("url");
  }

  if (input.imageUrl !== undefined) {
    const image = typeof input.imageUrl === "string" && URL.canParse(input.imageUrl) ? new URL(input.imageUrl) : null;
    if (
      !image ||
      !["http:", "https:"].includes(image.protocol) ||
      input.imageUrl.length > SERVER_RULES.maxUrl ||
      CONTROL_CHARS.test(input.imageUrl)
    ) {
      issues.push("imageUrl");
    }
  }

  if (!Number.isInteger(input.price) || input.price < 1 || input.price > SERVER_RULES.maxPrice) {
    issues.push("price");
  }
  if (input.currency !== undefined && input.currency !== SERVER_RULES.currency) {
    issues.push("currency");
  }
  if (input.inStock !== undefined && typeof input.inStock !== "boolean") {
    issues.push("inStock");
  }
  return issues;
}

const BASE = {
  store: "emag",
  externalId: "DHDY3T3BM",
  title: "Solid State Drive (SSD) Western Digital Green SN3000 NVMe SSD, 2TB",
  url: "https://www.emag.ro/solid-state-drive-ssd-western-digital-green-sn3000-nvme-ssd-2tb-wds200t4g0e/pd/DHDY3T3BM/",
  imageUrl: "https://s13emagst.akamaized.net/products/92444/92443593/images/res_1cde77ae7fac3c60da93cd5d891bc2ff.jpg",
  mpn: "WDS200T4G0E",
  price: 149_077,
  currency: "RON",
  inStock: true,
};

/** Observații la limita fiecărei reguli, cu valori pe care extractorul sau o pagină ostilă le-ar putea produce. */
const BOUNDARY_CASES = [
  ["titlu de 299, 300 și 301 de caractere", [299, 300, 301].map((length) => ({ ...BASE, title: "t".repeat(length) }))],
  ["titlu foarte lung", [{ ...BASE, title: `  ${"cuvânt ".repeat(500)}  ` }]],
  ["titlu cu caractere de control", [{ ...BASE, title: "SSD\u0000WD\u0001Green\n2TB\u007f" }]],
  ["titlu cu 300 de caractere și control la capăt", [{ ...BASE, title: `${"t".repeat(299)}\u0000x` }]],
  ["titlu cu emoji la limită", [{ ...BASE, title: `${"t".repeat(299)}😀` }]],
  [
    "externalId de 127, 128 și 129 de caractere",
    [127, 128, 129].map((length) => ({ ...BASE, externalId: "x".repeat(length) })),
  ],
  [
    "externalId cu spații, tab și NUL",
    ["  ID1  ", "ID\t1", "ID\u00001", "\nID1", ""].map((externalId) => ({ ...BASE, externalId })),
  ],
  [
    "linkul: schemă, utilizator, port, query, hash",
    [
      "http://www.emag.ro/x/pd/Y/",
      "HTTPS://WWW.EMAG.RO/X/pd/Y/",
      "https://evil.example@www.emag.ro/x/pd/Y/",
      "https://user:pass@www.emag.ro/x/pd/Y/",
      "https://www.emag.ro:8443/x/pd/Y/",
      "https://www.emag.ro/x/pd/Y/?utm=1#top",
      "https://www.emag.ro",
      "https://www.emag.ro.evil.example/x/pd/Y/",
      "https://notemag.ro/x/pd/Y/",
      "ftp://www.emag.ro/x/pd/Y/",
      "https://www.emag.ro/x y/pd/Y/",
      "https://www.emag.ro/x\u0000y/pd/Y/",
    ].map((url) => ({ ...BASE, url })),
  ],
  [
    "linkul la limita de 2048 de caractere",
    [2020, 2028, 2029, 2040, 2100].map((length) => ({
      ...BASE,
      url: `https://www.emag.ro/${"a".repeat(length - "https://www.emag.ro/".length)}`,
    })),
  ],
  [
    "linkul http la limita de 2048 (https adaugă un caracter)",
    [{ ...BASE, url: `http://www.emag.ro/${"a".repeat(2048 - "http://www.emag.ro/".length)}` }],
  ],
  [
    "imaginea: lungime, spații, control, schemă",
    [
      `https://cdn.example.com/${"a".repeat(2024 - "https://cdn.example.com/".length)}`,
      `https://cdn.example.com/${"a".repeat(2025 - "https://cdn.example.com/".length)}`,
      `https://cdn.example.com/${"é".repeat(1000)}`,
      "https://cdn.example.com/a b.jpg",
      "https://cdn.example.com/a\u0000b.jpg",
      "https://cdn.example.com/a\tb.jpg",
      "javascript:alert(1)",
      "//cdn.example.com/a.jpg",
    ].map((imageUrl) => ({ ...BASE, imageUrl })),
  ],
  [
    "prețul la limite",
    [0, 1, 10_000_000, 10_000_001, 100_000_000, 2_147_483_647, 2_147_483_648, -5, 12.5].map((price) => ({
      ...BASE,
      price,
    })),
  ],
  [
    "moneda",
    ["RON", "ron", "Ron", "EUR", "eur", "USD", "RO", "", undefined].map((currency) => ({ ...BASE, currency })),
  ],
  [
    "magazinul și domeniul",
    [
      { ...BASE, store: "pcgarage", url: "https://www.pcgarage.ro/ssd/a/b/" },
      { ...BASE, store: "altex", url: "https://altex.ro/x/cpd/Y/" },
      { ...BASE, store: "altex", url: "https://www.emag.ro/x/pd/Y/" },
      { ...BASE, store: "evomag" },
    ],
  ],
];

describe("validarea din extensie față de regulile serverului (ingestPriceInput)", () => {
  for (const [name, inputs] of BOUNDARY_CASES) {
    test(`${name}: ce trece de validare nu încalcă nicio regulă a serverului`, () => {
      for (const input of inputs) {
        const observation = validateObservation(input);
        if (observation !== null) {
          expect(serverIssues(observation)).toEqual([]);
        }
      }
    });
  }

  test("ce primește serverul în forma lui canonică nu se respinge în extensie", () => {
    const accepted = [
      BASE,
      { ...BASE, title: "t".repeat(300) },
      { ...BASE, externalId: "x".repeat(128) },
      { ...BASE, price: 1 },
      { ...BASE, price: 10_000_000 },
      { ...BASE, currency: undefined },
      { ...BASE, url: `https://www.emag.ro/${"a".repeat(2048 - "https://www.emag.ro/".length)}` },
      { ...BASE, imageUrl: `https://cdn.example.com/${"a".repeat(2048 - "https://cdn.example.com/".length)}` },
      { ...BASE, store: "pcgarage", url: "https://www.pcgarage.ro/ssd/a/b/" },
      { ...BASE, store: "altex", url: "https://altex.ro/x/cpd/Y/" },
    ];
    for (const input of accepted) {
      expect(serverIssues(input)).toEqual([]);
      const observation = validateObservation(input);
      expect(observation).not.toBeNull();
      expect(observation.price).toBe(input.price);
      expect(observation.url).toBe(input.url);
    }
  });

  test("regulile copiate prind exact ce prindea și serverul: titlu, id, link, preț și monedă peste limite", () => {
    expect(serverIssues({ ...BASE, title: "t".repeat(301) })).toEqual(["title"]);
    expect(serverIssues({ ...BASE, externalId: "x".repeat(129) })).toEqual(["externalId"]);
    expect(serverIssues({ ...BASE, price: 10_000_001 })).toEqual(["price"]);
    expect(serverIssues({ ...BASE, currency: "EUR" })).toEqual(["currency"]);
    expect(serverIssues({ ...BASE, url: "https://evil.example@www.emag.ro/x/" })).toEqual(["url"]);
    expect(serverIssues({ ...BASE, url: "http://www.emag.ro/x/" })).toEqual(["url"]);
    expect(serverIssues({ ...BASE, title: "a\u0000b" })).toEqual(["title"]);
  });

  test("observațiile extrase din cele trei pagini reale sunt acceptate de regulile serverului", () => {
    for (const { url, product } of PAGES) {
      const observation = validateObservation(extract.extractObservation(pageWith(product), url));

      expect(observation).not.toBeNull();
      expect(serverIssues(observation)).toEqual([]);
    }
  });
});

// Aceleași observații, față de schema reală a serverului, când pachetele lui sunt instalate în monorepo.
const serverSchema = await import("../../packages/api/src/routers/product.ts").then(
  (module) => module.ingestPriceInput,
  () => null
);

describe.skipIf(serverSchema === null)("validarea din extensie față de schema reală a serverului", () => {
  for (const [name, inputs] of BOUNDARY_CASES) {
    test(`${name}: ce trece de validare este primit de ingestPriceInput`, () => {
      for (const input of inputs) {
        const observation = validateObservation(input);
        if (observation !== null) {
          const result = serverSchema.safeParse(observation);
          expect(result.error?.issues ?? []).toEqual([]);
        }
      }
    });
  }

  // Copia poate fi mai strictă decât serverul (schema normalizează adresa imaginii înainte să verifice caracterele
  // de control), dar niciodată mai îngăduitoare: altfel testele de mai sus ar trece fără să dovedească nimic.
  test("copia regulilor nu primește nimic ce schema reală respinge", () => {
    for (const [, inputs] of BOUNDARY_CASES) {
      for (const input of inputs) {
        if (serverIssues(input).length === 0) {
          expect(serverSchema.safeParse(input).error?.issues ?? []).toEqual([]);
        }
      }
    }
  });
});
