import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  canonicalGtin,
  cleanIdentifiers,
  isValidGtin,
  normalizeModelCode,
} from "./identifiers";
import vectors from "./model-code-vectors.json";

// Coduri reale, cu cifra de control verificată.
const GTIN_8 = "96385074";
const GTIN_12 = "036000291452";
const GTIN_13 = "4006381333931";
const GTIN_14 = "10012345678902";
// GTIN-12 real, așa cum îl expune Altex.
const ALTEX_GTIN_12 = "718037904610";

function withCheckDigit(gtin: string, digit: number): string {
  return `${gtin.slice(0, -1)}${digit}`;
}

describe("isValidGtin", () => {
  test("accepts valid GTIN-8, 12, 13 and 14", () => {
    expect(isValidGtin(GTIN_8)).toBe(true);
    expect(isValidGtin(GTIN_12)).toBe(true);
    expect(isValidGtin(GTIN_13)).toBe(true);
    expect(isValidGtin(GTIN_14)).toBe(true);
  });

  test("accepts the Altex GTIN-12", () => {
    expect(isValidGtin(ALTEX_GTIN_12)).toBe(true);
  });

  test("accepts a GTIN padded with leading zeros to a longer valid length", () => {
    expect(isValidGtin(`0${GTIN_12}`)).toBe(true);
    expect(isValidGtin(`0${GTIN_13}`)).toBe(true);
    expect(isValidGtin(`0000${GTIN_8}`)).toBe(true);
  });

  test("rejects every wrong check digit, for every length", () => {
    for (const gtin of [GTIN_8, GTIN_12, GTIN_13, GTIN_14, ALTEX_GTIN_12]) {
      const correct = Number(gtin.at(-1));
      for (let digit = 0; digit <= 9; digit++) {
        expect(isValidGtin(withCheckDigit(gtin, digit))).toBe(digit === correct);
      }
    }
  });

  test("rejects a single mistyped digit", () => {
    expect(isValidGtin("4006381333941")).toBe(false);
    expect(isValidGtin("4006381343931")).toBe(false);
    expect(isValidGtin("5006381333931")).toBe(false);
  });

  test("rejects the model code that eMAG puts in its gtin field", () => {
    expect(isValidGtin("WDS200T4G0E")).toBe(false);
    expect(isValidGtin("WDS100T4G0E-00CPS0")).toBe(false);
  });

  test("rejects lengths other than 8, 12, 13 and 14, even with a correct check digit", () => {
    // zerourile din față păstrează cifra de control, deci doar lungimea le respinge
    expect(isValidGtin(`0${GTIN_8}`)).toBe(false);
    expect(isValidGtin(`00${GTIN_8}`)).toBe(false);
    expect(isValidGtin(`000${GTIN_8}`)).toBe(false);
    expect(isValidGtin(GTIN_8.slice(1))).toBe(false);
    expect(isValidGtin(GTIN_12.slice(1))).toBe(false);
    expect(isValidGtin(`0${GTIN_14}`)).toBe(false);
    expect(isValidGtin(`00${GTIN_14}`)).toBe(false);
  });

  test("rejects non-digit characters and surrounding whitespace", () => {
    expect(isValidGtin("")).toBe(false);
    expect(isValidGtin(" ")).toBe(false);
    expect(isValidGtin(` ${GTIN_13}`)).toBe(false);
    expect(isValidGtin(`${GTIN_13} `)).toBe(false);
    expect(isValidGtin(`${GTIN_13}\n`)).toBe(false);
    expect(isValidGtin("4006381-333931")).toBe(false);
    expect(isValidGtin("40063813339 1")).toBe(false);
    expect(isValidGtin("4006381333931X")).toBe(false);
    expect(isValidGtin("-4006381333931")).toBe(false);
  });

  test("rejects digits that are not ASCII", () => {
    expect(isValidGtin("４００６３８１３３３９３１")).toBe(false);
    expect(isValidGtin("٤٠٠٦٣٨١٣٣٣٩٣١")).toBe(false);
  });

  test("rejects all-zero placeholders", () => {
    expect(isValidGtin("00000000")).toBe(false);
    expect(isValidGtin("000000000000")).toBe(false);
    expect(isValidGtin("0000000000000")).toBe(false);
    expect(isValidGtin("00000000000000")).toBe(false);
  });
});

