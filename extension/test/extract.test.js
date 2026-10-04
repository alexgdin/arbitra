// Teste pentru extract.js. Fără rețea și fără DOM real: documentul este un duck-type cu
// querySelectorAll / querySelector / getAttribute / textContent.
// Blocurile JSON-LD din fixtures/ de alt tip decât Product (WebPage, BreadcrumbList, QAPage)
// sunt substitute minimale; obiectele Product sunt cele capturate de pe paginile reale.

import { describe, expect, test } from "bun:test";

import extract from "../src/extract.js";
import altex from "./fixtures/altex.json";
import emag from "./fixtures/emag.json";
import vectors from "./fixtures/model-code-vectors.json";
import pcgarage from "./fixtures/pcgarage.json";
import { docFromFixture, fakeDoc } from "./helpers/fake-page.js";

const {
  extractObservation,
  parseObservationFromLd,
  parsePriceToBani,
  isValidGtin,
  primaryModelCode,
  modelCodeFromTitle,
  decodeHtmlEntities,
  detectStore,
  externalIdFromUrl,
  mapAvailability,
  canonicalUrl,
} = extract;

const EMAG_URL = "https://www.emag.ro/produs-de-test/pd/ABC123/";
const ALTEX_URL = "https://altex.ro/produs-de-test/cpd/ABC123/";
const PCGARAGE_URL = "https://www.pcgarage.ro/categorie/brand/produs-de-test/";

function offer(overrides = {}) {
  return {
    "@type": "Offer",
    price: "100.50",
    priceCurrency: "RON",
    availability: "http://schema.org/InStock",
    ...overrides,
  };
}

function product(overrides = {}) {
  return {
    "@type": "Product",
    name: "Produs de test",
    sku: "ABC123",
    offers: offer(),
    ...overrides,
  };
}

/** parseObservationFromLd cu contextul dedus din adresă. */
function observe(ldNodes, href = EMAG_URL, extra = {}) {
  return parseObservationFromLd(ldNodes, {
    href,
    hostname: new URL(href).hostname,
    ...extra,
  });
}

