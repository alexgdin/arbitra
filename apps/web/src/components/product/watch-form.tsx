"use client";

import { Button } from "@my-better-t-app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@my-better-t-app/ui/components/card";
import { Input } from "@my-better-t-app/ui/components/input";
import { Label } from "@my-better-t-app/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@my-better-t-app/ui/components/native-select";
import { Switch } from "@my-better-t-app/ui/components/switch";
import { useMutation } from "@tanstack/react-query";
import { isTRPCClientError } from "@trpc/client";
import { Check, Info, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import { baniToLeiInput, formatBani, parseLeiToBani } from "@/lib/format";
import { getStore } from "@/lib/stores";
import { queryClient, trpc } from "@/utils/trpc";

import { pickDefaultOffer } from "./product-utils";
import type { CatalogItem, CatalogOffer } from "./types";

const TITLE_ID = "urmareste-produsul";
/** The suggested target is this share of the best price, rounded down to whole lei. */
const SUGGESTED_PERCENT = 95;

function getSuggestedTarget(bestPrice: number | undefined): string {
  if (bestPrice === undefined) {
    return "";
  }
  const lei = Math.floor((bestPrice * SUGGESTED_PERCENT) / 10_000);
  return lei >= 1 ? baniToLeiInput(lei * 100) : "";
}

function getOfferLabel(offer: CatalogOffer, currency: string): string {
  const price = offer.price === null ? "preț indisponibil" : formatBani(offer.price, currency);
  const stock = offer.inStock ? "" : " · stoc epuizat";
  return `${getStore(offer.store).name} · ${price}${stock}`;
}

function getErrorMessage(error: unknown): string {
  if (isTRPCClientError(error) && error.data?.code === "UNAUTHORIZED") {
    return "Sesiunea a expirat. Autentifică-te din nou.";
  }
  return "Nu am putut urmări produsul. Încearcă din nou.";
}

function refreshWatchLists() {
  return Promise.all([
    queryClient.invalidateQueries(trpc.cart.list.queryFilter()),
    queryClient.invalidateQueries(trpc.broker.listTargets.queryFilter()),
  ]);
}

/** Store, target price and auto-buy for a signed-in user; saving adds the product to the dashboard. */
export function WatchForm({ item, className }: { item: CatalogItem; className?: string }) {
  const router = useRouter();
  const fieldId = useId();
  const [productId, setProductId] = useState(pickDefaultOffer(item, item.offers)?.productId ?? "");
  const [price, setPrice] = useState(() => getSuggestedTarget(item.bestOffer?.price));
  const [autoBuy, setAutoBuy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const track = useMutation(
    trpc.broker.setTarget.mutationOptions({
      onSuccess: async () => {
        toast.success("Produsul este urmărit", {
          description: "Îl găsești în panou, la „Produsele tale”.",
          action: { label: "Deschide panoul", onClick: () => router.push("/dashboard") },
        });
        await refreshWatchLists();
      },
      onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
    }),
  );

  const selected = item.offers.find((offer) => offer.productId === productId);
  const targetBani = parseLeiToBani(price);
  const currentPrice = selected?.price ?? null;
  const alreadyBelow = targetBani !== null && currentPrice !== null && currentPrice <= targetBani;
  const priceId = `${fieldId}-price`;
  const describedBy = `${fieldId}-${error ? "error" : "hint"}`;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (targetBani === null) {
      setError("Introdu o sumă validă în lei, de exemplu 129,99.");
      return;
    }
    track.mutate({ productId, targetPrice: targetBani, autoBuyEnabled: autoBuy });
  }

  return (
    <Card className={className} role="region" aria-labelledby={TITLE_ID}>
      <CardHeader>
        <h2 id={TITLE_ID} className="font-semibold text-lg">
          Urmărește produsul
        </h2>
        <CardDescription>
          Alege magazinul și prețul la care vrei să cumperi. Produsul apare în panoul tău.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-store`}>Magazin</Label>
            <NativeSelect
              id={`${fieldId}-store`}
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
            >
              {item.offers.map((offer) => (
                <NativeSelectOption key={offer.productId} value={offer.productId}>
                  {getOfferLabel(offer, item.currency)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={priceId}>Preț țintă (lei)</Label>
            <div className="relative">
              <Input
                id={priceId}
                inputMode="decimal"
                autoComplete="off"
                placeholder="ex. 129,99"
                value={price}
                aria-invalid={error !== null}
                aria-describedby={describedBy}
                className="pr-11 tabular-nums"
                onChange={(event) => {
                  setPrice(event.target.value);
                  setError(null);
                }}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground text-sm"
              >
                lei
              </span>
            </div>
            {error ? (
              <p id={`${fieldId}-error`} role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : (
              <p id={`${fieldId}-hint`} className="text-muted-foreground text-xs">
                Prețul pe bucată la care vrei să cumperi
                {currentPrice === null
                  ? "."
                  : `; acum este ${formatBani(currentPrice, item.currency)}.`}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-3">
            <Label htmlFor={`${fieldId}-auto`} className="flex-col items-start gap-0.5">
              <span>Cumpără automat</span>
              <span className="font-normal text-muted-foreground text-xs">
                Brokerul comandă produsul când prețul ajunge la țintă.
              </span>
            </Label>
            <Switch id={`${fieldId}-auto`} checked={autoBuy} onCheckedChange={setAutoBuy} />
          </div>

          <div aria-live="polite" className="space-y-2 empty:hidden">
            {alreadyBelow ? (
              <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-muted-foreground text-xs">
                <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Prețul curent este deja sub această țintă
                  {autoBuy ? "; dacă brokerul e pornit, poate cumpăra imediat." : "."}
                </span>
              </p>
            ) : null}
            {track.isSuccess ? (
              <p className="flex items-start gap-2 rounded-lg bg-success/10 px-3 py-2 text-success text-xs dark:bg-success/12">
                <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Gata, produsul este în lista ta.{" "}
                  <Link href="/dashboard" className="font-medium underline underline-offset-4">
                    Deschide panoul
                  </Link>
                  .
                </span>
              </p>
            ) : null}
          </div>

          <Button type="submit" disabled={track.isPending} className="w-full">
            {track.isPending ? (
              <LoaderCircle
                aria-hidden="true"
                className="motion-safe:animate-spin"
                data-icon="inline-start"
              />
            ) : null}
            {track.isPending ? "Se salvează…" : "Urmărește produsul"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
