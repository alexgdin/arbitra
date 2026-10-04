"use client";

import { Button } from "@my-better-t-app/ui/components/button";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { LoaderCircle, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { StoreBadge } from "@/components/store-badge";
import { formatBani } from "@/lib/format";
import { queryClient, trpc } from "@/utils/trpc";

import type { CartItem } from "./types";

const MIN_QUANTITY = 1;
const MAX_QUANTITY = 99;

function refreshCart() {
  return queryClient.invalidateQueries(trpc.cart.list.queryFilter());
}

export function CartItemRow({ item }: { item: CartItem }) {
  const update = useMutation(
    trpc.cart.updateQuantity.mutationOptions({
      onSuccess: refreshCart,
      onError: () => {
        toast.error("Nu am putut actualiza cantitatea. Încearcă din nou.");
      },
    }),
  );
  const remove = useMutation(
    trpc.cart.remove.mutationOptions({
      onSuccess: () => {
        toast.success("Produs eliminat din coș");
        return refreshCart();
      },
      onError: () => {
        toast.error("Nu am putut elimina produsul. Încearcă din nou.");
      },
    }),
  );

  // Cât timp se salvează, afișăm cantitatea cerută, nu cea veche din server.
  const quantity = update.isPending ? (update.variables?.quantity ?? item.quantity) : item.quantity;
  const lineTotal = item.currentPrice === null ? null : item.currentPrice * quantity;

  function changeQuantity(delta: number) {
    const next = Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, quantity + delta));
    update.mutate({ id: item.id, quantity: next });
  }

  return (
    <li
      className={cn(
        "flex flex-col gap-3 py-4 transition-opacity first:pt-0 last:pb-0",
        remove.isPending && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="line-clamp-2 font-medium leading-snug">{item.title}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StoreBadge store={item.store} />
            <span className="text-muted-foreground text-xs tabular-nums">
              {item.currentPrice === null
                ? "Preț indisponibil"
                : `${formatBani(item.currentPrice, item.currency)} / buc.`}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="-mt-1 -mr-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Elimină ${item.title} din coș`}
          disabled={remove.isPending}
          onClick={() => remove.mutate({ id: item.id })}
        >
          {remove.isPending ? (
            <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
          ) : (
            <Trash2 aria-hidden="true" />
          )}
        </Button>
      </div>
      <div className="flex items-center justify-between gap-3">
        <fieldset className="flex min-w-0 items-center gap-1">
          <legend className="sr-only">Cantitate pentru {item.title}</legend>
          <Button
            variant="outline"
            size="icon"
            aria-label={`Scade cantitatea pentru ${item.title}`}
            disabled={quantity <= MIN_QUANTITY || remove.isPending}
            onClick={() => changeQuantity(-1)}
          >
            <Minus aria-hidden="true" />
          </Button>
          <span className="min-w-10 text-center font-medium tabular-nums" aria-live="polite">
            {quantity}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label={`Crește cantitatea pentru ${item.title}`}
            disabled={quantity >= MAX_QUANTITY || remove.isPending}
            onClick={() => changeQuantity(1)}
          >
            <Plus aria-hidden="true" />
          </Button>
        </fieldset>
        <p className="font-semibold text-base tabular-nums">
          {formatBani(lineTotal, item.currency)}
        </p>
      </div>
    </li>
  );
}
