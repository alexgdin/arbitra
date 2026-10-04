// Ofertele din coș: pentru fiecare produs cerut, ofertele aceluiași produs din toate magazinele.
// Același produs înseamnă aceeași componentă conexă ca în catalog (EAN sau cod de model comun, direct
// sau printr-un rând-punte), ca pagina de comparare și optimizatorul să nu se contrazică.

import type { OptimizerItem, OptimizerOffer } from "./cart-optimizer";
import { connectedComponents, trustedRows } from "./catalog";
import type { CatalogRow } from "./catalog";

// O ofertă validă: în stoc, cu preț și în aceeași monedă ca restul coșului. Magazinele necunoscute și
// prețurile aberante au fost scoase deja (trustedRows).
function toOffers(row: CatalogRow, currency: string): OptimizerOffer[] {
  if (!row.inStock || row.currentPrice === null) {
    return [];
  }
  if (row.currency !== currency) {
    return [];
  }
  return [
    {
      productId: row.id,
      store: row.store,
      unitPrice: row.currentPrice,
      title: row.title,
      url: row.url,
      imageUrl: row.imageUrl,
    },
  ];
}

// Articolele optimizatorului: fiecare produs cerut primește ofertele din componenta lui, ca în catalog:
// doar magazine cunoscute (rândurile cu un magazin necunoscut, de dinainte de validarea magazinului, nu
// intră în optimizare: fiecare magazin în plus mărește problema, iar transportul lor ar fi inventat) și fără
// prețuri aberante. `rows` sunt rândurile încărcate (surorile produselor cerute); produsele cerute se
// adaugă oricum la calcul.
export function buildOptimizerItems(
  requested: readonly CatalogRow[],
  quantities: ReadonlyMap<string, number>,
  rows: readonly CatalogRow[],
  currency: string
): OptimizerItem[] {
  const componentOf = new Map<string, readonly CatalogRow[]>();
  for (const component of connectedComponents([...requested, ...rows])) {
    const trusted = trustedRows(component);
    for (const row of component) {
      componentOf.set(row.id, trusted);
    }
  }

  return requested.map((product) => ({
    productId: product.id,
    title: product.title,
    quantity: quantities.get(product.id) ?? 1,
    offers: (componentOf.get(product.id) ?? []).flatMap((row) =>
      toOffers(row, currency)
    ),
  }));
}