const EXPECTED_EMAG = {
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

const EXPECTED_ALTEX = {
  store: "altex",
  externalId: "SSDWDS200T4G0E",
  title:
    "Solid-State Drive (SSD) WESTERN DIGITAL Green SN3000, 2TB, PCIe Gen 4, M.2 PCIe, WDS200T4G0E",
  url: "https://altex.ro/solid-state-drive-ssd-western-digital-green-sn3000-2tb-pcie-gen-4-m-2-pcie-wds200t4g0e/cpd/SSDWDS200T4G0E/",
  imageUrl:
    "https://lcdn.altex.ro/media/catalog/product/w/d/wd_green_sn3000_nvme_ssd_01_2c0054a1.jpg",
  ean: "718037904610",
  mpn: "WDS200T4G0E",
  price: 119_999,
  currency: "RON",
  inStock: true,
};

const EXPECTED_PCGARAGE = {
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

describe("pagini reale (fixtures)", () => {
  test("eMAG: observația exactă", () => {
    expect(extractObservation(docFromFixture(emag), emag.href)).toStrictEqual(
      EXPECTED_EMAG
    );
  });

  test("Altex: observația exactă", () => {
    expect(extractObservation(docFromFixture(altex), altex.href)).toStrictEqual(
      EXPECTED_ALTEX
    );
  });

  test("PC Garage: observația exactă", () => {
    expect(
      extractObservation(docFromFixture(pcgarage), pcgarage.href)
    ).toStrictEqual(EXPECTED_PCGARAGE);
  });

  test("aceleași rezultate fără DOM, direct din JSON-LD", () => {
    const ctx = (fixture, extra = {}) => ({
      href: fixture.href,
      hostname: new URL(fixture.href).hostname,
      ...extra,
    });
    expect(
      parseObservationFromLd(emag.ldBlocks, ctx(emag, { ogType: "product" }))
    ).toStrictEqual(EXPECTED_EMAG);
    expect(parseObservationFromLd(altex.ldBlocks, ctx(altex))).toStrictEqual(
      EXPECTED_ALTEX
    );
    expect(
      parseObservationFromLd(pcgarage.ldBlocks, ctx(pcgarage))
    ).toStrictEqual(EXPECTED_PCGARAGE);
  });

  test("eMAG și Altex dau același mpn, PC Garage alt produs", () => {
    const fromEmag = extractObservation(docFromFixture(emag), emag.href);
    const fromAltex = extractObservation(docFromFixture(altex), altex.href);
    const fromPcGarage = extractObservation(
      docFromFixture(pcgarage),
      pcgarage.href
    );
    expect(fromEmag.mpn).toBe("WDS200T4G0E");
    expect(fromAltex.mpn).toBe("WDS200T4G0E");
    expect(fromPcGarage.mpn).toBe("WDS100T4G0E");
    expect(fromPcGarage.mpn).not.toBe(fromEmag.mpn);
    expect(fromPcGarage.externalId).not.toBe(fromEmag.externalId);
  });

  test("gtin-ul fals de pe eMAG (de fapt mpn) este respins", () => {
    const fromEmag = extractObservation(docFromFixture(emag), emag.href);
    expect("ean" in fromEmag).toBe(false);
  });

  test("GTIN-12 valid de pe Altex este păstrat", () => {
    const fromAltex = extractObservation(docFromFixture(altex), altex.href);
    expect(fromAltex.ean).toBe("718037904610");
  });

  test("&amp; din adresa imaginii eMAG este decodat", () => {
    const fromEmag = extractObservation(docFromFixture(emag), emag.href);
    expect(fromEmag.imageUrl).not.toContain("&amp;");
    expect(fromEmag.imageUrl).toContain("?width=80&height=80&hash=");
  });

  test("preț număr (PC Garage, Altex) și preț șir (eMAG) dau bani întregi", () => {
    const prices = [emag, altex, pcgarage].map(
      (fixture) =>
        extractObservation(docFromFixture(fixture), fixture.href).price
    );
    expect(prices).toEqual([149_077, 119_999, 73_999]);
    for (const price of prices) {
      expect(Number.isInteger(price)).toBe(true);
    }
  });

  test("extragerea nu modifică datele primite", () => {
    const before = JSON.stringify(emag.ldBlocks);
    parseObservationFromLd(emag.ldBlocks, {
      href: emag.href,
      hostname: "www.emag.ro",
    });
    expect(JSON.stringify(emag.ldBlocks)).toBe(before);
  });
});

describe("parsePriceToBani", () => {
  const cases = [
    // numere zecimale
    [739.99, 73_999],
    [1490.77, 149_077],
    [1199.99, 119_999],
    [129, 12_900],
    [19.99, 1999],
    // fără deriva virgulei mobile (4.35 * 100 = 434.99999999999994)
    [4.35, 435],
    [1.15, 115],
    [0.29, 29],
    [0.1 + 0.2, 30],
    [12.999, 1300],
    [21_474_836.47, 2_147_483_647],
    // șiruri zecimale, în formatul schema.org
    ["1490.77", 149_077],
    ["739.99", 73_999],
    ["129", 12_900],
    ["1199", 119_900],
    // format românesc și englezesc
    ["1.490,77", 149_077],
    ["1490,77 Lei", 149_077],
    ["1,490.77", 149_077],
    ["1.490,77 Lei", 149_077],
    ["129,99 RON", 12_999],
    ["RON 129,99", 12_999],
    ["Preț: 1.490,77 Lei (cu TVA)", 149_077],
    ["de la 1.199,99 lei", 119_999],
    ["12 Lei", 1200],
    ["99,9", 9990],
    ["0,99", 99],
    ["12.5", 1250],
    // punct sau virgulă urmate de exact 3 cifre: separator de mii
    ["1.199", 119_900],
    ["1.199 lei", 119_900],
    ["2.500 Lei", 250_000],
    ["1,199", 119_900],
    ["1.234.567", 123_456_700],
    ["1.234.567,89", 123_456_789],
    ["1,234,567.89", 123_456_789],
    // spațiu (și spațiu fix) ca separator de mii
    ["1 490,77 lei", 149_077],
    ["1\u00a0490,77 lei", 149_077],
    ["1\u202f490,77 lei", 149_077],
    ["2 499 Lei", 249_900],
    // trei zecimale se rotunjesc; 0.999 și 1490.770 nu sunt separatori de mii
    ["0.999", 100],
    ["1490.770", 149_077],
    ["1490,775", 149_078],
    // ambiguu prin construcție: un punct urmat de 3 cifre înseamnă mii
    ["12.999", 1_299_900],
    ["739.990", 73_999_000],
  ];
  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input)} -> ${expected}`, () => {
      expect(parsePriceToBani(input)).toBe(expected);
    });
  }

  const rejected = [
    0,
    -5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1e21,
    21_474_836.48,
    "",
    "   ",
    "abc",
    "Lei",
    "0",
    "0,00",
    "0.00",
    "-100 Lei",
    "Reducere - 100 Lei",
    "\u2212100 Lei",
    "1.2.3",
    "1.49077",
    "99999999,99",
    null,
    undefined,
    {},
    [],
    true,
  ];
  for (const input of rejected) {
    test(`${String(JSON.stringify(input) ?? input)} -> null`, () => {
      expect(parsePriceToBani(input)).toBeNull();
    });
  }

  test("primul număr din text contează", () => {
    expect(parsePriceToBani("1.490,77 Lei 1.590,00 Lei")).toBe(149_077);
  });
});

describe("isValidGtin", () => {
  const valid = {
    "GTIN-8": ["96385074", "12345670"],
    "GTIN-12": ["718037904610", "036000291452"],
    "GTIN-13": ["4006381333931", "5901234123457"],
    "GTIN-14": ["10012345678902"],
  };
  for (const [kind, values] of Object.entries(valid)) {
    for (const value of values) {
      test(`${kind} valid: ${value}`, () => {
        expect(isValidGtin(value)).toBe(true);
      });
    }
  }

  test("număr întreg valid", () => {
    expect(isValidGtin(96_385_074)).toBe(true);
  });

  const invalid = [
    ["cifră de control greșită (13)", "4006381333932"],
    ["cifră de control greșită (8)", "96385075"],
    ["cifră de control greșită (12)", "718037904611"],
    ["mpn în loc de gtin (eMAG)", "WDS200T4G0E"],
    ["litere amestecate", "12345abc"],
    ["spațiu la început", " 4006381333931"],
    ["cratime", "4006-3813-33931"],
    ["9 cifre", "123456789"],
    ["7 cifre", "1234567"],
    ["15 cifre", "123456789012345"],
    ["doar zerouri (8)", "00000000"],
    ["doar zerouri (13)", "0000000000000"],
    ["șir gol", ""],
    ["null", null],
    ["undefined", undefined],
    ["obiect", {}],
    ["listă", ["4006381333931"]],
    ["număr zecimal", 4_006_381.333_931],
  ];
  for (const [name, value] of invalid) {
    test(`invalid: ${name}`, () => {
      expect(isValidGtin(value)).toBe(false);
    });
  }
});

describe("primaryModelCode", () => {
  // Aceiași vectori ca pe server (packages/api/src/lib/model-code-vectors.json): algoritmul are două copii.
  for (const { input, output } of vectors) {
    test(`vector ${JSON.stringify(input)} -> ${JSON.stringify(output)}`, () => {
      expect(primaryModelCode(input)).toBe(output);
    });
  }

  test("vectorii acoperă și codurile valide, și pe cele respinse", () => {
    expect(vectors.filter(({ output }) => output !== null).length).toBeGreaterThan(10);
    expect(vectors.filter(({ output }) => output === null).length).toBeGreaterThan(10);
  });

  const cases = [
    ["  WDS200T4G0E  ", "WDS200T4G0E"],
    // peste două cuvinte separate prin spațiu este text liber, nu cod
    ["WDS 200 T4G0E", null],
    // primul segment lung, dar doar litere: cratima dispare
    ["ABCDEF-123456", "ABCDEF123456"],
    // primul segment de 6 caractere cu litere și cifre rămâne singur
    ["A1B2C3-XYZ", "A1B2C3"],
    // primul segment de 5 caractere nu ajunge
    ["A1B2C-XYZ", "A1B2CXYZ"],
    // linia en dash și em dash
    ["WDS100T4G0E–00CPS0", "WDS100T4G0E"],
    ["WDS100T4G0E—00CPS0", "WDS100T4G0E"],
    // sufixe de regiune și variantă
    ["6C7B8EA#ABB", "6C7B8EA"],
    ["MZ-V8P1T0BW/EU", "MZV8P1T0BW"],
    ["MQD83RO/A", "MQD83RO"],
    // sufixele se taie pe rând; capacitatea oprește tăierea
    ["WDS100T4G0E-00CPS0-EU", "WDS100T4G0E"],
    ["SDSSDE61-500G", "SDSSDE61500G"],
    ["SDSSDE61-500G-G25-EU", "SDSSDE61500G"],
    // listă de coduri: primul
    ["WDS200T4G0E, WDS100T4G0E", "WDS200T4G0E"],
    ["WDS200T4G0E; WDS100T4G0E", "WDS200T4G0E"],
    ["WDS200T4G0E | WDS100T4G0E", "WDS200T4G0E"],
    // etichete
    ["COD: WDS200T4G0E", "WDS200T4G0E"],
    ["Model WDS200T4G0E", "WDS200T4G0E"],
    ["SKU#WDS200T4G0E", "WDS200T4G0E"],
    ["P/N: WDS200T4G0E", "WDS200T4G0E"],
    ["PN : WDS200T4G0E", "WDS200T4G0E"],
    ["MODEL: SM-S921BZKDEUE", "SMS921BZKDEUE"],
    // literele etichetei sunt chiar începutul codului: nu se taie
    ["COD1234AB", "COD1234AB"],
    ["SKU12345A", "SKU12345A"],
    ["MODELX1234", "MODELX1234"],
    // lungimea: 6..64 de caractere
    ["ABC123", "ABC123"],
    [`${"ABC123".repeat(10)}ABCD`, `${"ABC123".repeat(10)}ABCD`],
    [`${"ABC123".repeat(10)}ABCDE`, null],
    // cel puțin 3 caractere distincte, o literă și o cifră
    ["AB1AB1AB1", "AB1AB1AB1"],
    ["AA1AA1", null],
    ["910-005296", null],
    [12_345, null],
    [1_234_567, null],
    // specificații
    ["DDR5-6000", null],
    ["1920X1080", null],
    ["LGA1700", null],
    ["5000MAH", null],
    ["M2", null],
    // "N/A" oriunde în valoare
    ["N/A", null],
    ["WDS200T4G0E N/A", null],
    ["---", null],
    [null, null],
    [undefined, null],
    [{}, null],
  ];
  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
      expect(primaryModelCode(input)).toBe(expected);
    });
  }

  test("capacitățile aceleiași serii nu se unesc într-un singur cod", () => {
    const codes = [
      "SDSSDE61-500G-G25",
      "SDSSDE61-1T00-G25",
      "SDSSDE61-2T00-G25",
      "SA400S37/240G",
      "SA400S37/480G",
      "RTX3060-12G",
      "RTX3060-8G",
      "ABC123-1TB",
      "ABC123-2TB",
    ].map(primaryModelCode);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("modelCodeFromTitle", () => {
  test("titlul Altex dă WDS200T4G0E (ultimul token, nu SN3000)", () => {
    expect(modelCodeFromTitle(EXPECTED_ALTEX.title)).toBe("WDS200T4G0E");
  });

  const found = [
    [
      "Telefon Samsung Galaxy S24 Ultra 256GB SM-S928BZKDEUE",
      "SMS928BZKDEUE",
      "cod cu cratimă",
    ],
    ["Casti Sony WH-1000XM5 Negru", "WH1000XM5", "cod în mijloc"],
    ["Laptop ASUS Vivobook (X1504ZA-BQ107)", "X1504ZA", "între paranteze"],
    ["Produs de test XYZ12345.", "XYZ12345", "punct la sfârșit"],
    ["Cablu ABC123XY / DEF456ZW", "DEF456ZW", "ultimul dintre mai multe"],
    ["Bundle ABC123XY si DEF456ZW", "DEF456ZW", "ultimul dintre mai multe"],
    ["SSD WESTERN DIGITAL GREEN SN3000 2TB", "SN3000", "titlu cu litere mari"],
    [
      "Memorie Corsair Vengeance 32GB (2x16GB) DDR5-6000 CL30 CMK32GX5M2B6000C30",
      "CMK32GX5M2B6000C30",
      "cod după specificații",
    ],
    [
      "SSD Kingston A400 SA400S37/240G",
      "SA400S37240G",
      "capacitate după slash",
    ],
    [
      "SSD SanDisk Extreme SDSSDE61-1T00-G25",
      "SDSSDE611T00",
      "capacitate între sufixe",
    ],
    ["SSD WD WDS100T4G0E-00CPS0", "WDS100T4G0E", "sufix de producător"],
    ["Casti Samsung MZ-V9P1T0BW/EU", "MZV9P1T0BW", "sufix de regiune"],
  ];
  for (const [title, expected, name] of found) {
    test(`${name}: ${expected}`, () => {
      expect(modelCodeFromTitle(title)).toBe(expected);
    });
  }

  const falsePositives = [
    ["capacitate și interfață", "SSD Samsung 990 PRO 2TB PCIe 4.0 M.2"],
    ["frecvență monitor", "Monitor Gaming 27 inch 165Hz 1ms IPS"],
    ["memorie", "Memorie Kingston FURY 16GB DDR5 5600MHz"],
    ["frecvență cu litere mari", "Memorie RAM 3200MHZ"],
    ["rezoluție", "Monitor 4K 1920X1080 60Hz"],
    ["kit de memorii", "Memorie 32GB DDR5-6000 CL30 2X16GB"],
    ["soclu procesor", "Procesor Intel Core i5-12400F LGA1700"],
    ["baterie", "Telefon 5000MAH 128GB"],
    ["număr simplu", "Cod 12345678"],
    ["doar litere", "WESTERN DIGITAL GREEN"],
    ["cod cu litere mici", "Produs wds200t4g0e"],
    ["prea scurt", "Cablu USB-C 2M AB12"],
    ["slot M.2", "SSD NVMe M2-2280"],
    ["cod de umplutură", "Produs AAAAA1"],
    ["standard video", "Cablu HDMI21 2M"],
    ["N/A", "Produs N/A"],
    ["șir gol", ""],
  ];
  for (const [name, title] of falsePositives) {
    test(`nu confundă: ${name}`, () => {
      expect(modelCodeFromTitle(title)).toBeNull();
    });
  }

  test("valori care nu sunt text", () => {
    for (const value of [null, undefined, 42, {}]) {
      expect(modelCodeFromTitle(value)).toBeNull();
    }
  });

  test("dă același cod ca primaryModelCode pentru codurile din vectori", () => {
    const inputs = vectors
      .filter(({ output }) => output !== null)
      .map(({ input }) => input)
      // un token cu o capacitate de tip 1TB ("ABC123-1TB") se ia doar din câmpul mpn, nu din titlu
      .filter((input) => /^[A-Z0-9]+(?:[-/][A-Z0-9]+)*$/.test(input))
      .filter((input) => !input.endsWith("TB"));
    expect(inputs.length).toBeGreaterThan(10);
    for (const input of inputs) {
      expect(modelCodeFromTitle(`Produs ${input} nou`)).toBe(
        primaryModelCode(input)
      );
    }
  });

  test("capacitățile din titlu nu se unesc: SA400S37/240G și SA400S37/480G", () => {
    expect(modelCodeFromTitle("SSD 240GB SA400S37/240G")).not.toBe(
      modelCodeFromTitle("SSD 480GB SA400S37/480G")
    );
  });
});

describe("decodeHtmlEntities", () => {
  const cases = [
    ["a &amp; b", "a & b"],
    ["&lt;b&gt;", "<b>"],
    ["&quot;x&quot;", '"x"'],
    ["&#39;", "'"],
    ["&#x27;", "'"],
    ["&apos;", "'"],
    ["&#8211;", "\u2013"],
    ["&#x218;", "Ș"],
    ["&nbsp;", "\u00a0"],
    ["&AMP;", "&"],
    ["width=80&amp;height=80", "width=80&height=80"],
    // o singură trecere: nu se decodează de două ori
    ["&amp;amp;", "&amp;"],
    ["&amp;lt;", "&lt;"],
    // neschimbate
    ["&unknown;", "&unknown;"],
    ["&#0;", "&#0;"],
    ["&#1114112;", "&#1114112;"],
    ["&#xD800;", "&#xD800;"],
    ["fără entități: ăîșțâ", "fără entități: ăîșțâ"],
    ["a & b", "a & b"],
    ["", ""],
  ];
  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input)}`, () => {
      expect(decodeHtmlEntities(input)).toBe(expected);
    });
  }

  test("valori care nu sunt text dau șir gol", () => {
    for (const value of [null, undefined, 42, {}]) {
      expect(decodeHtmlEntities(value)).toBe("");
    }
  });
});

