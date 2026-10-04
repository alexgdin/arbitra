"use client";

import { useQuery } from "@tanstack/react-query";

import { trpc } from "@/utils/trpc";

import { BestPriceCard } from "./best-price-card";
import { OffersTable } from "./offers-table";
import { PriceHistorySection } from "./price-history-section";
import { BackToSearch, ProductHeader } from "./product-header";
import {
  ProductError,
  ProductNotFound,
  ProductSkeleton,
  SPLIT_LAYOUT,
} from "./product-states";
import { isMissingProductError, isValidProductId, shouldRetryCompare } from "./product-utils";
import type { CatalogItem } from "./types";
import { WatchCard } from "./watch-card";

function ProductContent({ item }: { item: CatalogItem }) {
  return (
    <div className="space-y-6">
      <div className={SPLIT_LAYOUT}>
        <ProductHeader item={item} />
        <BestPriceCard item={item} />
      </div>
      <OffersTable item={item} />
      <div className={SPLIT_LAYOUT}>
        <PriceHistorySection item={item} />
        <WatchCard item={item} className="lg:sticky lg:top-24" />
      </div>
    </div>
  );
}

/** Public product page: store prices, their freshness, price history and how to track it. */
export function ProductCompare({ productId }: { productId: string }) {
  const validId = isValidProductId(productId);
  const query = useQuery(
    trpc.catalog.compare.queryOptions(
      { productId },
      { enabled: validId, retry: shouldRetryCompare },
    ),
  );

  function renderBody() {
    if (!validId) {
      return <ProductNotFound />;
    }
    if (query.data) {
      return <ProductContent item={query.data} />;
    }
    if (query.isError) {
      return isMissingProductError(query.error) ? (
        <ProductNotFound />
      ) : (
        <ProductError onRetry={() => query.refetch()} retrying={query.isFetching} />
      );
    }
    return <ProductSkeleton />;
  }

  return (
    <div className="space-y-4">
      <BackToSearch />
      {renderBody()}
    </div>
  );
}
