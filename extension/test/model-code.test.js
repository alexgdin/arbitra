// Regula codului de model din extensie (primaryModelCode, modelCodeFromTitle) față de cea de pe server
// (normalizeModelCode din packages/api/src/lib/identifiers.ts): aceiași vectori, o baterie de coduri reale de
// producător, o comparație directă între cele două implementații și regulile adăugate după verificări.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { normalizeModelCode } from "../../packages/api/src/lib/identifiers.ts";
import extract from "../src/extract.js";
import battery from "./fixtures/model-code-battery.json";
import vectors from "./fixtures/model-code-vectors.json";

const { primaryModelCode, modelCodeFromTitle } = extract;

const EXTENSION_VECTORS = new URL("./fixtures/model-code-vectors.json", import.meta.url);
const API_VECTORS = new URL("../../packages/api/src/lib/model-code-vectors.json", import.meta.url);

const ALL_CODES = Object.values(battery.codes).flat();

describe("vectorii comuni cu serverul", () => {
  test("cele două copii ale fișierului de vectori sunt identice, octet cu octet", () => {
    expect(readFileSync(EXTENSION_VECTORS).equals(readFileSync(API_VECTORS))).toBe(true);
  });

  test("ambele implementații dau rezultatul din fiecare vector", () => {
    const apiVectors = JSON.parse(readFileSync(API_VECTORS, "utf8"));

    expect(apiVectors).toEqual(vectors);
    for (const { input, output } of apiVectors) {
      expect(primaryModelCode(input)).toBe(output);
      expect(normalizeModelCode(input)).toBe(output);
    }
  });

  test("vectorii noi din verificări sunt în fișier", () => {
    const inputs = new Set(vectors.map(({ input }) => input));
    for (const input of [
      "DUAL-RTX4060TI-O8G",
      "GV-N406TGAMING OC-16GD",
      "ABCDEFG-X1Y2Z3",
      "123456-AB78CD",
      "MQ9X3DN/A",
      "Cod produs: WDS200T4G0E",
      "TL-WR841N(EU)",
      "NULL1234",
      "Samsung Galaxy S24 Ultra 256GB",
    ]) {
      expect(inputs.has(input)).toBe(true);
    }
  });
});

describe("baterie de coduri reale de producător", () => {
  test("are cel puțin 60 de coduri de la fiecare producător cerut", () => {
    expect(ALL_CODES.length).toBeGreaterThanOrEqual(60);
    expect(Object.keys(battery.codes)).toEqual(
      expect.arrayContaining([
        "Samsung",
        "Kingston",
        "Crucial",
        "Western Digital",
        "SanDisk",
        "Seagate",
        "Lenovo",
        "ASUS",
        "Gigabyte",
        "MSI",
        "Sony",
        "Apple",
        "HP",
        "Dell",
        "TP-Link",
        "Corsair",
        "Intel",
        "AMD",
      ])
    );
  });

  for (const [brand, codes] of Object.entries(battery.codes)) {
    describe(brand, () => {
      for (const [raw, code] of codes) {
        test(`${raw} -> ${code}`, () => {
          expect(primaryModelCode(raw)).toBe(code);
          expect(normalizeModelCode(raw)).toBe(code);
        });
      }
    });
  }

  test("un cod deja normalizat nu se respinge și nu se schimbă a doua oară", () => {
    for (const [, code] of ALL_CODES) {
      expect(primaryModelCode(code)).toBe(code);
    }
  });

  test("variantele aceluiași model rămân produse diferite", () => {
    for (const group of battery.distinct) {
      const codes = group.map((raw) => primaryModelCode(raw));

      expect(codes.every((code) => code !== null)).toBe(true);
      expect(new Set(codes).size).toBe(group.length);
    }
  });

  test("scrierile aceluiași model dau un singur cod", () => {
    for (const group of battery.merge) {
      const codes = new Set(group.map((raw) => primaryModelCode(raw)));

      expect(codes.size).toBe(1);
      expect(codes.has(null)).toBe(false);
    }
  });

  // Un cod doar din cifre nu leagă produse (poate fi un număr intern al magazinului), ca pe server.
  test("codurile doar din cifre (Logitech, o parte din AMD) nu se potrivesc după cod de model", () => {
    for (const raw of ["910-005401", "920-009472", "960-001105", "100-000000065"]) {
      expect(primaryModelCode(raw)).toBeNull();
    }
  });
});