describe("detectStore", () => {
  const known = [
    ["www.emag.ro", "emag"],
    ["emag.ro", "emag"],
    ["m.emag.ro", "emag"],
    ["marketplace.emag.ro", "emag"],
    ["www.pcgarage.ro", "pcgarage"],
    ["pcgarage.ro", "pcgarage"],
    ["WWW.PCGARAGE.RO", "pcgarage"],
    ["altex.ro", "altex"],
    ["www.altex.ro", "altex"],
    ["mobile.altex.ro", "altex"],
    ["altex.ro.", "altex"],
  ];
  for (const [hostname, store] of known) {
    test(`${hostname} -> ${store}`, () => {
      expect(detectStore(hostname)).toBe(store);
    });
  }

  const unknown = [
    "emag.com",
    "notemag.ro",
    "evilpcgarage.ro",
    "emag.ro.evil.com",
    "www.google.ro",
    "localhost",
    "",
    null,
    undefined,
    42,
  ];
  for (const hostname of unknown) {
    test(`${String(hostname)} -> null`, () => {
      expect(detectStore(hostname)).toBeNull();
    });
  }
});

describe("externalIdFromUrl", () => {
  const cases = [
    ["emag", "https://www.emag.ro/x-y-z/pd/DHDY3T3BM/", "DHDY3T3BM"],
    ["emag", "https://www.emag.ro/x-y-z/pd/DHDY3T3BM", "DHDY3T3BM"],
    ["emag", "https://www.emag.ro/x/pd/DHDY3T3BM/?ref=a#specs", "DHDY3T3BM"],
    ["emag", "https://www.emag.ro/x/pd/DHDY3T3BM/#specs", "DHDY3T3BM"],
    ["emag", "https://www.emag.ro/x/pd/AB%20C/", "AB C"],
    ["emag", "https://www.emag.ro/x/pd/AB%E0%A4%A/", "AB%E0%A4%A"],
    ["emag", "https://www.emag.ro/pd/", null],
    ["emag", "https://www.emag.ro/laptopuri/c", null],
    ["altex", EXPECTED_ALTEX.url, "SSDWDS200T4G0E"],
    ["altex", "https://altex.ro/x/cpd/ABC123/?q=1", "ABC123"],
    ["altex", "https://altex.ro/x/pd/ABC123/", null],
    [
      "pcgarage",
      "https://www.pcgarage.ro/ssd/wd/green-sn3000-1tb/",
      "green-sn3000-1tb",
    ],
    [
      "pcgarage",
      "https://www.pcgarage.ro/ssd/wd/green-sn3000-1tb",
      "green-sn3000-1tb",
    ],
    ["pcgarage", "https://www.pcgarage.ro/ssd/wd/slug/?a=b#c", "slug"],
    ["pcgarage", "https://www.pcgarage.ro/", null],
    ["other", EMAG_URL, null],
    ["constructor", EMAG_URL, null],
    ["emag", "nu este un URL", null],
    ["emag", "ftp://www.emag.ro/x/pd/ABC/", null],
    ["emag", undefined, null],
  ];
  for (const [store, href, expected] of cases) {
    test(`${store} ${href} -> ${expected}`, () => {
      expect(externalIdFromUrl(store, href)).toBe(expected);
    });
  }
});

