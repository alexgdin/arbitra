"use client";

import { Button } from "@my-better-t-app/ui/components/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LoaderCircle, Sparkles } from "lucide-react";

import { queryClient, trpc } from "@/utils/trpc";

import { CartItems } from "./cart-items";
import { OptimizationResult } from "./optimization-result";
import { ProductSearch } from "./product-search";
import type { OptimizeItem } from "./types";

/** The `cart.optimize` procedure accepts at most this many distinct products. */
const MAX_OPTIMIZE_ITEMS = 30;

function cartSignature(items: readonly OptimizeItem[]): string {
  return items
    .map(({ productId, quantity }) => `${productId}:${quantity}`)
    .toSorted()
    .join("|");
}

function OptimizeAction({
  isPending,
  disabled,
  tooMany,
  onClick,
}: {
  isPending: boolean;
  disabled: boolean;
  tooMany: boolean;
  onClick: () => void;
}) {
  return (
    <div className="space-y-2">
      <Button
        size="lg"
        className="w-full"
        disabled={disabled || isPending}
        focusableWhenDisabled={isPending}
        onClick={onClick}
      >
        {isPending ? (
          <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
        ) : (
          <Sparkles aria-hidden="true" />
        )}
        {isPending ? "Se optimizează…" : "Optimizează coșul"}
      </Button>
      {tooMany ? (
        <p className="text-muted-foreground text-xs">
          Poți optimiza cel mult {MAX_OPTIMIZE_ITEMS} de produse deodată. Elimină câteva din coș.
        </p>
      ) : null}
    </div>
  );
}

export function CartOptimizer() {
  const cart = useQuery(trpc.cart.list.queryOptions());

  // `cart.optimize` is a query procedure: running it on demand through a mutation gives
  // us pending/error state and the variables that were optimized, without refetching it
  // automatically whenever the cart changes.
  const optimize = useMutation({
    mutationFn: (request: OptimizeItem[]) =>
      queryClient.fetchQuery({
        ...trpc.cart.optimize.queryOptions({ items: request }),
        staleTime: 0,
      }),
  });

  const items: OptimizeItem[] = (cart.data?.items ?? []).map(({ productId, quantity }) => ({
    productId,
    quantity,
  }));
  const hasItems = items.length > 0;
  const tooMany = items.length > MAX_OPTIMIZE_ITEMS;
  const isStale =
    optimize.isSuccess && cartSignature(optimize.variables ?? []) !== cartSignature(items);

  function runOptimization() {
    if (!hasItems || tooMany || optimize.isPending) {
      return;
    }
    optimize.mutate(items);
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
      <div className="space-y-6">
        <ProductSearch cartItems={cart.data?.items ?? []} />
        <CartItems cart={cart} onCleared={optimize.reset}>
          <OptimizeAction
            isPending={optimize.isPending}
            disabled={!hasItems || tooMany}
            tooMany={tooMany}
            onClick={runOptimization}
          />
        </CartItems>
      </div>
      <OptimizationResult
        data={hasItems ? optimize.data : undefined}
        isPending={hasItems && optimize.isPending}
        isError={hasItems && optimize.isError}
        isStale={isStale}
        onOptimize={runOptimization}
      />
    </div>
  );
}
