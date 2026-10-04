import { describe, expect, test } from "bun:test";

import overlay from "../src/overlay.js";

const { buildViewModel, formatDiff, formatMoney, safeHref } = overlay;

/** Intl ro-RO folosește spațiu fix între sumă și monedă. */
const plain = (value) => value.replaceAll(" ", " ");

const OBSERVATION = {
  store: "emag",
  title: "Solid State Drive (SSD) Western Digital Green SN3000 NVMe SSD, 2TB",
  price: 149_077,
  currency: "RON",
};

const offer = (store, price, overrides = {}) => ({
  productId: `${store}-${price}`,
  store,
  price,
  inStock: true,
  url: `https://example.com/${store}`,
  lastCheckedAt: null,
  ...overrides,
});

const item = (...offers) => ({ currency: "RON", offers });

const view = (overrides = {}) => ({
  state: "ok",
  observation: OBSERVATION,
  item: null,
  webUrl: "http://localhost:3001",
  ...overrides,
});

describe("formatare", () => {
  test("formatMoney folosește formatul ro-RO cu RON", () => {
    expect(plain(formatMoney(149_077))).toBe("1.490,77 RON");
    expect(plain(formatMoney(119_999, "RON"))).toBe("1.199,99 RON");
    expect(plain(formatMoney(5))).toBe("0,05 RON");
  });

  test("formatDiff arată semnul diferenței", () => {
    expect(plain(formatDiff(-5000))).toBe("-50,00 RON");
    expect(plain(formatDiff(2500))).toBe("+25,00 RON");
  });

  test.each([
    ["https://altex.ro/x", "https://altex.ro/x"],
    ["http://localhost:3001/a?b=1", "http://localhost:3001/a?b=1"],
    ["javascript:alert(1)", null],
    ["data:text/html,<script>1</script>", null],
    ["//evil.example", null],
    ["", null],
    [undefined, null],
    [42, null],
  ])("safeHref(%p) -> %p", (value, expected) => {
    expect(safeHref(value)).toBe(expected);
  });
});

describe("buildViewModel: când nu se afișează nimic", () => {
  test("starea disabled, starea ignored (altă monedă decât RON) sau lipsa observației", () => {
    expect(buildViewModel(view({ state: "disabled" }))).toBeNull();
    expect(buildViewModel(view({ state: "ignored" }))).toBeNull();
    expect(buildViewModel({ state: "ok", item: null })).toBeNull();
    expect(buildViewModel(undefined)).toBeNull();
  });
});

describe("buildViewModel: rândurile", () => {
  test("sar peste magazinul paginii și păstresc ordinea ofertelor", () => {
    const model = buildViewModel(
      view({ item: item(offer("altex", 119_999), offer("emag", 149_077), offer("pcgarage", 155_000)) })
    );

    expect(model.rows.map((row) => row.storeName)).toEqual(["Altex", "PC Garage"]);
  });

  test("oferta mai ieftină: diferență negativă, ton verde, număr pe pastilă", () => {
    const [row] = buildViewModel(view({ item: item(offer("altex", 119_999)) })).rows;

    expect(row.storeName).toBe("Altex");
    expect(plain(row.priceText)).toBe("1.199,99 RON");
    expect(plain(row.diffText)).toBe("-290,78 RON");
    expect(plain(row.diffLabel)).toBe("Cu 290,78 RON mai ieftin");
    expect(row.tone).toBe("better");
    expect(row.href).toBe("https://example.com/altex");
    expect(row.outOfStock).toBe(false);
  });

  test("oferta mai scumpă: diferență pozitivă, ton neutru", () => {
    const [row] = buildViewModel(view({ item: item(offer("pcgarage", 151_577)) })).rows;

    expect(plain(row.diffText)).toBe("+25,00 RON");
    expect(plain(row.diffLabel)).toBe("Cu 25,00 RON mai scump");
    expect(row.tone).toBe("neutral");
  });

  test("același preț", () => {
    const [row] = buildViewModel(view({ item: item(offer("altex", 149_077)) })).rows;

    expect(row.diffText).toBe("Același preț");
    expect(row.tone).toBe("neutral");
  });

  test("fără stoc: marcată, diferența nu mai este verde", () => {
    const model = buildViewModel(view({ item: item(offer("altex", 100_000, { inStock: false })) }));
    const [row] = model.rows;

    expect(row.outOfStock).toBe(true);
    expect(row.tone).toBe("muted");
    expect(row.comparable).toBe(false);
    expect(model.cheaperCount).toBe(0);
  });

  test("preț necunoscut: text de rezervă, fără diferență", () => {
    const [row] = buildViewModel(view({ item: item(offer("altex", null)) })).rows;

    expect(row.priceText).toBe("Preț indisponibil");
    expect(row.diffText).toBe("");
    expect(row.tone).toBe("muted");
  });

  test("link doar pentru URL-uri http/https", () => {
    const model = buildViewModel(
      view({
        item: item(
          offer("altex", 119_999, { url: "javascript:alert(1)" }),
          offer("pcgarage", 130_000, { url: "" }),
          offer("emag2", 140_000, { url: "https://www.emag.ro/x" })
        ),
      })
    );

    expect(model.rows.map((row) => row.href)).toEqual([null, null, "https://www.emag.ro/x"]);
  });

  test("magazin necunoscut primește numele cu majusculă", () => {
    const [row] = buildViewModel(view({ item: item(offer("evomag", 120_000)) })).rows;

    expect(row.storeName).toBe("Evomag");
  });

  test("monedă diferită față de pagină: fără diferență, ofertă necomparabilă", () => {
    const model = buildViewModel(view({ item: { currency: "EUR", offers: [offer("altex", 20_000)] } }));
    const [row] = model.rows;

    expect(plain(row.priceText)).toBe("200,00 EUR");
    expect(row.diffText).toBe("");
    expect(model.cheaperCount).toBe(0);
    expect(model.isCheapest).toBe(false);
  });
});