describe("mapAvailability", () => {
  const inStock = [
    "http://schema.org/InStock",
    "https://schema.org/InStock",
    "InStock",
    "in stock",
    "in_stock",
    "http://schema.org/LimitedAvailability",
    "http://schema.org/InStoreOnly",
    "http://schema.org/OnlineOnly",
    "În stoc",
    "Disponibil",
  ];
  for (const value of inStock) {
    test(`în stoc: ${value}`, () => {
      expect(mapAvailability(value)).toBe(true);
    });
  }

  const unavailable = [
    "http://schema.org/OutOfStock",
    "https://schema.org/SoldOut",
    "http://schema.org/Discontinued",
    "http://schema.org/PreOrder",
    "http://schema.org/PreSale",
    "http://schema.org/BackOrder",
    "OutOfStock",
    "out of stock",
    "OUT_OF_STOCK",
    "Not in stock",
    "Unavailable",
    "Indisponibil",
    "Stoc epuizat",
    "Fără stoc",
    "Precomandă",
  ];
  for (const value of unavailable) {
    test(`nu este în stoc: ${value}`, () => {
      expect(mapAvailability(value)).toBe(false);
    });
  }

  test("valoare lipsă sau necunoscută dă true (observația are preț)", () => {
    for (const value of [
      undefined,
      null,
      "",
      "http://schema.org/Mystery",
      42,
      {},
    ]) {
      expect(mapAvailability(value)).toBe(true);
    }
  });

  test("boolean rămâne cum este", () => {
    expect(mapAvailability(true)).toBe(true);
    expect(mapAvailability(false)).toBe(false);
  });
});

describe("canonicalUrl", () => {
  const cases = [
    [
      "http://www.emag.ro/x/pd/ABC/?utm_source=a&b=c#specs",
      "https://www.emag.ro/x/pd/ABC/",
    ],
    ["https://altex.ro/a/cpd/B", "https://altex.ro/a/cpd/B"],
    ["https://altex.ro/a/cpd/B/?x=1", "https://altex.ro/a/cpd/B/"],
    ["HTTPS://WWW.EMAG.RO/X/pd/Ab/?y=1", "https://www.emag.ro/X/pd/Ab/"],
    ["http://localhost:3001/x?y=1", "https://localhost:3001/x"],
    ["https://www.emag.ro", "https://www.emag.ro/"],
    ["not a url", null],
    ["", null],
    ["javascript:alert(1)", null],
    ["ftp://www.emag.ro/x", null],
    ["data:text/plain,hi", null],
    [undefined, null],
    [null, null],
  ];
  for (const [input, expected] of cases) {
    test(`${String(input)} -> ${expected}`, () => {
      expect(canonicalUrl(input)).toBe(expected);
    });
  }
});