// Un generator determinist: aceeași secvență la fiecare rulare.
function lcg(seed) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

const FRAGMENTS = [
  "WDS", "200", "T4G0E", "-", "/", " ", "  ", "(", ")", "EU", ":", "#", "N/A", "COD", "MPN", "P/N",
  "Cod produs", "Part Number", "Nr.", "500G", "1T00", "O8G", "16GD", "TEST", "SAMPLE", "NULL", "NONE",
  "ȘTEFAN", "ă", "é", ",", ";", "|", "SSD", "HDD", "GB", "DDR4", "M.2", "2280", "1080p", "USB", "HDMI",
  "A", "B", "1", "9", "x", ".", "_", "\t", "–", "MQ9X3DN", "RTX4060TI",
];

describe("aceeași regulă ca pe server, pe intrări generate", () => {
  test("20.000 de texte din fragmente de coduri, etichete și specificații dau același rezultat", () => {
    const random = lcg(20_261_004);
    for (let i = 0; i < 20_000; i++) {
      const count = 1 + Math.floor(random() * 8);
      let text = "";
      for (let j = 0; j < count; j++) {
        text += FRAGMENTS[Math.floor(random() * FRAGMENTS.length)];
      }
      expect(primaryModelCode(text)).toBe(normalizeModelCode(text));
    }
  });
});

describe("capacități și memorie video (V1)", () => {
  test("variantele aceleiași plăci video nu se unesc", () => {
    const groups = [
      ["DUAL-RTX4060TI-O8G", "DUAL-RTX4060TI-O16G"],
      ["DUAL-RTX3050-O6G", "DUAL-RTX3050-O8G"],
      ["GV-N406TGAMING OC-8GD", "GV-N406TGAMING OC-16GD"],
    ];
    for (const group of groups) {
      const codes = group.map(primaryModelCode);
      expect(new Set(codes).size).toBe(group.length);
    }
    expect(primaryModelCode("DUAL-RTX4060TI-O8G")).toBe("DUALRTX4060TIO8G");
    expect(primaryModelCode("GV-N406TGAMING OC-16GD")).toBe("GVN406TGAMINGOC16GD");
  });

  test("capacitățile 500G, 1T00, 12G, 1TB, 512GB și 240G nu se taie ca sufix", () => {
    for (const capacity of ["500G", "1T00", "12G", "1TB", "512GB", "240G", "O8G", "16GD"]) {
      expect(primaryModelCode(`ABCDEF12-${capacity}`)).toBe(`ABCDEF12${capacity}`);
    }
  });

  test("un sufix de regiune sau de ambalaj se taie în continuare", () => {
    expect(primaryModelCode("ABCDEF12-EU")).toBe("ABCDEF12");
    expect(primaryModelCode("ABCDEF12-G25")).toBe("ABCDEF12");
    expect(primaryModelCode("ABCDEF12-00CPS0")).toBe("ABCDEF12");
  });
});