describe("canonicalGtin", () => {
  test("gives one code to the same GTIN with different leading zeros", () => {
    expect(canonicalGtin("718037904610")).toBe("718037904610");
    expect(canonicalGtin("0718037904610")).toBe("718037904610");
    expect(canonicalGtin("00718037904610")).toBe("718037904610");
  });

  test("pads to the smallest of 8, 12, 13 and 14 digits that fits", () => {
    // 11 cifre semnificative: se completează până la 12
    expect(canonicalGtin("0036000291452")).toBe("036000291452");
    expect(canonicalGtin(GTIN_12)).toBe(GTIN_12);
    // 8 cifre semnificative din GTIN-12, GTIN-13 și GTIN-14
    expect(canonicalGtin(`0000${GTIN_8}`)).toBe(GTIN_8);
    expect(canonicalGtin(`00000${GTIN_8}`)).toBe(GTIN_8);
    expect(canonicalGtin(`000000${GTIN_8}`)).toBe(GTIN_8);
  });

  test("keeps GTIN-8, 13 and 14 as they are", () => {
    expect(canonicalGtin(GTIN_8)).toBe(GTIN_8);
    expect(canonicalGtin(GTIN_13)).toBe(GTIN_13);
    expect(canonicalGtin(GTIN_14)).toBe(GTIN_14);
  });

  test("pads a code with fewer than 8 significant digits back to 8", () => {
    // valid, dar cu doar 2 cifre semnificative
    const short = "00000017";
    expect(isValidGtin(short)).toBe(true);
    expect(canonicalGtin(short)).toBe(short);
    expect(canonicalGtin(`0000${short}`)).toBe(short);
  });

  test("gives the same code for every valid padding of the same number", () => {
    for (const gtin of [GTIN_8, GTIN_12, GTIN_13, GTIN_14, ALTEX_GTIN_12]) {
      const canonical = canonicalGtin(gtin);
      expect(canonical).not.toBeNull();
      for (const zeros of [1, 2, 3, 4, 5, 6]) {
        const padded = `${"0".repeat(zeros)}${gtin}`;
        if (isValidGtin(padded)) {
          expect(canonicalGtin(padded)).toBe(canonical ?? "");
        }
      }
    }
  });

  test("is stable when applied twice", () => {
    for (const gtin of ["0718037904610", "0036000291452", `0000${GTIN_8}`]) {
      const once = canonicalGtin(gtin);
      expect(once).not.toBeNull();
      expect(canonicalGtin(once ?? "")).toBe(once);
    }
  });

  test("returns null for an invalid GTIN", () => {
    expect(canonicalGtin("4006381333940")).toBeNull();
    expect(canonicalGtin("WDS200T4G0E")).toBeNull();
    expect(canonicalGtin("0000000000000")).toBeNull();
    expect(canonicalGtin("123")).toBeNull();
    expect(canonicalGtin("")).toBeNull();
    expect(canonicalGtin(` ${GTIN_13}`)).toBeNull();
  });
});

