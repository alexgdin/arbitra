// Panou plutitor Arbitra: "Același produs în alte magazine", în colțul din dreapta-jos.
// Script clasic, încărcat după extract.js și înaintea content.js. Împart același scope
// izolat, deci totul stă într-un IIFE. Stilurile trăiesc într-un Shadow DOM (nu scurg
// nimic în pagină și nu primesc nimic de la ea), iar textele din pagină sau din API
// ajung în DOM doar prin textContent.
(() => {
  "use strict";

  const HOST_ID = "pretpilot-overlay-host";
  const LOCALE = "ro-RO";
  const TITLE = "Același produs în alte magazine";
  const ERROR_TEXT = "Nu am putut încărca prețurile din alte magazine acum.";
  const SEARCH_PATH = "/cauta";
  const MAX_QUERY_LENGTH = 80;

  const STORE_NAMES = new Map([
    ["emag", "eMAG"],
    ["pcgarage", "PC Garage"],
    ["altex", "Altex"],
  ]);

  // ---------- Partea pură: formatare și model de afișare ----------

  /** @type {Map<string, Intl.NumberFormat>} */
  const formatters = new Map();

  /**
   * @param {string} currency cod de 3 litere
   * @param {boolean} signed afișează "+" și "-"
   */
  function getFormatter(currency, signed) {
    const cacheKey = `${currency}${signed ? "+" : ""}`;
    let formatter = formatters.get(cacheKey);
    if (!formatter) {
      formatter = new Intl.NumberFormat(LOCALE, {
        style: "currency",
        currency,
        currencyDisplay: "code",
        ...(signed ? { signDisplay: "exceptZero" } : {}),
      });
      formatters.set(cacheKey, formatter);
    }
    return formatter;
  }

  /**
   * @param {number} bani suma în bani (12999 = 129,99)
   * @param {string} [currency]
   * @returns {string} de exemplu "1.199,99 RON"
   */
  function formatMoney(bani, currency = "RON") {
    return getFormatter(currency, false).format(bani / 100);
  }

  /**
   * @param {number} bani diferența în bani, cu semn
   * @param {string} [currency]
   * @returns {string} de exemplu "-50,00 RON" sau "+25,00 RON"
   */
  function formatDiff(bani, currency = "RON") {
    return getFormatter(currency, true).format(bani / 100);
  }

  /**
   * @param {string} id identificatorul magazinului
   * @returns {string}
   */
  function storeName(id) {
    return STORE_NAMES.get(id) ?? id.charAt(0).toUpperCase() + id.slice(1);
  }

  /**
   * Doar linkurile http/https devin linkuri; orice altceva (javascript:, data:) este ignorat.
   * @param {unknown} value
   * @returns {string | null}
   */
  function safeHref(value) {
    if (typeof value !== "string") {
      return null;
    }
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
    } catch {
      return null;
    }
  }

  /**
   * Link către aplicația web: baza validată plus o cale.
   * @param {unknown} webUrl
   * @param {string} path
   * @returns {string | null}
   */
  function webLink(webUrl, path) {
    const base = safeHref(webUrl);
    return base === null ? null : `${base.replace(/\/+$/, "")}${path}`;
  }

  /**
   * @param {number} count
   * @returns {string} "o ofertă mai ieftină", "2 oferte mai ieftine", "20 de oferte mai ieftine"
   */
  function cheaperOffersLabel(count) {
    if (count === 1) {
      return "o ofertă mai ieftină";
    }
    const tail = count % 100;
    return tail >= 1 && tail <= 19 ? `${count} oferte mai ieftine` : `${count} de oferte mai ieftine`;
  }

  /** Rând fără diferență de preț (preț necunoscut sau monedă diferită). */
  const NO_DIFF = { diffText: "", diffLabel: "", tone: "muted", comparable: false };

  /**
   * @param {{ store: string, price: number | null, inStock: boolean, url: string }} offer
   * @param {{ price: number, currency: string }} current oferta paginii curente
   * @param {string} currency moneda ofertelor
   */
  function buildRow(offer, current, currency) {
    const base = {
      storeName: storeName(offer.store),
      outOfStock: !offer.inStock,
      href: safeHref(offer.url),
    };
    if (offer.price === null) {
      return { ...base, ...NO_DIFF, priceText: "Preț indisponibil" };
    }

    const priceText = formatMoney(offer.price, currency);
    if (currency !== current.currency) {
      return { ...base, ...NO_DIFF, priceText };
    }

    const diff = offer.price - current.price;
    const diffText = diff === 0 ? "Același preț" : formatDiff(diff, currency);
    let diffLabel = diffText;
    if (diff < 0) {
      diffLabel = `Cu ${formatMoney(-diff, currency)} mai ieftin`;
    } else if (diff > 0) {
      diffLabel = `Cu ${formatMoney(diff, currency)} mai scump`;
    }
    const comparable = offer.inStock;
    let tone = "neutral";
    if (!comparable) {
      tone = "muted";
    } else if (diff < 0) {
      tone = "better";
    }
    return { ...base, priceText, diffText, diffLabel, tone, comparable };
  }

  /**
   * Transformă răspunsul service worker-ului în ce trebuie desenat.
   * @param {{
   *   state: string, observation?: { store: string, title: string, price: number, currency: string },
   *   item?: { currency: string, offers: any[] } | null, webUrl?: string, error?: string,
   * }} view
   * @returns {object | null} null când nu trebuie afișat nimic
   */
  function buildViewModel(view) {
    const observation = view?.observation;
    if (!observation || view.state === "disabled" || view.state === "ignored") {
      return null;
    }

    const failed = view.state === "error";
    const item = failed ? null : (view.item ?? null);
    const currency = item?.currency ?? observation.currency;
    const rows = item
      ? item.offers
          .filter((offer) => offer.store !== observation.store)
          .map((offer) => buildRow(offer, observation, currency))
      : [];
    const cheaperCount = rows.filter((row) => row.tone === "better").length;
    const query = encodeURIComponent(observation.title.slice(0, MAX_QUERY_LENGTH));

    return {
      state: view.state,
      rows,
      cheaperCount,
      isCheapest: cheaperCount === 0 && rows.some((row) => row.comparable),
      noOthers: !failed && rows.length === 0,
      showLoginHint: view.state === "logged-out",
      errorMessage: failed ? ERROR_TEXT : "",
      errorDetail: failed && typeof view.error === "string" ? view.error : "",
      searchHref: webLink(view.webUrl, `${SEARCH_PATH}?q=${query}`),
      loginHref: webLink(view.webUrl, "/login"),
    };
  }

  // ---------- Partea de DOM ----------

  const STYLES = `
    :host { all: initial; }
    *, *::before, *::after { box-sizing: border-box; }
    .root {
      --bg: #ffffff; --fg: #1f2937; --muted: #4b5563; --line: #e5e7eb;
      --accent: #0f766e; --accent-fg: #ffffff; --good: #047857; --focus: #0f766e;
      --warn-bg: #fef3c7; --warn-fg: #92400e; --shadow: 0 6px 24px rgb(15 23 42 / 0.22);
      display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
      color: var(--fg); font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      .root {
        --bg: #14201d; --fg: #ecfdf5; --muted: #a7b8b1; --line: #2c3d38;
        --accent: #2dd4bf; --accent-fg: #042f2e; --good: #34d399; --focus: #5eead4;
        --warn-bg: #422006; --warn-fg: #fde68a; --shadow: 0 6px 24px rgb(0 0 0 / 0.5);
      }
    }
    button { font: inherit; cursor: pointer; }
    a { color: var(--accent); font-weight: 600; }
    :focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    .pill {
      display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 0 14px;
      border: 0; border-radius: 999px; background: var(--accent); color: var(--accent-fg);
      font-weight: 600; box-shadow: var(--shadow);
    }
    .count {
      display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px;
      padding: 0 6px; border-radius: 999px; background: var(--accent-fg); color: var(--accent);
      font-size: 12px; font-weight: 700;
    }
    .panel {
      width: min(320px, calc(100vw - 32px)); max-height: min(70vh, 440px); overflow: auto;
      border: 1px solid var(--line); border-radius: 12px; background: var(--bg); box-shadow: var(--shadow);
    }
    .panel[hidden] { display: none; }
    .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 12px 10px 8px 14px; }
    h2 { margin: 2px 0 0; font-size: 14px; font-weight: 700; line-height: 1.3; }
    .close {
      flex: none; width: 28px; height: 28px; border: 0; border-radius: 8px;
      background: transparent; color: var(--muted); font-size: 20px; line-height: 1;
    }
    .close:hover { background: var(--line); }
    .offers { margin: 0; padding: 0 14px; list-style: none; }
    .offer { padding: 8px 0; border-top: 1px solid var(--line); }
    .offer-main { display: flex; justify-content: space-between; gap: 12px; font-weight: 600; }
    .offer-meta { display: flex; align-items: center; gap: 8px; min-height: 20px; margin-top: 2px; color: var(--muted); font-size: 13px; }
    .diff { position: relative; }
    .diff.better { color: var(--good); font-weight: 600; }
    .stock { padding: 0 6px; border-radius: 6px; background: var(--warn-bg); color: var(--warn-fg); font-size: 12px; }
    .offer-meta a { margin-left: auto; }
    .note { margin: 0; padding: 10px 14px 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
    .note.best { color: var(--good); font-weight: 600; }
    .note p { margin: 0; }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    @media (prefers-reduced-motion: no-preference) {
      .panel { animation: pretpilot-in 140ms ease-out; }
      @keyframes pretpilot-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    }
    @media print { .root { display: none; } }
  `;

  /** Gazda din pagină: element propriu, cu stiluri inline ca regulile paginii să nu-l atingă. */
  const HOST_STYLE = [
    "all: initial !important",
    "position: fixed !important",
    "right: 16px !important",
    "bottom: 16px !important",
    "z-index: 2147483000 !important",
    "display: block !important",
  ].join("; ");

  /** @type {HTMLElement | null} */
  let host = null;
  /** @type {ShadowRoot | null} */
  let shadow = null;
  /** @type {HTMLElement | null} */
  let pill = null;
  /** @type {HTMLElement | null} */
  let panel = null;
  let expanded = false;
  let dismissed = false;

  /**
   * @param {string} tag
   * @param {string} [className]
   * @param {string} [text] text simplu, pus prin textContent
   */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  /**
   * @param {string} href adresă deja validată http/https
   * @param {string} text
   * @param {string} [label]
   */
  function externalLink(href, text, label) {
    const link = el("a", undefined, text);
    link.setAttribute("href", href);
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
    if (label) {
      link.setAttribute("aria-label", label);
    }
    return link;
  }

  /** @param {{ diffText: string, diffLabel: string, tone: string }} row */
  function buildDiff(row) {
    const diff = el("span", `diff ${row.tone}`);
    const visible = el("span", undefined, row.diffText);
    diff.append(visible);
    if (row.diffLabel !== row.diffText) {
      // cititoarele de ecran primesc varianta în cuvinte, nu semnul "-"
      visible.setAttribute("aria-hidden", "true");
      diff.append(el("span", "sr", row.diffLabel));
    }
    return diff;
  }

  /** @param {ReturnType<typeof buildRow>} row */
  function buildOffer(row) {
    const offer = el("li", "offer");
    const main = el("div", "offer-main");
    main.append(el("span", "store", row.storeName), el("span", "price", row.priceText));

    const meta = el("div", "offer-meta");
    if (row.diffText) {
      meta.append(buildDiff(row));
    }
    if (row.outOfStock) {
      meta.append(el("span", "stock", "Stoc epuizat"));
    }
    if (row.href) {
      meta.append(externalLink(row.href, "Deschide", `Deschide oferta de la ${row.storeName}`));
    }
    offer.append(main, meta);
    return offer;
  }

  /**
   * @param {string} className
   * @param {string} text
   * @param {{ href: string | null, text: string } | null} [link] omis când adresa lipsește
   */
  function buildNote(className, text, link = null) {
    const note = el("div", className);
    const line = el("p", undefined, text);
    if (link?.href) {
      line.append(" ", externalLink(link.href, link.text));
    }
    note.append(line);
    return note;
  }

  /** @param {NonNullable<ReturnType<typeof buildViewModel>>} model */
  function buildPanel(model) {
    const section = el("div", "panel");
    section.id = "pretpilot-panel";
    section.hidden = !expanded;

    const close = el("button", "close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Închide Arbitra pentru această pagină");
    close.addEventListener("click", dismiss);

    const head = el("div", "head");
    head.append(el("h2", undefined, TITLE), close);
    section.append(head);

    if (model.rows.length > 0) {
      const list = el("ul", "offers");
      list.setAttribute("aria-label", "Prețuri din alte magazine");
      list.append(...model.rows.map(buildOffer));
      section.append(list);
    }
    if (model.isCheapest) {
      section.append(buildNote("note best", "Ai cel mai mic preț pe care îl cunoaștem."));
    }
    if (model.noOthers) {
      section.append(
        buildNote("note", "Încă nu avem alte prețuri pentru acest produs.", {
          href: model.searchHref,
          text: "Caută în Arbitra",
        })
      );
    }
    if (model.errorMessage) {
      const note = buildNote("note", model.errorMessage);
      note.setAttribute("role", "status");
      if (model.errorDetail) {
        note.append(el("p", undefined, model.errorDetail));
      }
      section.append(note);
    }
    if (model.showLoginHint) {
      section.append(
        buildNote("note", "Conectează-te în Arbitra ca să contribui cu prețuri.", {
          href: model.loginHref,
          text: "Conectează-te",
        })
      );
    }
    return section;
  }

  /** @param {NonNullable<ReturnType<typeof buildViewModel>>} model */
  function buildPill(model) {
    const button = el("button", "pill");
    button.type = "button";
    button.setAttribute("aria-expanded", String(expanded));
    button.setAttribute("aria-controls", "pretpilot-panel");
    button.setAttribute(
      "aria-label",
      model.cheaperCount > 0
        ? `Arbitra, ${cheaperOffersLabel(model.cheaperCount)} în alte magazine`
        : "Arbitra, prețuri din alte magazine"
    );
    button.append(el("span", undefined, "Arbitra"));
    if (model.cheaperCount > 0) {
      const count = el("span", "count", String(model.cheaperCount));
      count.setAttribute("aria-hidden", "true");
      button.append(count);
    }
    button.addEventListener("click", () => setExpanded(!expanded));
    return button;
  }

  /** @param {boolean} value */
  function setExpanded(value) {
    expanded = value;
    if (panel && pill) {
      panel.hidden = !expanded;
      pill.setAttribute("aria-expanded", String(expanded));
    }
  }

  /** @param {KeyboardEvent} event */
  function onKeydown(event) {
    if (event.key === "Escape" && expanded) {
      setExpanded(false);
      pill?.focus();
    }
  }

  function ensureHost() {
    if (host && shadow) {
      if (!host.isConnected) {
        document.documentElement.append(host);
      }
      return shadow;
    }
    // o instanță veche (extensie reîncărcată) poate fi încă în pagină
    document.getElementById(HOST_ID)?.remove();

    host = document.createElement("pretpilot-overlay");
    host.id = HOST_ID;
    host.style.cssText = HOST_STYLE;
    shadow = host.attachShadow({ mode: "closed" });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(STYLES);
    shadow.adoptedStyleSheets = [sheet];
    document.documentElement.append(host);
    return shadow;
  }

  /** Scoate panoul din pagină, păstrând alegerea "închis" a utilizatorului. */
  function detach() {
    host?.remove();
    host = null;
    shadow = null;
    pill = null;
    panel = null;
  }

  function dismiss() {
    dismissed = true;
    detach();
  }

  /**
   * Desenează (sau actualizează) panoul. Stările "disabled" și "ignored" (altă monedă decât RON) și lipsa
   * observației îl scot.
   * @param {Parameters<typeof buildViewModel>[0]} view
   */
  function render(view) {
    const model = buildViewModel(view);
    if (!model) {
      detach();
      return;
    }
    if (dismissed) {
      return;
    }

    const root = el("div", "root");
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "Arbitra, prețuri în alte magazine");
    root.addEventListener("keydown", onKeydown);
    panel = buildPanel(model);
    pill = buildPill(model);
    root.append(panel, pill);

    ensureHost().replaceChildren(root);
  }

  /** Elimină panoul și uită că a fost închis: pagina s-a schimbat (navigare fără reîncărcare). */
  function remove() {
    detach();
    dismissed = false;
    expanded = false;
  }

  const api = { render, remove, buildViewModel, formatMoney, formatDiff, safeHref };
  globalThis.PretPilotOverlay = api;
  if (typeof module !== "undefined") {
    module.exports = api;
  }
})();
