// Căutare publică de produse: normalizarea textului și a interogărilor. Funcții pure.
// Aceeași normalizare se aplică la scriere (products.search_text) și la citire (termenii căutării),
// ca "căști", "Casti" și "CĂȘTI" să se potrivească între ele.

const COMBINING_MARKS = /\p{M}/gu;
const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;
// Cuvinte legate prin cratimă sau slash, de exemplu "WH-1000XM5" sau "16/512". Lookbehind-ul ancorează
// potrivirea la începutul cuvântului; fără el, un cuvânt lung fără separator s-ar reparcurge de la
// fiecare poziție (timp pătratic), iar un titlu de 100.000 de caractere ar bloca serverul.
const JOINED_TOKEN =
  /(?<![\p{L}\p{N}])[\p{L}\p{N}]+(?:[-‐-―/][\p{L}\p{N}]+)+/gu;

const DEFAULT_MAX_TERMS = 6;
// Câte caractere din fiecare câmp intră în textul de căutare: titlul vine de la orice cont care trimite prețuri.
const MAX_INDEXED_LENGTH = 300;

// Litere mici, fără diacritice. NFD desparte litera de semnul combinat, deci "ș" (virgulă dedesubt)
// și "ş" (sedilă) ajung amândouă "s", iar "ț" și "ţ" amândouă "t".
function fold(input: string): string {
  return input.toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "");
}

function splitWords(folded: string): string[] {
  return folded.split(NON_ALPHANUMERIC).filter((word) => word.length > 0);
}

// Textul normalizat, urmat de variantele compacte ale cuvintelor legate prin cratimă sau slash,
// ca "WH-1000XM5" să poată fi găsit și ca "wh1000xm5". Cuvintele separate ("wh", "1000xm5") rămân în text.
export function normalizeSearchText(input: string): string {
  const folded = fold(input);
  const words = splitWords(folded);
  const compact = (folded.match(JOINED_TOKEN) ?? []).map((token) =>
    splitWords(token).join("")
  );

  return [...new Set([...words, ...compact])].join(" ");
}

// Titlul, apoi EAN-ul, codul de model salvat (mpn) și codul de model brut, așa cum îl arată magazinul,
// ca produsul să se găsească și după ele. Din codul brut "WDS100T4G0E-00CPS0" rămân căutabile și
// "wds100t4g0e", și "00cps0", chiar dacă mpn-ul salvat nu mai are sufixul. Cuvintele nu se repetă.
export function buildProductSearchText(
  title: string,
  ean?: string | null,
  mpn?: string | null,
  rawMpn?: string | null
): string {
  const text = [title, ean, mpn, rawMpn]
    .map((part) =>
      part ? normalizeSearchText(part.slice(0, MAX_INDEXED_LENGTH)) : ""
    )
    .join(" ");

  return [...new Set(splitWords(text))].join(" ");
}

// Cuvintele interogării, normalizate și unice. Fiecare trebuie să se regăsească în text (AND).
// Nu adaugă variante compacte: "wh-1000xm5" caută "wh" și "1000xm5", care apar și când titlul are spațiu.
export function parseSearchTerms(
  q: string,
  max = DEFAULT_MAX_TERMS
): string[] {
  return [...new Set(splitWords(fold(q)))].slice(0, Math.max(0, max));
}

// Escapează caracterele speciale LIKE, cu backslash ca escape implicit în Postgres.
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}
