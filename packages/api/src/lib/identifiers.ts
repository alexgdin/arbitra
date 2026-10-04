// Identificatorii cu care se potrivește același produs între magazine: EAN/GTIN real sau cod de model (mpn).
// Funcții pure. Niciun magazin nu expune ambii identificatori, deci potrivirea folosește oricare dintre ei.
// normalizeModelCode are o copie în extensie (primaryModelCode din extension/src/extract.js), cu aceiași
// vectori (model-code-vectors.json): orice schimbare de algoritm se face în ambele locuri.

const GTIN_PATTERN = /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/;
const ALL_ZEROS = /^0+$/;
const LEADING_ZEROS = /^0+/;
// Lungimile GTIN-ului, de la cea mai mică: forma canonică e cea mai mică în care încape valoarea.
const GTIN_LENGTHS = [8, 12, 13, 14] as const;

const NON_CODE_CHARS = /[^A-Z0-9]/g;
const COMBINING_MARKS = /\p{M}/gu;
const LETTER = /[A-Z]/;
const DIGIT = /[0-9]/;
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
// fiecare grup, ca "20X3004DRI" (Lenovo) să rămână cod; interfețele se resping doar când după nume urmează
// cel mult o literă și cifre ("USB30", "WIFI6E"), ca "USB3S2SAT3CB" (StarTech) să rămână cod.
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
// întreg) nu trebuie parcurs. Extensia taie la fel.
const MAX_RAW_LENGTH = 256;
// Mai mult de două cuvinte separate prin spațiu înseamnă text liber ("Full HD 1080p", un titlu), nu cod.
const MAX_WORDS = 2;
const MIN_CODE_LENGTH = 6;
const MAX_CODE_LENGTH = 64;
const MIN_DISTINCT_CHARS = 3;
// Un sufix se taie doar dacă restul codului e destul de lung ca să fie specific.
const MIN_BASE_LENGTH = 6;

// GTIN-8, 12, 13 sau 14 cu cifra de control corectă (mod 10, ponderi 3 și 1 de la dreapta la stânga).
// Câmpul "gtin" al eMAG conține de fapt codul de model, deci o valoare ca "WDS200T4G0E" se respinge aici.
export function isValidGtin(value: string): boolean {
  // Un șir doar din zerouri are cifra de control corectă, dar e un substituent, nu un cod real.
  if (!GTIN_PATTERN.test(value) || ALL_ZEROS.test(value)) {
    return false;
  }

  let sum = 0;
  let weight = 3;
  for (let i = value.length - 2; i >= 0; i--) {
    sum += (value.charCodeAt(i) - 48) * weight;
    weight = 4 - weight;
  }

  return (10 - (sum % 10)) % 10 === value.charCodeAt(value.length - 1) - 48;
}

// Forma sub care se compară și se salvează un GTIN valid: fără zerourile din față, apoi completat cu zerouri
// până la cea mai mică lungime (8, 12, 13 sau 14) în care încape. Cifra de control nu se schimbă, deci
// "718037904610", "0718037904610" și "00718037904610" dau același cod. Null pentru un GTIN invalid.
export function canonicalGtin(value: string): string | null {
  if (!isValidGtin(value)) {
    return null;
  }

  const significant = value.replace(LEADING_ZEROS, "");
  const length = GTIN_LENGTHS.find((size) => size >= significant.length);
  return significant.padStart(length ?? significant.length, "0");
}

function hasLetterAndDigit(value: string): boolean {
  return LETTER.test(value) && DIGIT.test(value);
}

// Taie segmentele finale care nu disting produsul ("-00CPS0" la PC Garage, "/EU" la Samsung), cât timp
// restul rămâne un cod specific. Un segment ca "500G" sau "12G" e capacitate, deci rămâne în cod.
function joinWithoutSuffixes(segments: readonly string[]): string {
  let code = segments.join("");
  for (let end = segments.length; end > 1; end--) {
    const last = segments[end - 1] ?? "";
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

function isUsableModelCode(code: string): boolean {
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
function wordCount(text: string): number {
  return text.split(WHITESPACE).filter((word) => ALPHANUMERIC.test(word))
    .length;
}

// Codul de model normalizat: litere mari și cifre, fără separatori și fără sufixul de producător.
// Returnează null pentru valori care nu pot lega două produse: "N/A", capacități sau specificații
// ("128GB", "HDMI21", "8GB-DDR4"), substituenți ("TEST123", "AAAAA1"), text liber (peste două cuvinte) și
// coduri prea scurte, lungi sau fără litere ori cifre.
// "WDS100T4G0E-00CPS0" devine "WDS100T4G0E", dar "SDSSDE61-500G-G25" devine "SDSSDE61500G": capacitatea
// distinge produsul, deci nu se taie. Ordinea pașilor: se citesc cel mult 256 de caractere, se scot
// diacriticele ("ȘTEFAN" dă "STEFAN"), "N/A" ca valoare de sine stătătoare respinge tot textul (dar
// "MQ9X3DN/A" dă "MQ9X3DN"), se taie eticheta, se păstrează prima valoare dintr-o listă, apoi se taie
// sufixele. Parantezele despart segmentele, deci "WDS200T4G0E (EU)" dă "WDS200T4G0E", iar "(500G)" rămâne.
export function normalizeModelCode(raw: string): string | null {
  const upper = raw
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

  const first = unlabeled.split(LIST_SEPARATOR)[0] ?? "";
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

export type StoredIdentifiers = { ean: string | null; mpn: string | null };

// Identificatorii din cererea de ingestie. Valorile invalide se ignoră, nu se resping: un EAN fals (cum
// e cel din câmpul "gtin" al eMAG) sau un cod de model de umplutură nu ajunge niciodată în baza de date.
// Prima scriere câștigă: un EAN sau mpn deja salvat nu se înlocuiește cu o valoare diferită, ca un cont
// să nu poată muta oferta altcuiva într-un alt grup. `ean` și `mpn` sunt ce se scrie (undefined lasă
// valoarea din baza de date neatinsă), iar `stored` e ce va conține rândul după scriere.
export function cleanIdentifiers(
  input: { ean?: string | undefined; mpn?: string | undefined },
  existing?: StoredIdentifiers | null
): {
  ean: string | undefined;
  mpn: string | undefined;
  stored: StoredIdentifiers;
} {
  const storedEan = existing?.ean || null;
  const storedMpn = existing?.mpn || null;

  const ean =
    storedEan === null && input.ean !== undefined
      ? (canonicalGtin(input.ean.trim()) ?? undefined)
      : undefined;
  const mpn =
    storedMpn === null && input.mpn !== undefined
      ? (normalizeModelCode(input.mpn) ?? undefined)
      : undefined;

  return {
    ean,
    mpn,
    stored: { ean: storedEan ?? ean ?? null, mpn: storedMpn ?? mpn ?? null },
  };
}
