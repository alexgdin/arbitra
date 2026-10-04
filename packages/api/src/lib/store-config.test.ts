import { describe, expect, test } from "bun:test";

import {
  canonicalProductUrl,
  isStoreHostname,
  isSupportedStore,
  STORE_CONFIG,
  STORE_DOMAINS,
  SUPPORTED_STORE_IDS,
} from "./store-config";

describe("supported stores", () => {
  test("lists eMAG, PC Garage and Altex", () => {
    expect([...SUPPORTED_STORE_IDS]).toEqual(["emag", "pcgarage", "altex"]);
  });

  test("have a domain and a shipping config each", () => {
    for (const store of SUPPORTED_STORE_IDS) {
      expect(STORE_DOMAINS[store]).toMatch(/^[a-z]+\.ro$/);
      expect(STORE_CONFIG[store]).toBeDefined();
    }
    expect(Object.keys(STORE_DOMAINS).sort()).toEqual(
      [...SUPPORTED_STORE_IDS].sort()
    );
  });

  test("recognizes only the exact store ids", () => {
    expect(isSupportedStore("emag")).toBe(true);
    expect(isSupportedStore("pcgarage")).toBe(true);
    expect(isSupportedStore("altex")).toBe(true);

    for (const other of ["eMAG", "emag ", "", "cel", "other", "__proto__", "toString", "constructor"]) {
      expect(isSupportedStore(other)).toBe(false);
    }
  });
});

describe("isStoreHostname", () => {
  test("accepts the domain and its subdomains", () => {
    expect(isStoreHostname("emag", "emag.ro")).toBe(true);
    expect(isStoreHostname("emag", "www.emag.ro")).toBe(true);
    expect(isStoreHostname("emag", "a.b.emag.ro")).toBe(true);
    expect(isStoreHostname("pcgarage", "www.pcgarage.ro")).toBe(true);
    expect(isStoreHostname("altex", "altex.ro")).toBe(true);
  });

  test("rejects look-alike and unrelated hosts", () => {
    expect(isStoreHostname("emag", "notemag.ro")).toBe(false);
    expect(isStoreHostname("emag", "emag.ro.evil.example")).toBe(false);
    expect(isStoreHostname("emag", "evil.example")).toBe(false);
    expect(isStoreHostname("emag", "emag.com")).toBe(false);
    expect(isStoreHostname("emag", "emagro")).toBe(false);
    expect(isStoreHostname("emag", ".emag.ro.")).toBe(false);
    expect(isStoreHostname("emag", "")).toBe(false);
  });

  test("rejects the domain of another store", () => {
    expect(isStoreHostname("emag", "www.altex.ro")).toBe(false);
    expect(isStoreHostname("altex", "www.pcgarage.ro")).toBe(false);
    expect(isStoreHostname("pcgarage", "emag.ro")).toBe(false);
  });
});

describe("canonicalProductUrl", () => {
  test("keeps an https link on the store, with the host in lower case and only the path", () => {
    const cases: [string, string][] = [
      ["https://www.emag.ro/ssd/pd/ABC/", "https://www.emag.ro/ssd/pd/ABC/"],
      ["HTTPS://WWW.EMAG.RO/Ssd", "https://www.emag.ro/Ssd"],
      ["https://www.emag.ro", "https://www.emag.ro/"],
      ["https://www.emag.ro/ssd?utm_source=x&y=1", "https://www.emag.ro/ssd"],
      ["https://www.emag.ro/ssd#reviews", "https://www.emag.ro/ssd"],
      ["https://www.emag.ro/ssd?x=1#reviews", "https://www.emag.ro/ssd"],
      ["https://www.emag.ro:443/ssd", "https://www.emag.ro/ssd"],
      ["  https://www.emag.ro/ssd \n", "https://www.emag.ro/ssd"],
      ["https://www.emag.ro/a b", "https://www.emag.ro/a%20b"],
      ["https://www.emag.ro/a/../b", "https://www.emag.ro/b"],
    ];

    for (const [raw, expected] of cases) {
      expect(canonicalProductUrl(raw)).toBe(expected);
    }
  });

  test("rejects http, other schemes and text that is not a URL", () => {
    for (const raw of [
      "http://www.emag.ro/ssd",
      "HTTP://www.emag.ro/ssd",
      "ftp://www.emag.ro/ssd",
      "javascript:alert(1)",
      "data:text/html,x",
      "file:///etc/passwd",
      "//www.emag.ro/ssd",
      "www.emag.ro/ssd",
      "/ssd",
      "",
      "   ",
      "not a url",
    ]) {
      expect(canonicalProductUrl(raw)).toBeNull();
    }
  });

  test("rejects userinfo, whatever the host", () => {
    for (const raw of [
      "https://user@www.emag.ro/x",
      "https://user:pass@www.emag.ro/x",
      "https://evil.example@emag.ro/x",
      "https://:pass@www.emag.ro/x",
      "https://www.emag.ro:pass@evil.example/x",
    ]) {
      expect(canonicalProductUrl(raw)).toBeNull();
    }
  });

  test("rejects a port other than the default one of https", () => {
    for (const raw of [
      "https://www.emag.ro:8443/x",
      "https://www.emag.ro:80/x",
      "https://www.emag.ro:1/x",
    ]) {
      expect(canonicalProductUrl(raw)).toBeNull();
    }
  });

  test("rejects control characters anywhere, even the ones the URL parser would drop", () => {
    for (const raw of [
      "https://www.emag.ro/x\u0000",
      "https://www.emag.ro/\u0000x",
      "https://www.em\nag.ro/x",
      "https://www.em\tag.ro/x",
      "https://www.emag.ro/x\ry",
      "https://www.emag.ro/\u007fx",
      "\u0000https://www.emag.ro/x",
    ]) {
      expect(canonicalProductUrl(raw)).toBeNull();
    }
  });

  test("keeps an escaped control character as text", () => {
    expect(canonicalProductUrl("https://www.emag.ro/x%00y")).toBe(
      "https://www.emag.ro/x%00y"
    );
  });

  test("does not check the host, which is the store's job", () => {
    expect(canonicalProductUrl("https://evil.example/x")).toBe("https://evil.example/x");
  });

  test("gives a string with no query, hash, userinfo or port, whatever the input", () => {
    const url = new URL(
      canonicalProductUrl("HTTPS://WWW.EMAG.RO:443/a?b=c#d") as string
    );

    expect(url.search).toBe("");
    expect(url.hash).toBe("");
    expect(url.username).toBe("");
    expect(url.password).toBe("");
    expect(url.port).toBe("");
    expect(url.protocol).toBe("https:");
  });

  test("is stable when applied twice", () => {
    for (const raw of ["HTTPS://WWW.EMAG.RO/A%20B?x=1", "https://www.emag.ro/a b/c"]) {
      const once = canonicalProductUrl(raw) as string;

      expect(canonicalProductUrl(once)).toBe(once);
    }
  });
});
