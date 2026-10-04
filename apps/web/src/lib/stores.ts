export interface StoreInfo {
  id: string;
  name: string;
  shortName: string;
  /** CSS value usable in `style`, e.g. `backgroundColor: store.colorVar`. */
  colorVar: string;
}

export const STORE_IDS = ["emag", "pcgarage", "altex"] as const;

export const STORES: Record<string, StoreInfo> = {
  emag: { id: "emag", name: "eMAG", shortName: "eMAG", colorVar: "var(--store-emag)" },
  pcgarage: {
    id: "pcgarage",
    name: "PC Garage",
    shortName: "PCG",
    colorVar: "var(--store-pcgarage)",
  },
  altex: { id: "altex", name: "Altex", shortName: "Altex", colorVar: "var(--store-altex)" },
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getStore(id: string): StoreInfo {
  const known = Object.hasOwn(STORES, id) ? STORES[id] : undefined;
  if (known) {
    return known;
  }
  const name = capitalize(id);
  return { id, name, shortName: name, colorVar: "var(--store-other)" };
}