describe("normalizeModelCode", () => {
  describe("shared vectors", () => {
    // Aceleași vectori ca în extensie (extension/test/fixtures/model-code-vectors.json).
    for (const { input, output } of vectors) {
      test(`${JSON.stringify(input.trim().slice(0, 60))} -> ${JSON.stringify(output)}`, () => {
        expect(normalizeModelCode(input)).toBe(output);
      });
    }

    test("the extension reads a byte-identical copy of the vectors", () => {
      const read = (...path: string[]) =>
        readFileSync(join(import.meta.dir, ...path));
      const server = read("model-code-vectors.json");
      const extension = read(
        "..",
        "..",
        "..",
        "..",
        "extension",
        "test",
        "fixtures",
        "model-code-vectors.json"
      );

      expect(extension.equals(server)).toBe(true);
    });

    test("every vector is listed once", () => {
      const inputs = vectors.map((vector) => vector.input);

      expect(new Set(inputs).size).toBe(inputs.length);
    });

    test("a normalized code stays the same when normalized again", () => {
      for (const { output } of vectors) {
        if (output !== null) {
          expect(normalizeModelCode(output)).toBe(output);
        }
      }
    });
  });

  test("keeps only the part before the manufacturer suffix", () => {
    expect(normalizeModelCode("WDS100T4G0E-00CPS0")).toBe("WDS100T4G0E");
    expect(normalizeModelCode("WDS100T4G0E-00CPS0")).toBe(
      normalizeModelCode("WDS100T4G0E-00CPS1")
    );
  });

  test("joins short dash-separated parts into one code", () => {
    expect(normalizeModelCode("WH-1000XM5")).toBe("WH1000XM5");
    expect(normalizeModelCode("SM-S921BZKDEUE")).toBe("SMS921BZKDEUE");
    expect(normalizeModelCode("SM-S921B-DS")).toBe("SMS921B");
  });

  test("uppercases the code", () => {
    expect(normalizeModelCode("wds200t4g0e")).toBe("WDS200T4G0E");
    expect(normalizeModelCode("Wh-1000xm5")).toBe("WH1000XM5");
  });

  test("gives one code to the same model and another to a different capacity", () => {
    const emag = normalizeModelCode("WDS200T4G0E");
    const altex = normalizeModelCode("wds200t4g0e");
    const pcgarage2tb = normalizeModelCode("WDS200T4G0E-00CPS0");
    const pcgarage1tb = normalizeModelCode("WDS100T4G0E-00CPS0");

    expect(altex).toBe(emag);
    expect(pcgarage2tb).toBe(emag);
    expect(pcgarage1tb).toBe("WDS100T4G0E");
    expect(pcgarage1tb).not.toBe(emag);
  });

  test("keeps a capacity segment, so different capacities never merge", () => {
    const sandisk = ["SDSSDE61-500G-G25", "SDSSDE61-1T00-G25", "SDSSDE61-2T00-G25"].map(
      normalizeModelCode
    );
    const kingston = ["SA400S37/240G", "SA400S37/480G"].map(normalizeModelCode);
    const graphics = ["RTX3060-12G", "RTX3060-8G"].map(normalizeModelCode);
    const sizes = ["ABC123-1TB", "ABC123-2TB"].map(normalizeModelCode);

    for (const codes of [sandisk, kingston, graphics, sizes]) {
      expect(new Set(codes).size).toBe(codes.length);
    }
    // aceeași capacitate, sufix de producător diferit: același produs
    expect(normalizeModelCode("SDSSDE61-500G-G25")).toBe(
      normalizeModelCode("SDSSDE61-500G-GN25")
    );
  });

  test("cuts a manufacturer suffix only when the rest is a specific code", () => {
    // exact 6 caractere, cu literă și cifră
    expect(normalizeModelCode("A1B2C3-XYZ")).toBe("A1B2C3");
    // 5 caractere: prea scurt ca să rămână cod singur
    expect(normalizeModelCode("A1B2C-XYZ")).toBe("A1B2CXYZ");
    // fără cifră în rest
    expect(normalizeModelCode("ABCDEF-XYZ1")).toBe("ABCDEFXYZ1");
    // fără literă în rest
    expect(normalizeModelCode("123456-ABC")).toBe("123456ABC");
  });

  test("cuts several suffix segments, one after the other", () => {
    expect(normalizeModelCode("WDS100T4G0E-00CPS0-EU")).toBe("WDS100T4G0E");
    expect(normalizeModelCode("MZ-V9P1T0BW/EU")).toBe("MZV9P1T0BW");
  });

  test("removes every separator when no suffix can be cut", () => {
    expect(normalizeModelCode("A-B-C-123-456")).toBe("ABC123456");
    expect(normalizeModelCode("AB#12/C-3")).toBe("AB12C3");
  });

  test("handles leading, trailing and repeated dashes", () => {
    expect(normalizeModelCode("-WDS100T4G0E")).toBe("WDS100T4G0E");
    expect(normalizeModelCode("WDS100T4G0E-")).toBe("WDS100T4G0E");
    expect(normalizeModelCode("--WH--1000XM5--")).toBe("WH1000XM5");
    expect(normalizeModelCode("WDS100T4G0E--00CPS0")).toBe("WDS100T4G0E");
  });

  test("treats Unicode dashes like hyphens", () => {
    expect(normalizeModelCode("WDS100T4G0E–00CPS0")).toBe("WDS100T4G0E");
    expect(normalizeModelCode("WDS100T4G0E—00CPS0")).toBe("WDS100T4G0E");
    expect(normalizeModelCode("WH‐1000XM5")).toBe("WH1000XM5");
    expect(normalizeModelCode("SDSSDE61‑500G―G25")).toBe("SDSSDE61500G");
  });

  test("treats a hash like a separator", () => {
    expect(normalizeModelCode("WDS100T4G0E#00CPS0")).toBe("WDS100T4G0E");
  });

  test("ignores whitespace and punctuation inside and around the code", () => {
    expect(normalizeModelCode("  WDS200T4G0E  ")).toBe("WDS200T4G0E");
    expect(normalizeModelCode("\tWDS200T4G0E\n")).toBe("WDS200T4G0E");
    expect(normalizeModelCode("WDS200 T4G0E")).toBe("WDS200T4G0E");
    expect(normalizeModelCode("WH 1000.XM5")).toBe("WH1000XM5");
    expect(normalizeModelCode("WDS100T4G0E - 00CPS0")).toBe("WDS100T4G0E");
  });

  test("drops characters outside A-Z and 0-9", () => {
    expect(normalizeModelCode("WDS200T4G0E™")).toBe("WDS200T4G0E");
    expect(normalizeModelCode("WDS200T4G0E 💾")).toBe("WDS200T4G0E");
  });

  describe("diacritics", () => {
    test("keeps the base letter of a letter with a mark, instead of dropping it", () => {
      expect(normalizeModelCode("WDS200T4G0Ă")).toBe("WDS200T4G0A");
      expect(normalizeModelCode("ȘTEFAN12")).toBe("STEFAN12");
      expect(normalizeModelCode("ŞTEFAN12")).toBe("STEFAN12");
      expect(normalizeModelCode("ŢARA1234")).toBe("TARA1234");
      expect(normalizeModelCode("ÎNTER-1234")).toBe("INTER1234");
    });

    test("gives the same code to a precomposed and a decomposed letter", () => {
      // U+0218 (Ș) și S urmat de U+0326 (virgulă dedesubt)
      const precomposed = `${String.fromCodePoint(0x218)}TEFAN12`;
      const decomposed = `S${String.fromCodePoint(0x326)}TEFAN12`;

      expect(precomposed).not.toBe(decomposed);
      expect(normalizeModelCode(precomposed)).toBe("STEFAN12");
      expect(normalizeModelCode(decomposed)).toBe("STEFAN12");
    });

    test("still drops symbols and letters with no ASCII base", () => {
      expect(normalizeModelCode("WDS200T4G0E™")).toBe("WDS200T4G0E");
      expect(normalizeModelCode("ЗАРЯДНОЕ")).toBeNull();
      expect(normalizeModelCode("WDS200T4G0Eé")).toBe("WDS200T4G0EE");
    });
  });

  describe("labels", () => {
    test("strips a leading label followed by a colon or a hash", () => {
      for (const raw of [
        "Cod: WDS200T4G0E",
        "COD:WDS200T4G0E",
        "Model: WDS200T4G0E",
        "SKU: WDS200T4G0E",
        "SKU# WDS200T4G0E",
        "MPN: WDS200T4G0E",
        "mpn : WDS200T4G0E",
        "PN: WDS200T4G0E",
        "P/N: WDS200T4G0E",
        "P/N# WDS200T4G0E",
      ]) {
        expect(normalizeModelCode(raw)).toBe("WDS200T4G0E");
      }
    });

    test("strips a label of up to three words", () => {
      for (const raw of [
        "Cod produs: WDS200T4G0E",
        "Part Number: WDS200T4G0E",
        "Part No.: WDS200T4G0E",
        "Part # WDS200T4G0E",
        "Model number: WDS200T4G0E",
        "Manufacturer Part Number: WDS200T4G0E",
        "Cod  produs  :  WDS200T4G0E",
        "cod produs:wds200t4g0e",
      ]) {
        expect(normalizeModelCode(raw)).toBe("WDS200T4G0E");
      }
    });

    test("does not strip a label of four words, which is free text", () => {
      expect(
        normalizeModelCode("Cod unic produs fabricant: WDS200T4G0E")
      ).toBeNull();
    });

    test("strips COD, MODEL, SKU and MPN followed by whitespace", () => {
      expect(normalizeModelCode("Cod WDS200T4G0E")).toBe("WDS200T4G0E");
      expect(normalizeModelCode("Model WH-1000XM5")).toBe("WH1000XM5");
      expect(normalizeModelCode("SKU WDS200T4G0E")).toBe("WDS200T4G0E");
      expect(normalizeModelCode("mpn\tWDS200T4G0E")).toBe("WDS200T4G0E");
    });

    test("keeps label letters that are the start of a code", () => {
      expect(normalizeModelCode("PN1234AB")).toBe("PN1234AB");
      expect(normalizeModelCode("PN 1234AB")).toBe("PN1234AB");
      expect(normalizeModelCode("SKU123456")).toBe("SKU123456");
      expect(normalizeModelCode("MODELX1234")).toBe("MODELX1234");
      expect(normalizeModelCode("COD1234AB")).toBe("COD1234AB");
      expect(normalizeModelCode("J8J03AA#ABB")).toBe("J8J03AA");
    });

    test("strips a known label even when the hash is glued to it", () => {
      expect(normalizeModelCode("P/N#WDS200T4G0E")).toBe("WDS200T4G0E");
      expect(normalizeModelCode("SKU#WDS200T4G0E")).toBe("WDS200T4G0E");
      expect(normalizeModelCode("MPN#WDS200T4G0E")).toBe("WDS200T4G0E");
    });

    test("does not take other letters glued to a hash for a label", () => {
      expect(normalizeModelCode("ABC#1234")).toBe("ABC1234");
      expect(normalizeModelCode("AB#12/C-3")).toBe("AB12C3");
      expect(normalizeModelCode("HPE#12345A")).toBe("HPE12345A");
    });

    test("strips only one label", () => {
      expect(normalizeModelCode("Cod: SKU: ABC123")).toBe("SKUABC123");
    });
  });

  describe("parentheses", () => {
    test("treats a trailing group like a suffix, so a region in parentheses is cut", () => {
      expect(normalizeModelCode("WDS200T4G0E (EU)")).toBe("WDS200T4G0E");
      expect(normalizeModelCode("WDS200T4G0E(EU)")).toBe("WDS200T4G0E");
      expect(normalizeModelCode("TL-WR841N(EU)")).toBe("TLWR841N");
      expect(normalizeModelCode("TL-WR841N (EU)")).toBe("TLWR841N");
      expect(normalizeModelCode("WH-1000XM5 (Black)")).toBe("WH1000XM5");
    });

    test("gives the same code with and without the region", () => {
      expect(normalizeModelCode("TL-WR841N(EU)")).toBe(
        normalizeModelCode("TL-WR841N")
      );
      expect(normalizeModelCode("WDS200T4G0E (EU)")).toBe(
        normalizeModelCode("WDS200T4G0E")
      );
    });

    test("keeps a capacity in parentheses, so different capacities never merge", () => {
      expect(normalizeModelCode("SDSSDE61 (500G)")).toBe("SDSSDE61500G");
      expect(normalizeModelCode("SDSSDE61 (1T00)")).toBe("SDSSDE611T00");
    });

    test("treats parentheses in the middle like any other separator", () => {
      expect(normalizeModelCode("AB(12)C3")).toBe("AB12C3");
    });
  });

  describe("graphics cards and other variants with a capacity token", () => {
    test("keeps the OC prefix and the GDDR suffix of a capacity, so memory sizes never merge", () => {
      const asus = ["DUAL-RTX4060TI-O8G", "DUAL-RTX4060TI-O16G"].map(
        normalizeModelCode
      );
      const asus3050 = ["DUAL-RTX3050-O6G", "DUAL-RTX3050-O8G"].map(
        normalizeModelCode
      );
      const gigabyte = ["GV-N406TGAMING OC-16GD", "GV-N406TGAMING OC-8GD"].map(
        normalizeModelCode
      );

      expect(asus).toEqual(["DUALRTX4060TIO8G", "DUALRTX4060TIO16G"]);
      expect(asus3050).toEqual(["DUALRTX3050O6G", "DUALRTX3050O8G"]);
      expect(gigabyte).toEqual(["GVN406TGAMINGOC16GD", "GVN406TGAMINGOC8GD"]);
    });

    test("still cuts a word suffix after the capacity", () => {
      expect(normalizeModelCode("TUF-RTX4070-O12G-GAMING")).toBe(
        "TUFRTX4070O12G"
      );
      expect(normalizeModelCode("ROG-STRIX-RTX4080-O16G-GAMING")).toBe(
        "ROGSTRIXRTX4080O16G"
      );
    });

    test("recognizes the capacity tokens", () => {
      // sufixul "-<token>" rămâne în cod doar când e capacitate
      for (const token of [
        "O8G",
        "O16G",
        "8GD",
        "16GD",
        "500G",
        "1T00",
        "12G",
        "1TB",
        "512GB",
        "240G",
      ]) {
        expect(normalizeModelCode(`ABCD123-${token}`)).toBe(`ABCD123${token}`);
      }
      for (const token of ["EU", "00CPS0", "GAMING", "G25", "BOX"]) {
        expect(normalizeModelCode(`ABCD123-${token}`)).toBe("ABCD123");
      }
    });
  });

  describe("lists", () => {
    test("keeps the first value of a list", () => {
      expect(normalizeModelCode("WDS200T4G0E, WDS100T4G0E")).toBe("WDS200T4G0E");
      expect(normalizeModelCode("WDS200T4G0E; WDS100T4G0E")).toBe("WDS200T4G0E");
      expect(normalizeModelCode("WDS200T4G0E | WDS100T4G0E")).toBe("WDS200T4G0E");
      expect(normalizeModelCode("Cod: WDS200T4G0E, alt model")).toBe(
        "WDS200T4G0E"
      );
    });

    test("rejects a list that starts with an empty value", () => {
      expect(normalizeModelCode(", WDS200T4G0E")).toBeNull();
    });
  });

  describe("placeholders", () => {
    test("rejects a standalone N/A anywhere in the text, whatever its case", () => {
      expect(normalizeModelCode("N/A")).toBeNull();
      expect(normalizeModelCode("n/a")).toBeNull();
      expect(normalizeModelCode("ABC1234 N/A")).toBeNull();
      expect(normalizeModelCode("ABC1234, N/A")).toBeNull();
      expect(normalizeModelCode("ABC1234-N/A")).toBeNull();
      expect(normalizeModelCode("(N/A)")).toBeNull();
    });

    test("rejects N/A followed by a digit once the label is cut", () => {
      expect(normalizeModelCode("Cod: N/A1")).toBeNull();
      expect(normalizeModelCode("Cod: N/A12345")).toBeNull();
      expect(normalizeModelCode("N/A12345")).toBeNull();
      expect(normalizeModelCode("MPN: N/A 12345")).toBeNull();
    });

    test("keeps the Apple codes that end in /A", () => {
      expect(normalizeModelCode("MQ9X3DN/A")).toBe("MQ9X3DN");
      expect(normalizeModelCode("MPXQ2FN/A")).toBe("MPXQ2FN");
      expect(normalizeModelCode("MYD92LL/A")).toBe("MYD92LL");
      expect(normalizeModelCode("MGN63ZE/A")).toBe(normalizeModelCode("MGN63ZE"));
      expect(normalizeModelCode("Cod: MQ9X3DN/A")).toBe("MQ9X3DN");
    });

    test("rejects capacities and measurements", () => {
      for (const raw of ["128GB", "512GB", "1TB", "1200W", "144HZ", "5000MAH", "20000mAh"]) {
        expect(normalizeModelCode(raw)).toBeNull();
      }
      expect(normalizeModelCode("1000000MM")).toBeNull();
    });

    test("rejects resolutions, memory and interface names", () => {
      for (const raw of [
        "1920X1080",
        "3840x2160",
        "1920X1080P",
        "DDR5",
        "DDR5600",
        "LPDDR5X",
        "GDDR6X",
        "LGA1700",
        "PCIE40",
        "NVME2280",
        "USB3.0",
        "USB-C3",
        "HDMI21",
        "WIFI6E",
        "SATA3",
      ]) {
        expect(normalizeModelCode(raw)).toBeNull();
      }
    });

    test("rejects codes with fewer than 3 distinct characters", () => {
      expect(normalizeModelCode("AAAAA1")).toBeNull();
      expect(normalizeModelCode("AA1111")).toBeNull();
      expect(normalizeModelCode("A1A1A1A1")).toBeNull();
      expect(normalizeModelCode("AB1111")).toBe("AB1111");
    });

    test("rejects codes that start with a placeholder word", () => {
      for (const raw of [
        "TEST1",
        "TEST12",
        "TEST123",
        "test-1234",
        "SAMPLE1",
        "SAMPLE-123",
        "UNKNOWN1",
        "DEFAULT1",
        "NULL1234",
        "NONE123",
      ]) {
        expect(normalizeModelCode(raw)).toBeNull();
      }
    });

    test("keeps a placeholder word that is not at the start of the code", () => {
      expect(normalizeModelCode("AB-TEST123")).toBe("ABTEST123");
      expect(normalizeModelCode("NU1234LL")).toBe("NU1234LL");
    });

    test("rejects codes made only of specification words and digits", () => {
      for (const raw of [
        "8GB-DDR4",
        "256GB SSD",
        "1TB HDD",
        "512GB-SSD",
        "16GB RAM",
        "RAM8GB",
        "DDR4 3200MHz",
        "M.2 2280",
        "M2-2280",
        "UHD630",
        "FHD1920",
        "USB3 HDMI2",
        "2400MHZ-4GHZ",
      ]) {
        expect(normalizeModelCode(raw)).toBeNull();
      }
    });

    test("keeps a code that only contains a specification word", () => {
      for (const raw of [
        "CT1000P3SSD8",
        "SSDPEKNW010T8X1",
        "SSDSC2KB480G8",
        "USB3S2SAT3CB",
        "HDMI2VGAE",
        "SATA2IDE",
        "HDD1000X2",
      ]) {
        expect(normalizeModelCode(raw)).toBe(raw);
      }
    });

    test("rejects a resolution but keeps Lenovo codes that start with digits, X and digits", () => {
      for (const raw of ["1920X1080", "1920x1080p", "2560X1440", "1366X768", "3840X2160"]) {
        expect(normalizeModelCode(raw)).toBeNull();
      }
      for (const raw of ["20X3004DRI", "20X1S0DK00", "81X8005XRM", "82X70042RM"]) {
        expect(normalizeModelCode(raw)).toBe(raw);
      }
    });
  });

  describe("free text", () => {
    test("rejects a value with more than two words", () => {
      expect(normalizeModelCode("Full HD 1080p")).toBeNull();
      expect(normalizeModelCode("Samsung Galaxy S24 Ultra 256GB")).toBeNull();
      expect(normalizeModelCode("WDS 200 T4G0E")).toBeNull();
      expect(normalizeModelCode("SSD WD Blue SN5000 2TB")).toBeNull();
    });

    test("accepts up to two words", () => {
      expect(normalizeModelCode("WDS200 T4G0E")).toBe("WDS200T4G0E");
      expect(normalizeModelCode("XPS 9530")).toBe("XPS9530");
      expect(normalizeModelCode("GV-N406TGAMING OC-16GD")).toBe("GVN406TGAMINGOC16GD");
    });

    test("does not count a lone dash or slash as a word", () => {
      expect(normalizeModelCode("WDS100T4G0E - 00CPS0")).toBe("WDS100T4G0E");
      expect(normalizeModelCode("MZ-V9P1T0BW / EU")).toBe("MZV9P1T0BW");
    });

    test("counts the words of the first value of a list only", () => {
      expect(normalizeModelCode("WDS200T4G0E, alt model nou")).toBe("WDS200T4G0E");
      expect(normalizeModelCode("alt model nou, WDS200T4G0E")).toBeNull();
    });

    test("counts the words after the label is cut", () => {
      expect(normalizeModelCode("Cod produs: WDS200T4G0E")).toBe("WDS200T4G0E");
      expect(normalizeModelCode("Cod produs: WDS200T4G0E (EU)")).toBe("WDS200T4G0E");
      expect(normalizeModelCode("Cod produs: WDS 200 T4G0E")).toBeNull();
    });
  });

  describe("length", () => {
    test("accepts the shortest valid code of 6 characters", () => {
      expect(normalizeModelCode("A1B2C3")).toBe("A1B2C3");
      expect(normalizeModelCode("a12345")).toBe("A12345");
    });

    test("rejects codes shorter than 6 characters", () => {
      expect(normalizeModelCode("A1B2C")).toBeNull();
      expect(normalizeModelCode("A1B2")).toBeNull();
      expect(normalizeModelCode("A1")).toBeNull();
      expect(normalizeModelCode("ABC")).toBeNull();
      // 6 caractere în total, dar doar 5 rămân după curățare
      expect(normalizeModelCode("A1B2C!")).toBeNull();
    });

    test("accepts a code of exactly 64 characters and rejects 65", () => {
      expect(normalizeModelCode(`A1${"B".repeat(62)}`)).toBe(`A1${"B".repeat(62)}`);
      expect(normalizeModelCode(`A1${"B".repeat(63)}`)).toBeNull();
    });

    test("rejects an overlong value without scanning it all", () => {
      expect(normalizeModelCode(`A1${"B".repeat(100_000)}`)).toBeNull();
    });

    test("reads only the first 256 characters of a long value", () => {
      const started = performance.now();

      for (const raw of [
        "A".repeat(90_000),
        "A1 ".repeat(30_000),
        "-A1".repeat(30_000),
      ]) {
        expect(normalizeModelCode(raw)).toBeNull();
      }
      expect(normalizeModelCode("WDS200T4G0E-".repeat(8000))).toBe(
        "WDS200T4G0E"
      );
      expect(performance.now() - started).toBeLessThan(250);
    });

    test("ignores whatever follows the 256th character", () => {
      const code = "WDS200T4G0E";

      expect(normalizeModelCode(`${code}${" ".repeat(245)}`)).toBe(code);
      expect(normalizeModelCode(`${code}${" ".repeat(245)}ZZZZ`)).toBe(code);
      expect(normalizeModelCode(`${" ".repeat(256)}${code}`)).toBeNull();
    });
  });

  test("rejects purely numeric codes", () => {
    expect(normalizeModelCode("12345678")).toBeNull();
    expect(normalizeModelCode("123456")).toBeNull();
    expect(normalizeModelCode("1234-5678")).toBeNull();
  });

  test("rejects codes without digits", () => {
    expect(normalizeModelCode("ABCDEFG")).toBeNull();
    expect(normalizeModelCode("Samsung")).toBeNull();
    expect(normalizeModelCode("ABC-DEFG")).toBeNull();
  });

  test("rejects empty, blank and separator-only input", () => {
    expect(normalizeModelCode("")).toBeNull();
    expect(normalizeModelCode("   ")).toBeNull();
    expect(normalizeModelCode("-----")).toBeNull();
    expect(normalizeModelCode("–—")).toBeNull();
    expect(normalizeModelCode("💾💾💾💾💾💾")).toBeNull();
  });
});