describe("buildViewModel: mesajele", () => {
  test("numără ofertele mai ieftine în stoc", () => {
    const model = buildViewModel(
      view({
        item: item(
          offer("altex", 119_999),
          offer("pcgarage", 140_000),
          offer("altex", 100_000, { inStock: false }),
          offer("pcgarage", 160_000)
        ),
      })
    );

    expect(model.cheaperCount).toBe(2);
    expect(model.isCheapest).toBe(false);
    expect(model.noOthers).toBe(false);
  });

  test("pagina curentă este cea mai ieftină", () => {
    const model = buildViewModel(view({ item: item(offer("altex", 160_000), offer("pcgarage", 149_077)) }));

    expect(model.cheaperCount).toBe(0);
    expect(model.isCheapest).toBe(true);
    expect(model.noOthers).toBe(false);
  });

  test("produs necunoscut: mesaj și link de căutare cu titlul codat", () => {
    const model = buildViewModel(view({ item: null }));

    expect(model.rows).toEqual([]);
    expect(model.noOthers).toBe(true);
    expect(model.isCheapest).toBe(false);
    expect(model.searchHref).toBe(
      `http://localhost:3001/cauta?q=${encodeURIComponent(OBSERVATION.title)}`
    );
  });

  test("există doar oferta paginii curente: tot fără alte prețuri", () => {
    const model = buildViewModel(view({ item: item(offer("emag", 149_077)) }));

    expect(model.noOthers).toBe(true);
  });

  test("titlul lung este tăiat la 80 de caractere în căutare", () => {
    const model = buildViewModel(
      view({ observation: { ...OBSERVATION, title: `${"a".repeat(100)} ă&b` }, webUrl: "https://pretpilot.ro/" })
    );

    expect(model.searchHref).toBe(`https://pretpilot.ro/cauta?q=${"a".repeat(80)}`);
  });

  test("deconectat: indiciu și link spre login, comparația rămâne", () => {
    const model = buildViewModel(view({ state: "logged-out", item: item(offer("altex", 119_999)) }));

    expect(model.showLoginHint).toBe(true);
    expect(model.loginHref).toBe("http://localhost:3001/login");
    expect(model.rows).toHaveLength(1);
  });

  test("conectat: fără indiciu de login", () => {
    expect(buildViewModel(view()).showLoginHint).toBe(false);
  });

  test("eroare: mesaj, fără rânduri și fără afirmații despre prețuri", () => {
    const model = buildViewModel(view({ state: "error", error: "Eroare de server (HTTP 500).", item: item(offer("altex", 1)) }));

    expect(model.errorMessage).toContain("Nu am putut încărca");
    expect(model.errorDetail).toBe("Eroare de server (HTTP 500).");
    expect(model.rows).toEqual([]);
    expect(model.noOthers).toBe(false);
    expect(model.isCheapest).toBe(false);
  });

  test("pauză după 429: mesajul prietenos apare ca detaliu al erorii", () => {
    const model = buildViewModel(
      view({ state: "error", error: "Prea multe cereri, încerc din nou în câteva minute." })
    );

    expect(model.errorMessage).toContain("Nu am putut încărca");
    expect(model.errorDetail).toBe("Prea multe cereri, încerc din nou în câteva minute.");
    expect(model.rows).toEqual([]);
  });

  test("webUrl invalid: fără linkuri către aplicația web", () => {
    const model = buildViewModel(view({ state: "logged-out", webUrl: "javascript:alert(1)" }));

    expect(model.searchHref).toBeNull();
    expect(model.loginHref).toBeNull();
  });
});
