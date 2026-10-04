// Extragerea produsului și a prețului dintr-o pagină de magazin (eMAG, PC Garage, Altex).
// Bibliotecă pură: fără rețea și fără chrome.*. În extensie se încarcă ca script clasic
// (globalThis.PretPilotExtract), în teste se importă cu require.
// Sumele sunt mereu întregi în bani (129,99 RON = 12999).

(function (root) {
  "use strict";

  /**
   * @typedef {"emag" | "pcgarage" | "altex"} StoreId
   *
   * @typedef {Object} Observation
   * @property {StoreId} store
   * @property {string} externalId
   * @property {string} title
   * @property {string} url URL canonic al paginii, fără query și hash
   * @property {string} [imageUrl] doar http/https, cu entitățile HTML decodate
   * @property {string} [ean] doar GTIN valid (8, 12, 13 sau 14 cifre)
   * @property {string} [mpn] codul de model normalizat (litere mari și cifre)
   * @property {number} price bani întregi, mai mari ca 0
   * @property {string} currency cod de 3 litere
   * @property {boolean} inStock
   *
   * @typedef {Object} ExtractContext
   * @property {string} href adresa paginii
   * @property {string} [hostname] gazda paginii; dacă lipsește, se ia din href
   * @property {string} [ogType] valoarea meta og:type
   * @property {string} [metaPrice] preț din meta product:price:amount sau itemprop
   * @property {string} [domPriceText] textul prețului vizibil, ultima soluție
   */

  const STORE_DOMAINS = {
    emag: "emag.ro",
    pcgarage: "pcgarage.ro",
    altex: "altex.ro",
  };

  // Limita unei coloane integer din Postgres (2^31 - 1 bani).
  const MAX_BANI = 2_147_483_647;
  const MAX_FRACTION_DIGITS = 3;
  const GTIN_LENGTHS = [8, 12, 13, 14];
  const GTIN_FIELDS = [
    "gtin13",
    "gtin12",
    "gtin14",
    "gtin8",
    "gtin",
    "productID",
  ];
  const MIN_CODE_LENGTH = 6;
  const MAX_CODE_LENGTH = 64;
  const MIN_DISTINCT_CHARS = 3;

  const LD_JSON_SELECTOR = 'script[type="application/ld+json"]';
  const OG_TYPE_SELECTORS = ['meta[property="og:type"]'];
  const META_PRICE_SELECTORS = [
    'meta[property="product:price:amount"]',
    'meta[property="og:price:amount"]',
    '[itemprop="price"]',
  ];
  // Selectori verificați pe pagină; PC Garage și Altex nu au (încă) o copie a prețului în DOM.
  const DOM_PRICE_SELECTORS = { emag: ".product-new-price" };

  // ---------------------------------------------------------------------------
  // Utilitare generale
  // ---------------------------------------------------------------------------

  /** Parsează un URL http(s); orice altceva dă null. */
  function parseUrl(href) {
    try {
      const url = new URL(href);
      return url.protocol === "https:" || url.protocol === "http:" ? url : null;
    } catch {
      return null;
    }
  }

  function pathSegments(pathname) {
    return pathname.split("/").filter(Boolean);
  }

  function safeDecode(text) {
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  }

  /** Text tăiat din șir sau din număr finit; orice altceva dă șir gol. */
  function asText(value) {
    if (typeof value === "string") {
      return value.trim();
    }
    return typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : "";
  }

  function isObject(value) {
    return value !== null && typeof value === "object";
  }

  function hasLetterAndDigit(code) {
    return /[A-Z]/.test(code) && /\d/.test(code);
  }

  const NAMED_ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: "\u00a0",
  };

  // Punct de cod Unicode valid, fără surogate
  function isCodePoint(code) {
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
  }

  /**
   * Decodează entitățile HTML uzuale (&amp; &lt; &gt; &quot; &apos; &nbsp;) și pe cele numerice.
   * Decodarea se face într-o singură trecere: "&amp;lt;" devine "&lt;", nu "<".
   * @param {string} text
   * @returns {string}
   */
  function decodeHtmlEntities(text) {
    if (typeof text !== "string") {
      return "";
    }
    return text.replace(
      /&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|(amp|lt|gt|quot|apos|nbsp));/gi,
      (match, decimal, hex, name) => {
        if (name) {
          return NAMED_ENTITIES[name.toLowerCase()];
        }
        const code = decimal ? Number(decimal) : Number.parseInt(hex, 16);
        return isCodePoint(code) ? String.fromCodePoint(code) : match;
      }
    );
  }

  /** Text pentru afișare: entități decodate, spații multiple reduse la unul, capete tăiate. */
  function normalizeText(value) {
    return decodeHtmlEntities(asText(value)).replace(/\s+/g, " ").trim();
  }

  // ---------------------------------------------------------------------------
  // Magazin, URL, id extern
  // ---------------------------------------------------------------------------

  /**
   * Magazinul după hostname (acceptă www. și subdomenii, nu și domenii asemănătoare).
   * @param {string} hostname
   * @returns {StoreId | null}
   */
  function detectStore(hostname) {
    if (typeof hostname !== "string") {
      return null;
    }
    const host = hostname.trim().toLowerCase().replace(/\.$/, "");
    for (const [store, domain] of Object.entries(STORE_DOMAINS)) {
      if (host === domain || host.endsWith(`.${domain}`)) {
        return store;
      }
    }
    return null;
  }

  function idAfter(segments, marker) {
    const index = segments.lastIndexOf(marker);
    return index === -1 ? "" : segments[index + 1] || "";
  }

  const ID_FROM_SEGMENTS = {
    emag: (segments) => idAfter(segments, "pd"),
    altex: (segments) => idAfter(segments, "cpd"),
    pcgarage: (segments) => segments.at(-1) || "",
  };

  /**
   * Id-ul produsului din URL: eMAG după /pd/, Altex după /cpd/, PC Garage ultimul segment.
   * @param {string} store
   * @param {string} href
   * @returns {string | null}
   */
  function externalIdFromUrl(store, href) {
    const url = parseUrl(href);
    if (!(url && Object.hasOwn(ID_FROM_SEGMENTS, store))) {
      return null;
    }
    const id = ID_FROM_SEGMENTS[store](pathSegments(url.pathname));
    return id ? safeDecode(id) : null;
  }

  /**
   * URL canonic: https, gazda și calea, fără query și hash.
   * @param {string} href
   * @returns {string | null} null când href nu este un URL http(s)
   */
  function canonicalUrl(href) {
    const url = parseUrl(href);
    return url ? `https://${url.host}${url.pathname}` : null;
  }

  // Pe eMAG, paginile de produs au og:type "product"; la celelalte magazine og:type nu a fost verificat.
  function isProductOgType(ogType) {
    return (
      typeof ogType !== "string" || !ogType.trim() || /product/i.test(ogType)
    );
  }

  const PRODUCT_PAGE_RULES = {
    emag: (segments, ogType) =>
      Boolean(idAfter(segments, "pd")) && isProductOgType(ogType),
    altex: (segments) => Boolean(idAfter(segments, "cpd")),
    pcgarage: (segments) =>
      segments.length >= 3 &&
      !segments.includes("filtre") &&
      !segments.includes("cos"),
  };

  function isProductPageUrl(store, href, ogType) {
    const url = parseUrl(href);
    if (!(url && Object.hasOwn(PRODUCT_PAGE_RULES, store))) {
      return false;
    }
    return PRODUCT_PAGE_RULES[store](pathSegments(url.pathname), ogType);
  }

  // ---------------------------------------------------------------------------
  // Preț
  // ---------------------------------------------------------------------------

  /** Bani din partea întreagă și zecimalele ca șiruri de cifre; fără înmulțiri în virgulă mobilă. */
  function amountToBani(integer, fraction) {
    // Mai mult de 3 zecimale semnificative nu sunt un preț real (de ex. text lipit din <sup>).
    if (/[1-9]/.test(fraction.slice(MAX_FRACTION_DIGITS))) {
      return null;
    }
    const digits = fraction.padEnd(MAX_FRACTION_DIGITS, "0");
    // A treia zecimală decide rotunjirea (jumătate în sus).
    const bani =
      Number(integer) * 100 +
      Number(digits.slice(0, 2)) +
      (digits[2] >= "5" ? 1 : 0);
    return bani > 0 && bani <= MAX_BANI ? bani : null;
  }

  function numberToBani(value) {
    if (!Number.isFinite(value) || value <= 0 || value > MAX_BANI) {
      return null;
    }
    // toFixed dă o expansiune zecimală curată, fără zgomotul lui 0.1 + 0.2.
    const [integer, fraction] = value.toFixed(MAX_FRACTION_DIGITS).split(".");
    return amountToBani(integer, fraction);
  }

  // Un număr cu spații ca separator de mii ("1 490,77") sau cu cifre și separatori ("1.490,77").
  const PRICE_TOKEN =
    /\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)*/;
  const SPACES = /[ \u00a0\u202f]/g;

  /** Cifre grupate din 3 în 3 cu separatorul dat ("1.490" cu "."). */
  function isGrouped(text, separator) {
    const [head, ...groups] = text.split(separator);
    return (
      /^\d{1,3}$/.test(head) && groups.every((group) => /^\d{3}$/.test(group))
    );
  }

  function removeSeparator(text, separator) {
    return text.split(separator).join("");
  }

  /** Un singur separator urmat de exact 3 cifre, după 1-3 cifre fără zero în față: mii ("1.199"). */
  function isThousandsGroup(head, tail) {
    return tail.length === 3 && /^[1-9]\d{0,2}$/.test(head);
  }

  /** Desparte un număr scris cu "." și "," în parte întreagă și zecimale; null când nu are sens. */
  function splitAmount(token) {
    const decimalIndex = Math.max(
      token.lastIndexOf("."),
      token.lastIndexOf(",")
    );
    if (decimalIndex === -1) {
      return { integer: token, fraction: "" };
    }
    const decimalChar = token[decimalIndex];
    const groupChar = decimalChar === "." ? "," : ".";
    const head = token.slice(0, decimalIndex);
    const tail = token.slice(decimalIndex + 1);

    if (head.includes(groupChar)) {
      // "1.490,77" sau "1,490.77": ultimul separator este cel zecimal
      return isGrouped(head, groupChar)
        ? { integer: removeSeparator(head, groupChar), fraction: tail }
        : null;
    }
    if (head.includes(decimalChar) || isThousandsGroup(head, tail)) {
      // "1.234.567" sau "1.199": doar separatori de mii
      return isGrouped(token, decimalChar)
        ? { integer: removeSeparator(token, decimalChar), fraction: "" }
        : null;
    }
    return { integer: head, fraction: tail };
  }

  function textToBani(text) {
    const match = PRICE_TOKEN.exec(text);
    // "-100 Lei" este o reducere, nu un preț
    if (!match || /[-\u2212]\s?$/.test(text.slice(0, match.index))) {
      return null;
    }
    const amount = splitAmount(match[0].replace(SPACES, ""));
    return amount && amountToBani(amount.integer, amount.fraction);
  }

  /**
   * Convertește un preț în bani întregi sau dă null.
   * Numerele sunt zecimale (739.99). Șirurile pot fi "1490.77", "1.490,77", "1490,77 Lei",
   * "1 490,77 lei", "1.199" (punct urmat de exact 3 cifre = separator de mii, deci 1199 lei).
   * Zero, valorile negative și ce nu arată a preț dau null.
   * @param {number | string} value
   * @returns {number | null}
   */
  function parsePriceToBani(value) {
    if (typeof value === "number") {
      return numberToBani(value);
    }
    return typeof value === "string" ? textToBani(value) : null;
  }

  const PLAIN_DECIMAL = /^\d+(?:\.\d+)?$/;

  // Datele structurate (JSON-LD, meta) urmează schema.org: punctul este mereu separator zecimal,
  // deci "739.990" înseamnă 739,99 lei, nu 739.990 lei. Restul formatelor trec prin parsePriceToBani.
  function structuredPriceToBani(value) {
    if (typeof value === "string" && PLAIN_DECIMAL.test(value.trim())) {
      const [integer, fraction = ""] = value.trim().split(".");
      return amountToBani(integer, fraction);
    }
    return parsePriceToBani(value);
  }

  // ---------------------------------------------------------------------------
  // Identificatori: GTIN și cod de model
  // ---------------------------------------------------------------------------

  /**
   * GTIN valid: 8, 12, 13 sau 14 cifre cu cifra de control corectă (nu doar zerouri).
   * @param {string | number} value
   * @returns {boolean}
   */
  function isValidGtin(value) {
    const text = typeof value === "number" ? String(value) : value;
    if (
      typeof text !== "string" ||
      !/^\d+$/.test(text) ||
      !GTIN_LENGTHS.includes(text.length) ||
      /^0+$/.test(text)
    ) {
      return false;
    }
    const digits = Array.from(text, Number);
    const check = digits.pop();
    // Ponderi 3, 1, 3, 1... începând de la cifra din dreapta cifrei de control
    const sum = digits.reduceRight(
      (total, digit, index) =>
        total + digit * ((digits.length - index) % 2 === 1 ? 3 : 1),
      0
    );
    return (10 - (sum % 10)) % 10 === check;
  }

  // Algoritmul din primaryModelCode are o copie pe server (normalizeModelCode din
  // packages/api/src/lib/identifiers.ts), cu aceiași vectori (test/fixtures/model-code-vectors.json):
  // orice schimbare se face în ambele locuri, cu aceleași constante.

  const NON_CODE_CHARS = /[^A-Z0-9]/g;
  const COMBINING_MARKS = /\p{M}/gu;
  const ALPHANUMERIC = /[A-Z0-9]/;
  const WHITESPACE = /\s+/;
  const NOT_APPLICABLE = "N/A";
  // "N/A" ca valoare de sine stătătoare. Codurile Apple se termină cu "/A" ("MQ9X3DN/A"), deci "N/A" lipit
  // de litere sau cifre din față nu e substituent.
  const STANDALONE_NOT_APPLICABLE = /(?:^|[^A-Z0-9])N\/A(?:[^A-Z0-9]|$)/;
  // O etichetă la începutul valorii. Cele cunoscute (COD, MODEL, SKU, MPN, PN, P/N) se taie cu ":" sau "#", chiar
  // lipite ("P/N#X"), iar COD, MODEL, SKU și MPN și când urmează doar un spațiu. Orice alt text din litere (până la
  // 3 cuvinte, cu punct opțional, "Cod produs:", "Part Number:", "Nr.:") se taie doar cu ":" sau cu "#" despărțit
  // printr-un spațiu, ca "ABC#1234" să rămână cod. "PN1234AB" rămâne cod, pentru că literele etichetei sunt chiar
  // începutul lui. Se taie o singură etichetă.
  const KNOWN_LABEL = String.raw`(?:COD|MODEL|SKU|MPN|PN|P\/N)`;
  const LABEL_WORD = String.raw`(?:[A-Z]+\.?|P\/N)`;
  const LABEL = new RegExp(
    String.raw`^(?:${KNOWN_LABEL}\s*[:#]|${LABEL_WORD}(?:\s+${LABEL_WORD}){0,2}(?:\s*:|\s+#|#\s)|(?:COD|MODEL|SKU|MPN)\s)\s*`
  );
  const LIST_SEPARATOR = /[,;|]/;
  // Cratima (și liniile Unicode U+2010..U+2015), slash-ul, diezul și parantezele despart segmentele codului.
  const SEGMENT_SEPARATOR = /[-‐-―/#()]/;
  // Capacități și dimensiuni care disting produse ("500G", "1T00", "12G", "1TB", "O8G" și "8GD" la plăcile
  // video): nu sunt sufixe de ignorat.
  const VARIANT_LIKE = /^O?[0-9]{1,4}[TGMK]?B?[0-9]{0,2}D?$/;
  // Specificații care apar în câmpul de model, dar nu identifică un produs. Rezoluția cere 3-4 cifre în
  // fiecare grup, ca "20X3004DRI" (Lenovo) să rămână cod; interfețele se resping doar când după nume urmează cel mult
  // o literă și cifre ("USB30", "WIFI6E"), ca "USB3S2SAT3CB" (StarTech) să rămână cod.
  const SPEC_LIKE = [
    /^[0-9]+(GB|TB|MB|KB|HZ|KHZ|MHZ|GHZ|MAH|WH|MM|CM|KG|GBPS|MBPS|FPS|RPM|NITS|INCH|BIT|PX|W|V|A)$/,
    /^[0-9]{3,4}X[0-9]{3,4}P?$/,
    /^(?:(?:LP|G)?DDR[0-9]|LGA[0-9])/,
    /^(?:PCIE|NVME|USB|HDMI|WIFI|SATA)[A-Z]?[0-9]*[A-Z]?$/,
    /^M2$/,
  ];
  // Cod făcut doar din cuvinte de specificație și cifre ("8GBDDR4", "256GBSSD", "M22280"). O singură cifră
  // sau un cuvânt per pas, ca potrivirea să rămână liniară.
  const SPEC_WORDS_ONLY =
    /^(?:[0-9]|SSD|HDD|RAM|DDR|FHD|UHD|GB|TB|MHZ|GHZ|HZ|USB|HDMI|WIFI|M2)+$/;
  // Valori de umplutură scrise ca "TEST123" sau "NULL1234".
  const PLACEHOLDER_PREFIX = /^(?:TEST|SAMPLE|UNKNOWN|DEFAULT|NULL|NONE)/;

  // Din valoarea primită se citesc cel mult atâtea caractere: un cod are sub 64, iar un text mai lung (un titlu
  // întreg) nu trebuie parcurs. Serverul taie la fel.
  const MAX_RAW_LENGTH = 256;
  // Mai mult de două cuvinte separate prin spațiu înseamnă text liber ("Full HD 1080p", un titlu), nu cod.
  const MAX_WORDS = 2;
  // Un sufix se taie doar dacă restul codului e destul de lung ca să fie specific.
  const MIN_BASE_LENGTH = 6;

  /** Textul din care se citește codul: un șir, sau un număr finit scris cu cifre; orice altceva dă șir gol. */
  function rawText(value) {
    if (typeof value === "string") {
      return value;
    }
    return typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : "";
  }

  function isUsableModelCode(code) {
    return (
      code.length >= MIN_CODE_LENGTH &&
      code.length <= MAX_CODE_LENGTH &&
      hasLetterAndDigit(code) &&
      new Set(code).size >= MIN_DISTINCT_CHARS &&
      !PLACEHOLDER_PREFIX.test(code) &&
      !SPEC_LIKE.some((pattern) => pattern.test(code)) &&
      !SPEC_WORDS_ONLY.test(code)
    );
  }

  // Cuvintele separate prin spațiu; un semn singur ("-", "/") nu e cuvânt: "WDS100T4G0E - 00CPS0" are două.
  function wordCount(text) {
    return text
      .split(WHITESPACE)
      .filter((word) => ALPHANUMERIC.test(word)).length;
  }

  // Taie segmentele finale care nu disting produsul ("-00CPS0" la PC Garage, "/EU" la Samsung), cât timp
  // restul rămâne un cod specific. Un segment ca "500G" sau "12G" e capacitate, deci rămâne în cod.
  function joinWithoutSuffixes(segments) {
    let code = segments.join("");
    for (let end = segments.length; end > 1; end -= 1) {
      const last = segments[end - 1];
      const rest = code.slice(0, code.length - last.length);
      if (
        VARIANT_LIKE.test(last) ||
        rest.length < MIN_BASE_LENGTH ||
        !hasLetterAndDigit(rest)
      ) {
        break;
      }
      code = rest;
    }
    return code;
  }

  /**
   * Codul de model normalizat (litere mari și cifre, fără separatori și fără sufixul producătorului).
   * "WDS100T4G0E-00CPS0" dă "WDS100T4G0E", dar "SDSSDE61-500G-G25" dă "SDSSDE61500G": capacitatea
   * distinge produsul, deci nu se taie. Ordinea pașilor: se citesc cel mult 256 de caractere, se scot
   * diacriticele ("ȘTEFAN" dă "STEFAN"), "N/A" ca valoare de sine stătătoare respinge tot textul (dar
   * "MQ9X3DN/A" dă "MQ9X3DN"), se taie eticheta, se păstrează prima valoare dintr-o listă, apoi se taie
   * sufixele. Parantezele despart segmentele, deci "WDS200T4G0E (EU)" dă "WDS200T4G0E".
   * @param {string | number} raw
   * @returns {string | null} null pentru valori care nu pot lega două produse: "N/A", capacități sau
   *   specificații ("128GB", "HDMI21", "8GB-DDR4"), substituenți ("TEST123", "AAAAA1"), text liber (peste
   *   două cuvinte) și coduri prea scurte, lungi sau fără litere ori cifre
   */
  function primaryModelCode(raw) {
    const upper = rawText(raw)
      .slice(0, MAX_RAW_LENGTH)
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(COMBINING_MARKS, "");
    if (STANDALONE_NOT_APPLICABLE.test(upper)) {
      return null;
    }

    const unlabeled = upper.replace(LABEL, "");
    // "Cod: N/A1": substituent chiar dacă "N/A" e urmat de o cifră
    if (unlabeled.startsWith(NOT_APPLICABLE)) {
      return null;
    }

    const [first = ""] = unlabeled.split(LIST_SEPARATOR);
    if (wordCount(first) > MAX_WORDS) {
      return null;
    }

    const segments = first
      .split(SEGMENT_SEPARATOR)
      .map((segment) => segment.replace(NON_CODE_CHARS, ""))
      .filter((segment) => segment.length > 0);
    const code = joinWithoutSuffixes(segments);
    return isUsableModelCode(code) ? code : null;
  }

  // Slash-ul și diezul rămân în token, ca "SA400S37/240G" să dea același cod ca în câmpul mpn.
  const TITLE_SPLIT = /[\s,;()[\]{}|]+/;
  const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
  const MODEL_PIECE = /^[A-Z0-9]+(?:[-/#][A-Z0-9]+)*$/;
  // Un titlu mai lung de atât nu e parcurs: o pagină nu poate umfla munca extractorului cu un nume uriaș.
  const MAX_TITLE_SCAN = 1000;
  // Forme care apar în titluri și ar trece drept coduri de model, deși sunt specificații: clase de viteză Wi-Fi
  // ("AX3000"), module de memorie ("PC4-25600", scris și "PC425600" după normalizare), procesoare Intel
  // ("I7-13650HX"), numere de procesor singure ("13700K") și kituri de memorii ("2X16GB"). Se verifică atât
  // tokenul din titlu, cât și codul normalizat.
  const TITLE_SPEC_SHAPES = [
    /^AX[0-9]{3,4}$/,
    /^PC[0-9]-[0-9]+$/,
    /^PC[0-9][0-9]{4,5}$/,
    /^I[3579][0-9]{4,5}[A-Z]*$/,
    /^[0-9]{4,5}[A-Z]?$/,
    /^[0-9]X[0-9]{1,3}(?:GB|MB|TB)$/,
  ];

  // Un token cu o specificație ("DDR5-6000", "USB-C", "M2-2280") nu e cod de model: în titluri apar des.
  function isModelPiece(piece) {
    return (
      MODEL_PIECE.test(piece) &&
      !piece
        .split(SEGMENT_SEPARATOR)
        .some((part) => SPEC_LIKE.some((pattern) => pattern.test(part)))
    );
  }

  // Într-un titlu, un cod are cel puțin două litere și o cifră (primaryModelCode cere deja litera și cifra) și nu
  // seamănă cu o specificație: "13700K" (o singură literă) sau "AX3000" nu sunt coduri de model.
  function titleCode(piece) {
    const code = primaryModelCode(piece);
    const isSpec = [piece, code].some((text) =>
      TITLE_SPEC_SHAPES.some((pattern) => pattern.test(text))
    );
    return code !== null && /[A-Z].*[A-Z]/.test(code) && !isSpec ? code : null;
  }

  /**
   * Codul de model dintr-un titlu: ultimul token scris cu litere mari și cifre care dă un cod valid
   * (primaryModelCode), cu cel puțin două litere. Capacitățile, frecvențele, rezoluțiile și standardele
   * (2TB, 3200MHZ, 1920X1080, DDR5-6000, LGA1700), clasele de viteză, modulele de memorie, numele de procesoare
   * și numerele simple nu contează.
   * @param {string} title
   * @returns {string | null}
   */
  function modelCodeFromTitle(title) {
    if (typeof title !== "string") {
      return null;
    }
    const codes = title
      .slice(0, MAX_TITLE_SCAN)
      .split(TITLE_SPLIT)
      .map((piece) => piece.replace(EDGE_PUNCTUATION, ""))
      .filter(isModelPiece)
      .map(titleCode)
      .filter((code) => code !== null);
    return codes.at(-1) ?? null;
  }

  // Codul din câmpul mpn are prioritate; titlul se folosește doar când câmpul nu dă un cod valid.
  function findModelCode(product, title) {
    return primaryModelCode(product.mpn) ?? modelCodeFromTitle(title);
  }

  // productID poate veni ca "gtin13:5901234123457" sau "ean:5901234123457"
  function gtinText(value) {
    return asText(value).replace(/^[a-z]+\d*:\s*/i, "");
  }

  function findGtin(product) {
    for (const field of GTIN_FIELDS) {
      const candidate = gtinText(product[field]);
      if (isValidGtin(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Disponibilitate, imagine, ofertă
  // ---------------------------------------------------------------------------

  // Precomanda și BackOrder nu se pot livra acum, deci nu contează ca "în stoc".
  const UNAVAILABLE =
    /outofstock|soldout|discontinued|preorder|presale|backorder|notinstock|notavailable|unavailable|indisponibil|epuizat|farastoc|precomanda/;

  /**
   * Disponibilitatea ca boolean, din URL-uri schema.org sau cuvinte simple.
   * false: OutOfStock, SoldOut, Discontinued, PreOrder, PreSale, BackOrder și echivalentele
   * românești (indisponibil, stoc epuizat, fără stoc, precomandă).
   * true: InStock, LimitedAvailability, InStoreOnly, OnlineOnly. O valoare lipsă sau necunoscută
   * dă true, pentru că o observație există doar cu preț pozitiv.
   * @param {string | boolean | undefined} value
   * @returns {boolean}
   */
  function mapAvailability(value) {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value !== "string") {
      return true;
    }
    const key = value
      .normalize("NFD")
      .replace(/[^A-Za-z]/g, "")
      .toLowerCase();
    return !UNAVAILABLE.test(key);
  }

  /** Adresă http(s) absolută (cele relative se rezolvă față de pagină) sau null. */
  function toHttpUrl(text, baseHref) {
    try {
      const url = new URL(text, baseHref);
      return url.protocol === "https:" || url.protocol === "http:"
        ? url.href
        : null;
    } catch {
      return null;
    }
  }

  // image: șir, ImageObject sau listă de ele; prima adresă http(s) validă
  function firstImageUrl(image, baseHref) {
    for (const entry of [].concat(image ?? [])) {
      const raw = isObject(entry) ? (entry.url ?? entry.contentUrl) : entry;
      const text = typeof raw === "string" ? normalizeText(raw) : "";
      const url = text && toHttpUrl(text, baseHref);
      if (url) {
        return url;
      }
    }
    return null;
  }

  // offers: obiect, listă sau AggregateOffer (cu oferte imbricate); ofertele în ordinea paginii
  function collectOffers(offers) {
    return []
      .concat(offers ?? [])
      .flatMap((offer) =>
        isObject(offer) ? [offer, ...collectOffers(offer.offers)] : []
      );
  }

  function offerPrice(offer) {
    return (
      structuredPriceToBani(offer.price) ??
      structuredPriceToBani(offer.lowPrice)
    );
  }

  // Prima ofertă cu preț valid; altfel prețul din meta sau din DOM (cu prima ofertă pentru stoc și monedă)
  function resolveOffer(product, context) {
    const offers = collectOffers(product.offers);
    for (const offer of offers) {
      const price = offerPrice(offer);
      if (price !== null) {
        return { offer, price };
      }
    }
    const price =
      structuredPriceToBani(context.metaPrice) ??
      parsePriceToBani(context.domPriceText);
    return price === null ? null : { offer: offers[0] || {}, price };
  }

  function currencyOf(offer) {
    const code = asText(offer.priceCurrency).toUpperCase();
    if (code === "LEI") {
      return "RON";
    }
    return /^[A-Z]{3}$/.test(code) ? code : "RON";
  }

  // URL-ul ofertei doar dacă e pe aceeași gazdă și arată spre același produs; altfel adresa paginii
  function observationUrl(offer, store, pageUrl, href) {
    const offerUrl = parseUrl(asText(offer.url));
    const sameProduct =
      offerUrl &&
      offerUrl.hostname === pageUrl.hostname &&
      externalIdFromUrl(store, offerUrl.href) ===
        externalIdFromUrl(store, href);
    return canonicalUrl(sameProduct ? offerUrl.href : href);
  }

  // ---------------------------------------------------------------------------
  // JSON-LD
  // ---------------------------------------------------------------------------

  // Noduri din valori JSON-LD: liste, @graph și mainEntity; ItemList nu se parcurge (listă = nu produs unic)
  function collectNodes(value, nodes = []) {
    if (Array.isArray(value)) {
      for (const item of value) {
        collectNodes(item, nodes);
      }
    } else if (isObject(value)) {
      nodes.push(value);
      collectNodes(value["@graph"], nodes);
      collectNodes(value.mainEntity, nodes);
    }
    return nodes;
  }

  // @type poate fi șir sau listă, cu sau fără prefix ("Product", "schema:Product", "http://schema.org/Product")
  function isProductNode(node) {
    return []
      .concat(node["@type"] ?? [])
      .some(
        (type) =>
          typeof type === "string" && type.split(/[/:]/).pop() === "Product"
      );
  }

  // Nodul descrie pagina curentă dacă sku-ul sau un URL al lui coincide cu pagina
  function describesPage(node, store, href) {
    if (
      asText(node.sku) &&
      asText(node.sku) === externalIdFromUrl(store, href)
    ) {
      return true;
    }
    const pageUrl = canonicalUrl(href);
    const urls = [
      node.url,
      ...collectOffers(node.offers).map((offer) => offer.url),
    ];
    return urls.some((url) => canonicalUrl(asText(url)) === pageUrl);
  }

  // Un singur Product: el. Mai multe: doar cel care descrie pagina; altfel pagina e o listă, deci null.
  function pickProduct(ldNodes, store, href) {
    const products = collectNodes(ldNodes).filter(isProductNode);
    if (products.length <= 1) {
      return products[0] || null;
    }
    return products.find((node) => describesPage(node, store, href)) || null;
  }

  /**
   * Construiește observația dintr-o pagină de produs, pornind de la nodurile JSON-LD deja parsate
   * (obiecte, liste sau @graph). Dă null dacă pagina nu este o pagină de produs unic.
   * Preț: prima ofertă cu preț (price, altfel lowPrice), apoi ctx.metaPrice, apoi ctx.domPriceText.
   * @param {unknown} ldNodes
   * @param {ExtractContext} ctx
   * @returns {Observation | null}
   */
  function parseObservationFromLd(ldNodes, ctx) {
    const context = ctx || {};
    const { href } = context;
    const pageUrl = parseUrl(href);
    const store = detectStore(context.hostname || pageUrl?.hostname);
    if (!(pageUrl && store && isProductPageUrl(store, href, context.ogType))) {
      return null;
    }
    const product = pickProduct(ldNodes, store, href);
    if (!product) {
      return null;
    }

    const title = normalizeText(product.name);
    const externalId = asText(product.sku) || externalIdFromUrl(store, href);
    const resolved = resolveOffer(product, context);
    if (!(title && externalId && resolved)) {
      return null;
    }

    const { offer, price } = resolved;
    const imageUrl = firstImageUrl(product.image, href);
    const ean = findGtin(product);
    const mpn = findModelCode(product, title);
    return {
      store,
      externalId,
      title,
      url: observationUrl(offer, store, pageUrl, href),
      ...(imageUrl ? { imageUrl } : {}),
      ...(ean ? { ean } : {}),
      ...(mpn ? { mpn } : {}),
      price,
      currency: currencyOf(offer),
      inStock: mapAvailability(offer.availability),
    };
  }

  // ---------------------------------------------------------------------------
  // Citirea paginii
  // ---------------------------------------------------------------------------

  // Un bloc cu caractere de control în șiruri (rânduri noi) nu se parsează; le înlocuim cu spații
  function parseJson(text) {
    try {
      return JSON.parse(
        String(text)
          .replace(/[\r\n\t]+/g, " ")
          .trim()
      );
    } catch {
      return null;
    }
  }

  function readLdBlocks(doc) {
    return Array.from(doc.querySelectorAll(LD_JSON_SELECTOR))
      .map((script) => parseJson(script.textContent))
      .filter((block) => block !== null);
  }

  function readMeta(doc, selectors) {
    for (const selector of selectors) {
      const content = doc.querySelector(selector)?.getAttribute("content");
      if (content) {
        return content;
      }
    }
    return "";
  }

  // eMAG pune zecimalele în <sup>, deci textContent lipește "1.490" și "77" ("1.49077 Lei")
  function priceTextOf(node) {
    const text = node.textContent || "";
    const sup = node.querySelector ? node.querySelector("sup") : null;
    const decimals = sup ? (sup.textContent || "").trim() : "";
    const cut = /^\d{1,2}$/.test(decimals) ? text.lastIndexOf(decimals) : -1;
    if (cut === -1) {
      return text;
    }
    return `${text.slice(0, cut).replace(/[.,\s]+$/, "")},${decimals}`;
  }

  function readDomPriceText(doc, store) {
    const selector = DOM_PRICE_SELECTORS[store];
    const node = selector ? doc.querySelector(selector) : null;
    return node ? priceTextOf(node) : "";
  }

  /**
   * Extrage observația de pe o pagină de produs: citește blocurile JSON-LD (cele invalide se
   * ignoră), og:type, prețul din meta și din DOM, apoi le dă lui parseObservationFromLd.
   * @param {Document} doc
   * @param {string} href adresa paginii
   * @returns {Observation | null} null când pagina nu este o pagină de produs unic
   */
  function extractObservation(doc, href) {
    const url = parseUrl(href);
    const store = url && detectStore(url.hostname);
    if (!(doc && store)) {
      return null;
    }
    return parseObservationFromLd(readLdBlocks(doc), {
      href,
      hostname: url.hostname,
      ogType: readMeta(doc, OG_TYPE_SELECTORS),
      metaPrice: readMeta(doc, META_PRICE_SELECTORS),
      domPriceText: readDomPriceText(doc, store),
    });
  }

  const api = {
    extractObservation,
    parseObservationFromLd,
    parsePriceToBani,
    isValidGtin,
    primaryModelCode,
    modelCodeFromTitle,
    decodeHtmlEntities,
    detectStore,
    externalIdFromUrl,
    mapAvailability,
    canonicalUrl,
  };

  root.PretPilotExtract = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(globalThis);
