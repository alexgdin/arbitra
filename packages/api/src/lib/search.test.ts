import { describe, expect, test } from "bun:test";

import {
  buildProductSearchText,
  escapeLike,
  normalizeSearchText,
  parseSearchTerms,
} from "./search";

function words(text: string): string[] {
  return text.split(" ").filter((word) => word.length > 0);
}

describe("normalizeSearchText", () => {
  test("lowercases and strips Romanian diacritics", () => {
    expect(normalizeSearchText("Căști Wireless")).toBe("casti wireless");
    expect(normalizeSearchText("ÎNCĂLȚĂMINTE ȘI ȚEVI")).toBe(
      "incaltaminte si tevi"
    );
  });

  test("treats comma-below and cedilla variants of s and t alike", () => {
    expect(normalizeSearchText("ș ş ț ţ Ș Ş Ț Ţ")).toBe("s t");
    expect(normalizeSearchText("Șoricel")).toBe(normalizeSearchText("Şoricel"));
    expect(normalizeSearchText("Țară")).toBe(normalizeSearchText("Ţară"));
  });

  test("replaces punctuation with single spaces and trims", () => {
    expect(normalizeSearchText("  Mouse,   wireless (Negru)!  ")).toBe(
      "mouse wireless negru"
    );
    expect(normalizeSearchText("27 inch, QHD / 165Hz")).toBe("27 inch qhd 165hz");
  });

  test("keeps digits and returns an empty string for empty or symbol-only input", () => {
    expect(normalizeSearchText("")).toBe("");
    expect(normalizeSearchText("   ")).toBe("");
    expect(normalizeSearchText("-- / ,, !!")).toBe("");
    expect(normalizeSearchText("SSD 990 PRO 1TB")).toBe("ssd 990 pro 1tb");
  });

  test("appends the compact variant of hyphen-joined model codes", () => {
    const text = words(normalizeSearchText("Sony WH-1000XM5"));

    expect(text).toContain("wh");
    expect(text).toContain("1000xm5");
    expect(text).toContain("wh1000xm5");
    expect(text).toContain("sony");
  });

  test("appends the compact variant of slash-joined tokens", () => {
    const text = words(normalizeSearchText("Laptop 16/512 GB"));

    expect(text).toContain("16");
    expect(text).toContain("512");
    expect(text).toContain("16512");
  });

  test("compacts every part of tokens with several separators", () => {
    expect(words(normalizeSearchText("Model A-B-7"))).toContain("ab7");
  });

  test("does not add variants for plain words or standalone hyphens", () => {
    expect(normalizeSearchText("Sony - Căști")).toBe("sony casti");
    expect(normalizeSearchText("Mouse")).toBe("mouse");
  });

  test("does not repeat words", () => {
    expect(normalizeSearchText("wh-1000xm5 wh1000xm5")).toBe(
      "wh 1000xm5 wh1000xm5"
    );
  });

  test("is stable when applied twice", () => {
    const once = normalizeSearchText("Sony WH-1000XM5, Căști");
    expect(normalizeSearchText(once)).toBe(once);
  });

  test("handles joined tokens that follow other characters", () => {
    expect(words(normalizeSearchText("(WH-1000XM5)"))).toContain("wh1000xm5");
    expect(words(normalizeSearchText("sony,wh-1000xm5"))).toContain(
      "wh1000xm5"
    );
    expect(words(normalizeSearchText("SM–S921B"))).toContain("sms921b");
  });

  describe("performance", () => {
    // Un singur cuvânt uriaș, fără separator: înainte, regexul îl reparcurgea de la fiecare poziție.
    test("stays linear for a 1 MB single token", () => {
      const start = performance.now();
      const text = normalizeSearchText("a".repeat(1_000_000));

      expect(performance.now() - start).toBeLessThan(100);
      expect(text).toHaveLength(1_000_000);
    });

    test("stays linear for a long token with a trailing separator", () => {
      const start = performance.now();
      normalizeSearchText(`${"a1".repeat(100_000)}-`);
      normalizeSearchText(`${"a1".repeat(100_000)}-b`);

      expect(performance.now() - start).toBeLessThan(100);
    });

    test("still compacts a long joined token", () => {
      const compact = words(normalizeSearchText(`${"a".repeat(50_000)}-b`));

      expect(compact).toContain(`${"a".repeat(50_000)}b`);
    });
  });
});

