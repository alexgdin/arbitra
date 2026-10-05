const STORAGE_KEY = "arbitra:notifications:read";
// Cheile cele mai vechi ies din listă, ca stocarea să nu crească la nesfârșit.
const MAX_STORED_KEYS = 200;

/** A notification is "new" again when the best price changes, so the key includes the price. */
export function notificationKey(item: { productId: string; bestPrice: number }): string {
  return `${item.productId}:${item.bestPrice}`;
}

/** Read keys saved in this browser; empty when storage is unavailable (server, private mode, blocked). */
export function loadReadKeys(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

/** Saves the read keys; failures are ignored (the read state then lasts only for this page). */
export function saveReadKeys(keys: readonly string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys.slice(-MAX_STORED_KEYS)));
  } catch {
    // stocarea nu e disponibilă
  }
}
