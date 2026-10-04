import type { BrokerSettingsData } from "./types";

/**
 * What the Auto-Broker still needs before it can buy anything. An empty list means the broker
 * is fully set up. At least one spending limit (per order or monthly) is required.
 */
export function getMissingSetup(settings: BrokerSettingsData): string[] {
  const missing: string[] = [];
  if (!settings.hasPaymentMethod) {
    missing.push("Metoda de plată");
  }
  if (!settings.shippingAddress) {
    missing.push("Adresa de livrare");
  }
  if (settings.maxOrderValue === null && settings.monthlyBudget === null) {
    missing.push("Cel puțin o limită de cheltuieli (per comandă sau lunară)");
  }
  return missing;
}