describe("parseObservationFromLd: pagini care nu sunt de produs", () => {
  test("fără nod Product", () => {
    expect(
      observe([{ "@type": "WebPage" }, { "@type": "BreadcrumbList" }])
    ).toBeNull();
  });

  test("fără date JSON-LD", () => {
    for (const ld of [[], null, undefined, {}, "text", 42]) {
      expect(observe(ld)).toBeNull();
    }
  });

  test("fără preț pozitiv", () => {
    for (const price of [undefined, null, "", "0", 0, -10, "abc", {}]) {
      expect(observe([product({ offers: offer({ price }) })])).toBeNull();
    }
  });

  test("fără ofertă deloc", () => {
    expect(observe([product({ offers: undefined })])).toBeNull();
    expect(observe([product({ offers: [] })])).toBeNull();
    expect(observe([product({ offers: "100" })])).toBeNull();
  });

  test("fără nume", () => {
    expect(observe([product({ name: undefined })])).toBeNull();
    expect(observe([product({ name: "   " })])).toBeNull();
  });

  test("gazdă care nu este un magazin acceptat", () => {
    expect(
      observe([product()], "https://www.example.com/x/pd/ABC123/")
    ).toBeNull();
    expect(
      observe([product()], "https://emag.ro.evil.com/x/pd/ABC123/")
    ).toBeNull();
    expect(
      observe([product()], "https://notaltex.ro/x/cpd/ABC123/")
    ).toBeNull();
  });

  test("hostname din context are prioritate și trebuie să fie un magazin", () => {
    expect(
      parseObservationFromLd([product()], {
        href: EMAG_URL,
        hostname: "www.example.com",
      })
    ).toBeNull();
  });

  test("hostname lipsă: se ia din adresă", () => {
    expect(parseObservationFromLd([product()], { href: EMAG_URL })?.store).toBe(
      "emag"
    );
  });

  test("adresă invalidă sau context lipsă", () => {
    expect(
      parseObservationFromLd([product()], { href: "nu e URL" })
    ).toBeNull();
    expect(parseObservationFromLd([product()], {})).toBeNull();
    expect(parseObservationFromLd([product()])).toBeNull();
    expect(
      parseObservationFromLd([product()], { href: "ftp://www.emag.ro/x/pd/A/" })
    ).toBeNull();
  });

  const notProductPages = [
    ["eMAG: listă de produse", "https://www.emag.ro/solid-state-drive-ssd/c"],
    ["eMAG: pagina principală", "https://www.emag.ro/"],
    ["eMAG: /pd/ fără id", "https://www.emag.ro/pd/"],
    ["eMAG: brand", "https://www.emag.ro/brands/brand/western-digital"],
    ["Altex: categorie", "https://altex.ro/solid-state-drive-ssd/cpl/"],
    ["Altex: /pd/ în loc de /cpd/", "https://altex.ro/x/pd/ABC123/"],
    ["Altex: /cpd/ fără id", "https://altex.ro/cpd/"],
    ["PC Garage: categorie cu 1 segment", "https://www.pcgarage.ro/ssd/"],
    [
      "PC Garage: categorie cu 2 segmente",
      "https://www.pcgarage.ro/ssd/wd-sandisk/",
    ],
    [
      "PC Garage: filtre",
      "https://www.pcgarage.ro/ssd/filtre/brand-wd/pret-100-500/",
    ],
    [
      "PC Garage: /filtre/ la mijloc",
      "https://www.pcgarage.ro/ssd/wd/filtre/x/",
    ],
    ["PC Garage: coș", "https://www.pcgarage.ro/cos/"],
    ["PC Garage: coș adânc", "https://www.pcgarage.ro/a/b/cos/"],
    ["PC Garage: pagina principală", "https://www.pcgarage.ro/"],
  ];
  for (const [name, href] of notProductPages) {
    test(`respins: ${name}`, () => {
      expect(observe([product()], href)).toBeNull();
    });
  }

  test("acceptate: pagini de produs cu forma așteptată", () => {
    expect(observe([product()], EMAG_URL)?.store).toBe("emag");
    expect(observe([product()], ALTEX_URL)?.store).toBe("altex");
    expect(observe([product()], PCGARAGE_URL)?.store).toBe("pcgarage");
    expect(
      observe([product()], "https://www.pcgarage.ro/a/b/c/d/produs/")?.store
    ).toBe("pcgarage");
  });

  test("eMAG: og:type diferit de product este respins", () => {
    expect(observe([product()], EMAG_URL, { ogType: "website" })).toBeNull();
    expect(observe([product()], EMAG_URL, { ogType: "article" })).toBeNull();
  });

  test("eMAG: og:type product sau lipsă este acceptat", () => {
    for (const ogType of [
      "product",
      "Product",
      "product.item",
      "",
      undefined,
    ]) {
      expect(observe([product()], EMAG_URL, { ogType })?.store).toBe("emag");
    }
  });

  test("PC Garage și Altex: og:type nu blochează (nu a fost verificat acolo)", () => {
    expect(
      observe([product()], PCGARAGE_URL, { ogType: "website" })?.store
    ).toBe("pcgarage");
    expect(observe([product()], ALTEX_URL, { ogType: "website" })?.store).toBe(
      "altex"
    );
  });
});

describe("parseObservationFromLd: structura JSON-LD", () => {
  test("@graph", () => {
    const ld = [
      {
        "@context": "https://schema.org",
        "@graph": [{ "@type": "WebPage" }, product()],
      },
    ];
    expect(observe(ld)?.externalId).toBe("ABC123");
  });

  test("listă de noduri într-un bloc", () => {
    expect(observe([[{ "@type": "WebPage" }, product()]])?.externalId).toBe(
      "ABC123"
    );
  });

  test("obiect Product singur, fără listă", () => {
    expect(observe(product())?.externalId).toBe("ABC123");
  });

  test("@type ca listă sau cu prefix", () => {
    for (const type of [
      ["Product", "ItemPage"],
      ["ItemPage", "Product"],
      "http://schema.org/Product",
      "https://schema.org/Product",
      "schema:Product",
    ]) {
      expect(observe([product({ "@type": type })])?.externalId).toBe("ABC123");
    }
  });

  test("tipuri care nu sunt Product", () => {
    for (const type of ["ProductModel", "Offer", ["Thing"], undefined, 5]) {
      expect(observe([product({ "@type": type })])).toBeNull();
    }
  });

  test("Product în mainEntity al unei pagini", () => {
    const ld = [{ "@type": "WebPage", mainEntity: product() }];
    expect(observe(ld)?.externalId).toBe("ABC123");
  });

  test("Product doar în ItemList nu contează (pagină de listă)", () => {
    const ld = [
      {
        "@type": "ItemList",
        itemListElement: [{ "@type": "ListItem", item: product() }],
      },
    ];
    expect(observe(ld)).toBeNull();
  });

  test("mai multe produse: se alege cel care descrie pagina (după sku)", () => {
    const ld = [
      product({ sku: "OTHER1", name: "Alt produs" }),
      product({ sku: "ABC123", name: "Produsul paginii" }),
      product({ sku: "OTHER2", name: "Alt produs 2" }),
    ];
    expect(observe(ld)?.title).toBe("Produsul paginii");
  });

  test("mai multe produse: se alege cel care descrie pagina (după URL)", () => {
    const ld = [
      product({
        sku: "OTHER1",
        name: "Alt produs",
        url: "https://www.emag.ro/alt/pd/OTHER1/",
      }),
      product({ sku: "ZZZ", name: "Produsul paginii", url: `${EMAG_URL}?x=1` }),
    ];
    expect(observe(ld)?.title).toBe("Produsul paginii");
  });

  test("mai multe produse: după URL-ul ofertei", () => {
    const ld = [
      product({ sku: "OTHER1", name: "Alt produs" }),
      product({
        sku: "ZZZ",
        name: "Produsul paginii",
        offers: offer({ url: EMAG_URL }),
      }),
    ];
    expect(observe(ld)?.title).toBe("Produsul paginii");
  });

  test("mai multe produse, niciunul al paginii: pagină de listă", () => {
    const ld = [
      product({ sku: "A1", name: "Unu" }),
      product({ sku: "B2", name: "Doi" }),
      product({ sku: "C3", name: "Trei" }),
    ];
    expect(observe(ld)).toBeNull();
  });

  test("același produs repetat în două blocuri", () => {
    expect(observe([product(), product()])?.externalId).toBe("ABC123");
  });
});

