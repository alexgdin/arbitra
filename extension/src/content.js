// Content script: extrage produsul din pagină, îl trimite service worker-ului și pasează
// răspunsul panoului. Rulează după extract.js și overlay.js, în același scope izolat, deci
// totul stă într-un IIFE. Paginile magazinelor pot schimba produsul fără reîncărcare (SPA),
// așa că URL-ul este urmărit ușor, cu oprire după o perioadă de inactivitate.
(() => {
  "use strict";

  const POLL_MS = 1000;
  const IDLE_MS = 2 * 60 * 1000;
  // pagina poate randa produsul după încărcare: încercăm de mai multe ori pe același URL
  const MAX_ATTEMPTS = 10;

  /**
   * Cheia unei pagini: fără query și hash, ca să nu repetăm munca pentru același produs.
   * @param {string} href
   */
  function pageKey(href) {
    try {
      const url = new URL(href);
      return url.origin + url.pathname;
    } catch {
      return href;
    }
  }

  /**
   * Urmărește pagina: apelează `onProduct` o singură dată per URL și `onReset` la fiecare URL nou.
   * Toate dependențele sunt injectate, ca logica să se testeze fără browser.
   * @param {{
   *   getUrl: () => string,
   *   extract: () => object | null,
   *   onProduct: (observation: object, key: string) => void,
   *   onReset: (key: string) => void,
   *   now: () => number,
   *   setTimer: (callback: () => void, ms: number) => unknown,
   *   clearTimer: (id: unknown) => void,
   * }} deps
   */
  function createPageWatcher(deps) {
    /** @type {string | null} */
    let key = null;
    let attempts = 0;
    let done = false;
    let lastActivity = deps.now();
    /** @type {unknown} */
    let timer = null;

    function check() {
      const next = pageKey(deps.getUrl());
      if (next !== key) {
        key = next;
        attempts = 0;
        done = false;
        lastActivity = deps.now();
        deps.onReset(next);
      }
      if (done || attempts >= MAX_ATTEMPTS) {
        return;
      }
      attempts += 1;
      const observation = deps.extract();
      if (observation) {
        done = true;
        deps.onProduct(observation, next);
      }
    }

    function tick() {
      timer = null;
      check();
      if (deps.now() - lastActivity < IDLE_MS) {
        timer = deps.setTimer(tick, POLL_MS);
      }
    }

    return {
      start: tick,
      /** Trezește urmărirea (navigare, tab vizibil): verifică acum și reia verificările. */
      wake() {
        lastActivity = deps.now();
        if (timer === null) {
          tick();
        } else {
          check();
        }
      },
      stop() {
        if (timer !== null) {
          deps.clearTimer(timer);
          timer = null;
        }
      },
      currentKey: () => key,
    };
  }

  function bootstrap() {
    const { PretPilotExtract: extractor, PretPilotOverlay: overlay } = globalThis;
    if (!extractor || !overlay) {
      return;
    }

    /** @type {ReturnType<typeof createPageWatcher>} */
    const watcher = createPageWatcher({
      getUrl: () => location.href,
      extract() {
        try {
          return extractor.extractObservation(document, location.href);
        } catch (error) {
          console.warn("PretPilot: nu am putut extrage produsul din pagină", error);
          return null;
        }
      },
      onProduct: sendObservation,
      onReset: () => overlay.remove(),
      now: Date.now,
      setTimer: (callback, ms) => setTimeout(callback, ms),
      clearTimer: (id) => clearTimeout(/** @type {number} */ (id)),
    });

    /**
     * @param {object} observation
     * @param {string} key
     */
    async function sendObservation(observation, key) {
      let response;
      try {
        response = await chrome.runtime.sendMessage({ type: "pretpilot:observe", observation });
      } catch {
        return; // extensia a fost reîncărcată sau service worker-ul nu răspunde
      }
      // pagina s-a schimbat între timp: răspunsul nu mai este pentru ea
      if (!response || watcher.currentKey() !== key) {
        return;
      }
      overlay.render({
        state: response.state,
        observation,
        item: response.item,
        webUrl: response.webUrl,
        error: response.error,
      });
    }

    const wake = () => watcher.wake();
    window.addEventListener("popstate", wake);
    window.addEventListener("hashchange", wake);
    document.addEventListener("visibilitychange", wake);
    // navigarea fără reîncărcare (pushState) este anunțată de Navigation API
    window.navigation?.addEventListener("navigatesuccess", wake);
    watcher.start();
  }

  if (typeof module !== "undefined") {
    module.exports = { createPageWatcher, pageKey, POLL_MS, IDLE_MS, MAX_ATTEMPTS };
  }
  if (typeof document !== "undefined" && typeof chrome !== "undefined" && chrome.runtime?.id) {
    bootstrap();
  }
})();
