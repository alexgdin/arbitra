import { describe, expect, test } from "bun:test";

import { bani, brokerBani, INT4_MAX, MAX_BANI, withoutControlChars } from "./schemas";

describe("bani", () => {
  test("has a ceiling of 100,000 RON, well under what the column can store", () => {
    expect(MAX_BANI).toBe(10_000_000);
    expect(INT4_MAX).toBe(2_147_483_647);
    expect(MAX_BANI).toBeLessThan(INT4_MAX);
  });

  test("accepts whole positive amounts up to the ceiling", () => {
    for (const value of [1, 12_999, 1_000_000, MAX_BANI]) {
      expect(bani.safeParse(value).success).toBe(true);
    }
  });

  test("rejects zero, negatives, fractions, non-numbers and anything above the ceiling", () => {
    for (const value of [0, -1, 0.5, MAX_BANI + 1, 21_000_000, INT4_MAX, "100", null, Number.NaN]) {
      expect(bani.safeParse(value).success).toBe(false);
    }
  });
});

describe("brokerBani", () => {
  test("accepts budgets above the price ceiling, up to the largest int4", () => {
    for (const value of [1, MAX_BANI, MAX_BANI + 1, 50_000_000, INT4_MAX]) {
      expect(brokerBani.safeParse(value).success).toBe(true);
    }
  });

  test("rejects zero, negatives, fractions and what does not fit in the column", () => {
    for (const value of [0, -1, 0.5, INT4_MAX + 1, 1e12, "100"]) {
      expect(brokerBani.safeParse(value).success).toBe(false);
    }
  });
});

describe("withoutControlChars", () => {
  test("accepts printable text, spaces and non-ASCII characters", () => {
    for (const value of ["", "SSD WD Blue", "Căști Sony ™ 日本語", "a/b-c_d", " ", "\u0080", " "]) {
      expect(withoutControlChars(value)).toBe(true);
    }
  });

  test("rejects every control character from U+0000 to U+001F and U+007F, anywhere", () => {
    for (let code = 0; code <= 0x1f; code++) {
      const char = String.fromCharCode(code);
      expect(withoutControlChars(`a${char}b`)).toBe(false);
      expect(withoutControlChars(char)).toBe(false);
    }
    expect(withoutControlChars("a\u007fb")).toBe(false);
  });
});