describe("parseObservationFromLd: preț și ofertă", () => {
  test("preț număr și preț șir dau același rezultat", () => {
    expect(observe([product({ offers: offer({ price: 100.5 }) })])?.price).toBe(
      10_050
    );
    expect(
      observe([product({ offers: offer({ price: "100.50" }) })])?.price
    ).toBe(10_050);
  });

  test("prețul structurat urmează schema.org: punctul este zecimal", () => {
    expect(
      observe([product({ offers: offer({ price: "739.990" }) })])?.price
    ).toBe(73_999);
    expect(
      observe([product({ offers: offer({ price: "1.199" }) })])?.price
    ).toBe(120);
  });

  test("preț cu virgulă sau cu text trece prin parsePriceToBani", () => {
    expect(
      observe([product({ offers: offer({ price: "1.490,77 Lei" }) })])?.price
    ).toBe(149_077);
  });

  test("AggregateOffer: lowPrice", () => {
    const aggregate = {
      "@type": "AggregateOffer",
      lowPrice: "99.5",
      highPrice: 120,
      offerCount: 3,
      priceCurrency: "RON",
    };
    expect(observe([product({ offers: aggregate })])?.price).toBe(9950);
  });

  test("AggregateOffer: price are prioritate față de lowPrice", () => {
    const aggregate = { "@type": "AggregateOffer", price: 100, lowPrice: 50 };
    expect(observe([product({ offers: aggregate })])?.price).toBe(10_000);
  });

  test("AggregateOffer cu oferte imbricate", () => {
    const aggregate = {
      "@type": "AggregateOffer",
      offerCount: 1,
      offers: [offer({ price: 25.5, availability: "OutOfStock" })],
    };
    const observation = observe([product({ offers: aggregate })]);
    expect(observation?.price).toBe(2550);
    expect(observation?.inStock).toBe(false);
  });

  test("lista de oferte: prima cu preț valid", () => {
    const offers = [
      offer({ price: "0" }),
      offer({ price: "50.25", availability: "OutOfStock" }),
      offer({ price: "10" }),
    ];
    const observation = observe([product({ offers })]);
    expect(observation?.price).toBe(5025);
    expect(observation?.inStock).toBe(false);
  });

  test("lista de oferte: prima ofertă contează, nu cea mai ieftină", () => {
    const offers = [offer({ price: 200 }), offer({ price: 150 })];
    expect(observe([product({ offers })])?.price).toBe(20_000);
  });

  test("fără preț în ofertă: meta, apoi DOM", () => {
    const noPrice = [product({ offers: offer({ price: undefined }) })];
    expect(observe(noPrice, EMAG_URL, { metaPrice: "129.99" })?.price).toBe(
      12_999
    );
    expect(
      observe(noPrice, EMAG_URL, { domPriceText: "1.490,77 Lei" })?.price
    ).toBe(149_077);
    expect(
      observe(noPrice, EMAG_URL, {
        metaPrice: "129.99",
        domPriceText: "1.490,77 Lei",
      })?.price
    ).toBe(12_999);
    expect(
      observe(noPrice, EMAG_URL, {
        metaPrice: "abc",
        domPriceText: "99,90 Lei",
      })?.price
    ).toBe(9990);
  });

  test("prețul din ofertă are prioritate față de meta și DOM", () => {
    expect(
      observe([product()], EMAG_URL, {
        metaPrice: "1.00",
        domPriceText: "2,00 Lei",
      })?.price
    ).toBe(10_050);
  });

  test("meta și DOM fără preț valid: respins", () => {
    const noPrice = [product({ offers: offer({ price: "0" }) })];
    expect(
      observe(noPrice, EMAG_URL, { metaPrice: "0", domPriceText: "-" })
    ).toBeNull();
  });

  test("fără nicio ofertă: prețul din meta, stoc implicit true", () => {
    const observation = observe([product({ offers: undefined })], EMAG_URL, {
      metaPrice: "129.99",
    });
    expect(observation?.price).toBe(12_999);
    expect(observation?.inStock).toBe(true);
    expect(observation?.currency).toBe("RON");
  });

  test("monedă", () => {
    const currency = (priceCurrency) =>
      observe([product({ offers: offer({ priceCurrency }) })])?.currency;
    expect(currency("RON")).toBe("RON");
    expect(currency("eur")).toBe("EUR");
    expect(currency(undefined)).toBe("RON");
    expect(currency("")).toBe("RON");
    expect(currency("Lei")).toBe("RON");
    expect(currency("LEI")).toBe("RON");
    expect(currency("ron1")).toBe("RON");
    expect(currency(978)).toBe("RON");
  });

  test("disponibilitate: în stoc, fără stoc, lipsă", () => {
    const inStock = (availability) =>
      observe([product({ offers: offer({ availability }) })])?.inStock;
    expect(inStock("http://schema.org/InStock")).toBe(true);
    expect(inStock("https://schema.org/LimitedAvailability")).toBe(true);
    expect(inStock("http://schema.org/OutOfStock")).toBe(false);
    expect(inStock("https://schema.org/SoldOut")).toBe(false);
    expect(inStock("http://schema.org/Discontinued")).toBe(false);
    expect(inStock("http://schema.org/PreOrder")).toBe(false);
    expect(inStock(undefined)).toBe(true);
  });

  test("produs fără stoc, dar cu preț, rămâne observație", () => {
    const observation = observe([
      product({
        offers: offer({ availability: "http://schema.org/OutOfStock" }),
      }),
    ]);
    expect(observation).not.toBeNull();
    expect(observation?.inStock).toBe(false);
    expect(observation?.price).toBe(10_050);
  });
});

