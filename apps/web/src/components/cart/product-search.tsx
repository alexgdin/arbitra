"use client";

import { sharesIdentifier } from "@my-better-t-app/api/lib/catalog";
import { Badge } from "@my-better-t-app/ui/components/badge";
import { Button } from "@my-better-t-app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card";
import { Input } from "@my-better-t-app/ui/components/input";
import { Label } from "@my-better-t-app/ui/components/label";
import { Skeleton } from "@my-better-t-app/ui/components/skeleton";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { Check, Info, LoaderCircle, Plus, Search, SearchX, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { StoreBadge } from "@/components/store-badge";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatBani, formatRelativeTime } from "@/lib/format";
import { queryClient, trpc } from "@/utils/trpc";

import { formatCount } from "./plural";
import type { CartItem, Product } from "./types";

export const PRODUCT_SEARCH_INPUT_ID = "product-search";

const RESULT_LIMIT = 12;
const SEARCH_DELAY_MS = 300;

function SearchHint() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed px-4 py-6 text-muted-foreground">
      <Search aria-hidden="true" className="size-5 shrink-0" />
      <div className="space-y-0.5">
        <p className="font-medium text-foreground">Începe să scrii pentru a căuta produse</p>
        <p className="text-xs">Poți căuta după nume sau model, de exemplu „căști Sony”.</p>
      </div>
    </div>
  );
}

function SearchSkeleton() {
  return (
    <>
      <p className="sr-only">Se caută produse…</p>
      <ul aria-hidden="true" className="space-y-2">
        {[0, 1, 2].map((index) => (
          <li key={index} className="flex items-start gap-3 rounded-lg border p-3">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-6 w-28" />
            </div>
            <div className="flex flex-col items-end gap-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-10 w-24 sm:h-9" />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function SearchError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div className="space-y-1">
        <p className="font-medium">Nu am putut căuta produsele</p>
        <p className="text-muted-foreground">
          Verifică conexiunea la internet și încearcă din nou.
        </p>
      </div>
      <Button variant="outline" onClick={onRetry}>
        Încearcă din nou
      </Button>
    </div>
  );
}

function SearchEmpty({ term }: { term: string }) {
  return (
    <div className="rounded-lg border border-dashed px-4 py-8 text-center">
      <SearchX aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
      <p className="mt-2 font-medium">Nu am găsit niciun produs pentru „{term}”</p>
      <p className="mt-1 text-muted-foreground">
        Verifică ortografia sau încearcă un cuvânt mai scurt, de exemplu doar marca.
      </p>
    </div>
  );
}

function ProductRow({
  product,
  cartQuantity,
  sameProductInCart,
}: {
  product: Product;
  cartQuantity: number;
  sameProductInCart: boolean;
}) {
  const add = useMutation(
    trpc.cart.add.mutationOptions({
      onSuccess: () => {
        toast.success("Produs adăugat în coș");
        return queryClient.invalidateQueries(trpc.cart.list.queryFilter());
      },
      onError: () => {
        toast.error("Nu am putut adăuga produsul în coș. Încearcă din nou.");
      },
    }),
  );

  return (
    <li className="flex items-start gap-3 rounded-lg border bg-card p-3">
      <div className="min-w-0 flex-1 space-y-2">
        <p className="line-clamp-2 font-medium leading-snug">{product.title}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <StoreBadge store={product.store} />
          <Badge variant={product.inStock ? "success" : "secondary"}>
            {product.inStock ? "În stoc" : "Stoc epuizat"}
          </Badge>
        </div>
        {product.currentPrice !== null && product.lastCheckedAt ? (
          <p className="text-muted-foreground text-xs">
            Preț verificat {formatRelativeTime(product.lastCheckedAt)}
          </p>
        ) : null}
        {cartQuantity > 0 ? (
          <p className="flex items-center gap-1 text-success text-xs">
            <Check aria-hidden="true" className="size-3.5 shrink-0" />
            În coș · {formatCount(cartQuantity, "bucată", "bucăți")}
          </p>
        ) : null}
        {sameProductInCart ? (
          <p className="flex items-center gap-1 text-warning-foreground text-xs">
            <Info aria-hidden="true" className="size-3.5 shrink-0" />
            Același produs e deja în coș
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <p
          className={cn(
            "tabular-nums",
            product.currentPrice === null
              ? "text-muted-foreground text-xs"
              : "font-semibold text-base",
          )}
        >
          {product.currentPrice === null
            ? "Preț indisponibil"
            : formatBani(product.currentPrice, product.currency)}
        </p>
        <Button
          variant="outline"
          disabled={add.isPending}
          aria-label={`Adaugă ${product.title} în coș`}
          onClick={() => add.mutate({ productId: product.id })}
        >
          {add.isPending ? (
            <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
          ) : (
            <Plus aria-hidden="true" />
          )}
          Adaugă
        </Button>
      </div>
    </li>
  );
}

function SearchResults({
  products,
  cartItems,
  isUpdating,
}: {
  products: readonly Product[];
  cartItems: readonly CartItem[];
  isUpdating: boolean;
}) {
  return (
    <div className={cn("space-y-3 transition-opacity", isUpdating && "opacity-60")}>
      <p className="text-muted-foreground text-xs">
        {formatCount(products.length, "rezultat", "rezultate")}
        {products.length === RESULT_LIMIT
          ? " · precizează căutarea pentru rezultate mai exacte"
          : ""}
      </p>
      <ul className="space-y-2">
        {products.map((product) => {
          const inCart = cartItems.find((item) => item.productId === product.id);
          // același EAN sau același cod de model (mpn): magazinele nu expun întotdeauna ambii identificatori
          const sameProductInCart = cartItems.some(
            (item) => item.productId !== product.id && sharesIdentifier(item, product),
          );
          return (
            <ProductRow
              key={product.id}
              product={product}
              cartQuantity={inCart?.quantity ?? 0}
              sameProductInCart={sameProductInCart}
            />
          );
        })}
      </ul>
    </div>
  );
}

export function ProductSearch({ cartItems }: { cartItems: readonly CartItem[] }) {
  const [query, setQuery] = useState("");
  const typed = query.trim();
  const term = useDebouncedValue(typed, SEARCH_DELAY_MS);
  const search = useQuery(
    trpc.product.list.queryOptions(
      { q: term, limit: RESULT_LIMIT },
      { enabled: term.length > 0, placeholderData: keepPreviousData },
    ),
  );
  const isUpdating = search.isPlaceholderData || typed !== term;

  function renderBody() {
    if (typed === "") {
      return <SearchHint />;
    }
    if (search.isError) {
      return <SearchError onRetry={() => search.refetch()} />;
    }
    if (search.isPending) {
      return <SearchSkeleton />;
    }
    if (search.data.length === 0) {
      return <SearchEmpty term={term} />;
    }
    return <SearchResults products={search.data} cartItems={cartItems} isUpdating={isUpdating} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adaugă produse</CardTitle>
        <CardDescription>
          Adaugă fiecare produs o singură dată: îl comparăm noi automat între eMAG, PC Garage și
          Altex.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={PRODUCT_SEARCH_INPUT_ID} className="sr-only">
            Caută un produs
          </Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={PRODUCT_SEARCH_INPUT_ID}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Caută un produs sau un model"
              className="pr-10 pl-9"
            />
            {query === "" ? null : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Șterge căutarea"
                className="absolute top-0 right-0"
                onClick={() => setQuery("")}
              >
                <X aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
        <div aria-live="polite" aria-busy={isUpdating}>
          {renderBody()}
        </div>
      </CardContent>
    </Card>
  );
}