describe("buildProductSearchText", () => {
  test("joins the normalized title and the ean", () => {
    expect(buildProductSearchText("Căști Sony", "4548736132580")).toBe(
      "casti sony 4548736132580"
    );
  });

  test("works without an ean", () => {
    expect(buildProductSearchText("Căști Sony")).toBe("casti sony");
    expect(buildProductSearchText("Căști Sony", null)).toBe("casti sony");
    expect(buildProductSearchText("Căști Sony", "")).toBe("casti sony");
  });

  test("appends the model code after the ean", () => {
    expect(buildProductSearchText("SSD WD Blue", "718037904610", "WDS200T4G0E")).toBe(
      "ssd wd blue 718037904610 wds200t4g0e"
    );
    expect(buildProductSearchText("SSD WD Blue", null, "WDS200T4G0E")).toBe(
      "ssd wd blue wds200t4g0e"
    );
    expect(buildProductSearchText("SSD WD Blue", undefined, "WDS200T4G0E")).toBe(
      "ssd wd blue wds200t4g0e"
    );
  });

  test("ignores an empty model code", () => {
    expect(buildProductSearchText("SSD WD Blue", "718037904610", "")).toBe(
      "ssd wd blue 718037904610"
    );
    expect(buildProductSearchText("SSD WD Blue", null, null)).toBe(
      "ssd wd blue"
    );
  });

  test("makes a product findable by its model code, in any case", () => {
    const text = buildProductSearchText("SSD intern WD Blue SN5000, 1TB", null, "WDS100T4G0E");

    for (const query of ["WDS100T4G0E", "wds100t4g0e", "  Wds100T4g0e "]) {
      for (const term of parseSearchTerms(query)) {
        expect(text).toContain(term);
      }
    }
  });

  test("makes the raw model code searchable, with and without its suffix", () => {
    const text = buildProductSearchText(
      "SSD intern WD Blue SN5000, 1TB",
      null,
      "WDS100T4G0E",
      "WDS100T4G0E-00CPS0"
    );

    for (const query of [
      "WDS100T4G0E-00CPS0",
      "wds100t4g0e-00cps0",
      "WDS100T4G0E",
      "00CPS0",
      "wds100t4g0e00cps0",
    ]) {
      for (const term of parseSearchTerms(query)) {
        expect(words(text)).toContain(term);
      }
    }
  });

  test("keeps the stored code searchable when the raw code has other segments", () => {
    const text = buildProductSearchText(
      "SSD Sandisk Extreme",
      null,
      "SDSSDE61500G",
      "SDSSDE61-500G-G25"
    );

    expect(words(text)).toContain("sdssde61500g");
    expect(words(text)).toContain("g25");
  });

  test("does not repeat a word that appears in several fields", () => {
    const text = buildProductSearchText(
      "Sony WH-1000XM5",
      "4548736132580",
      "WH1000XM5",
      "WH-1000XM5"
    );
    const all = words(text);

    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain("wh1000xm5");
    expect(all).toContain("4548736132580");
  });

  test("ignores an empty raw model code", () => {
    expect(
      buildProductSearchText("SSD WD Blue", null, "WDS200T4G0E", "")
    ).toBe("ssd wd blue wds200t4g0e");
    expect(
      buildProductSearchText("SSD WD Blue", null, "WDS200T4G0E", null)
    ).toBe("ssd wd blue wds200t4g0e");
  });

  describe("long input", () => {
    test("indexes only the first 300 characters of the title", () => {
      const title = `${"a".repeat(299)} tail`;
      const text = buildProductSearchText(title);

      expect(text).toBe(`${"a".repeat(299)}`);
      expect(buildProductSearchText(`${"a".repeat(300)}b`)).toBe("a".repeat(300));
    });

    test("keeps a title of exactly 300 characters whole", () => {
      const title = `${"a".repeat(295)} wxyz`;

      expect(title).toHaveLength(300);
      expect(words(buildProductSearchText(title))).toEqual(["a".repeat(295), "wxyz"]);
    });

    test("finishes quickly for a 1 MB single-token title", () => {
      const start = performance.now();
      const text = buildProductSearchText("a".repeat(1_000_000), "718037904610", "WDS200T4G0E");

      expect(performance.now() - start).toBeLessThan(50);
      expect(words(text)).toEqual(["a".repeat(300), "718037904610", "wds200t4g0e"]);
    });

    test("finishes quickly for a 1 MB title with many separators", () => {
      const start = performance.now();
      buildProductSearchText("a-".repeat(500_000));
      buildProductSearchText("a1 ".repeat(300_000));

      expect(performance.now() - start).toBeLessThan(50);
    });
  });

  test("finds model codes written in any of the supported forms", () => {
    const text = buildProductSearchText(
      "Căști wireless Sony WH-1000XM5, Negru",
      "4548736132580"
    );

    for (const query of ["wh1000xm5", "wh-1000xm5", "1000xm5", "WH 1000XM5"]) {
      for (const term of parseSearchTerms(query)) {
        expect(text).toContain(term);
      }
    }
  });
});

describe("parseSearchTerms", () => {
  test("splits into normalized words", () => {
    expect(parseSearchTerms("  Căști   SONY ")).toEqual(["casti", "sony"]);
  });

  test("removes duplicates and keeps the first occurrence order", () => {
    expect(parseSearchTerms("sony Sony casti SONY")).toEqual(["sony", "casti"]);
  });

  test("splits separators without adding compact variants", () => {
    expect(parseSearchTerms("wh-1000xm5")).toEqual(["wh", "1000xm5"]);
    expect(parseSearchTerms("wh1000xm5")).toEqual(["wh1000xm5"]);
  });

  test("keeps single character terms", () => {
    expect(parseSearchTerms("s 24")).toEqual(["s", "24"]);
  });

  test("returns an empty list for empty or symbol-only input", () => {
    expect(parseSearchTerms("")).toEqual([]);
    expect(parseSearchTerms("   ")).toEqual([]);
    expect(parseSearchTerms("%_ \\ -")).toEqual([]);
  });

  test("caps the number of terms", () => {
    expect(parseSearchTerms("a b c d e f g h")).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
    ]);
    expect(parseSearchTerms("a b c d", 2)).toEqual(["a", "b"]);
    expect(parseSearchTerms("a b c", 0)).toEqual([]);
  });

  test("counts only unique words against the cap", () => {
    expect(parseSearchTerms("a a a b b c", 3)).toEqual(["a", "b", "c"]);
  });
});

describe("escapeLike", () => {
  test("escapes backslash, percent and underscore", () => {
    expect(escapeLike("50%")).toBe("50\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("a\\b")).toBe("a\\\\b");
    expect(escapeLike("%_\\")).toBe("\\%\\_\\\\");
  });

  test("leaves ordinary text unchanged", () => {
    expect(escapeLike("casti sony 1000xm5")).toBe("casti sony 1000xm5");
    expect(escapeLike("")).toBe("");
  });
});
