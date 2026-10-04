import { beforeEach, describe, expect, test } from "bun:test";

import content from "../src/content.js";

const { IDLE_MS, MAX_ATTEMPTS, POLL_MS, createPageWatcher, pageKey } = content;

const PRODUCT_A = "https://www.emag.ro/ssd-a/pd/AAA/";
const PRODUCT_B = "https://www.emag.ro/ssd-b/pd/BBB/";

/** Un ceas și un planificator false, controlate de test. */
function createHarness() {
  const harness = {
    clock: 1_000_000,
    url: PRODUCT_A,
    timers: [],
    nextTimerId: 1,
    extractCalls: 0,
    // ce întoarce extractorul la a n-a încercare; implicit un produs de la prima
    extractAt: (_attempt) => ({ title: "produs" }),
    products: [],
    resets: [],
  };

  const watcher = createPageWatcher({
    getUrl: () => harness.url,
    extract: () => {
      harness.extractCalls += 1;
      return harness.extractAt(harness.extractCalls);
    },
    onProduct: (observation, key) => harness.products.push({ observation, key }),
    onReset: (key) => harness.resets.push(key),
    now: () => harness.clock,
    setTimer: (callback, ms) => {
      const id = harness.nextTimerId++;
      harness.timers.push({ id, callback, at: harness.clock + ms });
      return id;
    },
    clearTimer: (id) => {
      harness.timers = harness.timers.filter((timer) => timer.id !== id);
    },
  });

  /** Mută timpul înainte și rulează temporizatoarele scadente, în ordine. */
  harness.advance = (ms) => {
    const target = harness.clock + ms;
    for (;;) {
      const due = harness.timers.filter((timer) => timer.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) {
        break;
      }
      harness.timers = harness.timers.filter((timer) => timer !== due);
      harness.clock = due.at;
      due.callback();
    }
    harness.clock = target;
  };
  harness.watcher = watcher;
  return harness;
}

describe("pageKey", () => {
  test("ignoră query-ul și hash-ul", () => {
    expect(pageKey("https://www.emag.ro/x/pd/A/?ref=1#reviews")).toBe("https://www.emag.ro/x/pd/A/");
    expect(pageKey("https://www.emag.ro/x/pd/A/")).toBe("https://www.emag.ro/x/pd/A/");
  });

  test("produse diferite au chei diferite, iar un text care nu e URL rămâne ca atare", () => {
    expect(pageKey(PRODUCT_A)).not.toBe(pageKey(PRODUCT_B));
    expect(pageKey("nu e url")).toBe("nu e url");
  });
});

describe("createPageWatcher", () => {
  /** @type {ReturnType<typeof createHarness>} */
  let h;

  beforeEach(() => {
    h = createHarness();
  });

  test("la start extrage imediat și raportează produsul o singură dată", () => {
    h.watcher.start();

    expect(h.resets).toEqual([PRODUCT_A]);
    expect(h.products).toEqual([{ observation: { title: "produs" }, key: PRODUCT_A }]);

    h.advance(POLL_MS * 20);

    expect(h.products).toHaveLength(1);
    expect(h.extractCalls).toBe(1);
  });

  test("reîncearcă până apare produsul și apoi se oprește din extras", () => {
    h.extractAt = (attempt) => (attempt === 3 ? { title: "tardiv" } : null);

    h.watcher.start();
    expect(h.products).toHaveLength(0);
    h.advance(POLL_MS * 5);

    expect(h.products).toEqual([{ observation: { title: "tardiv" }, key: PRODUCT_A }]);
    expect(h.extractCalls).toBe(3);
  });

  test("pagină fără produs: cel mult MAX_ATTEMPTS încercări", () => {
    h.extractAt = () => null;

    h.watcher.start();
    h.advance(POLL_MS * 60);

    expect(h.extractCalls).toBe(MAX_ATTEMPTS);
    expect(h.products).toHaveLength(0);
  });

  test("navigare fără reîncărcare: resetează și raportează noul produs", () => {
    h.watcher.start();
    h.url = PRODUCT_B;
    h.advance(POLL_MS);

    expect(h.resets).toEqual([PRODUCT_A, PRODUCT_B]);
    expect(h.products.map((product) => product.key)).toEqual([PRODUCT_A, PRODUCT_B]);
    expect(h.watcher.currentKey()).toBe(PRODUCT_B);
  });

  test("schimbarea doar a query-ului sau a hash-ului nu este o pagină nouă", () => {
    h.watcher.start();
    h.url = `${PRODUCT_A}?utm_source=x#specs`;
    h.advance(POLL_MS * 3);

    expect(h.resets).toEqual([PRODUCT_A]);
    expect(h.products).toHaveLength(1);
  });

  test("după inactivitate se oprește singur, fără temporizatoare rămase", () => {
    h.watcher.start();
    h.advance(IDLE_MS + POLL_MS * 2);

    expect(h.timers).toHaveLength(0);
  });

  test("o navigare după oprire este prinsă prin wake()", () => {
    h.watcher.start();
    h.advance(IDLE_MS + POLL_MS * 2);
    h.url = PRODUCT_B;

    h.watcher.wake();

    expect(h.products.map((product) => product.key)).toEqual([PRODUCT_A, PRODUCT_B]);
    expect(h.timers).toHaveLength(1); // a reluat verificările
  });

  test("wake() cât timp rulează verifică imediat, fără al doilea temporizator", () => {
    h.watcher.start();
    h.url = PRODUCT_B;

    h.watcher.wake();

    expect(h.products.map((product) => product.key)).toEqual([PRODUCT_A, PRODUCT_B]);
    expect(h.timers).toHaveLength(1);
  });

  test("inactivitatea se numără de la ultima schimbare de URL", () => {
    h.watcher.start();
    h.advance(IDLE_MS - POLL_MS * 5);
    h.url = PRODUCT_B;
    h.advance(POLL_MS);
    h.advance(IDLE_MS - POLL_MS * 5);

    expect(h.timers).toHaveLength(1);
  });

  test("stop() anulează temporizatorul", () => {
    h.watcher.start();
    h.watcher.stop();

    expect(h.timers).toHaveLength(0);

    h.watcher.stop();
    expect(h.timers).toHaveLength(0);
  });
});