describe("parseObservationFromLd: câmpuri", () => {
  test("titlul: entități decodate, spații reduse, capete tăiate", () => {
    const name = "  Produs   cu &amp; spații\n  multiple&nbsp;aici \t";
    expect(observe([product({ name })])?.title).toBe(
      "Produs cu & spații multiple aici"
    );
  });

  test("externalId: sku șir, sku număr, altfel din URL", () => {
    expect(observe([product({ sku: "  XY-9 " })])?.externalId).toBe("XY-9");
    expect(observe([product({ sku: 12_345 })])?.externalId).toBe("12345");
    for (const sku of [undefined, "", "   ", null, {}, []]) {
      expect(observe([product({ sku })])?.externalId).toBe("ABC123");
    }
    expect(observe([product({ sku: undefined })], ALTEX_URL)?.externalId).toBe(
      "ABC123"
    );
    expect(
      observe([product({ sku: undefined })], PCGARAGE_URL)?.externalId
    ).toBe("produs-de-test");
  });

  test("imaginea: șir, listă, ImageObject", () => {
    const image = (value) => observe([product({ image: value })])?.imageUrl;
    expect(image("https://cdn.example.com/a.jpg")).toBe(
      "https://cdn.example.com/a.jpg"
    );
    expect(
      image(["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"])
    ).toBe("https://cdn.example.com/a.jpg");
    expect(
      image({ "@type": "ImageObject", url: "https://cdn.example.com/c.jpg" })
    ).toBe("https://cdn.example.com/c.jpg");
    expect(
      image([
        { "@type": "ImageObject", contentUrl: "https://cdn.example.com/d.jpg" },
      ])
    ).toBe("https://cdn.example.com/d.jpg");
    expect(image("http://cdn.example.com/e.jpg")).toBe(
      "http://cdn.example.com/e.jpg"
    );
  });

  test("imaginea: entități decodate, relativă rezolvată, doar http(s)", () => {
    const image = (value) => observe([product({ image: value })])?.imageUrl;
    expect(image("https://cdn.example.com/a.jpg?w=1&amp;h=2")).toBe(
      "https://cdn.example.com/a.jpg?w=1&h=2"
    );
    expect(image("/img/a.jpg")).toBe("https://www.emag.ro/img/a.jpg");
    expect(image("//cdn.example.com/a.jpg")).toBe(
      "https://cdn.example.com/a.jpg"
    );
    expect(image("  https://cdn.example.com/a.jpg  ")).toBe(
      "https://cdn.example.com/a.jpg"
    );
  });

  test("imaginea: prima adresă validă din listă, restul lipsesc", () => {
    const image = (value) => observe([product({ image: value })]);
    expect(
      image(["javascript:alert(1)", "https://cdn.example.com/ok.jpg"])?.imageUrl
    ).toBe("https://cdn.example.com/ok.jpg");
    for (const value of [
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "ftp://cdn.example.com/a.jpg",
      "",
      [],
      null,
      {},
      42,
    ]) {
      expect("imageUrl" in image(value)).toBe(false);
    }
    expect("imageUrl" in observe([product()])).toBe(false);
  });

  test("ean: primul GTIN valid, în ordinea gtin13, gtin12, gtin14, gtin8, gtin, productID", () => {
    const ean = (fields) => observe([product(fields)])?.ean;
    expect(ean({ gtin13: "4006381333931" })).toBe("4006381333931");
    expect(ean({ gtin12: "718037904610" })).toBe("718037904610");
    expect(ean({ gtin14: "10012345678902" })).toBe("10012345678902");
    expect(ean({ gtin8: "96385074" })).toBe("96385074");
    expect(ean({ gtin: "718037904610" })).toBe("718037904610");
    expect(ean({ gtin13: "4006381333931", gtin: "718037904610" })).toBe(
      "4006381333931"
    );
    // primul invalid se sare
    expect(ean({ gtin13: "4006381333932", gtin: "718037904610" })).toBe(
      "718037904610"
    );
    expect(ean({ gtin12: "718037904610", gtin8: "96385074" })).toBe(
      "718037904610"
    );
  });

  test("ean: productID cu prefix, număr, spații", () => {
    const ean = (fields) => observe([product(fields)])?.ean;
    expect(ean({ productID: "gtin13:5901234123457" })).toBe("5901234123457");
    expect(ean({ productID: "ean:5901234123457" })).toBe("5901234123457");
    expect(ean({ gtin13: 5_901_234_123_457 })).toBe("5901234123457");
    expect(ean({ gtin13: " 5901234123457 " })).toBe("5901234123457");
  });

  test("ean: valorile invalide lipsesc din observație", () => {
    for (const fields of [
      { gtin: "WDS200T4G0E" },
      { gtin13: "4006381333932" },
      { gtin: "123" },
      { gtin: "0000000000000" },
      { gtin: ["4006381333931"] },
      { gtin: null },
      {},
    ]) {
      expect("ean" in observe([product(fields)])).toBe(false);
    }
  });

  test("mpn: normalizat din câmp", () => {
    const mpn = (fields) => observe([product(fields)])?.mpn;
    expect(mpn({ mpn: "WDS100T4G0E-00CPS0" })).toBe("WDS100T4G0E");
    expect(mpn({ mpn: "wh-1000xm5" })).toBe("WH1000XM5");
    expect(mpn({ mpn: "MPN: WDS200T4G0E" })).toBe("WDS200T4G0E");
    // capacitatea distinge produsul, deci rămâne în cod
    expect(mpn({ mpn: "SDSSDE61-500G-G25" })).toBe("SDSSDE61500G");
    expect(mpn({ mpn: "SA400S37/240G" })).toBe("SA400S37240G");
    // doar cifre: nu e cod de model
    expect(mpn({ mpn: 1_234_567 })).toBeUndefined();
  });

  test("mpn din câmp și mpn din titlu dau același cod pentru aceeași capacitate", () => {
    const fromField = observe([
      product({ name: "SSD Kingston A400", mpn: "SA400S37/240G" }),
    ]);
    const fromTitle = observe([
      product({ name: "SSD Kingston A400 SA400S37/240G" }),
    ]);
    const otherCapacity = observe([
      product({ name: "SSD Kingston A400", mpn: "SA400S37/480G" }),
    ]);
    expect(fromField?.mpn).toBe("SA400S37240G");
    expect(fromTitle?.mpn).toBe(fromField?.mpn);
    expect(otherCapacity?.mpn).toBe("SA400S37480G");
  });

  test("mpn din câmp are prioritate față de titlu", () => {
    const observation = observe([
      product({ name: "Produs ZZZ999XX", mpn: "ABC12345" }),
    ]);
    expect(observation?.mpn).toBe("ABC12345");
  });

  test("mpn lipsă sau fără sens: cod din titlu, altfel absent", () => {
    for (const mpn of [
      undefined,
      "",
      "N/A",
      "NONE",
      "-",
      "ABC",
      "0000",
      "AAAA",
      "Cod: N/A1",
      "128GB",
      "HDMI21",
      "TEST1",
      "AAAAA1",
      "12345678",
      null,
    ]) {
      expect(observe([product({ name: "Produs ZZZ999XX", mpn })])?.mpn).toBe(
        "ZZZ999XX"
      );
      expect("mpn" in observe([product({ name: "Produs simplu", mpn })])).toBe(
        false
      );
    }
  });

  test("url: canonic, fără query și hash", () => {
    const href = `${EMAG_URL}?ref=a#specs`;
    expect(observe([product()], href)?.url).toBe(EMAG_URL);
    expect(
      observe([product()], "http://www.emag.ro/produs-de-test/pd/ABC123/")?.url
    ).toBe(EMAG_URL);
  });

  test("url: din ofertă când e pe aceeași gazdă și același produs", () => {
    const withUrl = (url) =>
      observe([product({ offers: offer({ url }) })], `${EMAG_URL}?ref=a`)?.url;
    expect(withUrl(`${EMAG_URL}?seller=x`)).toBe(EMAG_URL);
    expect(withUrl("https://www.emag.ro/alt-slug/pd/ABC123/")).toBe(
      "https://www.emag.ro/alt-slug/pd/ABC123/"
    );
  });

  test("url: adresa paginii când oferta e pe altă gazdă, alt produs sau invalidă", () => {
    const withUrl = (url) =>
      observe([product({ offers: offer({ url }) })])?.url;
    expect(withUrl("https://www.evil.example/produs/pd/ABC123/")).toBe(
      EMAG_URL
    );
    expect(withUrl("https://marketplace.emag.ro/produs/pd/ABC123/")).toBe(
      EMAG_URL
    );
    expect(withUrl("https://www.emag.ro/alt-produs/pd/ZZZ999/")).toBe(EMAG_URL);
    expect(withUrl("/produs-de-test/pd/ABC123/")).toBe(EMAG_URL);
    expect(withUrl("javascript:alert(1)")).toBe(EMAG_URL);
    expect(withUrl("")).toBe(EMAG_URL);
    expect(withUrl(undefined)).toBe(EMAG_URL);
  });

  test("observația are exact cheile contractului, fără chei opționale goale", () => {
    const observation = observe([product()]);
    expect(Object.keys(observation)).toEqual([
      "store",
      "externalId",
      "title",
      "url",
      "price",
      "currency",
      "inStock",
    ]);
    expect(observation).toStrictEqual({
      store: "emag",
      externalId: "ABC123",
      title: "Produs de test",
      url: EMAG_URL,
      price: 10_050,
      currency: "RON",
      inStock: true,
    });
  });
});