describe("cleanIdentifiers", () => {
  test("keeps a valid GTIN and a normalized model code", () => {
    expect(
      cleanIdentifiers({ ean: ALTEX_GTIN_12, mpn: "wds100t4g0e-00cps0" })
    ).toEqual({
      ean: ALTEX_GTIN_12,
      mpn: "WDS100T4G0E",
      stored: { ean: ALTEX_GTIN_12, mpn: "WDS100T4G0E" },
    });
  });

  test("writes the canonical form of a GTIN with leading zeros", () => {
    const cleaned = cleanIdentifiers({ ean: `0${ALTEX_GTIN_12}` });

    expect(cleaned.ean).toBe(ALTEX_GTIN_12);
    expect(cleaned.stored.ean).toBe(ALTEX_GTIN_12);
  });

  test("drops the fake eMAG gtin and keeps the model code", () => {
    const cleaned = cleanIdentifiers({
      ean: "WDS200T4G0E",
      mpn: "WDS200T4G0E",
    });

    expect(cleaned.ean).toBeUndefined();
    expect(cleaned.mpn).toBe("WDS200T4G0E");
    expect(cleaned.stored).toEqual({ ean: null, mpn: "WDS200T4G0E" });
  });

  test("handles an Altex request that has no model code", () => {
    const cleaned = cleanIdentifiers({ ean: ALTEX_GTIN_12 });

    expect(cleaned.ean).toBe(ALTEX_GTIN_12);
    expect(cleaned.mpn).toBeUndefined();
    expect(cleaned.stored).toEqual({ ean: ALTEX_GTIN_12, mpn: null });
  });

  test("handles a PC Garage request that has no GTIN", () => {
    const cleaned = cleanIdentifiers({ mpn: "WDS100T4G0E-00CPS0" });

    expect(cleaned.ean).toBeUndefined();
    expect(cleaned.mpn).toBe("WDS100T4G0E");
    expect(cleaned.stored).toEqual({ ean: null, mpn: "WDS100T4G0E" });
  });

  test("trims the GTIN before checking it", () => {
    expect(cleanIdentifiers({ ean: ` ${GTIN_13}\n` }).ean).toBe(GTIN_13);
  });

  test("drops an invalid GTIN of the right length", () => {
    const cleaned = cleanIdentifiers({ ean: "4006381333940" });

    expect(cleaned.ean).toBeUndefined();
    expect(cleaned.stored.ean).toBeNull();
  });

  test("drops model codes that are placeholders or too generic", () => {
    for (const mpn of ["12345678", "ABC", "", "   ", "128GB", "AAAAA1", "TEST1", "Cod: N/A1"]) {
      const cleaned = cleanIdentifiers({ mpn });
      expect(cleaned.mpn).toBeUndefined();
      expect(cleaned.stored.mpn).toBeNull();
    }
  });

  test("drops overlong values instead of failing", () => {
    const cleaned = cleanIdentifiers({
      ean: "1".repeat(5000),
      mpn: `A1${"B".repeat(5000)}`,
    });

    expect(cleaned.ean).toBeUndefined();
    expect(cleaned.mpn).toBeUndefined();
    expect(cleaned.stored).toEqual({ ean: null, mpn: null });
  });

  test("keeps the stored identifiers when the request has none", () => {
    const existing = { ean: GTIN_13, mpn: "WDS200T4G0E" };
    const cleaned = cleanIdentifiers({}, existing);

    expect(cleaned.ean).toBeUndefined();
    expect(cleaned.mpn).toBeUndefined();
    expect(cleaned.stored).toEqual(existing);
  });

  test("keeps the stored identifiers when the request values are invalid", () => {
    const existing = { ean: GTIN_13, mpn: "WDS200T4G0E" };
    const cleaned = cleanIdentifiers({ ean: "WDS200T4G0E", mpn: "123" }, existing);

    expect(cleaned.ean).toBeUndefined();
    expect(cleaned.mpn).toBeUndefined();
    expect(cleaned.stored).toEqual(existing);
  });

  test("never replaces a stored identifier with a different valid one", () => {
    const existing = { ean: GTIN_13, mpn: "WDS200T4G0E" };
    const cleaned = cleanIdentifiers(
      { ean: GTIN_8, mpn: "SM-S921BZKDEUE" },
      existing
    );

    expect(cleaned.ean).toBeUndefined();
    expect(cleaned.mpn).toBeUndefined();
    expect(cleaned.stored).toEqual(existing);
  });

  test("writes nothing when the request repeats the stored identifiers", () => {
    const existing = { ean: ALTEX_GTIN_12, mpn: "WDS200T4G0E" };
    const cleaned = cleanIdentifiers(
      { ean: `0${ALTEX_GTIN_12}`, mpn: "wds200t4g0e-00cps0" },
      existing
    );

    expect(cleaned.ean).toBeUndefined();
    expect(cleaned.mpn).toBeUndefined();
    expect(cleaned.stored).toEqual(existing);
  });

  test("fills an identifier that the row does not have yet and keeps the other", () => {
    const withEan = { ean: GTIN_13, mpn: null };
    const withMpn = { ean: null, mpn: "WDS200T4G0E" };

    const first = cleanIdentifiers({ ean: GTIN_8, mpn: "wh-1000xm5" }, withEan);
    expect(first.ean).toBeUndefined();
    expect(first.mpn).toBe("WH1000XM5");
    expect(first.stored).toEqual({ ean: GTIN_13, mpn: "WH1000XM5" });

    const second = cleanIdentifiers({ ean: GTIN_8, mpn: "wh-1000xm5" }, withMpn);
    expect(second.ean).toBe(GTIN_8);
    expect(second.mpn).toBeUndefined();
    expect(second.stored).toEqual({ ean: GTIN_8, mpn: "WDS200T4G0E" });
  });

  test("treats an empty stored identifier as missing", () => {
    const cleaned = cleanIdentifiers(
      { ean: GTIN_13, mpn: "WDS200T4G0E" },
      { ean: "", mpn: "" }
    );

    expect(cleaned.stored).toEqual({ ean: GTIN_13, mpn: "WDS200T4G0E" });
    expect(cleaned.ean).toBe(GTIN_13);
    expect(cleaned.mpn).toBe("WDS200T4G0E");
  });

  test("stores nothing for a new product without identifiers", () => {
    expect(cleanIdentifiers({}).stored).toEqual({ ean: null, mpn: null });
    expect(cleanIdentifiers({}, null).stored).toEqual({ ean: null, mpn: null });
    expect(
      cleanIdentifiers({}, { ean: null, mpn: null }).stored
    ).toEqual({ ean: null, mpn: null });
  });
});
