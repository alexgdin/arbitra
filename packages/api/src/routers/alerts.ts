import type { Database } from "@my-better-t-app/db";
import { cartItems, products } from "@my-better-t-app/db/schema/commerce";
import { and, eq, isNotNull } from "drizzle-orm";

import { protectedProcedure, router } from "../index";
import { buildCatalogItem, connectedComponents } from "../lib/catalog";
import type { CatalogRow } from "../lib/catalog";
import { catalogColumns, loadSiblingProducts } from "../lib/siblings";

// Un produs urmărit de utilizator, cu prețul țintă (bani). `externalId` servește modului demo.
export type TrackedTarget = CatalogRow & {
  externalId: string;
  targetPrice: number;
};

// Starea țintei unui produs urmărit: cea mai mică ofertă în stoc cu preț din grupul lui (aceeași grupare și
// aceleași filtre ca pagina produsului: EAN sau cod de model comun, magazine cunoscute, fără prețuri aberante).
export type TargetStatus = {
  productId: string;
  externalId: string;
  representativeProductId: string;
  groupKey: string;
  title: string;
  targetPrice: number;
  currentPrice: number | null;
  bestPrice: number | null;
  bestStore: string | null;
  bestUrl: string | null;
  checkedAt: string | null;
  reached: boolean;
};

export type ReachedAlert = {
  productId: string;
  representativeProductId: string;
  title: string;
  targetPrice: number;
  bestPrice: number;
  bestStore: string;
  bestUrl: string;
  // targetPrice - bestPrice, mereu >= 0
  savingsVsTarget: number;
  // ISO: când a fost verificată cea mai bună ofertă
  checkedAt: string;
};

// Funcție pură: pentru fiecare produs urmărit, cea mai bună ofertă a grupului lui din `rows` (surorile încărcate;
// produsele urmărite se adaugă oricum la grupare).
export function evaluateTargets(
  tracked: readonly TrackedTarget[],
  rows: readonly CatalogRow[]
): TargetStatus[] {
  const componentOf = new Map<string, [CatalogRow, ...CatalogRow[]]>();
  for (const component of connectedComponents([...tracked, ...rows])) {
    for (const row of component) {
      componentOf.set(row.id, component);
    }
  }

  return tracked.map((target) => {
    const component = componentOf.get(target.id) ?? [target];
    const item = buildCatalogItem(component);
    const best = item.bestOffer;
    const bestOffer = best
      ? item.offers.find((offer) => offer.productId === best.productId)
      : undefined;

    return {
      productId: target.id,
      externalId: target.externalId,
      representativeProductId: item.representativeProductId,
      groupKey: item.key,
      title: target.title,
      targetPrice: target.targetPrice,
      currentPrice: target.currentPrice,
      bestPrice: best?.price ?? null,
      bestStore: best?.store ?? null,
      bestUrl: bestOffer?.url ?? null,
      checkedAt: bestOffer?.lastCheckedAt ?? null,
      reached: best !== null && best.price <= target.targetPrice,
    };
  });
}

// Funcție pură: notificările „Preț țintă atins”, cele mai noi întâi (după verificarea celei mai bune oferte,
// apoi titlu). Un articol urmărit din mai multe magazine dă o singură notificare: cea cu ținta cea mai mare.
export function reachedAlerts(
  statuses: readonly TargetStatus[],
  now: Date
): ReachedAlert[] {
  const byGroup = new Map<string, ReachedAlert>();
  for (const status of statuses) {
    if (
      !status.reached ||
      status.bestPrice === null ||
      status.bestStore === null ||
      status.bestUrl === null
    ) {
      continue;
    }
    const alert: ReachedAlert = {
      productId: status.productId,
      representativeProductId: status.representativeProductId,
      title: status.title,
      targetPrice: status.targetPrice,
      bestPrice: status.bestPrice,
      bestStore: status.bestStore,
      bestUrl: status.bestUrl,
      savingsVsTarget: status.targetPrice - status.bestPrice,
      checkedAt: status.checkedAt ?? now.toISOString(),
    };
    const current = byGroup.get(status.groupKey);
    if (
      !current ||
      alert.targetPrice > current.targetPrice ||
      (alert.targetPrice === current.targetPrice &&
        alert.productId < current.productId)
    ) {
      byGroup.set(status.groupKey, alert);
    }
  }

  return [...byGroup.values()].sort(
    (a, b) =>
      b.checkedAt.localeCompare(a.checkedAt) ||
      a.title.localeCompare(b.title, "ro") ||
      a.productId.localeCompare(b.productId)
  );
}

// Produsele cu țintă ale utilizatorului și starea fiecărei ținte (o interogare pentru coș, apoi surorile).
export async function loadTargetStatuses(
  db: Database,
  userId: string
): Promise<TargetStatus[]> {
  const rows = await db
    .select({
      ...catalogColumns,
      externalId: products.externalId,
      targetPrice: cartItems.targetPrice,
    })
    .from(cartItems)
    .innerJoin(products, eq(products.id, cartItems.productId))
    .where(
      and(eq(cartItems.userId, userId), isNotNull(cartItems.targetPrice))
    );

  const tracked = rows.flatMap(({ targetPrice, ...row }) =>
    targetPrice === null ? [] : [{ ...row, targetPrice }]
  );
  if (tracked.length === 0) {
    return [];
  }

  const siblings = await loadSiblingProducts(db, tracked);
  return evaluateTargets(tracked, siblings);
}

export const alertsRouter = router({
  // Notificările din aplicație: produsele urmărite al căror cel mai mic preț în stoc (în orice magazin)
  // e la sau sub ținta utilizatorului. Nu cumpără nimic.
  reached: protectedProcedure.query(async ({ ctx }) =>
    reachedAlerts(
      await loadTargetStatuses(ctx.db, ctx.session.user.id),
      new Date()
    )
  ),
});