describe("extractObservation", () => {
  const ldText = (value) => JSON.stringify(value);

  test("gazdă nesuportată: null, fără să atingă documentul", () => {
    const doc = {
      querySelectorAll() {
        throw new Error("nu trebuie citit");
      },
      querySelector() {
        throw new Error("nu trebuie citit");
      },
    };
    expect(
      extractObservation(doc, "https://www.example.com/x/pd/ABC123/")
    ).toBeNull();
    expect(extractObservation(doc, "nu e URL")).toBeNull();
  });

  test("document lipsă", () => {
    expect(extractObservation(null, EMAG_URL)).toBeNull();
    expect(extractObservation(undefined, EMAG_URL)).toBeNull();
  });

  test("pagină fără JSON-LD", () => {
    expect(extractObservation(fakeDoc(), EMAG_URL)).toBeNull();
  });

  test("JSON invalid sau gol este ignorat, blocul bun rămâne", () => {
    const doc = fakeDoc({
      ldTexts: [
        "{not json",
        "",
        "   ",
        "null",
        "undefined",
        '{"@type": "Product", "name": ',
        ldText({ "@type": "WebPage" }),
        ldText(product()),
        "<!-- comentariu -->",
      ],
    });
    expect(extractObservation(doc, EMAG_URL)?.externalId).toBe("ABC123");
  });

  test("toate blocurile invalide: null", () => {
    expect(
      extractObservation(fakeDoc({ ldTexts: ["{", "[", "nope"] }), EMAG_URL)
    ).toBeNull();
  });

  test("bloc JSON-LD ca listă și mai multe blocuri pe pagină", () => {
    const doc = fakeDoc({
      ldTexts: [
        ldText({ "@type": "BreadcrumbList" }),
        ldText([{ "@type": "WebPage" }, product({ name: "Din listă" })]),
        ldText({ "@type": "QAPage" }),
      ],
    });
    expect(extractObservation(doc, EMAG_URL)?.title).toBe("Din listă");
  });

  test("bloc cu @graph", () => {
    const doc = fakeDoc({
      ldTexts: [
        ldText({ "@context": "https://schema.org", "@graph": [product()] }),
      ],
    });
    expect(extractObservation(doc, EMAG_URL)?.externalId).toBe("ABC123");
  });

  test("rânduri noi în șirurile din JSON nu strică blocul", () => {
    const text = `{"@type":"Product","name":"Linia 1\nLinia 2","sku":"ABC123","offers":{"price":10}}`;
    const observation = extractObservation(
      fakeDoc({ ldTexts: [text] }),
      EMAG_URL
    );
    expect(observation?.title).toBe("Linia 1 Linia 2");
    expect(observation?.price).toBe(1000);
  });

  test("BOM la începutul blocului", () => {
    const doc = fakeDoc({ ldTexts: [`\ufeff${ldText(product())}`] });
    expect(extractObservation(doc, EMAG_URL)?.externalId).toBe("ABC123");
  });

  test("pagină de listă (fără /pd/) este respinsă chiar cu Product în JSON-LD", () => {
    const doc = fakeDoc({ ldTexts: [ldText(product())] });
    expect(
      extractObservation(doc, "https://www.emag.ro/solid-state-drive-ssd/c")
    ).toBeNull();
  });

  test("eMAG: og:type website respins, product acceptat", () => {
    const ldTexts = [ldText(product())];
    expect(
      extractObservation(
        fakeDoc({ ldTexts, metas: { "og:type": "website" } }),
        EMAG_URL
      )
    ).toBeNull();
    expect(
      extractObservation(
        fakeDoc({ ldTexts, metas: { "og:type": "product" } }),
        EMAG_URL
      )?.store
    ).toBe("emag");
  });

  test("adresa cu query și hash dă URL canonic", () => {
    const observation = extractObservation(
      docFromFixture(emag),
      `${emag.href}?utm_source=x#specs`
    );
    expect(observation).toStrictEqual(EXPECTED_EMAG);
  });

  describe("prețul din meta și din DOM", () => {
    const noPrice = ldText(product({ offers: offer({ price: undefined }) }));

    test("meta product:price:amount", () => {
      const doc = fakeDoc({
        ldTexts: [noPrice],
        metas: { "product:price:amount": "129.99" },
      });
      expect(extractObservation(doc, EMAG_URL)?.price).toBe(12_999);
    });

    test("itemprop price", () => {
      const doc = fakeDoc({
        ldTexts: [noPrice],
        metas: { "itemprop:price": "75.5" },
      });
      expect(extractObservation(doc, EMAG_URL)?.price).toBe(7550);
    });

    test("eMAG: textul prețului din DOM", () => {
      const doc = fakeDoc({
        ldTexts: [noPrice],
        nodes: { ".product-new-price": { textContent: "1.490,77 Lei" } },
      });
      expect(extractObservation(doc, EMAG_URL)?.price).toBe(149_077);
    });

    test("eMAG: zecimalele din <sup> nu se lipesc de partea întreagă", () => {
      const withSup = (textContent, supText) =>
        fakeDoc({
          ldTexts: [noPrice],
          nodes: {
            ".product-new-price": {
              textContent,
              querySelector: (selector) =>
                selector === "sup" ? { textContent: supText } : null,
            },
          },
        });
      expect(
        extractObservation(withSup("1.49077 Lei", "77"), EMAG_URL)?.price
      ).toBe(149_077);
      expect(
        extractObservation(withSup("73999 Lei", "99"), EMAG_URL)?.price
      ).toBe(73_999);
      expect(
        extractObservation(withSup("1.490,77 Lei", "77"), EMAG_URL)?.price
      ).toBe(149_077);
    });

    test("eMAG: <sup> care nu e număr se ignoră", () => {
      const doc = fakeDoc({
        ldTexts: [noPrice],
        nodes: {
          ".product-new-price": {
            textContent: "1.490,77 Lei*",
            querySelector: () => ({ textContent: "*" }),
          },
        },
      });
      expect(extractObservation(doc, EMAG_URL)?.price).toBe(149_077);
    });

    test("PC Garage și Altex: fără selector în DOM, deci fără preț de rezervă", () => {
      const doc = fakeDoc({
        ldTexts: [noPrice],
        nodes: { ".product-new-price": { textContent: "99,00 Lei" } },
      });
      expect(extractObservation(doc, PCGARAGE_URL)).toBeNull();
      expect(extractObservation(doc, ALTEX_URL)).toBeNull();
    });

    test("prețul din JSON-LD are prioritate", () => {
      const doc = fakeDoc({
        ldTexts: [ldText(product())],
        metas: { "product:price:amount": "1.00" },
        nodes: { ".product-new-price": { textContent: "2,00 Lei" } },
      });
      expect(extractObservation(doc, EMAG_URL)?.price).toBe(10_050);
    });
  });

  test("injecție în titlu: rămâne text simplu, nu este interpretat", () => {
    const title = "<img src=x onerror=alert(1)> Produs";
    const doc = fakeDoc({ ldTexts: [ldText(product({ name: title }))] });
    expect(extractObservation(doc, EMAG_URL)?.title).toBe(title);
  });
});
