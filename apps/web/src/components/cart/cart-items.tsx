"use client";

import { Button } from "@my-better-t-app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card";
import { Separator } from "@my-better-t-app/ui/components/separator";
import { Skeleton } from "@my-better-t-app/ui/components/skeleton";
import { useMutation } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { Search, ShoppingCart, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { formatBani } from "@/lib/format";
import { queryClient, trpc } from "@/utils/trpc";

import { CartItemRow } from "./cart-item-row";
import { formatCount } from "./plural";
import { PRODUCT_SEARCH_INPUT_ID } from "./product-search";
import type { CartList } from "./types";

function focusSearch() {
  document.getElementById(PRODUCT_SEARCH_INPUT_ID)?.focus();
}

function ClearCartButton({ onCleared }: { onCleared: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  const clear = useMutation(
    trpc.cart.clear.mutationOptions({
      onSuccess: () => {
        onCleared();
        toast.success("Coșul a fost golit");
        return queryClient.invalidateQueries(trpc.cart.list.queryFilter());
      },
      onError: () => {
        toast.error("Nu am putut goli coșul. Încearcă din nou.");
      },
    }),
  );

  useEffect(() => {
    if (confirming) {
      cancelRef.current?.focus();
    } else if (wasConfirming.current) {
      triggerRef.current?.focus();
    }
    wasConfirming.current = confirming;
  }, [confirming]);

  if (!confirming) {
    return (
      <Button
        ref={triggerRef}
        variant="ghost"
        className="w-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:w-auto"
        onClick={() => setConfirming(true)}
      >
        <Trash2 aria-hidden="true" />
        Golește coșul
      </Button>
    );
  }

  return (
    <fieldset className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <legend className="sr-only">Confirmă golirea coșului</legend>
      <p className="mr-auto font-medium">Sigur vrei să golești coșul?</p>
      <Button ref={cancelRef} variant="outline" onClick={() => setConfirming(false)}>
        Anulează
      </Button>
      <Button variant="destructive" disabled={clear.isPending} onClick={() => clear.mutate()}>
        <Trash2 aria-hidden="true" />
        Da, golește
      </Button>
    </fieldset>
  );
}

function CartSkeleton() {
  return (
    <>
      <p className="sr-only">Se încarcă coșul…</p>
      <div aria-hidden="true" className="arbitra-shimmer divide-y">
        {[0, 1].map((index) => (
          <div key={index} className="space-y-3 py-4 first:pt-0 last:pb-0">
            <div className="space-y-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-6 w-32" />
            </div>
            <div className="flex items-center justify-between">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-5 w-20" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function CartError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div className="space-y-1">
        <p className="font-medium">Nu am putut încărca coșul</p>
        <p className="text-muted-foreground">Verifică conexiunea la internet și încearcă din nou.</p>
      </div>
      <Button variant="outline" onClick={onRetry}>
        Încearcă din nou
      </Button>
    </div>
  );
}

export function CartItems({
  cart,
  onCleared,
  children,
}: {
  cart: UseQueryResult<CartList, unknown>;
  onCleared: () => void;
  /** Rendered under the cart total while the cart has items (the optimize action). */
  children?: React.ReactNode;
}) {
  const items = cart.data?.items ?? [];
  const currency = items[0]?.currency ?? "RON";
  const hasUnpriced = items.some((item) => item.currentPrice === null);

  function renderBody() {
    if (cart.isError && !cart.data) {
      return <CartError onRetry={() => cart.refetch()} />;
    }
    if (cart.isPending) {
      return <CartSkeleton />;
    }
    if (items.length === 0) {
      return (
        <EmptyState
          className="border-0 bg-transparent p-2 md:p-6"
          icon={<ShoppingCart aria-hidden="true" />}
          title="Coșul tău e gol"
          description="Caută un produs mai sus și adaugă-l în coș. Apoi îți arătăm unde îl găsești cel mai ieftin."
          action={
            <Button onClick={focusSearch}>
              <Search aria-hidden="true" />
              Caută produse
            </Button>
          }
        />
      );
    }
    return (
      <div className="space-y-4">
        <ul className="divide-y">
          {items.map((item) => (
            <CartItemRow key={item.id} item={item} />
          ))}
        </ul>
        <Separator />
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-medium">Total coș</p>
          <p className="font-semibold text-xl tabular-nums tracking-tight">
            {formatBani(cart.data?.total ?? 0, currency)}
          </p>
        </div>
        {hasUnpriced ? (
          <p className="text-muted-foreground text-xs">
            Totalul nu include produsele fără preț momentan.
          </p>
        ) : null}
        {children}
        <ClearCartButton onCleared={onCleared} />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Coșul tău</CardTitle>
        <CardDescription>
          {items.length > 0
            ? formatCount(items.length, "produs", "produse")
            : "Produsele pe care vrei să le cumperi"}
        </CardDescription>
      </CardHeader>
      <CardContent>{renderBody()}</CardContent>
    </Card>
  );
}