describe("N/A, etichete și paranteze (V5)", () => {
  test("codurile Apple cu /A rămân coduri", () => {
    expect(primaryModelCode("MQ9X3DN/A")).toBe("MQ9X3DN");
    expect(primaryModelCode("MPXQ2FN/A")).toBe("MPXQ2FN");
    expect(primaryModelCode("MYD92LL/A")).toBe("MYD92LL");
  });

  test("N/A ca valoare de sine stătătoare respinge tot textul", () => {
    for (const raw of [
      "N/A",
      "n/a",
      "(N/A)",
      "-N/A-",
      "Cod: N/A",
      "MPN: N/A",
      "WDS200T4G0E N/A",
      "N/A WDS200T4G0E",
      "WDS200T4G0E, N/A",
      "Cod: N/A1",
      "Cod: N/A12345",
    ]) {
      expect(primaryModelCode(raw)).toBeNull();
    }
  });

  test("o etichetă de până la 3 cuvinte din litere se taie", () => {
    for (const raw of [
      "Cod produs: WDS200T4G0E",
      "Part Number: WDS200T4G0E",
      "Manufacturer Part Number: WDS200T4G0E",
      "MPN: WDS200T4G0E",
      "P/N: WDS200T4G0E",
      "P/N#WDS200T4G0E",
      "SKU# WDS200T4G0E",
      "Nr. produs: WDS200T4G0E",
      "Product Code: WDS200T4G0E",
      "Model WDS200T4G0E",
    ]) {
      expect(primaryModelCode(raw)).toBe("WDS200T4G0E");
    }
  });

  test("literele care aparțin codului nu se taie, nici cu o etichetă falsă", () => {
    expect(primaryModelCode("PN1234AB")).toBe("PN1234AB");
    expect(primaryModelCode("COD1234AB")).toBe("COD1234AB");
    expect(primaryModelCode("ABC#1234")).toBe("ABC1234");
    expect(primaryModelCode("SKU12345A")).toBe("SKU12345A");
  });

  test("parantezele despart segmentele, iar un grup final precum (EU) se ignoră", () => {
    expect(primaryModelCode("WDS200T4G0E (EU)")).toBe("WDS200T4G0E");
    expect(primaryModelCode("TL-WR841N(EU)")).toBe("TLWR841N");
    expect(primaryModelCode("TL-WR841N (EU)")).toBe("TLWR841N");
    // o capacitate între paranteze face parte din cod
    expect(primaryModelCode("SDSSDE61 (500G)")).toBe("SDSSDE61500G");
    expect(primaryModelCode("SDSSDE61 (500G)")).not.toBe(primaryModelCode("SDSSDE61 (1T00)"));
  });
});

describe("text liber și substituenți (B13)", () => {
  test("cuvinte de umplutură urmate de cifre nu sunt cod", () => {
    for (const raw of [
      "TEST123",
      "SAMPLE1",
      "UNKNOWN1",
      "NULL1234",
      "NONE1234",
      "DEFAULT1",
      "Test-123456",
    ]) {
      expect(primaryModelCode(raw)).toBeNull();
    }
  });

  test("specificațiile și combinațiile lor nu sunt cod", () => {
    for (const raw of [
      "8GB-DDR4",
      "8GBDDR4",
      "256GB SSD",
      "1TB HDD",
      "1TBHDD",
      "M.2 2280",
      "M22280",
      "16GB RAM",
      "FHD 1080",
      "2400MHZ",
    ]) {
      expect(primaryModelCode(raw)).toBeNull();
    }
  });

  test("textul liber cu peste două cuvinte nu este cod", () => {
    for (const raw of [
      "Full HD 1080p",
      "Samsung Galaxy S24 Ultra 256GB",
      "SSD Western Digital Green SN3000",
      "Laptop ASUS Vivobook X1504ZA",
    ]) {
      expect(primaryModelCode(raw)).toBeNull();
    }
    // două cuvinte (cod și variantă) rămân permise
    expect(primaryModelCode("PRIME B650-PLUS")).toBe("PRIMEB650");
    expect(primaryModelCode("Z790 UD")).toBe("Z790UD");
  });

  test("diacriticele nu taie litere: ȘTEFAN devine STEFAN, nu TEFAN", () => {
    expect(primaryModelCode("ȘTEFAN12")).toBe("STEFAN12");
    expect(primaryModelCode("Ştefan-12")).toBe("STEFAN12");
    expect(primaryModelCode("ÀÉÎ-123")).toBe("AEI123");
  });
});

describe("intrare foarte lungă (V7)", () => {
  test("se citesc doar primele 256 de caractere, deci o intrare uriașă nu încetinește", () => {
    const started = performance.now();
    for (const raw of ["A-".repeat(45_000), "A/".repeat(45_000), `A${"-".repeat(90_000)}B`, "9".repeat(90_000)]) {
      expect(primaryModelCode(raw)).toBeNull();
    }
    expect(performance.now() - started).toBeLessThan(500);
  });

  test("ce depășește 256 de caractere nu mai contează", () => {
    expect(primaryModelCode(`WDS200T4G0E${"-".repeat(100_000)}`)).toBe("WDS200T4G0E");
    expect(primaryModelCode(`${"-".repeat(300)}WDS200T4G0E`)).toBeNull();
    expect(primaryModelCode(`${" ".repeat(300)}WDS200T4G0E`)).toBeNull();
    expect(primaryModelCode(`${"ABC123".repeat(10)}ABCD${"X".repeat(1000)}`)).toBeNull();
  });
});

