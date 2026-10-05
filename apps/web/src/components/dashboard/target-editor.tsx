"use client";

import { Button } from "@my-better-t-app/ui/components/button";
import { Input } from "@my-better-t-app/ui/components/input";
import { Label } from "@my-better-t-app/ui/components/label";
import { useMutation } from "@tanstack/react-query";
import { Info, LoaderCircle, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import type { CartItem } from "@/components/cart/types";
import { baniToLeiInput, formatBani, parseLeiToBani } from "@/lib/format";
import { queryClient, trpc } from "@/utils/trpc";

function refreshTargets() {
  return Promise.all([
    queryClient.invalidateQueries(trpc.cart.list.queryFilter()),
    queryClient.invalidateQueries(trpc.broker.listTargets.queryFilter()),
  ]);
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-muted-foreground text-xs">
      <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * Target price for one watched product: the app alerts the user when the price reaches it or
 * goes below. Give it a `key` that includes the saved target so the input resets to what the
 * server stored.
 */
export function TargetEditor({ item }: { item: CartItem }) {
  const fieldId = useId();
  const [price, setPrice] = useState(
    item.targetPrice === null ? "" : baniToLeiInput(item.targetPrice),
  );
  const [error, setError] = useState<string | null>(null);

  const saveTarget = useMutation(
    trpc.broker.setTarget.mutationOptions({
      onSuccess: async () => {
        await refreshTargets();
        toast.success("Ținta a fost salvată.");
      },
      onError: () => toast.error("Nu am putut salva ținta. Încearcă din nou."),
    }),
  );
  const clearTarget = useMutation(
    trpc.broker.clearTarget.mutationOptions({
      onSuccess: async () => {
        await refreshTargets();
        toast.success("Ținta a fost ștearsă.");
      },
      onError: () => toast.error("Nu am putut șterge ținta. Încearcă din nou."),
    }),
  );

  const busy = saveTarget.isPending || clearTarget.isPending;
  const targetBani = parseLeiToBani(price);
  const alreadyBelow =
    targetBani !== null && item.currentPrice !== null && item.currentPrice <= targetBani;
  const inputId = `${fieldId}-price`;
  const describedBy = `${fieldId}-${error ? "error" : "hint"}`;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (targetBani === null) {
      setError("Introdu o sumă validă în lei, de exemplu 129,99.");
      return;
    }
    saveTarget.mutate({
      productId: item.productId,
      targetPrice: targetBani,
      autoBuyEnabled: false,
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={inputId}>Preț țintă (lei)</Label>
        <div className="relative">
          <Input
            id={inputId}
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
            Te anunțăm în aplicație când prețul ajunge la această sumă sau scade sub ea
            {item.currentPrice === null
              ? "."
              : `; acum este ${formatBani(item.currentPrice, item.currency)}.`}
          </p>
        )}
      </div>

      <div aria-live="polite" className="space-y-2 empty:hidden">
        {alreadyBelow ? (
          <Hint>
            Prețul curent este deja la nivelul acestei ținte sau sub ea, așa că o vei vedea marcată
            „Țintă atinsă”.
          </Hint>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
          {saveTarget.isPending ? (
            <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" data-icon="inline-start" />
          ) : null}
          {saveTarget.isPending ? "Se salvează…" : "Salvează ținta"}
        </Button>
        {item.targetPrice === null ? null : (
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            className="w-full sm:w-auto"
            onClick={() => clearTarget.mutate({ productId: item.productId })}
          >
            <Trash2 aria-hidden="true" data-icon="inline-start" />
            Șterge ținta
          </Button>
        )}
      </div>
    </form>
  );
}
