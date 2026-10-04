import { describe, expect, test } from "bun:test";

import { hasControlChars } from "./text";

describe("hasControlChars", () => {
  test("is true for NUL, tab, newline, escape and delete", () => {
    for (const value of ["\u0000", "a\u0000", "\tx", "x\ny", "x\r", "\u001b[0m", "x\u007f"]) {
      expect(hasControlChars(value)).toBe(true);
    }
  });

  test("is false for text without control characters", () => {
    for (const value of ["", "abc", "a b", "Ștefan", "™", "💾", "\u0080", " ", " "]) {
      expect(hasControlChars(value)).toBe(false);
    }
  });
});
