import { hasControlChars } from "./text";

export type StoreConfig = {
  name: string;
  // Costul transportului, în bani.
  shipping: number;
  // Subtotalul (în bani) de la care transportul e gratuit; null = fără prag.
  freeShippingOver: number | null;
};

// Valori demonstrative, de ajustat cu tarifele reale ale magazinelor.
// Cheile sunt valorile din coloana products.store.
export const STORE_CONFIG: Record<string, StoreConfig> = {
  emag: { name: "eMAG", shipping: 1999, freeShippingOver: 15_000 },
  pcgarage: { name: "PC Garage", shipping: 1499, freeShippingOver: 20_000 },
  altex: { name: "Altex", shipping: 1799, freeShippingOver: 25_000 },
};

// Magazinele de la care se acceptă prețuri (product.ingestPrice), fiecare cu domeniul lui.
export const SUPPORTED_STORE_IDS = ["emag", "pcgarage", "altex"] as const;
export type SupportedStoreId = (typeof SUPPORTED_STORE_IDS)[number];

export const STORE_DOMAINS: Record<SupportedStoreId, string> = {
  emag: "emag.ro",
  pcgarage: "pcgarage.ro",
  altex: "altex.ro",
};

export function isSupportedStore(store: string): store is SupportedStoreId {
  return Object.hasOwn(STORE_DOMAINS, store);
}

// Hostname-ul (cum îl dă `new URL`, în litere mici) e domeniul magazinului sau un subdomeniu al lui,
// de exemplu "www.emag.ro". "notemag.ro" și "emag.ro.evil.example" nu trec.
export function isStoreHostname(
  store: SupportedStoreId,
  hostname: string
): boolean {
  const domain = STORE_DOMAINS[store];
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

// Linkul canonic al unui produs: https, host în litere mici, doar calea (fără utilizator, parolă, port, query
// sau hash). Null pentru orice altceva: http, caractere de control (`new URL` ignoră tab-urile și rândurile
// noi din mijloc, deci un tab în host ar trece neobservat) și text care nu e URL.
export function canonicalProductUrl(raw: string): string | null {
  const text = raw.trim();
  if (hasControlChars(text) || !URL.canParse(text)) {
    return null;
  }

  const url = new URL(text);
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== ""
  ) {
    return null;
  }
  return `https://${url.hostname}${url.pathname}`;
}

// Pentru magazinele necunoscute: transport fix, fără prag de gratuitate.
export const DEFAULT_STORE_CONFIG: Omit<StoreConfig, "name"> = {
  shipping: 2000,
  freeShippingOver: null,
};

export function getStoreConfig(store: string): StoreConfig {
  if (Object.hasOwn(STORE_CONFIG, store)) {
    return STORE_CONFIG[store] as StoreConfig;
  }
  return { ...DEFAULT_STORE_CONFIG, name: store };
}

export function shippingCost(config: StoreConfig, subtotal: number): number {
  if (config.freeShippingOver !== null && subtotal >= config.freeShippingOver) {
    return 0;
  }
  return config.shipping;
}
