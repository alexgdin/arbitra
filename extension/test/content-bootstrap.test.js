// Încărcarea content.js într-un mediu fals de pagină: ce mesaj trimite, ce desenează
// și ce ignoră (extensie reîncărcată, răspuns întârziat după o navigare).

import { afterEach, describe, expect, test } from "bun:test";

const GLOBALS = [
  "document",
  "window",
  "location",
  "chrome",
  "PretPilotExtract",
  "PretPilotOverlay",
  "setTimeout",
  "clearTimeout",
];
const saved = Object.fromEntries(GLOBALS.map((name) => [name, globalThis[name]]));

const PAGE = "https://www.emag.ro/ssd/pd/AAA/";
const OTHER_PAGE = "https://www.emag.ro/alt-ssd/pd/BBB/";
const OBSERVATION = { store: "emag", externalId: "AAA", title: "SSD", price: 100_000, currency: "RON", inStock: true };
const RESPONSE = {
  ok: true,
  state: "logged-out",
  ingested: null,
  item: { offers: [] },
  webUrl: "http://localhost:3001",
  error: undefined,
};

let loads = 0;

/**
 * Pregătește globalurile unei pagini de magazin și încarcă proaspăt content.js.
 * @param {{
 *   chromeId?: string | null, sendMessage?: Function, extracted?: object | null,
 *   withExtractor?: boolean, withOverlay?: boolean,
 * }} options
 */
async function loadContentScript({
  chromeId = "ext",
  sendMessage = async () => RESPONSE,
  extracted = OBSERVATION,
  withExtractor = true,
  withOverlay = true,
} = {}) {
  const env = { listeners: new Map(), rendered: [], removed: 0, sent: [], extractCalls: 0 };

  globalThis.location = { href: PAGE };
  globalThis.document = { addEventListener: (name, fn) => env.listeners.set(`document:${name}`, fn) };
  globalThis.window = {
    addEventListener: (name, fn) => env.listeners.set(`window:${name}`, fn),
    navigation: { addEventListener: (name, fn) => env.listeners.set(`navigation:${name}`, fn) },
  };
  globalThis.chrome = {
    runtime: {
      id: chromeId,
      sendMessage: (message) => {
        env.sent.push(message);
        return sendMessage(message);
      },
    },
  };
  globalThis.PretPilotExtract = withExtractor
    ? {
        extractObservation: () => {
          env.extractCalls += 1;
          return extracted;
        },
      }
    : undefined;
  globalThis.PretPilotOverlay = withOverlay
    ? {
        render: (view) => env.rendered.push(view),
        remove: () => {
          env.removed += 1;
        },
      }
    : undefined;
  // verificările periodice nu trebuie să ruleze în test
  globalThis.setTimeout = () => 1;
  globalThis.clearTimeout = () => {};

  loads += 1;
  await import(`../src/content.js?load=${loads}`);
  return env;
}

const flush = () => Bun.sleep(0);

afterEach(() => {
  for (const name of GLOBALS) {
    if (saved[name] === undefined) {
      delete globalThis[name];
    } else {
      globalThis[name] = saved[name];
    }
  }
});

describe("content.js", () => {
  test("trimite observația și pasează răspunsul panoului", async () => {
    const env = await loadContentScript();
    await flush();

    expect(env.sent).toEqual([{ type: "pretpilot:observe", observation: OBSERVATION }]);
    expect(env.rendered).toEqual([
      {
        state: "logged-out",
        observation: OBSERVATION,
        item: RESPONSE.item,
        webUrl: "http://localhost:3001",
        error: undefined,
      },
    ]);
  });

  test("ascultă navigarea fără reîncărcare", async () => {
    const env = await loadContentScript();

    expect([...env.listeners.keys()].sort()).toEqual([
      "document:visibilitychange",
      "navigation:navigatesuccess",
      "window:hashchange",
      "window:popstate",
    ]);
  });

  test("pagină fără produs: nu trimite nimic și nu desenează", async () => {
    const env = await loadContentScript({ extracted: null });
    await flush();

    expect(env.sent).toEqual([]);
    expect(env.rendered).toEqual([]);
    expect(env.removed).toBe(1);
  });

  test.each([
    ["fără extractor", { withExtractor: false }],
    ["fără panou", { withOverlay: false }],
  ])("%s: nu pornește", async (_name, options) => {
    const env = await loadContentScript(options);
    await flush();

    expect(env.listeners.size).toBe(0);
    expect(env.sent).toEqual([]);
  });

  test("extensie reîncărcată: nu pornește deloc", async () => {
    const env = await loadContentScript({ chromeId: null });
    await flush();

    expect(env.listeners.size).toBe(0);
    expect(env.extractCalls).toBe(0);
    expect(env.sent).toEqual([]);
  });

  test("sendMessage care eșuează este ignorat în tăcere", async () => {
    const env = await loadContentScript({
      sendMessage: async () => {
        throw new Error("Extension context invalidated.");
      },
    });
    await flush();

    expect(env.sent).toHaveLength(1);
    expect(env.rendered).toEqual([]);
  });

  test("lipsa răspunsului nu desenează nimic", async () => {
    const env = await loadContentScript({ sendMessage: async () => undefined });
    await flush();

    expect(env.rendered).toEqual([]);
  });

  test("răspunsul întârziat al unei pagini părăsite este aruncat", async () => {
    const pending = [];
    const env = await loadContentScript({
      sendMessage: () => new Promise((resolve) => pending.push(resolve)),
    });
    expect(pending).toHaveLength(1);

    // navigare fără reîncărcare către alt produs
    globalThis.location.href = OTHER_PAGE;
    env.listeners.get("navigation:navigatesuccess")();
    expect(env.removed).toBe(2);
    expect(pending).toHaveLength(2);

    pending[0](RESPONSE); // răspunsul vechi
    pending[1]({ ...RESPONSE, state: "ok" }); // răspunsul pentru pagina curentă
    await flush();

    expect(env.rendered.map((view) => view.state)).toEqual(["ok"]);
  });
});