describe("modelCodeFromTitle: specificații care nu sunt coduri (V6)", () => {
  test("clasă de viteză Wi-Fi", () => {
    expect(modelCodeFromTitle("ROUTER WIRELESS AX3000 GIGABIT")).toBeNull();
    expect(modelCodeFromTitle("ROUTER WIRELESS AX1800")).toBeNull();
    expect(modelCodeFromTitle("Router wireless TP-Link Archer AX3000 Wi-Fi 6, Dual Band")).toBeNull();
  });

  test("modul de memorie, scris cu cratimă sau lipit", () => {
    expect(modelCodeFromTitle("MEMORIE DESKTOP KINGSTON 8GB DDR4 PC4-25600")).toBeNull();
    expect(modelCodeFromTitle("MEMORIE 16GB PC425600")).toBeNull();
    expect(modelCodeFromTitle("MEMORIE 16GB PC3-12800")).toBeNull();
    expect(modelCodeFromTitle("Memorie Kingston ValueRAM 8GB DDR4 3200MHz PC4-25600")).toBeNull();
  });

  test("nume de procesor Intel și numere de procesor singure", () => {
    expect(modelCodeFromTitle("PROCESOR INTEL CORE I7-13650HX 2.6GHZ")).toBeNull();
    expect(modelCodeFromTitle("PROCESOR INTEL CORE I5 12400F")).toBeNull();
    expect(modelCodeFromTitle("PROCESOR 13700K")).toBeNull();
  });

  test("kit de memorii", () => {
    expect(modelCodeFromTitle("MEMORIE 32GB DDR5-6000 CL30 2X16GB")).toBeNull();
    expect(modelCodeFromTitle("MEMORIE 4X8GB")).toBeNull();
  });

  test("codul real de lângă o specificație este cel ales, indiferent de ordine", () => {
    expect(modelCodeFromTitle("ROUTER AX3000 ARCHER-AX73")).toBe("ARCHERAX73");
    expect(modelCodeFromTitle("ROUTER ARCHER-AX73 AX3000")).toBe("ARCHERAX73");
    expect(modelCodeFromTitle("MEMORIE KINGSTON PC4-25600 KF432C16BB/8")).toBe("KF432C16BB8");
    expect(modelCodeFromTitle("PROCESOR INTEL CORE I7-13650HX BX8071513650HX")).toBe("BX8071513650HX");
  });

  test("un cod are cel puțin două litere și o cifră", () => {
    expect(modelCodeFromTitle("SSD 12400F")).toBeNull();
    expect(modelCodeFromTitle("SSD 7800X3D")).toBe("7800X3D");
    expect(modelCodeFromTitle("SSD WDS200T4G0E")).toBe("WDS200T4G0E");
  });

  test("codurile Apple cu /A și codurile cu capacitate se păstrează", () => {
    expect(modelCodeFromTitle("TELEFON APPLE IPHONE 15 128GB MTP03ZD/A")).toBe("MTP03ZD");
    expect(modelCodeFromTitle("PLACA VIDEO ASUS DUAL-RTX4060TI-O8G")).toBe("DUALRTX4060TIO8G");
    expect(modelCodeFromTitle("PLACA VIDEO ASUS DUAL-RTX4060TI-O16G")).toBe("DUALRTX4060TIO16G");
  });

  test("un titlu uriaș nu încetinește și nu se parcurge peste 1000 de caractere", () => {
    const started = performance.now();
    expect(modelCodeFromTitle("A-".repeat(45_000))).toBeNull();
    expect(modelCodeFromTitle(`A${"-".repeat(90_000)}B`)).toBeNull();
    expect(modelCodeFromTitle(`${"X ".repeat(60_000)}WDS200T4G0E`)).toBeNull();
    expect(performance.now() - started).toBeLessThan(500);
    expect(modelCodeFromTitle(`WDS200T4G0E ${"X ".repeat(60_000)}`)).toBe("WDS200T4G0E");
  });
});
