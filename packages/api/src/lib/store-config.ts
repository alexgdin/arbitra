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
